// handlers/converterHandler.js
// Fitur downloader sederhana: !ytmp3 dan !ytmp4

const fs = require("fs");
const path = require("path");
const ytdl = require("@distube/ytdl-core");
const { startTyping, stopTyping } = require("./pdfMergeHandler");

// Folder sementara untuk simpan file hasil download
const TMP_DIR = path.join(__dirname, "..", "tmp");
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Normalisasi URL YouTube (termasuk Shorts)
function normalizeYouTubeUrl(rawUrl) {
  let url = (rawUrl || "").trim();

  // short link: youtu.be/ID -> youtube.com/watch?v=ID
  if (url.includes("youtu.be/")) {
    try {
      const part = url.split("youtu.be/")[1];
      const id = part.split(/[?&]/)[0];
      url = `https://www.youtube.com/watch?v=${id}`;
    } catch (e) {
      console.warn("[CONVERTER] Gagal normalisasi youtu.be:", e.message);
    }
  }

  // shorts: youtube.com/shorts/ID -> youtube.com/watch?v=ID
  if (url.includes("youtube.com/shorts/")) {
    try {
      const afterShorts = url.split("/shorts/")[1]; // "9vWDK5VZaJk?feature=shared"
      const videoId = afterShorts.split(/[?&]/)[0]; // "9vWDK5VZaJk"
      const newUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log("[CONVERTER] Normalize shorts →", newUrl);
      url = newUrl;
    } catch (e) {
      console.warn("[CONVERTER] Gagal normalisasi shorts URL:", e.message);
    }
  }

  return url;
}

// Download audio-only ke file lokal, return info
async function downloadYoutubeAudio(url) {
  console.log("[YTDL] [AUDIO] Validating URL:", url);
  if (!ytdl.validateURL(url)) {
    throw new Error("URL YouTube tidak valid.");
  }

  console.log("[YTDL] [AUDIO] Fetching info...");
  const info = await ytdl.getInfo(url);

  const format = ytdl.chooseFormat(info.formats, {
    quality: "highestaudio",
    filter: "audioonly",
  });

  if (!format || !format.url) {
    throw new Error("Tidak menemukan format audio yang cocok.");
  }

  console.log("[YTDL] [AUDIO] Chosen format:", {
    itag: format.itag,
    mimeType: format.mimeType,
    container: format.container,
  });

  const ext = format.container || "webm";
  const filePath = path.join(
    TMP_DIR,
    `yt-audio-${Date.now()}.${ext.replace(/[^a-z0-9]/gi, "")}`
  );

  console.log("[YTDL] [AUDIO] Downloading to:", filePath);

  await new Promise((resolve, reject) => {
    const stream = ytdl(url, { format });

    stream.on("progress", (chunkLen, downloaded, total) => {
      // opsional: log progress
      // console.log('[YTDL] [AUDIO] progress', downloaded, '/', total);
    });

    stream.on("error", (err) => {
      console.error("[YTDL] [AUDIO] Stream error:", err);
      reject(err);
    });

    const writeStream = fs.createWriteStream(filePath);
    writeStream.on("finish", () => {
      console.log("[YTDL] [AUDIO] Download finished.");
      resolve();
    });
    writeStream.on("error", (err) => {
      console.error("[YTDL] [AUDIO] Write error:", err);
      reject(err);
    });

    stream.pipe(writeStream);
  });

  const title = info.videoDetails?.title || "Audio YouTube";
  const author = info.videoDetails?.author?.name || "YouTube";

  return { filePath, title, author, ext };
}

// Download video 360p ke file lokal, return info
async function downloadYoutubeVideo(url) {
  console.log("[YTDL] [VIDEO] Validating URL:", url);
  if (!ytdl.validateURL(url)) {
    throw new Error("URL YouTube tidak valid.");
  }

  console.log("[YTDL] [VIDEO] Fetching info...");
  const info = await ytdl.getInfo(url);

  // Coba pilih 360p mp4
  let format =
    ytdl
      .filterFormats(info.formats, "videoandaudio")
      .find((f) => f.qualityLabel === "360p" && f.container === "mp4") || null;

  // Fallback: pilih format video+audio pertama
  if (!format) {
    const candidates = ytdl.filterFormats(info.formats, "videoandaudio");
    format = candidates[0];
  }

  if (!format || !format.url) {
    throw new Error("Tidak menemukan format video yang cocok.");
  }

  console.log("[YTDL] [VIDEO] Chosen format:", {
    itag: format.itag,
    mimeType: format.mimeType,
    quality: format.qualityLabel,
    container: format.container,
  });

  const ext = format.container || "mp4";
  const filePath = path.join(
    TMP_DIR,
    `yt-video-${Date.now()}.${ext.replace(/[^a-z0-9]/gi, "")}`
  );

  console.log("[YTDL] [VIDEO] Downloading to:", filePath);

  await new Promise((resolve, reject) => {
    const stream = ytdl(url, { format });

    stream.on("progress", (chunkLen, downloaded, total) => {
      // opsional: log progress
      // console.log('[YTDL] [VIDEO] progress', downloaded, '/', total);
    });

    stream.on("error", (err) => {
      console.error("[YTDL] [VIDEO] Stream error:", err);
      reject(err);
    });

    const writeStream = fs.createWriteStream(filePath);
    writeStream.on("finish", () => {
      console.log("[YTDL] [VIDEO] Download finished.");
      resolve();
    });
    writeStream.on("error", (err) => {
      console.error("[YTDL] [VIDEO] Write error:", err);
      reject(err);
    });

    stream.pipe(writeStream);
  });

  const title = info.videoDetails?.title || "Video YouTube";
  const author = info.videoDetails?.author?.name || "YouTube";

  return { filePath, title, author, ext };
}

