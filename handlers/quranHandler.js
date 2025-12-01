// handlers/quranHandler.js
// Murottal dari API EQuran.id (tanpa simpan file lokal)
//
// Cara pakai di chat WhatsApp:
//   !audio 1        -> putar full surat Al-Fatihah
//   !audio 97       -> putar full surat Al-Qadr
//   !audio 97 3     -> ayat 3 dari surat 97 (Al-Qadr)
//   !audio 97:3     -> sama: ayat 3 dari surat 97
//
//   !qori           -> tampilkan qori aktif + daftar qori
//   !qori 3         -> ganti ke qori kode 03 (Sudais)
//   !qori 05        -> ganti ke qori kode 05 (Misyari Afasi)
//
// Catatan:
// - Audio full surat diambil dari endpoint: GET https://equran.id/api/v2/surat
// - Audio per ayat diambil dari endpoint: GET https://equran.id/api/v2/surat/{nomor}
// - Konfigurasi qori hanya disimpan di memory (kalau server restart, balik ke default)

const axios = require('axios');

const EQURAN_BASE = 'https://equran.id/api/v2';

// Daftar qori berdasarkan kode di EQuran.id
const QARI_MAP = {
  "01": "Abdullah Al-Juhany",
  "02": "Abdul-Muhsin Al-Qasim",
  "03": "Abdurrahman as-Sudais",
  "04": "Ibrahim Al-Dossari",
  "05": "Misyari Rasyid Al-Afasi",
  "06": "Yasser Al-Dosari",
};

// Qori default yang sedang dipakai (bisa diubah lewat !qori)
let CURRENT_QARI = "05"; // awal: Misyari Afasi

// ==============================
// CACHE DAFTAR SURAT
// ==============================
let SURAH_CACHE = null;
let SURAH_CACHE_TIME = 0;
const SURAH_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 jam

async function getSurahList() {
  const now = Date.now();
  if (SURAH_CACHE && now - SURAH_CACHE_TIME < SURAH_CACHE_TTL) {
    return SURAH_CACHE;
  }

  const url = `${EQURAN_BASE}/surat`;
  const resp = await axios.get(url, { timeout: 20000 });

  // Response v2: { code, message, data: [...] }
  const list = resp.data?.data;
  if (!Array.isArray(list)) {
    throw new Error('Struktur respons EQuran /surat tidak sesuai (data bukan array)');
  }

  SURAH_CACHE = list;
  SURAH_CACHE_TIME = now;
  return list;
}

async function getSurahInfoByNumber(num) {
  const list = await getSurahList();
  return list.find((s) => String(s.nomor) === String(num));
}

// ==============================
// HELPER PILIH AUDIO QARI
// ==============================
function chooseQariAudio(audioMap, qariCode) {
  if (!audioMap || typeof audioMap !== 'object') return null;

  // Kalau ada qari yang diminta eksplisit
  if (qariCode && audioMap[qariCode]) {
    return audioMap[qariCode];
  }

  // Pakai qari global aktif
  if (CURRENT_QARI && audioMap[CURRENT_QARI]) {
    return audioMap[CURRENT_QARI];
  }

  // Fallback: ambil pertama yang ada
  const values = Object.values(audioMap);
  if (!values.length) return null;
  return values[0];
}

// ==============================
// PARSER ARGUMEN !audio
// ==============================
// Bentuk yang didukung:
//   "!audio 97"        -> { surah: 97, ayat: null }
//   "!audio 97 3"      -> { surah: 97, ayat: 3 }
//   "!audio 97:3"      -> { surah: 97, ayat: 3 }
//   "!audio 97-3"      -> { surah: 97, ayat: 3 }
function parseAudioArgs(text) {
  if (!text) return null;

  const withoutCmd = text.replace(/^!audio\b/i, '').trim();
  if (!withoutCmd) return null;

  // Pola: "97:3" atau "97-3"
  let m = withoutCmd.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if (m) {
    return {
      surah: parseInt(m[1], 10),
      ayat: parseInt(m[2], 10),
    };
  }

  // Pola: "97 3"
  m = withoutCmd.match(/^(\d+)\s+(\d+)$/);
  if (m) {
    return {
      surah: parseInt(m[1], 10),
      ayat: parseInt(m[2], 10),
    };
  }

  // Pola: "97"
  m = withoutCmd.match(/^(\d+)$/);
  if (m) {
    return {
      surah: parseInt(m[1], 10),
      ayat: null,
    };
  }

  return null;
}

