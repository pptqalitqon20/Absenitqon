// lib/menu.js
const { sendButtonMsg } = require("./sendButton");

module.exports.handleMenu = async (sock, m) => {
  const jid = m.chat || m.sender || m.key?.remoteJid;

  // Ambil nama dari m.pushName (yang kita set di src/message.js)
  let senderName = m.pushName;

  // Jika kosong atau hanya angka (LID), fallback
  if (!senderName || /^[0-9]+$/.test(senderName)) {
    senderName = "Santri";
  }

  const text =
    `📲 *MENU UTAMA BOT PPTQ AL-ITQON*\n\n` +
    `Assalamualaikum *${senderName}* 👋\n\n` +
    `Silahkan pilih menu melalui tombol di bawah ini👇:`;

  const params = {
    title: "Daftar Menu PPTQ",
    sections: [
      {
        title: "Pilih Kategori Menu",
        rows: [
          {
            title: "🏫 Fitur PPTQ AL-ITQON",
            description: "Struktur • Profil • Visi Misi",
            id: "pptq_menu",
          },
          {
            title: "📖 Fitur Ketahfidzan",
            description: "Hafalan • Ujian • Program",
            id: "ketahfidzan_menu",
          },
          {
            title: "🕌 Fitur Keislaman",
            description: "Tanya Qur'an • Hadis • Fiqh",
            id: "tanya_menu_info",
          },
          {
            title: "⚙️ Fitur Bermanfaat",
            description: "PDF • Tools • Downloader",
            id: "tools_menu_info",
          },
        ],
      },
    ],
  };

  await sendButtonMsg(
    sock,
    jid,
    {
      text,
      footer: "PPTQ AL-ITQON",
      buttons: [
        {
          buttonId: "all_menu",
          type: 1,
          buttonText: { displayText: "📖 Semua Menu" },
        },
        {
          buttonId: "list_button",
          type: 2,
          buttonText: { displayText: "📋 Daftar Menu" },
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify(params),
          },
        },
      ],
      headerType: 1,
    },
    { quoted: m }
  );
};
