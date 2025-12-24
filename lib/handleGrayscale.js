// lib/handleGrayscale.js
const cloudinary = require("./cloudinary");

async function handleGrayscaleImage(sock, m) {
  const msg = m.message?.imageMessage;
  if (!msg) return false;

  console.log("Mulai proses grayscale...");
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
}


module.exports = { handleGrayscaleImage };
