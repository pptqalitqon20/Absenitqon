// handlers/aiHandler.js
function isBotCommand(text) {
  // Hindari error kalau bukan string
  if (typeof text !== 'string') return false;
  const t = text.trim();
  return t.startsWith('!');
}

async function handleAIQuery(sock, jid, lcText, rawText, aiService, msg) { // Menerima 'msg'
  try {
    if (!aiService) {
      console.log('🧠 AIHandler: aiService tidak tersedia, skip.');
      return false;
    }

    // Pastikan ada teks bersih
    if (typeof rawText !== 'string' || !rawText.trim()) {
      console.log('🧠 AIHandler: rawText kosong/bukan string, skip.');
      return false;
    }

    // Abaikan jika perintah bot (mulai dengan "!")
    if (isBotCommand(rawText)) {
      console.log('🧠 AIHandler: terdeteksi command (!...), tidak ke AI.');
      return false;
    }

    // Filter internal AI (hindari konflik dgn fitur)
    if (!aiService.shouldHandleWithAI(rawText)) {
      console.log('🧠 AIHandler: disaring oleh shouldHandleWithAI, skip.');
      return false;
    }

    console.log('🧠 AIHandler: generateResponse dimulai...');
    const reply = await aiService.generateResponse(rawText, []);
    console.log('🧠 AIHandler: generateResponse selesai.');

    if (!reply || typeof reply !== 'string') {
      console.warn('🧠 AIHandler: balasan kosong/tidak valid, skip kirim.');
      return false;
    }

    // >>> PERUBAHAN: Tambahkan { quoted: msg } di sini
    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    console.log('🧠 AIHandler: balasan terkirim (mereply).');
    return true;
  } catch (err) {
    console.error('❌ AI handler error:', err);
    // Kirim fallback minimal agar user dapat feedback
    try {
      // Pastikan fallback juga mereply
      await sock.sendMessage(jid, { text: 'Maaf, AI sedang sibuk. Coba lagi ya. 🙏' }, { quoted: msg });
    } catch (_) {}
    return false;
  }
}

module.exports = { handleAIQuery };
