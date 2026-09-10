# WhatsApp + Gemini + Google Sheets — MVP de Atendimento Automático

Bot de atendimento para WhatsApp Business Cloud API que responde clientes usando o
Google Gemini, restrito a uma base de conhecimento da empresa, com escalonamento
automático para humano e captura de leads em uma planilha do Google Sheets.

## Arquitetura

```
Cliente WhatsApp → Meta Webhook → webhookController → conversationRepository (histórico)
                                        ↓
                                  geminiService (IA + base de conhecimento)
                                        ↓
                         whatsappService (resposta) + googleSheetsService (leads)
```

## Requisitos

- Node.js 18+
- Uma conta WhatsApp Business Cloud API (Meta for Developers)
- Uma API key do Google Gemini
- (Opcional) Uma Service Account do Google com acesso de edição a uma planilha do Sheets

## Instalação

```bash
git clone <repo>
cd whatsapp-gemini-mvp
npm install
cp .env.example .env
# preencha o .env com suas credenciais reais
npm run check-setup
```

O `npm run check-setup` é o passo mais importante antes de conectar no WhatsApp
de verdade: ele confere se cada variável foi preenchida (e avisa se você
esqueceu algum valor de exemplo do `.env.example`), e testa ao vivo se o
token do WhatsApp, a chave do Gemini e a planilha do Google Sheets realmente
funcionam — antes de você gastar tempo tentando descobrir por que o bot não
responde. Só depois dele passar sem erros, rode `npm run dev`.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Sim | Token que você inventa e usa na verificação do webhook no painel da Meta |
| `WHATSAPP_ACCESS_TOKEN` | Sim | Token de acesso da Cloud API (temporário ou permanente) |
| `WHATSAPP_APP_SECRET` | Sim | App Secret do app na Meta — usado para validar a assinatura das requisições recebidas |
| `PHONE_NUMBER_ID` | Sim | ID do número de telefone configurado na Cloud API |
| `WHATSAPP_API_VERSION` | Não | Versão da Graph API (padrão `v23.0`, suportada pela Meta até out/2027) |
| `GEMINI_API_KEY` | Sim | Chave da API do Google Gemini |
| `GEMINI_MODEL` | Não | Modelo do Gemini (padrão `gemini-3.1-flash-lite`, estável, desligamento agendado para 07/mai/2027) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Não* | E-mail da service account do Google Cloud |
| `GOOGLE_PRIVATE_KEY` | Não* | Chave privada da service account |
| `GOOGLE_SPREADSHEET_ID` | Não* | ID da planilha onde os leads serão salvos |

\* Sem essas três, o bot funciona normalmente, mas leads não são persistidos (fica só no log).

## Configuração do Webhook na Meta

