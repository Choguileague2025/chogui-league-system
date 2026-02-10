const express = require('express');
const router = express.Router();
const sseController = require('../controllers/sse.controller');

// Endpoint para conectarse al stream SSE
router.get('/updates', sseController.streamUpdates);

// Endpoint para obtener estado del servicio
router.get('/status', sseController.getStatus);

module.exports = router;
