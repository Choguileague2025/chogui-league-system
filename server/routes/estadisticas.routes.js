const express = require('express');
const router = express.Router();
const estadisticasController = require('../controllers/estadisticas.controller');

// --- OFENSIVAS ---
router.get('/ofensivas', estadisticasController.obtenerOfensivas);
router.post('/ofensivas', estadisticasController.upsertOfensivas);
router.put('/ofensivas', estadisticasController.upsertOfensivas);
router.post('/ofensivas/edit', estadisticasController.upsertOfensivas);
router.put('/ofensivas/edit', estadisticasController.upsertOfensivas);

// Compatibilidad: con jugadorId en path
router.put('/ofensivas/:jugadorId', (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});
router.post('/ofensivas/:jugadorId', (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});

// --- PITCHEO ---
router.get('/pitcheo', estadisticasController.obtenerPitcheo);
router.get('/pitcheo/:id', estadisticasController.obtenerPitcheoPorJugador);
router.post('/pitcheo', estadisticasController.crearPitcheo);
router.put('/pitcheo', estadisticasController.actualizarPitcheo);

// --- DEFENSIVAS ---
router.get('/defensivas', estadisticasController.obtenerDefensivas);
router.get('/defensivas/:id', estadisticasController.obtenerDefensivasPorJugador);
router.post('/defensivas', estadisticasController.crearDefensivas);
router.put('/defensivas', estadisticasController.actualizarDefensivas);

module.exports = router;
