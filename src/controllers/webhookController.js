const conversationRepository = require('../repository/conversationRepository');
const geminiService = require('../services/geminiService');
const whatsappService = require('../services/whatsappService');
const googleSheetsService = require('../services/googleSheetsService');

const GENERIC_FAILURE_MESSAGE =
  'Desculpe, tive um problema tecnico ao processar sua mensagem. Pode tentar novamente em instantes?';

class WebhookController {
  static async handleWebhookNotification(req, res) {
    const { Body: userTextRaw, From: customerNumber, MessageSid: messageId, NumMedia } = req.body;

    res.status(200).send('<Response></Response>');

    try {
      if (!customerNumber) {
        return;
      }

      if (messageId && conversationRepository.hasProcessedMessage(customerNumber, messageId)) {
        console.log(`Mensagem [${messageId}] ja processada anteriormente. Ignorando duplicata.`);
        return;
      }
      if (messageId) {
        conversationRepository.markMessageProcessed(customerNumber, messageId);
      }

      if ((NumMedia && Number(NumMedia) > 0) || !userTextRaw) {
        await whatsappService.sendMessage(
          customerNumber,
          'No momento consigo entender apenas mensagens de texto. Como posso te ajudar com os nossos servicos?'
        );
        return;
      }

      const userText = userTextRaw.trim();
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
