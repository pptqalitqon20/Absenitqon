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

// 📥 Event pesan masuk
sock.ev.on('messages.upsert', async (m) => {
  const msg = m.messages[0];
  if (!msg.message || msg.key.fromMe) return;

  const isGroup = msg.key.remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? msg.key.participant : msg.key.remoteJid;
  const replyJid = isGroup ? msg.key.remoteJid : senderJid;

  if (isGroup) {
    console.log('📢 Pesan dari grup:', msg.key.remoteJid);
  }

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId || '';

  const trimmedText = typeof text === 'string' ? text.trim() : '';
  
  // 🔧 PERBAIKAN: Cara yang lebih akurat mendapatkan bot number
  let botNumber;
  if (sock.user?.id) {
    // Ambil hanya nomor tanpa suffix
    botNumber = sock.user.id.replace(/:\d+/, '').replace('@s.whatsapp.net', '') + '@s.whatsapp.net';
  }
  
  console.log('🤖 Bot Number:', botNumber);
  console.log('👤 Sender:', senderJid);
  
  // 🔧 PERBAIKAN: Deteksi mention yang lebih akurat
  const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  console.log('📢 Mentioned JIDs:', mentionedJids);
  
  // Cek apakah bot di-mention dengan beberapa cara
  const isMentioned = mentionedJids.some(jid => {
    const cleanJid = jid.replace('@s.whatsapp.net', '');
    const cleanBotNumber = botNumber ? botNumber.replace('@s.whatsapp.net', '') : '';
    return cleanJid === cleanBotNumber || jid === botNumber;
  });
  
  // 🔧 PERBAIKAN: Deteksi reply yang lebih akurat
  const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
  const isReplyToBot = quotedMsg?.participant === botNumber || 
                      quotedMsg?.remoteJid === botNumber ||
                      (quotedMsg?.stanzaId && quotedMsg?.participant?.includes(sock.user?.id?.split(':')[0]));
  
  console.log('🔍 Debug Info:');
  console.log('  - Is Mentioned:', isMentioned);
  console.log('  - Is Reply to Bot:', isReplyToBot);
  console.log('  - Quoted participant:', quotedMsg?.participant);
  console.log('  - Text:', trimmedText);
  // 🧠 Tanya AI - PERBAIKAN: Kondisi yang lebih jelas
 const shouldRespond = !isGroup || isMentioned || isReplyToBot;

  
  console.log('🤔 Should respond?', shouldRespond);
  
  if (shouldRespond && trimmedText) {
    try {
      console.log('🤖 Memproses dengan AI:', trimmedText);
      const jawaban = await tanyaAI(trimmedText);
      await sock.sendMessage(replyJid, { text: jawaban }, { quoted: msg });
      console.log('✅ Berhasil membalas');
    } catch (err) {
      console.error('❌ Gagal membalas dari AI:', err);
    }
  }
});

// 🔧 TAMBAHAN: Function untuk mendapatkan bot number yang lebih akurat
function getBotNumber(sock) {
  if (!sock.user?.id) return null;
  
  // Berbagai format yang mungkin
  let botId = sock.user.id;
  
  // Hapus suffix :xx jika ada
  botId = botId.replace(/:\d+$/, '');
  
  // Tambahkan @s.whatsapp.net jika belum ada
  if (!botId.includes('@')) {
    botId += '@s.whatsapp.net';
  }
  
  return botId;
}

// 🔧 TAMBAHAN: Function untuk debugging mention
function debugMention(msg, botNumber) {
  try {
    console.log('🐛 DEBUG MENTION:');
    console.log('  - Bot Number:', botNumber);
    console.log('  - Message Type:', Object.keys(msg.message || {}));
    
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (contextInfo) {
      console.log('  - Context Info:', {
        mentionedJid: contextInfo.mentionedJid,
        participant: contextInfo.participant,
        quotedMessage: !!contextInfo.quotedMessage
      });
    }
    
    // Cek apakah ada mention di text
    const text = msg.message?.extendedTextMessage?.text 
              || msg.message?.conversation 
              || '';

    const mentionPattern = /@\d+/g;
    const mentionsInText = text.match(mentionPattern) || [];
    console.log('  - Mentions in text:', mentionsInText);

  } catch (err) {
    console.error('❌ Error debugMention:', err);
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
