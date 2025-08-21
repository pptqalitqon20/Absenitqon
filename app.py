const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');
const axios = require('axios');
const { tanyaAI, tanyaReaksi } = require('./handlers/ai');

// Konstanta
const AUTH_FOLDER = './auth_info_baileys';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 10000;


// State reconnect
let isReconnecting = false;
let reconnectAttempts = 0;

// Inject session dari ENV
if (process.env.SESSION_B64) {
  const sessionFile = `${AUTH_FOLDER}/creds.json`;

  if (fs.existsSync(AUTH_FOLDER)) {
    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    console.log('🧹 Folder auth_info_baileys dihapus (untuk overwrite dari ENV)');
  }

  fs.mkdirSync(AUTH_FOLDER, { recursive: true });

  const buffer = Buffer.from(process.env.SESSION_B64, 'base64');
  fs.writeFileSync(sessionFile, buffer);
  console.log('🔐 Session WhatsApp ditanam dari ENV ✅');
}

// Fungsi ekstrak isi pesan
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

// Fungsi utama
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
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 25000,
      getMessage: async () => null
    });

    globalThis.sock = sock;
    setSocketInstance(sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) console.log('🔑 QR Code tersedia. Silakan scan dengan WhatsApp!');
      if (connection === 'open') {
        console.log('🤖 Bot berhasil tersambung ke WhatsApp!');
        console.log(`👤 Login sebagai: ${sock.user.id}`);
        reconnectAttempts = 0;
        startCronJobs();
      }
      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        console.log(`📴 Disconnect. Code: ${reason} (${DisconnectReason[reason] || 'Unknown'})`);

        if (reason === DisconnectReason.connectionReplaced) {
          console.log('🔁 Sesi digantikan. Keluar agar Render bisa restart clean.');
          process.exit(0);
        }

        if (reason === DisconnectReason.loggedOut) {
          console.log('🧹 Session logout. Menghapus folder auth...');
          fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
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

      // Jalankan fitur ujian dulu
      const handled = await handleUjianWA(msg, sock);
      if (handled) return;

      const isGroup = msg.key.remoteJid.endsWith('@g.us');
      const senderJid = isGroup ? msg.key.participant : msg.key.remoteJid;
      const replyJid = isGroup ? msg.key.remoteJid : senderJid;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId || '';

      const trimmedText = typeof text === 'string' ? text.trim() : '';
      const botNumber = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const isMentioned = mentionedJids.includes(botNumber);
      const isReplyToBot = msg.message?.extendedTextMessage?.contextInfo?.participant === botNumber;

      // 🧠 Tanya AI (hanya di private chat atau saat disebut di grup)
      if (!isGroup && (isMentioned || isReplyToBot)) {
        try {
          const jawaban = await tanyaAI(trimmedText);
          await sock.sendMessage(replyJid, { text: jawaban }, { quoted: msg });

          const emoji = await tanyaReaksi(trimmedText);
          await sock.sendMessage(replyJid, { react: { text: emoji, key: msg.key } });
          console.log(`✨ Emoji dikirim: ${emoji}`);
        } catch (err) {
          console.error('❌ Gagal membalas dari AI:', err);
        }
      }
    });

  } catch (err) {
    console.error('❌ Error saat inisialisasi bot:', err);
    console.log(`⏳ Restart otomatis dalam ${RECONNECT_INTERVAL / 1000} detik...`);
    setTimeout(startBot, RECONNECT_INTERVAL);
  }
}

// Mulai bot
(async () => {
  console.log('⏳ Menunggu 20 detik agar koneksi lama benar-benar mati...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  startBot();
})();

// HTTP Keep-Alive untuk Render
require('http').createServer((_, res) => {
  res.end("Bot WhatsApp aktif!");
}).listen(process.env.PORT || 3000);

// Handle SIGTERM
process.on('SIGTERM', async () => {
  console.log('👋 SIGTERM diterima. Menutup koneksi WhatsApp...');
  if (globalThis.sock && globalThis.sock.ws?.close) {
    try {
      await globalThis.sock.ws.close();
      console.log('✅ Koneksi WhatsApp ditutup dengan bersih');
    } catch (err) {
      console.error('❌ Gagal menutup koneksi:', err);
    }
  }
  process.exit(0);
});

// Error global
process.on('uncaughtException', err => console.error('🚨 Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('🚨 Unhandled Rejection:', err));
