// lib/hafalan.js
// Flow "Lihat Hafalan Santri" versi LIST MESSAGE,
// tapi tetap memakai logika lama untuk menampilkan daftar hafalan per halaqah.

const { sheetsService } = require("../services/sheetsService");
const { sendButtonMsg } = require("./sendButton");

// Session per chat (jid)
const hafalanSessions = new Map();

// =====================
// Helper: format tanggal (Asia/Makassar)
// =====================
function getTanggalHariIni() {
  const hariMap = {
    Minggu: "Ahad", // supaya tetap pakai "Ahad"
    Senin: "Senin",
    Selasa: "Selasa",
    Rabu: "Rabu",
    Kamis: "Kamis",
    Jumat: "Jumat",
    Sabtu: "Sabtu",
  };

  const now = new Date();

  const opsi = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar", // kunci utama: paksa timezone ke WITA
  };

  // Contoh hasil: "Selasa, 2 Desember 2025"
  const formatted = now.toLocaleDateString("id-ID", opsi);

  // Pisahkan hari & tanggal, supaya bisa ganti "Minggu" -> "Ahad"
  const [hariRaw, rest] = formatted.split(", ");
  const hariFix = hariMap[hariRaw] || hariRaw;

  return `${hariFix}, ${rest}`;
}

// ======================================
// Helper: ambil daftar halaqah dari sheet
// (adaptasi dari hafalan.js lama)
// ======================================
function fetchHalaqahData(sheetValues) {
  const daftarHalaqah = [];
  const halaqahMap = new Map(); // kode unik

  for (let i = 0; i < sheetValues.length; i++) {
    const baris = sheetValues[i];
    if (baris && typeof baris[0] === "string" && baris[0].includes("Halaqah")) {
      const namaHalaqah = baris[0].trim();
      const namaUstadz = baris[1] ? baris[1].trim() : "Belum terisi";

      let kode = "";
      const words = namaHalaqah.split(" ");
      if (words.length > 1) {
        kode =
          (words[words.length - 2] || "").substring(0, 1) +
          (words[words.length - 1] || "").substring(0, 1);
      } else {
        kode = namaHalaqah.substring(0, 2);
      }
      kode = kode.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 3);

      let uniqueCode = kode;
      let counter = 1;
      while (halaqahMap.has(uniqueCode.toLowerCase())) {
        uniqueCode = kode + counter;
        counter++;
      }

      halaqahMap.set(uniqueCode.toLowerCase(), i);
      daftarHalaqah.push({
        kode: uniqueCode,
        nama: namaHalaqah,
        ustadz: namaUstadz,
        rowIndex: i,
      });
    }
  }

  return daftarHalaqah;
}

