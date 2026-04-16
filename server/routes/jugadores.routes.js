const express = require('express');
const router = express.Router();
const jugadoresController = require('../controllers/jugadores.controller');
const { requireAdmin } = require('../middleware/auth');

// IMPORTANTE: /buscar debe ir ANTES de /:id para que no sea capturado como parametro
router.get('/buscar', jugadoresController.buscar);
router.get('/', jugadoresController.obtenerTodos);
router.get('/:id', jugadoresController.obtenerPorId);
router.get('/:id/partidos', jugadoresController.obtenerPartidos);
router.get('/:id/similares', jugadoresController.obtenerSimilares);
router.get('/:id/companeros', jugadoresController.obtenerCompaneros);
router.post('/', requireAdmin, jugadoresController.crear);
router.put('/:id', requireAdmin, jugadoresController.actualizar);
router.delete('/:id', requireAdmin, jugadoresController.eliminar);

module.exports = router;
