#!/usr/bin/env node
require('dotenv').config();

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';

const ok = (msg) => console.log(`${GREEN}OK${RESET} ${msg}`);
const fail = (msg) => console.log(`${RED}X${RESET} ${msg}`);
const warn = (msg) => console.log(`${YELLOW}!${RESET} ${msg}`);

let hasError = false;
let hasWarning = false;

function failCheck(msg) {
  fail(msg);
  hasError = true;
}
function warnCheck(msg) {
  warn(msg);
  hasWarning = true;
}

const PLACEHOLDER_PATTERNS = [
  /^seu_/i,
  /_aqui$/i,
  /^AIzaSy\.\.\./,
  /^EAAB\.\.\./,
  /seuprojeto\.iam\.gserviceaccount\.com$/,
  /^1_sua_id_/
];

function looksLikePlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

console.log(`${BOLD}=== Diagnostico de configuracao ===${RESET}\n`);

console.log(`${BOLD}1. Variaveis obrigatorias${RESET}`);
const required = [
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_APP_SECRET',
  'PHONE_NUMBER_ID',
  'GEMINI_API_KEY'
];
for (const key of required) {
  const value = process.env[key];
  if (!value) {
    failCheck(`${key} nao esta definido no .env`);
  } else if (looksLikePlaceholder(value)) {
    failCheck(`${key} ainda parece ser o valor de exemplo (${value.slice(0, 20)}...) - troque pelo valor real`);
  } else {
    ok(`${key} definido`);
  }
}

console.log(`\n${BOLD}2. Google Sheets (opcional)${RESET}`);
const sheetsVars = ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SPREADSHEET_ID'];
const sheetsSet = sheetsVars.filter((k) => process.env[k] && !looksLikePlaceholder(process.env[k]));
if (sheetsSet.length === 0) {
  warnCheck('Google Sheets nao configurado - o bot funciona, mas leads NAO serao salvos em planilha nenhuma');
} else if (sheetsSet.length < sheetsVars.length) {
  const missing = sheetsVars.filter((k) => !sheetsSet.includes(k));
  failCheck(`Google Sheets configurado pela metade - faltam: ${missing.join(', ')}`);
} else {
  ok('As 3 variaveis do Google Sheets estao preenchidas');
}

console.log(`\n${BOLD}3. Checagens ao vivo (chamando as APIs de verdade)${RESET}`);

async function checkWhatsApp() {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.PHONE_NUMBER_ID) {
    warnCheck('Pulei a checagem do WhatsApp (variaveis nao preenchidas)');
    return;
  }
  const version = process.env.WHATSAPP_API_VERSION || 'v23.0';
  const url = `https://graph.facebook.com/${version}/${process.env.PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }
    });
    const data = await res.json();
    if (!res.ok) {
      failCheck(`WhatsApp Cloud API rejeitou o token/numero: ${data?.error?.message || res.status}`);
      return;
    }
    ok(`WhatsApp Cloud API OK - numero: ${data.display_phone_number || '(sem nome)'} / ${data.verified_name || ''}`);
  } catch (err) {
    failCheck(`Nao consegui conectar na Graph API da Meta: ${err.message}`);
  }
}

async function checkGemini() {
  if (!process.env.GEMINI_API_KEY) {
    warnCheck('Pulei a checagem do Gemini (chave nao preenchida)');
    return;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'diga apenas "ok"' }] }] })
    });
    const data = await res.json();
    if (!res.ok) {
      failCheck(`Gemini API rejeitou a chave/modelo "${model}": ${data?.error?.message || res.status}`);
      return;
    }
    ok(`Gemini API OK - modelo "${model}" respondeu normalmente`);
  } catch (err) {
    failCheck(`Nao consegui conectar na API do Gemini: ${err.message}`);
  }
}

async function checkGoogleSheets() {
  if (sheetsSet.length < sheetsVars.length) {
    warnCheck('Pulei a checagem do Google Sheets (nao configurado ou incompleto)');
    return;
  }
  try {
    const { getSheetsClient } = require('../src/config/googleSheets');
    const sheets = getSheetsClient();
    if (!sheets) {
      failCheck('Google Sheets: getSheetsClient() retornou null mesmo com as variaveis preenchidas');
      return;
    }
    await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID });
    ok('Google Sheets OK - consegui acessar a planilha com a service account');
  } catch (err) {
    failCheck(`Google Sheets: falha ao acessar a planilha: ${err.message}`);
  }
}

(async () => {
  await checkWhatsApp();
  await checkGemini();
  await checkGoogleSheets();

  console.log(`\n${BOLD}=== Resultado ===${RESET}`);
  if (hasError) {
    console.log(`${RED}${BOLD}Encontrei problema(s) que vao impedir o bot de funcionar.${RESET}`);
    process.exit(1);
  } else if (hasWarning) {
    console.log(`${YELLOW}Tudo essencial OK, mas ha avisos acima.${RESET}`);
    process.exit(0);
  } else {
    console.log(`${GREEN}${BOLD}Tudo certo!${RESET}`);
    process.exit(0);
  }
})();
