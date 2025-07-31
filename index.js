const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');

// Handler & modul lokal
const { tanyaAI } = require('./handlers/ai');
const { setSocketInstance, kirimAyatTestKeGroup } = require('./lib/broadcast_ayat');
const { initDatabase, getDB } = require('./database');

// Reconnect control
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 10000; // 10 detik

// Inject session file dari ENV SESSION_B64 (Render)
if (process.env.SESSION_B64) {
  const sessionFolder = './auth_info_baileys';
  const sessionFile = `${sessionFolder}/creds.json`;
  const fs = require('fs');

  if (!fs.existsSync(sessionFolder)) {
    fs.mkdirSync(sessionFolder, { recursive: true });
    console.log('📁 Folder auth_info_baileys dibuat (dari ENV)');
  }

  const buffer = Buffer.from(process.env.SESSION_B64, 'base64');
  fs.writeFileSync(sessionFile, buffer);
  console.log('🔐 Session WhatsApp ditanam dari ENV ✅');
}

async function startBot() {
  try {
    await initDatabase();
    getDB();
    console.log('✅ Database berhasil terhubung!');
  } catch (err) {
    console.error('❌ Gagal konek DB:', err);
    setTimeout(startBot, RECONNECT_INTERVAL);
    return;
  }

  try {
    const AUTH_FOLDER = './auth_info_baileys';

    // Pastikan folder auth ada
    if (!fs.existsSync(AUTH_FOLDER)) {
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
      console.log('📁 Folder auth_info_baileys dibuat ulang');
    }

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

    setSocketInstance(sock);
    sock.ev.on('creds.update', saveCreds);

    // 🔁 Update koneksi
    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log('🔑 QR Code tersedia. Silakan scan dengan WhatsApp!');
      }

      if (connection === 'close') {
        const errorInfo = lastDisconnect?.error;
        console.log('📴 Disconnect detail:', errorInfo);
        const reason = new Boom(errorInfo)?.output?.statusCode;

        if (reason === DisconnectReason.loggedOut) {
          console.log('🧹 Session logout. Menghapus folder auth...');
          fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
          return startBot(); // restart dan tampilkan QR
        }

        if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          isReconnecting = true;
          reconnectAttempts++;
          console.log(`⏳ Reconnecting dalam ${RECONNECT_INTERVAL / 1000} detik... (Percobaan ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          setTimeout(() => {
            isReconnecting = false;
            startBot().catch(console.error);
          }, RECONNECT_INTERVAL);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.log('❌ Gagal reconnect setelah beberapa percobaan. Restart bot secara manual.');
        }
      }

      if (connection === 'open') {
        console.log('🤖 Bot berhasil tersambung ke WhatsApp!');
        reconnectAttempts = 0;
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
      const botNumber = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const isMentioned = mentionedJids.includes(botNumber);
      const isReplyToBot = msg.message?.extendedTextMessage?.contextInfo?.participant === botNumber;

      // 🔘 Perintah khusus
      if (trimmedText === '/tes_ayat') {
        await kirimAyatTestKeGroup(replyJid);
        return;
      }

      if (trimmedText === '/kirim') {
        try {
          await handleKirimLaporan(sock, msg);
        } catch (err) {
          console.error('❌ Gagal kirim laporan:', err);
        }
        return;
      }

      // 🧠 Tanya AI
      if (!isGroup || isMentioned || isReplyToBot) {
        try {
          const jawaban = await tanyaAI(trimmedText);
          await sock.sendMessage(replyJid, { text: jawaban }, { quoted: msg });
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

// 🔥 Tangkap semua error fatal
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('🚨 Unhandled Rejection:', err);
});

// 🔃 Jalankan bot
startBot();
