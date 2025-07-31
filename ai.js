const fetch = require('node-fetch');
const { getSystemPrompt } = require('./prompt');
const axios = require('axios'); // jika pakai CommonJS

const API_KEY = "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"; // Ganti ini
const MODELS = [
  "tngtech/deepseek-r1t2-chimera:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-235b-a22b-07-25:free",
  "meta-llama/llama-4-maverick:free",
  "google/gemma-3n-e2b-it:free",
  "microsoft/mai-ds-r1:free"
];

async function tanyaAI(userInput) {
  for (const model of MODELS) {
    try {
      console.log(`🔄 Mencoba model: ${model}`);
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model,
        messages: [
          { role: "system", content: getSystemPrompt() },
          { role: "user", content: userInput }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000  // 15 detik batas maksimal tiap model
      });

      const hasil = response.data.choices?.[0]?.message?.content?.trim();
      if (hasil) return hasil;
    } catch (err) {
      console.warn(`⚠️ Model gagal: ${model} → ${err.message}`);
      continue; // lanjut ke model berikutnya
    }
  }

  return "Afwan, saya sedang tidak bisa menjawab pertanyaan saat ini. Coba lagi nanti ya.";
}

module.exports = { tanyaAI };







