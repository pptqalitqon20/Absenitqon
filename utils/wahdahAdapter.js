const WahdahRaw = require("./wahdahCalculatorRaw");
const moment = require("moment-timezone");

module.exports.calculate = (lat, lon, date = new Date(), timezone = "Asia/Makassar") => {
    
    // PAKSA date menggunakan timezone target agar tidak ikut waktu server Render
    // Kita buat string tanggal dari input, lalu bungkus dengan moment timezone
    const dateStr = moment(date).format('YYYY-MM-DD HH:mm:ss');
    const localDate = moment.tz(dateStr, timezone).toDate();

    const location = {
        latitude: lat,
        longitude: lon,
        timezone: timezone
    };

    const config = {
        fajr_angle: 17.5,
        isha_angle: 18,
        mazhab: "shafi",
        ihtiyat_fajr: 0,
        ihtiyat_dhuhr: 4,
        ihtiyat_asr: 0,
        ihtiyat_maghrib: 2,
        ihtiyat_isha: 0
    };

    return WahdahRaw.calculatePrayerTimes(location, localDate, config);
};
