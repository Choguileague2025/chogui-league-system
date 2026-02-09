const express = require('express');
const router = express.Router();
const equiposController = require('../controllers/equipos.controller');

router.get('/', equiposController.obtenerTodos);
router.get('/:id', equiposController.obtenerPorId);
router.get('/:id/detalles', equiposController.obtenerDetalles);
router.get('/:id/estadisticas/ofensivas', equiposController.obtenerEstadisticasOfensivas);
router.get('/:id/logo', equiposController.obtenerLogo);
router.post('/', equiposController.crear);
router.put('/:id', equiposController.actualizar);
router.delete('/:id', equiposController.eliminar);

module.exports = router;
