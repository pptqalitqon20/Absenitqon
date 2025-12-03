// lib/downloader.js
// Downloader sederhana hitori-pptq
// Menggunakan fungsi-fungsi dari screaper.js
// Tanpa sistem limit, tanpa Google AI, tanpa quoted reply

const {
  ytMp3,
  ytMp4,
  instagramDl,
  instaStory,
  tiktokDl,
  facebookDl,
  mediafireDl,
  spotifyDl,
  NvlGroup,
  savetube,
} = require("./screaper"); // <- biasanya screaper.js ada di root, jadi "../"

// --- Normalisasi URL YouTube agar stabil ---
function normalizeYouTubeUrl(input = "") {
  try {
    const u = new URL(input);

    // youtu.be/<id> -> www.youtube.com/watch?v=<id>
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return `https://www.youtube.com/watch?v=${id}`;
    }

    // shorts -> watch?v=
    if (u.hostname.includes("youtube.com") && u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      return `https://www.youtube.com/watch?v=${id}`;
    }

    // hapus parameter yang sering bikin scrape error
    const paramsToDrop = ["si", "pp", "feature", "list", "index", "t", "fbclid"];
    paramsToDrop.forEach((p) => u.searchParams.delete(p));

    return u.toString();
  } catch {
    return input;
  }
}

/**
 * Helper kirim teks biasa
 */
async function sendText(sock, chatId, text) {
  try {
    await sock.sendMessage(chatId, { text });
  } catch (e) {
    console.error("❌ Error sendText:", e);
  }
}

/**
 * Parsing command dasar:
 *  - text: "!ytmp3 https://youtube.com/..."
 *  -> cmd = "ytmp3"
 *  -> args = "https://youtube.com/..."
 */
function parseCommand(text) {
  if (!text) return { cmd: "", args: "" };

  const parts = text.trim().split(/\s+/);
  const first = parts[0] || "";
  const rest = parts.slice(1).join(" ").trim();

  const cmd = first.startsWith("!") ? first.slice(1).toLowerCase() : first.toLowerCase();
  return { cmd, args: rest };
}

/**
 * Cek URL sederhana
 */
function isUrl(str = "") {
  return /^https?:\/\//i.test(str);
}

/**
 * YOUTUBE AUDIO (YTMP3 + fallback)
 */
async function handleYtAudio(sock, chat, url) {
  if (!url) {
    await sendText(sock, chat, "contoh: `!ytmp3 https://youtu.be/xxxx`");
    return true;
  }
  if (!url.includes("youtu")) {
    await sendText(sock, chat, "URL tidak mengandung YouTube.");
    return true;
  }

  const cleanUrl = normalizeYouTubeUrl(url);

  // 1. Kirim pesan loading
  const loadingMsg = await sock.sendMessage(chat, {
    text: "⏳ Sebentar, saya sedang mendownload audio dari YouTube..."
  });

  // Helper kirim audio
  const sendAudio = async (src, meta = {}) => {
    // 3.a Hapus pesan loading
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    // 3.b Kirim pesan sukses
    await sock.sendMessage(chat, {
      text: "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇."
    });

    // 3.c Kirim audio
    await sock.sendMessage(chat, {
      audio: src.url ? { url: src.url } : src,
      mimetype: "audio/mpeg",
      contextInfo: {
        externalAdReply: {
          title: meta.title || "YouTube Audio",
          body: meta.channel || "",
          previewType: "PHOTO",
          thumbnailUrl: meta.thumb || undefined,
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: cleanUrl,
        },
      },
    });
  };

  try {
    // 2.1 Coba ytMp3 dulu
    const hasil = await ytMp3(cleanUrl);
    if (!hasil || !hasil.result) throw new Error("Respon ytMp3 tidak lengkap.");
    await sendAudio({ url: hasil.result }, hasil);
    return true;
  } catch (e1) {
    console.error("ytmp3 via ytMp3 gagal:", e1?.statusCode || e1?.message || e1);
  }

  try {
    // 2.2 Fallback: savetube mp3
    const res = await savetube.download(cleanUrl, "mp3");
    if (!res || !res.result || !res.result.download) {
      throw new Error("Respon savetube tidak lengkap.");
    }
    await sendAudio({ url: res.result.download }, { title: res.result.title });
    return true;
  } catch (e2) {
    console.error("ytmp3 via savetube gagal:", e2?.message || e2);
  }

  try {
    // 2.3 Fallback: NvlGroup
    const nvl = new NvlGroup();
    const anu = await nvl.download(cleanUrl);
    if (!anu.audio || !anu.audio.length) {
      throw new Error("Tidak ada audio di NvlGroup");
    }
    await sendAudio({ url: anu.audio[0].url });
    return true;
  } catch (e3) {
    console.error("ytmp3 via NvlGroup gagal:", e3?.message || e3);
  }

  // 4. Kalau semua gagal
  try {
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }
  } finally {
    await sendText(sock, chat, "❌ Gagal mendownload audio dari YouTube.");
  }

  return true;
}
/**
 * YOUTUBE VIDEO (YTMP4 + fallback)
 */
