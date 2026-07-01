const express = require('express');
const router = express.Router();
const ligasController = require('../controllers/ligas.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { adminLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const {
    ligaCreateSchema,
    ligaUpdateSchema,
    divisionCreateSchema,
    divisionUpdateSchema,
    clasificacionAssignSchema
} = require('../schemas/ligas.schema');

router.get('/ligas', ligasController.obtenerLigas);
router.post('/ligas', requireAdmin, adminLimiter, requireCsrf, validateBody(ligaCreateSchema), ligasController.crearLiga);
router.put('/ligas/:id', requireAdmin, adminLimiter, requireCsrf, validateBody(ligaUpdateSchema), ligasController.actualizarLiga);
router.delete('/ligas/:id', requireAdmin, adminLimiter, requireCsrf, ligasController.eliminarLiga);

router.get('/ligas/:ligaId/divisiones', ligasController.obtenerDivisiones);
router.get('/divisiones', ligasController.obtenerDivisiones);
router.post('/divisiones', requireAdmin, adminLimiter, requireCsrf, validateBody(divisionCreateSchema), ligasController.crearDivision);
router.put('/divisiones/:id', requireAdmin, adminLimiter, requireCsrf, validateBody(divisionUpdateSchema), ligasController.actualizarDivision);
router.delete('/divisiones/:id', requireAdmin, adminLimiter, requireCsrf, ligasController.eliminarDivision);

router.put('/:tipo/:id/clasificacion', requireAdmin, adminLimiter, requireCsrf, validateBody(clasificacionAssignSchema), ligasController.asignarEntidad);

module.exports = router;
