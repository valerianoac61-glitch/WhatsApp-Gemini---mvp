const { getSheetsClient } = require('../config/googleSheets');
const env = require('../config/environment');

class GoogleSheetsService {
  static async saveLead(customerNumber, contextMessage) {
    const sheets = getSheetsClient();
    if (!sheets) return false;

    try {
      const range = 'Leads!A:D';
      const values = [
        [
          new Date().toISOString(),
          customerNumber,
          contextMessage,
          'Pendente de Atendimento Humano'
        ]
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: env.google.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });

      console.log(`Lead salvo com sucesso no Google Sheets para o numero: ${customerNumber}`);
      return true;
    } catch (error) {
      console.error('Falha ao salvar Lead no Google Sheets:', error.message);
      return false;
    }
  }
}

module.exports = GoogleSheetsService;
