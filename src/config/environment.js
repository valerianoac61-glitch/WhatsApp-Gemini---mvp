const dotenv = require('dotenv');
dotenv.config();

const requiredEnvs = [
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_APP_SECRET',
  'PHONE_NUMBER_ID',
  'GEMINI_API_KEY'
];

const missingEnvs = requiredEnvs.filter((env) => !process.env[env]);

if (missingEnvs.length > 0) {
  console.error(`Erro critico: variaveis de ambiente ausentes: ${missingEnvs.join(', ')}`);
  process.exit(1);
}

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0'
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
  },
  google: {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : null,
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID
  }
};
