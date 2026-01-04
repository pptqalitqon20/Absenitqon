const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { sendButtonMsg } = require('../lib/sendButton');

const sessions = new Map();

async function handleTextPdfEntry(sock, m) {
  sessions.set(m.sender, { step: 'input' });

  await sock.sendMessage(m.chat, {
    text: '✍️ Silakan kirimkan teks yang ingin dijadikan PDF',
  });

  return true;
}

async function handleIncomingText(sock, m) {
  const s = sessions.get(m.sender);
  if (!s || s.step !== 'input') return false;

  s.text = m.text;
  s.step = 'confirm';

  await sendButtonMsg(sock, m.chat, {
    text: `📄 *Preview Teks*\n\n${m.text}`,
    footer: 'Text → PDF',
    buttons: [
      {
        buttonId: 'textpdf_edit',
        buttonText: { displayText: '✏️ Edit' },
        type: 1,
      },
      {
        buttonId: 'textpdf_done',
        buttonText: { displayText: '✅ Selesai' },
        type: 1,
      },
    ],
  });

  return true;
}

async function handleTextPdfButton(sock, m, btnId) {
  const s = sessions.get(m.sender);
  if (!s) return false;

  if (btnId === 'textpdf_edit') {
    s.step = 'input';
    await sock.sendMessage(m.chat, { text: '✏️ Silakan kirim ulang teksnya' });
    return true;
  }

  if (btnId === 'textpdf_done') {
    const filePath = await generatePdf(s.text);
    await sock.sendMessage(m.chat, {
      document: { url: filePath },
      mimetype: 'application/pdf',
      fileName: `Text-to-PDF-${Date.now()}.pdf`,
    });

    sessions.delete(m.sender);
    return true;
  }

  return false;
}
async function handleTextPdfResponse(sock, m) {
  if (!m.message?.buttonsResponseMessage) return false;
  const btn = m.message.buttonsResponseMessage;
  const btnId = btn.selectedButtonId || btn.selectedDisplayText;
  return handleTextPdfButton(sock, m, btnId);
}


async function generatePdf(text) {
  const dir = path.join(__dirname, '../temp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `textpdf_${Date.now()}.pdf`);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));
  doc.fontSize(12).text(text);
  doc.end();

  return filePath;
}

module.exports = {
  handleTextPdfEntry,
  handleIncomingText,
  handleTextPdfButton,
  handleTextPdfResponse, // baru
};

