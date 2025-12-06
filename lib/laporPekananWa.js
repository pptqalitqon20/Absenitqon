// lib/laporPekananWa.js
// Flow Laporan Pekanan Hafalan versi WhatsApp + List Message
//
// Alur singkat:
// 1) Admin kirim: !lapor
// 2) Bot kirim List Message: pilih Halaqah
// 3) Bot tampilkan santri satu per satu:
//    - User pilih STATUS via List Message
//    - Kalau butuh angka (halaman/juz), user KETIK manual
//    - Bot simpan ke Google Sheets (sheet "Santri")
// 4) Setelah semua santri selesai → bot kirim rekap pekanan (pakai sendRekapPekanan)

const { sheetsService } = require("../services/sheetsService");
const { sendButtonMsg } = require("./sendButton");
const { sendRekapPekanan } = require("./rekapPekanan");

// Session per chat
const laporSessions = new Map();

// =========================
// Helper umum
// =========================

function getJid(m) {
  return m.chat || m.key?.remoteJid || m.from;
}

// Ambil semua halaqah dari sheet "Santri"
function buildHalaqahList(sheetValues) {
  const hasil = [];
  for (let i = 0; i < sheetValues.length; i++) {
    const row = sheetValues[i] || [];
    if (
      row[0] &&
      typeof row[0] === "string" &&
      row[0].includes("Halaqah")
    ) {
      const namaHalaqah = row[0].trim();
      const ustadz = row[1] ? String(row[1]).trim() : "Belum terisi";
      hasil.push({
        nama: namaHalaqah,
        ustadz,
      });
    }
  }
  return hasil;
}

// Ambil daftar santri untuk satu halaqah (mirip get_santri_by_halaqah di Python)
function buildSantriListForHalaqah(sheetValues, namaHalaqah) {
  const santri = [];
  let inBlock = false;

  for (let i = 0; i < sheetValues.length; i++) {
    const row = sheetValues[i] || [];

    if (
      row[0] &&
      typeof row[0] === "string" &&
      row[0].includes("Halaqah") &&
      row[0].trim() === String(namaHalaqah).trim()
    ) {
      inBlock = true;
      continue;
    }

    if (
      inBlock &&
      row[0] &&
      typeof row[0] === "string" &&
      row[0].includes("Halaqah")
    ) {
      break;
    }

    if (
      inBlock &&
      row[0] &&
      String(row[0]).trim() &&
      String(row[0]).trim() !== "Nama Santri"
    ) {
      santri.push(String(row[0]).trim());
      // Batas wajar 13 santri per halaqah (sesuai Python)
      if (santri.length >= 13) break;
    }
  }

  return santri;
}

// Cari row index (1-based) di sheet untuk satu santri di dalam halaqah tertentu
function findSantriRow(values, halaqahName, santriName) {
  const targetH = (halaqahName || "").trim().toLowerCase();
  const targetS = (santriName || "").trim().toLowerCase();

  let inBlock = false;
  let targetRow = null;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row || !row[0]) continue;

    const colA = String(row[0]).trim();
    const colALower = colA.toLowerCase();

    // Awal blok halaqah
    if (colA.includes("Halaqah") && colALower === targetH) {
      inBlock = true;
      continue;
    }

    // Kalau sudah di dalam blok dan ketemu halaqah berikutnya → stop
    if (inBlock && colA.includes("Halaqah")) {
      break;
    }

    // Di dalam blok, cari nama santri
    if (inBlock && colALower === targetS) {
      targetRow = i + 1; // +1 karena index array 0-based, sheet 1-based
      break;
    }
  }

  return targetRow;
}

// Hitung pekan & bulan versi Asia/Makassar
function getCurrentWeekInfoMakassar() {
  const bulanMap = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const now = new Date();
  // Anggap server UTC, geser ke UTC+8 (Makassar)
  const makassar = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  const day = makassar.getDate();
  const monthIdx = makassar.getMonth();

  const pekanKe = Math.floor((day - 1) / 7) + 1;
  const bulanLabel = bulanMap[monthIdx];

  return { pekanKe, bulanLabel };
}
// Update data laporan pekanan ke Google Sheets
/**
 * Simpan data laporan pekanan ke sheet "Santri"
 * Mirip fungsi simpan_data() di lapor_pekanan2.py
 *
 * @param {object} session - data session lapor
 * @param {string} jenis - "hafalan" | "tahsin" | "ujian" | "simaan" | "sakit" | "izin" | "murojaah"
 * @param {object} valueObj - { pages, juz, extra }
 * @param {WASocket} sock
 * @param {string} jid
 */
