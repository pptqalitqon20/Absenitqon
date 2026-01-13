const moment = require('moment-timezone');
const axios = require('axios');
const WahdahCalc = require("../utils/wahdahAdapter"); // adapter kamu

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

            // 2. HITUNG JADWAL DENGAN KALKULATOR WAHDAH
            const date = new Date();
            const jadwal = WahdahCalc.calculate(parseFloat(lat), parseFloat(lon), date);
            
            // Format waktu ke WITA (Asia/Makassar)
            const format = (t) => moment(t).tz('Asia/Makassar').format('HH:mm');

            const hasil = `📊 *JADWAL SHOLAT (WAHDAH ISLAMIYYAH)*
📍 *Lokasi:* ${displayName}
📅 *Tanggal:* ${moment().format('DD/MM/YYYY')}

🌅 *Imsak:* ${format(jadwal.imsak)}
🌅 *Subuh:* ${format(jadwal.fajr)}
🌞 *Dzuhur:* ${format(jadwal.dhuhr)}
🌥️ *Ashar:* ${format(jadwal.asr)}
🌆 *Maghrib:* ${format(jadwal.maghrib)}
🌃 *Isya:* ${format(jadwal.isha)}

========================================
_Sudut Subuh: 17.5° | Sudut Isya: 18° | Ihtiyat: Dzuhur +4 menit, Maghrib +2 menit_`;

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
