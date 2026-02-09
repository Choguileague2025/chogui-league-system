const express = require('express');
const router = express.Router();
const partidosController = require('../controllers/partidos.controller');

// IMPORTANTE: /proximos debe ir ANTES de /:id
router.get('/proximos', partidosController.obtenerProximos);
router.get('/', partidosController.obtenerTodos);
router.get('/:id', partidosController.obtenerPorId);
router.post('/', partidosController.crear);
router.put('/:id', partidosController.actualizar);
router.delete('/:id', partidosController.eliminar);

module.exports = router;
