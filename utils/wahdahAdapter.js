const WahdahRaw = require("./wahdahCalculatorRaw");

module.exports.calculate = (lat, lon, date = new Date()) => {

    // ⚠️ PASTIKAN DATE ASLI JS
    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    const location = {
        latitude: lat,
        longitude: lon,
        timezone: "Asia/Makassar"
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

    return WahdahRaw.calculatePrayerTimes(location, date, config);
};
