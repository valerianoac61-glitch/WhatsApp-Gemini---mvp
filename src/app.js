const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const webhookRoutes = require('./routes/webhookRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/webhook', webhookLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.use('/', webhookRoutes);

app.use(errorHandler);

module.exports = app;
