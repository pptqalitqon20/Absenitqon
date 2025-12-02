// handlers/pdfExtractHandler.js - VERSI DIPERBAIKI
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

// Utilitas dari pdfMergeHandler
const getSessionKey = merge.getSessionKey || ((jid, userId) => `${jid}:${userId}`);
const clearSession = merge.clearSession || ((jid, userId) => {
  console.warn('⚠️ clearSession dipanggil tapi tidak terdefinisi di pdfMergeHandler');
});
const cleanupFiles = merge.cleanupFiles || ((paths) => {
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
const startTyping = merge.startTyping || ((sock, jid) => null);
const stopTyping = merge.stopTyping || ((sock, jid, typingToken) => {});
const sendPrompt = merge.sendPrompt || (async (sock, jid, text) => {
  return await sock.sendMessage(jid, { text });
});
const deleteLastPrompt = merge.deleteLastPrompt || (async () => {});

// Sessions map
const sessions = merge.sessions || null;

// ================== LOG DEBUG UTILITY ==================
const debugLog = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`[PDF-EXTRACT DEBUG][${timestamp}] ${message}`, Object.keys(data).length > 0 ? data : '');
};

// ================== START FLOW EXTRACT ==================
async function startPdfExtractFlow(sock, jid, session) {
  try {
    debugLog('startPdfExtractFlow called', { jid, hasSession: !!session });
    
    if (!sessions) {
      debugLog('WARNING: sessions tidak tersedia');
      await sock.sendMessage(jid, {
        text: '❌ Fitur ekstrak PDF belum siap. Silakan coba lagi nanti.',
      });
      return false;
    }

    if (!session?.pdfs?.length) {
      debugLog('ERROR: Tidak ada PDF dalam session', { pdfsCount: session?.pdfs?.length || 0 });
      await sock.sendMessage(jid, {
        text: '❌ Tidak ada PDF yang tersedia untuk diekstrak.',
      });
      return false;
    }

    // Set state untuk extract
    session.expectingAction = false;
    session.expectingMerge = false;
    session.expectingPages = true;
    session.pagesExpiresAt = Date.now() + 5 * 60 * 1000;

    // Hapus prompt lama
    await deleteLastPrompt(sock, jid, session);

    // Dapatkan jumlah halaman PDF
    const pageCount = await getPdfPageCount(session.pdfs[0]);
    debugLog('PDF page count retrieved', { pageCount, pdfPath: session.pdfs[0] });

    // Kirim prompt minta input halaman
    const promptText = `Mau ambil halaman berapa dari PDF ini? (Total: ${pageCount} halaman)

Contoh format:
• *1-5* → halaman 1 sampai 5
• *1,3,7* → halaman 1, 3, dan 7 saja  
• *5* → hanya halaman 5
• *all* atau *semua* → semua halaman

Ketik *batal* untuk membatalkan`;

    debugLog('Sending page input prompt');
    const sent = await sendPrompt(sock, jid, promptText);
    session.lastPromptKey = sent?.key || null;

    // Simpan session
    const sessionKey = getSessionKey(jid, session.userId);
    sessions.set(sessionKey, session);

    debugLog('Extract flow started successfully', { 
      sessionKey, 
      expectingPages: true,
      expiresIn: '5 minutes'
    });
    
    console.log(`📄 [EXTRACT START] ${sessionKey} - waiting for pages input`);
    return true;
  } catch (error) {
    debugLog('ERROR in startPdfExtractFlow', { error: error.message });
    await sock.sendMessage(jid, {
      text: '❌ Gagal memulai proses ekstrak.',
    });
    return false;
  }
}