// ======================================
// 1) MULAI FLOW: user klik "Lihat Hafalan Santri"
//    → kirim teks "tunggu", ambil data, hapus teks awal, lalu kirim List
// ======================================
async function startHafalanFlow(sock, jid) {
  if (!jid || typeof jid !== "string") {
    throw new Error("startHafalanFlow: argumen jid tidak valid");
  }

  let loadingMsg = null;

  try {
    // 1. Kirim pesan loading
    loadingMsg = await sock.sendMessage(jid, {
      text: "⏳ Tunggu Yah, Saya Sedang mengambil daftar halaqah dari Google Sheets...",
    });

    // 2. Ambil data dari Google Sheets
    const sheetValues = await sheetsService.getSheetValues("Santri");
    if (!sheetValues || sheetValues.length < 5) {
      // Hapus pesan loading kalau ada
      if (loadingMsg?.key) {
        await sock.sendMessage(jid, { delete: loadingMsg.key });
      }

      await sock.sendMessage(jid, {
        text:
          "❌ Data Santri tidak ditemukan atau terlalu sedikit.\n" +
          "Silakan cek kembali sheet *Santri* di Google Sheets.",
      });
      return;
    }

    const daftarHalaqah = fetchHalaqahData(sheetValues);
    if (!daftarHalaqah.length) {
      if (loadingMsg?.key) {
        await sock.sendMessage(jid, { delete: loadingMsg.key });
      }

      await sock.sendMessage(jid, {
        text: "❌ Afwan tidak ada data halaqah ditemukan di Google Sheets.",
      });
      return;
    }

    // 3. Simpan session untuk dipakai di handleHafalanSelection
    hafalanSessions.set(jid, {
      sheetData: sheetValues,
      halaqahList: daftarHalaqah,
    });

    const rows = daftarHalaqah.map((h) => ({
      title: h.nama, // "Halaqah Ja'far bin Abi Thalib"
      description: `Ustadz: ${h.ustadz} | Kode: ${h.kode}`,
      id: `hafalan_halaqah:${h.kode}`,
    }));

    const params = {
      title: "Pilih Halaqah",
      sections: [
        {
          title: "Daftar Halaqah",
          rows,
        },
      ],
    };

    const text =
      "📖 *Lihat Hafalan Santri*\n\n" +
      "⏭️Silakan pilih halaqah yang ingin Anda lihat hafalannya melalui tombol *Daftar Halaqah* di bawah ini.";

    // 4. Hapus pesan loading sebelum kirim list
    if (loadingMsg?.key) {
      await sock.sendMessage(jid, { delete: loadingMsg.key });
    }

    // 5. Kirim pesan + tombol List
    await sendButtonMsg(
      sock,
      jid,
      {
        text,
        footer: "PPTQ AL-ITQON",
        buttons: [
          {
            buttonId: "hafalan_halaqah_list",
            type: 2,
            buttonText: { displayText: "📋 Daftar Halaqah" },
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify(params),
            },
          },
        ],
        headerType: 1,
      },
      {}
    );
  } catch (err) {
    console.error("❌ startHafalanFlow error:", err);

    // Kalau error, hapus loading kalau masih ada
    if (loadingMsg?.key) {
      await sock.sendMessage(jid, { delete: loadingMsg.key });
    }

    await sock.sendMessage(jid, {
      text:
        "❌ Terjadi kesalahan saat mengambil data halaqah dari Google Sheets.\n" +
        (err.message || err),
    });
  }
}

// ======================================
// 2) LANJUTAN: user pilih salah satu halaqah di LIST
//    → tampilkan daftar hafalan santri (logika lama)
// ======================================
async function handleHafalanSelection(sock, m, kode) {
  const jid = m.chat || m.key?.remoteJid;
  if (!jid) return;

  const session = hafalanSessions.get(jid);
  if (!session) {
    await sock.sendMessage(jid, {
      text:
        "⚠️ Session halaqah tidak ditemukan.\n" +
        "Silakan ulangi perintah *Lihat Hafalan Santri* dari menu.",
    });
    return;
  }

  const { sheetData, halaqahList } = session;
  const selected = halaqahList.find(
    (h) => h.kode.toLowerCase() === String(kode || "").toLowerCase()
  );

  if (!selected) {
    await sock.sendMessage(jid, {
      text:
        `❌ Halaqah dengan kode *${kode}* tidak ditemukan di session.\n` +
        "Silakan ulangi perintah *Lihat Hafalan Santri*.",
    });
    return;
  }

  try {
    const barisAwal = selected.rowIndex;
    const namaHalaqah = sheetData[barisAwal][0].trim();
    const namaUstadz = sheetData[barisAwal][1]
      ? sheetData[barisAwal][1].trim()
      : "Belum terisi";
    const tanggalHariIni = getTanggalHariIni();
    let jumlahSantri = 0;

    let pesan =
      `👥 *${namaHalaqah}*\n` +
      `*👳🏻‍♂️ Ustadz:* ${namaUstadz}\n` +
      `*📌 Jumlah Santri:* {JML} orang\n` +
      `🗓️ ${tanggalHariIni}\n\n`;

    const barisSantriStart = barisAwal + 2;

    for (let i = barisSantriStart; i < barisAwal + 15; i++) {
      if (i >= sheetData.length) break;

      const row = sheetData[i];
      if (!row || !row[0] || !row[0].trim()) continue;

      const namaSantri = row[0];
      const hafalan = row[1] ? row[1].trim() : "-";
      const juz = row[2] ? row[2].trim() : "-";

      pesan +=
        `👤 *${namaSantri}*\n` +
        `  Hafalan: ${hafalan}\n` +
        `  Juz: ${juz}\n\n`;
      jumlahSantri += 1;
    }

    pesan = pesan.replace("{JML}", String(jumlahSantri));
    pesan +=
      "\n===================\n" +
      "Ketik *👉menu👈* untuk kembali ke menu utama.";

    await sock.sendMessage(jid, { text: pesan });

    // Kalau mau, session bisa dihapus setelah satu kali tampil:
    // hafalanSessions.delete(jid);
  } catch (e) {
    console.error("❌ Error handleHafalanSelection:", e);
    await sock.sendMessage(jid, {
      text: "❌ Terjadi kesalahan saat mengambil detail data halaqah.",
    });
  }
}

