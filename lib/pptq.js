// lib/pptq.js
// Tempat khusus fitur PPTQ AL-ITQON

// 👉 Silakan ganti isi teks struktur / visi-misi / profil
// dengan versi final milik Pondok, ini hanya contoh.

const strukturText = `
🏫🏢 *STRUKTUR ORGANISASI PONDOK PESANTREN AL-ITQON GOWA*

1. *Ketua Yayasan*
   ⬇️ H. Mansur Taswin, Lc., M.Ag

2. *Penasehat Yayasan*  
   ⬇️ Ir. H. Idris Dg Nompo

3. *Pimpinan Pondok*  
   ⬇️ H. Mansur Taswin, Lc., M.Ag

4. *Kepala Sekolah TK* 
   ⬇️ Jumrianti, A.Md

5. *Administrasi*  
   ├─ Administrator ⬇️ Muhammad Saleh, S H  
   └─ Musyrif Umum ⬇️ Syuaib Abd.Halim, Lc M.Phil

6. *Divisi-Divisi*  
   ├─ Divisi Kesatrian ⬇️ Sumardi Asaf, S.Pd.I  
   ├─ Divisi Bahasa ⬇️ Muhammad Rafli Hi Taher, S.H  
   ├─ Divisi Tahfidz ⬇️ Laode Muh. Fahril, S.H  
   ├─ Divisi Ibadah ⬇️ Muhammad Irwan, S.H  
   ├─ Divisi Keamanan ⬇️ Sumardi Asaf, S.Pd.I  
   └─ Divisi Kebersihan ⬇️ Agus Salim

7. *Tenaga Pengajar*
   ├─ Suhartono, S.Pd.I  
   ├─ Muhammad Tahir, S.H  
   ├─ Agus Salim  
   ├─ Syuaib Abdul Halim, Lc., M.Phil  
   ├─ H. Ahmad Nasing, Lc  
   ├─ H. Ramli Sudar, Lc  
   ├─ Jihadi Sawaty, A.Md.Kep  
   ├─ Muhammad Irwan, S.H  
   ├─ Muhammad Rafli Hi Taher, S.H  
   ├─ Laode Muhammad Fahril, S.H  
   ├─ Syakur Abbas, Lc  
   ├─ Muhammad Saleh, S H  
   └─ Salahuddin Al-Ayyubi Syarif

Semoga Allah memberkahi seluruh jajaran pengurus.  
*Barakallahu fiikum.* 
Ketik 👉Menu👈 Untuk Kembali
`.trim();

const visiMisiText = `
🎯 VISI & MISI PONDOK PESANTREN AL-ITQON GOWA

VISI:
🔮 Menjadi PonPes yang berlandaskan Al Qur’an dan Sunnah yang amanah, tangguh dan mandiri menuju PonPes yang diridhoi dan dicintai oleh Allah dan Rasul-Nya.

MISI:
Misi PPTQ AL-ITQON GOWA adalah:
1️⃣ Menjadikan PonPes sebagai wadah beramal Jariyah.
2️⃣ Menjadi PonPes yang Mandiri secara Financial dan Mensejahterakan Lingkungan sekitar.
3️⃣ Berlandaskan sesuai aturan Agama dan Tradisi Ahlul Sunnah Wal Jamaah.
4️⃣ Memberikan Kontribusi kepada Pemerintah dalam bidang Agama.
5️⃣ Menjunjung Tinggi Adat Bugis Makassar dalam artian Siri’ na Pacce.
6️⃣ Menjadi PonPes yang Amanah, Bertanggungjawab dan Profesional.

Pendidikan adalah investasi akhirat. Mari bersama membangun peradaban Qurani!

Barakallahu fiikum.
`.trim();

const profilText = `
🏫 PROFIL PONDOK PESANTREN AL-ITQON GOWA

Pondok Pesantren Al-Itqon Gowa adalah lembaga pendidikan Islam yang berdiri sejak tahun 2019 di Kabupaten Gowa, Sulawesi Selatan. Didirikan dengan semangat untuk membina generasi Qur’ani yang berilmu, berakhlak, dan tangguh menghadapi tantangan zaman.

Pondok ini memiliki fokus utama pada:
- Tahfizh Al-Qur’an (menghafal dan memahami Al-Qur’an)
- Pendidikan formal berbasis kurikulum nasional dan diniyah
- Pembinaan karakter dan akhlakul karimah

Dengan lingkungan yang islami dan tenaga pendidik profesional, Al-Itqon Gowa menjadi tempat pendidikan yang amanah dan berkualitas.
━━━━━━━━━━━━━━━
Informasi Lengkap:

• Nama Pondok        : Al-Itqon Gowa
• Pimpinan           : H. Manshur Taswin, Lc., M.Ag
• No. Telp Pimpinan  : 0853-9622-4242
• Alamat             : Dusun Baddo-baddo, Desa Je’nemanding
                         Kec. Pattallassang, Kab. Gowa
• Didirikan          : 01 Oktober 2019
• Status Tanah       : Wakaf (luas 4000 m²)
• Luas Bangunan      : 3500 m²
• Jumlah Santri      : 100 Orang
• Jumlah Pembina     : 12 Orang
• Sumber Dana        : Infaq Santri, Donatur tetap/tidak tetap
• NPWP Yayasan       : 94.065.697.8-807.000
• Akte Pendirian     : No. 21 (AHU-0014658.AH.01.04.Tahun 2019)

🌐 Website: (sedang dalam pengembangan)

Barakallahu fiikum.
`.trim();

async function sendStruktur(naze, m) {
  await naze.sendMessage(
    m.chat,
    {
      text: strukturText,
    },
  );
}

async function sendVisiMisi(naze, m) {
  await naze.sendMessage(
    m.chat,
    {
      text: visiMisiText,
    },
  );
}

async function sendProfil(naze, m) {
  await naze.sendMessage(
    m.chat,
    {
      text: profilText,
    },
  );
}

module.exports = {
  sendStruktur,
  sendVisiMisi,
  sendProfil,
};

