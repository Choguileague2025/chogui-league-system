const express = require('express');
const router = express.Router();
const equiposController = require('../controllers/equipos.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { adminLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { equipoCreateSchema, equipoUpdateSchema } = require('../schemas/equipos.schema');

router.get('/', equiposController.obtenerTodos);
router.get('/:id', equiposController.obtenerPorId);
router.get('/:id/detalles', equiposController.obtenerDetalles);
router.get('/:id/estadisticas/ofensivas', equiposController.obtenerEstadisticasOfensivas);
router.get('/:id/historico', equiposController.obtenerHistorico);
router.get('/:id/head-to-head', equiposController.obtenerHeadToHead);
router.get('/:id/playoff-path', equiposController.obtenerCaminoPlayoffs);
router.get('/:id/comparar/:rivalId', equiposController.obtenerComparativa);
router.get('/:id/scouting', equiposController.obtenerScouting);
router.get('/:id/logo', equiposController.obtenerLogo);
router.post('/', requireAdmin, adminLimiter, requireCsrf, validateBody(equipoCreateSchema), equiposController.crear);
router.put('/:id', requireAdmin, adminLimiter, requireCsrf, validateBody(equipoUpdateSchema), equiposController.actualizar);
router.delete('/:id', requireAdmin, adminLimiter, requireCsrf, equiposController.eliminar);

module.exports = router;