// Handler utama yang dipanggil dari naze.js
async function handleConverter(sock, m) {
  const text = (m.text || "").trim();
  if (!text) return false;

  const lc = text.toLowerCase();

  // =========================
  //  !ytmp3 <url>
  // =========================
  if (lc.startsWith("!ytmp3")) {
    const parts = text.split(/\s+/);
    let url = parts[1];

    if (!url) {
      await sock.sendMessage(m.chat, {
        text: "❗ Contoh: `!ytmp3 https://www.youtube.com/watch?v=...`",
      });
      return true;
    }

    url = normalizeYouTubeUrl(url);

    if (!url.includes("youtu")) {
      await sock.sendMessage(m.chat, {
        text: "❌ URL tidak mengandung YouTube.",
      });
      return true;
    }

    console.log("[CONVERTER] !ytmp3 command, url =", url);

    let typing;
    let filePath = null;
    let loadingMsg = null;

    try {
      typing = startTyping(sock, m.chat);
      loadingMsg = await sock.sendMessage(m.chat, {
        text: "⏳ Sedang menyiapkan audio YouTube...",
      });

      const result = await downloadYoutubeAudio(url);
      filePath = result.filePath;

      // hapus pesan loading
      if (loadingMsg?.key) {
        await sock.sendMessage(m.chat, { delete: loadingMsg.key });
        loadingMsg = null;
      }

      console.log("[CONVERTER] !ytmp3 download done, sending file...");

      await sock.sendMessage(m.chat, {
        audio: { url: filePath },
        mimetype: "audio/mpeg",
        ptt: false,
        contextInfo: {
          externalAdReply: {
            title: result.title,
            body: result.author,
            previewType: "PHOTO",
            mediaType: 1,
            renderLargerThumbnail: true,
            sourceUrl: url,
          },
        },
      });

      return true;
    } catch (err) {
      console.error("❌ Error !ytmp3:", err);
      if (loadingMsg?.key) {
        try {
          await sock.sendMessage(m.chat, { delete: loadingMsg.key });
        } catch {}
      }
      await sock.sendMessage(m.chat, {
        text: "❌ Gagal download audio",
      });
      return true;
    } finally {
      stopTyping(sock, m.chat, typing);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }
  }

  // =========================
  //  !ytmp4 <url>
  // =========================
  if (lc.startsWith("!ytmp4")) {
    const parts = text.split(/\s+/);
    let url = parts[1];

    if (!url) {
      await sock.sendMessage(m.chat, {
        text: "❗ Contoh: `!ytmp4 https://www.youtube.com/watch?v=...`",
      });
      return true;
    }

    url = normalizeYouTubeUrl(url);

    if (!url.includes("youtu")) {
      await sock.sendMessage(m.chat, {
        text: "❌ URL tidak mengandung YouTube.",
      });
      return true;
    }

    console.log("[CONVERTER] !ytmp4 command, url =", url);

    let typing;
    let filePath = null;
    let loadingMsg = null;

    try {
      typing = startTyping(sock, m.chat);
      loadingMsg = await sock.sendMessage(m.chat, {
        text: "⏳ Sedang menyiapkan video YouTube...",
      });

      const result = await downloadYoutubeVideo(url);
      filePath = result.filePath;

      if (loadingMsg?.key) {
        await sock.sendMessage(m.chat, { delete: loadingMsg.key });
        loadingMsg = null;
      }

      console.log("[CONVERTER] !ytmp4 download done, sending file...");

      await sock.sendMessage(m.chat, {
        video: { url: filePath },
        caption: `*📍Title:* ${result.title}\n*🚀Channel:* ${result.author}`,
      });

      return true;
    } catch (err) {
      console.error("❌ Error !ytmp4:", err);
      if (loadingMsg?.key) {
        try {
          await sock.sendMessage(m.chat, { delete: loadingMsg.key });
        } catch {}
      }
      await sock.sendMessage(m.chat, {
        text: "❌ Gagal download video",
      });
      return true;
    } finally {
      stopTyping(sock, m.chat, typing);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }
  }

  // Kalau bukan command converter, kembalikan false
  return false;
}

module.exports = { handleConverter };
