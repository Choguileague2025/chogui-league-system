const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const config = require('./config/environment');
const corsOptions = require('./config/cors');
const pool = require('./config/database');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const torneosRoutes = require('./routes/torneos.routes');
const equiposRoutes = require('./routes/equipos.routes');
const jugadoresRoutes = require('./routes/jugadores.routes');
const partidosRoutes = require('./routes/partidos.routes');
const estadisticasRoutes = require('./routes/estadisticas.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const sseRoutes = require('./routes/sse.routes');

const app = express();

// Middlewares
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// Servir archivos estaticos
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as time');
        res.json({
            success: true,
            status: 'ok',
            timestamp: result.rows[0].time,
            environment: config.nodeEnv
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            status: 'error',
            error: err.message
        });
    }
});

// ==================== RUTAS API ====================
app.use('/api', authRoutes);
app.use('/api/torneos', torneosRoutes);
app.use('/api/equipos', equiposRoutes);
app.use('/api/jugadores', jugadoresRoutes);
app.use('/api/partidos', partidosRoutes);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sse', sseRoutes);

// ==================== ALIASES DE COMPATIBILIDAD ====================
// El frontend usa estas rutas directamente; redirigimos al controller correcto
const dashboardController = require('./controllers/dashboard.controller');
const partidosController = require('./controllers/partidos.controller');
const estadisticasController = require('./controllers/estadisticas.controller');

// Aliases: rutas legacy del frontend -> nuevos controllers
app.get('/api/posiciones', dashboardController.obtenerPosiciones);
app.get('/api/lideres', dashboardController.obtenerLideres);
app.get('/api/lideres-ofensivos', dashboardController.obtenerLideresOfensivos);
app.get('/api/lideres-pitcheo', dashboardController.obtenerLideresPitcheo);
app.get('/api/lideres-defensivos', dashboardController.obtenerLideresDefensivos);
app.get('/api/buscar', dashboardController.buscarUniversal);
app.get('/api/proximos-partidos', partidosController.obtenerProximos);

// Aliases: rutas legacy estadisticas con guion (frontend usa /api/estadisticas-ofensivas)
app.get('/api/estadisticas-ofensivas', estadisticasController.obtenerOfensivas);
app.post('/api/estadisticas-ofensivas', estadisticasController.upsertOfensivas);
app.put('/api/estadisticas-ofensivas', estadisticasController.upsertOfensivas);
app.post('/api/estadisticas-ofensivas/edit', estadisticasController.upsertOfensivas);
app.put('/api/estadisticas-ofensivas/edit', estadisticasController.upsertOfensivas);

app.get('/api/estadisticas-pitcheo', estadisticasController.obtenerPitcheo);
app.get('/api/estadisticas-pitcheo/:id', estadisticasController.obtenerPitcheoPorJugador);
app.post('/api/estadisticas-pitcheo', estadisticasController.crearPitcheo);
app.put('/api/estadisticas-pitcheo', estadisticasController.actualizarPitcheo);

app.get('/api/estadisticas-defensivas', estadisticasController.obtenerDefensivas);
app.get('/api/estadisticas-defensivas/:id', estadisticasController.obtenerDefensivasPorJugador);
app.post('/api/estadisticas-defensivas', estadisticasController.crearDefensivas);
app.put('/api/estadisticas-defensivas', estadisticasController.actualizarDefensivas);

// Aliases: guion bajo (legacy)
app.get('/api/estadisticas_ofensivas', estadisticasController.obtenerOfensivas);
app.put('/api/estadisticas_ofensivas', estadisticasController.upsertOfensivas);
app.post('/api/estadisticas_ofensivas', estadisticasController.upsertOfensivas);

// Aliases: con jugadorId en path
app.put('/api/estadisticas-ofensivas/:jugadorId', (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});
app.post('/api/estadisticas-ofensivas/:jugadorId', (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});
app.put('/api/estadisticas_ofensivas/:jugadorId', (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});
app.post('/api/estadisticas_ofensivas/:jugadorId', (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});

// ==================== RUTAS HTML ====================
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.get('/equipo.html', (req, res) => res.sendFile(path.join(__dirname, '../public/equipo.html')));

// Ruta raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler (debe ir al final)
app.use(errorHandler);

// Iniciar servidor
const PORT = config.port;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📦 Entorno: ${config.nodeEnv}`);
    console.log(`📊 Rutas: auth, torneos, equipos, jugadores, partidos, estadisticas, dashboard, sse`);
    console.log(`📡 SSE activo en /api/sse/updates`);
});

module.exports = app;
