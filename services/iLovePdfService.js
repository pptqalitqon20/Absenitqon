// services/iLovePdfService.js
const fs = require('fs');
const AdmZip = require('adm-zip'); // Butuh install package ini
const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const ILovePDFFile = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile');
const path = require('path');

// --- KUNCI ANDA ---
const PUBLIC_KEY = process.env.ILOVEPDF_PUBLIC_KEY;
const SECRET_KEY = process.env.ILOVEPDF_SECRET_KEY;
// Validasi API keys
if (!PUBLIC_KEY || !SECRET_KEY) {
  throw new Error('iLovePDF API keys tidak ditemukan di environment variables. Pastikan ILOVEPDF_PUBLIC_KEY dan ILOVEPDF_SECRET_KEY sudah di-set.');
}

const instance = new ILovePDFApi(PUBLIC_KEY, SECRET_KEY);

// ============================
// HELPER DETEKSI FORMAT BUFFER
// ============================
function isZipBuffer(buf) {
  // ZIP: magic bytes "PK\x03\x04" di awal
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 4 &&
    buf[0] === 0x50 && // 'P'
    buf[1] === 0x4b && // 'K'
    buf[2] === 0x03 &&
    buf[3] === 0x04
  );
}

function isJpegBuffer(buf) {
  // JPEG: magic bytes FF D8 FF di awal
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  );
}

// (Opsional, kalau suatu saat iLovePDF kirim PNG)
function isPngBuffer(buf) {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 && // 'P'
    buf[2] === 0x4e && // 'N'
    buf[3] === 0x47 && // 'G'
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

/**
 * Mengkonversi PDF lokal menjadi gambar (JPG) menggunakan iLovePDF API.
 * Bisa menangani 2 kemungkinan hasil:
 *  1) ZIP yang berisi JPG
 *  2) Langsung JPG (buffer gambar saja)
 *
 * @param {string} pdfPath - Path lengkap ke file PDF lokal.
 * @returns {Promise<Buffer>} - Buffer dari file gambar yang dihasilkan.
 */
async function convertPdfToJpg(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error('File PDF tidak ditemukan di path lokal.');
  }

  let task;
  try {
    console.log('🔄 [DEBUG] Starting PDF to JPG conversion...');

    // 1. Buat tugas PDF to JPG
    task = instance.newTask('pdfjpg');
    await task.start();

    // 2. Tambahkan file lokal
    const file = new ILovePDFFile(pdfPath);
    await task.addFile(file);

    // 3. Proses tugas
    await task.process();

    // 4. Unduh hasilnya
    const downloadedBuffer = await task.download();
    console.log('📦 [DEBUG] Downloaded buffer size:', downloadedBuffer.length);

    // 5. Deteksi format buffer
    if (isZipBuffer(downloadedBuffer)) {
      console.log('📦 [DEBUG] Detected ZIP result from iLovePDF');

      const zip = new AdmZip(downloadedBuffer);
      const zipEntries = zip.getEntries();
      console.log('📁 [DEBUG] ZIP entries:', zipEntries.length);

      // Cari file JPEG pertama
      const jpgEntry = zipEntries.find(
        (entry) =>
          entry.entryName.toLowerCase().endsWith('.jpg') ||
          entry.entryName.toLowerCase().endsWith('.jpeg') ||
          entry.entryName.toLowerCase().endsWith('.png') // jaga-jaga
      );

      if (!jpgEntry) {
        throw new Error('Tidak ada file gambar (JPG/PNG) dalam hasil konversi');
      }

      console.log('🖼️ [DEBUG] Found image in ZIP:', jpgEntry.entryName);
      const imgBuffer = jpgEntry.getData();
      console.log('📸 [DEBUG] Image buffer size:', imgBuffer.length);

      return imgBuffer; // Buffer gambar dari dalam ZIP
    }

    // Kalau bukan ZIP tapi langsung JPEG
    if (isJpegBuffer(downloadedBuffer)) {
      console.log('🖼️ [DEBUG] Detected direct JPEG buffer from iLovePDF');
      return downloadedBuffer;
    }

    // (Opsional) kalau langsung PNG
    if (isPngBuffer(downloadedBuffer)) {
      console.log('🖼️ [DEBUG] Detected direct PNG buffer from iLovePDF');
      return downloadedBuffer;
    }

    // Kalau masuk di sini: format tidak dikenali
    console.error('❓ [DEBUG] Unknown format from iLovePDF, first bytes:', downloadedBuffer.slice(0, 8));
    throw new Error('Format hasil iLovePDF tidak dikenal (bukan ZIP/JPEG/PNG).');

  } catch (e) {
    console.error('❌ iLovePDF Konversi Gagal:', e.message || e);
    throw new Error('Gagal mengkonversi PDF ke Gambar dengan iLovePDF.');
  }
}
/**
 * Mengkonversi Word (DOC / DOCX) menjadi PDF menggunakan iLovePDF API.
 *
 * @param {string} wordPath - Path lengkap ke file Word lokal.
 * @returns {Promise<Buffer>} - Buffer PDF hasil konversi.
 */
async function convertWordToPdf(wordPath) {
  if (!fs.existsSync(wordPath)) {
    throw new Error('File Word tidak ditemukan di path lokal.');
  }

  let task;
  try {
    console.log('🔄 [DEBUG] Starting Word to PDF conversion...');

    // TASK iLovePDF untuk Office → PDF
    task = instance.newTask('officepdf');
    await task.start();

    const file = new ILovePDFFile(wordPath);
    await task.addFile(file);

    await task.process();

    const pdfBuffer = await task.download();
    console.log('📄 [DEBUG] PDF buffer size:', pdfBuffer.length);

    return pdfBuffer;

  } catch (err) {
    console.error('❌ iLovePDF Word → PDF gagal:', err.message || err);
    throw new Error('Gagal mengkonversi Word ke PDF.');
  }
}


module.exports = {
  convertPdfToJpg,
  convertWordToPdf, // ⬅️ TAMBAHKAN INI
};

