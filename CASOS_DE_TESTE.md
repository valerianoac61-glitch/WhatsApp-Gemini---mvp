# Casos de Teste Manuais — WhatsApp Business

Execute estes três roteiros enviando mensagens reais para o número de teste
conectado à Cloud API, depois de configurar o webhook e rodar o servidor.

## 1. Pergunta dentro da base de conhecimento

**Envie:** `Qual o prazo de entrega de um chatbot?`

**Esperado:**
- O bot responde citando o prazo de 15 a 30 dias úteis (conforme o FAQ).
- Nenhuma linha é adicionada na planilha de Leads.
- No log do servidor: mensagem recebida → resposta enviada, sem erros.

## 2. Pedido de atendimento humano (escalonamento)

**Envie:** `Quero falar com um atendente humano, por favor`

**Esperado:**
- O bot confirma que vai te transferir para um especialista.
- Uma nova linha aparece na aba `Leads` da planilha, com data, seu número e o
  motivo "Solicitou suporte humano".
- Se você enviar outra mensagem depois, o bot **não responde mais** (sessão em
  `HUMAN_SUPPORT`) — confirma que o silenciamento está funcionando.

## 3. Pergunta fora do escopo

**Envie:** `Vocês vendem carros usados?`

**Esperado:**
- O bot responde com a mensagem padrão de "não possuo essa informação" e
  oferece direcionar para um especialista — sem inventar preço, prazo ou
  produto que não existe na base de conhecimento.

---

### Testes extras recomendados (robustez)

- **Duplicata de mensagem:** envie a mesma mensagem duas vezes bem rápido
  (ou force um timeout de rede). O bot deve responder apenas uma vez —
  confirma a deduplicação por `message.id`.
- **Mídia:** envie um áudio, imagem ou figurinha. O bot deve responder pedindo
  para reformular em texto, sem quebrar.
- **Mensagem vazia/whitespace:** envie apenas espaços. O bot não deve
  processar nem responder.
