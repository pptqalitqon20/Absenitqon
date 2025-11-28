// lib/allmenu.js
module.exports.handleAllMenu = async function (sock, m) {
    const teks = 
`Halo @${m.sender.split("@")[0]}

📲 *MENU UTAMA BOT PPTQ AL-ITQON*

🏫📢 *FITUR BERKAITAN DENGAN PPTQ AL-ITQON*
1️⃣ Lihat Struktur Organisasi _(ketik angka 1)_

====================================

📖📢 *FITUR BERKAITAN DENGAN KETAHFIDZAN*
2️⃣ Lihat Hafalan Santri _(ketik 2)_
3️⃣ Daftar Santri Ujian Bulanan _(ketik 3)_

====================================

⚙️📢 *FITUR KEISLAMAN*
4️⃣ Tanya Tentang Islam, Qur'an, Tafsir, Sejarah, Hadis
   Contoh:
   ➡️ Ayat 10 Surah Al-Baqarah
   ➡️ Penulis Ar-Rahiq Al-Makhtum?

5️⃣ Download Audio Murottal
   - !audio:114
   - !audio:1

====================================

⚙️📢 *FITUR TAMBAHAN*
6️⃣ Ubah Gambar ke PDF  
7️⃣ Gabung & Ambil Halaman PDF  

Semoga bermanfaat 🤲
Selamat Pagi 🌄`;

    await sock.sendMessage(m.chat, {
        text: teks,
        mentions: [m.sender]
    });
};
