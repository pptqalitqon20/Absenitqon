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
    const ayat = await getAyatHariIni();

    const isi = `📖 *${ayat.surah} : ${ayat.ayat}*\n\n` +
      `${ayat.arab}\n\n` +
      `💬 _${ayat.arti}_\n\n` +
      `📝 *Tafsir As Sa'di:* ${ayat.tafsir}`;

    await sock.sendMessage(jidGroup, { text: isi });
    console.log("✅ Ayat berhasil dikirim ke grup");
  } catch (err) {
    console.error("❌ Gagal kirim ayat:", err);
  }
}


// 🕖 Jam 7 pagi setiap hari
cron.schedule('0 8 * * 1-6', async () => {
  if (!sock) return console.error('❌ Socket belum siap.');

  const pesan = `*Jadwal Mengawas Zikir Pagi*\n\n` +
    `📅 *Senin*\n|  Ustadz Rafli\n|  Ustadz Jihadi\n\n` +
    `📅 *Selasa*\n|  Ustadz Thohir\n|  Ustadz Ubaidillah\n\n` +
    `📅 *Rabu*\n|  Ustadz Fahril\n|  Ustadz Suhartono\n\n` +
    `📅 *Kamis*\n|  Ustadz Irwan\n|  Ustadz Ayyub\n\n` +
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
    `🌙 *Malam Senin*  \n👳Ustadz Laode Muh Fahril\n\n` +
    `🌙 *Malam Selasa*  \n👳Ustadz Muhammad Rafli\n\n` +
    `🌙 *Malam Rabu*  \n👳Ustadz Muhammad Tahir\n👳Ustadz Ubaidillah\n\n` +
    `🌙 *Malam Kamis*  \n👳Ustadz Syuaib\n👳Nuaim\n\n` +
    `🌙 *Malam Jum'at*  \n👳Ustadz Ayyub\n👳Fauzan Arif\n\n` +
    `🌙 *Malam Sabtu*  \n👳 Ustadz Mansur\n👳 Ustadz Bilal\n\n` +
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

// 🕠 Kirim Ayat Harian jam 05:30 pagi setiap hari
cron.schedule('*/5 * * * *', async () => {
  if (!sock || sock.ws?.readyState !== 1) {
    return console.error('❌ Socket belum siap atau belum terhubung.');
  }

  try {
    const groupIds = [
      '120363257401506274@g.us', // Grup 1
      '120363418764822826@g.us', // Grup 2
      // tambahkan ID grup lainnya di sini
    ];

    for (const groupId of groupIds) {
      try {
        console.log(`📤 Mengirim ayat ke: ${groupId}`);
        await kirimAyatTestKeGroup(groupId);
        console.log(`✅ Sukses kirim ke: ${groupId}`);
      } catch (err) {
        console.error(`❌ Gagal kirim ke ${groupId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Gagal menjalankan pengiriman ayat:', err.message);
  }
}, {
  timezone: 'Asia/Makassar'
});