async function handleYtVideo(sock, chat, url) {
  if (!url) {
    await sendText(sock, chat, "contoh: `!ytmp4 https://youtu.be/xxxx`");
    return true;
  }
  if (!url.includes("youtu")) {
    await sendText(sock, chat, "URL tidak mengandung YouTube.");
    return true;
  }

  // Bersihkan URL dulu
  const cleanUrl = normalizeYouTubeUrl(url);

  // 1. Kirim pesan loading
  const loadingMsg = await sock.sendMessage(chat, {
    text: "⏳ Sebentar, saya sedang mendownload video dari YouTube..."
  });

  // Helper kirim video
  const sendVideo = async (videoContent, meta = {}) => {
    // 3.a Hapus pesan loading
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    // 3.b Kirim pesan sukses
    await sock.sendMessage(chat, {
      text: "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇."
    });

    // 3.c Kirim video
    await sock.sendMessage(chat, {
      video: videoContent, // bisa Buffer / { url: ... }
      caption:
        `*📍Title:* ${meta.title || "-"}\n` +
        `*✏Description:* ${meta.desc || ""}\n` +
        `*🚀Channel:* ${meta.channel || "-"}\n` +
        `*🗓Upload at:* ${meta.uploadDate || "-"}`
    });
  };

  try {
    // 2.1 Coba pakai ytMp4 dulu
    const hasil = await ytMp4(cleanUrl);
    if (!hasil || !hasil.result) throw new Error("Respon ytMp4 tidak lengkap.");
    // hasil.result biasanya Buffer atau objek yang sudah siap dipakai langsung
    await sendVideo(hasil.result, hasil);
    return true;
  } catch (e1) {
    console.error("ytmp4 via ytMp4 gagal:", e1?.statusCode || e1?.message || e1);
  }

  try {
    // 2.2 Fallback via savetube (video 360p)
    const res = await savetube.download(cleanUrl, "360");
    if (!res || !res.result || !res.result.download) {
      throw new Error("Respon savetube tidak lengkap.");
    }
    // Di sini videoContent pakai { url: ... }
    await sendVideo({ url: res.result.download }, { title: res.result.title });
    return true;
  } catch (e2) {
    console.error("ytmp4 via savetube gagal:", e2?.message || e2);
  }

  // 4. Kalau semua gagal
  try {
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }
  } finally {
    await sendText(sock, chat, "❌ Gagal mendownload video dari YouTube.");
  }

  return true;
}
/**
 * INSTAGRAM POST (foto / video / carousel)
 */
async function handleInstagram(sock, chat, url) {
  if (!url) {
    await sendText(sock, chat, "contoh: `!ig https://www.instagram.com/p/xxxx/`");
    return true;
  }
  if (!url.includes("instagram.com")) {
    await sendText(sock, chat, "URL tidak mengandung Instagram.");
    return true;
  }

  // 1. Kirim pesan loading
  const loadingMsg = await sock.sendMessage(chat, {
    text: "⏳ Sedang mengambil media dari Instagram..."
  });

  try {
    const hasil = await instagramDl(url);

    if (!hasil || !hasil.length) {
      // Tidak ada hasil -> hapus loading & kirim pesan gagal
      if (loadingMsg?.key) {
        await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
      }
      await sendText(sock, chat, "❌ Postingan tidak tersedia atau akun privat.");
      return true;
    }

    // 2. Hapus loading & kirim pesan sukses
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sock.sendMessage(chat, {
      text: "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇."
    });

    // 3. Kirim semua media
    for (const item of hasil) {
      // Kita coba sebagai image dulu, kalau gagal baru video
      await sock.sendMessage(chat, {
        image: { url: item.url },
        caption: item.title || "Instagram"
      }).catch(async () => {
        await sock.sendMessage(chat, {
          video: { url: item.url },
          caption: item.title || "Instagram"
        });
      });
    }

    return true;
  } catch (e) {
    console.error("❌ Error instagramDl:", e);

    // Hapus loading bila ada
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sendText(sock, chat, "❌ Gagal mengambil postingan Instagram.");
    return true;
  }
}
/**
 * INSTAGRAM STORY
 */
