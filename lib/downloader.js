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

async function sendText(sock, chatId, text, quotedMsg = null) { // <-- Tambah argumen quotedMsg
  try { 
    await sock.sendMessage(chatId, { text }, quotedMsg ? { quoted: quotedMsg } : {}); // <-- Terapkan reply
  } catch (e) { 
    console.error("sendText err", e); 
  }
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
async function handleYtAudio(sock, chat, url, quotedMsg) {
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
      },{ quoted: quotedMsg });
      // baru kirim success setelah audio sukses terkirim
      await sendText(sock, chat, "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇.");
    } catch (e) {
      console.error("❌ sendAudio error:", e);
      await sendText(sock, chat, "❌ Gagal mengirim audio.", quotedMsg);
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

  await sendText(sock, chat, "❌ Gagal mendownload audio dari YouTube.", quotedMsg);
  return true;
}

// ---------- YT VIDEO (auto when detected) ----------
async function handleYtVideo(sock, chat, url, quotedMsg) {
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
      },{ quoted: quotedMsg });
      // baru kirim success setelah video sukses dikirim
      await sendText(sock, chat, "*Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻*.");
    } catch (e) {
      console.error("❌ sendVideo error:", e);
      await sendText(sock, chat, "😳."); // ❌ Gagal mengirim video
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

  await sendText(sock, chat, "😳.", quotedMsg); // ❌ Gagal mendownload video dari YouTube
  return true;
}

// ---------- INSTAGRAM ----------
async function handleInstagram(sock, chat, url, quotedMsg) { // <-- TAMBAH quotedMsg
  if (!url) { await sendText(sock, chat, "contoh: `!ig https://www.instagram.com/p/xxxx/`", quotedMsg); return true; } // <-- Teruskan quotedMsg
  if (!url.includes("instagram.com")) { await sendText(sock, chat, "URL tidak mengandung Instagram.", quotedMsg); return true; } // <-- Teruskan quotedMsg

  try {
    const hasil = await instagramDl(url);
    if (!hasil || !hasil.length) {
      await sendText(sock, chat, "😳.", quotedMsg); // ❌ Postingan tidak tersedia atau akun privat
      return true;
    }

    // Kirim semua media, tunggu semua selesai (sequential untuk memastikan urutan)
    for (const item of hasil) {
      const lower = (item.url || "").toLowerCase();
      const isVideo = (item.type === "video") || lower.includes(".mp4") || lower.includes("/video/");
      
      const quoted = { quoted: quotedMsg }; // Definisikan objek quoted
      
      try {
        if (isVideo) {
          // Tambahkan { quoted: quotedMsg }
          await sock.sendMessage(chat, { video: { url: item.url }, caption: item.title || "Instagram" }, quoted); 
        } else {
          // Tambahkan { quoted: quotedMsg }
          await sock.sendMessage(chat, { image: { url: item.url }, caption: item.title || "Instagram" }, quoted);
        }
      } catch (e) {
        console.warn("⚠️ kirim media ig gagal, coba fallback:", e?.message || e);
        // fallback: coba sebaliknya
        try {
          if (isVideo) {
            // Tambahkan { quoted: quotedMsg }
            await sock.sendMessage(chat, { image: { url: item.url }, caption: item.title || "Instagram" }, quoted); 
          } else {
            // Tambahkan { quoted: quotedMsg }
            await sock.sendMessage(chat, { video: { url: item.url }, caption: item.title || "Instagram" }, quoted);
          }
        } catch (ee) {
          console.error("❌ fallback kirim ig juga gagal:", ee);
        }
      }
    }

    // semua media sudah dikirim -> kirim success
    await sendText(sock, chat, "*Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻*.", quotedMsg); // <-- Teruskan quotedMsg
    return true;
  } catch (e) {
    console.error("❌ Error instagramDl:", e);
    await sendText(sock, chat, "😳.", quotedMsg); // ❌ Gagal mengambil postingan Instagram
    return true;
  }
}

