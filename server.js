// ===================================
// ARCHIVO: server.js
// MODIFICADO: 2025-10-12
// CAMBIOS: 
//   - Agregado endpoint GET /api/equipos/:id/logo (línea 1254-1311)
//   - Soporte completo para 'strikeouts' en estadisticas_ofensivas (línea ~2693)
//   - ✅ CORRECCIÓN: Manejo de parámetro 'stat' en /api/leaders para estadísticas específicas (línea 424)
//   - 🟢 CORRECCIÓN CRÍTICA APLICADA: Endpoint GET /api/jugadores/:id para incluir 'strikeouts' (Línea ~1870)
//   - ⭐ INTEGRACIÓN SSE: Agregados endpoints /api/live-updates y /api/sse-test para tiempo real.
//   - 🚨 INTEGRACIÓN CRÍTICA: Sistema de Recálculo Automático (Endpoint + Triggers)
//   - 🆕 INTEGRACIÓN SSE V2: Endpoint /api/sse/updates + notifyAllClients + eventos en actualizaciones de estadísticas
// ===================================
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Array para almacenar conexiones SSE (para /api/sse/updates)
let sseClients = [];

// ===============================================================
// =================== MIDDLEWARE DE LOGGING ===================
// ===============================================================
const logger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
};

// ===============================================================
// ============= MIDDLEWARE DE VALIDACIÓN GLOBAL ================
// ===============================================================
const validateRequest = (req, res, next) => {
    const dangerousHeaders = ['x-forwarded-for', 'x-real-ip'];
    for (let header of dangerousHeaders) {
        if (req.headers[header] && req.headers[header].includes('script')) {
            return res.status(400).json({ error: 'Invalid request headers' });
        }
    }
    next();
};

// ===============================================================
// ================ CONFIGURACIÓN CORS MEJORADA =================
// ===============================================================
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:8080',
        'https://choguileague2025.github.io',
        'https://chogui-league-system-production.up.railway.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
}));

// ===============================================================
// ====================== MIDDLEWARES ===========================
// ===============================================================
app.use(logger);
app.use(validateRequest);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Servir archivos estáticos con caché
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    etag: false
}));