// ================== HANDLE COMMAND EXTRACT ==================
async function handlePdfExtractCommand(sock, jid, message, text, userId) {
  const clean = (text || '').trim().toLowerCase();
  
  debugLog('handlePdfExtractCommand ENTRY', {
    text,
    clean,
    userId,
    jid,
    hasSessions: !!sessions
  });

  if (!userId) {
    debugLog('ERROR: userId is required');
    return false;
  }

  // ===== PERBAIKAN KRUSIAL: SKIP JIKA PESAN KOSONG =====
  if (clean === '') {
    debugLog('SKIP: Empty message detected - ignoring protocol/empty messages');
    return false; // Jangan proses pesan kosong!
  }

  // Kalau sessions tidak ada, anggap tidak ada sesi → jangan error
  if (!sessions) {
    debugLog('WARNING: sessions tidak tersedia. Skip.');
    return false;
  }

  const sessionKey = getSessionKey(jid, userId);
  const s = sessions.get(sessionKey);
  
  // Cek apakah sedang menunggu input halaman untuk extract
  const waitingForPages = !!(s && s.expectingPages && Date.now() <= (s.pagesExpiresAt || 0));
  
  if (!waitingForPages) {
    debugLog('NOT waiting for pages - returning false');
    return false;
  }

  debugLog('PROCESSING extract command', { clean, sessionKey });

  // ===== PERBAIKAN: SKIP JIKA INPUT ADALAH "ex" =====
  if (clean === 'ex') {
    debugLog('SKIP: Command "ex" detected - user just started extract flow, waiting for page numbers');
    return true; // Kembalikan true untuk mencegah handler lain memproses
  }

  // Handle batal
  if (['batal', '!batal', 'cancel', '!cancel'].includes(clean)) {
    debugLog('CANCEL command detected');
    await deleteLastPrompt(sock, jid, s);
    clearSession(jid, userId);
    await sock.sendMessage(jid, { text: '❌ Ekstrak PDF dibatalkan.' });
    return true;
  }

  // Proses input halaman
  try {
    debugLog('Processing page input', { clean });
    await deleteLastPrompt(sock, jid, s);

    if (!s.pdfs || s.pdfs.length === 0) {
      debugLog('ERROR: No PDFs in session');
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
      debugLog('ERROR: Invalid page format', { input: clean });
      await sock.sendMessage(jid, {
        text: `❌ Format halaman tidak valid. Contoh: 1-5, 1,3,7, atau all\n\nTotal halaman: ${totalPages}`,
      });
      return true;
    }

    // Kirim pesan loading
    debugLog('Starting extraction process');
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
        text: `✅ Berhasil mengekstrak ${pagesToExtract.length} halaman!\nHalaman: ${pagesToExtract.join(', ')}`,
      });
      
      debugLog('Extraction successful', { pagesExtracted: pagesToExtract.length });
    } finally {
      stopTyping(sock, jid, typing);
      if (outputPath) {
        cleanupFiles([outputPath]);
      }
      clearSession(jid, userId);
    }

    return true;
  } catch (error) {
    debugLog('ERROR in extract command', { error: error.message, input: clean });
    await sock.sendMessage(jid, {
      text: '❌ Gagal mengekstrak halaman. Pastikan format halaman benar.',
    });
    clearSession(jid, userId);
    return true;
  }
}

// ================== UTIL FUNCTIONS (sama seperti sebelumnya) ==================
function parsePageInput(input, totalPages) {
  debugLog('parsePageInput called', { input, totalPages });
  
  if (!input || input === 'ex') return [];
  if (input === 'all' || input === 'semua') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set();
  const parts = input.split(',').map((part) => part.trim());

  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((num) => parseInt(num.trim()));
      if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
        return [];
      }
      for (let i = start; i <= end; i++) pages.add(i);
    } else {
      const pageNum = parseInt(part);
      if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) return [];
      pages.add(pageNum);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

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

async function extractPdfPages(pdfPath, pageNumbers) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const sourcePdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();
    const pageIndices = pageNumbers.map((num) => num - 1);
    const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
    copiedPages.forEach((page) => newPdf.addPage(page));
    const newPdfBytes = await newPdf.save();
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, `extracted_${Date.now()}.pdf`);
    fs.writeFileSync(outputPath, newPdfBytes);
    return outputPath;
  } catch (error) {
    console.error('❌ Error extracting PDF pages:', error);
    throw error;
  }
}

function hasActiveExtractSession(jid, userId) {
  if (!sessions) return false;
  const sessionKey = getSessionKey(jid, userId);
  const s = sessions.get(sessionKey);
  if (!s) return false;
  const waitingForPages = s.expectingPages && Date.now() <= (s.pagesExpiresAt || 0);
  return !!waitingForPages;
}

module.exports = {
  startPdfExtractFlow,
  handlePdfExtractCommand,
  hasActiveExtractSession,
  parsePageInput,
  getPdfPageCount,
  extractPdfPages,
};
