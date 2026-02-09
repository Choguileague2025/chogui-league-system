const express = require('express');
const router = express.Router();
const jugadoresController = require('../controllers/jugadores.controller');

// IMPORTANTE: /buscar debe ir ANTES de /:id para que no sea capturado como parametro
router.get('/buscar', jugadoresController.buscar);
router.get('/', jugadoresController.obtenerTodos);
router.get('/:id', jugadoresController.obtenerPorId);
router.get('/:id/partidos', jugadoresController.obtenerPartidos);
router.get('/:id/similares', jugadoresController.obtenerSimilares);
router.get('/:id/companeros', jugadoresController.obtenerCompaneros);
router.post('/', jugadoresController.crear);
router.put('/:id', jugadoresController.actualizar);
router.delete('/:id', jugadoresController.eliminar);

module.exports = router;