// ---------- INSTA STORY ----------
async function handleInstaStory(sock, chat, username, quotedMsg) { // <-- TAMBAH quotedMsg
  if (!username) { await sendText(sock, chat, "contoh: `!igstory username_ig`", quotedMsg); return true; } // <-- Teruskan quotedMsg

  try {
    const hasil = await instaStory(username);
    if (!hasil || !hasil.results || !hasil.results.length) {
      await sendText(sock, chat, "😳.", quotedMsg); // ❌ Story tidak ditemukan atau akun privat
      return true;
    }
    
    const quoted = { quoted: quotedMsg }; // Definisikan objek quoted

    for (const s of hasil.results) {
      if (s.type === "video") {
        // Tambahkan { quoted: quotedMsg }
        await sock.sendMessage(chat, { video: { url: s.url }, caption: "Story Video" }, quoted).catch(e => console.error('send story video',e));
      } else {
        // Tambahkan { quoted: quotedMsg }
        await sock.sendMessage(chat, { image: { url: s.url }, caption: "Story Foto" }, quoted).catch(e => console.error('send story foto',e));
      }
    }

    await sendText(sock, chat, "*Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻*.", quotedMsg); // <-- Teruskan quotedMsg
    return true;
  } catch (e) {
    console.error("❌ Error instaStory:", e);
    await sendText(sock, chat, "😳.", quotedMsg); // ❌ Username tidak ditemukan atau privat
    return true;
  }
}

// ---------- TIKTOK VIDEO ----------
async function handleTiktokVideo(sock, chat, url, quotedMsg) { // <-- TAMBAH quotedMsg
  if (!url) { await sendText(sock, chat, "contoh: `!tiktok https://www.tiktok.com/...`", quotedMsg); return true; } // <-- Teruskan quotedMsg
  if (!url.includes("tiktok.com")) { await sendText(sock, chat, "URL tidak mengandung TikTok.", quotedMsg); return true; } // <-- Teruskan quotedMsg

  try {
    const hasil = await tiktokDl(url);
    if (!hasil) throw new Error("Respon tiktokDl kosong");
    const data = Array.isArray(hasil.data) ? hasil.data : [];
    if (!data.length) throw new Error("Tidak ada data media di hasil TikTok");
    const vid = data.find((v) => v.type === "nowatermark" || v.quality === "nowm") || data[0];
    if (!vid || !vid.url) throw new Error("Tidak menemukan URL video TikTok yang valid");

    // Tambahkan { quoted: quotedMsg }
    await sock.sendMessage(chat, {
      video: { url: vid.url },
      caption:
        `*📍Title:* ${hasil.title || "-"}\n` +
        `*⏳Duration:* ${hasil.duration || "-"}\n` +
        `*🎃Author:* ${(hasil.author && hasil.author.nickname) || "-"}`
    }, { quoted: quotedMsg }).catch(e => { throw e; }); // <-- PERUBAHAN DI SINI

    await sendText(sock, chat, "*Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻*.", quotedMsg); // <-- Teruskan quotedMsg
    return true;
  } catch (e) {
    console.error("❌ Error tiktok video:", e);
    await sendText(sock, chat, "😳.", quotedMsg); // ❌ Gagal / URL TikTok tidak valid atau media tidak bisa diambil
    return true;
  }
}

// ---------- TIKTOK AUDIO (explicit) ----------
async function handleTiktokAudio(sock, chat, url, quotedMsg) { // <-- TAMBAH quotedMsg
  if (!url) { await sendText(sock, chat, "contoh: `!ttmp3 https://www.tiktok.com/...`", quotedMsg); return true; } // <-- Teruskan quotedMsg
  if (!url.includes("tiktok.com")) { await sendText(sock, chat, "URL tidak mengandung TikTok.", quotedMsg); return true; } // <-- Teruskan quotedMsg

  try {
    const hasil = await tiktokDl(url);
    if (!hasil || !hasil.music_info || !hasil.music_info.url) throw new Error("Respon tiktokDl (music_info) tidak lengkap");
    const audioUrl = hasil.music_info.url;
    
    // Tambahkan { quoted: quotedMsg }
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
    }, { quoted: quotedMsg }); // <-- PERUBAHAN DI SINI
    
    await sendText(sock, chat, "✅ Alhamdulillah Sudah Selesai Barakallahu Fiikum, Berikut Hasilnya 👇.", quotedMsg); // <-- Teruskan quotedMsg
    return true;
  } catch (e) {
    console.error("❌ Error tiktok audio:", e);
    await sendText(sock, chat, "😳.", quotedMsg); // ❌ Gagal / URL TikTok tidak valid atau audio tidak bisa diambil
    return true;
  }
}

