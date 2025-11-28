// ===========================================
//  SUBMENU KETAHFIDZAN
//  (Hafalan, Ujian, Program)
// ===========================================

module.exports.handleKetahfidzanMenu = async (sock, m) => {
  const jid = m.key.remoteJid;
  const sender = m.pushName || "Santri";

  const text =
`📖 *FITUR BERKAITAN DENGAN KETAHFIDZAN*

Assalamualaikum *${sender}* 👋

Silakan pilih salah satu menu di bawah ini:

1️⃣ Lihat Hafalan Santri
2️⃣ Daftar Santri Selesai Ujian
3️⃣ Program Ketahfidzan`;

  await sock.sendMessage(jid, {
    text,
    footer: "Divisi Ketahfidzan PPTQ AL-ITQON",
    buttons: [
      {
        buttonId: "hafalan_lihat",
        buttonText: { displayText: "📖 Lihat Hafalan Santri" },
        type: 1
      },
      {
        buttonId: "hafalan_daftar_ujian",
        buttonText: { displayText: "📝 Daftar Santri Selesai Ujian" },
        type: 1
      },
      {
        buttonId: "hafalan_program",
        buttonText: { displayText: "📚 Program Ketahfidzan" },
        type: 1
      }
    ],
    headerType: 1
  });
};
