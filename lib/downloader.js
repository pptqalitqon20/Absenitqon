// lib/downloader.js
// Downloader sederhana hitori-pptq (silent auto-convert + success AFTER send)
// Menggunakan fungsi-fungsi dari screaper.js

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
} = require("./screaper");

// helper simple
function normalizeYouTubeUrl(input = "") {
  try {
    const u = new URL(input);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return `https://www.youtube.com/watch?v=${id}`;
    }
    if (u.hostname.includes("youtube.com") && u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      return `https://www.youtube.com/watch?v=${id}`;
    }
    const paramsToDrop = ["si", "pp", "feature", "list", "index", "t", "fbclid"];
    paramsToDrop.forEach((p) => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return input;
  }
}

async function sendText(sock, chatId, text) {
  try { await sock.sendMessage(chatId, { text }); } catch (e) { console.error("sendText err", e); }
}

function parseCommand(text) {
  if (!text) return { cmd: "", args: "" };
  const parts = text.trim().split(/\s+/);
  const first = parts[0] || "";
  const rest = parts.slice(1).join(" ").trim();
  const cmd = first.startsWith("!") ? first.slice(1).toLowerCase() : first.toLowerCase();
  return { cmd, args: rest };
}

function extractFirstUrl(text = "") {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0].replace(/[)\]}.,]$/,"") : null;
}

function detectProvider(url = "") {
  if (!url) return null;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h.includes("youtu") || h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
    if (h.includes("instagram.com")) return "instagram";
    if (h.includes("tiktok.com") || h.includes("vt.tiktok.com")) return "tiktok";
    if (h.includes("facebook.com") || h.includes("fb.watch") || h.includes("fbcdn")) return "facebook";
    if (h.includes("mediafire.com")) return "mediafire";
    if (h.includes("spotify.com")) return "spotify";
    return "unknown";
  } catch {
    return null;
  }
}

// ---------- YT AUDIO (explicit only) ----------
async function handleYtAudio(sock, chat, url) {
  if (!url) { await sendText(sock, chat, "contoh: `!ytmp3 https://youtu.be/xxxx`"); return true; }
  if (!url.includes("youtu")) { await sendText(sock, chat, "URL tidak mengandung YouTube."); return true; }

  const cleanUrl = normalizeYouTubeUrl(url);

  const sendAudio = async (src, meta = {}) => {
    try {
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
      // baru kirim success setelah audio sukses terkirim
      await sendText(sock, chat, "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇.");
    } catch (e) {
      console.error("❌ sendAudio error:", e);
      await sendText(sock, chat, "❌ Gagal mengirim audio.");
    }
  };

  try {
    const hasil = await ytMp3(cleanUrl);
    if (!hasil || !hasil.result) throw new Error("Respon ytMp3 tidak lengkap.");
    await sendAudio({ url: hasil.result }, hasil);
    return true;
  } catch (e1) {
    console.error("ytmp3 via ytMp3 gagal:", e1?.message || e1);
  }

  try {
    const res = await savetube.download(cleanUrl, "mp3");
    if (!res || !res.result || !res.result.download) throw new Error("Respon savetube tidak lengkap.");
    await sendAudio({ url: res.result.download }, { title: res.result.title });
    return true;
  } catch (e2) {
    console.error("ytmp3 via savetube gagal:", e2?.message || e2);
  }

  try {
    const nvl = new NvlGroup();
    const anu = await nvl.download(cleanUrl);
    if (!anu.audio || !anu.audio.length) throw new Error("Tidak ada audio di NvlGroup");
    await sendAudio({ url: anu.audio[0].url });
    return true;
  } catch (e3) {
    console.error("ytmp3 via NvlGroup gagal:", e3?.message || e3);
  }

  await sendText(sock, chat, "❌ Gagal mendownload audio dari YouTube.");
  return true;
}