// ==============================
// KIRIM AUDIO FULL SURAT
// ==============================
async function sendFullSurahAudio(sock, jid, surahNumber, qariCode) {
  try {
    const info = await getSurahInfoByNumber(surahNumber);
    if (!info) {
      await sock.sendMessage(jid, {
        text: `❌ Nomor surat *${surahNumber}* tidak ditemukan di EQuran.id`,
      });
      return true;
    }

    const audioMap = info.audioFull || info.audio;
    const audioUrl = chooseQariAudio(audioMap, qariCode);

    if (!audioUrl) {
      await sock.sendMessage(jid, {
        text: `❌ Audio full surat *${surahNumber} - ${info.namaLatin || ''}* tidak tersedia di API.`,
      });
      return true;
    }

    const qari = qariCode || CURRENT_QARI;
    const qariName = QARI_MAP[qari] || 'Qari tidak diketahui';

    const caption =
      `📖 Murottal Surat *${info.namaLatin || ''}* (No. ${info.nomor})\n` +
      `Qari: *${qariName}* (kode ${qari}).`;

    await sock.sendMessage(jid, {
      audio: { url: audioUrl },
      mimetype: 'audio/mpeg',
      ptt: false,
      caption,
    });

    return true;
  } catch (err) {
    console.error('[QuranHandler] Error sendFullSurahAudio:', err?.message || err);
    await sock.sendMessage(jid, {
      text: '❌ Gagal mengambil audio full surat dari EQuran.id. Coba lagi beberapa saat.',
    });
    return true;
  }
}

// ==============================
// KIRIM AUDIO PER AYAT
// ==============================
// Catatan penting:
// Struktur detail surat di v2 kira-kira: { code, message, data: { ..., ayat: [ { nomorAyat, ... , audio: { "01": "...", ... } } ] } }
// Kalau nanti field-nya beda (misal nama property bukan "audio"), cukup perbaiki di blok audioMap di bawah.
async function sendAyatAudio(sock, jid, surahNumber, ayatNumber, qariCode) {
  try {
    const url = `${EQURAN_BASE}/surat/${surahNumber}`;
    const resp = await axios.get(url, { timeout: 20000 });

    // Bisa jadi resp.data = { code, message, data: {...} } atau langsung { ... }
    const root = resp.data;
    const surahData = root.data || root;

    const ayatList = surahData.ayat || surahData.ayatList;
    if (!Array.isArray(ayatList)) {
      console.error('[QuranHandler] Struktur detail surat tidak mengandung array ayat:', surahData);
      await sock.sendMessage(jid, {
        text:
          '❌ API EQuran.id tidak mengembalikan daftar ayat seperti yang diharapkan.\n' +
          'Silakan cek log server untuk menyesuaikan field audio per ayat.',
      });
      return true;
    }

    const ayatObj = ayatList.find(
      (a) =>
        String(a.nomorAyat || a.nomor || a.ayat) === String(ayatNumber)
    );

    if (!ayatObj) {
      await sock.sendMessage(jid, {
        text: `❌ Ayat ke-*${ayatNumber}* tidak ditemukan pada surat *${surahNumber}*.`,
      });
      return true;
    }

    // Asumsi: ayatObj.audio = { "01": "url-qari1.mp3", ... }
    const audioMap =
      ayatObj.audio ||
      ayatObj.audioFull ||
      ayatObj.audioAyat ||
      null;

    const audioUrl = chooseQariAudio(audioMap, qariCode);

    if (!audioUrl) {
      console.error('[QuranHandler] audioMap per ayat tidak ditemukan:', ayatObj);
      await sock.sendMessage(jid, {
        text:
          '❌ Audio per ayat tidak ditemukan pada response API.\n' +
          'Cek log server untuk melihat struktur field audio di dalam objek ayat.',
      });
      return true;
    }

    const qari = qariCode || CURRENT_QARI;
    const qariName = QARI_MAP[qari] || 'Qari tidak diketahui';

    const caption =
      `📖 Murottal Ayat *${ayatNumber}* dari Surat *${surahData.namaLatin || ''}* (No. ${surahData.nomor || surahNumber})\n` +
      `Qari: *${qariName}* (kode ${qari}).`;

    await sock.sendMessage(jid, {
      audio: { url: audioUrl },
      mimetype: 'audio/mpeg',
      ptt: false,
      caption,
    });

    return true;
  } catch (err) {
    console.error('[QuranHandler] Error sendAyatAudio:', err?.message || err);
    await sock.sendMessage(jid, {
      text: '❌ Gagal mengambil audio ayat dari EQuran.id. Coba lagi beberapa saat.',
    });
    return true;
  }
}