// ===============================================================
// ============= MIDDLEWARE DE MANEJO DE ERRORES ================
// ===============================================================
const errorHandler = (err, req, res, next) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${err.message}`);
    console.error(err.stack);
    
    if (err.code === '23505') {
        return res.status(409).json({ error: 'Registro duplicado' });
    }
    
    if (err.code === '23503') {
        return res.status(400).json({ error: 'Referencia inválida en base de datos' });
    }
    
    res.status(500).json({ 
        error: 'Error interno del servidor',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
};

// ===============================================================
// ============= FUNCIÓN INICIALIZAR BASE DE DATOS ==============
// ===============================================================
async function inicializarBaseDeDatos() {
    try {
        console.log('🔄 Verificando conexión a base de datos...');
        await pool.query('SELECT NOW()');
        console.log('✅ Conexión a base de datos establecida');

        // Crear tablas principales
        const tables = [
            {
                name: 'equipos',
                query: `CREATE TABLE IF NOT EXISTS equipos (
                    id SERIAL PRIMARY KEY, 
                    nombre VARCHAR(100) UNIQUE NOT NULL, 
                    manager VARCHAR(100) NOT NULL, 
                    ciudad VARCHAR(100) NOT NULL, 
                    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    estado VARCHAR(20) DEFAULT 'activo'
                );`
            },
            {
                name: 'jugadores',
                query: `CREATE TABLE IF NOT EXISTS jugadores (
                    id SERIAL PRIMARY KEY, 
                    nombre VARCHAR(100) NOT NULL, 
                    equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL, 
                    posicion VARCHAR(10), 
                    numero INTEGER, 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );`
            },
            {
                name: 'partidos',
                query: `CREATE TABLE IF NOT EXISTS partidos (
                    id SERIAL PRIMARY KEY, 
                    equipo_local_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE, 
                    equipo_visitante_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE, 
                    carreras_local INTEGER, 
                    carreras_visitante INTEGER, 
                    innings_jugados INTEGER DEFAULT 9, 
                    fecha_partido DATE NOT NULL, 
                    hora TIME,
                    estado VARCHAR(20) DEFAULT 'programado',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );`
            },
            {
                name: 'usuarios',
                query: `CREATE TABLE IF NOT EXISTS usuarios (
                    id SERIAL PRIMARY KEY, 
                    username VARCHAR(50) UNIQUE NOT NULL, 
                    password VARCHAR(255) NOT NULL, 
                    role VARCHAR(20) NOT NULL DEFAULT 'admin', 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );`
            },
            {
                name: 'torneos',
                query: `CREATE TABLE IF NOT EXISTS torneos (
                    id SERIAL PRIMARY KEY, 
                    nombre VARCHAR(100) UNIQUE NOT NULL, 
                    activo BOOLEAN DEFAULT false, 
                    fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    total_juegos INTEGER DEFAULT 22,
                    cupos_playoffs INTEGER DEFAULT 6
                );`
            },
            {
                name: 'estadisticas_ofensivas',
                query: `CREATE TABLE IF NOT EXISTS estadisticas_ofensivas (
                    id SERIAL PRIMARY KEY, 
                    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE, 
                    temporada VARCHAR(50), 
                    at_bats INTEGER DEFAULT 0, 
                    hits INTEGER DEFAULT 0, 
                    home_runs INTEGER DEFAULT 0, 
                    rbi INTEGER DEFAULT 0, 
                    runs INTEGER DEFAULT 0, 
                    walks INTEGER DEFAULT 0, 
                    stolen_bases INTEGER DEFAULT 0,
                    doubles INTEGER DEFAULT 0,
                    triples INTEGER DEFAULT 0, 
                    caught_stealing INTEGER DEFAULT 0,
                    hit_by_pitch INTEGER DEFAULT 0,
                    sacrifice_flies INTEGER DEFAULT 0,
                    sacrifice_hits INTEGER DEFAULT 0, 
                    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
                    UNIQUE(jugador_id, temporada)
                );`
            },
            {
                name: 'estadisticas_pitcheo',
                query: `CREATE TABLE IF NOT EXISTS estadisticas_pitcheo (
                    id SERIAL PRIMARY KEY, 
                    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE, 
                    temporada VARCHAR(50), 
                    innings_pitched NUMERIC(4,1) DEFAULT 0.0, 
                    hits_allowed INTEGER DEFAULT 0, 
                    earned_runs INTEGER DEFAULT 0, 
                    strikeouts INTEGER DEFAULT 0, 
                    walks_allowed INTEGER DEFAULT 0, 
                    home_runs_allowed INTEGER DEFAULT 0, 
                    wins INTEGER DEFAULT 0, 
                    losses INTEGER DEFAULT 0, 
                    saves INTEGER DEFAULT 0, 
                    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
                    UNIQUE(jugador_id, temporada)
                );`
            },
            {
                name: 'estadisticas_defensivas',
                query: `CREATE TABLE IF NOT EXISTS estadisticas_defensivas (
                    id SERIAL PRIMARY KEY, 
                    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE, 
                    temporada VARCHAR(50), 
                    putouts INTEGER DEFAULT 0, 
                    assists INTEGER DEFAULT 0, 
                    errors INTEGER DEFAULT 0, 
                    double_plays INTEGER DEFAULT 0, 
                    passed_balls INTEGER DEFAULT 0, 
                    chances INTEGER DEFAULT 0, 
                    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
                    UNIQUE(jugador_id, temporada)
                );`
            }
        ];

        for (const table of tables) {
            await pool.query(table.query);
            console.log(`✅ Tabla ${table.name} verificada`);
        }
        
        try {
            await pool.query(`ALTER TABLE equipos ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo';`);
        } catch(e) { console.warn("No se pudo agregar columna estado a equipos"); }

        // MIGRACIONES
        try {
            await pool.query(`ALTER TABLE torneos ADD COLUMN IF NOT EXISTS total_juegos INTEGER DEFAULT 22;`);
            await pool.query(`ALTER TABLE torneos ADD COLUMN IF NOT EXISTS cupos_playoffs INTEGER DEFAULT 6;`);
            console.log('✅ Columnas de playoffs añadidas a la tabla torneos');
        } catch(e) {
            console.warn("⚠️ No se pudo agregar columnas de playoffs a torneos:", e.message);
        }

        // Migración de partidos (hora y estado)
        try {
            await pool.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='partidos' AND column_name='hora'
                    ) THEN
                        ALTER TABLE partidos ADD COLUMN hora TIME;
                    END IF;                                            
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='partidos' AND column_name='estado'
                    ) THEN
                        ALTER TABLE partidos ADD COLUMN estado VARCHAR(20) DEFAULT 'programado';
                    END IF;
                END $$;
            `);
            console.log('✅ Migración de partidos completada');
        } catch (error) {
            console.warn('⚠️ Error en migración de partidos:', error.message);
        }

        // Permitir NULL en carreras para partidos programados
        try {
            await pool.query(`
                DO $$ 
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='partidos' AND column_name='carreras_local' AND is_nullable='NO'
                    ) THEN
                        ALTER TABLE partidos ALTER COLUMN carreras_local DROP NOT NULL;
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='partidos' AND column_name='carreras_visitante' AND is_nullable='NO'
                    ) THEN
                        ALTER TABLE partidos ALTER COLUMN carreras_visitante DROP NOT NULL;
                    END IF;
                END $$;
            `);
            console.log('✅ Columnas de carreras permiten NULL (ok para partidos programados)');
        } catch (e) {
            console.warn('⚠️ No se pudo ajustar NOT NULL de carreras_*:', e.message);
        }

        // Permitir NULL en posición y número de jugadores
        try {
            await pool.query(`
                DO $$ 
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='jugadores' AND column_name='posicion' AND is_nullable='NO'
                    ) THEN
                        ALTER TABLE jugadores ALTER COLUMN posicion DROP NOT NULL;
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='jugadores' AND column_name='numero' AND is_nullable='NO'
                    ) THEN
                        ALTER TABLE jugadores ALTER COLUMN numero DROP NOT NULL;
                    END IF;
                END $$;
            `);
            console.log('✅ Columnas jugadores.posicion/numero permiten NULL');
        } catch (e) {
            console.warn('⚠️ No se pudo ajustar NOT NULL de jugadores.posicion/numero:', e.message);
        }

        // MIGRACIÓN CRÍTICA (Agregar columna strikeouts si no existe)
        try {
            await pool.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='estadisticas_ofensivas' AND column_name='strikeouts'
                    ) THEN
                        ALTER TABLE estadisticas_ofensivas ADD COLUMN strikeouts INTEGER DEFAULT 0;
                    END IF;
                END $$;
            `);
            console.log('✅ Columna strikeouts en estadisticas_ofensivas verificada/añadida');
        } catch (error) {
            console.warn('⚠️ Error en migración de strikeouts:', error.message);
        }


        // MIGRACIÓN CRÍTICA: Agregar las 6 columnas faltantes para estadísticas completas
        try {
            const columnasNuevas = [
                'doubles', 'triples', 'caught_stealing', 
                'hit_by_pitch', 'sacrifice_flies', 'sacrifice_hits'
            ];

            for (const columna of columnasNuevas) {
                await pool.query(`
                    DO $$ 
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name='estadisticas_ofensivas' AND column_name='${columna}'
                        ) THEN
                            ALTER TABLE estadisticas_ofensivas ADD COLUMN ${columna} INTEGER DEFAULT 0;
                        END IF;
                    END $$;
                `);
            }
            console.log('✅ Las 6 columnas nuevas verificadas/añadidas: doubles, triples, caught_stealing, hit_by_pitch, sacrifice_flies, sacrifice_hits');
        } catch (error) {
            console.warn('⚠️ Error en migración de columnas nuevas:', error.message);
        }

        // Crear índices para optimización
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_jugadores_equipo ON jugadores(equipo_id);',
            'CREATE INDEX IF NOT EXISTS idx_partidos_equipos ON partidos(equipo_local_id, equipo_visitante_id);',
            'CREATE INDEX IF NOT EXISTS idx_estadisticas_jugador ON estadisticas_ofensivas(jugador_id);',
            'CREATE INDEX IF NOT EXISTS idx_estadisticas_temporada ON estadisticas_ofensivas(temporada);'
        ];

        for (const indexQuery of indexes) {
            await pool.query(indexQuery);
        }
        console.log('✅ Índices de base de datos optimizados');

        // Crear usuario administrador
        const adminUsername = 'admin';
        const adminPassword = 'admin';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await pool.query(
            `INSERT INTO usuarios (username, password, role) 
             VALUES ($1, $2, 'admin') 
             ON CONFLICT (username) DO UPDATE SET password = $2;`, 
            [adminUsername, hashedPassword]
        );
        
        console.log('✅ Usuario administrador configurado');
        console.log('✅ Base de datos inicializada correctamente');

    } catch (error) {
        console.error('❌ Error fatal al inicializar la base de datos:', error);
        throw error;
    }
}

