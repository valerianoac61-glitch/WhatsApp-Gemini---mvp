const { google } = require('googleapis');
const env = require('./environment');

let sheetsInstance = null;

function getSheetsClient() {
  if (sheetsInstance) return sheetsInstance;

  if (!env.google.email || !env.google.privateKey || !env.google.spreadsheetId) {
    console.warn('Google Sheets nao configurado completamente. Leads nao serao persistidos.');
    return null;
  }

  try {
    const auth = new google.auth.JWT(
      env.google.email,
      null,
      env.google.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    sheetsInstance = google.sheets({ version: 'v4', auth });
    return sheetsInstance;
  } catch (error) {
    console.error('Erro ao autenticar no Google Sheets:', error.message);
    return null;
  }
}

module.exports = { getSheetsClient };
