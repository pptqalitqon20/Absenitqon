// lib/handleGrayscale.js
const cloudinary = require("./cloudinary");

async function handleGrayscaleImage(sock, m) {
  try {
    const msg = m.message?.imageMessage;
    if (!msg) {
      console.log("Tidak ada imageMessage");
      return false;
    }

    const buffer = await sock.downloadMediaMessage(m);
    console.log("Buffer size:", buffer?.length);

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "pptq/grayscale",
            transformation: [{ effect: "grayscale" }],
          },
          (err, res) => {
            if (err) {
              console.error("Cloudinary error:", err);
              reject(err);
            } else {
              console.log("Cloudinary upload success:", res.secure_url);
              resolve(res);
            }
          }
        )
        .end(buffer);
    });

    await sock.sendMessage(
      m.chat,
      {
        image: { url: uploadResult.secure_url },
        caption: "🖤🤍 Gambar berhasil diubah ke hitam putih",
      },
      { quoted: m }
    );

    return true;
  } catch (e) {
    console.error("Error di handleGrayscaleImage:", e);
    await sock.sendMessage(m.chat, { text: "❌ Gagal proses grayscale: " + e.message });
    return false;
  }
}

module.exports = { handleGrayscaleImage };
