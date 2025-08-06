const axios = require('axios');
const fs = require('fs');
const path = require('path');

const stateFile = path.join(__dirname, 'ayat_state.json');

// Jumlah ayat per surah (manual atau dari metadata)
const surahList = [0, 7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52 /* ... sampai 114 */];

async function getAyatHariIni() {
  let index = 0;
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile));
    index = state.index || 0;
  }
  console.log(`📖 Membaca index dari: ${stateFile}`);
  const { surah, ayat } = await hitungSurahAyat(index);

  fs.writeFileSync(stateFile, JSON.stringify({ index: index + 1 }));
  console.log(`✅ Index ayat tersimpan: ${index + 1}`);
  
  const quranPath = path.join(__dirname, '../data/quran', `${surah}.json`);
  const terjemahPath = path.join(__dirname, '../data/terjemah', `${surah}.json`);
  const tafsirPath = path.join(__dirname, '../data/tafsir', `${surah}.json`);
  
  const arabData = JSON.parse(fs.readFileSync(quranPath));
  const terjemahData = JSON.parse(fs.readFileSync(terjemahPath));
  const tafsirData = JSON.parse(fs.readFileSync(tafsirPath));

  const arab = arabData.chapter.find(a => a.verse === ayat)?.text || 'Teks Arab tidak ditemukan';
  const arti = terjemahData.chapter.find(a => a.verse === ayat)?.text || 'Terjemahan tidak tersedia';
  const tafsir = tafsirData.ayahs.find(t => t.ayah === ayat)?.text || 'Tafsir tidak tersedia';

  return {
    surah: `Surah ${surah}`,
    ayat,
    arab,
    arti,
    tafsir
  };
}

async function hitungSurahAyat(indexGlobal) {
  let total = 0;

  for (let i = 1; i < surahList.length; i++) {
    if (indexGlobal < total + surahList[i]) {
      return { surah: i, ayat: indexGlobal - total + 1 };
    }
    total += surahList[i];
  }

  return { surah: 1, ayat: 1 }; // default fallback
}

module.exports = { getAyatHariIni };
