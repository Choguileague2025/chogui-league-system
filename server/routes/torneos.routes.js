const express = require('express');
const router = express.Router();
const torneosController = require('../controllers/torneos.controller');

// Rutas específicas ANTES de paramétrizadas
router.get('/', torneosController.obtenerTodos);
router.get('/activo', torneosController.obtenerActivo);
router.post('/', torneosController.crear);
router.put('/desactivar-todos', torneosController.desactivarTodos);

// Rutas parametrizadas
router.get('/:id', torneosController.obtenerPorId);
router.get('/:id/estadisticas', torneosController.obtenerEstadisticas);
router.put('/:id/activar', torneosController.activar);
router.put('/:id', torneosController.actualizar);
router.delete('/:id', torneosController.eliminar);

module.exports = router;
