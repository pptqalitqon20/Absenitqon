const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('baileys');
const { convertWordToPdf } = require('../services/iLovePdfService');

function normalizeLid(jid = '') {
  return jid.split(':')[0].split('@')[0];
}
function getSessionKey(jid, userId) {
  return `${jid}:${normalizeLid(userId)}`;
}

/**
 * SESSION SEDERHANA
 * hanya menunggu user kirim Word
 */
const sessions = new Map();

/* =========================
 * UTIL
 * ========================= */
async function downloadAndSaveWord(documentMessage, filename) {
  const stream = await downloadContentFromMessage(documentMessage, 'document');
  const filePath = path.join(__dirname, '../temp', filename);

  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    stream.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });

  return filePath;
}

function isWordMime(mime = '') {
  return (
    mime.includes('application/msword') ||
    mime.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  );
}

/* =========================
 * COMMAND: !wordpdf
 * ========================= */
async function handleWordToPdfCommand(sock, jid, text, userId) {
  const clean = (text || '').trim().toLowerCase();
  if (clean !== '!wordpdf') return false;

  const key = getSessionKey(jid, userId);
  sessions.set(key, {
    waiting: true,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 menit
  });

  await sock.sendMessage(jid, {
    text:
      '📄 *Word → PDF*\n\n' +
      'Silakan kirim file *Word (.doc / .docx)* yang ingin diubah.\n\n' +
      '_Waktu tunggu 5 menit_'
  });

  return true;
}

/* =========================
 * DOCUMENT HANDLER
 * ========================= */
async function handleWordToPdf(sock, jid, message, userId) {
  if (!message?.documentMessage) return false;

  const mime = message.documentMessage.mimetype || '';
  if (!isWordMime(mime)) return false;

  const key = getSessionKey(jid, userId);
  const session = sessions.get(key);

  // Jika ADA sesi → lanjut
  // Jika TIDAK ADA sesi → tetap boleh (langsung kirim Word)
  if (session && session.expiresAt < Date.now()) {
    sessions.delete(key);
  }

  try {
    const loading = await sock.sendMessage(jid, {
      text: '⏳ Sedang mengubah Word ke PDF, mohon tunggu…'
    });

    const ext = mime.includes('openxml') ? 'docx' : 'doc';
    const wordPath = await downloadAndSaveWord(
      message.documentMessage,
      `word_${Date.now()}.${ext}`
    );

    const pdfBuffer = await convertWordToPdf(wordPath);

    const outPath = path.join(
      __dirname,
      `../temp/Word-to-PDF-${Date.now()}.pdf`
    );
    fs.writeFileSync(outPath, pdfBuffer);

    await sock.sendMessage(jid, {
      document: { url: outPath },
      mimetype: 'application/pdf',
      fileName: path.basename(outPath),
    });

    if (loading?.key) {
      await sock.sendMessage(jid, { delete: loading.key });
    }

    await sock.sendMessage(jid, {
      text: '✅ Word berhasil dikonversi ke PDF. Barakallahu fiik 🤲'
    });

    // cleanup
    try { fs.unlinkSync(wordPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
    sessions.delete(key);

    return true;

  } catch (err) {
    console.error('❌ Word → PDF error:', err);
    await sock.sendMessage(jid, {
      text: '❌ Gagal mengkonversi Word ke PDF.'
    });
    sessions.delete(key);
    return true;
  }
}

function hasActiveWordSession(jid, userId) {
  const s = sessions.get(getSessionKey(jid, userId));
  return !!(s && Date.now() <= s.expiresAt);
}

module.exports = {
  handleWordToPdf,
  handleWordToPdfCommand,
  hasActiveWordSession,
};
