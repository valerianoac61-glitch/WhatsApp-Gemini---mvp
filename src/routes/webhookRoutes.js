const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');
const { verifyTwilioSignature } = require('../middleware/verifySignature');

router.post('/webhook', verifyTwilioSignature, WebhookController.handleWebhookNotification);

module.exports = router;
