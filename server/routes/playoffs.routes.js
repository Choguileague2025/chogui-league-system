const express = require('express');
const router = express.Router();
const playoffsController = require('../controllers/playoffs.controller');
const { requireAdmin } = require('../middleware/auth');

router.get('/bracket', playoffsController.obtenerBracket);
router.post('/initialize', requireAdmin, playoffsController.inicializarBracket);
router.put('/games/:id', requireAdmin, playoffsController.actualizarJuego);

module.exports = router;
