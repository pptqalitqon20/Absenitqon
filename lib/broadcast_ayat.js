const cron = require('node-cron');
const { getAyatHariIni } = require('./ayat_quran');
const fetch = require('node-fetch');

let sock = null;

function setSocketInstance(instance) {
  sock = instance;
}

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

// 🕖 Jam 7 pagi setiap hari
cron.schedule('0 7 * * 1-6', async () => {
  if (!sock) return console.error('❌ Socket belum siap.');

  const pesan = `*Jadwal Mengawas Zikir Pagi*\n\n` +
    `📅 *Senin*\n|  Ustadz Rafli\n|  Ustadz Jihadi\n\n` +
    `📅 *Selasa*\n|  Ustadz Thohir\n|  Ustadz Ubaidillah\n\n` +
    `📅 *Rabu*\n|  Ustadz Fahril\n|  Ustadz Suhartono\n\n` +
    `📅 *Kamis*\n|  Ustadz Irwan\n|  Ustadz Sumardi\n\n` +
    `📅 *Jumat*\n|  Ustadz Mansur\n|  Ustadz Syakur\n\n` +
    `📅 *Sabtu*\n|  Ustadz Syuaib\n|  Ustadz Bilal\n\n` +
    `-----\n📌 *Catatan Tugas:*\nSantri diarahkan untuk:\n• Memeriksa kerapian kamar\n• Menghukum santri yang terlambat\n`;

  try {
    const groupId = '120363257401506274@g.us'; // ganti sesuai grup
    await sock.sendMessage(groupId, { text: pesan });
    console.log('✅ Jadwal Zikir Pagi terkirim');
  } catch (err) {
    console.error('❌ Gagal kirim Zikir Pagi:', err.message);
  }
}, {
  timezone: "Asia/Makassar"
});

// 🕖 Jam 7 malam, hanya hari Ahad sampai Jumat (0–5)
cron.schedule('0 19 * * 0-5', async () => {
  if (!sock) return console.error('❌ Socket belum siap.');

  const pesan = `📅 *JADWAL MENGAWAS MALAM PARA USTADZ*  \n──────────────────  \n\n` +
    `🌙 *Malam Senin*  \n👳Ustadz @6285298514896\n\n` +
    `🌙 *Malam Selasa*  \n👳Ustadz @6281230062637\n\n` +
    `🌙 *Malam Rabu*  \n👳Ustadz @6282393144499\n👳Ustadz @6289523852957\n\n` +
    `🌙 *Malam Kamis*  \n👳Ustadz @923215393771\n👳Nuaim\n\n` +
    `🌙 *Malam Jum'at*  \n👳Ustadz @6285256470195\n👳Fauzan Arif\n\n` +
    `🌙 *Malam Sabtu*  \n👳 Ustadz @6285396224242\n👳 Ustadz @6281342607796\n\n` +
    `──────────────────  \n✨ *Semoga menjadi amal jariyah yang ikhlas.*  \n📿 *Barakallahu fiikum*`;

  try {
    const groupId = '120363257401506274@g.us'; // ganti sesuai grup
    await sock.sendMessage(groupId, { text: pesan });
    console.log('✅ Jadwal Mengawas Malam terkirim');
  } catch (err) {
    console.error('❌ Gagal kirim jadwal malam:', err.message);
  }
}, {
  timezone: "Asia/Makassar"
});

module.exports = {
  setSocketInstance,
  kirimAyatTestKeGroup
};
