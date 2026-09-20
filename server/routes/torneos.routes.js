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

// Equipos y planteles independientes por edición.
const planteles = require('../services/planteles.service');
const handle = fn => async (req, res, next) => { try { res.json(await fn(req)); } catch (err) { next(err); } };
const admin = [requireAdmin, adminLimiter, requireCsrf];
router.get('/:id/equipos', handle(req => planteles.equipos(req.params.id)));
router.get('/:id/plantel', handle(req => planteles.jugadores(req.params.id, req.query.equipo_id)));
router.post('/:id/equipos', ...admin, handle(req => planteles.inscribirEquipo(req.params.id, req.body.equipo_id)));
router.delete('/:id/equipos/:equipoId', ...admin, handle(req => planteles.retirarEquipo(req.params.id, req.params.equipoId)));
router.put('/:id/plantel/:jugadorId', ...admin, handle(req => planteles.inscribirJugador(req.params.id, req.params.jugadorId, req.body)));
router.delete('/:id/plantel/:jugadorId', ...admin, handle(req => planteles.retirarJugador(req.params.id, req.params.jugadorId)));

// Rutas parametrizadas
router.get('/:id', torneosController.obtenerPorId);
router.get('/:id/estadisticas', torneosController.obtenerEstadisticas);
router.put('/:id/activar', requireAdmin, adminLimiter, requireCsrf, torneosController.activar);
router.put('/:id', requireAdmin, adminLimiter, requireCsrf, validateBody(torneoUpdateSchema), torneosController.actualizar);
router.delete('/:id', requireAdmin, adminLimiter, requireCsrf, torneosController.eliminar);

module.exports = router;
