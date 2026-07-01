const express = require('express');
const router = express.Router();
const jugadoresController = require('../controllers/jugadores.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { adminLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { jugadorCreateSchema, jugadorUpdateSchema } = require('../schemas/jugadores.schema');

// IMPORTANTE: /buscar debe ir ANTES de /:id para que no sea capturado como parametro
router.get('/buscar', jugadoresController.buscar);
router.get('/', jugadoresController.obtenerTodos);
router.get('/:id', jugadoresController.obtenerPorId);
router.get('/:id/partidos', jugadoresController.obtenerPartidos);
router.get('/:id/historico', jugadoresController.obtenerHistorico);
router.get('/:id/vs-equipos', jugadoresController.obtenerVsEquipos);
router.get('/:id/scouting', jugadoresController.obtenerScouting);
router.get('/:id/comparar/:rivalId', jugadoresController.obtenerComparativa);
router.get('/:id/game-log', jugadoresController.obtenerGameLog);
router.get('/:id/similares', jugadoresController.obtenerSimilares);
router.get('/:id/companeros', jugadoresController.obtenerCompaneros);
router.post('/', requireAdmin, adminLimiter, requireCsrf, validateBody(jugadorCreateSchema), jugadoresController.crear);
router.put('/:id', requireAdmin, adminLimiter, requireCsrf, validateBody(jugadorUpdateSchema), jugadoresController.actualizar);
router.delete('/:id', requireAdmin, adminLimiter, requireCsrf, jugadoresController.eliminar);

module.exports = router;
