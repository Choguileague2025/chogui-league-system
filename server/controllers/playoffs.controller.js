const playoffsService = require('../services/playoffs.service');
const sseService = require('../services/sse.service');

async function obtenerBracket(req, res, next) {
    try {
        const torneoId = req.query.torneo_id || null;
        const data = await playoffsService.getBracket(torneoId);
        res.json(data);
    } catch (error) {
        console.error('Error obteniendo bracket de playoffs:', error);
        next(error);
    }
}

async function inicializarBracket(req, res, next) {
    try {
        const torneoId = req.body?.torneo_id || req.query?.torneo_id || null;
        const force = req.body?.force === true;
        await playoffsService.initializeDefaultBracket(torneoId, { force });
        const data = await playoffsService.getBracket(torneoId);
        sseService.notifyGeneralUpdate({ type: 'playoffs-init' });
        res.status(201).json(data);
    } catch (error) {
        console.error('Error inicializando bracket de playoffs:', error);
        next(error);
    }
}

async function actualizarJuego(req, res, next) {
    try {
        await playoffsService.updateGame(req.params.id, req.body);
        const torneoId = req.body?.torneo_id || req.query?.torneo_id || null;
        const data = await playoffsService.getBracket(torneoId);
        sseService.notifyGeneralUpdate({ type: 'playoffs-update', game_id: req.params.id });
        res.json(data);
    } catch (error) {
        console.error('Error actualizando juego de playoffs:', error);
        next(error);
    }
}

module.exports = {
    obtenerBracket,
    inicializarBracket,
    actualizarJuego
};
