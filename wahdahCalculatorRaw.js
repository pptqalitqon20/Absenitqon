"use strict";

/**
 * Wahdah Calculator – RAW PORT FROM WEBPACK CHUNK 9686
 * DO NOT MODIFY LOGIC / FORMULA
 * Only adapted to Node.js environment
 */

class WahdahCalculatorRaw {

    // ==========================
    // MAIN API
    // ==========================
    static calculatePrayerTimes(location, date, config) {
    const latitude  = location.latitude;
    const longitude = location.longitude;
    const timezone  = location.timezone;

    const astroTimes = this.calculateAstronomicalTimes(
        latitude, longitude, date, timezone, config
    );

    // 1. Terapkan Ihtiyat mentah (masih ada detiknya)
    const ihtiyatApplied = this.applyIhtiyat(astroTimes, config);

    // 2. Hitung Imsak & Duha dari waktu Subuh & Terbit mentah
    const rawImsak = this.shiftTime(ihtiyatApplied.fajr, -10);
    const rawDuha  = this.shiftTime(ihtiyatApplied.sunrise, 15);

    // 3. FINAL ROUNDING (Logika Mix Wahdah)
    return {
        // Kelompok Bawah (Floor)
        imsak:   this.floorMinute(rawImsak),
        fajr:    this.floorMinute(ihtiyatApplied.fajr),
        duha:    this.floorMinute(rawDuha),
        sunrise: this.floorMinute(ihtiyatApplied.sunrise), // Tambahan untuk referensi

        // Kelompok Atas (Ceil)
        dhuhr:   this.ceilMinute(ihtiyatApplied.dhuhr),
        asr:     this.ceilMinute(ihtiyatApplied.asr),
        maghrib: this.ceilMinute(ihtiyatApplied.maghrib),
        isha:    this.ceilMinute(ihtiyatApplied.isha)
    };
}

    // ==========================
    // CORE ASTRONOMY
    // ==========================
    static calculateAstronomicalTimes(lat, lon, date, timezone, config) {
        const t = (this.getJulianDay(date) - 2451545) / 36525;

        const solarDecl = this.getSolarDeclination(t);
        const eqTime    = this.getEquationOfTime(t);

        const latRad = lat * this.DEGREES_TO_RADIANS;
        const decRad = solarDecl * this.DEGREES_TO_RADIANS;

        const transit = 12 - lon / 15 - eqTime / 60;

        const fajrAngle = -config.fajr_angle;
        const ishaAngle = -config.isha_angle;

        const rawTimes = {
            transit,
            sunrise: this.calculatePrayerTime(latRad, decRad, -0.833, transit, false),
            sunset:  this.calculatePrayerTime(latRad, decRad, -0.833, transit, true),
            fajr:    this.calculatePrayerTime(latRad, decRad, fajrAngle, transit, false),
            isha:    this.calculatePrayerTime(latRad, decRad, ishaAngle, transit, true),
            asr:     this.calculateAsrTime(latRad, decRad, transit, config.mazhab)
        };

        const tzOffset = this.getTimezoneOffset(timezone, date);
        const shifted  = {};

        Object.keys(rawTimes).forEach(k => {
            shifted[k] = rawTimes[k] + tzOffset;
        });

        return {
            fajr:    this.timeToDate(date, shifted.fajr),
            sunrise:this.timeToDate(date, shifted.sunrise),
            dhuhr:  this.timeToDate(date, shifted.transit),
            asr:    this.timeToDate(date, shifted.asr),
            maghrib:this.timeToDate(date, shifted.sunset),
            isha:   this.timeToDate(date, shifted.isha)
        };
    }

    // ==========================
    // IHTIYAT
    // ==========================
    static applyIhtiyat(times, config) {
        return {
            fajr:    this.shiftTime(times.fajr,    config.ihtiyat_fajr),
            sunrise:times.sunrise,
            dhuhr:  this.shiftTime(times.dhuhr,    config.ihtiyat_dhuhr),
            asr:    this.shiftTime(times.asr,      config.ihtiyat_asr),
            maghrib:this.shiftTime(times.maghrib,  config.ihtiyat_maghrib),
            isha:   this.shiftTime(times.isha,     config.ihtiyat_isha)
        };
    }

