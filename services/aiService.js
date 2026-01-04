// services/aiService.js
const axios = require('axios');
const { getSystemPrompt } = require('../prompt');

class AIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.models = [
      "openai/gpt-oss-120b:free",
      "openai/gpt-oss-20b:free",
      "tngtech/deepseek-r1t2-chimera:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "microsoft/mai-ds-r1:free"
    ];
    
    // 1. DEFINISI FOOTER BARU
    this.FOOTER_MESSAGE = `

Jangan Lupa ❗
🤖 Saya Adalah Asisten Virtual PPTQ AL-ITQON GOWA. Kalau Kamu mau lihat apa saja yang bisa saya lakukan coba deh kamu ketik *👉Menu👈:*

`;
  }
  async generateResponse(userMessage, conversationHistory = []) {
    console.log(`🤖 Processing AI request: "${userMessage.substring(0, 50)}..."`);

    // Coba semua model secara berurutan (bukan random)
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      try {
        console.log(`🔄 Attempting model ${i + 1}/${this.models.length}: ${model}`);

        const messages = [
          { role: "system", content: getSystemPrompt() },
          ...conversationHistory,
          { role: "user", content: userMessage }
        ];

        const response = await axios.post(
          `${this.baseURL}/chat/completions`,
          {
            model,
            messages,
            max_tokens: 1000,
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://pptq-al-itqon.com',
              'X-Title': 'PPTQ AL-ITQON Bot'
            },
            timeout: 20000
          }
        );

        if (response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
          const hasil = response.data.choices[0].message.content.trim();
          console.log(`✅ Success with model: ${model}`);
          
          // 2. GABUNGKAN RESPONS DENGAN FOOTER
          const finalResponse = hasil + this.FOOTER_MESSAGE;
          
          return finalResponse; // Mengembalikan hasil yang sudah digabung
        }

      } catch (error) {
        console.warn(`❌ Model failed: ${model} → ${error.response?.data?.error?.message || error.message}`);

        // Jika ini model terakhir, return fallback message
        if (i === this.models.length - 1) {
          const fallbackResponses = [
            "Maaf, saya sedang tidak bisa diakses. Silakan coba lagi nanti ya! 🤲",
            "Wah, koneksi saya sedang terganggu. Bisa ulangi pertanyaannya? 📡",
            "Mohon maaf, layanan AI sedang sibuk. Silakan coba beberapa saat lagi! ⏳"
          ];
          
          // Pastikan fallback message juga memiliki footer agar konsisten
          const fallbackMessage = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
          return fallbackMessage + this.FOOTER_MESSAGE;
        }

        // Tunggu sebentar sebelum mencoba model berikutnya
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  shouldHandleWithAI(text) {
    if (!text) return false;

    const cleanText = text.toLowerCase().trim();

    // JANGAN handle perintah absensi
    const absenceCommands = [
      'hadir', 'sakit', 'izin',
      '!rekap', '!rekaphariini', '!rekapminggu', '!rekapbulan',
      '!bantuan', '!jadwal', '!rekapindividu', '!rekapsakitizin'
    ];

    return !absenceCommands.some(cmd => cleanText.includes(cmd));
  }
}

// ✅ Singleton instance
let aiService = null;

function initializeAIService(apiKey) {
  if (!aiService && apiKey) {
    aiService = new AIService(apiKey);
    console.log('✅ AI Service initialized with fallback system');
  }
  return aiService;
}

module.exports = { AIService, initializeAIService };
