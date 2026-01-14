const moment = require('moment-timezone');
const axios = require('axios');
const WahdahCalc = require("../utils/wahdahAdapter");

async function handleJadwalSholat(sock, m, text) {
    const chat = m.chat;
    const lcText = (text || "").toLowerCase().trim();
    const locationMessage = m.message?.locationMessage || m.message?.liveLocationMessage;

    if (locationMessage || lcText.startsWith('!sholat')) {
        try {
            let lat, lon, displayName;
            let targetDate = new Date(); // Default hari ini

            // 1. CEK APAKAH USER MINTA JADWAL BESOK
            if (lcText.includes("besok")) {
                targetDate = moment().add(1, 'days').toDate();
            }

            // 2. AMBIL KOORDINAT
            if (locationMessage) {
                lat = locationMessage.degreesLatitude;
                lon = locationMessage.degreesLongitude;
                
                const revRes = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, { 
                    headers: { 'User-Agent': 'WahdahBot' },
                    timeout: 5000 
                });
                displayName = revRes.data?.display_name || "Lokasi Anda";
            } else {
                // Bersihkan perintah "!sholat" dan kata "besok" untuk mengambil nama daerah
                let daerah = lcText.replace('!sholat', '').replace('besok', '').trim();
                
                if (!daerah) {
                    await sock.sendMessage(chat, { text: "Contoh: *!sholat Makassar* atau *!sholat besok Jakarta*" });
                    return true;
                }

                const searchRes = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(daerah)}&limit=1`, { 
                    headers: { 'User-Agent': 'WahdahBot' },
                    timeout: 5000 
                });

                if (!searchRes.data?.[0]) {
                    await sock.sendMessage(chat, { text: "Lokasi tidak ditemukan. Coba ketik nama kecamatan/kota dengan benar." });
                    return true;
                }
                lat = parseFloat(searchRes.data[0].lat);
                lon = parseFloat(searchRes.data[0].lon);
                displayName = searchRes.data[0].display_name;
            }

            // 3. PENENTUAN TIMEZONE OTOMATIS
            let tz = "Asia/Makassar"; 
            let labelTz = "WITA";
            
            if (lon < 110) {
                tz = "Asia/Jakarta";
                labelTz = "WIB";
            } else if (lon > 127.5) {
                tz = "Asia/Jayapura";
                labelTz = "WIT";
            }

            // 4. HITUNG JADWAL
            const jadwal = WahdahCalc.calculate(lat, lon, targetDate, tz);
            const formatTz = (t) => moment(t).tz(tz).format('HH:mm');

            // 5. SUSUN PESAN
            const tglString = moment(targetDate).tz(tz).format('DD/MM/YYYY');
            const statusHari = lcText.includes("besok") ? " (ESOK HARI)" : "";

            const hasil = `📊 *JADWAL SHOLAT WAHDAH${statusHari}*
📍 *Lokasi:* ${displayName}
📅 *Tanggal:* ${tglString}
⏰ *Zona Waktu:* ${labelTz} (GMT${tz === "Asia/Jakarta" ? "+7" : tz === "Asia/Makassar" ? "+8" : "+9"})

🌅 *Imsak:* ${formatTz(jadwal.imsak)}
🌅 *Subuh:* ${formatTz(jadwal.fajr)}
🌞 *Dzuhur:* ${formatTz(jadwal.dhuhr)}
🌥️ *Ashar:* ${formatTz(jadwal.asr)}
🌆 *Maghrib:* ${formatTz(jadwal.maghrib)}
🌃 *Isya:* ${formatTz(jadwal.isha)}

==================================
_Sudut Subuh: 17.5° | Sudut Isya: 18°_
_Ihtiyat: Dzuhur +4m, Maghrib +2m_
_Ketik *!sholat besok [nama daerah]* untuk jadwal esok hari._`;

            await sock.sendMessage(chat, { text: hasil });
            return true;

        } catch (e) {
            console.error("ERROR SHOLAT HANDLER:", e);
            await sock.sendMessage(chat, { text: "Terjadi kesalahan teknis saat mengambil jadwal." });
            return true;
        }
    }
    return false;
}

module.exports = { handleJadwalSholat };
