// naze.js - Router khusus BOT PPTQ AL-ITQON

// ==== END INIT ====
const { handleMenu } = require("./lib/menu");
const { handleAllMenu } = require("./lib/allmenu");
const { sendButtonMsg } = require("./lib/sendButton");
const { handleConverter } = require('./handlers/converterHandler');
const { handleAIQuery } = require("./handlers/aiHandler");
const { sendStruktur, sendVisiMisi, sendProfil } = require("./lib/pptq");
const { handleDownloaderCommand } = require('./lib/downloader');
const { getReactionPrompt } = require("./prompt");
const daftarSurah = require("./data/surah");
const {
  startHafalanFlow,
  handleHafalanReply,
  handleHafalanSelection,
  sendProgramKetahfidzan,
} = require("./lib/hafalan");
const {
  startLaporPekananFlow,
  handleLaporPekananListSelection,
  handleLaporPekananTextReply,
} = require("./lib/laporPekananWa");
const { handleRekapUjianCommand } = require("./lib/rekapUjian");
const {
  handleQuranCommand,
  handleQoriCommand,
} = require('./handlers/quranHandler');
// 🔧 Handler PDF (image → PDF, gabung PDF, dsb)
const { handleGrayscaleImage } = require("./lib/handleGrayscale");
const {
  handleImageToPDFCommand,
  handleImageToPDF,
  hasActivePdfSession,
  getSessionKey: getPdfSessionKey,
} = require("./handlers/imageToPdfHandler");
const {
  handlePdfMerge,
  handlePdfMergeCommand,
  handleCancelCommand,
  hasActivePdfMergeSession
} = require('./handlers/pdfMergeHandler');

const {
  startPdfExtractFlow,
  handlePdfExtractCommand,
  hasActiveExtractSession
} = require('./handlers/pdfExtractHandler');

const {
  handleWordToPdf,
  handleWordToPdfCommand,
  hasActiveWordSession,
} = require('./handlers/wordToPdfHandler');
const islamModeSessions = new Map();

// Normalize JID / LID ke bentuk "bare" biar gampang dibandingkan
function normalizeLid(jid) {
  if (!jid) return "";
  const noDevice = jid.split(":")[0];
  return noDevice.replace("@lid", "").replace("@s.whatsapp.net", "");
}

/**
 * Handler utama dipanggil dari src/message.js
 * @param {import("baileys").WASocket} sock
 * @param {object} m pesan yang sudah di-serialize
 * @param {object} msg raw WAMessage
 * @param {object} store
 * @param {object} aiService
 */
