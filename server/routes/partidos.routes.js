const express = require('express');
const router = express.Router();
const partidosController = require('../controllers/partidos.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { adminLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { partidoCreateSchema, partidoUpdateSchema, boxscoreSchema } = require('../schemas/partidos.schema');

// IMPORTANTE: /proximos debe ir ANTES de /:id
router.get('/proximos', partidosController.obtenerProximos);
router.get('/', partidosController.obtenerTodos);
router.get('/:id/boxscore', partidosController.obtenerBoxscore);
router.post('/:id/boxscore', requireAdmin, adminLimiter, requireCsrf, validateBody(boxscoreSchema), partidosController.guardarBoxscore);
router.put('/:id/boxscore', requireAdmin, adminLimiter, requireCsrf, validateBody(boxscoreSchema), partidosController.guardarBoxscore);
router.get('/:id', partidosController.obtenerPorId);
router.post('/', requireAdmin, adminLimiter, requireCsrf, validateBody(partidoCreateSchema), partidosController.crear);
router.put('/:id', requireAdmin, adminLimiter, requireCsrf, validateBody(partidoUpdateSchema), partidosController.actualizar);
router.delete('/:id', requireAdmin, adminLimiter, requireCsrf, partidosController.eliminar);

module.exports = router;
