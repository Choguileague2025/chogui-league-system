const sseService = require('../services/sse.service');

/**
 * GET /api/sse/updates
 * Establece conexión SSE con el cliente
 */
function streamUpdates(req, res) {
    sseService.addClient(res);
}

/**
 * GET /api/sse/status
 * Devuelve estado del servicio SSE
 */
function getStatus(req, res) {
    res.json({
        active: true,
        clients_connected: sseService.getClientCount(),
        timestamp: new Date().toISOString()
    });
}

module.exports = {
    streamUpdates,
    getStatus
};
