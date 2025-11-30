// services/iLovePdfService.js
const fs = require('fs');
const AdmZip = require('adm-zip'); // Butuh install package ini
const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const ILovePDFFile = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile');
const path = require('path');

// --- KUNCI ANDA ---
// (kalau mau, nanti bisa dipindah ke .env)
const PUBLIC_KEY = 'project_public_cca43e7d4264dc4bda9236183abbc2f2_ROpf_3111f6c66415a8b5d775eae432ca1dcf';
const SECRET_KEY = 'secret_key_2518733f6066a12f10c036830a17e1be_5Xip_4ee7a955c28df551234c4aeccd71aca2';
// ------------------

const instance = new ILovePDFApi(PUBLIC_KEY, SECRET_KEY);

/**
 * Mengkonversi PDF lokal menjadi gambar JPG menggunakan iLovePDF API.
 * @param {string} pdfPath - Path lengkap ke file PDF lokal.
 * @returns {Promise<Buffer>} - Buffer dari file JPG yang dihasilkan.
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

    // 4. Unduh hasilnya (ini dapat ZIP file)
    const zipBuffer = await task.download();
    console.log('📦 [DEBUG] Downloaded ZIP file, size:', zipBuffer.length);

    // 5. Extract JPEG dari ZIP
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    console.log('📁 [DEBUG] ZIP entries:', zipEntries.length);

    // Cari file JPEG pertama
    const jpgEntry = zipEntries.find(entry => 
      entry.entryName.toLowerCase().endsWith('.jpg') || 
      entry.entryName.toLowerCase().endsWith('.jpeg')
    );

    if (!jpgEntry) {
      throw new Error('Tidak ada file JPEG dalam hasil konversi');
    }

    console.log('🖼️ [DEBUG] Found JPEG:', jpgEntry.entryName);
    const jpgBuffer = jpgEntry.getData();
    console.log('📸 [DEBUG] JPEG buffer size:', jpgBuffer.length);

    return jpgBuffer; // Return JPEG buffer, bukan ZIP

  } catch (e) {
    console.error('❌ iLovePDF Konversi Gagal:', e.message || e);
    throw new Error('Gagal mengkonversi PDF ke Gambar dengan iLovePDF.');
  }
}
module.exports = { convertPdfToJpg };
