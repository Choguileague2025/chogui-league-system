const express = require('express');
const router = express.Router();
const partidosController = require('../controllers/partidos.controller');
const { requireAdmin } = require('../middleware/auth');

// IMPORTANTE: /proximos debe ir ANTES de /:id
router.get('/proximos', partidosController.obtenerProximos);
router.get('/', partidosController.obtenerTodos);
router.get('/:id', partidosController.obtenerPorId);
router.post('/', requireAdmin, partidosController.crear);
router.put('/:id', requireAdmin, partidosController.actualizar);
router.delete('/:id', requireAdmin, partidosController.eliminar);

module.exports = router;