// ==============================
// HANDLER PILIH QORI: !qori ...
// ==============================
//
// Cara pakai di chat:
//   !qori            -> tampilkan qori sekarang + daftar qori
//   !qori 3         -> ganti ke qori kode 03 (Sudais)
//   !qori 05        -> ganti ke qori kode 05 (Misyari Afasi)
async function handleQoriCommand(sock, jid, text) {
  const trimmed = (text || '').trim();
  if (!/^!qo?ri\b/i.test(trimmed)) {
    // bukan perintah !qori / !qari
    return false;
  }

  const parts = trimmed.split(/\s+/);
  const arg = parts[1]; // misal "3" atau "05"

  // Jika tidak ada argumen: tampilkan info saja
  if (!arg) {
    let list = Object.entries(QARI_MAP)
      .map(([kode, nama]) => {
        const mark = kode === CURRENT_QARI ? '✅' : '▫️';
        return `${mark} *${kode}* — ${nama}`;
      })
      .join('\n');

    await sock.sendMessage(jid, {
      text:
        `🎙 *Pengaturan Qori Murottal*\n\n` +
        `Saat ini qori yang dipakai: *${QARI_MAP[CURRENT_QARI] || 'tidak diketahui'}* (kode ${CURRENT_QARI}).\n\n` +
        `Untuk mengubah qori, kirim contoh:\n` +
        `•  \`!qori 5\`\n` +
        `•  \`!qori 03\`\n\n` +
        `Daftar qori yang tersedia:\n` +
        list,
    });
    return true;
  }

  // Normalisasi argumen menjadi "01".."06"
  let kode = arg.replace(/\D/g, ''); // ambil hanya angka
  if (!kode) {
    await sock.sendMessage(jid, {
      text: '⚠️ Format tidak dikenal. Contoh: `!qori 5` atau `!qori 03`.',
    });
    return true;
  }

  if (kode.length === 1) kode = `0${kode}`;

  if (!QARI_MAP[kode]) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ Kode qori *${kode}* tidak tersedia.\n` +
        `Silakan pilih salah satu dari: ${Object.keys(QARI_MAP).join(', ')}`,
    });
    return true;
  }

  CURRENT_QARI = kode;

  await sock.sendMessage(jid, {
    text:
      `✅ Qori murottal diubah menjadi:\n` +
      `*${QARI_MAP[kode]}* (kode ${kode}).\n\n` +
      `Sekarang semua perintah *!audio* akan memakai qori ini.`,
  });

  return true;
}

// ==============================
// HANDLER UTAMA: !audio ...
// ==============================
async function handleQuranCommand(sock, jid, text /*, m */) {
  const parsed = parseAudioArgs(text);
  if (!parsed) {
    // Bukan format yang kita dukung, biarkan handler lain yang urus
    return false;
  }

  const { surah, ayat } = parsed;

  if (!surah || surah < 1 || surah > 114) {
    await sock.sendMessage(jid, {
      text: '⚠️ Format: *!audio [surat]* atau *!audio [surat] [ayat]*\nContoh: `!audio 97` atau `!audio 97 3`',
    });
    return true;
  }

  if (!ayat) {
    // Full surat - pakai CURRENT_QARI
    return await sendFullSurahAudio(sock, jid, surah, CURRENT_QARI);
  }

  // Per ayat - pakai CURRENT_QARI
  return await sendAyatAudio(sock, jid, surah, ayat, CURRENT_QARI);
}

// ==============================
// STUB: !saveaudio (tidak dipakai lagi)
// ==============================
// Di index/messageHandler antum mungkin masih panggil handleSaveAudioCommand,
// jadi di sini kita buat versi ringan agar tidak error.
async function handleSaveAudioCommand(sock, m) {
  const rawText =
    (m && m.body) ||
    (m && m.message && (m.message.conversation || m.message.extendedTextMessage?.text)) ||
    '';

  const text = String(rawText || '').trim().toLowerCase();
  if (!/^!saveaudio\b/.test(text)) {
    // Bukan perintah !saveaudio, biarkan handler lain
    return false;
  }

  const jid = m.chat || m.key?.remoteJid;

  await sock.sendMessage(jid, {
    text:
      'ℹ️ Sekarang bot mengambil murottal langsung dari *API EQuran.id*.\n' +
      'Perintah *!saveaudio* tidak digunakan lagi.',
  });

  return true;
}

module.exports = {
  handleSaveAudioCommand,
  handleQuranCommand,
  handleQoriCommand,
};
