const fetch = require('node-fetch');
const axios = require('axios');
const { getSystemPrompt, getReactionPrompt } = require('./prompt');

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODELS = [
  "tngtech/deepseek-r1t2-chimera:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-r1:free",
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
        timeout: 15000
      });

      const hasil = response.data.choices?.[0]?.message?.content?.trim();
      if (hasil) return hasil;
    } catch (err) {
      console.warn(`⚠️ Model gagal: ${model} → ${err.message}`);
      continue;
    }
  }

  return "Afwan, saya sedang tidak bisa menjawab pertanyaan saat ini. Coba lagi nanti ya.";
}

async function tanyaReaksi(userInput) {
  for (const model of MODELS) {
    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model,
        messages: [
          { role: "system", content: getReactionPrompt(userInput) },
          { role: "user", content: userInput }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 7000
      });

      const emoji = response.data.choices?.[0]?.message?.content?.trim();
      if (emoji && emoji.length <= 3) return emoji;
    } catch (err) {
      console.warn(`❌ Reaksi gagal: ${model} → ${err.message}`);
      continue;
    }
  }

  return null; // fallback kalau tidak berhasil
}

module.exports = {
  tanyaAI,
  tanyaReaksi
};
