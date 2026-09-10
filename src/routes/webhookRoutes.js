const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');
const { verifyMetaSignature } = require('../middleware/verifySignature');

router.get('/webhook', WebhookController.verifyWebhook);
router.post('/webhook', verifyMetaSignature, WebhookController.handleWebhookNotification);

module.exports = router;
