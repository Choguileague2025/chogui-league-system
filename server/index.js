const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');

const config = require('./config/environment');
const corsOptions = require('./config/cors');
const pool = require('./config/database');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const { requireAdmin } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimit');
const { resolveTorneoId } = require('./services/torneos.service');
const { hasColumn } = require('./utils/schema');
const { DEFAULT_TOTAL_GAMES, DEFAULT_PLAYOFF_SLOTS, normalizePlayoffFormat } = require('./utils/playoffFormat');

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const torneosRoutes = require('./routes/torneos.routes');
const equiposRoutes = require('./routes/equipos.routes');
const jugadoresRoutes = require('./routes/jugadores.routes');
const partidosRoutes = require('./routes/partidos.routes');
const estadisticasRoutes = require('./routes/estadisticas.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const sseRoutes = require('./routes/sse.routes');
const playoffsRoutes = require('./routes/playoffs.routes');
const ligasRoutes = require('./routes/ligas.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();
const contentSecurityPolicyDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    fontSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"]
};

if (config.nodeEnv === 'production') {
    contentSecurityPolicyDirectives.upgradeInsecureRequests = [];
}

// Middlewares
app.use(compression());
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        useDefaults: true,
        directives: contentSecurityPolicyDirectives
    },
    hsts: config.nodeEnv === 'production'
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
        : false
}));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// Servir archivos estaticos
app.use(express.static(path.join(__dirname, '../public')));
app.use('/logos-play', express.static(path.join(__dirname, '../LOGOS PLAY')));

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
app.use('/api', apiLimiter);
app.use('/api', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/torneos', torneosRoutes);

// Overrides productivos para histórico/scouting.
app.get('/api/jugadores/:id/historico', require('./controllers/jugadores.controller').obtenerHistorico);

app.get('/api/equipos/:id/historico', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const shouldFilterByTournament = hasPartidosTorneo && torneo_id && torneo_id !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneo_id) : null;

        const equipoResult = await pool.query('SELECT * FROM equipos WHERE id = $1 LIMIT 1', [id]);
        if (!equipoResult.rows.length) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        const params = [id];
        let tournamentFilter = '';
        if (shouldFilterByTournament && torneoIdResolved) {
            params.push(torneoIdResolved);
            tournamentFilter = ` AND p.torneo_id = $${params.length}`;
        }

        const careerResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE p.estado = 'finalizado')::INT AS juegos,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local > p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante > p.carreras_local)
                ))::INT AS victorias,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local < p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante < p.carreras_local)
                ))::INT AS derrotas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_local
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_visitante
                    ELSE 0
                END), 0)::INT AS carreras_anotadas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_visitante
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_local
                    ELSE 0
                END), 0)::INT AS carreras_permitidas
            FROM partidos p
            WHERE (p.equipo_local_id = $1 OR p.equipo_visitante_id = $1)
            ${tournamentFilter}
        `, params);

        const porTorneoResult = hasPartidosTorneo ? await pool.query(`
            SELECT
                t.id AS torneo_id,
                t.nombre AS torneo_nombre,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado')::INT AS juegos,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local > p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante > p.carreras_local)
                ))::INT AS victorias,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local < p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante < p.carreras_local)
                ))::INT AS derrotas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_local
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_visitante
                    ELSE 0
                END), 0)::INT AS carreras_anotadas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_visitante
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_local
                    ELSE 0
                END), 0)::INT AS carreras_permitidas
            FROM torneos t
            JOIN partidos p ON p.torneo_id = t.id
            WHERE (p.equipo_local_id = $1 OR p.equipo_visitante_id = $1)
            GROUP BY t.id, t.nombre, t.fecha_inicio
            ORDER BY t.fecha_inicio DESC NULLS LAST, t.id DESC
        `, [id]) : { rows: [] };

        const rosterResult = await pool.query(`
            SELECT COUNT(*)::INT AS total_jugadores,
                   COUNT(*) FILTER (WHERE posicion = 'P')::INT AS pitchers
            FROM jugadores
            WHERE equipo_id = $1
        `, [id]);

        const career = careerResult.rows[0];
        const games = Number(career.juegos) || 0;
        const wins = Number(career.victorias) || 0;

        res.json({
            equipo: equipoResult.rows[0],
            career: {
                ...career,
                porcentaje: Number((games > 0 ? wins / games : 0).toFixed(3)),
                diferencial: (Number(career.carreras_anotadas) || 0) - (Number(career.carreras_permitidas) || 0),
                roster: rosterResult.rows[0]
            },
            by_tournament: porTorneoResult.rows
        });
    } catch (error) {
        next(error);
    }
});

app.use('/api/equipos', equiposRoutes);
app.use('/api/jugadores', jugadoresRoutes);
app.use('/api/partidos', partidosRoutes);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/playoffs', playoffsRoutes);
app.use('/api', ligasRoutes);

// ==================== ALIASES DE COMPATIBILIDAD ====================
// El frontend usa estas rutas directamente; redirigimos al controller correcto
const dashboardController = require('./controllers/dashboard.controller');
const partidosController = require('./controllers/partidos.controller');
const estadisticasController = require('./controllers/estadisticas.controller');
const estadisticasService = require('./services/estadisticas.service');

// Aliases: rutas legacy del frontend -> nuevos controllers
app.get('/api/posiciones', dashboardController.obtenerPosiciones);
app.get('/api/lideres', dashboardController.obtenerLideres);
// Legacy /api/leaders (English, used by index.html inline JS)
// Supports ?tipo=bateo&stat=avg&limit=10 and returns jugador_nombre/equipo_nombre
app.get('/api/leaders', async (req, res, next) => {
    try {
        const { tipo = 'bateo', stat, limit: lim, min_ab = 1, torneo_id } = req.query;
        const limit = parseInt(lim) || 20;

        if (tipo === 'bateo') {
            const rows = await estadisticasService.obtenerOfensivas({
                torneo_id,
                min_at_bats: min_ab
            });

            const sorters = {
                avg: (a, b) => Number(b.avg) - Number(a.avg),
                home_runs: (a, b) => Number(b.home_runs) - Number(a.home_runs),
                rbi: (a, b) => Number(b.rbi) - Number(a.rbi),
                hits: (a, b) => Number(b.hits) - Number(a.hits),
                stolen_bases: (a, b) => Number(b.stolen_bases) - Number(a.stolen_bases),
                strikeouts: (a, b) => Number(b.strikeouts) - Number(a.strikeouts)
            };
            const orderFn = sorters[stat] || sorters.avg;
            res.json([...rows].sort(orderFn).slice(0, limit));

        } else if (tipo === 'pitcheo') {
            const rows = await estadisticasService.obtenerPitcheo({ torneo_id });
            res.json(
                rows
                    .filter(jugador => Number(jugador.innings_pitched) >= 3)
                    .sort((a, b) => {
                        const eraDiff = Number(a.era) - Number(b.era);
                        if (eraDiff !== 0) return eraDiff;
                        return Number(a.whip) - Number(b.whip);
                    })
                    .slice(0, limit)
            );

        } else if (tipo === 'defensiva' || tipo === 'defensa') {
            const rows = await estadisticasService.obtenerDefensivas({ torneo_id });
            res.json(
                rows
                    .filter(jugador => Number(jugador.chances) >= 5)
                    .sort((a, b) => Number(b.fielding_percentage) - Number(a.fielding_percentage))
                    .slice(0, limit)
            );
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

// Legacy /api/standings (used by index.html inline JS for tabla de posiciones)
app.get('/api/standings', dashboardController.obtenerPosiciones);

// Legacy /api/playoffs-clasificacion (used by index.html inline JS for playoffs view)
app.get('/api/playoffs-clasificacion', async (req, res, next) => {
    try {
        const torneoIdParam = req.query.torneo_id;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const torneoIdResolved = hasPartidosTorneo && torneoIdParam !== 'todos'
            ? await resolveTorneoId(torneoIdParam || null)
            : null;

        // 1. Get active tournament config
        const torneoResult = torneoIdResolved
            ? await pool.query(
                'SELECT id, nombre, total_juegos, cupos_playoffs FROM torneos WHERE id = $1 LIMIT 1',
                [torneoIdResolved]
            )
            : await pool.query(
                'SELECT id, nombre, total_juegos, cupos_playoffs FROM torneos WHERE activo = true LIMIT 1'
            );
        if (torneoResult.rows.length === 0) {
            return res.json({ configuracion: { cupos_playoffs: DEFAULT_PLAYOFF_SLOTS, total_juegos: DEFAULT_TOTAL_GAMES }, equipos: [] });
        }
        const torneo = torneoResult.rows[0];

        // 2. Get standings (same query as obtenerPosiciones)
        const standingsParams = [];
        const tournamentJoinFilter = hasPartidosTorneo && torneo.id
            ? ` AND p.torneo_id = $1`
            : '';
        if (hasPartidosTorneo && torneo.id) {
            standingsParams.push(torneo.id);
        }

        const standingsResult = await pool.query(`
            SELECT
                e.id, e.nombre as equipo_nombre,
                COUNT(p.id) as pj,
                SUM(CASE
                    WHEN (p.equipo_local_id = e.id AND p.carreras_local > p.carreras_visitante)
                      OR (p.equipo_visitante_id = e.id AND p.carreras_visitante > p.carreras_local) THEN 1
                    ELSE 0 END) as pg,
                SUM(CASE
                    WHEN (p.equipo_local_id = e.id AND p.carreras_local < p.carreras_visitante)
                      OR (p.equipo_visitante_id = e.id AND p.carreras_visitante < p.carreras_local) THEN 1
                    ELSE 0 END) as pp,
                SUM(CASE WHEN p.equipo_local_id = e.id THEN COALESCE(p.carreras_local, 0)
                         WHEN p.equipo_visitante_id = e.id THEN COALESCE(p.carreras_visitante, 0)
                         ELSE 0 END) as cf,
                SUM(CASE WHEN p.equipo_local_id = e.id THEN COALESCE(p.carreras_visitante, 0)
                         WHEN p.equipo_visitante_id = e.id THEN COALESCE(p.carreras_local, 0)
                         ELSE 0 END) as ce
            FROM equipos e
            ${torneoIdResolved ? 'JOIN torneo_equipos te ON te.equipo_id=e.id AND te.torneo_id=$1' : ''}
            LEFT JOIN partidos p ON (p.equipo_local_id = e.id OR p.equipo_visitante_id = e.id)
                AND p.estado = 'finalizado'
                ${tournamentJoinFilter}
            GROUP BY e.id, e.nombre
            HAVING COUNT(p.id) > 0
            ORDER BY pg DESC, (SUM(CASE
                    WHEN (p.equipo_local_id = e.id AND p.carreras_local > p.carreras_visitante)
                      OR (p.equipo_visitante_id = e.id AND p.carreras_visitante > p.carreras_local) THEN 1
                    ELSE 0 END)::DECIMAL / NULLIF(COUNT(p.id), 0)) DESC
        `, standingsParams);

        const { totalJuegos, cuposPlayoffs } = normalizePlayoffFormat({
            totalJuegos: torneo.total_juegos,
            cuposPlayoffs: torneo.cupos_playoffs,
            teamCount: standingsResult.rows.length,
            tournamentName: torneo.nombre
        });

        // 3. Calculate playoff classification for each team
        const equipos = standingsResult.rows.map((team, index) => {
            const pj = parseInt(team.pj) || 0;
            const pg = parseInt(team.pg) || 0;
            const pp = parseInt(team.pp) || 0;
            const cf = parseInt(team.cf) || 0;
            const ce = parseInt(team.ce) || 0;
            const restantes = Math.max(0, totalJuegos - pj);
            const maxVictorias = pg + restantes;
            const porcentaje = pj > 0 ? pg / pj : 0;

            return {
                posicion: index + 1,
                equipo_nombre: team.equipo_nombre,
                equipo_id: team.id,
                pj, pg, pp,
                porcentaje,
                cf, ce,
                dif: cf - ce,
                restantes,
                max_victorias: maxVictorias,
                estado: 'contención' // will be updated below
            };
        });

        // 4. Determine classification status
        // The team at cupos_playoffs position sets the threshold
        const cutoffWins = equipos.length >= cuposPlayoffs
            ? parseInt(equipos[cuposPlayoffs - 1]?.pg) || 0
            : 0;

        equipos.forEach((team, i) => {
            if (i < cuposPlayoffs && team.pg >= cutoffWins && team.pj > 0) {
                // Check if mathematically clinched
                const canBePassed = equipos.slice(cuposPlayoffs).some(
                    other => other.max_victorias >= team.pg
                );
                team.estado = canBePassed ? 'contención' : 'clasificado';
            } else if (team.max_victorias < cutoffWins) {
                team.estado = 'eliminado';
            } else {
                team.estado = 'contención';
            }
        });

        res.json({
            configuracion: {
                cupos_playoffs: cuposPlayoffs,
                total_juegos: totalJuegos,
                torneo_nombre: torneo.nombre
            },
            equipos
        });
    } catch (error) {
        console.error('Error en /api/playoffs-clasificacion:', error);
        next(error);
    }
});

// Aliases: rutas legacy estadisticas con guion (frontend usa /api/estadisticas-ofensivas)
app.get('/api/estadisticas-ofensivas', estadisticasController.obtenerOfensivas);
app.post('/api/estadisticas-ofensivas', requireAdmin, estadisticasController.upsertOfensivas);
app.put('/api/estadisticas-ofensivas', requireAdmin, estadisticasController.upsertOfensivas);
app.post('/api/estadisticas-ofensivas/edit', requireAdmin, estadisticasController.upsertOfensivas);
app.put('/api/estadisticas-ofensivas/edit', requireAdmin, estadisticasController.upsertOfensivas);

app.get('/api/estadisticas-pitcheo', estadisticasController.obtenerPitcheo);
app.get('/api/estadisticas-pitcheo/:id', estadisticasController.obtenerPitcheoPorJugador);
app.post('/api/estadisticas-pitcheo', requireAdmin, estadisticasController.crearPitcheo);
app.put('/api/estadisticas-pitcheo', requireAdmin, estadisticasController.actualizarPitcheo);

app.get('/api/estadisticas-defensivas', estadisticasController.obtenerDefensivas);
app.get('/api/estadisticas-defensivas/:id', estadisticasController.obtenerDefensivasPorJugador);
app.post('/api/estadisticas-defensivas', requireAdmin, estadisticasController.crearDefensivas);
app.put('/api/estadisticas-defensivas', requireAdmin, estadisticasController.actualizarDefensivas);

// Aliases: guion bajo (legacy)
app.get('/api/estadisticas_ofensivas', estadisticasController.obtenerOfensivas);
app.put('/api/estadisticas_ofensivas', requireAdmin, estadisticasController.upsertOfensivas);
app.post('/api/estadisticas_ofensivas', requireAdmin, estadisticasController.upsertOfensivas);

// Aliases: con jugadorId en path
app.put('/api/estadisticas-ofensivas/:jugadorId', requireAdmin, (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});
app.post('/api/estadisticas-ofensivas/:jugadorId', requireAdmin, (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});
app.put('/api/estadisticas_ofensivas/:jugadorId', requireAdmin, (req, res, next) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return estadisticasController.upsertOfensivas(req, res, next);
});
app.post('/api/estadisticas_ofensivas/:jugadorId', requireAdmin, (req, res, next) => {
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
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
        console.log(`📦 Entorno: ${config.nodeEnv}`);
        console.log(`📊 Rutas: auth, torneos, equipos, jugadores, partidos, estadisticas, dashboard, sse`);
        console.log(`📡 SSE activo en /api/sse/updates`);
    });
}

module.exports = app;