async function handleInstaStory(sock, chat, username) {
  if (!username) {
    await sendText(sock, chat, "contoh: `!igstory username_ig`");
    return true;
  }

  // 1. Kirim pesan loading
  const loadingMsg = await sock.sendMessage(chat, {
    text: "⏳ Sedang mengambil story Instagram..."
  });

  try {
    const hasil = await instaStory(username);

    if (!hasil || !hasil.results || !hasil.results.length) {
      // Tidak ada story
      if (loadingMsg?.key) {
        await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
      }
      await sendText(sock, chat, "❌ Story tidak ditemukan atau akun privat.");
      return true;
    }

    // 2. Hapus loading & kirim pesan sukses
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sock.sendMessage(chat, {
      text: "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇."
    });

    // 3. Kirim semua story
    for (const s of hasil.results) {
      const isVideo = s.type === "video";

      if (isVideo) {
        await sock.sendMessage(chat, {
          video: { url: s.url },
          caption: "Story Video"
        });
      } else {
        await sock.sendMessage(chat, {
          image: { url: s.url },
          caption: "Story Foto"
        });
      }
    }

    return true;
  } catch (e) {
    console.error("❌ Error instaStory:", e);

    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sendText(sock, chat, "❌ Username tidak ditemukan atau privat.");
    return true;
  }
}
/**
 * TIKTOK VIDEO (tanpa watermark kalau tersedia)
 */
async function handleTiktokVideo(sock, chat, url) {
  if (!url) {
    await sendText(sock, chat, "contoh: `!tiktok https://www.tiktok.com/@user/video/xxxx`");
    return true;
  }
  if (!url.includes("tiktok.com")) {
    await sendText(sock, chat, "URL tidak mengandung TikTok.");
    return true;
  }

  // 1. Kirim pesan loading
  const loadingMsg = await sock.sendMessage(chat, {
    text: "⏳ Sedang mengambil video TikTok..."
  });

  try {
    const hasil = await tiktokDl(url);
    if (!hasil) {
      throw new Error("Respon tiktokDl kosong");
    }

    // Struktur umum yang dipakai repo hitori:
    // - hasil.data: array media (video/image)
    // - hasil.title, hasil.duration
    // - hasil.author.nickname
    const data = Array.isArray(hasil.data) ? hasil.data : [];

    if (!data.length) {
      throw new Error("Tidak ada data media di hasil TikTok");
    }

    // Cari video tanpa watermark kalau ada, kalau tidak pakai entri pertama
    const vid =
      data.find((v) => v.type === "nowatermark" || v.quality === "nowm") ||
      data[0];

    if (!vid || !vid.url) {
      throw new Error("Tidak menemukan URL video TikTok yang valid");
    }

    // 2. Hapus loading & kirim pesan sukses
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sock.sendMessage(chat, {
      text: "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇."
    });

    // 3. Kirim videonya
    await sock.sendMessage(chat, {
      video: { url: vid.url },
      caption:
        `*📍Title:* ${hasil.title || "-"}\n` +
        `*⏳Duration:* ${hasil.duration || "-"}\n` +
        `*🎃Author:* ${(hasil.author && hasil.author.nickname) || "-"}`
    });

    return true;
  } catch (e) {
    console.error("❌ Error tiktok video:", e);

    // Hapus loading kalau ada
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sendText(sock, chat, "❌ Gagal / URL TikTok tidak valid atau media tidak bisa diambil.");
    return true;
  }
}
/**
 * TIKTOK AUDIO (MP3 / musik dari video)
 */
