// lib/rekapUjian.js
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sheetsService } = require('../services/sheetsService');
const { convertPdfToJpg } = require('../services/iLovePdfService');

/* ===============================
   UTIL: GROUP DATA BY MONTH
================================= */
function groupByMonth(rows) {
  const grouped = {};

  for (const row of rows) {
    if (!row.tanggal) continue;

    const date = new Date(row.tanggal);
    if (isNaN(date)) continue;

    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const key = `${year}-${String(month).padStart(2, '0')}`;

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  return grouped;
}

/* ===============================
   FORMAT SUMMARY TEXT
================================= */
function formatAbsensiSummary(rows) {
  if (!rows || rows.length === 0) {
    return `📚 *Rekap Seluruh Ujian*\n\nBelum ada data ujian.`;
  }

  const grouped = groupByMonth(rows);
  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  let totalAll = rows.length;

  let out = `📚 *Rekap Seluruh Ujian*\n\n`;

  for (const key of sortedKeys) {
    const [year, month] = key.split('-');
    out += `🗓️ *${month}-${year}* → ${grouped[key].length} ujian\n`;
  }

  out += `\n📊 Total Seluruh Ujian: *${totalAll}*\n`;
  out += `\nDetail lengkap ada pada gambar 👇`;

  return out;
}

/* ===============================
   GENERATE PROFESSIONAL PDF
================================= */
async function generateExamTablePdf(rows) {
  const grouped = groupByMonth(rows);
  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595, 842]); // A4 size
  let { width, height } = page.getSize();

  let currentY = height - 50;

  const rowHeight = 22;
  const colWidths = [80, 150, 110, 90, 100];
  const headers = ['Tanggal', 'Nama Santri', 'Halaqah', 'Kategori', 'Ket'];

  function addNewPage() {
    page = doc.addPage([595, 842]);
    const size = page.getSize();
    currentY = size.height - 50;
  }

  function drawText(text, x, y, size = 10, isBold = false) {
    page.drawText(String(text), {
      x,
      y,
      size,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    });
  }

  function drawCell(text, x, y, w, isHeader = false) {
    page.drawRectangle({
      x,
      y: y - rowHeight,
      width: w,
      height: rowHeight,
      borderColor: rgb(0.75, 0.75, 0.75),
      borderWidth: 1,
      color: isHeader ? rgb(0.92, 0.92, 0.92) : rgb(1, 1, 1),
    });

    drawText(text, x + 5, y - 15, 9, isHeader);
  }

  // ======= TITLE =======
  drawText('REKAP SELURUH UJIAN SANTRI', 50, currentY, 18, true);
  currentY -= 30;

  let totalAll = 0;

  for (const monthKey of sortedKeys) {
    const monthData = grouped[monthKey];
    totalAll += monthData.length;

    const [year, month] = monthKey.split('-');

    if (currentY < 100) addNewPage();

    // ===== MONTH HEADER =====
    page.drawRectangle({
      x: 50,
      y: currentY - 18,
      width: width - 100,
      height: 20,
      color: rgb(0.85, 0.90, 1),
    });

    drawText(
      `Bulan ${month}-${year}  |  Total Ujian: ${monthData.length}`,
      55,
      currentY - 14,
      12,
      true
    );

    currentY -= 35;

    // ===== TABLE HEADER =====
    let currentX = 50;
    for (let i = 0; i < headers.length; i++) {
      drawCell(headers[i], currentX, currentY, colWidths[i], true);
      currentX += colWidths[i];
    }

    currentY -= rowHeight;

    // ===== TABLE DATA =====
    for (const row of monthData) {
      if (currentY < 60) {
        addNewPage();
      }

      currentX = 50;

      const values = [
        row.tanggal,
        row.nama,
        row.halaqah,
        row.kategori,
        row.ket || '-',
      ];

      for (let i = 0; i < values.length; i++) {
        drawCell(values[i], currentX, currentY, colWidths[i]);
        currentX += colWidths[i];
      }

      currentY -= rowHeight;
    }

    currentY -= 25;
  }

  // ===== TOTAL AKHIR =====
  if (currentY < 100) addNewPage();

  drawText('TOTAL SELURUH UJIAN', 50, currentY, 14, true);
  currentY -= 20;
  drawText(`Jumlah Ujian Keseluruhan: ${totalAll}`, 50, currentY, 12);

  const pdfBytes = await doc.save();

  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const outPath = path.join(tempDir, `RekapUjian-${Date.now()}.pdf`);
  fs.writeFileSync(outPath, pdfBytes);

  return outPath;
}

/* ===============================
   HANDLE COMMAND
================================= */
async function handleRekapUjianCommand(sock, jid) {
  let pdfPath = null;

  sock.sendPresenceUpdate('composing', jid);

  try {
    const rows = await sheetsService.listAllAbsensi();

    if (!rows || rows.length === 0) {
      await sock.sendMessage(jid, {
        text: `📚 *Rekap Seluruh Ujian*\n\nBelum ada data ujian.`,
      });
      return true;
    }

    const summaryText = formatAbsensiSummary(rows);
    pdfPath = await generateExamTablePdf(rows);

    const loadingMsg = await sock.sendMessage(jid, {
      text: '⏳ Sedang menyiapkan rekap profesional... Mohon tunggu 😊',
    });

    const imageBuffers = await convertPdfToJpg(pdfPath);

for (let i = 0; i < imageBuffers.length; i++) {
  await sock.sendMessage(jid, {
    image: imageBuffers[i],
    caption: i === 0 ? '📄 Detail Lengkap Rekap Ujian' : '',
    mimetype: 'image/jpeg',
  });
}

    await sock.sendMessage(jid, {
      text: '✨ Barakallahu Fiikum ✨',
    });
  } catch (error) {
    console.error('❌ Error handleRekapUjianCommand:', error);
    await sock.sendMessage(jid, {
      text: 'Maaf, terjadi kesalahan saat memproses data.',
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