// ---------- FACEBOOK ----------
async function handleFacebookVideo(sock, chat, url, quotedMsg) { // <-- Menerima quotedMsg
  if (!url) { await sendText(sock, chat, "contoh: `!fb https://www.facebook.com/watch/?v=xxxx`", quotedMsg); return true; }
  if (!url.includes("facebook.com") && !url.includes("fb.watch")) { await sendText(sock, chat, "URL tidak mengandung Facebook.", quotedMsg); return true; }
  
  try {
    const hasil = await facebookDl(url);
    if (!hasil || !Array.isArray(hasil.results) || hasil.results.length === 0) {
      await sendText(sock, chat, "😳.", quotedMsg);
      return true;
    }
    
    const videoData = hasil.results[0];
    
    // --- PENYUSUNAN CAPTION BARU ---
    
    // Asumsi properti berikut ada di objek 'hasil' (hasil dari facebookDl)
    const caption = 
      `*🎐 Judul:* ${hasil.caption || "Tidak Tersedia"}\n` +
      `*👤 Akun:* ${hasil.author?.name || "Anonim"}\n` + // Mengambil Nama Akun
      (hasil.stats?.likes ? `*👍 Suka:* ${hasil.stats.likes}\n` : '') + // Mengambil Jumlah Like (opsional)
      (hasil.stats?.comments ? `*💬 Komentar:* ${hasil.stats.comments}\n` : '') + // Mengambil Jumlah Komen (opsional)
      `\n✅ Video Facebook (Kualitas ${videoData.quality || 'Tertinggi'})`; // Informasi Kualitas
    
    // Tambahkan { quoted: quotedMsg }
    await sock.sendMessage(chat, { 
      video: { url: videoData.url }, 
      caption: caption // <-- GUNAKAN CAPTION YANG BARU
    }, { quoted: quotedMsg }); 
    
    await sendText(sock, chat, "*Dari pada buka linknya, mending langsung nonton nih videonya, sudah saya ubah ke video siap nonton 👆🏻*.", quotedMsg);
    return true;
  } catch (e) {
    console.error("❌ Error facebookDl:", e);
    await sendText(sock, chat, "😳.", quotedMsg); //❌ Server downloader Facebook sedang offline / error
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
async function handleDownloaderCommand(sock, m, text, quotedMsg) {
  const chat = m.chat;
  const { cmd, args } = parseCommand(text || "");
  const lcCmd = (cmd || "").toLowerCase();

  // If explicit command (starts with !) -> keep old behaviour
  if (text && text.trim().startsWith("!")) {
    if (["ytmp3", "ytaudio", "ytplayaudio"].includes(lcCmd)) return await handleYtAudio(sock, chat, args, quotedMsg);
    if (["ytmp4", "ytvideo", "ytplayvideo"].includes(lcCmd)) return await handleYtVideo(sock, chat, args, quotedMsg);
    if (["ig", "instagram", "instadl", "igdown", "igdl"].includes(lcCmd)) return await handleInstagram(sock, chat, args, quotedMsg);
    if (["igstory", "instagramstory", "instastory", "storyig"].includes(lcCmd)) return await handleInstaStory(sock, chat, args, quotedMsg);
    if (["tiktok", "tt", "ttmp4", "ttvideo"].includes(lcCmd)) return await handleTiktokVideo(sock, chat, args, quotedMsg);
    if (["ttmp3", "tiktokmp3", "ttaudio"].includes(lcCmd)) return await handleTiktokAudio(sock, chat, args, quotedMsg);
    if (["fb", "fbdl", "fbdown", "facebook"].includes(lcCmd)) return await handleFacebookVideo(sock, chat, args, quotedMsg);
    if (["mediafire", "mf"].includes(lcCmd)) return await handleMediafire(sock, chat, args, quotedMsg);

    return false;
  }

  // If not explicit, try to auto-detect first URL in text
  const url = extractFirstUrl(text || "");
  if (!url) return false;

  const provider = detectProvider(url);
  console.log("ℹ️ [AUTO-DOWNLOAD] Detected URL:", url, "provider:", provider);

  if (!provider || provider === "unknown") return false;

  try {
    if (provider === "youtube") return await handleYtVideo(sock, chat, url, quotedMsg);
    if (provider === "instagram") return await handleInstagram(sock, chat, url, quotedMsg);
    if (provider === "tiktok") return await handleTiktokVideo(sock, chat, url, quotedMsg);
    if (provider === "facebook") return await handleFacebookVideo(sock, chat, url, quotedMsg);
    if (provider === "mediafire") return await handleMediafire(sock, chat, url, quotedMsg);
    // spotify / others -> no auto
    return false;
  } catch (e) {
    console.error("❌ Auto-download error:", e);
    return false;
  }
}

module.exports = { handleDownloaderCommand };
