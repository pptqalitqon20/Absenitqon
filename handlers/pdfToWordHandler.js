const fs = require('fs');
const path = require('path');
const { convertPdfToWord } = require('../services/pdfToWordService');

async function startPdfToWord(sock, jid, session) {
  if (!session?.pdfs?.length) {
    await sock.sendMessage(jid, { text: '❌ PDF tidak ditemukan.' });
    return true;
  }

  const pdfPath = session.pdfs[0];
  const docxPath = pdfPath.replace('.pdf', '.docx');

  await sock.sendMessage(jid, { text: '⏳ Mengubah PDF ke Word...' });

  await convertPdfToWord(pdfPath, docxPath);

  await sock.sendMessage(jid, {
    document: { url: docxPath },
    mimetype:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileName: path.basename(docxPath),
  });

  fs.unlinkSync(pdfPath);
  fs.unlinkSync(docxPath);
  session.cleanup?.();

  return true;
}

module.exports = { startPdfToWord };
