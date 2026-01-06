const { Coordinates, CalculationMethod, PrayerTimes } = require('adhan');
const moment = require('moment-timezone');
const axios = require('axios');

async function handleJadwalSholat(sock, m, text) {
    const chat = m.chat;
    const lcText = (text || "").toLowerCase().trim();

    // 1. CEK JIKA USER MENGIRIM PESAN LOKASI (SHARE LOCATION)
    const locationMessage = m.message?.locationMessage || m.message?.liveLocationMessage;
    
    if (locationMessage || lcText.startsWith('!sholat')) {
        try {
            let lat, lon, displayName;

            if (locationMessage) {
                // JIKA DARI SHARE LOCATION
                lat = locationMessage.degreesLatitude;
                lon = locationMessage.degreesLongitude;
                
                // Cari nama daerahnya lewat reverse geocoding
                const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
                const revRes = await axios.get(revUrl, { headers: { 'User-Agent': 'WahdahBot-AsistenUstadz' } });
                displayName = revRes.data?.display_name || "Lokasi Anda";
            } else {
                // JIKA DARI TEKS !sholat
                const daerah = lcText.replace('!sholat', '').trim();
                if (!daerah) {
                    await sock.sendMessage(chat, { text: "Silakan masukkan nama kecamatan.\nContoh: *!sholat Pattallassang*" });
                    return true;
                }

                const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(daerah)}&limit=1`;
                const searchRes = await axios.get(searchUrl, { headers: { 'User-Agent': 'WahdahBot-AsistenUstadz' } });

                if (!searchRes.data || searchRes.data.length === 0) {
                    await sock.sendMessage(chat, { text: "Kecamatan tidak ditemukan. Coba ketik lebih spesifik." });
                    return true;
                }
                lat = searchRes.data[0].lat;
                lon = searchRes.data[0].lon;
                displayName = searchRes.data[0].display_name;
            }

            // 2. HITUNG JADWAL DENGAN RUMUS WAHDAH
            const coords = new Coordinates(parseFloat(lat), parseFloat(lon));
            const params = CalculationMethod.Other();
            params.fajrAngle = 17.5; // Kriteria Wahdah
            params.ishaAngle = 18.0; // Kriteria Wahdah
            
            // Ihtiyat (Menit Pengaman) sesuai standar Wahdah
            params.methodAdjustments = { 
                dhuhr: 4, 
                maghrib: 2,
                fajr: 2,
                asr: 2,
                isha: 2 
            };

            const date = new Date();
            const p = new PrayerTimes(coords, date, params);
            
            // Format waktu ke WITA (Asia/Makassar)
            const format = (t) => moment(t).tz('Asia/Makassar').format('HH:mm');

            const hasil = `📊 *JADWAL SHOLAT (WAHDAH)*
📍 *Lokasi:* ${displayName}
📅 *Tanggal:* ${moment().format('DD/MM/YYYY')}

🌅 *Subuh:* ${format(p.fajr)}
🌞 *Dzuhur:* ${format(p.dhuhr)}
🌥️ *Ashar:* ${format(p.asr)}
🌆 *Maghrib:* ${format(p.maghrib)}
🌃 *Isya:* ${format(p.isha)}

_Waktu sudah termasuk Ihtiyat (pengaman)_`;

            await sock.sendMessage(chat, { text: hasil });
            return true;

        } catch (e) {
            console.error("ERROR SHOLAT HANDLER:", e);
            await sock.sendMessage(chat, { text: "Terjadi kesalahan sistem saat mengambil jadwal." });
            return true;
        }
    }
    return false;
}

module.exports = { handleJadwalSholat };
