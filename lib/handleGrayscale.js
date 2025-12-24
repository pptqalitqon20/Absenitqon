// lib/handleGrayscale.js
const cloudinary = require("./cloudinary");

async function handleGrayscaleImage(sock, m) {
  const msg = m.message?.imageMessage;
  if (!msg) return false;

  const buffer = await sock.downloadMediaMessage(m);

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
    m.chat,
    {
      image: { url: uploadResult.secure_url },
      caption: "🖤🤍 Gambar berhasil diubah ke hitam putih",
    },
    { quoted: m }
  );

  return true;
}


module.exports = { handleGrayscaleImage };
