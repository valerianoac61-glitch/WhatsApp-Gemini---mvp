const crypto = require('crypto');
const env = require('../config/environment');

function verifyMetaSignature(req, res, next) {
  const signatureHeader = req.get('x-hub-signature-256');

  if (!signatureHeader || !req.rawBody) {
    return res.sendStatus(401);
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', env.whatsapp.appSecret)
      .update(req.rawBody)
      .digest('hex');

  const receivedBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expectedSignature);

  const isValid =
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer);

  if (!isValid) {
    console.warn('Assinatura invalida recebida no webhook. Requisicao rejeitada.');
    return res.sendStatus(401);
  }

  return next();
}

module.exports = { verifyMetaSignature };
