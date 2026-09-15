const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end('Bot esta a correr'); }).listen(PORT, () => console.log('Servidor HTTP na porta ' + PORT));

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const conversationRepository = require('./repository/conversationRepository');
const geminiService = require('./services/geminiService');
const googleSheetsService = require('./services/googleSheetsService');

const GENERIC_FAILURE_MESSAGE =
  'Desculpe, tive um problema tecnico ao processar sua mensagem. Pode tentar novamente em instantes?';

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');

  const sock = makeWASocket({
    auth: state,
  });

  if (!sock.authState.creds.registered) {
    const code = await sock.requestPairingCode("244930666194");
    console.log("CODIGO DE PAREAMENTO: " + code);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('Escaneia este QR code com o WhatsApp:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexao fechada. Reconectando:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('Bot conectado ao WhatsApp com sucesso!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const customerNumber = msg.key.remoteJid;
    const userTextRaw = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const messageId = msg.key.id;

    try {
      if (!customerNumber) return;

      if (messageId && conversationRepository.hasProcessedMessage(customerNumber, messageId)) {
        console.log(`Mensagem [${messageId}] ja processada. Ignorando.`);
        return;
      }
      if (messageId) {
        conversationRepository.markMessageProcessed(customerNumber, messageId);
      }

      if (!userTextRaw) {
        await sock.sendMessage(customerNumber, {
          text: 'No momento consigo entender apenas mensagens de texto. Como posso te ajudar?',
        });
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
        await sock.sendMessage(customerNumber, { text: GENERIC_FAILURE_MESSAGE });
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

        await googleSheetsService.saveLead(customerNumber, `Solicitou suporte humano na mensagem: "${userText}"`);
        await sock.sendMessage(customerNumber, { text: cleanResponse });
        return;
      }

      if (wantsLeadCapture) {
        await googleSheetsService.saveLead(customerNumber, `Interesse de compra detectado: "${userText}"`);
      }

      conversationRepository.addMessage(customerNumber, { role: 'user', text: userText });
      conversationRepository.addMessage(customerNumber, { role: 'model', text: cleanResponse });

      await sock.sendMessage(customerNumber, { text: cleanResponse });
    } catch (error) {
      console.error('Erro durante o processamento da mensagem:', error.message);
    }
  });
}

startBot();
