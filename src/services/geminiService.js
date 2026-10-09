const { GoogleGenAI } = require('@google/genai');
const env = require('../config/environment');
const { systemPrompt } = require('../prompts/systemPrompt');

const ai = new GoogleGenAI({ apiKey: env.gemini.apiKey });

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