async function handleTiktokAudio(sock, chat, url) {
  if (!url) {
    await sendText(sock, chat, "contoh: `!ttmp3 https://www.tiktok.com/@user/video/xxxx`");
    return true;
  }
  if (!url.includes("tiktok.com")) {
    await sendText(sock, chat, "URL tidak mengandung TikTok.");
    return true;
  }

  // 1. Kirim pesan loading
  const loadingMsg = await sock.sendMessage(chat, {
    text: "⏳ Sedang mengambil audio TikTok..."
  });

  try {
    const hasil = await tiktokDl(url);
    if (!hasil || !hasil.music_info || !hasil.music_info.url) {
      throw new Error("Respon tiktokDl (music_info) tidak lengkap");
    }

    const audioUrl = hasil.music_info.url;

    // 2. Hapus loading & kirim pesan sukses
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sock.sendMessage(chat, {
      text: "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇."
    });

    // 3. Kirim audio
    await sock.sendMessage(chat, {
      audio: { url: audioUrl },
      mimetype: "audio/mpeg",
      contextInfo: {
        externalAdReply: {
          title: "TikTok • " + (hasil.author?.nickname || "-"),
          body:
            (hasil.stats?.likes || "0") +
            " suka, " +
            (hasil.stats?.comment || "0") +
            " komentar. " +
            (hasil.title || ""),
          previewType: "PHOTO",
          thumbnailUrl: hasil.cover || undefined,
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: url,
        },
      },
    });

    return true;
  } catch (e) {
    console.error("❌ Error tiktok audio:", e);

    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sendText(sock, chat, "❌ Gagal / URL TikTok tidak valid atau audio tidak bisa diambil.");
    return true;
  }
}
/**
 * FACEBOOK VIDEO
 */
async function handleFacebookVideo(sock, chat, url) {
  if (!url) {
    await sendText(sock, chat, "contoh: `!fb https://www.facebook.com/watch/?v=xxxx`");
    return true;
  }
  if (!url.includes("facebook.com")) {
    await sendText(sock, chat, "URL tidak mengandung Facebook.");
    return true;
  }

  // 1. Kirim pesan loading
  const loadingMsg = await sock.sendMessage(chat, {
    text: "⏳ Sedang mengambil video Facebook..."
  });

  try {
    const hasil = await facebookDl(url);

    // Struktur umum yang dipakai di banyak bot:
    // hasil.results = [ { url: '...', quality: '...', ... }, ... ]
    // hasil.caption  = 'Judul / keterangan'
    if (!hasil || !Array.isArray(hasil.results) || hasil.results.length === 0) {
      if (loadingMsg?.key) {
        await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
      }
      await sendText(sock, chat, "❌ Video tidak ditemukan atau tidak bisa diambil.");
      return true;
    }

    const videoData = hasil.results[0];

    // 2. Hapus loading & kirim pesan sukses
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sock.sendMessage(chat, {
      text: "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇."
    });

    // 3. Kirim video
    await sock.sendMessage(chat, {
      video: { url: videoData.url },
      caption: `*🎐Title:* ${hasil.caption || "Video Facebook"}`
    });

    return true;
  } catch (e) {
    console.error("❌ Error facebookDl:", e);

    // Hapus loading kalau ada
    if (loadingMsg?.key) {
      await sock.sendMessage(chat, { delete: loadingMsg.key }).catch(() => {});
    }

    await sendText(sock, chat, "❌ Server downloader Facebook sedang offline / error.");
    return true;
  }
}
/**
 * Handler utama downloader
 *
 * Dipanggil dari naze.js:
 *   const dlHandled = await handleDownloaderCommand(sock, m, text);
 *   if (dlHandled) return;
 */
