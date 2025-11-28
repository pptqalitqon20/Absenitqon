// handlers/quranHandler.js
// Versi khusus PPTQ: HANYA MUROTTAL (!audio)

const axios = require('axios');
// Masih pakai startTyping / stopTyping / deleteLastPrompt dari fitur PDF,
// supaya tampilan "menyiapkan audio..." bisa rapi.
const { startTyping, stopTyping, deleteLastPrompt } = require('./pdfMergeHandler');

/**
 * Normalisasi URL Google Drive:
 * - https://drive.google.com/file/d/FILE_ID/view?...
 *   -> https://docs.google.com/uc?export=download&id=FILE_ID
 * - Kalau sudah docs.google.com/uc, dibiarkan saja.
 */
function normalizeDriveUrl(url) {
  if (!url) return url;
  if (url.includes('docs.google.com/uc')) return url;

  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return url;

  const fileId = m[1];
  return `https://docs.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Mapping nomor surah -> lokasi audio di Google Drive
 *
 * Cukup isi driveUrl dengan LINK PENUH Google Drive (format /file/d/.../view),
 * nanti akan otomatis di-convert menjadi link download langsung.
 *
 * format:
 *  - "opus"  -> dikirim sebagai voice note (ptt)
 *  - "mp3"   -> dikirim sebagai audio biasa
 */
const CHAPTER_AUDIO = {
  1: {
    // Contoh: Surah 1 (Al-Fatihah)
    driveUrl: 'https://drive.google.com/file/d/1evyVHroG9u-GRN2A0CwjQMjhAGqM-SJi/view?usp=drivesdk',
    format: 'opus', // karena file-mu memang .opus
  },
  109: {
    driveUrl: 'https://drive.google.com/file/d/18YIlWci-zan7CfZ9hEW2kfZo4im4pOfF/view?usp=drivesdk',
    format: 'opus',
   },
  110: {
    driveUrl: 'https://drive.google.com/file/d/1eb7gWN-NuWcBmFDdxWVTySLQUhJeBeT2/view?usp=drivesdk',
    format: 'opus',
   },
};

/**
 * handleQuranCommand
 * Menangani perintah:
 *  - !audio 114
 *  - !audio:114
 *  - !audio 1
 *
 * @param {WASocket} sock
 * @param {string} jid
 * @param {string} text
 * @returns {Promise<boolean>} apakah command ini sudah dikonsumsi handler
 */
async function forceDeleteMessage(sock, jid, key) {
  if (!key) return;

  const delKey = {
    remoteJid: jid,
    id: key.id,
    fromMe: true, // 👈 WAJIB supaya WhatsApp izinkan hapus
  };

  try {
    await sock.sendMessage(jid, { delete: delKey });
  } catch (e) {
    console.error("❌ Gagal hapus pesan:", e.message);
  }
}
async function handleQuranCommand(sock, jid, text) {
  console.log('[QURAN] handler masuk.');

  let typing = null;
  let loadingMsg = null;

  // Normalisasi teks
  const cleanText = (text || '').trim().toLowerCase();

  // Bentuk-bentuk yang kita dukung:
  // "!audio 114", "!audio:114", "!audio 1"
  if (!cleanText.startsWith('!audio')) {
    return false; // bukan perintah murottal
  }

  try {
    // Ambil argumen setelah '!audio'
    // contoh:
    //  - "!audio 114"  -> "114"
    //  - "!audio:114"  -> ":114"
    //  - "!audio 1"    -> "1"
    let rawArg = cleanText.slice('!audio'.length).trim(); // bisa kosong / "114" / ":114" / "1"

    if (!rawArg) {
      // Tidak ada nomor surah → kirim panduan singkat
      await sock.sendMessage(jid, {
        text:
          '🎧 *Download Murottal Qur\'an*\n\n' +
          'Format yang didukung saat ini:\n' +
          '- `!audio 1`   → Surah Al-Fatihah\n' +
          '- `!audio 114` → Surah An-Naas (kalau sudah diisi di sistem)\n\n' +
          '_Audio dibacakan oleh Qori default: Mishary Rasyid Al-Afasy._',
      });
      return true;
    }

    // Kalau user pakai "!audio:114", jadikan "114"
    if (rawArg.startsWith(':')) rawArg = rawArg.slice(1).trim();

    // Ambil token pertama saja ("114" dari "114 blabla")
    const firstToken = rawArg.split(/\s+/)[0]; // "114"
    const chapterStr = firstToken.split(':')[0]; // antisipasi kalau ada "114:7"
    const chapterNumber = parseInt(chapterStr, 10);

    if (isNaN(chapterNumber) || chapterNumber < 1 || chapterNumber > 114) {
      await sock.sendMessage(jid, {
        text: '❌ Nomor surah tidak valid. Gunakan angka 1–114. Contoh: `!audio 1` atau `!audio 114`.',
      });
      return true;
    }

    // Cek apakah surah ini sudah di-mapping
    const entry = CHAPTER_AUDIO[chapterNumber];
    if (!entry || !entry.driveUrl) {
      await sock.sendMessage(jid, {
        text:
          `❌ Murottal untuk Surah ke-${chapterNumber} belum tersedia di sistem.\n` +
          'Silahkan hubungi admin untuk menambahkan audio di Google Drive.',
      });
      return true;
    }

    const audioUrl = normalizeDriveUrl(entry.driveUrl);
    const format = (entry.format || '').toLowerCase();

    // Mulai indikator typing + pesan loading
    typing = startTyping(sock, jid);
    loadingMsg = await sock.sendMessage(jid, {
      text: `⏳ Menyiapkan murottal Surah ke-${chapterNumber} (Qori default)...`,
    });

    // Deteksi mimetype & ptt (voice note)
    let mimetype = 'audio/mpeg';
    let ptt = false;

    const urlLC = audioUrl.toLowerCase();

    if (
      format.includes('ogg') ||
      format.includes('opus') ||
      urlLC.endsWith('.ogg') ||
      urlLC.endsWith('.opus')
    ) {
      mimetype = 'audio/ogg; codecs=opus';
      ptt = true; // kirim sebagai voice note
    } else if (format.includes('mp3') || urlLC.endsWith('.mp3')) {
      mimetype = 'audio/mpeg';
    } else if (
      format.includes('m4a') ||
      format.includes('aac') ||
      format.includes('mp4') ||
      urlLC.endsWith('.m4a') ||
      urlLC.endsWith('.aac') ||
      urlLC.endsWith('.mp4')
    ) {
      mimetype = 'audio/mp4';
    }

    try {
      // Ambil data audio dari URL (Google Drive → docs.uc)
      const resp = await axios.get(audioUrl, { responseType: 'arraybuffer' });

      // Hapus pesan loading sebelum kirim audio
      if (loadingMsg?.key) {
        await forceDeleteMessage(sock, jid, loadingMsg.key);
        loadingMsg = null;
      }

      // Kirim sebagai audio (bisa jadi voice note jika ptt = true)
      await sock.sendMessage(jid, {
        audio: Buffer.from(resp.data),
        mimetype,
        ptt,
        caption: `✅ Murottal Surah ke-${chapterNumber}\n_Qori: Mishary Rasyid Al-Afasy_`,
      });
    } catch (err) {
      console.error(
        '❌ Gagal unduh/kirim audio:',
        err?.response?.status,
        err?.message
      );

      // Fallback: kirim sebagai dokumen
      try {
        const resp = await axios.get(audioUrl, { responseType: 'arraybuffer' });

        if (loadingMsg?.key) {
          await deleteLastPrompt(sock, jid, { lastPromptKey: loadingMsg.key });
          loadingMsg = null;
        }

        await sock.sendMessage(jid, {
          document: Buffer.from(resp.data),
          mimetype,
          fileName: `surah-${chapterNumber}.${format || 'audio'}`,
          caption: `📎 Audio Surah ke-${chapterNumber} (dikirim sebagai dokumen)\n_Qori: Mishary Rasyid Al-Afasy_`,
        });
      } catch {
        await sock.sendMessage(jid, {
          text: '❌ Audio siap, tetapi pengiriman gagal. Coba lagi beberapa saat.',
        });
      }
    }

    return true;
  } catch (e) {
    console.error('❌ KESALAHAN FATAL MUROTTAL:', e && e.stack ? e.stack : e);

    let errorMessage =
      '❌ Terjadi kesalahan pada fitur murottal. Mohon coba lagi beberapa saat.';
    if (e?.message?.includes('tidak tersedia')) {
      errorMessage = e.message;
    }

    await sock.sendMessage(jid, { text: errorMessage });
    return true;
  } finally {
    if (typing) stopTyping(sock, jid, typing);

    // Kalau masih ada loadingMsg dan belum terhapus (karena error), hapus di sini
    if (loadingMsg?.key) {
      try {
        await deleteLastPrompt(sock, jid, { lastPromptKey: loadingMsg.key });
      } catch {}
    }
  }
}

// ====== Untuk kompatibilitas dengan kode lama ======

async function handleQuranFollowUp(sock, jid, text) {
  return false;
}

function isAwaitingAudioPick(jid) {
  return false;
}

module.exports = {
  handleQuranCommand,
  handleQuranFollowUp,
  isAwaitingAudioPick,
};
