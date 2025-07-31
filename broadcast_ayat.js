const cron = require('node-cron');
const { getAyatHariIni } = require('./ayat_quran');
const fetch = require('node-fetch'); // tambahkan ini

let sock = null;

// ✅ Disimpan agar bisa digunakan semua fungsi
function setSocketInstance(instance) {
  sock = instance;
}

// ✅ Kirim manual untuk testing
async function kirimAyatTestKeGroup(jidGroup) {
  if (!sock) {
    console.log("❌ Socket belum tersedia!");
    return;
  }

  try {
    const res = await fetch('https://api.quran.gading.dev/surah/18/10');
    const data = await res.json();
    const ayat = data.data;

    const isi = `📖 *QS. ${ayat.surah.name.transliteration.id} : ${ayat.number.inSurah}*\n\n` +
      `${ayat.text.arab}\n\n` +
      `💬 _${ayat.translation.id}_\n\n` +
      `Sumber: api.quran.gading.dev`;

    await sock.sendMessage(jidGroup, { text: isi });
    console.log("✅ Ayat berhasil dikirim ke grup");
  } catch (err) {
    console.error("❌ Gagal kirim ayat:", err);
  }
}

// ✅ Cron harian jam 06:00
cron.schedule('29 7 * * *', async () => {
  if (!sock) return console.error('❌ Socket belum siap.');

  try {
    const ayat = await getAyatHariIni();

    const pesan = `📖 *Satu Hari Satu Ayat*\n\n`
      + `Surah *${ayat.surah}* Ayat *${ayat.ayat}*:\n\n`
      + `🕊️ _${ayat.arab}_\n\n`
      + `📘 Artinya: ${ayat.arti}\n\n`
      + `📝 *Tafsir Ringkas (As-Sa'di)*:\n${ayat.tafsir}`;

    const groupId = '120363257401506274@g.us'; // <-- ganti sesuai grupmu
    await sock.sendMessage(groupId, { text: pesan });

    console.log('✅ Ayat harian terkirim.');
  } catch (err) {
    console.error('❌ Gagal kirim ayat:', err.message);
  }
},{
 timezone: "Asia/Makassar"
});

// ✅ Ekspor semua fungsi yang dibutuhkan
module.exports = {
  setSocketInstance,
  kirimAyatTestKeGroup
};
