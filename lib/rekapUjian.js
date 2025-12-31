// lib/rekapUjian.js
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const { sheetsService } = require('../services/sheetsService');
const { convertPdfToJpg } = require('../services/iLovePdfService');

// --- UTILITY FUNCTIONS LAMA ---
function getNowJakarta() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function getEmojiNumber(n) {
  const emojiMap = {
    '0': '0️⃣', '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', '4': '4️⃣',
    '5': '5️⃣', '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣',
  };
  if (n === 10) return '1️⃣0️⃣';

  return String(n)
    .split('')
    .map((digit) => emojiMap[digit] || digit)
    .join('');
}

function parseArgsAfter5(text) {
  const parts = text.trim().split(/\s+/).slice(1);
  let year, month, halaqah;

  if (parts.length) {
    const ymIdx = parts.findIndex((p) => /^\d{4}-\d{2}$/.test(p));
    if (ymIdx >= 0) {
      const [y, m] = parts[ymIdx].split('-').map((v) => parseInt(v, 10));
      if (y >= 2000 && m >= 1 && m <= 12) {
        year = y;
        month = m;
      }
      const leftover = parts.filter((_, i) => i !== ymIdx);
      if (leftover.length) halaqah = leftover.join(' ');
    } else {
      halaqah = parts.join(' ');
    }
  }

  if (!year || !month) {
    const now = getNowJakarta();
    year = now.year;
    month = now.month;
  }

  return { year, month, halaqah };
}

// --- FUNGSI RINGKASAN TEKS ---
function formatAbsensiSummary(rows, { year, month, halaqah }) {
  const headerTitle =
    `🗓️ Daftar Ujian Bulan ${String(month).padStart(2, '0')}-${year}` +
    (halaqah ? ` (Halaqah: ${halaqah})` : '');

  if (!rows || rows.length === 0) {
    return `*${headerTitle}*\n\nBelum ada data ujian pada periode ini.`;
  }

  let out = `*${headerTitle}*\n`;

  const data = rows[0];

  out += `📅 *${data.tanggal}*\n`;
  out += `1️⃣ *${data.nama}*\n`;
  out += `  🧑‍🏫 Halaqah: ${data.halaqah}\n`;
  out += `  🎙️ Kategori: ${data.kategori}\n`;
  out += `  📖Juz: ${data.juz || '-'}\n`;
  out += `  ℹ️ Ket: ${data.ket || '-'}\n`;

  out += `\nLihat selengkapnya di dalam gambar 👇`;
  return out;
}

// --- GENERATE PDF TABEL UJIAN ---
async function generateExamTablePdf(rows, args) {
  const doc = await PDFDocument.create();
  let page = doc.addPage([600, 800]);
  const { width, height } = page.getSize();

  page.drawText(
    `Daftar Ujian Bulan ${String(args.month).padStart(2, '0')}-${args.year}`,
    {
      x: 50,
      y: height - 50,
      size: 24,
      color: rgb(0, 0, 0),
    }
  );

  const startY = height - 90;
  let currentY = startY;
  const rowHeight = 25;
  const colWidths = [80, 160, 100, 80, 100];
  const headers = ['Tanggal', 'Nama Santri', 'Halaqah', 'Kategori', 'Ket'];

  const drawCell = (text, x, y, w, isHeader = false) => {
    page.drawRectangle({
      x: x,
      y: y - rowHeight,
      width: w,
      height: rowHeight,
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 1,
      color: isHeader ? rgb(0.8, 0.8, 0.8) : rgb(1, 1, 1),
    });
    page.drawText(String(text), {
      x: x + 5,
      y: y - rowHeight / 2 - 5,
      size: 10,
      color: rgb(0, 0, 0),
    });
  };

  // Header
  let currentX = 50;
  for (let i = 0; i < headers.length; i++) {
    drawCell(headers[i], currentX, currentY, colWidths[i], true);
    currentX += colWidths[i];
  }
  currentY -= rowHeight;

  // Data
  for (const row of rows) {
    if (currentY < 50) {
      page = doc.addPage([600, 800]);
      currentY = doc.getPage(doc.getPages().length - 1).getSize().height - 50;
    }

    currentX = 50;
    const rowValues = [
      row.tanggal,
      row.nama,
      row.halaqah,
      row.kategori,
      row.ket || '-',
    ];

    for (let i = 0; i < rowValues.length; i++) {
      drawCell(rowValues[i], currentX, currentY, colWidths[i]);
      currentX += colWidths[i];
    }
    currentY -= rowHeight;
  }

  const pdfBytes = await doc.save();

  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const outPath = path.join(tempDir, `RekapUjian-${Date.now()}.pdf`);
  fs.writeFileSync(outPath, pdfBytes);

  return outPath;
}

// --- FUNGSI UTAMA: dipanggil dari tombol atau command "3" ---
async function handleRekapUjianCommand(sock, jid, lcText = '5') {
  // Kalau dipanggil lewat command manual, boleh tetap cek:
  if (!/^5(\b| )/i.test(lcText)) {
    // Tapi kalau dari tombol, kita paksa pakai '3' saja (default bulan ini)
    lcText = '3';
  }

  let pdfPath = null;

  sock.sendPresenceUpdate('composing', jid);

  try {
    const args = parseArgsAfter5(lcText);
    const rows = await sheetsService.listAbsensiByMonth(args);

    if (!rows || rows.length === 0) {
      const emptyText = formatAbsensiSummary([], args);
      await sock.sendMessage(jid, { text: emptyText });
      return true;
    }

    const summaryText = formatAbsensiSummary(rows, args);
    pdfPath = await generateExamTablePdf(rows, args);

    const loadingMsg = await sock.sendMessage(jid, {
      text: '⏳ Tunggu Yah.. Saya Buatkan Dalam Versis Gambar Supaya Mudah..Kalau Lama Sambil Zikir Aja😊...',
    });

    const imageBuffer = await convertPdfToJpg(pdfPath);

    if (loadingMsg?.key) {
      await sock.sendMessage(jid, { delete: loadingMsg.key });
    }

    await sock.sendMessage(jid, { text: summaryText });

    await sock.sendMessage(jid, {
      image: imageBuffer,
      caption: `Detail Lengkap Rekap Ujian Bulan ${args.month}-${args.year}`,
      mimetype: 'image/jpeg',
      jpegThumbnail: null
    });

    await sock.sendMessage(jid, { text: 'Barakallahu Fiikum' });
  } catch (error) {
    console.error('❌ Error handleRekapUjianCommand:', error);
    await sock.sendMessage(jid, {
      text: 'Maaf, terjadi kesalahan saat memproses data atau konversi gambar.',
    });
  } finally {
    sock.sendPresenceUpdate('paused', jid);

    if (pdfPath && fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  }

  return true;
}

module.exports = { handleRekapUjianCommand };
