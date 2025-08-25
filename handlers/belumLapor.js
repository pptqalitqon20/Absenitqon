// handlers/belumLapor.js
const axios = require("axios");

/**
 * Kirim ringkasan halaqah yang belum mengisi laporan pekanan ke grup WA.
 * @param {import('@whiskeysockets/baileys').WASocket} sock - instance Baileys
 * @param {string} targetGroupJid - JID grup, contoh "1203630xxxxxx-123456@g.us"
 * @param {{ gasUrl?: string, timeout?: number }} [options]
 */
async function kirimHalaqahBelumLapor(sock, targetGroupJid, options = {}) {
  const GAS_URL = options.gasUrl || process.env.GAS_BELUMLAPOR_URL; // set di .env
  const TIMEOUT = options.timeout ?? 15000;

  if (!GAS_URL) {
    await sock.sendMessage(targetGroupJid, { text: "❌ GAS_URL belum disetel (env GAS_BELUMLAPOR_URL)." });
    return;
  }

  try {
    const { data } = await axios.post(
      GAS_URL,
      { mode: "belum_lapor" },
      { timeout: TIMEOUT }
    );

    if (data.status !== "success") {
      await sock.sendMessage(targetGroupJid, { text: "❌ Gagal ambil data belum lapor." });
      return;
    }

    const pekan = data.info?.pekan || "-";
    const bulan = data.info?.bulan || "-";
    const list = Array.isArray(data.data) ? data.data : [];

    if (!list.length) {
      await sock.sendMessage(targetGroupJid, {
        text: `✅ Semua halaqah sudah mengisi laporan untuk *${pekan} ${bulan}*. Alhamdulillah.`,
      });
      return;
    }

    const lines = list.map((x, i) => `${i + 1}. ${x.halaqah} (${x.totalSantri} santri)`);
    const msg = [
      `⚠️ *Halaqah Belum Lapor*`,
      `Periode: *${pekan} ${bulan}*`,
      ``,
      ...lines
    ].join("\n");

    await sock.sendMessage(targetGroupJid, { text: msg });
  } catch (err) {
    console.error("Err broadcast belum_lapor:", err?.message || err);
    await sock.sendMessage(targetGroupJid, { text: "❌ Terjadi error saat ambil data belum lapor." });
  }
}

module.exports = { kirimHalaqahBelumLapor };