// ======================================
// 3) Handler teks lama kita nonaktifkan
//    (supaya tidak spam "Kode halaqah tidak valid")
// ======================================
async function handleHafalanReply(sock, m) {
  // Tidak dipakai lagi, return false saja
  return false;
}

function clearHafalanSession(jid) {
  hafalanSessions.delete(jid);
}

// =============== PROGRAM KETAHFIDZAN ===============
async function sendProgramKetahfidzan(sock, jid) {
  const teks =
    "*📘 PROGRAM UTAMA DIVISI KETAHFIDZAN PPTQ AL-ITQON*\n\n" +
    "1. Ujian seleksi & penentuan halaqah bagi santri baru.\n\n" +
    "2. Ujian naik tingkatan bagi santri yang berada di marhalah *Iqra* setelah dinyatakan layak oleh muhafidznya.\n\n" +
    "3. Ujian *Tahsin* & pengetahuan *Tajwid* pada waktu yang ditentukan bagi santri yang berada di marhalah Tahsin & Tajwid sebagai syarat naik ke marhalah Tahfidz.\n\n" +
    "4. Program *Tikror 20x* (mengulang hafalan baru) setelah selesai menyetorkan hafalan.\n\n" +
    "5. Program pelaporan hafalan santri setiap akhir pekan di grup WhatsApp orang tua.\n\n" +
    "6. Program *Sima'an* bagi setiap santri yang telah mencapai hafalan 5 juz (wajib sima'an dan berlaku kelipatan).\n\n" +
    "7. Acara *Tasyakuran* setelah selesai ujian per juz atau sima'an. Setiap halaqah boleh membuat acara syukuran untuk halaqahnya masing-masing.\n\n" +
    "8. Membuat flayer ucapan selamat bagi santri yang dinyatakan lulus ujian per juz maupun sima'an.\n\n" +
    "9. Mendokumentasikan melalui video singkat santri yang sedang melakukan sima'an.\n\n" +
    "10. Program *Sima'an 1 juz setiap hari* (setelah Zuhur) untuk santri yang ditentukan namanya (target 30 juz dalam 1 bulan).\n\n" +
    "11. Setiap 6 bulan sekali diadakan lomba *Musabaqah Hifdzil Qur'an* antar santri PPTQ AL-ITQON.\n\n" +
    "_Semoga Allah memberkahi seluruh program ini dan menjadikannya wasilah lahirnya para huffazh Qur'an yang mutqin. 🤲_";

  await sock.sendMessage(jid, { text: teks });
}

module.exports = {
  startHafalanFlow,
  handleHafalanReply, // dummy (tidak dipakai lagi)
  handleHafalanSelection,
  sendProgramKetahfidzan,
  clearHafalanSession,
};
