const twilio = require('twilio');
const env = require('../config/environment');

function verifyTwilioSignature(req, res, next) {
  const twilioSignature = req.get('X-Twilio-Signature');

  if (env.NODE_ENV === 'development') {
    return next();
  }

  if (!twilioSignature) {
    return res.sendStatus(401);
  }

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    env.twilio.authToken,
    twilioSignature,
    fullUrl,
    req.body
  );

  if (!isValid) {
    console.warn('Assinatura invalida recebida no webhook Twilio. Requisicao rejeitada.');
    return res.sendStatus(401);
  }

  return next();
}

module.exports = { verifyTwilioSignature };
