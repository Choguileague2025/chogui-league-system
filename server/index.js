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
// Legacy /api/leaders (English, used by index.html inline JS)
// Supports ?tipo=bateo&stat=avg&limit=10 and returns jugador_nombre/equipo_nombre
app.get('/api/leaders', async (req, res, next) => {
    try {
        const { tipo = 'bateo', stat, limit: lim, min_ab = 1 } = req.query;

        if (tipo === 'bateo') {
            const validStats = {
                'avg': 'avg DESC',
                'home_runs': 'eo.home_runs DESC',
                'rbi': 'eo.rbi DESC',
                'hits': 'eo.hits DESC',
                'stolen_bases': 'eo.stolen_bases DESC',
                'strikeouts': 'eo.strikeouts DESC'
            };
            const orderBy = validStats[stat] || 'avg DESC';

            const result = await pool.query(`
                SELECT
                    j.id as jugador_id, j.nombre as jugador_nombre, j.posicion,
                    e.nombre as equipo_nombre,
                    eo.at_bats, eo.hits, eo.home_runs, eo.rbi, eo.runs,
                    eo.walks, eo.stolen_bases, eo.strikeouts,
                    COALESCE(eo.doubles, 0) as doubles,
                    COALESCE(eo.triples, 0) as triples,
                    CASE WHEN eo.at_bats > 0
                        THEN ROUND(eo.hits::DECIMAL / eo.at_bats, 3)
                        ELSE 0.000 END as avg,
                    CASE WHEN (eo.at_bats + eo.walks + COALESCE(eo.hit_by_pitch, 0) + COALESCE(eo.sacrifice_flies, 0)) > 0
                        THEN ROUND((eo.hits + eo.walks + COALESCE(eo.hit_by_pitch, 0))::DECIMAL /
                                 (eo.at_bats + eo.walks + COALESCE(eo.hit_by_pitch, 0) + COALESCE(eo.sacrifice_flies, 0)), 3)
                        ELSE 0.000 END as obp,
                    CASE WHEN eo.at_bats > 0
                        THEN ROUND(((eo.hits - COALESCE(eo.doubles, 0) - COALESCE(eo.triples, 0) - eo.home_runs) +
                                  COALESCE(eo.doubles, 0) * 2 + COALESCE(eo.triples, 0) * 3 + eo.home_runs * 4)::DECIMAL / eo.at_bats, 3)
                        ELSE 0.000 END as slg
                FROM estadisticas_ofensivas eo
                JOIN jugadores j ON eo.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE eo.at_bats >= $1
                ORDER BY ${orderBy}
                LIMIT $2
            `, [parseInt(min_ab), parseInt(lim) || 20]);
            res.json(result.rows);

        } else if (tipo === 'pitcheo') {
            const result = await pool.query(`
                SELECT
                    j.id as jugador_id, j.nombre as jugador_nombre,
                    e.nombre as equipo_nombre,
                    ep.innings_pitched, ep.earned_runs, ep.strikeouts, ep.walks_allowed,
                    ep.hits_allowed, ep.wins, ep.losses,
                    CASE WHEN ep.innings_pitched > 0
                        THEN ROUND((ep.earned_runs * 9.0) / ep.innings_pitched, 2)
                        ELSE 0.00 END as era,
                    CASE WHEN ep.innings_pitched > 0
                        THEN ROUND((ep.hits_allowed + ep.walks_allowed) / ep.innings_pitched, 2)
                        ELSE 0.00 END as whip
                FROM estadisticas_pitcheo ep
                JOIN jugadores j ON ep.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE ep.innings_pitched >= 3
                ORDER BY era ASC
                LIMIT $1
            `, [parseInt(lim) || 20]);
            res.json(result.rows);

        } else if (tipo === 'defensiva' || tipo === 'defensa') {
            const result = await pool.query(`
                SELECT
                    j.id as jugador_id, j.nombre as jugador_nombre, j.posicion,
                    e.nombre as equipo_nombre,
                    ed.putouts, ed.assists, ed.errors,
                    CASE WHEN (ed.putouts + ed.assists + ed.errors) > 0
                        THEN ROUND((ed.putouts + ed.assists)::DECIMAL / (ed.putouts + ed.assists + ed.errors), 3)
                        ELSE 1.000 END as fielding_percentage
                FROM estadisticas_defensivas ed
                JOIN jugadores j ON ed.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                ORDER BY fielding_percentage DESC
                LIMIT $1
            `, [parseInt(lim) || 20]);
            res.json(result.rows);
        } else {
            res.status(400).json({ error: 'Tipo no válido' });
        }
    } catch (error) {
        console.error('Error en /api/leaders:', error);
        next(error);
    }
});

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
