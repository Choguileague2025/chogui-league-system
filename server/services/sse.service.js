/**
 * Servicio de Server-Sent Events para actualizaciones en tiempo real
 */

// Almacena todas las conexiones SSE activas
const clients = new Set();
const MAX_CLIENTS = 100;

/**
 * Agrega un nuevo cliente SSE
 * @param {Response} res - Objeto response de Express
 */
function addClient(res) {
    if (clients.size >= MAX_CLIENTS) {
        res.status(503).json({ error: 'Too many SSE connections' });
        return;
    }

    // Configurar headers SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    // Enviar comentario inicial para mantener conexión
    res.write(':ok\n\n');

    // Agregar cliente al set
    clients.add(res);

    console.log(`[SSE] Cliente conectado. Total: ${clients.size}`);

    // Limpiar cuando se cierra la conexión
    res.on('close', () => {
        clients.delete(res);
        console.log(`[SSE] Cliente desconectado. Total: ${clients.size}`);
    });
}

// Limpiar conexiones muertas cada 30s
setInterval(() => {
    clients.forEach(client => {
        try {
            client.write(':ping\n\n');
        } catch (error) {
            clients.delete(client);
        }
    });
}, 30000);

/**
 * Notifica a todos los clientes conectados
 * @param {string} event - Nombre del evento
 * @param {object} data - Datos a enviar
 */
function notifyAll(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    console.log(`[SSE] Notificando a ${clients.size} clientes: ${event}`);

    // Enviar a todos los clientes
    clients.forEach(client => {
        try {
            client.write(message);
        } catch (error) {
            console.error('[SSE] Error al enviar a cliente:', error.message);
            clients.delete(client);
        }
    });
}

/**
 * Notifica actualización de estadísticas
 * @param {string} tipo - 'ofensivas' | 'pitcheo' | 'defensivas'
 * @param {object} datos - Datos actualizados
 */
function notifyStatsUpdate(tipo, datos) {
    notifyAll('stats-update', {
        tipo,
        jugador_id: datos.jugador_id,
        torneo_id: datos.torneo_id,
        timestamp: new Date().toISOString()
    });
}

/**
 * Notifica cambio de torneo activo
 * @param {object} torneo - Torneo activado
 */
function notifyTournamentChange(torneo) {
    notifyAll('tournament-change', {
        torneo_id: torneo.id,
        torneo_nombre: torneo.nombre,
        timestamp: new Date().toISOString()
    });
}

/**
 * Notifica actualización general (recalcular todo)
 */
function notifyGeneralUpdate() {
    notifyAll('general-update', {
        message: 'Recalcular estadísticas',
        timestamp: new Date().toISOString()
    });
}

/**
 * Obtiene número de clientes conectados
 * @returns {number}
 */
function getClientCount() {
    return clients.size;
}

module.exports = {
    addClient,
    notifyAll,
    notifyStatsUpdate,
    notifyTournamentChange,
    notifyGeneralUpdate,
    getClientCount
};
