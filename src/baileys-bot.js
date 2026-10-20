
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end('Bot esta a correr'); }).listen(PORT, () => console.log('Servidor HTTP na porta ' + PORT));

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const conversationRepository = require('./repository/conversationRepository');
const geminiService = require('./services/geminiService');
const googleSheetsService = require('./services/googleSheetsService');

const GENERIC_FAILURE_MESSAGE =
  'Desculpe, tive um problema tecnico ao processar sua mensagem. Pode tentar novamente em instantes? / Sorry, I had a technical issue processing your message. Could you please try again shortly?';

let pairingCodeRequested = false;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(process.env.AUTH_DIR || 'baileys_auth');

  const sock = makeWASocket({
    auth: state,
  });

  if (!sock.authState.creds.registered && !pairingCodeRequested) {
    pairingCodeRequested = true;
    setTimeout(async () => {
      const code = await sock.requestPairingCode(process.env.PAIRING_NUMBER || "244930666194");
      console.log("CODIGO DE PAREAMENTO: " + code);
    }, 3000);
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
      pairingCodeRequested = false;
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const customerNumber = msg.key.remoteJid;
    if (customerNumber.endsWith('@g.us') || customerNumber.endsWith('@newsletter') || customerNumber.endsWith('@broadcast')) return;
    let userTextRaw = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
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

      if (!userTextRaw && msg.message.audioMessage) {
        try {
          const audioBuffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
          const audioMime = (msg.message.audioMessage.mimetype || 'audio/ogg').split(';')[0];
          userTextRaw = await geminiService.transcribeAudio(audioBuffer, audioMime);
        } catch (audioError) {
          console.error('Erro ao processar audio:', audioError.message);
        }
        if (!userTextRaw) {
          await sock.sendMessage(customerNumber, {
            text: 'Nao consegui ouvir bem o seu audio. Pode repetir ou escrever a sua mensagem? / I could not hear your audio clearly. Could you repeat it or type your message?',
          });
          return;
        }
      }

      if (!userTextRaw) {
        await sock.sendMessage(customerNumber, {
          text: 'No momento consigo entender apenas mensagens de texto. Como posso te ajudar?',
        });
        return;
      }

      const userText = userTextRaw.trim();
      if (userText.toLowerCase() === 'reiniciar') {
        conversationRepository.setStatus(customerNumber, 'AI_ACTIVE');
        await sock.sendMessage(customerNumber, { text: 'Conversa reiniciada. Como posso ajudar?' });
        return;
      }
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
      const imageNames = [];
      const sendImages = async () => {
        const knowledge = require('./knowledge/' + (process.env.KNOWLEDGE_FILE || 'companyKnowledge.json'));
        for (const wanted of imageNames) {
          const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').trim();
          const w = norm(wanted);
          const exact = (knowledge.productsAndServices || []).find((p) => p.image && norm(p.name) === w);
          const product = exact || (knowledge.productsAndServices || []).find((p) => {
            const n = norm(p.name);
            return p.image && (n.includes(w) || w.includes(n));
          });
          if (product) {
            await sock.sendMessage(customerNumber, {
              image: { url: product.image },
              caption: product.name + ' - ' + product.price,
            });
          }
        }
      };
      let cleanResponse = aiResponse
        .replace(/\[SEND_IMAGE:([^\]]+)\]/g, (m, name) => {
          imageNames.push(name.trim());
          return '';
        })
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
        await sendImages();
        return;
      }

      if (wantsLeadCapture) {
        await googleSheetsService.saveLead(customerNumber, `Interesse de compra detectado: "${userText}"`);
      }

      conversationRepository.addMessage(customerNumber, { role: 'user', text: userText });
      conversationRepository.addMessage(customerNumber, { role: 'model', text: cleanResponse });

      await sock.sendMessage(customerNumber, { text: cleanResponse });
        await sendImages();
    } catch (error) {
      console.error('Erro durante o processamento da mensagem:', error.message);
    }
  });
}

startBot();