1. No [Meta for Developers](https://developers.facebook.com/), abra seu app → WhatsApp → Configuration.
2. **Callback URL:** `https://SEU_DOMINIO/webhook`
3. **Verify Token:** o mesmo valor de `WHATSAPP_VERIFY_TOKEN` no seu `.env`.
4. Inscreva-se no campo `messages`.
5. Compartilhe a planilha do Google Sheets com o e-mail da service account (permissão de Editor).

## Rodando localmente com um túnel público

O webhook da Meta precisa de uma URL pública e HTTPS. Em desenvolvimento, use `ngrok` ou similar:

```bash
npm run dev
ngrok http 3000
# use a URL https gerada pelo ngrok como Callback URL na Meta
```

## Teste real no WhatsApp — passo a passo

Depois de `npm run check-setup` passar sem erro e o webhook estar salvo no
painel da Meta (seção acima), faça este roteiro na ordem — cada passo
confirma uma parte diferente do sistema, então se algo falhar você já sabe
exatamente onde:

1. **`npm run dev`** e confirme no terminal a linha `Servidor rodando na porta 3000`.
2. Abra `http://localhost:3000/health` no navegador (ou `curl`) — precisa
   responder `{"status":"ok", ...}`. Se isso falhar, o problema é local, nem
   chegou a envolver WhatsApp ainda.
3. No painel da Meta, clique em **"Verify and save"** no webhook — se o
   `WHATSAPP_VERIFY_TOKEN` bater, a Meta confirma sucesso ali mesmo, sem
   precisar de WhatsApp real.
4. No painel da Meta, use o **número de teste** que a Meta fornece de graça
   (WhatsApp → API Setup → "To" number) e adicione o número do seu próprio
   celular como destinatário de teste.
5. Do seu celular, mande uma mensagem de texto simples (ex.: "oi") para o
   número de teste. Observe o terminal onde o `npm run dev` está rodando —
   deve aparecer `Mensagem recebida de [...]` e, na sequência, `Mensagem
   enviada com sucesso`.
6. Confirme que a resposta chegou no seu WhatsApp.
7. Só depois disso, rode os 3 roteiros completos do `CASOS_DE_TESTE.md`
   (pergunta do FAQ, pedido de humano, pergunta fora do escopo).

Se travar em algum desses passos, o log do terminal (`npm run dev`) sempre
mostra o motivo — todos os pontos de falha deste projeto (Gemini, WhatsApp,
Sheets) têm `console.error` com a mensagem específica do erro, nada falha em
silêncio.

## Segurança

- Toda notificação recebida em `POST /webhook` tem sua assinatura `X-Hub-Signature-256`
  validada com HMAC-SHA256 contra o `WHATSAPP_APP_SECRET` antes de ser processada.
  Requisições sem assinatura válida recebem `401`.
- `helmet` aplica cabeçalhos HTTP de segurança padrão.
- Rate limiting básico (120 req/min) no endpoint `/webhook`.
- Mensagens duplicadas (reenviadas pela Meta em caso de timeout) são deduplicadas por
  `message.id` antes de acionar o Gemini ou o Sheets, evitando respostas duplicadas e
  gasto duplo de créditos de API.

## Limitações conhecidas (MVP)

- **Histórico de conversas em memória:** é perdido a cada restart do processo e não
  funciona com múltiplas instâncias atrás de um load balancer. Para produção, migre
  `conversationRepository` para Redis ou PostgreSQL — a interface pública da classe
  já foi desenhada para isso ser uma troca de implementação, não de contrato.
- Suporta apenas mensagens de **texto** (mídia recebe uma resposta padrão pedindo texto).

## Testes

```bash
npm install
npm test
```

Dois arquivos de teste:
- `tests/webhook.test.js` — verificação do webhook (GET) e rejeição de requisições sem
  assinatura válida (POST).
- `tests/webhookController.test.js` — fluxo completo com as integrações externas
  (WhatsApp, Gemini, Google Sheets) simuladas (`jest.mock`), cobrindo: resposta normal,
  deduplicação de mensagem repetida, escalonamento para humano + registro de lead,
  **lead salvo mesmo quando o envio da confirmação ao WhatsApp falha**, captura de lead
  sem escalonamento, fallback quando a IA falha, fallback quando a IA responde só com
  uma tag de controle (sem texto), mensagem de mídia não suportada, **webhook malformado
  (type "text" sem o campo text.body)** e eventos de status ignorados.

Veja também `CASOS_DE_TESTE.md` para roteiros de teste manual no WhatsApp real.

## Manutenção — ciclo de vida de versões

Este projeto depende de duas peças que a Meta e a Google aposentam periodicamente:

- **Graph API (`WHATSAPP_API_VERSION`)**: cada versão tem ~2 anos de suporte garantido.
  Acompanhe [developers.facebook.com/docs/graph-api/changelog](https://developers.facebook.com/docs/graph-api/changelog).
- **Modelo do Gemini (`GEMINI_MODEL`)**: modelos são descontinuados com poucos meses de
  aviso. O padrão atual, `gemini-3.1-flash-lite`, tem desligamento agendado pela
  Google para **07/mai/2027**. Acompanhe
  [ai.google.dev/gemini-api/docs/deprecations](https://ai.google.dev/gemini-api/docs/deprecations).
  O sucessor natural é `gemini-3.5-flash-lite` (GA, sem data de desligamento anunciada
  até esta revisão, recomendado pela Google para automação de alto volume como este
  bot) — mas antes de migrar, ajuste `src/services/geminiService.js`: modelos da linha
  3.5/3.6 **ignoram** os parâmetros `temperature`/`top_p`/`top_k` hoje e vão retornar
  erro HTTP 400 para eles em versões futuras, então essa linha precisa sair do código
  na migração, com o determinismo da resposta reforçado via o próprio system prompt.
- **SDK do Gemini (`@google/genai`)**: fixado em `^2.21.0` (ou seja, `>=2.21.0 <3.0.0`)
  de propósito. A partir da v3.0.0 o próprio pacote passa a exigir Node.js 22+ e muda
  o comportamento de function calling automático — nada disso nos afeta hoje, mas um
  `npm update` sem esse teto poderia trazer essa mudança sem aviso.

Todos são configuráveis por variável de ambiente (exceto o SDK, fixado no
`package.json`) — atualizar a versão de API ou de modelo não exige alterar código.

## Estrutura do projeto

```
src/
├── config/          # env e cliente do Google Sheets
├── knowledge/        # base de conhecimento da empresa (JSON)
├── prompts/          # system prompt do Gemini
├── repository/        # estado de conversas (em memória)
├── services/          # integrações externas (WhatsApp, Gemini, Sheets)
├── controllers/       # orquestração do webhook
├── middleware/         # validação de assinatura e tratamento de erros
├── routes/            # rotas Express
└── app.js
server.js
tests/
```
