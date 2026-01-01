// handlers/pdfMergeHandler.js
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('baileys');
const { PDFDocument } = require('pdf-lib');

function normalizeLid(jid = '') {
  return jid.split(':')[0].split('@')[0];
}
function getSessionKey(jid, userId) {
  return `${jid}:${normalizeLid(userId || '')}`;
}

const sessions = new Map();
function startTyping(sock, jid) {
  sock.sendPresenceUpdate('composing', jid);
  const interval = setInterval(() => {
    sock.sendPresenceUpdate('composing', jid);
  }, 5000);
  return interval;
}
function stopTyping(sock, jid, interval) {
  if (interval) clearInterval(interval);
  sock.sendPresenceUpdate('paused', jid);
}
async function deleteLastPrompt(sock, jid, s) {
  try {
    if (s?.lastPromptKey) {
      await sock.sendMessage(jid, { delete: s.lastPromptKey });
      s.lastPromptKey = null;
    }
  } catch {}
}
async function sendPrompt(sock, jid, text) {
  return await sock.sendMessage(jid, { text });
}
function hasActivePdfMergeSession(jid, userId) {
  const s = sessions.get(getSessionKey(jid, userId));
  if (!s) return false;
  if (s.expectingChoice && Date.now() > (s.choiceExpiresAt || 0)) {
    sessions.delete(getSessionKey(jid, userId));
    return false;
  }
  return true;
}
function getSession(jid, userId) {
  return sessions.get(getSessionKey(jid, userId));
}
function setSessionAction(jid, userId, pdfPath) {
  const key = getSessionKey(jid, userId);
  const s = sessions.get(key) || { pdfs: [] };

  // Jika ini PDF pertama, kita mulai sesi pilihan aksi G/Ex
  if (s.pdfs.length === 0) {
    s.pdfs.push(pdfPath);
    s.expectingAction = true; // NEW STATE: Menunggu G/Ex
    s.actionExpiresAt = Date.now() + 5 * 60 * 1000; // 5 menit
  } else {
    // Jika sudah ada PDF, berarti ini lanjutan dari sesi Merge (C/L)
    s.pdfs.push(pdfPath);
  }
  
  sessions.set(key, s);
  return s;
}

function clearSession(jid, userId) {
  const s = getSession(jid, userId);
  if (s?.pdfs?.length) cleanupFiles(s.pdfs); // Pastikan file dihapus
  sessions.delete(getSessionKey(jid, userId));
}
function cleanupFiles(arr = []) {
  for (const f of arr) {
    try { fs.existsSync(f) && fs.unlinkSync(f); } catch {}
  }
}
async function downloadAndSavePdf(documentMessage, filename) {
  try {
    const stream = await downloadContentFromMessage(documentMessage, 'document');
    const filePath = path.join(__dirname, '../temp', filename);
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(filePath);
      stream.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });
    return filePath;
  } catch (err) {
    console.error('❌ downloadAndSavePdf error:', err);
    return null;
  }
}
async function mergePdfFiles(paths = []) {
  const merged = await PDFDocument.create();
  for (const p of paths) {
    const bytes = fs.readFileSync(p);
    const src = await PDFDocument.load(bytes);
    const copy = await merged.copyPages(src, src.getPageIndices());
    copy.forEach(pg => merged.addPage(pg));
  }
  return await merged.save(); // Uint8Array
}
const ACTION_PROMPT_TEXT = `Afwan, mau saya apakan PDF ini yah?

Balas salah satu:
• *G* → Gabungkan dengan PDF lain (*Merge*)
• *Ex* → Ambil beberapa halaman (*Extract*)
• *W* → Ubah PDF ke Word (*PDF → DOCX*)
*(Waktu sesi akan habis dalam 5 menit atau ketik *batal* jika ingin membatalkan)*`;


const MERGE_PROMPT_TEXT = (count) => (
`Afwan, tolong kirimkan PDF lagi yang mau digabungkan!

Balas salah satu:
• *C* → cukup, gabungkan sekarang
• *L* → lanjut kirim PDF lagi

Ketik *batal* jika ingin membatalkan

(PDF terkumpul: ${count})`
);


