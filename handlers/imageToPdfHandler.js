// handlers/imageToPdfHandler.js
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('baileys');
const imageToPdfService = require('../services/imageToPdfService');

const sessions = new Map();

function normalizeLid(jid = '') {
  return jid.split(':')[0].split('@')[0];
}
function getSessionKey(jid, userId) {
  return `${jid}:${normalizeLid(userId || '')}`;
}
function hasActivePdfSession(jid, userId) {
  const key = getSessionKey(jid, userId);
  const s = sessions.get(key);
  if (!s) return false;
  if (s.expectingChoice && Date.now() > (s.choiceExpiresAt || 0)) {
    sessions.delete(key);
    return false;
  }
  return true;
}
function getSession(jid, userId) {
  return sessions.get(getSessionKey(jid, userId));
}
function clearSession(jid, userId) {
  sessions.delete(getSessionKey(jid, userId));
}

function setSessionWaiting(jid, userId, images) {
  const key = getSessionKey(jid, userId);
  const s = sessions.get(key) || { images: [], lastPromptKey: null };
  s.images.push(...images);
  s.expectingChoice = true;
  s.choiceExpiresAt = Date.now() + 2 * 60 * 1000; // 2 menit
  sessions.set(key, s);
  return s;
}

function startTyping(sock, jid) {
  sock.sendPresenceUpdate('composing', jid);
  const interval = setInterval(() => {
    sock.sendPresenceUpdate('composing', jid);
  }, 8000);
  return interval;
}
function stopTyping(sock, jid, interval) {
  if (interval) clearInterval(interval);
  sock.sendPresenceUpdate('paused', jid);
}

// ================== helper unduh gambar ==================
async function downloadAndSaveImage(imageMessage, filename) {
  try {
    const stream = await downloadContentFromMessage(imageMessage, 'image');
    const filePath = path.join(__dirname, '../temp', filename);
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(filePath);
      stream.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });
    return filePath;
  } catch (err) {
    console.error('❌ downloadAndSaveImage error:', err);
    return null;
  }
}

// ================== prompt helper (return key untuk delete) ==================
async function askChoice(sock, jid, count) {
  const sent = await sock.sendMessage(jid, {
    text:
`Afwan, mau saya langsung jadikan PDF atau lanjut kirim gambar lagi?

Balas salah satu:
• *Y* → jadikan PDF sekarang
• *L* → lanjut kirim gambar

(Gambar terkumpul: ${count})`
  });
  return sent?.key || null;
}

// Hapus prompt Y/L sebelumnya kalau masih ada
async function deleteLastPrompt(sock, jid, s) {
  try {
    if (s?.lastPromptKey) {
      await sock.sendMessage(jid, { delete: s.lastPromptKey });
      s.lastPromptKey = null;
    }
  } catch (e) {
    console.warn('⚠️ Gagal hapus prompt lama:', e?.message);
  }
}

function extractImagesFromMessage(message) {
  const list = [];

  if (message?.imageMessage) {
    list.push({ type: 'imageMessage', msg: message.imageMessage });
  }

  const q = message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (q?.imageMessage) {
    list.push({ type: 'quotedImage', msg: q.imageMessage });
  }

  return list;
}

async function handleImageToPDF(sock, jid, message, text = '', userId) {
  try {
    if (!userId) {
      console.warn('[PDF] handleImageToPDF dipanggil tanpa userId.');
      return;
    }
    console.log('DEBUG: message.imageMessage existence:', !!message?.imageMessage); 
    console.log('DEBUG: message.extendedTextMessage existence:', !!message?.extendedTextMessage); 

    const found = extractImagesFromMessage(message);
    if (found.length === 0) {
      await sock.sendMessage(jid, { text: '❌ Tidak ada gambar. Kirim gambar atau reply ke gambar.' });
      return;
    }

    const saved = [];
    for (let i = 0; i < found.length; i++) {
      const fileName = `image_${Date.now()}_${i}.jpg`;
      const filePath = await downloadAndSaveImage(found[i].msg, fileName);
      if (filePath) saved.push(filePath);
    }

    if (saved.length === 0) {
      await sock.sendMessage(jid, { text: '❌ Gagal mengunduh gambar. Coba lagi.' });
      return;
    }

    const s = setSessionWaiting(jid, userId, saved);
    console.log('📎 [SET SESSION]', getSessionKey(jid, userId), 'images:', s.images.length);
    await deleteLastPrompt(sock, jid, s);
    // Kirim prompt & simpan key agar bisa dihapus saat user balas
    const key = await askChoice(sock, jid, s.images.length);
    s.lastPromptKey = key;
    sessions.set(getSessionKey(jid, userId), s);

  } catch (error) {
    console.error('❌ Error in handleImageToPDF:', error);
    await sock.sendMessage(jid, { text: '❌ Terjadi kesalahan sistem saat membaca gambar.' });
  }
}

