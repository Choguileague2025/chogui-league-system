const express = require('express');
const router = express.Router();
const torneosController = require('../controllers/torneos.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { adminLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { torneoCreateSchema, torneoUpdateSchema } = require('../schemas/torneos.schema');

// Rutas específicas ANTES de paramétrizadas
router.get('/', torneosController.obtenerTodos);
router.get('/publicos', torneosController.obtenerPublicos);
router.get('/activo', torneosController.obtenerActivo);
router.post('/', requireAdmin, adminLimiter, requireCsrf, validateBody(torneoCreateSchema), torneosController.crear);
router.put('/desactivar-todos', requireAdmin, adminLimiter, requireCsrf, torneosController.desactivarTodos);

// Rutas parametrizadas
router.get('/:id', torneosController.obtenerPorId);
router.get('/:id/estadisticas', torneosController.obtenerEstadisticas);
router.put('/:id/activar', requireAdmin, adminLimiter, requireCsrf, torneosController.activar);
router.put('/:id', requireAdmin, adminLimiter, requireCsrf, validateBody(torneoUpdateSchema), torneosController.actualizar);
router.delete('/:id', requireAdmin, adminLimiter, requireCsrf, torneosController.eliminar);

module.exports = router;