module.exports = async function (sock, m, msg, store, aiService) {
  try {
    const text = (m.text || "").trim();
    const lcText = text.toLowerCase();
    const isGroup = m.isGroup;
    const isCommand = /^[.!/#]/.test(lcText);
    const sessionKey = `${m.chat}:${m.sender}`;
    const chatId = m.chat || m.key?.remoteJid || "";
    const messageKey = m.key || null;

    // ==========================
    // 1️⃣ DETEKSI PESAN DARI CHANNEL/NEWSLETTER
    // ==========================
    const isNewsletter = chatId.endsWith("@newsletter");

    if (isNewsletter) {
      console.log("📬 [NEWSLETTER] Pesan dari channel, dilewati total.");
      return; // Hentikan eksekusi untuk newsletter
    }

    // ==========================
    // 2️⃣ AUTO REACTION SEDERHANA
    // ==========================
    try {
      console.log("🔁 [AUTO-REACT] Pesan diterima:", text);
      console.log("DEBUG REACT CHECK", {
        text,
        remoteJid: messageKey?.remoteJid,
        id: messageKey?.id,
        stanzaId: messageKey?.stanzaId,
        fullKey: messageKey
      });
      // kirim react hanya jika:
      // - ada teks
      // - bukan command
      // - punya key yang valid (remoteJid & id)
      if (
        text &&
        !/^[.!/#]/.test(text) &&
        messageKey &&
        messageKey.remoteJid &&
        messageKey.id
      ) {
        const emoji = getReactionPrompt(text);
        console.log("🔁 [AUTO-REACT] Emoji terpilih:", emoji);

        if (emoji) {
          await sock.sendMessage(chatId, {
            react: {
              text: emoji,
              key: messageKey,
            },
          });
          console.log("✅ [AUTO-REACT] React terkirim.");
        } else {
          console.log("ℹ️ [AUTO-REACT] Tidak ada emoji yang dipilih.");
        }

      } else {
        console.log(
          "ℹ️ [AUTO-REACT] Dilewati (kosong/command/tidak punya key yang valid)."
        );
      }
    } catch (e) {
      console.warn(
        "⚠️ [AUTO-REACT] Gagal mengirim reaksi:",
        e.message || e
      );
    }

    // ==============================
    // 0. MODE ISLAM (SESSION GROUP)
    // ==============================
    let inIslamMode = false;
    if (isGroup && islamModeSessions.has(sessionKey)) {
      const session = islamModeSessions.get(sessionKey);
      const now = Date.now();
      // Auto-expire setelah 5 menit tidak ada aktivitas
      if (now - session.lastActivity > 5 * 60 * 1000) {
        islamModeSessions.delete(sessionKey);
      } else {
        inIslamMode = true;
        // Update waktu aktivitas terakhir jika inIslamMode = true
        session.lastActivity = now;
        islamModeSessions.set(sessionKey, session);
      }
    }

    // Keluar dari mode Islam
    if (inIslamMode && lcText === "aibatal") {
      islamModeSessions.delete(sessionKey);
      await sock.sendMessage(m.chat, {
        text:
          "✅ Mode Tanya Islam Bebas telah dihentikan.\n" +
          "Sekarang Anda bisa menggunakan menu yang lain.",
      });
      return;
    }

    // Jika masih dalam mode & user kirim command (.menu, !audio, dll) atau "menu"
    if (inIslamMode && (isCommand || lcText === "menu")) {
      await sock.sendMessage(m.chat, {
        text:
          "⚠️ Anda masih dalam mode bertanya tentang Islam.\n" +
          "Jika ingin menggunakan menu lain, ketik: Aibatal terlebih dahulu.",
      });
      return;
    }

    // Jika masih dalam mode, kirim ke AI dan selesai
    if (inIslamMode) {
      // Pastikan ada teks untuk dikirim ke AI
      if (aiService && (m.text || "").trim()) {
        const handledByAI = await handleAIQuery(
          sock,
          m.chat,
          lcText,
          m.text,
          aiService,
          msg
        );
        if (handledByAI) return;
      }
      return;
    }

    // ==============================
    // 1. PERINTAH MENU (menu / .menu)
    // ==============================
    if (lcText === "menu" || lcText === ".menu") {
      await handleMenu(sock, m);
      return;
    }

    // =========================================================
    // 2. HANDLE PILIHAN LIST (native_flow → interactiveResponse)
    // =========================================================
    if (msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage) {
      try {
        const res =
          msg.message.interactiveResponseMessage.nativeFlowResponseMessage;
        const data = JSON.parse(res.paramsJson || "{}");
        const selectedId = data.id || data.row_id || data.selectedRowId;

        console.log("Interactive selected:", data);

        // laporan Pekanan
        const laporHandledList = await handleLaporPekananListSelection(sock, m, selectedId);
        if (laporHandledList) return;

        // 1) Jika user pilih "🏫 Fitur PPTQ AL-ITQON"
        if (selectedId === "pptq_menu" || selectedId === "menu_pptq") {
          await sendButtonMsg(sock, m.chat, {
            text: "📂 Anda memilih: *Fitur PPTQ AL-ITQON*\n\n" +
              "Silakan pilih salah satu menu di bawah ini👇:",
            footer: "PPTQ AL-ITQON",
            mentions: [m.sender],
            buttons: [
              {
                buttonId: "pptq_struktur",
                buttonText: { displayText: "🏫 Struktur Organisasi" },
                type: 1,
              },
              {
                buttonId: "pptq_visimisi",
                buttonText: { displayText: "🎯 Visi & Misi" },
                type: 1,
              },
              {
                buttonId: "pptq_profil",
                buttonText: { displayText: "📘 Profil PPTQ AL-ITQON" },
                type: 1,
              },
            ],
            headerType: 1,
          });
          return;
        }

        // 2) Jika user pilih "📖 Fitur Ketahfidzan"
        if (selectedId === "ketahfidzan_menu" || selectedId === "menu_hafalan") {
          await sendButtonMsg(sock, m.chat, {
            text: "📂 Anda memilih: *Fitur Ketahfidzan*\n\n" +
              "Silakan pilih salah satu menu di bawah ini👇:",
            footer: "PPTQ AL-ITQON",
            mentions: [m.sender],
            buttons: [
              {
                buttonId: "hafalan_lihat",
                buttonText: { displayText: "📖 Lihat Hafalan Santri" },
                type: 1,
              },
              {
                buttonId: "hafalan_daftar_ujian",
                buttonText: { displayText: "📝 Daftar Santri Selesai Ujian" },
                type: 1,
              },
              {
                buttonId: "hafalan_program",
                buttonText: { displayText: "📚 Program Ketahfidzan" },
                type: 1,
              },
            ],
            headerType: 1,
          });
          return;
        }

        // 3) List halaqah dari Sheets
        if (selectedId && selectedId.startsWith("hafalan_halaqah:")) {
          const kode = selectedId.split(":")[1];
          await handleHafalanSelection(sock, m, kode);
          return;
        }

        // 4) Fitur Keislaman
        if (selectedId === "tanya_menu_info" || selectedId === "menu_islam") {
          await sendButtonMsg(sock, m.chat, {
            text: "🕌 Anda memilih: *Fitur Keislaman*\n\n" +
              "Silahkan pilih aksi di bawah ini:\n" +
              "- Tanya Islam Bebas\n" +
              "- Download Murottal\n\n" +
              "Klik salah satu tombol di bawah ini 👇",
            footer: "PPTQ AL-ITQON",
            mentions: [m.sender],
            buttons: [
              {
                buttonId: "tanya_islam",
                buttonText: { displayText: "🧕 Tanya Islam Bebas" },
                type: 1,
              },
              {
                buttonId: "download_murottal",
                buttonText: { displayText: "🎧 Download Murottal" },
                type: 1,
              },
            ],
            headerType: 1,
          });
          return;
        }

        // 5) Fitur Bermanfaat / Tools
        if (selectedId === "tools_menu_info" || selectedId === "menu_tools") {
          await sock.sendMessage(m.chat, {
            text: "*⚙️ FITUR BERMANFAAT (TOOLS)*\n\n" +
              "*📄 Fitur PDF*\n" +
              "📌 *Ubah Gambar ke PDF*\n" +
              " - Kirimkan saya *gambar* di chat pribadi.\n" +
              " - Jika di *grup*, kirim gambar + *tag saya*.\n\n" +
              "📌 *Gabung beberapa PDF jadi 1*\n" +
              " - Kirimkan saya *berkas PDF*.\n" +
              " - Jika di grup, kirim PDF + *tag saya*.\n\n" +
              "📌 *Ambil halaman tertentu dari PDF*\n" +
              " - Kirim berkas PDF + instruksi halaman.\n\n" +
              "*⏬ Fitur Download*\n" +
              "📹 *Download Video Youtube, Facebook, Tiktok, Instagram, Ig Story.*\n" +
              " - Perintahnya: !ytmp4 <link Youtube>.\n" +
              " - Perintahnya: !fb <link Facebook>.\n" +
              " - Perintahnya: !tt <link Tiktok>.\n" +
              " - Perintahnya: !ig <link Instagram>.\n" +
              " - Perintahnya: !igstory <link igstory>.\n" +
              "🎧 *Download Audio Youtube, Audio Tiktok,.*\n" +
              " - Perintahnya: !ytmp3 <link Youtube>.\n" +
              " - Perintahnya: !ttmp3 <link Tiktok>.\n" +
              "_Silakan mulai dengan mengirim gambar, PDF & link sesuai kebutuhan._",
          });
          return;
        }
        if (selectedId && selectedId.startsWith("murottal_surah:")) {
  const surah = selectedId.split(":")[1];

  // PANGGIL SEPERTI COMMAND ASLI
  await handleQuranCommand(
    sock,
    m.chat,
    `!audio ${surah}`, // ⬅️ PAKAI PREFIX
    m                 // ⬅️ KIRIM CONTEXT
  );

  return;
}
     } catch (e) {
        console.error("Error interactiveResponseMessage PPTQ/Hafalan:", e);
      }
    }
    // =====================================================
    // 3. HANDLE KLIK TOMBOL QUICK REPLY (buttonsResponse)
    // =====================================================
    if (msg.message?.buttonsResponseMessage) {
      const btn = msg.message.buttonsResponseMessage;
      const btnId = btn.selectedButtonId || btn.selectedDisplayText;

      console.log("Button clicked:", btnId);

      // Tombol khusus: SEMUA MENU
      if (btnId === "all_menu") {
        return handleAllMenu(sock, m);
      }

      // Sub-menu PPTQ
      if (btnId === "pptq_struktur") {
        return sendStruktur(sock, m);
      }
      if (btnId === "pptq_visimisi") {
        return sendVisiMisi(sock, m);
      }
      if (btnId === "pptq_profil") {
        return sendProfil(sock, m);
      }

      // Sub-menu Ketahfidzan
      if (btnId === "hafalan_lihat") {
        return startHafalanFlow(sock, m.chat);
      }
      if (btnId === "hafalan_daftar_ujian") {
        return handleRekapUjianCommand(sock, m.chat, "5");
      }
      if (btnId === "hafalan_program") {
        return sendProgramKetahfidzan(sock, m.chat);
      }

      // Sub-menu Menu Islam
      if (btnId === "tanya_islam") {
        if (m.isGroup) {
          const key = `${m.chat}:${m.sender}`;
          islamModeSessions.set(key, {
            startedAt: Date.now(),
            lastActivity: Date.now(),
          });
        }

        await sock.sendMessage(m.chat, {
          text: "🧕 *Tanya Islam Bebas*\n\n" +
            "Silahkan tanya apa saja seputar Islam, Al-Qur'an, Hadis, Fiqih, sejarah, dll.\n\n" +
            "Contoh:\n" +
            "- Apa itu Islam?\n" +
            "- Hadis ke-5 Riyadhus Shalihin apa isinya?\n" +
            "- Jelaskan makna ihsan menurut hadis Jibril.\n\n" +
            "➜ Di *grup*, selama mode ini aktif, setiap pesan Anda akan dianggap sebagai pertanyaan (tanpa perlu mention).\n" +
            "➜ Jika ingin berhenti dari mode ini, ketik: *Aibatal*.\n",
        });
        return;
      }
      if (btnId === "download_murottal") {
  const rows = daftarSurah.map((s) => ({
  title: `Surah ${s.latin}`,
  description: `${s.arab} • ${s.arti}`,
  id: `murottal_surah:${s.no}`,
}));

  const params = {
    title: "Pilih Surah",
    sections: [
      {
        title: "📖 Daftar Surah Al-Qur'an",
        rows,
      },
    ],
  };

  await sendButtonMsg(
    sock,
    m.chat,
    {
      text:
        "🎧 *Download Murottal*\n\n" +
        "⏭️Silakan pilih surah melalui tombol di bawah ini.",
      footer: "PPTQ AL-ITQON",
      buttons: [
        {
          buttonId: "murottal_list",
          type: 2,
          buttonText: { displayText: "📖 Pilih Surah" },
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

  return;
  }
}
    // =====================================================
    // 4. OPSIONAL: DUKUNG PERINTAH ANGKA LANGSUNG (1,2,3)
    // =====================================================
    if (["1", "2", "3", "4", "5", "6"].includes(lcText)) {
      if (lcText === "1") return sendStruktur(sock, m);
      if (lcText === "2") return sendVisiMisi(sock, m);
      if (lcText === "3") return sendProfil(sock, m);
      if (lcText === "4") return startHafalanFlow(sock, m.chat);
      if (lcText === "5") return handleRekapUjianCommand(sock, m.chat, "5");
      if (lcText === "6") return sendProgramKetahfidzan(sock, m.chat);
    }
    // =============================
    // 5. DOWNLOADER COMMANDS
    // =============================
    const dlHandled = await handleDownloaderCommand(sock, m, text, msg);
    if (dlHandled) return;

    // =============================
    // 6. MUROTTAL (!audio ...)
    // =============================
    const qoriHandled = await handleQoriCommand(sock, m.chat, text);
    if (qoriHandled) return;

    if (/^!audio\b/i.test(lcText)) {
      const handled = await handleQuranCommand(sock, m.chat, text, m);
      if (handled) return;
    }

    // =============================
    // 7. LAPOR PEKANAN
    // =============================
    if (/^!lapor\b/i.test(text || "")) {
      await startLaporPekananFlow(sock, m.chat);
      return;
    }

    // =============================
    // 8. HANDLE LAPOR PEKANAN TEXT REPLY
    // =============================
    const laporHandledText = await handleLaporPekananTextReply(sock, m);
    if (laporHandledText) return;
    // word to pdf
    const handledWordCmd = await handleWordToPdfCommand(
      sock,
      m.chat,
      m.text || '',
      m.sender
     );
    if (handledWordCmd) return;
    // ============================
    // 9. IMAGE HANDLER - GRAYSCALE (!ht) 
    // HARUS DIPINDAHKAN DI SINI, SEBELUM IMAGE→PDF!
    // ============================
    if (msg.message?.imageMessage) {
      const captionRaw = msg.message.imageMessage.caption || m.text || "";
      const caption = captionRaw.toLowerCase().trim();
      console.log("DEBUG CAPTION:", caption);

      if (caption.includes("!ht")) {
        console.log("Masuk handler grayscale");
        await handleGrayscaleImage(sock, msg);
        return;
      }
      // =============================
      // 10. IMAGE → PDF (DEFAULT) - SETELAH GRAYSCALE
      // =============================
      const isGroup = m.isGroup;
      const hasPdfSession = hasActivePdfSession(m.chat, m.sender);
      let allowProcess = true;

      if (isGroup && !hasPdfSession) {
        allowProcess = false;

        const raw = msg.message || {};
        const botJid = sock.user?.id || "";
        const botLid = sock.user?.lid || "";
        const botBare = normalizeLid(botJid);
        const botLidBare = normalizeLid(botLid);

        const ctx =
          raw.imageMessage?.contextInfo ||
          raw.extendedTextMessage?.contextInfo ||
          raw.documentMessage?.contextInfo ||
          null;

        const mentionedJid = ctx?.mentionedJid || [];
        const mentionedBare = mentionedJid.map(normalizeLid);

        const mentionedMe =
          mentionedJid.includes(botJid) ||
          mentionedJid.includes(botLid) ||
          mentionedBare.includes(botBare) ||
          mentionedBare.includes(botLidBare);

        let replyToMe = false;
        if (ctx?.quotedMessage) {
          const qp = ctx.participant || "";
          const qpBare = normalizeLid(qp);
          if (
            qp === botJid ||
            qp === botLid ||
            qpBare === botBare ||
            qpBare === botLidBare
          ) {
            replyToMe = true;
          }
        }

        if (mentionedMe || replyToMe) {
          allowProcess = true;
        }
      }

      if (allowProcess) {
        console.log("[PDF IMG] diproses sebagai Image→PDF");

        const handledImgPdf = await handleImageToPDF(
          sock,
          m.chat,
          msg.message,
          m.text || "",
          m.sender
        );
        if (handledImgPdf) return;
      }
    }

    // =============================
    // 11. Follow-up Image→PDF (Y / L)
    // =============================
    const currentText = (m.text || "").toLowerCase();
    if (
      hasActivePdfSession(m.chat, m.sender) &&
      !currentText.includes("!ht")
    ) {
      const handledPdfCmd = await handleImageToPDFCommand(
        sock,
        m.chat,
        msg.message,
        m.text || "",
        m.sender
      );
      if (handledPdfCmd) return;
    }
    // =============================
    // WORD → PDF (HARUS DI ATAS PDF MERGE)
    // =============================
    if (msg.message?.documentMessage) {
      const handledWord = await handleWordToPdf(
       sock,
       m.chat,
       msg.message,
       m.sender
    );
      if (handledWord) return;
}
    // =============================
    // 12. PDF: MERGE / EXTRACT
    // =============================
    if (msg.message?.documentMessage?.mimetype?.includes("application/pdf")) {
      const isGroup = m.isGroup;
      const hasMergeSession = hasActivePdfMergeSession(m.chat, m.sender);
      const hasExtractSession = hasActiveExtractSession(m.chat, m.sender);
      let allowProcess = true;

      if (isGroup && !hasMergeSession && !hasExtractSession) {
        // --- Grup, BELUM ada sesi merge/extract: wajib mention / reply ---
        allowProcess = false;

        const raw = msg.message || {};
        const botJid = sock.user?.id || "";
        const botLid = sock.user?.lid || "";
        const botBare = normalizeLid(botJid);
        const botLidBare = normalizeLid(botLid);

        const ctx =
          raw.documentMessage?.contextInfo ||
          raw.extendedTextMessage?.contextInfo ||
          raw.imageMessage?.contextInfo ||
          null;

        const mentionedJid = ctx?.mentionedJid || [];
        const mentionedBare = mentionedJid.map(normalizeLid);

        const mentionedMe =
          mentionedJid.includes(botJid) ||
          mentionedJid.includes(botLid) ||
          mentionedBare.includes(botBare) ||
          mentionedBare.includes(botLidBare);

        let replyToMe = false;
        if (ctx?.quotedMessage) {
          const qp = ctx.participant || "";
          const qpBare = normalizeLid(qp);
          if (
            qp === botJid ||
            qp === botLid ||
            qpBare === botBare ||
            qpBare === botLidBare
          ) {
            replyToMe = true;
          }
        }

        if (mentionedMe || replyToMe) {
          allowProcess = true;
        }
      }

      if (allowProcess) {
        console.log("[PDF DOC] diproses sebagai Merge/Extract");

        // --- 12A. Handler MERGE ---
        const handledMerge = await handlePdfMerge(
          sock,
          m.chat,
          msg.message,
          "",
          m.sender
        );
        if (handledMerge) return;
      }
    }

    // --- 12B. Follow-up MERGE (G / Ex / L / C / dst)
    if (hasActivePdfMergeSession(m.chat, m.sender)) {
      const handledMergeCmd = await handlePdfMergeCommand(
        sock,
        m.chat,
        msg.message,
        m.text || "",
        m.sender
      );
      if (handledMergeCmd) return;
    }

    // --- 12C. Follow-up EXTRACT halaman (1-5 / 1,3,7 / all)
    if (hasActiveExtractSession(m.chat, m.sender)) {
      const handledExtractCmd = await handlePdfExtractCommand(
        sock,
        m.chat,
        msg.message,
        m.text || "",
        m.sender
      );
      if (handledExtractCmd) return;
    }

    // --- 12D. Perintah BATAL (batal / cancel)
    const handledCancel = await handleCancelCommand(
      sock,
      m.chat,
      m.text || "",
      m.sender
    );
    if (handledCancel) return;

    // =============================
    // 13. AI (TANYA ISLAM / UMUM)
    // =============================
    if (aiService) {
      const textNow = (m.text || lcText || "").trim();
      if (!textNow) return;

      // jika sesi pdf aktif, skip AI
      if (hasActivePdfSession(m.chat, m.sender)) {
        return;
      }

      // Catatan: inIslamMode sudah dihitung di Bagian 0.
      // Jika inIslamMode == true, maka kode sudah di-return di Bagian 0.
      // Jadi, yang sampai ke sini HANYA pesan yang BUKAN dalam mode sesi.

      // Kalau ini command (. ! / #), AI tidak ikut campur
      if (/^[.!/#]/.test(textNow)) {
        return;
      }

      // 🟢 PRIVATE CHAT → selalu boleh ke AI
      if (!isGroup) {
        const handledByAI = await handleAIQuery(
          sock,
          m.chat,
          lcText,
          textNow,
          aiService,
          msg
        );
        if (handledByAI) return;
      } else {
        // 🟡 GROUP CHAT → HANYA TANGGAPI MENTION/REPLY
        const raw = msg.message || {};

        const botJid = sock.user?.id || "";
        const botLid = sock.user?.lid || "";
        const botBare = normalizeLid(botJid);
        const botLidBare = normalizeLid(botLid);

        const getMentionedJids = (rawMsg) => {
          const extMentions =
            rawMsg.extendedTextMessage?.contextInfo?.mentionedJid || [];
          const imgMentions =
            rawMsg.imageMessage?.contextInfo?.mentionedJid || [];
          const docMentions =
            rawMsg.documentMessage?.contextInfo?.mentionedJid || [];
          const vidMentions =
            rawMsg.videoMessage?.contextInfo?.mentionedJid || [];
          return [
            ...new Set([
              ...extMentions,
              ...imgMentions,
              ...docMentions,
              ...vidMentions,
            ]),
          ];
        };

        const mentioned = getMentionedJids(raw);
        const mentionedBare = mentioned.map(normalizeLid);

        const isMentioned =
          mentioned.includes(botJid) ||
          mentioned.includes(botLid) ||
          mentionedBare.includes(botBare) ||
          mentionedBare.includes(botLidBare);

        const ctxInfo =
          raw.extendedTextMessage?.contextInfo ||
          raw.imageMessage?.contextInfo ||
          raw.documentMessage?.contextInfo ||
          raw.videoMessage?.contextInfo ||
          null;

        let isReplyToBot = false;
        if (ctxInfo?.quotedMessage) {
          const qp = ctxInfo.participant || "";
          const qpBare = normalizeLid(qp);
          if (
            qp === botJid ||
            qp === botLid ||
            qpBare === botBare ||
            qpBare === botLidBare
          ) {
            isReplyToBot = true;
          }
        }

        // *** PERUBAHAN KRUSIAL ADA DI SINI ***
        // Kita HAPUS logika "aktifkan mode sesi otomatis" di sini.
        // Hanya proses AI jika ada mention/reply.
        if (isMentioned || isReplyToBot) {
          const handledByAI = await handleAIQuery(
            sock,
            m.chat,
            lcText,
            textNow,
            aiService,
            msg
          );
          if (handledByAI) return;
        }
      }
    }

  } catch (err) {
    console.error("❌ Error di naze.js PPTQ:", err);
  }
};