async function saveWeeklyDataToSheet(session, jenis, valueObj = {}, sock, jid) {
  try {
    const sheetName = "Santri";

    const halaqah =
      (session.halaqah ||
        session.halaqahName ||
        session.selectedHalaqah ||
        "").trim();
    const namaSantri =
      (session.currentSantri || session.santri || "").trim();

    if (!halaqah || !namaSantri) {
      console.error(
        "❌ saveWeeklyDataToSheet: halaqah / nama santri kosong di session",
        { halaqah, namaSantri }
      );
      return;
    }

    const values = await sheetsService.getSheetValues(sheetName);
    if (!values || !values.length) {
      console.error("❌ saveWeeklyDataToSheet: sheet Santri kosong");
      await sock.sendMessage(jid, {
        text: "❌ Data sheet *Santri* kosong / tidak terbaca.",
      });
      return;
    }

    const targetRow = findSantriRow(values, halaqah, namaSantri);
    if (!targetRow) {
      console.error(
        `❌ Baris santri '${namaSantri}' tidak ditemukan di halaqah '${halaqah}'`
      );
      await sock.sendMessage(jid, {
        text:
          `❌ Data santri *${namaSantri}* di halaqah *${halaqah}* ` +
          "tidak ditemukan di sheet *Santri*.",
      });
      return;
    }

    const rowArray = values[targetRow - 1] || [];

    // ==========================
    // Pekan & Bulan (D & E)
    // ==========================
    const { pekanKe, bulanLabel } = getCurrentWeekInfoMakassar();
    const teksPekan = `Pekan ${pekanKe}`;

    const currentPekan = (rowArray[3] || "").trim(); // D
    const currentBulan = (rowArray[4] || "").trim(); // E

    // Jika ganti pekan / bulan → clear D–M (10 kolom), biarkan N (Total) tetap
    if (currentPekan !== teksPekan || currentBulan !== bulanLabel) {
      const colsToClear = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
      for (const col of colsToClear) {
        await sheetsService.updateCell(sheetName, `${col}${targetRow}`, "");
      }
    }

    // Set D (Pekan ke) & E (Bulan)
    await sheetsService.updateCell(sheetName, `D${targetRow}`, teksPekan);
    await sheetsService.updateCell(sheetName, `E${targetRow}`, bulanLabel);

    // ==========================
    // Map jenis -> kolom F–L
    // ==========================
    const jenisMap = {
      hafalan: "F",
      tahsin: "G",
      ujian: "H",
      simaan: "I",
      sakit: "J",
      izin: "K",
      murojaah: "L",
    };

    const kolom = jenisMap[jenis];
    if (!kolom) {
      console.error("❌ Jenis laporan tidak dikenali:", jenis);
      return;
    }

    // Ambil nilai pages/juz dari valueObj atau session
    let pages = parseInt(
      valueObj.pages ?? session.tempPages ?? 0,
      10
    );
    let juz = valueObj.juz ?? session.tempJuz ?? "?";

    if (isNaN(pages)) pages = 0;

    // ==========================
    // Hafalan
    // ==========================
    if (jenis === "hafalan") {
      const nilai = `${pages} Halaman - Juz ${juz}`;

      await sheetsService.updateCell(sheetName, `${kolom}${targetRow}`, nilai);

      const ket = pages >= 3 ? "Tercapai" : "Tidak tercapai";
      await sheetsService.updateCell(sheetName, `M${targetRow}`, ket);

      // Update total di kolom N
      const totalRaw = (rowArray[13] || "0").toString(); // N (index 13)
      let totalInt = 0;
      try {
        totalInt = parseInt(totalRaw.trim().split(" ")[0], 10);
        if (isNaN(totalInt)) totalInt = 0;
      } catch {
        totalInt = 0;
      }
      const newTotal = totalInt + pages;
      await sheetsService.updateCell(
        sheetName,
        `N${targetRow}`,
        `${newTotal} Halaman`
      );

      return;
    }

    // ==========================
    // Tahsin
    // ==========================
    if (jenis === "tahsin") {
      const nilai = `${pages} Halaman - Juz ${juz}`;

      await sheetsService.updateCell(sheetName, `${kolom}${targetRow}`, nilai);
      await sheetsService.updateCell(sheetName, `M${targetRow}`, "Tahsin");

      // Update total di kolom N (sama seperti hafalan)
      const totalRaw = (rowArray[13] || "0").toString();
      let totalInt = 0;
      try {
        totalInt = parseInt(totalRaw.trim().split(" ")[0], 10);
        if (isNaN(totalInt)) totalInt = 0;
      } catch {
        totalInt = 0;
      }
      const newTotal = totalInt + pages;
      await sheetsService.updateCell(
        sheetName,
        `N${targetRow}`,
        `${newTotal} Halaman`
      );

      return;
    }

    // ==========================
    // Ujian
    // ==========================
    if (jenis === "ujian") {
      const nilai = `Juz ${juz || "?"}`;
      await sheetsService.updateCell(sheetName, `${kolom}${targetRow}`, nilai);
      await sheetsService.updateCell(
        sheetName,
        `M${targetRow}`,
        "Persiapan Ujian"
      );
      return;
    }

    // ==========================
    // Sima'an
    // ==========================
    if (jenis === "simaan") {
      const nilai = `${juz || "?"} Juz`;
      await sheetsService.updateCell(sheetName, `${kolom}${targetRow}`, nilai);
      await sheetsService.updateCell(
        sheetName,
        `M${targetRow}`,
        "Persiapan Sima'an"
      );
      return;
    }

    // ==========================
    // Muroja'ah
    // ==========================
    if (jenis === "murojaah") {
      const nilai = `Juz ${juz || "?"}`;
      await sheetsService.updateCell(sheetName, `${kolom}${targetRow}`, nilai);
      await sheetsService.updateCell(
        sheetName,
        `M${targetRow}`,
        "Muroja'ah"
      );
      return;
    }

    // ==========================
    // Sakit / Izin
    // ==========================
    if (jenis === "sakit") {
      await sheetsService.updateCell(sheetName, `${kolom}${targetRow}`, "Sakit");
      await sheetsService.updateCell(sheetName, `M${targetRow}`, "Sakit");
      return;
    }

    if (jenis === "izin") {
      await sheetsService.updateCell(sheetName, `${kolom}${targetRow}`, "Izin");
      await sheetsService.updateCell(sheetName, `M${targetRow}`, "Izin");
      return;
    }
  } catch (err) {
    console.error("❌ Error saveWeeklyDataToSheet:", err);
    await sock.sendMessage(jid, {
      text:
        "❌ Terjadi kesalahan saat menyimpan laporan pekanan ke Google Sheets.\n" +
        (err.message || err),
    });
  }
}
// Kirim list status untuk 1 santri
async function sendStatusListForCurrentSantri(sock, jid, session) {
  const santri = session.currentSantri;
  if (!santri) return;

  const statusOptions = [
    {
      code: "hafalan",
      title: "📖 Hafalan Baru",
      desc: "Setoran halaman baru pekan ini",
    },
    {
      code: "tahsin",
      title: "📘 Tahsin",
      desc: "Perbaikan bacaan / tahsin",
    },
    {
      code: "ujian",
      title: "📝 Ujian",
      desc: "Ujian per juz",
    },
    {
      code: "simaan",
      title: "📚 Sima'an",
      desc: "Sima'an beberapa juz",
    },
    {
      code: "sakit",
      title: "🤒 Sakit",
      desc: "Tidak setor karena sakit",
    },
    {
      code: "izin",
      title: "📆 Izin",
      desc: "Tidak setor karena izin",
    },
    {
      code: "murojaah",
      title: "🔁 Muroja'ah",
      desc: "Pengulangan hafalan",
    },
  ];

  const rows = statusOptions.map((o) => ({
    title: o.title,
    description: o.desc,
    id: `lapor_status:${o.code}`,
  }));

  const params = {
    title: `Status Laporan: ${santri}`,
    sections: [
      {
        title: "Pilih Status",
        rows,
      },
    ],
  };

  const text =
    `🧑‍🎓 *${santri}*\n\n` +
    "Silakan pilih *status laporan pekan ini* " +
    "melalui tombol *Pilih Status* di bawah.";

  // kirim list + simpan key agar bisa dihapus setelah dipakai
  const msg = await sendButtonMsg(
    sock,
    jid,
    {
      text,
      footer: "PPTQ AL-ITQON",
      buttons: [
        {
          buttonId: "lapor_status_list",
          type: 2,
          buttonText: { displayText: "📋 Pilih Status" },
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

  if (msg?.key) {
    session.lastStatusListKey = msg.key;
  }
}
// Lanjut ke santri berikutnya, atau kirim rekap kalau sudah selesai
async function goToNextSantri(sock, jid, session) {
  session.index += 1;
  if (
    !session.santriList ||
    session.index >= session.santriList.length
  ) {
    await sock.sendMessage(jid, {
      text:
        "✅ Semua laporan pekanan berhasil dicatat.\n" +
        "InsyaAllah rekap akan dikirim di pesan berikutnya.",
    });

    // Kirim rekap pekanan
    try {
      await sendRekapPekanan(sock, jid, session.halaqahName);
    } catch (e) {
      console.error("❌ Error kirim rekap pekanan:", e);
      await sock.sendMessage(jid, {
        text:
          "❌ Terjadi kesalahan saat mengirim rekap pekanan.\n" +
          (e.message || e),
      });
    }

    laporSessions.delete(jid);
    return;
  }

  session.currentSantri = session.santriList[session.index];
  session.waitingFor = "status";
  session.currentStatus = null;
  session.tempPages = null;
  session.tempJuz = null;

  await sendStatusListForCurrentSantri(sock, jid, session);
}

// =========================
// 1) MULAI FLOW LAPOR (!lapor)
// =========================

async function startLaporPekananFlow(sock, jid) {
  let loadingMsg = null;

  try {
    // 1) Kirim pesan loading + simpan key-nya
    loadingMsg = await sock.sendMessage(jid, {
      text:
        "⏳ Tunggu sebentar, saya sedang mengambil daftar halaqah " +
        "dari Google Sheets...",
    });

    // 2) Ambil data sheet
    const sheetValues = await sheetsService.getSheetValues("Santri");

    // Bila loadingMsg ada → hapus dulu sebelum kirim pesan berikutnya
    const deleteLoading = async () => {
      if (loadingMsg?.key) {
        try {
          await sock.sendMessage(jid, { delete: loadingMsg.key });
        } catch (err) {
          console.warn("⚠️ Gagal hapus pesan loading:", err.message);
        }
      }
    };

    if (!sheetValues || sheetValues.length < 3) {
      await deleteLoading();

      await sock.sendMessage(jid, {
        text:
          "❌ Data di sheet *Santri* tidak ditemukan / terlalu sedikit.\n" +
          "Silakan cek kembali Google Sheets.",
      });
      return;
    }

    const daftarHalaqah = buildHalaqahList(sheetValues);
    if (!daftarHalaqah.length) {
      await deleteLoading();

      await sock.sendMessage(jid, {
        text: "❌ Tidak ada baris *Halaqah ...* ditemukan di sheet Santri.",
      });
      return;
    }

    // 3) Simpan session
    laporSessions.set(jid, {
      sheetData: sheetValues,
      halaqahList: daftarHalaqah,
      halaqahName: null,
      santriList: null,
      index: 0,
      currentSantri: null,
      currentStatus: null,
      waitingFor: "choose_halaqah",
      tempPages: null,
      tempJuz: null,
      tempMessageKeys: [], // kalau mau hapus banyak pesan nanti
    });

    const rows = daftarHalaqah.map((h) => ({
      title: h.nama,
      description: `Ustadz: ${h.ustadz}`,
      id: `lapor_halaqah:${encodeURIComponent(h.nama)}`,
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
      "📝 *Laporan Pekanan Hafalan*\n\n" +
      "Silakan pilih *halaqah* yang ingin Anda isi laporannya " +
      "melalui tombol *Daftar Halaqah* di bawah ini.";

    // 4) HAPUS loading sebelum kirim list message
    await deleteLoading();

    // 5) Kirim List Message
    await sendButtonMsg(
      sock,
      jid,
      {
        text,
        footer: "PPTQ AL-ITQON",
        buttons: [
          {
            buttonId: "lapor_halaqah_list",
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
  } catch (e) {
    console.error("❌ startLaporPekananFlow error:", e);

    // Kalau ada pesan loading, hapus dulu
    if (loadingMsg?.key) {
      try {
        await sock.sendMessage(jid, { delete: loadingMsg.key });
      } catch {}
    }

    await sock.sendMessage(jid, {
      text:
        "❌ Terjadi kesalahan saat memulai laporan pekanan.\n" +
        (e.message || e),
    });
  }
}
// =========================
// 2) HANDLE LIST MESSAGE (halaqah, status, final)
// =========================

async function handleLaporPekananListSelection(sock, m, selectedId) {
  const jid = getJid(m);
  if (!jid) return false;

  const session = laporSessions.get(jid);
  if (!session) return false; // bukan session lapor

  if (typeof selectedId !== "string") return false;

  // Pilih halaqah
  if (selectedId.startsWith("lapor_halaqah:")) {
    const encodedName = selectedId.slice("lapor_halaqah:".length);
    const halaqahName = decodeURIComponent(encodedName);

    const santriList = buildSantriListForHalaqah(
      session.sheetData,
      halaqahName
    );

    if (!santriList.length) {
      await sock.sendMessage(jid, {
        text:
          `❌ Tidak ditemukan santri untuk halaqah *${halaqahName}*.\n` +
          "Silakan cek kembali sheet Santri.",
      });
      return true;
    }

    session.halaqahName = halaqahName;
    session.santriList = santriList;
    session.index = 0;
    session.currentSantri = santriList[0];
    session.currentStatus = null;
    session.waitingFor = "status";
    session.tempPages = null;
    session.tempJuz = null;
    session.lastInputPromptKey = null;

    await sock.sendMessage(jid, {
      text:
        `✅ Halaqah yang dipilih: *${halaqahName}*\n` +
        `📚 Jumlah santri: ${santriList.length}\n\n` +
        "Sekarang kita mulai input laporan pekanan, insyaAllah.",
    });

    await sendStatusListForCurrentSantri(sock, jid, session);
    return true;
  }

  // Pilih status
if (selectedId.startsWith("lapor_status:")) {
  const status = selectedId.slice("lapor_status:".length);
  session.currentStatus = status;

  const santri = session.currentSantri || "-";

  // Hapus list status yang barusan dipakai (kalau ada)
  if (session.lastStatusListKey) {
    try {
      await sock.sendMessage(jid, { delete: session.lastStatusListKey });
    } catch (e) {
      console.warn("⚠️ Gagal hapus list status:", e.message || e);
    }
    session.lastStatusListKey = null;
  }

  // Reset key prompt input juga (biar bersih)
  session.lastInputPromptKey = null;

  if (status === "hafalan" || status === "tahsin") {
    session.waitingFor = "pagesInput";

    const msg = await sock.sendMessage(jid, {
      text:
        `🧑‍🎓 *${santri}*\n` +
        "Silakan ketik *jumlah halaman* hafalan/tahsin pekan ini.\n" +
        "Contoh: `3` (tanpa kata 'halaman').",
    });

    if (msg?.key) {
      session.lastInputPromptKey = msg.key;
    }

    return true;
  }

  if (status === "ujian" || status === "simaan" || status === "murojaah") {
    session.waitingFor = "juzInput";

    const msg = await sock.sendMessage(jid, {
      text:
        `🧑‍🎓 *${santri}*\n` +
        "Silakan ketik *nomor juz* yang diujikan / disima'an / dimuroja'ah.\n" +
        "Contoh: `5`",
    });

    if (msg?.key) {
      session.lastInputPromptKey = msg.key;
    }

    return true;
  }

  if (status === "sakit" || status === "izin") {
    session.waitingFor = "status"; // langsung selesai untuk santri ini
    await saveWeeklyDataToSheet(session, status, {}, sock, jid);
    await goToNextSantri(sock, jid, session);
    return true;
  }

  return true;
}
  // Final hasil ujian/sima'an
  if (selectedId.startsWith("lapor_final:")) {
    const finalResult = selectedId.slice("lapor_final:".length); // "lulus" / "persiapan"
    const status = session.currentStatus;

    if (status === "ujian" || status === "simaan") {
      const juz = session.tempJuz;
      await saveWeeklyDataToSheet(
        session,
        status,
        { juz, finalResult },
        sock,
        jid
      );
      session.waitingFor = "status";
      session.lastInputPromptKey = null;
      await goToNextSantri(sock, jid, session);
      return true;
    }

    return true;
  }

  return false;
}
// =========================
// 3) HANDLE TEKS (halaman & juz diketik)
// =========================
async function handleLaporPekananTextReply(sock, m) {
  const jid = getJid(m);
  if (!jid) return false;

  const session = laporSessions.get(jid);
  if (!session) return false; // tidak ada session lapor

  const text = (m.text || "").trim();
  if (!text) return false;

  // Hanya tangani kalau memang sedang menunggu input angka
  if (session.waitingFor !== "pagesInput" && session.waitingFor !== "juzInput") {
    return false;
  }

  const angka = parseInt(text.replace(/[^\d]/g, ""), 10);
  if (isNaN(angka) || angka <= 0) {
    await sock.sendMessage(jid, {
      text: "❌ Mohon ketik angka saja. Contoh: `3`",
    });
    return true;
  }

  const status = session.currentStatus;
  if (!status) {
    await sock.sendMessage(jid, {
      text:
        "❌ Status laporan belum dipilih.\n" +
        "Silakan pilih status lagi dari tombol List Message.",
    });
    session.waitingFor = "status";
    return true;
  }

  // Helper kecil: hapus prompt input (halaman/juz) jika ada
  const deleteLastPrompt = async () => {
    if (session.lastInputPromptKey) {
      try {
        await sock.sendMessage(jid, { delete: session.lastInputPromptKey });
      } catch (e) {
        console.warn("⚠️ Gagal hapus prompt input:", e.message || e);
      }
      session.lastInputPromptKey = null;
    }
  };

  // ==========================
  // Input jumlah halaman
  // ==========================
  if (session.waitingFor === "pagesInput") {
    session.tempPages = angka;

    // Hapus prompt "masukkan jumlah halaman"
    await deleteLastPrompt();

    // ➜ HAFALAN & TAHSIN: lanjut minta JUZ dulu, jangan langsung simpan
    if (status === "hafalan" || status === "tahsin") {
      session.waitingFor = "juzInput";

      const santri = session.currentSantri || "-";
      const msg = await sock.sendMessage(jid, {
        text:
          `🧑‍🎓 *${santri}*\n` +
          `📖 Jumlah halaman: *${angka}* halaman.\n\n` +
          "Sekarang silakan ketik *nomor juz* yang dihafal/tahsin pekan ini.\n" +
          "Contoh: `5`",
      });

      // Simpan key prompt juz baru
      if (msg?.key) {
        session.lastInputPromptKey = msg.key;
      }

      return true;
    }

    // Status lain (kalau nanti ada yang pakai pagesInput khusus) bisa diproses di sini.
    return true;
  }

  // ==========================
  // Input nomor juz
  // ==========================
  if (session.waitingFor === "juzInput") {
    session.tempJuz = angka;

    // Hapus prompt "masukkan juz"
    await deleteLastPrompt();

    // ➜ HAFALAN & TAHSIN: sekarang simpan (pages + juz), lalu lanjut santri berikutnya
    if (status === "hafalan" || status === "tahsin") {
      await saveWeeklyDataToSheet(
        session,
        status,
        { pages: session.tempPages, juz: angka },
        sock,
        jid
      );

      // reset flag & temp
      session.waitingFor = "status";
      session.tempPages = null;
      session.tempJuz = null;

      await goToNextSantri(sock, jid, session);
      return true;
    }

    // ➜ MUROJAAH: cukup butuh juz saja
    if (status === "murojaah") {
      await saveWeeklyDataToSheet(
        session,
        "murojaah",
        { juz: angka },
        sock,
        jid
      );
      session.waitingFor = "status";
      session.tempJuz = null;
      await goToNextSantri(sock, jid, session);
      return true;
    }

    // ➜ UJIAN / SIMAAN: setelah tahu JUZ, lanjut tanya LULUS / PERSIAPAN via List Message
    if (status === "ujian" || status === "simaan") {
      const santri = session.currentSantri || "-";

      const rows = [
        {
          title: "✅ Lulus",
          description: "Ujiannya dinyatakan lulus",
          id: "lapor_final:lulus",
        },
        {
          title: "📖 Persiapan",
          description: "Masih tahap persiapan ujian/sima'an",
          id: "lapor_final:persiapan",
        },
      ];

      const params = {
        title: `Hasil: ${santri}`,
        sections: [
          {
            title: "Pilih Hasil",
            rows,
          },
        ],
      };

      const textMsg =
        `🧑‍🎓 *${santri}*\n` +
        `📖 Juz: ${angka}\n\n` +
        "Silakan pilih *hasil ujian / sima'an* " +
        "melalui tombol *Pilih Hasil* di bawah.";

      session.waitingFor = "finalResult";

      await sendButtonMsg(
        sock,
        jid,
        {
          text: textMsg,
          footer: "PPTQ AL-ITQON",
          buttons: [
            {
              buttonId: "lapor_final_list",
              type: 2,
              buttonText: { displayText: "📋 Pilih Hasil" },
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
      return true;
    }

    return true;
  }

  return false;
}

function clearLaporPekananSession(jid) {
  laporSessions.delete(jid);
}
module.exports = {
  startLaporPekananFlow,
  handleLaporPekananListSelection,
  handleLaporPekananTextReply,
  clearLaporPekananSession,
};
