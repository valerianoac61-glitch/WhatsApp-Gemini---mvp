const env = require('../config/environment');
const conversationRepository = require('../repository/conversationRepository');
const geminiService = require('../services/geminiService');
const whatsappService = require('../services/whatsappService');
const googleSheetsService = require('../services/googleSheetsService');

const GENERIC_FAILURE_MESSAGE =
  'Desculpe, tive um problema tecnico ao processar sua mensagem. Pode tentar novamente em instantes?';

class WebhookController {
  static verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === env.whatsapp.verifyToken) {
        console.log('Webhook verificado e validado com sucesso pela Meta.');
        return res.status(200).send(challenge);
      }
      console.warn('Tentativa de validacao falhou: token de verificacao incorreto.');
      return res.sendStatus(403);
    }
    return res.sendStatus(400);
  }

  static async handleWebhookNotification(req, res) {
    const { body } = req;

    res.status(200).send('EVENT_RECEIVED');

    try {
      if (body.object !== 'whatsapp_business_account') {
        return;
      }

      const value = body.entry?.[0]?.changes?.[0]?.value;
      const messageData = value?.messages?.[0];

      if (!messageData) {
        return;
      }

      const customerNumber = messageData.from;
      const messageId = messageData.id;

      if (messageId && conversationRepository.hasProcessedMessage(customerNumber, messageId)) {
        console.log(`Mensagem [${messageId}] ja processada anteriormente. Ignorando duplicata.`);
        return;
      }
      if (messageId) {
        conversationRepository.markMessageProcessed(customerNumber, messageId);
      }

      if (messageData.type !== 'text' || !messageData.text?.body) {
        await whatsappService.sendMessage(
          customerNumber,
          'No momento consigo entender apenas mensagens de texto. Como posso te ajudar com os nossos servicos?'
        );
        return;
      }

      const userText = messageData.text.body.trim();
      if (!userText) return;

      console.log(`Mensagem recebida de [${customerNumber}]: "${userText}"`);

      const session = conversationRepository.getOrCreateSession(customerNumber);

      if (session.status === 'HUMAN_SUPPORT') {
        console.log(`Cliente [${customerNumber}] em atendimento humano. IA em silencio.`);
        return;
      }

      let aiResponse;
      try {
        aiResponse = await geminiService.generateResponse(userText, session.history);
      } catch (aiError) {
        console.error('Erro ao gerar resposta com o Gemini:', aiError.message);
        await whatsappService.sendMessage(customerNumber, GENERIC_FAILURE_MESSAGE);
        return;
      }

      const wantsHumanTransfer = aiResponse.includes('[HUMAN_TRANSFER]');
      const wantsLeadCapture = aiResponse.includes('[LEAD_CAPTURE]');
      let cleanResponse = aiResponse
        .replace('[HUMAN_TRANSFER]', '')
        .replace('[LEAD_CAPTURE]', '')
        .trim();

      if (!cleanResponse) {
        cleanResponse = wantsHumanTransfer
          ? 'Vou te transferir para um de nossos especialistas humanos.'
          : GENERIC_FAILURE_MESSAGE;
      }

      if (wantsHumanTransfer) {
        conversationRepository.setStatus(customerNumber, 'HUMAN_SUPPORT');
        conversationRepository.addMessage(customerNumber, { role: 'user', text: userText });
        conversationRepository.addMessage(customerNumber, { role: 'model', text: cleanResponse });

        await googleSheetsService.saveLead(
          customerNumber,
          `Solicitou suporte humano na mensagem: "${userText}"`
        );
        await whatsappService.sendMessage(customerNumber, cleanResponse);
        return;
      }

      if (wantsLeadCapture) {
        await googleSheetsService.saveLead(
          customerNumber,
          `Interesse de compra detectado: "${userText}"`
        );
      }

      conversationRepository.addMessage(customerNumber, { role: 'user', text: userText });
      conversationRepository.addMessage(customerNumber, { role: 'model', text: cleanResponse });

      await whatsappService.sendMessage(customerNumber, cleanResponse);
    } catch (error) {
      console.error('Erro durante o processamento do pipeline do webhook:', error.message);
    }
  }
}

module.exports = WebhookController;
