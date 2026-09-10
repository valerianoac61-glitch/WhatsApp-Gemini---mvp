const crypto = require('crypto');
const request = require('supertest');

process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';
process.env.WHATSAPP_ACCESS_TOKEN = 'test_access_token';
process.env.WHATSAPP_APP_SECRET = 'test_app_secret';
process.env.PHONE_NUMBER_ID = '000000000';
process.env.GEMINI_API_KEY = 'test_key';

jest.mock('../src/services/whatsappService');
jest.mock('../src/services/geminiService');
jest.mock('../src/services/googleSheetsService');

const app = require('../src/app');
const whatsappService = require('../src/services/whatsappService');
const geminiService = require('../src/services/geminiService');
const googleSheetsService = require('../src/services/googleSheetsService');

function signedPost(payload) {
  const body = JSON.stringify(payload);
  const signature =
    'sha256=' + crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(body).digest('hex');
  return request(app)
    .post('/webhook')
    .set('Content-Type', 'application/json')
    .set('x-hub-signature-256', signature)
    .send(body);
}

function textMessagePayload({ from, id, text }) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  id,
                  type: 'text',
                  text: { body: text }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

beforeEach(() => {
  whatsappService.sendMessage.mockReset().mockResolvedValue({});
  geminiService.generateResponse.mockReset();
  googleSheetsService.saveLead.mockReset().mockResolvedValue(true);
});

describe('Fluxo de mensagens do webhook (com dependencias mockadas)', () => {
  it('rejeita payload com assinatura invalida', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=assinatura_forjada')
      .send(JSON.stringify(textMessagePayload({ from: '5511999990001', id: 'wamid.1', text: 'oi' })));
    expect(res.status).toBe(401);
  });

  it('responde ao cliente usando a resposta gerada pelo Gemini', async () => {
    geminiService.generateResponse.mockResolvedValue('Nosso horario e de 9h as 18h.');

    const res = await signedPost(
      textMessagePayload({ from: '5511999990002', id: 'wamid.2', text: 'Qual o horario?' })
    );

    expect(res.status).toBe(200);
    await flush();

    expect(geminiService.generateResponse).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      '5511999990002',
      'Nosso horario e de 9h as 18h.'
    );
    expect(googleSheetsService.saveLead).not.toHaveBeenCalled();
  });

  it('deduplica notificacoes repetidas da Meta (mesmo message id)', async () => {
    geminiService.generateResponse.mockResolvedValue('Resposta unica.');
    const payload = textMessagePayload({ from: '5511999990003', id: 'wamid.dup', text: 'Ola' });

    await signedPost(payload);
    await flush();
    await signedPost(payload);
    await flush();

    expect(geminiService.generateResponse).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('escalona para humano e salva lead quando a IA sinaliza [HUMAN_TRANSFER]', async () => {
    geminiService.generateResponse.mockResolvedValue(
      'Vou te transferir para um especialista. [HUMAN_TRANSFER]'
    );

    await signedPost(
      textMessagePayload({ from: '5511999990004', id: 'wamid.4', text: 'Quero falar com humano' })
    );
    await flush();

    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      '5511999990004',
      'Vou te transferir para um especialista.'
    );
    expect(googleSheetsService.saveLead).toHaveBeenCalledTimes(1);

    geminiService.generateResponse.mockClear();
    whatsappService.sendMessage.mockClear();
    await signedPost(
      textMessagePayload({ from: '5511999990004', id: 'wamid.5', text: 'Ainda estou aguardando' })
    );
    await flush();

    expect(geminiService.generateResponse).not.toHaveBeenCalled();
    expect(whatsappService.sendMessage).not.toHaveBeenCalled();
  });

  it('salva o lead mesmo se o envio da mensagem de transferencia ao WhatsApp falhar', async () => {
    geminiService.generateResponse.mockResolvedValue(
      'Vou te transferir para um especialista. [HUMAN_TRANSFER]'
    );
    whatsappService.sendMessage.mockRejectedValue(new Error('WhatsApp API indisponivel'));

    await signedPost(
      textMessagePayload({ from: '5511999990011', id: 'wamid.11', text: 'Quero falar com humano' })
    );
    await flush();

    expect(googleSheetsService.saveLead).toHaveBeenCalledTimes(1);
    expect(googleSheetsService.saveLead).toHaveBeenCalledWith(
      '5511999990011',
      expect.stringContaining('Solicitou suporte humano')
    );
  });

  it('salva lead quando a IA sinaliza [LEAD_CAPTURE] sem transferir para humano', async () => {
    geminiService.generateResponse.mockResolvedValue(
      'Otimo, temos esse servico disponivel! [LEAD_CAPTURE]'
    );

    await signedPost(
      textMessagePayload({ from: '5511999990006', id: 'wamid.6', text: 'Quero contratar' })
    );
    await flush();

    expect(googleSheetsService.saveLead).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      '5511999990006',
      'Otimo, temos esse servico disponivel!'
    );
  });

  it('usa um texto de fallback quando a IA retorna so a tag de controle (sem texto)', async () => {
    geminiService.generateResponse.mockResolvedValue('[LEAD_CAPTURE]');

    await signedPost(
      textMessagePayload({ from: '5511999990009', id: 'wamid.10', text: 'Quero comprar' })
    );
    await flush();

    expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
    const [, sentText] = whatsappService.sendMessage.mock.calls[0];
    expect(sentText.length).toBeGreaterThan(0);
    expect(googleSheetsService.saveLead).toHaveBeenCalledTimes(1);
  });

  it('envia mensagem de fallback quando o Gemini falha, em vez de deixar o cliente sem resposta', async () => {
    geminiService.generateResponse.mockRejectedValue(new Error('timeout na API do Gemini'));

    await signedPost(
      textMessagePayload({ from: '5511999990007', id: 'wamid.7', text: 'Alguma pergunta' })
    );
    await flush();

    expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
    const [, sentText] = whatsappService.sendMessage.mock.calls[0];
    expect(sentText).toMatch(/problema tecnico/i);
  });

  it('responde com mensagem padrao para mensagens de midia (nao-texto)', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '5511999990008', id: 'wamid.8', type: 'image' }]
              }
            }
          ]
        }
      ]
    };

    await signedPost(payload);
    await flush();

    expect(geminiService.generateResponse).not.toHaveBeenCalled();
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      '5511999990008',
      expect.stringMatching(/apenas mensagens de texto/i)
    );
  });

  it('nao quebra com webhook malformado: type "text" sem o campo text.body', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '5511999990012', id: 'wamid.12', type: 'text' }]
              }
            }
          ]
        }
      ]
    };

    const res = await signedPost(payload);
    await flush();

    expect(res.status).toBe(200);
    expect(geminiService.generateResponse).not.toHaveBeenCalled();
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      '5511999990012',
      expect.stringMatching(/apenas mensagens de texto/i)
    );
  });

  it('ignora eventos de status (sem messages) sem chamar nenhum servico', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.9', status: 'delivered' }] } }] }]
    };

    await signedPost(payload);
    await flush();

    expect(geminiService.generateResponse).not.toHaveBeenCalled();
    expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    expect(googleSheetsService.saveLead).not.toHaveBeenCalled();
  });
});
