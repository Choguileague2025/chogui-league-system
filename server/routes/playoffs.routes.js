const express = require('express');
const router = express.Router();
const playoffsController = require('../controllers/playoffs.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { adminLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { playoffGameUpdateSchema } = require('../schemas/playoffs.schema');

router.get('/bracket', playoffsController.obtenerBracket);
router.post('/initialize', requireAdmin, adminLimiter, requireCsrf, playoffsController.inicializarBracket);
router.put('/games/:id', requireAdmin, adminLimiter, requireCsrf, validateBody(playoffGameUpdateSchema), playoffsController.actualizarJuego);

module.exports = router;
