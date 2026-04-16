const express = require('express');
const router = express.Router();
const estadisticasController = require('../controllers/estadisticas.controller');
const { requireAdmin } = require('../middleware/auth');

// --- OFENSIVAS ---
router.get('/ofensivas', estadisticasController.obtenerOfensivas);
router.post('/ofensivas', requireAdmin, estadisticasController.upsertOfensivas);
router.put('/ofensivas', requireAdmin, estadisticasController.upsertOfensivas);
router.post('/ofensivas/edit', requireAdmin, estadisticasController.upsertOfensivas);
router.put('/ofensivas/edit', requireAdmin, estadisticasController.upsertOfensivas);

// Compatibilidad: con jugadorId en path
router.put('/ofensivas/:jugadorId', requireAdmin, (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});
router.post('/ofensivas/:jugadorId', requireAdmin, (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});

// --- PITCHEO ---
router.get('/pitcheo', estadisticasController.obtenerPitcheo);
router.get('/pitcheo/:id', estadisticasController.obtenerPitcheoPorJugador);
router.post('/pitcheo', requireAdmin, estadisticasController.crearPitcheo);
router.put('/pitcheo', requireAdmin, estadisticasController.actualizarPitcheo);

// --- DEFENSIVAS ---
router.get('/defensivas', estadisticasController.obtenerDefensivas);
router.get('/defensivas/:id', estadisticasController.obtenerDefensivasPorJugador);
router.post('/defensivas', requireAdmin, estadisticasController.crearDefensivas);
router.put('/defensivas', requireAdmin, estadisticasController.actualizarDefensivas);

module.exports = router;
