const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { requireAdmin } = require('../middleware/auth');
const { adminLimiter } = require('../middleware/rateLimit');

router.post('/visit', analyticsController.registrarVisita);
router.get('/summary', requireAdmin, adminLimiter, analyticsController.obtenerResumen);

module.exports = router;
