const cron = require('node-cron');
const moment = require('moment-timezone');
const WahdahCalc = require("./wahdahAdapter");

// Konfigurasi Grup & Lokasi
// Masukkan JID grup dan koordinatnya di sini
const LIST_GRUP_SHOLAT = [
    {
        jid: "120363420619018107@g.us", // Ganti dengan JID grup Anda
        lat: -5.1738,           // Contoh: Makassar
        lon: 119.5373,
        name: "Makassar"
    },
    // Tambahkan grup lain jika ada
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
                    const pesan = `🔔 *PENGINGAT SHOLAT (${grup.name})*\n\n` +
                        `Sepuluh menit lagi menuju waktu *${sholat.nama}* untuk wilayah ${grup.name} dan sekitarnya.\n\n` +
                        `⏰ Waktu ${sholat.nama}: *${moment(sholat.waktu).tz(tz).format('HH:mm')}*\n\n` +
                        `_“Sesungguhnya sholat itu adalah fardhu yang ditentukan waktunya atas orang-orang yang beriman.” (QS. An-Nisa: 103)_`;

                    await sock.sendMessage(grup.jid, { text: pesan });
                }
            }
        }
    });
}

module.exports = { initSholatReminder };
