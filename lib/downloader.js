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
  await sendText(sock, chat, "⏳ Sebentar, saya sedang mendownload audio dari YouTube...");

  const sendAudio = async (src, meta = {}) => {
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

  // 1) ytMp3
  try {
    const hasil = await ytMp3(cleanUrl);
    if (!hasil || !hasil.result) throw new Error("Respon ytMp3 tidak lengkap.");
    await sendAudio({ url: hasil.result }, hasil);
    return true;
  } catch (e1) {
    console.error("ytmp3 via ytMp3 gagal:", e1?.statusCode || e1?.message || e1);
  }

  // 2) savetube
  try {
    const res = await savetube.download(cleanUrl, "mp3");
    if (!res || !res.result || !res.result.download) {
      throw new Error("Respon savetube tidak lengkap.");
    }
    await sendAudio({ url: res.result.download }, { title: res.result.title });
    return true;
  } catch (e2) {
    console.error("ytmp3 via savetube gagal:", e2?.message || e2);
  }

  // 3) NvlGroup
  try {
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

  await sendText(sock, chat, "❌ Gagal mendownload audio dari YouTube.");
  return true;
}

/**
 * YOUTUBE VIDEO (YTMP4)
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

  const cleanUrl = normalizeYouTubeUrl(url);
  await sendText(sock, chat, "⏳ Sebentar, saya sedang mendownload video dari YouTube...");

  try {
    const hasil = await ytMp4(cleanUrl);
    if (!hasil || !hasil.result) throw new Error("Respon ytMp4 tidak lengkap.");

    await sock.sendMessage(chat, {
      video: { url: hasil.result },
      caption:
        `*📍Title:* ${hasil.title || "-"}\n` +
        `*✏Description:* ${hasil.desc || ""}\n` +
        `*🚀Channel:* ${hasil.channel || "-"}\n` +
        `*🗓Upload at:* ${hasil.uploadDate || "-"}`,
    });
    return true;
  } catch (e) {
    console.error("❌ Error ytmp4:", e);
    await sendText(sock, chat, "❌ Gagal mendownload video YouTube.");
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
      if (!args) {
        await sendText(sock, chat, "contoh: `!ig https://www.instagram.com/p/xxxx/`");
        return true;
      }
      if (!args.includes("instagram.com")) {
        await sendText(sock, chat, "URL tidak mengandung Instagram.");
        return true;
      }

      await sendText(sock, chat, "⏳ Sedang mengambil media dari Instagram...");
      try {
        const hasil = await instagramDl(args);
        if (!hasil || !hasil.length) {
          await sendText(sock, chat, "❌ Postingan tidak tersedia atau privat.");
          return true;
        }

        for (const item of hasil) {
          await sock.sendMessage(chat, {
            image: { url: item.url },
            caption: "Done",
          }).catch(async () => {
            await sock.sendMessage(chat, {
              video: { url: item.url },
              caption: "Done",
            });
          });
        }
      } catch (e) {
        console.error("❌ Error instagramDl:", e);
        await sendText(sock, chat, "❌ Gagal mengambil postingan Instagram.");
      }
      return true;
    }

    // Instagram story
    if (["igstory", "instagramstory", "instastory", "storyig"].includes(cmd)) {
      if (!args) {
        await sendText(sock, chat, "contoh: `!igstory username`");
        return true;
      }

      await sendText(sock, chat, "⏳ Sedang mengambil story Instagram...");
      try {
        const hasil = await instaStory(args);
        if (!hasil || !hasil.results || !hasil.results.length) {
          await sendText(sock, chat, "❌ Story tidak ditemukan atau privat.");
          return true;
        }

        for (const s of hasil.results) {
          await sock.sendMessage(chat, {
            image: { url: s.url },
            caption: "Story",
          }).catch(async () => {
            await sock.sendMessage(chat, {
              video: { url: s.url },
              caption: "Story",
            });
          });
        }
      } catch (e) {
        console.error("❌ Error instaStory:", e);
        await sendText(sock, chat, "❌ Username tidak ditemukan atau privat.");
      }
      return true;
    }

    // TikTok video
    if ([
      "tiktok", "tiktokdown", "ttdown", "ttdl", "tt",
      "ttmp4", "ttvideo", "tiktokmp4", "tiktokvideo",
    ].includes(cmd)) {
      if (!args) {
        await sendText(sock, chat, "contoh: `!tiktok https://vt.tiktok.com/xxxx/`");
        return true;
      }
      if (!args.includes("tiktok.com")) {
        await sendText(sock, chat, "URL tidak mengandung TikTok.");
        return true;
      }

      await sendText(sock, chat, "⏳ Sedang mengambil video TikTok...");
      try {
        const hasil = await tiktokDl(args);
        if (!hasil) throw new Error("Respon tiktokDl kosong");

        if (hasil && hasil.data && Array.isArray(hasil.data)) {
          const vid = hasil.data.find((v) => v.type === "nowatermark") || hasil.data[0];
          if (vid && vid.url) {
            await sock.sendMessage(chat, {
              video: { url: vid.url },
              caption:
                `*📍Title:* ${hasil.title || "-"}\n` +
                `*⏳Duration:* ${hasil.duration || "-"}\n` +
                `*🎃Author:* ${(hasil.author && hasil.author.nickname) || "-"}`
            });
          } else {
            for (let i = 0; i < hasil.data.length; i++) {
              const item = hasil.data[i];
              await sock.sendMessage(chat, {
                image: { url: item.url },
                caption: `Image ${i + 1}`,
              });
            }
          }
        } else {
          await sendText(sock, chat, "❌ Gagal mengambil video TikTok.");
        }
      } catch (e) {
        console.error("❌ Error tiktokDl:", e);
        await sendText(sock, chat, "❌ Gagal / URL TikTok tidak valid.");
      }
      return true;
    }

    // TikTok audio
    if (["ttmp3", "tiktokmp3", "ttaudio", "tiktokaudio"].includes(cmd)) {
      if (!args) {
        await sendText(sock, chat, "contoh: `!ttmp3 https://vt.tiktok.com/xxxx/`");
        return true;
      }
      if (!args.includes("tiktok.com")) {
        await sendText(sock, chat, "URL tidak mengandung TikTok.");
        return true;
      }

      await sendText(sock, chat, "⏳ Sedang mengambil audio TikTok...");
      try {
        const hasil = await tiktokDl(args);
        if (!hasil || !hasil.music_info || !hasil.music_info.url) {
          throw new Error("Respon tiktokDl (music) tidak lengkap");
        }

        await sock.sendMessage(chat, {
          audio: { url: hasil.music_info.url },
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
              sourceUrl: args,
            },
          },
        });
      } catch (e) {
        console.error("❌ Error tiktok audio:", e);
        await sendText(sock, chat, "❌ Gagal / URL TikTok tidak valid.");
      }
      return true;
    }

    // Facebook
    if ([
      "fb", "fbdl", "fbdown", "facebook", "facebookdl",
      "facebookdown", "fbdownload", "fbmp4", "fbvideo",
    ].includes(cmd)) {
      if (!args) {
        await sendText(sock, chat, "contoh: `!fb https://www.facebook.com/...`");
        return true;
      }
      if (!args.includes("facebook.com")) {
        await sendText(sock, chat, "URL tidak mengandung Facebook.");
        return true;
      }

      await sendText(sock, chat, "⏳ Sedang mengambil video Facebook...");
      try {
        const hasil = await facebookDl(args);
        if (!hasil || !hasil.results || !hasil.results.length) {
          await sendText(sock, chat, "❌ Video tidak ditemukan.");
          return true;
        }

        await sock.sendMessage(chat, {
          video: { url: hasil.results[0].url },
          caption: `*🎐Title:* ${hasil.caption || "-"}`,
        });
      } catch (e) {
        console.error("❌ Error facebookDl:", e);
        await sendText(sock, chat, "❌ Server downloader Facebook sedang offline / error.");
      }
      return true;
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
