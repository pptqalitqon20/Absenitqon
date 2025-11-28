// handlers/pdfExtractHandler.js
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// ================== IMPORT & FALLBACK DARI pdfMergeHandler ==================
let merge;
try {
  merge = require('./pdfMergeHandler');
} catch (e) {
  console.warn('⚠️ pdfMergeHandler tidak bisa di-load, fitur merge/extract terbatas:', e.message);
  merge = {};
}

// Utilitas dari pdfMergeHandler (kalau tidak ada, buat fallback aman)
const getSessionKey =
  merge.getSessionKey || ((jid, userId) => `${jid}:${userId}`);

const clearSession =
  merge.clearSession || ((jid, userId) => {
    console.warn('⚠️ clearSession dipanggil tapi tidak terdefinisi di pdfMergeHandler');
  });

const cleanupFiles =
  merge.cleanupFiles || ((paths) => {
    // fallback: hapus file kalau ada
    if (!paths || !Array.isArray(paths)) return;
    for (const p of paths) {
      if (!p) continue;
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {
        console.warn('⚠️ Gagal cleanup file:', p, e.message);
      }
    }
  });

const startTyping =
  merge.startTyping || ((sock, jid) => null); // return token/dummy

const stopTyping =
  merge.stopTyping || ((sock, jid, typingToken) => {}); // no-op

const sendPrompt =
  merge.sendPrompt ||
  (async (sock, jid, text) => {
    // fallback: kirim pesan biasa
    return await sock.sendMessage(jid, { text });
  });

const deleteLastPrompt =
  merge.deleteLastPrompt ||
  (async () => {
    // no-op
  });

// Sessions map (bisa undefined kalau pdfMergeHandler tidak export)
const sessions = merge.sessions || null;

// ================== START FLOW EXTRACT ==================

/**
 * Memulai flow extract PDF
 * @param {Object} sock - Socket Baileys
 * @param {string} jid - JID chat
 * @param {Object} session - Session dari mergeHandler
 * @returns {Promise<boolean>} True jika berhasil memulai flow
 */
async function startPdfExtractFlow(sock, jid, session) {
  try {
    // Kalau tidak ada sessions, fitur extract tidak aktif
    if (!sessions) {
      console.warn('⚠️ startPdfExtractFlow: sessions tidak tersedia. Fitur extract tidak aktif.');
      await sock.sendMessage(jid, {
        text: '❌ Fitur ekstrak PDF belum siap. Silakan coba lagi nanti.',
      });
      return false;
    }

    if (!session?.pdfs?.length) {
      await sock.sendMessage(jid, {
        text: '❌ Tidak ada PDF yang tersedia untuk diekstrak.',
      });
      return false;
    }

    // Set state untuk extract
    session.expectingAction = false;
    session.expectingMerge = false;
    session.expectingPages = true; // NEW STATE: Menunggu input halaman
    session.pagesExpiresAt = Date.now() + 5 * 60 * 1000; // 5 menit

    // Hapus prompt lama
    await deleteLastPrompt(sock, jid, session);

    // Kirim prompt minta input halaman
    const pageCount = await getPdfPageCount(session.pdfs[0]);
    const promptText = `Mau ambil halaman berapa dari PDF ini? (Total: ${pageCount} halaman)

Contoh format:
• *1-5* → halaman 1 sampai 5
• *1,3,7* → halaman 1, 3, dan 7 saja  
• *5* → hanya halaman 5
• *all* atau *semua* → semua halaman

Ketik *batal* untuk membatalkan`;

    const sent = await sendPrompt(sock, jid, promptText);
    session.lastPromptKey = sent?.key || null;

    // Simpan session (menggunakan session yang sama dari mergeHandler)
    sessions.set(getSessionKey(jid, session.userId), session);

    console.log(
      `📄 [EXTRACT START] ${getSessionKey(
        jid,
        session.userId
      )} - waiting for pages input`
    );
    return true;
  } catch (error) {
    console.error('❌ Error starting extract flow:', error);
    await sock.sendMessage(jid, {
      text: '❌ Gagal memulai proses ekstrak.',
    });
    return false;
  }
}

// ================== HANDLE COMMAND EXTRACT ==================

/**
 * Handle perintah extract PDF
 * @param {Object} sock - Socket Baileys
 * @param {string} jid - JID chat
 * @param {Object} message - Objek pesan
 * @param {string} text - Teks pesan
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True jika berhasil memproses
 */
