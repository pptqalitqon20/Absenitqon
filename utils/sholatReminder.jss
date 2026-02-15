const cron = require('node-cron');
const moment = require('moment-timezone');
const WahdahCalc = require("./wahdahAdapter");

// Konfigurasi Grup & Lokasi
const LIST_GRUP_SHOLAT = [
    {
        jid: [
            "120363257401506274@g.us",
            "120363338899809079@g.us",
            "120363402240876404@g.us",
            "120363316345967061@g.us",
            "120363319279651441@g.us",
            "120363336646688396@g.us",
            "120363402265855979@g.us",
            "120363372081198560@g.us",
            "120363335472675332@g.us",
            "120363337126633853@g.us",
            "120363319657062224@g.us",
            "120363206234002294@g.us"
        ],
        lat: -5.1738,
        lon: 119.5373,
        name: "Ba'do'-Ba'do', Pattallassang, Gowa, Sulawesi Selatan, Sulawesi, 90562, Indonesia"
    },
];

function initSholatReminder(sock) {
    // Jalankan setiap menit
    cron.schedule('* * * * *', async () => {
        const now = new Date();

        for (const grup of LIST_GRUP_SHOLAT) {
            // Tentukan timezone berdasarkan Longitude
            let tz = "Asia/Makassar";
            if (grup.lon < 110) tz = "Asia/Jakarta";
            else if (grup.lon > 127.5) tz = "Asia/Jayapura";

            const jadwal = WahdahCalc.calculate(grup.lat, grup.lon, now, tz);
            const sekarang = moment().tz(tz).format('HH:mm');

            // Daftar waktu yang akan dicek
            const daftarWaktu = [
                { nama: "Subuh", waktu: jadwal.fajr },
                { nama: "Dzuhur", waktu: jadwal.dhuhr },
                { nama: "Ashar", waktu: jadwal.asr },
                { nama: "Maghrib", waktu: jadwal.maghrib },
                { nama: "Isya", waktu: jadwal.isha }
            ];

            for (const sholat of daftarWaktu) {
                // Hitung 10 menit sebelum
                const waktuNotif = moment(sholat.waktu).subtract(10, 'minutes').format('HH:mm');

                if (sekarang === waktuNotif) {
                    const pesan = `🔔 *PENGINGAT SHOLAT 📍(${grup.name})*\n\n` +
                        `> Sepuluh menit lagi menuju waktu *${sholat.nama}* untuk wilayah ${grup.name} dan sekitarnya.\n\n` +
                        `⏰ Waktu ${sholat.nama}: *${moment(sholat.waktu).tz(tz).format('HH:mm')}*\n\n` +
                        `_“Sesungguhnya sholat itu adalah fardhu yang ditentukan waktunya atas orang-orang yang beriman.” (QS. An-Nisa: 103)_\n\n` +
                        `*📋Jadwal Diambil Langsung Dari Wahdah App*\n` +
                        `*Kalau Mau Cek Jadwal Daerah Lain Ketik !sholat nama daerah, misal:* \n👉🏻_!sholat Ba'do-Ba'do Pattallassang Gowa_`;

                    // kirim ke semua JID dalam array
                    for (const jid of grup.jid) {
                        try {
                            await sock.sendMessage(jid, { text: pesan });
                            // Tambahkan delay 2 detik agar tidak dianggap spam
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        } catch (err) {
                            console.error(`Gagal kirim ke ${jid}:`, err);
                        }
                    }
                }
            }
        }
    }); // <-- Ini tadi yang kurang (penutup cron.schedule)
}

module.exports = { initSholatReminder };
