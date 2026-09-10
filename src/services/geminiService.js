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
}

module.exports = GeminiService;