// Ubah handlePdfMerge
async function handlePdfMerge(sock, jid, message, text = '', userId) {
  try {
    if (!userId) return;
    const docs = [];
    if (message?.documentMessage?.mimetype?.includes('application/pdf')) {
      docs.push(message.documentMessage);
    }
    const q = message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (q?.documentMessage?.mimetype?.includes('application/pdf')) {
      docs.push(q.documentMessage);
    }
    if (docs.length === 0) return; // bukan PDF
    
    // Asumsi hanya PDF pertama yang diproses untuk memulai/melanjutkan sesi
    const docToProcess = docs[0]; 
    const s = getSession(jid, userId);

    const saved = [];
    // Jika sedang sesi merge, proses semua PDF yang baru dikirim/quote
    if (s?.expectingMerge) {
      for (let i = 0; i < docs.length; i++) {
        const fname = `merge_${Date.now()}_${i}.pdf`;
        const p = await downloadAndSavePdf(docs[i], fname);
        if (p) saved.push(p);
      }
      if (saved.length > 0) {
        s.pdfs.push(...saved);
        // Hapus prompt C/L lama kalau ada
        await deleteLastPrompt(sock, jid, s);
        const sent = await sendPrompt(sock, jid, MERGE_PROMPT_TEXT(s.pdfs.length));
        s.lastPromptKey = sent?.key || null;
        sessions.set(getSessionKey(jid, userId), s);
      }
      return;
    }
    
    // Jika tidak ada sesi merge aktif, kita mulai sesi aksi (G/Ex) dengan PDF pertama
    if (!s || (!s.expectingAction && !s.expectingPages && !s.expectingMerge)) {
      const fname = `temp_${Date.now()}.pdf`;
      const p = await downloadAndSavePdf(docToProcess, fname);
      if (!p) {
        await sock.sendMessage(jid, { text: '❌ Gagal mengunduh PDF. Coba lagi.' });
        return;
      }
      const newS = setSessionAction(jid, userId, p);
      
      console.log('📎 [SET ACTION SESSION]', getSessionKey(jid, userId), 'pdfs:', newS.pdfs.length);

      // hapus prompt lama kalau ada
      await deleteLastPrompt(sock, jid, newS);
      const sent = await sendPrompt(sock, jid, ACTION_PROMPT_TEXT);
      newS.lastPromptKey = sent?.key || null;
      sessions.set(getSessionKey(jid, userId), newS);
    }
    
  } catch (err) {
    console.error('❌ Error handlePdfMerge:', err);
    await sock.sendMessage(jid, { text: '❌ Terjadi kesalahan saat membaca PDF.' });
  }
}

