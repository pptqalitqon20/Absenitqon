// src/message.js
// Versi ringan & bersih untuk PPTQ AL-ITQON
// Sekarang: + online indicator, read (ceklis biru), dan typing umum

const util = require('util');
const { jidNormalizedUser, proto } = require('baileys');
const quranHandler = require("../handlers/quranHandler");
// Import handler utama PPTQ
const pptqHandler = require('../naze');

// =============================
// Serialize Pesan (versi ringan)
// =============================
async function serialize(naze, msg, store) {
  if (!msg) return msg;

  const m = {};
  const type = Object.keys(msg.message || {})[0];

  m.id = msg.key.id;
  m.chat = msg.key.remoteJid;
  m.fromMe = msg.key.fromMe;
  m.isGroup = m.chat.endsWith('@g.us');
  m.sender = msg.key.participant || msg.key.remoteJid;

  // Nama user (dipakai untuk salam di menu)
  m.pushName =
    msg.pushName ||
    msg.notifyName ||
    msg.verifiedBizName ||
    '';
  
  // Ambil teks
  if (type === 'conversation') {
    m.text = msg.message.conversation;
  } else if (type === 'extendedTextMessage') {
    m.text = msg.message.extendedTextMessage.text;
  } else if (msg.message?.buttonsResponseMessage) {
    m.text = msg.message.buttonsResponseMessage.selectedDisplayText || '';
  } else if (msg.message?.interactiveResponseMessage) {
    m.text = '[INTERACTIVE]';
  } else {
    m.text = '';
  }

  // Untuk command "quoted" (kalau nanti perlu)
  m.quoted =
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
  m.raw = msg;
  return m;
}

// =============================
// Store Pesan (seperti mini-store)
// =============================
function pushToStore(store, msg) {
  const jid = msg.key.remoteJid;

  store.messages[jid] ??= { array: [], keyId: new Set() };

  const arr = store.messages[jid].array;
  const set = store.messages[jid].keyId;

  if (set.has(msg.key.id)) return;

  arr.push(msg);
  set.add(msg.key.id);

  // Batasi history per chat
  if (arr.length > 100) {
    const shifted = arr.shift();
    set.delete(shifted.key.id);
  }
}

// =============================
// MAIN EXPORT: handler pesan masuk
// =============================
module.exports = async function MessagesUpsert(naze, message, store, aiService) {
  try {
    const msg = message.messages[0];
        const upsertType = message.type; // <- dari Baileys: 'notify', 'append', 'replace', dll
        if (!msg || !msg.key) return;

        // ❗ Hanya proses pesan baru, hindari spam dari sync/history
        if (upsertType !== 'notify') {
            return;
        }

    const jid = msg.key.remoteJid;

    // 1) Simpan ke store (riwayat chat)
    pushToStore(store, msg);

    // 2) TANDAI PESAN SEBAGAI DIBACA (✅✅ / biru, kalau setting WA mengizinkan)
    try {
      await naze.readMessages([msg.key]);
    } catch (e) {
      console.warn('readMessages gagal (bisa diabaikan):', e.message);
    }

    // 3) TAMPIL ONLINE / AVAILABLE DI CHAT INI
    try {
      await naze.sendPresenceUpdate('available', jid);
    } catch (e) {
      console.warn('sendPresenceUpdate available gagal:', e.message);
    }

    // 4) Serialize → bentuk objek m yang rapi
    const m = await serialize(naze, msg, store);

    // Debug log
    console.log('\n📩 Pesan masuk:', {
      text: m.text,
      from: m.sender,
      chat: m.chat,
      type: Object.keys(msg.message || {}),
      name: m.pushName,
    });

    // 5) KIRIM INDICATOR TYPING SEBELUM PROSES
    try {
      await naze.sendPresenceUpdate('composing', m.chat);
    } catch (e) {
      console.warn('sendPresenceUpdate composing gagal:', e.message);
    }

    // 6) MASUK KE ROUTER PPTQ (naze.js)
    await pptqHandler(naze, m, msg, store, aiService);

    // 7) SET KE "PAUSED" / "AVAILABLE" SETELAH SELESAI
    try {
      await naze.sendPresenceUpdate('paused', m.chat);
      // atau kalau mau selalu keliatan aktif:
      // await naze.sendPresenceUpdate('available', m.chat);
    } catch (e) {
      console.warn('sendPresenceUpdate paused gagal:', e.message);
    }
  } catch (err) {
    console.error('❌ Error di src/message.js:', err);
  }
};
