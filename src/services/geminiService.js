const { GoogleGenAI } = require('@google/genai');
const env = require('../config/environment');
const { systemPrompt } = require('../prompts/systemPrompt');

const ai = new GoogleGenAI({ apiKey: env.gemini.apiKey });

const geracaoOriginal = ai.models.generateContent.bind(ai.models);
const temporario = (err) => /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(String((err && err.message) || err));
ai.models.generateContent = async (params) => {
  const esperas = [1500, 3500, 7000];
  for (let i = 0; ; i++) {
    try {
      return await geracaoOriginal(params);
    } catch (err) {
      if (!temporario(err)) throw err;
      if (i >= esperas.length) {
        const reserva = process.env.GEMINI_FALLBACK_MODEL;
        if (reserva && params.model !== reserva) {
          console.log('Gemini indisponivel, usando modelo reserva: ' + reserva);
          return await geracaoOriginal({ ...params, model: reserva });
        }
        throw err;
      }
      console.log('Gemini indisponivel, tentando de novo (' + (i + 1) + '/' + esperas.length + ')');
      await new Promise((r) => setTimeout(r, esperas[i]));
    }
  }
};

class GeminiService {
  static async generateResponse(userMessage, conversationHistory) {
    const formattedContents = conversationHistory.map((msg) => ({
      role: msg.role,
      parts: msg.parts
    }));

    formattedContents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const response = await ai.models.generateContent({
      model: env.gemini.model,
      contents: formattedContents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        maxOutputTokens: 800
      }
    });

    const text = response?.text;

    if (!text || !text.trim()) {
      throw new Error('Retorno vazio ou invalido da API do Gemini.');
    }

    return text.trim();
  }

  static async transcribeAudio(audioBuffer, mimeType) {
    const response = await ai.models.generateContent({
      model: env.gemini.model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mimeType || 'audio/ogg', data: audioBuffer.toString('base64') } },
            { text: 'Transcreva fielmente, no idioma original, o que a pessoa diz neste audio. Responda apenas com a transcricao, sem comentarios. Se nao houver fala compreensivel, responda apenas: [INAUDIVEL]' }
          ]
        }
      ],
      config: { temperature: 0, maxOutputTokens: 500 }
    });
    const text = (response?.text || '').trim();
    if (!text || text.includes('[INAUDIVEL]')) return '';
    return text;
  }
}

module.exports = GeminiService;
