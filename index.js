const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');

const { tanyaAI, tanyaReaksi } = require('./handlers/ai');
const { setSocketInstance, startCronJobs } = require('./lib/broadcast_ayat');

// Reconnect settings
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 10000;

// Inject session dari ENV
if (process.env.SESSION_B64) {
  const sessionFolder = './auth_info_baileys';
  const sessionFile = `${sessionFolder}/creds.json`;

  if (fs.existsSync(sessionFolder)) {
    fs.rmSync(sessionFolder, { recursive: true, force: true });
    console.log('🧹 Folder auth_info_baileys dihapus (untuk overwrite dari ENV)');
  }

  fs.mkdirSync(sessionFolder, { recursive: true });

  const buffer = Buffer.from(process.env.SESSION_B64, 'base64');
  fs.writeFileSync(sessionFile, buffer);
  console.log('🔐 Session WhatsApp ditanam dari ENV ✅');
}

async function startBot() {
  try {
    const AUTH_FOLDER = './auth_info_baileys';

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

    globalThis.sock = sock;
    setSocketInstance(sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log('🔑 QR Code tersedia. Silakan scan dengan WhatsApp!');
      }

      if (connection === 'open') {
        console.log('🤖 Bot berhasil tersambung ke WhatsApp!');
        console.log(`👤 Login sebagai: ${sock.user.id}`);
        reconnectAttempts = 0;
        setSocketInstance(sock);
        console.log('✅ Socket sudah terbuka, mulai cron job...');
        startCronJobs();
      }

      if (connection === 'close') {
        const errorInfo = lastDisconnect?.error;
        const reason = new Boom(errorInfo)?.output?.statusCode;
        console.log('📴 Disconnect detail:', errorInfo);
        console.log(`📴 Disconnect. Code: ${reason} (${DisconnectReason[reason] || 'Unknown'})`);

        if (reason === DisconnectReason.loggedOut) {
          console.log('🧹 Session logout. Menghapus folder auth...');
          fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
          return startBot(); // restart & tampilkan QR
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
    });

    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

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
      let handled = false;
      try {
        handled = await handleUjianWA(msg, sock);
      } catch (e) {
        console.error('❌ Gagal handle pesan ujian:', e);
      }
      if (handled) return; // ⛔️ HENTIKAN DI SINI

      if (!isGroup || isMentioned || isReplyToBot) {
        try {
          const jawaban = await tanyaAI(trimmedText);
          await sock.sendMessage(replyJid, { text: jawaban }, { quoted: msg });

          const emoji = await tanyaReaksi(trimmedText);
          await sock.sendMessage(replyJid, { react: { text: emoji, key: msg.key } });
          console.log(`✨ Emoji dikirim: ${emoji}`);
        } catch (err) {
          console.error('❌ Gagal membalas atau memberi reaksi dari AI:', err);
        }
      }
    });
  } catch (err) {
    console.error('❌ Error saat inisialisasi bot:', err);
    console.log(`⏳ Restart otomatis dalam ${RECONNECT_INTERVAL / 1000} detik...`);
    setTimeout(startBot, RECONNECT_INTERVAL);
  }
}

// Error handlers
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('🚨 Unhandled Rejection:', err);
});

const axios = require('axios');

async function handleUjianWA(message, sock) {
  const sender = message.key.remoteJid;
  const text = message.message.conversation || "";

  const url = "https://script.google.com/macros/s/AKfycbwYubun2rCsY0E7Z4KY6DorYCHUqoyXAWxQtq9H9F5HFwQaIEu0IrwWn2XxiYtn78qDiA/exec";

  if (text.startsWith("Ujian -")) {
    const [, nama, jenis, juz, keterangan] = text.split(" - ");
    const res = await axios.post(url, {
      mode: "simpan",
      nama, jenis, juz, keterangan
    });
    await sock.sendMessage(sender, { text: res.data.message });
    return true;
  }

  if (text.startsWith("Lihat")) {
    let nama = null;
    if (text.includes(" - ")) {
      [, nama] = text.split(" - ");
    }

    const res = await axios.post(url, {
      mode: "lihat",
      nama
    });

    const data = res.data.data;

    if (data.length === 0) {
      await sock.sendMessage(sender, { text: `📭 Belum ada data ujian.` });
    } else {
      const hasil = data.map((r, i) =>
        `${i + 1}. ${r[0]} - ${r[1]} - Juz ${r[2]} - ${r[4]} (${r[3]})`
      ).join("\n");

      const pesan = nama ? `📄 Data ujian untuk *${nama}*:\n` : `📄 Semua data ujian:\n`;
      await sock.sendMessage(sender, { text: pesan + hasil });
    }
    return true;
  }

  if (text.startsWith("Edit -")) {
    const [, nama, jenis, juz, keterangan] = text.split(" - ");
    const res = await axios.post(url, {
      mode: "edit",
      nama, jenis, juz, keterangan
    });
    await sock.sendMessage(sender, { text: res.data.message });
    return true;
  }

  return false; // Tidak dikenali
}

// Start bot
(async () => {
  console.log('⏳ Menunggu 10 detik agar koneksi lama benar-benar mati...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  startBot();
})();

// Keep-alive untuk Render
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
