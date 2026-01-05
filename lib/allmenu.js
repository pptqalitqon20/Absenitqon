// lib/allmenu.js
module.exports.handleAllMenu = async function (sock, m) {
  const nomor = m.sender.split("@")[0];

  const teks =
`╭──「 📲 *MENU UTAMA BOT PPTQ AL-ITQON* 」
│Halo @${nomor} 👋
╰────

╭──「 🏫📢 *PPTQ AL-ITQON* 」
│1️⃣ Lihat Struktur Organisasi
│   └ ketik: 1
│
│2️⃣ Lihat Visi & Misi
│   └ ketik: 2
│
│3️⃣ Lihat Profil Pondok
│   └ ketik: 3
╰────

╭──「 📖📢 *KETAHFIDZAN* 」
│4️⃣ Lihat Hafalan Santri
│   └ ketik: 4
│
│5️⃣ Daftar Santri Ujian Bulanan
│   └ ketik: 5
│
│6️⃣ Lihat Program Ketahfidzan
│   └ ketik: 6
╰────

╭──「 ⚙️📢 *KEISLAMAN* 」
│7️⃣ Tanya Tentang Islam, Al-Qur'an,
│   Tafsir, Sejarah, dan Hadis
│   └ Contoh:
│     • Ayat 10 Surah Al-Baqarah
│     • Penulis Ar-Rahiq Al-Makhtum?
│
│8️⃣ Download Audio Murottal
│   └ ketik: !audio
╰────

╭──「 🛠️📢 *FITUR TAMBAHAN* 」
│9️⃣ Ubah Gambar ke PDF
│   └ Kirim gambar langsung
│   └ (Di grup: kirim gambar + tag bot)
│
│🔟 Gabung & Ambil Halaman PDF
│   └ Kirim PDF langsung
│   └ (Di grup: kirim PDF + tag bot)
│
│1️⃣1️⃣ Foto Hitam Putih (Fotokopi)
│   └ Kirim gambar + ketik: !ht
│
│1️⃣2️⃣ Word ke PDF
│   └ Kirim doc/docs + ketik: !wordpdf
│
│1️⃣3️⃣ PDF ke Word
│   └ Kirim PDF + ketik: !pdfword
│
│1️⃣4️⃣ Cetak PDF dari Chat WhatsApp
│   └ Ketik: !textpdf
│   └ Lalu ikuti arahannya
╰────

🤲 Semoga bermanfaat
🌄 Selamat Pagi`;

  await sock.sendMessage(m.chat, {
    text: teks,
    mentions: [m.sender],
  });
};