// Ubah handlePdfMergeCommand
async function handlePdfMergeCommand(sock, jid, message, text, userId) {
  const clean = (text || '').trim().toLowerCase();
  if (!userId) return false;

  const s = getSession(jid, userId);

  // --- NEW: Handle pilihan Aksi G/Ex ---
  const waitingForAction = !!(s && s.expectingAction && Date.now() <= (s.actionExpiresAt || 0));
  if (waitingForAction) {
    if (['g', 'gabung'].includes(clean)) {
      // Pilihan G: Lanjut ke alur Merge
      await deleteLastPrompt(sock, jid, s);
      s.expectingAction = false;
      s.expectingMerge = true; // NEW STATE: Menunggu C/L
      s.choiceExpiresAt = Date.now() + 5 * 60 * 1000;
      sessions.set(getSessionKey(jid, userId), s);
      const sent = await sendPrompt(sock, jid, MERGE_PROMPT_TEXT(s.pdfs.length));
      s.lastPromptKey = sent?.key || null;
      return true;
    }
    if (['ex', 'extract', 'ambil'].includes(clean)) {
      // Pilihan Ex: Panggil handler ekstrak
      const { startPdfExtractFlow } = require('./pdfExtractHandler');
      return await startPdfExtractFlow(sock, jid, s);
    }
    if (['w', 'word'].includes(clean)) {
    const { startPdfToWord } = require('./pdfToWordHandler');
    return await startPdfToWord(sock, jid, s);
  }
    return false;
  }
  // --- END NEW: Handle pilihan Aksi G/Ex ---
  
  // --- EXISTING: Handle pilihan Merge C/L ---
  const waitingForMerge = !!(s && s.expectingMerge && Date.now() <= (s.choiceExpiresAt || 0));
  if (!waitingForMerge) return false;
  
  // Logika C/L (seperti kode Anda yang sudah ada, tapi pakai MERGE_PROMPT_TEXT)
  if (['l', 'lanjut', 'lanjutkan'].includes(clean)) {
    await deleteLastPrompt(sock, jid, s);
    s.expectingMerge = true; // Tetap true, hanya set prompt
    const sent = await sock.sendMessage(jid, {
      text: 'Silakan kirim PDF berikutnya. Jika sudah cukup, balas *C* untuk digabung.'
    });
    return true;
  }
  if (['c', 'cukup', 'combine', 'gabung'].includes(clean)) {
    // Logika penggabungan PDF
    // ... (gunakan kode gabung yang sudah Anda buat)
    await deleteLastPrompt(sock, jid, s);
    s.expectingMerge = false;
    s.choiceExpiresAt = 0;
    sessions.set(getSessionKey(jid, userId), s);
    const loadingMsg = await sock.sendMessage(jid, {
      text: '⏳ Proses penggabungan mungkin agak lama. Silakan tunggu sambil berdzikir 😊'
    });

    const typing = startTyping(sock, jid);
    try {
      const outBytes = await mergePdfFiles(s.pdfs);
      const outPath = path.join(__dirname, `../temp/Merged-${Date.now()}.pdf`);
      fs.writeFileSync(outPath, outBytes);

      await sock.sendMessage(jid, {
        document: { url: outPath },
        mimetype: 'application/pdf',
        fileName: `Merged-${Date.now()}.pdf`,
      });
      if (loadingMsg?.key) {
        await sock.sendMessage(jid, { delete: loadingMsg.key });
      }
      await sock.sendMessage(jid, { text: '✅ Selesai. Barakallahu fiik!' });
      cleanupFiles(s.pdfs);
      try { fs.unlinkSync(outPath); } catch {}

    } catch (e) {
      console.error('❌ Merge PDF failed:', e);
      try {
        await sock.sendMessage(jid, { text: '❌ Gagal menggabungkan PDF.' });
      } catch {}
    } finally {
      stopTyping(sock, jid, typing);
      clearSession(jid, userId);
    }

    return true;
  }

  return false;
}
function isPdfSessionActive(s) {
    if (!s) return false;
    const expiresAt = s.actionExpiresAt || s.choiceExpiresAt;
    // Cek apakah sedang menunggu G/Ex, C/L, atau input halaman (Ex), dan belum kedaluwarsa
    return (s.expectingAction || s.expectingMerge || s.expectingPages) && 
           Date.now() <= (expiresAt || 0);
}

async function handleCancelCommand(sock, jid, text, userId) {
    const clean = (text || '').trim().toLowerCase();
    if (!['batal', '!batal', 'cancel', '!cancel'].includes(clean)) {
        return false; // Bukan perintah batal
    }

    const s = getSession(jid, userId);
    if (!isPdfSessionActive(s)) {
        return false; // Tidak ada sesi aktif yang bisa dibatalkan
    }

    try {
        await deleteLastPrompt(sock, jid, s);
        clearSession(jid, userId);
        await sock.sendMessage(jid, {
            text: '❌ Sesi PDF dibatalkan. Silakan kirim ulang PDF jika Anda ingin memulai yang baru.'
        });
        console.log(`[CANCEL] Sesi PDF dibatalkan untuk ${getSessionKey(jid, userId)}`);
    } catch (e) {
        console.error('❌ Gagal membatalkan sesi:', e);
    }
    
    return true; // Berhasil menangani perintah batal
}
// Tambahkan export untuk utilitas
module.exports = {
  handlePdfMerge,
  handlePdfMergeCommand,
  handleCancelCommand,
  hasActivePdfMergeSession,
  getSessionKey,
  getSession,
  clearSession,
  cleanupFiles,
  startTyping,
  stopTyping,
  sendPrompt,
  deleteLastPrompt,
  downloadAndSavePdf,
  sessions,          // 🔥 INI YANG PENTING
};
