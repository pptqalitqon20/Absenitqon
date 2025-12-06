// lib/rekapPekanan.js
// Rekap Hafalan Pekanan versi WhatsApp (tanpa tombol Telegram)

const { sheetsService } = require("../services/sheetsService");

// =========================
// Helper waktu Asia/Makassar
// =========================
function getNowMakassar() {
  const now = new Date();
  const makassarString = now.toLocaleString("en-US", {
    timeZone: "Asia/Makassar",
  });
  return new Date(makassarString);
}

function getBulanIndonesia(dateObj) {
  const bulanMap = {
    January: "Januari",
    February: "Februari",
    March: "Maret",
    April: "April",
    May: "Mei",
    June: "Juni",
    July: "Juli",
    August: "Agustus",
    September: "September",
    October: "Oktober",
    November: "November",
    December: "Desember",
  };
  const enName = dateObj.toLocaleString("en-US", { month: "long" });
  return bulanMap[enName] || enName;
}

function getPekanDalamBulan(dateObj) {
  // persis Python: (day-1)//7 + 1
  const day = dateObj.getDate();
  return Math.floor((day - 1) / 7) + 1;
}

// =========================
// Fungsi utama rekap pekanan
// =========================

/**
 * Mengirim rekap hafalan pekanan ke jid WhatsApp.
 * @param {import("baileys").WASocket} sock
 * @param {string} jid - chat id (m.chat)
 * @param {string} halaqahName - nama halaqah persis seperti di kolom A (baris "Halaqah ...")
 */
async function sendRekapPekanan(sock, jid, halaqahName) {
  try {
    // Kasih info sebentar
    const loadingMsg = await sock.sendMessage(jid, {
      text: "⏳ Tunggu sebentar, saya sedang membuat *Rekap Hafalan Pekanan*...",
    });

    // Ambil data sheet "Santri"
    const data = await sheetsService.getSheetValues("Santri");
    if (!data || data.length === 0) {
      await sock.sendMessage(jid, {
        text:
          "❌ Data di sheet *Santri* tidak ditemukan.\n" +
          "Silakan cek kembali Google Sheets.",
      });
      return;
    }

    const now = getNowMakassar();
    const bulan = getBulanIndonesia(now);
    const pekan = getPekanDalamBulan(now);

    let hasil = [];
    let ustadz = "-";
    let inBlock = false;
    let nomor = 1;

    for (let i = 0; i < data.length; i++) {
      const row = data[i] || [];

      // Mulai blok halaqah yang dipilih
      if (
        row[0] &&
        typeof row[0] === "string" &&
        row[0].includes("Halaqah") &&
        row[0].trim() === String(halaqahName || "").trim()
      ) {
        inBlock = true;
        ustadz = row[1] ? row[1].trim() : "-";
        continue;
      }

      // Kalau sudah di dalam blok, dan ketemu "Halaqah" berikutnya → stop
      if (
        inBlock &&
        row[0] &&
        typeof row[0] === "string" &&
        row[0].includes("Halaqah")
      ) {
        break;
      }

      // Di dalam blok halaqah, ambil baris santri
      if (
        inBlock &&
        row[0] &&
        String(row[0]).trim() &&
        String(row[0]).trim() !== "Nama Santri"
      ) {
        const nama = String(row[0]).trim();

        // Kolom -kolom sesuai rekap.py:
        // total_hafalan = row[1]
        // rentang_juz   = row[2]
        // hafalan_baru  = row[5]
        // tahsin        = row[6]
        // ujian         = row[7]
        // simaan        = row[8]
        // murojaah      = row[11]
        // status_asli   = row[12]
        let hafalan_baru = row[5] || "0";
        const tahsin = row[6] || "";
        const ujian = row[7] || "";
        const simaan = row[8] || "";
        const status_asli_raw = row[12] || "-";

        const total_hafalan = row[1] || "?";
        const rentang_juz = row[2] || "?";

        let status_asli = String(status_asli_raw).trim();

        // Sesuaikan isi hafalan_baru sesuai status
        if (status_asli === "Tahsin") {
          hafalan_baru = tahsin;
        } else if (status_asli === "Persiapan Ujian") {
          hafalan_baru = ujian;
        } else if (status_asli === "Persiapan Sima'an") {
          hafalan_baru = simaan;
        } else if (status_asli === "Muroja'ah") {
          hafalan_baru = row[11] || "";
        }

        const emojiMap = {
          "Tercapai": "✅ Tercapai",
          "Tahsin": "🖊️ Tahsin",
          "Tidak tercapai": "❌ Tidak tercapai",
          "Sakit": "🤒 Sakit",
          "Izin": "📆 Izin",
          "Persiapan Ujian": "📚 Persiapan Ujian",
          "Persiapan Sima'an": "🎯 Persiapan Sima'an",
          "Muroja'ah": "🔁 Muroja'ah",
          "": "♻️ -",
          "-": "♻️ -",
        };

        const status =
          emojiMap[status_asli] || `♻️ ${status_asli || "-"}`;

        hasil.push(
          `${nomor}️⃣ ${nama}\n` +
            `   📘 Hafalan Baru: ${hafalan_baru || "-"}\n` +
            `   📌 Status: ${status}\n` +
            `   📖 Total Hafalan: ${total_hafalan} (${rentang_juz})`
        );
        nomor += 1;
      }
    }

    if (hasil.length === 0) {
      await sock.sendMessage(jid, {
        text:
          `❌ Tidak ditemukan data santri untuk halaqah: *${halaqahName}*.\n` +
          `Pastikan nama halaqah di WA sama persis dengan di sheet *Santri*.`,
      });
      return;
    }

    const pesan =
      `📖 *Rekap Hafalan Pekanan*\n` +
      `👥 Halaqah: ${halaqahName}\n` +
      `🧑‍🏫 Ustadz: ${ustadz}\n` +
      `🗓️ Pekan: ${pekan} | 📅 Bulan: ${bulan}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      hasil.join("\n━━━━━━━━━━━━━━━━━━━━\n") +
      `\n━━━━━━━━━━━━━━━━━━━━\n` +
      `✨ Barakallahu fiikum. Semangat terus dalam menjaga Al-Qur'an!`;

    // Hapus pesan loading, lalu kirim rekap
    if (loadingMsg?.key) {
      await sock.sendMessage(jid, { delete: loadingMsg.key });
    }

    await sock.sendMessage(jid, { text: pesan });
  } catch (err) {
    console.error("❌ Error sendRekapPekanan:", err);
    await sock.sendMessage(jid, {
      text:
        "❌ Terjadi kesalahan saat membuat rekap hafalan pekanan.\n" +
        (err.message || err),
    });
  }
}

module.exports = {
  sendRekapPekanan,
};
