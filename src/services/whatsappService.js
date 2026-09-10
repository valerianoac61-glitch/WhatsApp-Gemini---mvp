const axios = require('axios');
const env = require('../config/environment');

class WhatsappService {
  static async sendMessage(to, text) {
    const url = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: text
      }
    };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${env.whatsapp.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      console.log(`Mensagem enviada com sucesso para ${to}. ID: ${response.data?.messages?.[0]?.id}`);
      return response.data;
    } catch (error) {
      const apiError = error.response ? JSON.stringify(error.response.data) : error.message;
      console.error(`Erro ao enviar mensagem para o WhatsApp API. Detalhes: ${apiError}`);
      throw new Error('Falha no envio de mensagem via WhatsApp API Cloud.');
    }
  }
}

module.exports = WhatsappService;
