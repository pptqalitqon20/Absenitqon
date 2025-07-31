const axios = require('axios');
const fs = require('fs');

const stateFile = './lib/ayat_state.json';
const tafsirAll = require('./data/as_sadi.json');

async function getAyatHariIni() {
  let index = 0;
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile));
    index = state.index || 0;
  }

  const { surah, ayat } = await hitungSurahAyat(index);

  const quranRes = await axios.get(`https://api.quran.gading.dev/surah/${surah}/${ayat}`);

  fs.writeFileSync(stateFile, JSON.stringify({ index: index + 1 }));

  return {
    surah: quranRes.data.data.surah.name.transliteration.id,
    arab: quranRes.data.data.text.arab,
    arti: quranRes.data.data.translation.id,
    ayat: ayat,
    tafsir: tafsirAll[surah]?.[ayat] || "Tafsir tidak tersedia."
  };
}

async function hitungSurahAyat(indexGlobal) {
  const surahList = [0, 7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52];
  let total = 0;

  for (let i = 1; i < surahList.length; i++) {
    if (indexGlobal < total + surahList[i]) {
      return { surah: i, ayat: indexGlobal - total + 1 };
    }
    total += surahList[i];
  }
  return { surah: 1, ayat: 1 };
}

module.exports = { getAyatHariIni };
