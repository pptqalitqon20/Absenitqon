// lib/handleGrayscale.js
const cloudinary = require("./cloudinary");

async function handleGrayscaleImage(sock, msg) {
  const imgMsg = msg.message?.imageMessage;
  if (!imgMsg) {
    console.log("Tidak ada imageMessage");
    return false;
  }

  const buffer = await sock.downloadMediaMessage(msg);

  const uploadResult = await new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "pptq/grayscale",
          transformation: [{ effect: "grayscale" }],
        },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        }
      )
      .end(buffer);
  });

  await sock.sendMessage(
    msg.key.remoteJid || msg.chat,
    {
      image: { url: uploadResult.secure_url },
      caption: "🖤🤍 Gambar berhasil diubah ke hitam putih",
    },
    { quoted: msg }
  );

  return true;
}

module.exports = { handleGrayscaleImage };