    // ==========================
    // ROUNDING
    // ==========================
    static floorMinute(t) {
    return new Date(
        t.getFullYear(),
        t.getMonth(),
        t.getDate(),
        t.getHours(),
        t.getMinutes(),
        0,
        0
    );
}

// Menambah menit jika ada detik (12:12:01 -> 12:13)
static ceilMinute(t) {
    const sec = t.getSeconds();
    const ms = t.getMilliseconds();
    
    if (sec > 0 || ms > 0) {
        return new Date(
            t.getFullYear(),
            t.getMonth(),
            t.getDate(),
            t.getHours(),
            t.getMinutes() + 1,
            0,
            0
        );
    }
    return t;
}
    // ==========================
    // ASTRONOMICAL FORMULAS
    // ==========================
    static getJulianDay(date) {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();

        const a = Math.floor((14 - m) / 12);
        const y2 = y - a;

        return (
            d +
            Math.floor((153 * (m + 12 * a - 3) + 2) / 5) +
            365 * y2 +
            Math.floor(y2 / 4) -
            Math.floor(y2 / 100) +
            Math.floor(y2 / 400) +
            1721119
        );
    }

    static getSolarDeclination(t) {
        const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);

        const C =
            (1.914602 - t * (0.004817 + 0.000014 * t)) *
                Math.sin(M * this.DEGREES_TO_RADIANS) +
            (0.019993 - 0.000101 * t) *
                Math.sin(2 * M * this.DEGREES_TO_RADIANS) +
            0.000289 * Math.sin(3 * M * this.DEGREES_TO_RADIANS);

        const L =
            (280.46646 + t * (36000.76983 + 0.0003032 * t) + C) %
            360;

        return (
            Math.asin(
                Math.sin(
                    (23.4392911 -
                        0.0130042 * t -
                        0.00000016 * t * t +
                        0.000000504 * t * t * t) *
                        this.DEGREES_TO_RADIANS
                ) *
                    Math.sin(L * this.DEGREES_TO_RADIANS)
            ) * this.RADIANS_TO_DEGREES
        );
    }

    static getEquationOfTime(t) {
        const L0 =
            (280.46646 + t * (36000.76983 + 0.0003032 * t)) *
            this.DEGREES_TO_RADIANS;

        const M =
            (357.52911 + t * (35999.05029 - 0.0001537 * t)) *
            this.DEGREES_TO_RADIANS;

        const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

        const y =
            Math.tan(
                ((23.4392911 -
                    0.0130042 * t -
                    0.00000016 * t * t +
                    0.000000504 * t * t * t) /
                    2) *
                    this.DEGREES_TO_RADIANS
            ) ** 2;

        return (
            (y * Math.sin(2 * L0) -
                2 * e * Math.sin(M) +
                4 * e * y * Math.sin(M) * Math.cos(2 * L0) -
                0.5 * y * y * Math.sin(4 * L0) -
                1.25 * e * e * Math.sin(2 * M)) *
            this.RADIANS_TO_DEGREES *
            4
        );
    }

    static calculatePrayerTime(lat, dec, angle, transit, isAfterNoon) {
        const cosH =
            (Math.sin(angle * this.DEGREES_TO_RADIANS) -
                Math.sin(lat) * Math.sin(dec)) /
            (Math.cos(lat) * Math.cos(dec));

        if (Math.abs(cosH) > 1) {
            return isAfterNoon ? transit + 1.5 : transit - 1.5;
        }

        const H =
            (Math.acos(cosH) * this.RADIANS_TO_DEGREES) / 15;

        return isAfterNoon ? transit + H : transit - H;
    }

    static calculateAsrTime(lat, dec, transit, mazhab) {
        const factor = mazhab === "hanafi" ? 2 : 1;

        const cosH =
            (Math.sin(
                Math.atan(
                    1 / (factor + Math.tan(Math.abs(lat - dec)))
                )
            ) -
                Math.sin(lat) * Math.sin(dec)) /
            (Math.cos(lat) * Math.cos(dec));

        if (Math.abs(cosH) > 1) return transit + 3;

        return (
            transit +
            (Math.acos(cosH) * this.RADIANS_TO_DEGREES) / 15
        );
    }

    // ==========================
    // DATE HELPERS
    // ==========================
    static timeToDate(date, time) {
        let t = time;

        while (t < 0) t += 24;
        while (t >= 24) t -= 24;

        const h = Math.floor(t);
        const mFloat = (t - h) * 60;
        const m = Math.floor(mFloat);
        const s = Math.round((mFloat - m) * 60);

        return new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            h,
            m,
            s,
            0
        );
    }

    static shiftTime(date, minutes) {
        return new Date(date.getTime() + minutes * 60000);
    }

    static getTimezoneOffset(timezone) {
    if (timezone === "Asia/Jakarta") return 7;
    if (timezone === "Asia/Makassar") return 8;
    if (timezone === "Asia/Jayapura") return 9;

    // fallback (aman)
    const now = new Date();
    const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    return (local - utc) / 3600000;
}

}

// ==========================
// CONSTANTS (FROM CHUNK 9686)
// ==========================
WahdahCalculatorRaw.DEGREES_TO_RADIANS = Math.PI / 180;
WahdahCalculatorRaw.RADIANS_TO_DEGREES = 180 / Math.PI;

module.exports = WahdahCalculatorRaw;
