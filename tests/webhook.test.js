const request = require('supertest');

process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';
process.env.WHATSAPP_ACCESS_TOKEN = 'test_access_token';
process.env.WHATSAPP_APP_SECRET = 'test_app_secret';
process.env.PHONE_NUMBER_ID = '000000000';
process.env.GEMINI_API_KEY = 'test_key';

const app = require('../src/app');

describe('GET /webhook (verificacao da Meta)', () => {
  it('responde com o challenge quando o token esta correto', async () => {
    const res = await request(app).get('/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test_verify_token',
      'hub.challenge': '12345'
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe('12345');
  });

  it('rejeita com 403 quando o token esta incorreto', async () => {
    const res = await request(app).get('/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'token_errado',
      'hub.challenge': '12345'
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /webhook (notificacoes)', () => {
  it('rejeita requisicoes sem assinatura valida', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ object: 'whatsapp_business_account', entry: [] });
    expect(res.status).toBe(401);
  });
});

describe('GET /health', () => {
  it('responde 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
