// services/iLovePdfService.js
const fs = require('fs');
const AdmZip = require('adm-zip');
const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const ILovePDFFile = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile');

const PUBLIC_KEY = process.env.ILOVEPDF_PUBLIC_KEY;
const SECRET_KEY = process.env.ILOVEPDF_SECRET_KEY;

if (!PUBLIC_KEY || !SECRET_KEY) {
  throw new Error(
    'iLovePDF API keys tidak ditemukan. Pastikan ILOVEPDF_PUBLIC_KEY dan ILOVEPDF_SECRET_KEY sudah di-set.'
  );
}

const instance = new ILovePDFApi(PUBLIC_KEY, SECRET_KEY);

/* ===============================
   HELPER DETEKSI FORMAT BUFFER
================================= */
function isZipBuffer(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    buf[2] === 0x03 &&
    buf[3] === 0x04
  );
}

function isJpegBuffer(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  );
}

function isPngBuffer(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

/* ===============================
   PDF → JPG (MULTI PAGE SUPPORT)
================================= */
async function convertPdfToJpg(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error('File PDF tidak ditemukan.');
  }

  let task;

  try {
    task = instance.newTask('pdfjpg');
    await task.start();

    const file = new ILovePDFFile(pdfPath);
    await task.addFile(file);

    await task.process();

    const downloadedBuffer = await task.download();

    // ================= ZIP RESULT =================
    if (isZipBuffer(downloadedBuffer)) {
      const zip = new AdmZip(downloadedBuffer);
      const zipEntries = zip
        .getEntries()
        .filter(
          (entry) =>
            entry.entryName.toLowerCase().endsWith('.jpg') ||
            entry.entryName.toLowerCase().endsWith('.jpeg') ||
            entry.entryName.toLowerCase().endsWith('.png')
        )
        .sort((a, b) => a.entryName.localeCompare(b.entryName));

      if (zipEntries.length === 0) {
        throw new Error('ZIP tidak berisi file gambar.');
      }

      // Return array of buffers (multi page)
      return zipEntries.map((entry) => entry.getData());
    }

    // ================= SINGLE IMAGE =================
    if (isJpegBuffer(downloadedBuffer) || isPngBuffer(downloadedBuffer)) {
      return [downloadedBuffer]; // tetap return array
    }

    throw new Error('Format hasil iLovePDF tidak dikenali.');
  } catch (err) {
    console.error('❌ iLovePDF PDF→JPG Error:', err.message || err);
    throw new Error('Gagal mengkonversi PDF ke Gambar.');
  }
}

/* ===============================
   WORD → PDF
================================= */
async function convertWordToPdf(wordPath) {
  if (!fs.existsSync(wordPath)) {
    throw new Error('File Word tidak ditemukan.');
  }

  let task;

  try {
    task = instance.newTask('officepdf');
    await task.start();

    const file = new ILovePDFFile(wordPath);
    await task.addFile(file);

    await task.process();

    const pdfBuffer = await task.download();

    return pdfBuffer;
  } catch (err) {
    console.error('❌ iLovePDF Word→PDF Error:', err.message || err);
    throw new Error('Gagal mengkonversi Word ke PDF.');
  }
}

module.exports = {
  convertPdfToJpg,
  convertWordToPdf,
};
