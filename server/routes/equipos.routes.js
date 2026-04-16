const express = require('express');
const router = express.Router();
const equiposController = require('../controllers/equipos.controller');
const { requireAdmin } = require('../middleware/auth');

router.get('/', equiposController.obtenerTodos);
router.get('/:id', equiposController.obtenerPorId);
router.get('/:id/detalles', equiposController.obtenerDetalles);
router.get('/:id/estadisticas/ofensivas', equiposController.obtenerEstadisticasOfensivas);
router.get('/:id/logo', equiposController.obtenerLogo);
router.post('/', requireAdmin, equiposController.crear);
router.put('/:id', requireAdmin, equiposController.actualizar);
router.delete('/:id', requireAdmin, equiposController.eliminar);

module.exports = router;
