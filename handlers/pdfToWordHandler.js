const path = require('path');
const fs = require('fs');
const { convertPdfToWord } = require('../services/pdfToWordService');

async function startPdfToWord(sock, jid, session) {
  if (!session?.pdfs?.length) {
    await sock.sendMessage(jid, { text: '❌ PDF tidak ditemukan.' });
    return true;
  }

  const pdfPath = session.pdfs[0];
  const docxPath = pdfPath.replace('.pdf', '.docx');

  await sock.sendMessage(jid, { text: '⏳ Mengubah PDF ke Word...' });

  // ⬇️ WAJIB kirim 2 parameter
  await convertPdfToWord(pdfPath, docxPath);

  // ⬇️ Pastikan file memang ada
  if (!fs.existsSync(docxPath)) {
    throw new Error('File DOCX tidak ditemukan setelah konversi');
  }

  await sock.sendMessage(jid, {
    document: fs.readFileSync(docxPath),
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileName: path.basename(docxPath),
  });

  return true;
}

module.exports = { startPdfToWord };