async function handleImageToPDFCommand(sock, jid, message, text, userId) {
  const clean = (text || '').trim().toLowerCase();
  console.log('[DEBUG PDF CMD ARGS]', { jid, text: clean, userId });
  if (!userId) return false;

  const s = getSession(jid, userId);
  const waiting = !!(s && s.expectingChoice && Date.now() <= (s.choiceExpiresAt || 0));
  console.log('📎 [CHECK SESSION]', getSessionKey(jid, userId), 'waiting:', waiting);
  if (!waiting) return false;

  // ======= Lanjut kirim gambar =======
  if (clean === 'l' || clean === 'lanjut' || clean === 'lanjutkan') {
    // hapus prompt lama
    await deleteLastPrompt(sock, jid, s);

    // prompt akan dikirim ulang setelah gambar berikutnya diterima
    s.expectingChoice = false;
    s.choiceExpiresAt = 0;
    sessions.set(getSessionKey(jid, userId), s);

    await sock.sendMessage(jid, {
      text: 'Silakan kirim gambar berikutnya. Jika sudah cukup, balas *Y* untuk dijadikan PDF.'
    });
    return true;
  }

  // ======= Jadikan PDF sekarang =======
  if (clean === 'y' || clean === 'iya' || clean === 'ya') {
  // hapus prompt lama
  await deleteLastPrompt(sock, jid, s);

  s.expectingChoice = false;
  s.choiceExpiresAt = 0;

  let typing;
  let pdfPath = null;
  let loadingMsg; // ⬅️ simpan pesan loading

  try {
    // kirim pesan loading
    loadingMsg = await sock.sendMessage(jid, {
      text: '⏳ Konversinya mungkin agak lama ya karena file bisa cukup besar. Sambil menunggu, yuk baca zikir agar berpahala 🤲'
    });

    // typing indicator
    typing = startTyping(sock, jid);

    // konversi
    if ((s.images || []).length <= 1) {
      pdfPath = await imageToPdfService.convertSingleImageToPDF(s.images[0], { pageMode: 'NATIVE' });
    } else {
      pdfPath = await imageToPdfService.convertImagesToPDFNative(s.images);
    }

    // kirim file PDF
    if (pdfPath && fs.existsSync(pdfPath)) {
      await sock.sendMessage(jid, {
        document: { url: pdfPath },
        mimetype: 'application/pdf',
        fileName: `Scan-${Date.now()}.pdf`,
      });
    }

    // hapus pesan loading lalu kirim pesan sukses
    if (loadingMsg?.key) {
      await sock.sendMessage(jid, { delete: loadingMsg.key });
    }
    await sock.sendMessage(jid, { text: '✅ Selesai. Barakallahu fiik!' });

  } catch (e) {
    console.error('❌ PDF conversion failed:', e);
    // kalau gagal, tetap coba hapus pesan loading
    if (loadingMsg?.key) {
      try { await sock.sendMessage(jid, { delete: loadingMsg.key }); } catch {}
    }
    await sock.sendMessage(jid, { text: '❌ Gagal mengkonversi gambar ke PDF.' });
  } finally {
    stopTyping(sock, jid, typing);
    try { if (pdfPath) imageToPdfService.cleanupFile(pdfPath); } catch {}
    try { if (s.images?.length) imageToPdfService.cleanupFiles(s.images); } catch {}
    clearSession(jid, userId);
  }

  return true;
}
  // bukan Y/L → biarkan handler lain
  return false;
}

module.exports = {
  handleImageToPDF,
  handleImageToPDFCommand,
  hasActivePdfSession,  // dipakai di messageHandler
  getSessionKey         // dipakai di messageHandler
};
