const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');

router.get('/stats', dashboardController.obtenerStats);
router.get('/posiciones', dashboardController.obtenerPosiciones);
router.get('/lideres', dashboardController.obtenerLideres);
router.get('/lideres-ofensivos', dashboardController.obtenerLideresOfensivos);
router.get('/lideres-pitcheo', dashboardController.obtenerLideresPitcheo);
router.get('/lideres-defensivos', dashboardController.obtenerLideresDefensivos);
router.get('/records', dashboardController.obtenerRecordsHistoricos);
router.get('/campeones-posicion', dashboardController.obtenerCampeonesPosicion);
router.get('/premios-oficiales', dashboardController.obtenerPremiosOficiales);
router.get('/buscar', dashboardController.buscarUniversal);

module.exports = router;
