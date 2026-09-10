const env = require('../config/environment');

function errorHandler(err, req, res, next) {
  console.error('Erro capturado por middleware global:', err.stack);

  const response = {
    message: 'Ocorreu um erro interno no servidor.'
  };

  if (env.NODE_ENV === 'development') {
    response.error = err.message;
  }

  res.status(err.status || 500).json(response);
}

module.exports = errorHandler;
