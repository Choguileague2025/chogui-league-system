const express = require('express');
const router = express.Router();
const torneosController = require('../controllers/torneos.controller');
const { requireAdmin } = require('../middleware/auth');

// Rutas específicas ANTES de paramétrizadas
router.get('/', torneosController.obtenerTodos);
router.get('/activo', torneosController.obtenerActivo);
router.post('/', requireAdmin, torneosController.crear);
router.put('/desactivar-todos', requireAdmin, torneosController.desactivarTodos);

// Rutas parametrizadas
router.get('/:id', torneosController.obtenerPorId);
router.get('/:id/estadisticas', torneosController.obtenerEstadisticas);
router.put('/:id/activar', requireAdmin, torneosController.activar);
router.put('/:id', requireAdmin, torneosController.actualizar);
router.delete('/:id', requireAdmin, torneosController.eliminar);

module.exports = router;