// ===============================================================
// ======================= RUTAS API ============================
// ===============================================================

// ... (resto de rutas ya presentes: standings, leaders, playoffs, equipos, jugadores, etc.)
// ⚠️ A partir de aquí el archivo es igual al que ya tenías,
// con las únicas diferencias marcadas en los puntos SSE y en las funciones de
// actualización de estadísticas (bateo/pitcheo/defensiva).

/**
 * 1. GET /api/standings - Tabla de Posiciones
 * Devuelve la tabla de posiciones completa, calculada a partir de partidos finalizados.
 */
app.get('/api/standings', async (req, res, next) => {
    try {
        const query = `
            WITH games AS (
                SELECT 
                    equipo_local_id AS team_id,
                    carreras_local AS cf,
                    carreras_visitante AS ce,
                    CASE WHEN carreras_local > carreras_visitante THEN 1 ELSE 0 END AS win,
                    CASE WHEN carreras_local < carreras_visitante THEN 1 ELSE 0 END AS loss
                FROM partidos
                WHERE estado = 'finalizado'
                UNION ALL
                SELECT 
                    equipo_visitante_id AS team_id,
                    carreras_visitante AS cf,
                    carreras_local AS ce,
                    CASE WHEN carreras_visitante > carreras_local THEN 1 ELSE 0 END AS win,
                    CASE WHEN carreras_visitante < carreras_local THEN 1 ELSE 0 END AS loss
                FROM partidos
                WHERE estado = 'finalizado'
            )
            SELECT
                e.id AS equipo_id,
                e.nombre AS equipo_nombre,
                COALESCE(SUM(1), 0) AS pj,
                COALESCE(SUM(g.win), 0) AS pg,
                COALESCE(SUM(g.loss), 0) AS pp,
                COALESCE(SUM(g.cf), 0) AS cf,
                COALESCE(SUM(g.ce), 0) AS ce,
                (COALESCE(SUM(g.cf), 0) - COALESCE(SUM(g.ce), 0)) AS dif,
                CASE 
                    WHEN COALESCE(SUM(1), 0) > 0 THEN ROUND(COALESCE(SUM(g.win), 0)::DECIMAL / COALESCE(SUM(1), 0), 3)
                    ELSE 0.000
                END AS porcentaje,
                e.estado
            FROM equipos e
            LEFT JOIN games g ON e.id = g.team_id
            GROUP BY e.id, e.nombre, e.estado
            ORDER BY porcentaje DESC, dif DESC;
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('GET /api/standings', err);
        res.status(500).json({ error: 'Error obteniendo standings' });
    }
});

/**
 * ✅ ENDPOINT CORREGIDO: /api/leaders
 * Devuelve líderes con TODAS las propiedades que el frontend necesita
 */
app.get('/api/leaders', async (req, res, next) => {
    try {
        // 1. Modificación de la línea 424 para capturar 'stat'
        const { tipo = 'bateo', limit = 10, stat } = req.query;
        let sql = '';
        const params = [Number(limit) || 10];
        const validTypes = ['bateo', 'pitcheo', 'defensiva', 'todos'];
        if (!validTypes.includes(tipo)) {
            return res.status(400).json({ 
                error: 'Tipo de líder no válido. Use: bateo, pitcheo, defensiva, o todos'
            });
        }
        console.log(`📊 Obteniendo líderes de tipo: ${tipo}, stat: ${stat || 'default'}, limit: ${params[0]}`);

        // ... (EL RESTO DE ESTE ENDPOINT SE MANTIENE IGUAL QUE EN TU ARCHIVO ORIGINAL)
    } catch (err) {
        console.error(`❌ ERROR en /api/leaders (tipo: ${req.query.tipo}, stat: ${req.query.stat}):`, err);
        res.status(500).json({ 
            error: 'Error obteniendo líderes',
            details: err.message 
        });
    }
});

// (💡 Para ahorrar espacio visual aquí, asume que todo lo que viene a continuación
// hasta llegar a la sección SSE es EXACTAMENTE lo mismo que en tu `server_upsert_fixed.js`,
// excepto en las funciones que te destaco y que sí modificamos para disparar notifyAllClients.)

// ... Rutas de playoffs, torneos, equipos, jugadores, partidos, estadísticas, etc.
// ... (sin cambios en la lógica, solo añado las notificaciones SSE donde corresponde)


// ====================== ESTADÍSTICAS PITCHEO =========================
app.get('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ep.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre,
                   CASE 
                       WHEN ep.innings_pitched > 0 THEN ROUND((ep.earned_runs * 9.0) / ep.innings_pitched, 2)
                       ELSE 0.00 
                   END as era,
                   CASE 
                       WHEN ep.innings_pitched > 0 THEN ROUND((ep.hits_allowed + ep.walks_allowed) / ep.innings_pitched, 2)
                       ELSE 0.00 
                   END as whip
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            ORDER BY era ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/estadisticas-pitcheo/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT ep.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ep.jugador_id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas de pitcheo no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const { 
            jugador_id, innings_pitched, hits_allowed, earned_runs, 
            strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const result = await pool.query(`
            INSERT INTO estadisticas_pitcheo (
                jugador_id, temporada, innings_pitched, hits_allowed, earned_runs,
                strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (jugador_id, temporada) 
            DO UPDATE SET 
                innings_pitched = estadisticas_pitcheo.innings_pitched + EXCLUDED.innings_pitched,
                hits_allowed = estadisticas_pitcheo.hits_allowed + EXCLUDED.hits_allowed,
                earned_runs = estadisticas_pitcheo.earned_runs + EXCLUDED.earned_runs,
                strikeouts = estadisticas_pitcheo.strikeouts + EXCLUDED.strikeouts,
                walks_allowed = estadisticas_pitcheo.walks_allowed + EXCLUDED.walks_allowed,
                home_runs_allowed = estadisticas_pitcheo.home_runs_allowed + EXCLUDED.home_runs_allowed,
                wins = estadisticas_pitcheo.wins + EXCLUDED.wins,
                losses = estadisticas_pitcheo.losses + EXCLUDED.losses,
                saves = estadisticas_pitcheo.saves + EXCLUDED.saves
            RETURNING *
        `, [jugador_id, temporada || 'Default', innings_pitched || 0, hits_allowed || 0, 
            earned_runs || 0, strikeouts || 0, walks_allowed || 0, home_runs_allowed || 0,
            wins || 0, losses || 0, saves || 0]);
        
        // 🔔 Notificación SSE para pitcheo
        let equipoId = null;
        try {
            const equipoResult = await pool.query(
                'SELECT equipo_id FROM jugadores WHERE id = $1',
                [parseInt(jugador_id)]
            );
            equipoId = equipoResult.rows[0]?.equipo_id || null;
        } catch (e) {
            console.warn('⚠️ SSE (pitcheo): no se pudo obtener equipo_id para el jugador', jugador_id, e.message);
        }

        const baseEvent = {
            category: 'pitcheo',
            jugadorId: parseInt(jugador_id),
            equipoId
        };

        notifyAllClients('stats-updated', baseEvent);
        notifyAllClients('player-updated', baseEvent);
        notifyAllClients('team-updated', baseEvent);
        notifyAllClients('leaders-changed', baseEvent);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const { 
            jugador_id, innings_pitched, hits_allowed, earned_runs, 
            strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const result = await pool.query(`
            UPDATE estadisticas_pitcheo SET 
                innings_pitched = $1, hits_allowed = $2, earned_runs = $3,
                strikeouts = $4, walks_allowed = $5, home_runs_allowed = $6,
                wins = $7, losses = $8, saves = $9
            WHERE jugador_id = $10 AND temporada = $11
            RETURNING *
        `, [innings_pitched || 0, hits_allowed || 0, earned_runs || 0, strikeouts || 0,
            walks_allowed || 0, home_runs_allowed || 0, wins || 0, losses || 0, 
            saves || 0, jugador_id, temporada || 'Default']);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas de pitcheo no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== ESTADÍSTICAS DEFENSIVAS =========================
app.get('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   CASE 
                       WHEN ed.chances > 0 THEN ROUND((ed.putouts + ed.assists)::DECIMAL / ed.chances, 3)
                       ELSE 0.000 
                   END as fielding_percentage
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            ORDER BY fielding_percentage DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/estadisticas-defensivas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ed.jugador_id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas defensivas no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const { 
            jugador_id, putouts, assists, errors, double_plays, 
            passed_balls, chances, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const result = await pool.query(`
            INSERT INTO estadisticas_defensivas (
                jugador_id, temporada, putouts, assists, errors, 
                double_plays, passed_balls, chances
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (jugador_id, temporada) 
            DO UPDATE SET 
                putouts = estadisticas_defensivas.putouts + EXCLUDED.putouts,
                assists = estadisticas_defensivas.assists + EXCLUDED.assists,
                errors = estadisticas_defensivas.errors + EXCLUDED.errors,
                double_plays = estadisticas_defensivas.double_plays + EXCLUDED.double_plays,
                passed_balls = estadisticas_defensivas.passed_balls + EXCLUDED.passed_balls,
                chances = estadisticas_defensivas.chances + EXCLUDED.chances
            RETURNING *
        `, [jugador_id, temporada || 'Default', putouts || 0, assists || 0, 
            errors || 0, double_plays || 0, passed_balls || 0, chances || 0]);
        
        // 🔔 Notificación SSE para defensiva
        let equipoId = null;
        try {
            const equipoResult = await pool.query(
                'SELECT equipo_id FROM jugadores WHERE id = $1',
                [parseInt(jugador_id)]
            );
            equipoId = equipoResult.rows[0]?.equipo_id || null;
        } catch (e) {
            console.warn('⚠️ SSE (defensiva): no se pudo obtener equipo_id para el jugador', jugador_id, e.message);
        }

        const baseEvent = {
            category: 'defensiva',
            jugadorId: parseInt(jugador_id),
            equipoId
        };

        notifyAllClients('stats-updated', baseEvent);
        notifyAllClients('player-updated', baseEvent);
        notifyAllClients('team-updated', baseEvent);
        notifyAllClients('leaders-changed', baseEvent);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const { 
            jugador_id, putouts, assists, errors, double_plays, 
            passed_balls, chances, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const result = await pool.query(`
            UPDATE estadisticas_defensivas SET 
                putouts = $1, assists = $2, errors = $3, double_plays = $4,
                passed_balls = $5, chances = $6
            WHERE jugador_id = $7 AND temporada = $8
            RETURNING *
        `, [putouts || 0, assists || 0, errors || 0, double_plays || 0,
            passed_balls || 0, chances || 0, jugador_id, temporada || 'Default']);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas defensivas no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============================================================
// BUG #1 CORREGIDO: FUNCIÓN upsertEstadisticasOfensivas
// ============================================================
async function upsertEstadisticasOfensivas(req, res, next) {
    try {
        const { 
            jugador_id, temporada = '2024', at_bats = 0, hits = 0, 
            home_runs = 0, rbi = 0, runs = 0, walks = 0, 
            stolen_bases = 0, strikeouts = 0, doubles = 0, 
            triples = 0, caught_stealing = 0, hit_by_pitch = 0,
            sacrifice_flies = 0, sacrifice_hits = 0 
        } = req.body;

        // Validaciones
        if (!jugador_id || isNaN(parseInt(jugador_id))) {
            return res.status(400).json({ error: 'ID de jugador requerido y válido' });
        }

        const query = `
            INSERT INTO estadisticas_ofensivas (
                jugador_id, temporada, at_bats, hits, home_runs, rbi, runs, 
                walks, stolen_bases, strikeouts, doubles, triples, 
                caught_stealing, hit_by_pitch, sacrifice_flies, sacrifice_hits,
                fecha_actualizacion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
            ON CONFLICT (jugador_id, temporada) 
            DO UPDATE SET 
                at_bats = estadisticas_ofensivas.at_bats + EXCLUDED.at_bats,
                hits = estadisticas_ofensivas.hits + EXCLUDED.hits,
                home_runs = estadisticas_ofensivas.home_runs + EXCLUDED.home_runs,
                rbi = estadisticas_ofensivas.rbi + EXCLUDED.rbi,
                runs = estadisticas_ofensivas.runs + EXCLUDED.runs,
                walks = estadisticas_ofensivas.walks + EXCLUDED.walks,
                stolen_bases = estadisticas_ofensivas.stolen_bases + EXCLUDED.stolen_bases,
                strikeouts = estadisticas_ofensivas.strikeouts + EXCLUDED.strikeouts,
                doubles = estadisticas_ofensivas.doubles + EXCLUDED.doubles,
                triples = estadisticas_ofensivas.triples + EXCLUDED.triples,
                caught_stealing = estadisticas_ofensivas.caught_stealing + EXCLUDED.caught_stealing,
                hit_by_pitch = estadisticas_ofensivas.hit_by_pitch + EXCLUDED.hit_by_pitch,
                sacrifice_flies = estadisticas_ofensivas.sacrifice_flies + EXCLUDED.sacrifice_flies,
                sacrifice_hits = estadisticas_ofensivas.sacrifice_hits + EXCLUDED.sacrifice_hits,
                fecha_actualizacion = CURRENT_TIMESTAMP
            RETURNING *`;

        const values = [
            parseInt(jugador_id), temporada, parseInt(at_bats), parseInt(hits),
            parseInt(home_runs), parseInt(rbi), parseInt(runs), parseInt(walks),
            parseInt(stolen_bases), parseInt(strikeouts), parseInt(doubles), 
            parseInt(triples), parseInt(caught_stealing), parseInt(hit_by_pitch),
            parseInt(sacrifice_flies), parseInt(sacrifice_hits)
        ];

        const result = await pool.query(query, values);

        // 🔔 Notificación SSE para bateo
        let equipoId = null;
        try {
            const equipoResult = await pool.query(
                'SELECT equipo_id FROM jugadores WHERE id = $1',
                [parseInt(jugador_id)]
            );
            equipoId = equipoResult.rows[0]?.equipo_id || null;
        } catch (e) {
            console.warn('⚠️ SSE (bateo): no se pudo obtener equipo_id para el jugador', jugador_id, e.message);
        }

        const baseEvent = {
            category: 'bateo',
            jugadorId: parseInt(jugador_id),
            equipoId
        };

        notifyAllClients('stats-updated', baseEvent);
        notifyAllClients('player-updated', baseEvent);
        notifyAllClients('team-updated', baseEvent);
        notifyAllClients('leaders-changed', baseEvent);

        res.json({ 
            success: true, 
            message: 'Estadísticas actualizadas correctamente',
            data: result.rows[0] 
        });

        if (typeof next === 'function') next();

    } catch (error) {
        console.error('Error en upsertEstadisticasOfensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}        

// =========================================================================
// 🚨 ENDPOINT CRÍTICO: PUT/POST /api/estadisticas-ofensivas - INTEGRACIÓN DE TRIGGER
// =========================================================================
app.put('/api/estadisticas-ofensivas', upsertEstadisticasOfensivas, triggerRecalculation);
app.post('/api/estadisticas-ofensivas', upsertEstadisticasOfensivas, triggerRecalculation);

// =========================================================================
// 🚨 NUEVO ENDPOINT PARA EDICIÓN (REEMPLAZAR VALORES)
// =========================================================================
async function editarEstadisticasOfensivas(req, res, next) {
    try {
        const { 
            jugador_id, temporada = '2024', at_bats = 0, hits = 0, 
            home_runs = 0, rbi = 0, runs = 0, walks = 0, 
            stolen_bases = 0, strikeouts = 0, doubles = 0, 
            triples = 0, caught_stealing = 0, hit_by_pitch = 0,
            sacrifice_flies = 0, sacrifice_hits = 0, plate_appearances = 0
        } = req.body;

        // Validaciones
        if (!jugador_id || isNaN(parseInt(jugador_id))) {
            return res.status(400).json({ error: 'ID de jugador requerido y válido' });
        }

        const query = `
            INSERT INTO estadisticas_ofensivas (
                jugador_id, temporada, at_bats, hits, home_runs, rbi, runs, 
                walks, stolen_bases, strikeouts, doubles, triples, 
                caught_stealing, hit_by_pitch, sacrifice_flies, sacrifice_hits,
                fecha_actualizacion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
            ON CONFLICT (jugador_id, temporada) 
            DO UPDATE SET 
                at_bats = EXCLUDED.at_bats,
                hits = EXCLUDED.hits,
                home_runs = EXCLUDED.home_runs,
                rbi = EXCLUDED.rbi,
                runs = EXCLUDED.runs,
                walks = EXCLUDED.walks,
                stolen_bases = EXCLUDED.stolen_bases,
                strikeouts = EXCLUDED.strikeouts,
                doubles = EXCLUDED.doubles,
                triples = EXCLUDED.triples,
                caught_stealing = EXCLUDED.caught_stealing,
                hit_by_pitch = EXCLUDED.hit_by_pitch,
                sacrifice_flies = EXCLUDED.sacrifice_flies,
                sacrifice_hits = EXCLUDED.sacrifice_hits,
                fecha_actualizacion = CURRENT_TIMESTAMP
            RETURNING *`;

        const values = [
            parseInt(jugador_id), temporada, parseInt(at_bats), parseInt(hits),
            parseInt(home_runs), parseInt(rbi), parseInt(runs), parseInt(walks),
            parseInt(stolen_bases), parseInt(strikeouts), parseInt(doubles), 
            parseInt(triples), parseInt(caught_stealing), parseInt(hit_by_pitch),
            parseInt(sacrifice_flies), parseInt(sacrifice_hits)
        ];

        const result = await pool.query(query, values);

        // 🔔 Notificación SSE para edición de bateo
        let equipoId = null;
        try {
            const equipoResult = await pool.query(
                'SELECT equipo_id FROM jugadores WHERE id = $1',
                [parseInt(jugador_id)]
            );
            equipoId = equipoResult.rows[0]?.equipo_id || null;
        } catch (e) {
            console.warn('⚠️ SSE (bateo-edit): no se pudo obtener equipo_id para el jugador', jugador_id, e.message);
        }

        const baseEvent = {
            category: 'bateo',
            jugadorId: parseInt(jugador_id),
            equipoId
        };

        notifyAllClients('stats-updated', baseEvent);
        notifyAllClients('player-updated', baseEvent);
        notifyAllClients('team-updated', baseEvent);
        notifyAllClients('leaders-changed', baseEvent);

        res.json({ 
            success: true, 
            message: 'Estadísticas editadas correctamente (valores reemplazados)',
            data: result.rows[0] 
        });

        if (typeof next === 'function') next();

    } catch (error) {
        console.error('Error en editarEstadisticasOfensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

app.put('/api/estadisticas-ofensivas/edit', editarEstadisticasOfensivas, triggerRecalculation);
app.post('/api/estadisticas-ofensivas/edit', editarEstadisticasOfensivas, triggerRecalculation);

// Alias para compatibilidad con versión anterior (guión bajo)
app.put('/api/estadisticas_ofensivas', upsertEstadisticasOfensivas, triggerRecalculation);
app.post('/api/estadisticas_ofensivas', upsertEstadisticasOfensivas, triggerRecalculation);

// ===============================================================
// =================== RUTAS DE ARCHIVOS HTML =================
// ===============================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/equipo.html', (req, res) => res.sendFile(path.join(__dirname, 'public/equipo.html')));
app.get('/public', (req, res) => res.sendFile(path.join(__dirname, 'public/public.html')));


// ==================== OPTIMIZACIONES PARA RAILWAY ====================

// Servir archivos estáticos optimizados
app.use(express.static('.', {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Servir logos estáticos con headers optimizados
app.use('/public/images/logos', express.static(path.join(__dirname, 'public/images/logos'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

const fs = require('fs');

function verificarLogos() {
  const logosPath = path.join(__dirname, 'public/images/logos');
  
  if (!fs.existsSync(logosPath)) {
    console.warn('⚠️ Carpeta de logos no encontrada, creando...');
    fs.mkdirSync(logosPath, { recursive: true });
  }
  
  const logosRequeridos = [
    'chogui-league.png',
    'default-logo.png',
    'guerreros-del-norte.png',
    'la-guaira.png',
    'furia-del-caribe.png',
    'tigres-unidos.png',
    'leones-dorados.png',
    'aguilas-negras.png',
    'venearstone.png',
    'desss.png',
    'caribes-rd.png'
  ];
  
  let logosFaltantes = [];
  
  logosRequeridos.forEach(logo => {
    const logoPath = path.join(logosPath, logo);
    if (!fs.existsSync(logoPath)) {
      logosFaltantes.push(logo);
    }
  });
  
  if (logosFaltantes.length > 0) {
    console.warn('⚠️ Logos faltantes:', logosFaltantes);
    console.log('💡 Sugerencia: Agregar archivos PNG a /public/images/logos/');
  } else {
    console.log('✅ Todos los logos están disponibles');
  }
}

verificarLogos();

console.log('🚀 Chogui League System optimizado para Railway');

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ===============================================================
// =================== INICIO DE INTEGRACIÓN SSE =================
// ===============================================================

/**
 * ENDPOINT SSE PRINCIPAL PARA NOTIFICACIONES BASADAS EN EVENTOS
 * Ruta: /api/sse/updates
 * Envia eventos:
 *  - connection
 *  - stats-updated
 *  - player-updated
 *  - team-updated
 *  - leaders-changed
 */
app.get('/api/sse/updates', (req, res) => {
    // Configurar headers SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no'
    });

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newClient = { id: clientId, res };

    sseClients.push(newClient);
    console.log(`📡 [SSE] Cliente conectado (${clientId}). Total: ${sseClients.length}`);

    // Evento inicial de conexión
    const connectionPayload = {
        type: 'connection',
        clientId,
        message: 'Conectado al canal SSE de actualizaciones',
        timestamp: new Date().toISOString()
    };

    res.write(`event: connection\n`);
    res.write(`data: ${JSON.stringify(connectionPayload)}\n\n`);

    // Manejo de desconexión
    req.on('close', () => {
        sseClients = sseClients.filter(c => c.id !== clientId);
        console.log(`🔌 [SSE] Cliente desconectado (${clientId}). Restantes: ${sseClients.length}`);
    });

    req.on('error', (err) => {
        sseClients = sseClients.filter(c => c.id !== clientId);
        console.error(`❌ [SSE] Error en cliente (${clientId}):`, err.message);
    });
});

/**
 * Función genérica para notificar a todos los clientes SSE
 * @param {string} eventType - Tipo de evento (stats-updated, player-updated, etc.)
 * @param {object} data - Payload del evento
 */
function notifyAllClients(eventType, data) {
    if (!sseClients.length) {
        return;
    }

    const payload = {
        ...data,
        type: data?.type || eventType,
        timestamp: data?.timestamp || new Date().toISOString()
    };

    const serialized = `event: ${eventType}\n` +
                       `data: ${JSON.stringify(payload)}\n\n`;

    let aliveClients = [];

    sseClients.forEach(client => {
        try {
            client.res.write(serialized);
            aliveClients.push(client);
        } catch (err) {
            console.error(`❌ [SSE] Error enviando a cliente (${client.id}):`, err.message);
            try { client.res.end(); } catch (e) {}
        }
    });

    sseClients = aliveClients;
    console.log(`📢 [SSE] Evento '${eventType}' enviado a ${sseClients.length} cliente(s) activos`);
}

// Variable global para contar las conexiones activas SSE (sistema /api/live-updates existente)
let activeConnections = 0;
console.log('✨ Preparando el sistema SSE...');

/**
 * ENDPOINT DE ACTUALIZACIONES EN TIEMPO REAL EXISTENTE
 * Ruta: /api/live-updates
 * (Se mantiene intacto, sigue enviando snapshots cada 30s)
 */
app.get('/api/live-updates', async (req, res) => {
    activeConnections++;
    console.log(`📡 Nueva conexión SSE establecida desde IP: ${req.ip}. Total de conexiones activas: ${activeConnections}`);
    
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'X-Accel-Buffering': 'no'
    });

    res.write(`data: {"type":"connected","message":"Conectado al sistema de actualizaciones","timestamp":"${new Date().toISOString()}"}\n\n`);

    async function getAllUpdatedData() {
        try {
            console.log('🔄 Recopilando datos actualizados para SSE...');

            // ... (TODO ESTE BLOQUE ES IGUAL AL DE TU ARCHIVO, NO SE MODIFICA LA LÓGICA)
            // lideresOfensivos, standings, lideresPitcheo, recentGames, upcomingGames

            // (por brevedad, omito reescribirlo íntegro aquí, pero en tu archivo debes dejarlo como estaba)
        } catch (error) {
            console.error('❌ Error recopilando datos para SSE:', error);
            return {
                timestamp: new Date().toISOString(),
                error: 'Error obteniendo datos actualizados',
                details: error.message
            };
        }
    }

    const updateInterval = setInterval(async () => {
        try {
            const updatedData = await getAllUpdatedData();
            const message = `data: ${JSON.stringify(updatedData)}\n\n`;
            res.write(message);
            console.log(`📊 Datos SSE enviados a ${activeConnections} conexiones`);
        } catch (error) {
            console.error('❌ Error enviando datos SSE:', error);
        }
    }, 30000);

    setTimeout(async () => {
        try {
            const initialData = await getAllUpdatedData();
            res.write(`data: ${JSON.stringify(initialData)}\n\n`);
            console.log('📡 Datos iniciales enviados a nueva conexión SSE');
        } catch (error) {
            console.error('❌ Error enviando datos iniciales SSE:', error);
        }
    }, 1000);

    req.on('close', () => {
        activeConnections--;
        clearInterval(updateInterval);
        console.log(`🔌 Conexión SSE cerrada. Conexiones activas: ${activeConnections}`);
    });

    req.on('error', (error) => {
        activeConnections--;
        clearInterval(updateInterval);
        console.error('❌ Error en conexión SSE:', error);
    });
});

/**
 * ENDPOINT DE TESTING PARA SSE EXISTENTE
 */
app.get('/api/sse-test', (req, res) => {
    console.log('🔍 Endpoint de test SSE solicitado');
    res.json({
        message: 'SSE endpoint disponible',
        url: '/api/live-updates',
        interval: '30 segundos',
        status: 'activo',
        timestamp: new Date().toISOString(),
        note: 'Este endpoint confirma que /api/live-updates está listo para emitir eventos.'
    });
});

console.log('✅ Endpoints SSE configurados correctamente');

// ===============================================================
// =================== MIDDLEWARE FINAL =========================
// ===============================================================
app.use(errorHandler);

// ===============================================================
// =================== INICIO DEL RECÁLCULO AUTOMÁTICO ============
// ===============================================================

// ... (toda la sección de recálculo automático y triggerRecalculation se mantiene igual)

// ===============================================================
// =================== INICIAR SERVIDOR ========================
// ===============================================================
async function startServer() {
    try {
        console.log('🚀 Iniciando Chogui League System...');
        console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
        
        await inicializarBaseDeDatos();
        
        app.listen(PORT, () => {
            console.log(`\n🔥 =====================================`);
            console.log(`🏆 CHOGUI LEAGUE SYSTEM ACTIVO`);
            console.log(`🔥 =====================================`);
            console.log(`🌐 Puerto: ${PORT}`);
            console.log(`📊 Base de datos: Conectada`);
            console.log(`✅ APIs: Optimizadas`);
            console.log(`🛡️  Seguridad: Activa`);
            console.log(`🔥 =====================================\n`);
        });
        
    } catch (error) {
        console.error("❌ No se pudo iniciar el servidor:", error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => {
    console.log('🔄 Cerrando servidor...');
    pool.end(() => {
        console.log('✅ Conexiones de base de datos cerradas');
        process.exit(0);
    });
});

// Alias de compatibilidad (estadísticas ofensivas con :id) y otras rutas auxiliares
// ... (todo igual que tu archivo original)

startServer();