// ---------- YT VIDEO (auto when detected) ----------
async function handleYtVideo(sock, chat, url) {
  if (!url) { await sendText(sock, chat, "contoh: `!ytmp4 https://youtu.be/xxxx`"); return true; }
  if (!url.includes("youtu")) { await sendText(sock, chat, "URL tidak mengandung YouTube."); return true; }

  const cleanUrl = normalizeYouTubeUrl(url);

  const sendVideo = async (videoContent, meta = {}) => {
    try {
      // kirim video pertama, tunggu selesai
      await sock.sendMessage(chat, {
        video: videoContent,
        caption:
          `*📍Title:* ${meta.title || "-"}\n` +
          `*✏Description:* ${meta.desc || ""}\n` +
          `*🚀Channel:* ${meta.channel || "-"}\n` +
          `*🗓Upload at:* ${meta.uploadDate || "-"}`
      });
      // baru kirim success setelah video sukses dikirim
      await sendText(sock, chat, "Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻.");
    } catch (e) {
      console.error("❌ sendVideo error:", e);
      await sendText(sock, chat, "❌ Gagal mengirim video.");
    }
  };

  try {
    const hasil = await ytMp4(cleanUrl);
    if (!hasil || !hasil.result) throw new Error("Respon ytMp4 tidak lengkap.");
    await sendVideo(hasil.result, hasil);
    return true;
  } catch (e1) {
    console.error("ytmp4 via ytMp4 gagal:", e1?.message || e1);
  }

  try {
    const res = await savetube.download(cleanUrl, "360");
    if (!res || !res.result || !res.result.download) throw new Error("Respon savetube tidak lengkap.");
    await sendVideo({ url: res.result.download }, { title: res.result.title });
    return true;
  } catch (e2) {
    console.error("ytmp4 via savetube gagal:", e2?.message || e2);
  }

  await sendText(sock, chat, "❌ Gagal mendownload video dari YouTube.");
  return true;
}

// ---------- INSTAGRAM ----------
async function handleInstagram(sock, chat, url) {
  if (!url) { await sendText(sock, chat, "contoh: `!ig https://www.instagram.com/p/xxxx/`"); return true; }
  if (!url.includes("instagram.com")) { await sendText(sock, chat, "URL tidak mengandung Instagram."); return true; }

  try {
    const hasil = await instagramDl(url);
    if (!hasil || !hasil.length) {
      await sendText(sock, chat, "❌ Postingan tidak tersedia atau akun privat.");
      return true;
    }

    // Kirim semua media, tunggu semua selesai (sequential untuk memastikan urutan)
    for (const item of hasil) {
      const lower = (item.url || "").toLowerCase();
      const isVideo = (item.type === "video") || lower.includes(".mp4") || lower.includes("/video/");
      try {
        if (isVideo) {
          await sock.sendMessage(chat, { video: { url: item.url }, caption: item.title || "Instagram" });
        } else {
          await sock.sendMessage(chat, { image: { url: item.url }, caption: item.title || "Instagram" });
        }
      } catch (e) {
        console.warn("⚠️ kirim media ig gagal, coba fallback:", e?.message || e);
        // fallback: coba sebaliknya
        try {
          if (isVideo) {
            await sock.sendMessage(chat, { image: { url: item.url }, caption: item.title || "Instagram" });
          } else {
            await sock.sendMessage(chat, { video: { url: item.url }, caption: item.title || "Instagram" });
          }
        } catch (ee) {
          console.error("❌ fallback kirim ig juga gagal:", ee);
        }
      }
    }

    // semua media sudah dikirim -> kirim success
    await sendText(sock, chat, "Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻.");
    return true;
  } catch (e) {
    console.error("❌ Error instagramDl:", e);
    await sendText(sock, chat, "❌ Gagal mengambil postingan Instagram.");
    return true;
  }
}