async function handlePdfExtractCommand(sock, jid, message, text, userId) {
  const clean = (text || '').trim().toLowerCase();
  if (!userId) return false;

  // Kalau sessions tidak ada, anggap tidak ada sesi → jangan error
  if (!sessions) {
    console.warn('⚠️ handlePdfExtractCommand: sessions tidak tersedia. Skip.');
    return false;
  }

  const s = sessions.get(getSessionKey(jid, userId));

  // Cek apakah sedang menunggu input halaman untuk extract
  const waitingForPages =
    !!(s && s.expectingPages && Date.now() <= (s.pagesExpiresAt || 0));
  if (!waitingForPages) return false; // BUKAN sesi extract aktif → biarkan handler lain yang proses

  // Handle batal
  if (['batal', '!batal', 'cancel', '!cancel'].includes(clean)) {
    await deleteLastPrompt(sock, jid, s);
    clearSession(jid, userId);
    await sock.sendMessage(jid, { text: '❌ Ekstrak PDF dibatalkan.' });
    return true;
  }

  // Proses input halaman
  try {
    await deleteLastPrompt(sock, jid, s);

    if (!s.pdfs || s.pdfs.length === 0) {
      await sock.sendMessage(jid, {
        text: '❌ PDF tidak ditemukan. Silakan mulai ulang.',
      });
      clearSession(jid, userId);
      return true;
    }

    const pdfPath = s.pdfs[0];
    const totalPages = await getPdfPageCount(pdfPath);

    // Parse input halaman
    const pagesToExtract = parsePageInput(clean, totalPages);
    if (pagesToExtract.length === 0) {
      await sock.sendMessage(jid, {
        text: `❌ Format halaman tidak valid. Contoh: 1-5, 1,3,7, atau all\n\nTotal halaman: ${totalPages}`,
      });
      return true;
    }

    // Kirim pesan loading
    const loadingMsg = await sock.sendMessage(jid, {
      text: '⏳ Sedang mengekstrak halaman...',
    });

    const typing = startTyping(sock, jid);
    let outputPath;

    try {
      // Ekstrak halaman
      outputPath = await extractPdfPages(pdfPath, pagesToExtract);

      // Kirim hasil
      await sock.sendMessage(jid, {
        document: { url: outputPath },
        mimetype: 'application/pdf',
        fileName: `Extracted-Pages-${Date.now()}.pdf`,
      });

      // Hapus pesan loading
      if (loadingMsg?.key) {
        await sock.sendMessage(jid, { delete: loadingMsg.key });
      }

      await sock.sendMessage(jid, {
        text: `✅ Berhasil mengekstrak ${pagesToExtract.length} halaman!\nHalaman: ${pagesToExtract.join(
          ', '
        )}`,
      });
    } finally {
      stopTyping(sock, jid, typing);
      // Cleanup files kalau ada outputPath
      if (outputPath) {
        cleanupFiles([outputPath]);
      }
      clearSession(jid, userId);
    }

    return true;
  } catch (error) {
    console.error('❌ Error in extract command:', error);
    await sock.sendMessage(jid, {
      text: '❌ Gagal mengekstrak halaman. Pastikan format halaman benar.',
    });
    clearSession(jid, userId);
    return true;
  }
}

// ================== UTIL: PARSE INPUT HALAMAN ==================

/**
 * Parse input halaman dari user
 * @param {string} input - Input user
 * @param {number} totalPages - Total halaman PDF
 * @returns {Array<number>} Array nomor halaman
 */
function parsePageInput(input, totalPages) {
  if (!input) return [];

  // Handle "all" atau "semua"
  if (input === 'all' || input === 'semua') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set();

  // Split by comma untuk handle multiple ranges/single pages
  const parts = input.split(',').map((part) => part.trim());

  for (const part of parts) {
    // Handle range (1-5)
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((num) => parseInt(num.trim()));

      if (
        isNaN(start) ||
        isNaN(end) ||
        start < 1 ||
        end > totalPages ||
        start > end
      ) {
        return []; // Invalid range
      }

      for (let i = start; i <= end; i++) {
        pages.add(i);
      }
    }
    // Handle single page
    else {
      const pageNum = parseInt(part);
      if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
        return []; // Invalid page number
      }
      pages.add(pageNum);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

// ================== UTIL: PAGE COUNT & EXTRACT ==================

/**
 * Dapatkan jumlah halaman PDF
 * @param {string} pdfPath - Path ke file PDF
 * @returns {Promise<number>} Jumlah halaman
 */
async function getPdfPageCount(pdfPath) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    return pdfDoc.getPageCount();
  } catch (error) {
    console.error('❌ Error getting page count:', error);
    throw error;
  }
}

/**
 * Ekstrak halaman tertentu dari PDF
 * @param {string} pdfPath - Path ke PDF sumber
 * @param {Array<number>} pageNumbers - Array nomor halaman yang akan diekstrak
 * @returns {Promise<string>} Path ke PDF hasil
 */
async function extractPdfPages(pdfPath, pageNumbers) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const sourcePdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    // Convert page numbers to indices (0-based)
    const pageIndices = pageNumbers.map((num) => num - 1);

    // Copy pages
    const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
    copiedPages.forEach((page) => newPdf.addPage(page));

    // Save new PDF
    const newPdfBytes = await newPdf.save();
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const outputPath = path.join(
      tempDir,
      `extracted_${Date.now()}.pdf`
    );
    fs.writeFileSync(outputPath, newPdfBytes);

    return outputPath;
  } catch (error) {
    console.error('❌ Error extracting PDF pages:', error);
    throw error;
  }
}

// ================== CEK SESI ACTIVE ==================

/**
 * Cek apakah ada sesi extract aktif
 * @param {string} jid - JID chat
 * @param {string} userId - User ID
 * @returns {boolean} True jika ada sesi aktif
 */
function hasActiveExtractSession(jid, userId) {
  if (!sessions) return false;
  const s = sessions.get(getSessionKey(jid, userId));

  if (!s) return false;

  const waitingForPages =
    s.expectingPages && Date.now() <= (s.pagesExpiresAt || 0);
  return !!waitingForPages;
}

module.exports = {
  startPdfExtractFlow,
  handlePdfExtractCommand,
  hasActiveExtractSession,
  // Export functions untuk testing/internal use
  parsePageInput,
  getPdfPageCount,
  extractPdfPages,
};
