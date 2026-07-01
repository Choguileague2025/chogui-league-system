const express = require('express');
const router = express.Router();
const estadisticasController = require('../controllers/estadisticas.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { adminLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { ofensivasSchema, pitcheoSchema, defensivasSchema } = require('../schemas/estadisticas.schema');

// --- OFENSIVAS ---
router.get('/ofensivas', estadisticasController.obtenerOfensivas);
router.post('/ofensivas', requireAdmin, adminLimiter, requireCsrf, validateBody(ofensivasSchema), estadisticasController.upsertOfensivas);
router.put('/ofensivas', requireAdmin, adminLimiter, requireCsrf, validateBody(ofensivasSchema), estadisticasController.upsertOfensivas);
router.post('/ofensivas/edit', requireAdmin, adminLimiter, requireCsrf, validateBody(ofensivasSchema), estadisticasController.upsertOfensivas);
router.put('/ofensivas/edit', requireAdmin, adminLimiter, requireCsrf, validateBody(ofensivasSchema), estadisticasController.upsertOfensivas);

// Compatibilidad: con jugadorId en path
router.put('/ofensivas/:jugadorId', requireAdmin, adminLimiter, requireCsrf, (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return validateBody(ofensivasSchema)(req, res, () => {
        return estadisticasController.upsertOfensivas(req, res, next);
    });
});
router.post('/ofensivas/:jugadorId', requireAdmin, adminLimiter, requireCsrf, (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return validateBody(ofensivasSchema)(req, res, () => {
        return estadisticasController.upsertOfensivas(req, res, next);
    });
});

// --- PITCHEO ---
router.get('/pitcheo', estadisticasController.obtenerPitcheo);
router.get('/pitcheo/:id', estadisticasController.obtenerPitcheoPorJugador);
router.post('/pitcheo', requireAdmin, adminLimiter, requireCsrf, validateBody(pitcheoSchema), estadisticasController.crearPitcheo);
router.put('/pitcheo', requireAdmin, adminLimiter, requireCsrf, validateBody(pitcheoSchema), estadisticasController.actualizarPitcheo);

// --- DEFENSIVAS ---
router.get('/defensivas', estadisticasController.obtenerDefensivas);
router.get('/defensivas/:id', estadisticasController.obtenerDefensivasPorJugador);
router.post('/defensivas', requireAdmin, adminLimiter, requireCsrf, validateBody(defensivasSchema), estadisticasController.crearDefensivas);
router.put('/defensivas', requireAdmin, adminLimiter, requireCsrf, validateBody(defensivasSchema), estadisticasController.actualizarDefensivas);

module.exports = router;