async function handleDownloaderCommand(sock, m, text) {
  const chat = m.chat;
  const { cmd, args } = parseCommand(text || "");

  const dlCommands = [
    "ytmp3", "ytaudio", "ytplayaudio",
    "ytmp4", "ytvideo", "ytplayvideo",
    "ig", "instagram", "instadl", "igdown", "igdl",
    "igstory", "instagramstory", "instastory", "storyig",
    "tiktok", "tiktokdown", "ttdown", "ttdl", "tt", "ttmp4", "ttvideo", "tiktokmp4", "tiktokvideo",
    "ttmp3", "tiktokmp3", "ttaudio", "tiktokaudio",
    "fb", "fbdl", "fbdown", "facebook", "facebookdl", "facebookdown", "fbdownload", "fbmp4", "fbvideo",
    "mediafire", "mf",
    "spotifydl",
  ];

  if (!dlCommands.includes(cmd)) {
    return false; // bukan perintah downloader
  }

  try {
    // YouTube audio
    if (["ytmp3", "ytaudio", "ytplayaudio"].includes(cmd)) {
      return await handleYtAudio(sock, chat, args);
    }

    // YouTube video
    if (["ytmp4", "ytvideo", "ytplayvideo"].includes(cmd)) {
      return await handleYtVideo(sock, chat, args);
    }

    // Instagram post
    if (["ig", "instagram", "instadl", "igdown", "igdl"].includes(cmd)) {
      return await handleInstagram(sock, chat, args);
    }

    // Instagram story
    if (["igstory", "instagramstory", "instastory", "storyig"].includes(cmd)) {
      return await handleInstaStory(sock, chat, args);
    }
    // TikTok video
    if ([
      "tiktok", "tiktokdown", "ttdown", "ttdl", "tt",
      "ttmp4", "ttvideo", "tiktokmp4", "tiktokvideo",
    ].includes(cmd)) {
      return await handleTiktokVideo(sock, chat, args);
    }
    // TikTok audio
    if (["ttmp3", "tiktokmp3", "ttaudio", "tiktokaudio"].includes(cmd)) {
      return await handleTiktokAudio(sock, chat, args);
    }
    // Facebook video
    if ([
      "fb", "fbdl", "fbdown", "facebook", "facebookdl",
      "facebookdown", "fbdownload", "fbmp4", "fbvideo",
    ].includes(cmd)) {
    return await handleFacebookVideo(sock, chat, args);
    }
    // Mediafire
    if (["mediafire", "mf"].includes(cmd)) {
      if (!args) {
        await sendText(sock, chat, "contoh: `!mediafire https://www.mediafire.com/file/xxxxx/xxxxx.zip/file`");
        return true;
      }
      if (!isUrl(args) || !args.includes("mediafire.com")) {
        await sendText(sock, chat, "URL Mediafire tidak valid.");
        return true;
      }

      await sendText(sock, chat, "⏳ Sedang mengambil file dari Mediafire...");
      try {
        const anu = await mediafireDl(args);
        await sock.sendMessage(chat, {
          document: { url: anu.link },
          mimetype: anu.type || "application/octet-stream",
          fileName: anu.name || "file",
          caption:
            "*MEDIAFIRE DOWNLOADER*\n\n" +
            `*Name* : ${anu.name || "-"}\n` +
            `*Size* : ${anu.size || "-"}\n` +
            `*Type* : ${anu.type || "-"}\n` +
            `*Upload At* : ${anu.upload_date || "-"}\n` +
            `*Link* : ${anu.link || "-"}`,
        });
      } catch (e) {
        console.error("❌ Error mediafireDl:", e);
        await sendText(sock, chat, "❌ Gagal mengambil file dari Mediafire.");
      }
      return true;
    }

    // Spotify
    if (cmd === "spotifydl") {
      if (!args) {
        await sendText(sock, chat, "contoh: `!spotifydl https://open.spotify.com/track/xxxx`");
        return true;
      }
      if (!isUrl(args) || !args.includes("open.spotify.com/track")) {
        await sendText(sock, chat, "URL Spotify track tidak valid.");
        return true;
      }

      await sendText(sock, chat, "⏳ Sedang mengambil audio dari Spotify...");
      try {
        const hasil = await spotifyDl(args);
        if (!hasil || !hasil.download) {
          throw new Error("Respon spotifyDl tidak lengkap");
        }

        await sock.sendMessage(chat, {
          audio: { url: hasil.download },
          mimetype: "audio/mpeg",
          contextInfo: {
            externalAdReply: {
              title: hasil.title || "Spotify Track",
              body: hasil.duration ? `Duration: ${hasil.duration}` : "",
              previewType: "PHOTO",
              thumbnailUrl: hasil.cover || undefined,
              mediaType: 1,
              renderLargerThumbnail: true,
              sourceUrl: args,
            },
          },
        });
      } catch (e) {
        console.error("❌ Error spotifyDl:", e);
        await sendText(sock, chat, "❌ Server download Spotify sedang offline / error.");
      }
      return true;
    }

  } catch (e) {
    console.error("❌ Error handleDownloaderCommand:", e);
    await sendText(sock, chat, "❌ Terjadi kesalahan di fitur downloader.");
    return true;
  }

  return true;
}

module.exports = { handleDownloaderCommand };
