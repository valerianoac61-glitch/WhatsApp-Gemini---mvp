const twilio = require('twilio');
const env = require('../config/environment');

const client = twilio(env.twilio.accountSid, env.twilio.authToken);

class WhatsappService {
  static async sendMessage(to, text) {
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    try {
      const message = await client.messages.create({
        from: env.twilio.whatsappNumber,
        to: formattedTo,
        body: text
      });
      console.log(`Mensagem enviada com sucesso para ${to}. SID: ${message.sid}`);
      return message;
    } catch (error) {
      console.error(`Erro ao enviar mensagem via Twilio. Detalhes: ${error.message}`);
      throw new Error('Falha no envio de mensagem via Twilio WhatsApp API.');
    }
  }
}

module.exports = WhatsappService;