// ---------- INSTA STORY ----------
async function handleInstaStory(sock, chat, username) {
  if (!username) { await sendText(sock, chat, "contoh: `!igstory username_ig`"); return true; }

  try {
    const hasil = await instaStory(username);
    if (!hasil || !hasil.results || !hasil.results.length) {
      await sendText(sock, chat, "❌ Story tidak ditemukan atau akun privat.");
      return true;
    }

    for (const s of hasil.results) {
      if (s.type === "video") {
        await sock.sendMessage(chat, { video: { url: s.url }, caption: "Story Video" }).catch(e => console.error('send story video',e));
      } else {
        await sock.sendMessage(chat, { image: { url: s.url }, caption: "Story Foto" }).catch(e => console.error('send story foto',e));
      }
    }

    await sendText(sock, chat, "Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻.");
    return true;
  } catch (e) {
    console.error("❌ Error instaStory:", e);
    await sendText(sock, chat, "❌ Username tidak ditemukan atau privat.");
    return true;
  }
}

// ---------- TIKTOK VIDEO ----------
async function handleTiktokVideo(sock, chat, url) {
  if (!url) { await sendText(sock, chat, "contoh: `!tiktok https://www.tiktok.com/...`"); return true; }
  if (!url.includes("tiktok.com")) { await sendText(sock, chat, "URL tidak mengandung TikTok."); return true; }

  try {
    const hasil = await tiktokDl(url);
    if (!hasil) throw new Error("Respon tiktokDl kosong");
    const data = Array.isArray(hasil.data) ? hasil.data : [];
    if (!data.length) throw new Error("Tidak ada data media di hasil TikTok");
    const vid = data.find((v) => v.type === "nowatermark" || v.quality === "nowm") || data[0];
    if (!vid || !vid.url) throw new Error("Tidak menemukan URL video TikTok yang valid");

    await sock.sendMessage(chat, {
      video: { url: vid.url },
      caption:
        `*📍Title:* ${hasil.title || "-"}\n` +
        `*⏳Duration:* ${hasil.duration || "-"}\n` +
        `*🎃Author:* ${(hasil.author && hasil.author.nickname) || "-"}`
    }).catch(e => { throw e; });

    await sendText(sock, chat, "Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻.");
    return true;
  } catch (e) {
    console.error("❌ Error tiktok video:", e);
    await sendText(sock, chat, "❌ Gagal / URL TikTok tidak valid atau media tidak bisa diambil.");
    return true;
  }
}

// ---------- TIKTOK AUDIO (explicit) ----------
async function handleTiktokAudio(sock, chat, url) {
  if (!url) { await sendText(sock, chat, "contoh: `!ttmp3 https://www.tiktok.com/...`"); return true; }
  if (!url.includes("tiktok.com")) { await sendText(sock, chat, "URL tidak mengandung TikTok."); return true; }

  try {
    const hasil = await tiktokDl(url);
    if (!hasil || !hasil.music_info || !hasil.music_info.url) throw new Error("Respon tiktokDl (music_info) tidak lengkap");
    const audioUrl = hasil.music_info.url;
    await sock.sendMessage(chat, {
      audio: { url: audioUrl },
      mimetype: "audio/mpeg",
      contextInfo: {
        externalAdReply: {
          title: "TikTok • " + (hasil.author?.nickname || "-"),
          body: (hasil.stats?.likes || "0") + " suka, " + (hasil.stats?.comment || "0") + " komentar. " + (hasil.title || ""),
          previewType: "PHOTO",
          thumbnailUrl: hasil.cover || undefined,
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: url,
        },
      },
    });
    await sendText(sock, chat, "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇.");
    return true;
  } catch (e) {
    console.error("❌ Error tiktok audio:", e);
    await sendText(sock, chat, "❌ Gagal / URL TikTok tidak valid atau audio tidak bisa diambil.");
    return true;
  }
}

