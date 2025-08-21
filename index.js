// ======================= deps =======================
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');
const axios = require('axios'); // kalau tidak dipakai, boleh dihapus
const path = require('path');
const { execSync } = require('child_process');
const { tanyaAI, tanyaReaksi } = require('./handlers/ai');

// Fitur tambahan (optional)
let setSocketInstance = () => {};
let startCronJobs = () => {};


// ======================= konstanta =======================
const AUTH_FOLDER = process.env.AUTH_FOLDER || './auth_info_baileys';
const MAX_RECONNECT_ATTEMPTS = Number(process.env.MAX_RECONNECT_ATTEMPTS || 5);
const RECONNECT_INTERVAL = Number(process.env.RECONNECT_INTERVAL || 10_000);

// state reconnect
let isReconnecting = false;
let reconnectAttempts = 0;

// ======================= seed session dari ENV =======================
if (process.env.SESSION_B64) {
  // bersihkan agar overwrite bersih
  if (fs.existsSync(AUTH_FOLDER)) {
    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    console.log('🧹 Bersih-bersih folder auth (overwrite dari ENV)');
  }
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });

  const buf = Buffer.from(process.env.SESSION_B64, 'base64');
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;

  if (isGzip) {
    const tmpTar = path.join(__dirname, 'auth_session.tgz');
    fs.writeFileSync(tmpTar, buf);
    try {
      execSync(`tar -xzf "${tmpTar}"`, { stdio: 'inherit' });
      if (!fs.existsSync(AUTH_FOLDER)) {
        // Cari folder yang berisi creds.json kalau nama folder di arsip beda
        const candidates = fs.readdirSync(__dirname)
          .map(n => path.join(__dirname, n))
          .filter(p => fs.existsSync(path.join(p, 'creds.json')) && fs.statSync(p).isDirectory());
        if (candidates[0]) fs.renameSync(candidates[0], AUTH_FOLDER);
        else throw new Error('Arsip ENV tidak mengandung folder dengan creds.json');
      }
      console.log('🔐 Session (folder) dipulihkan dari ENV ✅');
    } finally {
      try { fs.unlinkSync(tmpTar); } catch {}
    }
  } else {
    const sessionFile = path.join(AUTH_FOLDER, 'creds.json');
    fs.writeFileSync(sessionFile, buf);
    try { JSON.parse(buf.toString('utf8')); }
    catch { console.warn('⚠️ SESSION_B64 bukan JSON valid? Pastikan ini isi creds.json mentah.'); }
    console.log('🔐 Session (creds.json) ditanam dari ENV ✅');
  }
}

// ======================= util =======================
function extractText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  ).trim();
}

// ======================= main bot =======================
async function startBot() {
  try {
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: P({ level: 'silent' }),
      version,
      browser: ['MyBot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      connectTimeoutMs: 30_000,
      keepAliveIntervalMs: 25_000,
      getMessage: async () => null
    });

    globalThis.sock = sock;
    try { if (typeof setSocketInstance === 'function') setSocketInstance(sock); } catch {}
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) console.log('🔑 QR tersedia. Scan via WhatsApp.');
      if (connection === 'open') {
        console.log('🤖 Bot tersambung!');
        console.log(`👤 Login sebagai: ${sock.user?.id || 'unknown'}`);
        reconnectAttempts = 0;
        try { if (typeof startCronJobs === 'function') startCronJobs(); } catch {}
      }
      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        console.log(`📴 Close. Code: ${reason} (${DisconnectReason[reason] || 'Unknown'})`);

        if (reason === DisconnectReason.connectionReplaced) {
          console.log('🔁 Session digantikan. Exit agar platform restart bersih.');
          process.exit(0);
        }

        if (reason === DisconnectReason.loggedOut) {
          console.log('🧹 Session logout. Hapus folder auth & start ulang.');
          try { fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch {}
          return startBot();
        }

        if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          isReconnecting = true;
          reconnectAttempts++;
          console.log(`⏳ Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          setTimeout(() => {
            isReconnecting = false;
            startBot().catch(console.error);
          }, RECONNECT_INTERVAL);
        } else {
          console.log('❌ Gagal reconnect. Restart manual diperlukan.');
        }
      }
    });

    // 📥 Pesan masuk — AI sebagai handler utama + aman di grup
sock.ev.on('messages.upsert', async (m) => {
  try {
    const msg = m.messages?.[0];
    if (!msg?.message) return;
    if (msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    // hindari status atau channel
    if (jid === 'status@broadcast' || jid?.endsWith?.('@newsletter')) return;

    const isGroup = jid?.endsWith?.('@g.us');
    const text = extractText(msg);

    // deteksi mention / reply ke bot
    const botNumber = (sock.user?.id?.split(':')[0] || '') + '@s.whatsapp.net';
    const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
    const mentionedJids = ctx.mentionedJid || [];
    const isMentioned = mentionedJids.includes(botNumber);
    const isReplyToBot = ctx.participant === botNumber;
    console.log({ isGroup, isMentioned, isReplyToBot, jid, text });


    // Kebijakan:
    // - DM: selalu balas
    // - Grup: balas jika mention atau reply ke bot
    const shouldReply = !isGroup || isMentioned || isReplyToBot;
    if (!shouldReply) return;

    // kalau tidak ada teks, beri info singkat
    if (!text) {
      await sock.sendMessage(jid, { text: 'Aku aktif ✅ (pesan tanpa teks).' }, { quoted: msg });
      return;
    }

    // ===== AI sebagai handler utama =====
    let replyText;
    try {
      replyText = await tanyaAI(text, { from: jid, isGroup });
      if (!replyText) replyText = '(AI tidak memberi jawaban)';
    } catch (e) {
      console.warn('⚠️ tanyaAI error, fallback echo:', e?.message || e);
      replyText = `echo: ${text}`;
    }
    await sock.sendMessage(jid, { text: replyText }, { quoted: msg });

    // reaksi opsional
    try {
      const react = await (typeof tanyaReaksi === 'function' ? tanyaReaksi(text) : null);
      if (react) await sock.sendMessage(jid, { react: { text: react, key: msg.key } });
    } catch (e) {
      console.warn('⚠️ tanyaReaksi error:', e?.message || e);
    }
  } catch (err) {
    console.error('❌ Handler upsert error:', err);
  }
});

  } catch (err) {
    console.error('❌ Error init bot:', err);
    console.log(`⏳ Restart otomatis dalam ${RECONNECT_INTERVAL / 1000} detik...`);
    setTimeout(startBot, RECONNECT_INTERVAL);
  }
}

// ======================= bootstrap =======================
(async () => {
  console.log('⏳ Menunggu 20 detik agar koneksi lama benar-benar mati...');
  await new Promise(r => setTimeout(r, 20_000));
  startBot();
})();

// HTTP keep-alive (untuk health check/anti-sleep)
require('http').createServer((_, res) => {
  res.end('Bot WhatsApp aktif!');
}).listen(process.env.PORT || 3000);

// SIGTERM (graceful shutdown)
process.on('SIGTERM', async () => {
  console.log('👋 SIGTERM diterima. Menutup koneksi...');
  if (globalThis.sock?.ws?.close) {
    try { await globalThis.sock.ws.close(); console.log('✅ Koneksi ditutup'); }
    catch (err) { console.error('❌ Gagal tutup koneksi:', err); }
  }
  process.exit(0);
});

// Error global
process.on('uncaughtException', err => console.error('🚨 Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('🚨 Unhandled Rejection:', err));
