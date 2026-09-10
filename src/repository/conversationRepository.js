// Armazenamento em memoria para o MVP.
// ATENCAO: isto e volatil (perdido a cada restart/deploy) e nao escala
// horizontalmente (cada instancia do processo tem seu proprio Map).
// Para producao, migrar para Redis ou PostgreSQL mantendo a mesma interface.
const sessions = new Map();
const MAX_HISTORY_MESSAGES = 30;

class ConversationRepository {
  static getOrCreateSession(customerNumber) {
    if (!sessions.has(customerNumber)) {
      sessions.set(customerNumber, {
        customerNumber,
        history: [],
        processedMessageIds: new Set(), // evita reprocessar retries do webhook da Meta
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'ACTIVE' // ACTIVE, HUMAN_SUPPORT
      });
    }
    return sessions.get(customerNumber);
  }

  static hasProcessedMessage(customerNumber, messageId) {
    const session = this.getOrCreateSession(customerNumber);
    return session.processedMessageIds.has(messageId);
  }

  static markMessageProcessed(customerNumber, messageId) {
    const session = this.getOrCreateSession(customerNumber);
    session.processedMessageIds.add(messageId);
    if (session.processedMessageIds.size > 200) {
      const [oldest] = session.processedMessageIds;
      session.processedMessageIds.delete(oldest);
    }
  }

  static addMessage(customerNumber, messagePayload) {
    const session = this.getOrCreateSession(customerNumber);
    session.history.push({
      role: messagePayload.role,
      parts: [{ text: messagePayload.text }],
      timestamp: new Date()
    });
    session.updatedAt = new Date();

    if (session.history.length > MAX_HISTORY_MESSAGES) {
      session.history.shift();
    }
    return session;
  }

  static setStatus(customerNumber, status) {
    const session = this.getOrCreateSession(customerNumber);
    session.status = status;
    session.updatedAt = new Date();
  }

  static clearSession(customerNumber) {
    sessions.delete(customerNumber);
  }
}

module.exports = ConversationRepository;
