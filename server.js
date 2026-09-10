const app = require('./src/app');
const env = require('./src/config/environment');

const server = app.listen(env.PORT, () => {
  console.log(`Servidor rodando na porta ${env.PORT} [${env.NODE_ENV}]`);
});

// Encerramento gracioso: evita derrubar requisicoes em andamento em deploys/restart.
process.on('SIGTERM', () => {
  console.log('SIGTERM recebido. Encerrando servidor...');
  server.close(() => process.exit(0));
});

module.exports = server;