// ---------- FACEBOOK ----------
async function handleFacebookVideo(sock, chat, url) {
  if (!url) { await sendText(sock, chat, "contoh: `!fb https://www.facebook.com/watch/?v=xxxx`"); return true; }
  if (!url.includes("facebook.com") && !url.includes("fb.watch")) { await sendText(sock, chat, "URL tidak mengandung Facebook."); return true; }

  try {
    const hasil = await facebookDl(url);
    if (!hasil || !Array.isArray(hasil.results) || hasil.results.length === 0) {
      await sendText(sock, chat, "❌ Video tidak ditemukan atau tidak bisa diambil.");
      return true;
    }
    const videoData = hasil.results[0];
    await sock.sendMessage(chat, { video: { url: videoData.url }, caption: `*🎐Title:* ${hasil.caption || "Video Facebook"}` });
    await sendText(sock, chat, "Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻.");
    return true;
  } catch (e) {
    console.error("❌ Error facebookDl:", e);
    await sendText(sock, chat, "❌ Server downloader Facebook sedang offline / error.");
    return true;
  }
}

// ---------- MEDIAFIRE ----------
async function handleMediafire(sock, chat, url) {
  if (!url) { await sendText(sock, chat, "contoh: `!mediafire https://www.mediafire.com/file/...`"); return true; }
  if (!url.includes("mediafire.com")) { await sendText(sock, chat, "URL Mediafire tidak valid."); return true; }

  try {
    const anu = await mediafireDl(url);
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
        `*Link* : ${anu.link || "-"}`
    });
    await sendText(sock, chat, "Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻.");
    return true;
  } catch (e) {
    console.error("❌ Error mediafireDl:", e);
    await sendText(sock, chat, "❌ Gagal mengambil file dari Mediafire.");
    return true;
  }
}

// ---------- MAIN HANDLER (auto-detect + explicit commands) ----------
async function handleDownloaderCommand(sock, m, text) {
  const chat = m.chat;
  const { cmd, args } = parseCommand(text || "");
  const lcCmd = (cmd || "").toLowerCase();

  // If explicit command (starts with !) -> keep old behaviour
  if (text && text.trim().startsWith("!")) {
    if (["ytmp3", "ytaudio", "ytplayaudio"].includes(lcCmd)) return await handleYtAudio(sock, chat, args);
    if (["ytmp4", "ytvideo", "ytplayvideo"].includes(lcCmd)) return await handleYtVideo(sock, chat, args);
    if (["ig", "instagram", "instadl", "igdown", "igdl"].includes(lcCmd)) return await handleInstagram(sock, chat, args);
    if (["igstory", "instagramstory", "instastory", "storyig"].includes(lcCmd)) return await handleInstaStory(sock, chat, args);
    if (["tiktok", "tt", "ttmp4", "ttvideo"].includes(lcCmd)) return await handleTiktokVideo(sock, chat, args);
    if (["ttmp3", "tiktokmp3", "ttaudio"].includes(lcCmd)) return await handleTiktokAudio(sock, chat, args);
    if (["fb", "fbdl", "fbdown", "facebook"].includes(lcCmd)) return await handleFacebookVideo(sock, chat, args);
    if (["mediafire", "mf"].includes(lcCmd)) return await handleMediafire(sock, chat, args);

    return false;
  }

  // If not explicit, try to auto-detect first URL in text
  const url = extractFirstUrl(text || "");
  if (!url) return false;

  const provider = detectProvider(url);
  console.log("ℹ️ [AUTO-DOWNLOAD] Detected URL:", url, "provider:", provider);

  if (!provider || provider === "unknown") return false;

  try {
    if (provider === "youtube") return await handleYtVideo(sock, chat, url);
    if (provider === "instagram") return await handleInstagram(sock, chat, url);
    if (provider === "tiktok") return await handleTiktokVideo(sock, chat, url);
    if (provider === "facebook") return await handleFacebookVideo(sock, chat, url);
    if (provider === "mediafire") return await handleMediafire(sock, chat, url);
    // spotify / others -> no auto
    return false;
  } catch (e) {
    console.error("❌ Auto-download error:", e);
    return false;
  }
}

module.exports = { handleDownloaderCommand };
