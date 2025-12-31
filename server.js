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
// ===================================
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const pool = require('./database');

const app = express();
// Array para almacenar conexiones SSE de notificaciones de estadísticas
let sseClients = [];
let sseClientIdCounter = 0;

const PORT = process.env.PORT || 3000;

// Opción A: usar SIEMPRE la temporada activa (no aceptar overrides por URL/body).
// - ACTIVE_SEASON: temporada "oficial" del deploy (Railway env)
// - DEFAULT_SEASON: fallback si ACTIVE_SEASON no está seteada
const ACTIVE_SEASON = process.env.ACTIVE_SEASON ? `${process.env.ACTIVE_SEASON}`.trim() : null;
const DEFAULT_SEASON = ACTIVE_SEASON || (process.env.DEFAULT_SEASON ? `${process.env.DEFAULT_SEASON}`.trim() : '2024');

function resolveTemporada(_value) {
  // Ignoramos cualquier temporada que venga por query/body para evitar inconsistencias (ej: "49", "Default", etc.)
  return DEFAULT_SEASON;
}

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

// ... (Resto de rutas API) ...

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
                ROW_NUMBER() OVER (ORDER BY 
                    CASE 
                        WHEN COALESCE(SUM(1), 0) > 0 THEN ROUND(COALESCE(SUM(g.win), 0)::DECIMAL / COALESCE(SUM(1), 0), 3)
                        ELSE 0.000
                    END DESC,
                    (COALESCE(SUM(g.cf), 0) - COALESCE(SUM(g.ce), 0)) DESC
                ) AS ranking,
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

        // ============================================================
        // ✅ MANEJO DE ESTADÍSTICAS ESPECÍFICAS
        // ============================================================
        if (stat && tipo === 'bateo') {
            switch (stat) {
                case 'strikeouts':
                    sql = `
                        SELECT 
                            j.id as jugador_id,
                            j.nombre as jugador_nombre,
                            j.nombre,
                            e.id as equipo_id,
                            e.nombre as equipo_nombre,
                            s.strikeouts,
                            s.at_bats,
                            s.hits,
                            CASE 
                                WHEN s.at_bats > 0 
                                THEN ROUND(s.hits::DECIMAL / s.at_bats, 3) 
                                ELSE 0.000 
                            END as avg
                        FROM estadisticas_ofensivas s
                        JOIN jugadores j ON s.jugador_id = j.id
                        LEFT JOIN equipos e ON j.equipo_id = e.id
                        WHERE s.strikeouts > 0
                        ORDER BY s.strikeouts DESC
                        LIMIT $1;
                    `;
                    break;
                case 'home_runs':
                    sql = `
                        SELECT 
                            j.id as jugador_id,
                            j.nombre as jugador_nombre,
                            e.nombre as equipo_nombre,
                            s.home_runs
                        FROM estadisticas_ofensivas s
                        JOIN jugadores j ON s.jugador_id = j.id
                        LEFT JOIN equipos e ON j.equipo_id = e.id
                        WHERE s.home_runs > 0
                        ORDER BY s.home_runs DESC
                        LIMIT $1;
                    `;
                    break;
                case 'rbi':
                    sql = `
                        SELECT 
                            j.id as jugador_id,
                            j.nombre as jugador_nombre,
                            e.nombre as equipo_nombre,
                            s.rbi
                        FROM estadisticas_ofensivas s
                        JOIN jugadores j ON s.jugador_id = j.id
                        LEFT JOIN equipos e ON j.equipo_id = e.id
                        WHERE s.rbi > 0
                        ORDER BY s.rbi DESC
                        LIMIT $1;
                    `;
                    break;
                case 'hits':
                    sql = `
                        SELECT 
                            j.id as jugador_id,
                            j.nombre as jugador_nombre,
                            e.nombre as equipo_nombre,
                            s.hits
                        FROM estadisticas_ofensivas s
                        JOIN jugadores j ON s.jugador_id = j.id
                        LEFT JOIN equipos e ON j.equipo_id = e.id
                        WHERE s.hits > 0
                        ORDER BY s.hits DESC
                        LIMIT $1;
                    `;
                    break;
                case 'stolen_bases':
                    sql = `
                        SELECT 
                            j.id as jugador_id,
                            j.nombre as jugador_nombre,
                            e.nombre as equipo_nombre,
                            s.stolen_bases
                        FROM estadisticas_ofensivas s
                        JOIN jugadores j ON s.jugador_id = j.id
                        LEFT JOIN equipos e ON j.equipo_id = e.id
                        WHERE s.stolen_bases > 0
                        ORDER BY s.stolen_bases DESC
                        LIMIT $1;
                    `;
                    break;
                case 'avg':
                    sql = `
                        SELECT 
                            j.id as jugador_id,
                            j.nombre as jugador_nombre,
                            e.nombre as equipo_nombre,
                            s.hits,
                            s.at_bats,
                            CASE 
                                WHEN s.at_bats > 0 
                                THEN ROUND(s.hits::DECIMAL / s.at_bats, 3) 
                                ELSE 0.000 
                            END as avg
                        FROM estadisticas_ofensivas s
                        JOIN jugadores j ON s.jugador_id = j.id
                        LEFT JOIN equipos e ON j.equipo_id = e.id
                        WHERE s.at_bats >= 10
                        ORDER BY avg DESC
                        LIMIT $1;
                    `;
                    break;
            }
        } 
        // 3. Modificación a 'else if' para la lógica de bateo por defecto
        // Si no hay parámetro 'stat', continuar con la lógica original (default a AVG)
        else if (tipo === 'bateo') {
            sql = `
                SELECT 
                    j.id as jugador_id,
                    j.nombre as nombre_jugador,
                    j.nombre,
                    j.posicion,
                    j.posicion as posicion_principal,
                    j.numero,
                    e.id as equipo_id,
                    e.nombre as equipo_nombre,
                    s.at_bats,
                    s.hits,
                    s.home_runs as hr,
                    s.home_runs,
                    s.rbi,
                    s.runs,
                    s.walks,
                    s.stolen_bases,
                    s.strikeouts,
                    CASE 
                        WHEN s.at_bats > 0 
                        THEN ROUND(s.hits::DECIMAL / s.at_bats, 3) 
                        ELSE 0.000 
                    END as promedio_bateo,
                    CASE 
                        WHEN s.at_bats > 0 
                        THEN ROUND(s.hits::DECIMAL / s.at_bats, 3) 
                        ELSE 0.000 
                    END as avg,
                    CASE 
                        WHEN (s.at_bats + s.walks) > 0 
                        THEN ROUND((s.hits + s.walks)::DECIMAL / (s.at_bats + s.walks), 3) 
                        ELSE 0.000 
                    END as obp,
                    CASE 
                        WHEN s.at_bats > 0 
                        THEN ROUND(
                            (s.hits + (s.home_runs * 3))::DECIMAL / s.at_bats + 
                            (s.hits + s.walks)::DECIMAL / NULLIF(s.at_bats + s.walks, 0),
                        3) 
                        ELSE 0.000 
                    END as ops
                FROM estadisticas_ofensivas s
                JOIN jugadores j ON s.jugador_id = j.id
                LEFT JOIN equipos e ON j.equipo_id = e.id
                WHERE s.at_bats > 0
                ORDER BY promedio_bateo DESC NULLS LAST
                LIMIT $1;
            `;
        } 
        // ============================================================
        // ✅ QUERY 2: LÍDERES DE PITCHEO
        // ============================================================
        else if (tipo === 'pitcheo') {
            sql = `
                SELECT 
                    j.id as jugador_id,
                    j.nombre as nombre_jugador,
                    j.nombre,
                    j.posicion,
                    j.posicion as posicion_principal,
                    j.numero,
                    e.id as equipo_id,
                    e.nombre as equipo_nombre,
                    s.innings_pitched,
                    s.hits_allowed,
                    s.earned_runs,
                    s.strikeouts,
                    s.strikeouts as so,
                    s.walks_allowed,
                    s.home_runs_allowed,
                    s.wins,
                    s.wins as w,
                    s.losses,
                    s.saves,
                    CASE 
                        WHEN s.innings_pitched > 0 
                        THEN ROUND((s.earned_runs * 9.0) / s.innings_pitched, 2) 
                        ELSE 99.99 
                    END as era,
                    CASE 
                        WHEN s.innings_pitched > 0 
                        THEN ROUND((s.hits_allowed + s.walks_allowed) / s.innings_pitched, 2) 
                        ELSE 99.99 
                    END as whip
                FROM estadisticas_pitcheo s
                JOIN jugadores j ON s.jugador_id = j.id
                LEFT JOIN equipos e ON j.equipo_id = e.id
                WHERE s.innings_pitched > 0
                ORDER BY era ASC NULLS LAST
                LIMIT $1;
            `;
        } 
        // ============================================================
        // 🛠️ INICIO DE LA CORRECCIÓN APLICADA
        // ============================================================
        else if (tipo === 'defensiva') {
            sql = `
                SELECT 
                    j.id as jugador_id,
                    j.nombre as nombre_jugador,
                    j.nombre,
                    j.posicion,
                    j.posicion as posicion_principal,
                    j.posicion as pos,
                    j.numero,
                    e.id as equipo_id,
                    e.nombre as equipo_nombre,
                    s.putouts,
                    s.putouts as po,
                    s.assists,
                    s.assists as a,
                    s.errors,
                    s.errors as e,
                    s.double_plays,
                    s.passed_balls,
                    (s.putouts + s.assists + s.errors)::INTEGER as chances,
                    CASE 
                        WHEN (s.putouts + s.assists + s.errors) > 0 
                        THEN ROUND((s.putouts + s.assists)::DECIMAL / (s.putouts + s.assists + s.errors), 3)::NUMERIC
                        ELSE 0.000 
                    END as fielding_percentage,
                    CASE 
                        WHEN (s.putouts + s.assists + s.errors) > 0 
                        THEN ROUND((s.putouts + s.assists)::DECIMAL / (s.putouts + s.assists + s.errors), 3)::NUMERIC
                        ELSE 0.000 
                    END as fld_pct,
                    CASE 
                        WHEN (s.putouts + s.assists + s.errors) > 0 
                        THEN ROUND((s.putouts + s.assists)::DECIMAL / (s.putouts + s.assists + s.errors), 3)::NUMERIC
                        ELSE 0.000 
                    END as fpct
                FROM estadisticas_defensivas s
                JOIN jugadores j ON s.jugador_id = j.id
                LEFT JOIN equipos e ON j.equipo_id = e.id
                WHERE (s.putouts + s.assists + s.errors) > 0
                ORDER BY fielding_percentage DESC NULLS LAST
                LIMIT $1;
            `;
        }
        // ============================================================
        // 🛠️ FIN DE LA CORRECCIÓN
        // ============================================================ 
        // ============================================================
        // ✅ QUERY 4: TODOS (DEFAULT A BATEO POR OPS)
        // ============================================================
        else {
            sql = `
                SELECT 
                    j.id as jugador_id,
                    j.nombre as nombre_jugador,
                    j.nombre,
                    j.posicion,
                    j.posicion as posicion_principal,
                    j.numero,
                    e.id as equipo_id,
                    e.nombre as equipo_nombre,
                    s.home_runs as hr,
                    s.home_runs,
                    s.rbi,
                    s.at_bats,
                    s.hits,
                    CASE 
                        WHEN s.at_bats > 0 
                        THEN ROUND(s.hits::DECIMAL / s.at_bats, 3) 
                        ELSE 0.000 
                    END as promedio_bateo,
                    CASE 
                        WHEN s.at_bats > 0 
                        THEN ROUND(s.hits::DECIMAL / s.at_bats, 3) 
                        ELSE 0.000 
                    END as avg,
                    CASE 
                        WHEN (s.at_bats + s.walks) > 0 
                        THEN ROUND(
                            (s.hits + (s.home_runs * 3))::DECIMAL / s.at_bats + 
                            (s.hits + s.walks)::DECIMAL / NULLIF(s.at_bats + s.walks, 0),
                        3) 
                        ELSE 0.000 
                    END as ops
                FROM estadisticas_ofensivas s
                JOIN jugadores j ON s.jugador_id = j.id
                LEFT JOIN equipos e ON j.equipo_id = e.id
                WHERE s.at_bats > 0
                ORDER BY ops DESC NULLS LAST
                LIMIT $1;
            `;
        }
        
        // Si después de todas las comprobaciones, 'sql' sigue vacío, es un error 400.
        // Esto solo ocurre si 'tipo' es válido, pero 'stat' era inválido o no se proporcionó
        // Y 'tipo' no era 'bateo', 'pitcheo' o 'defensiva'. Sin embargo, ya filtramos 
        // los 'tipos' inválidos. Un 'stat' inválido dentro de 'tipo=bateo' dejaría
        // 'sql' vacío, por lo que debemos manejar el caso de fallback del 'switch'.
        if (!sql) {
            // Este caso captura: tipo=bateo y stat=estadistica_invalida
             return res.status(400).json({ 
                error: `Estadística ofensiva '${stat}' no soportada. Opciones: strikeouts, home_runs, rbi, hits, stolen_bases, avg` 
            });
        }
        
        // ============================================================
        // ✅ EJECUTAR QUERY Y DEVOLVER RESULTADOS
        // ============================================================
        const { rows } = await pool.query(sql, params);
        
        console.log(`✅ /api/leaders?tipo=${tipo} devolvió ${rows.length} registros`);
        
        // Log del primer registro para verificar estructura
        if (rows.length > 0) {
            console.log('📋 Estructura del primer registro:', {
                jugador_id: rows[0].jugador_id,
                nombre_jugador: rows[0].nombre_jugador,
                posicion: rows[0].posicion,
                equipo_nombre: rows[0].equipo_nombre
            });
        }
        
        res.json(rows);
            
    } catch (err) {
        console.error(`❌ ERROR en /api/leaders (tipo: ${req.query.tipo}, stat: ${req.query.stat}):`, err);
        res.status(500).json({ 
            error: 'Error obteniendo líderes',
            details: err.message 
        });
    }
});


/**
 * 4. GET /api/playoffs - Clasificación Playoffs
 * Devuelve los 8 primeros equipos de la tabla de posiciones.
 */
app.get('/api/playoffs', async (req, res, next) => {
    try {
        const query = `
            WITH games AS (
                SELECT 
                    equipo_local_id AS team_id,
                    CASE WHEN carreras_local > carreras_visitante THEN 1 ELSE 0 END AS win,
                    CASE WHEN carreras_local < carreras_visitante THEN 1 ELSE 0 END AS loss
                FROM partidos
                WHERE estado = 'finalizado'
                UNION ALL
                SELECT 
                    equipo_visitante_id AS team_id,
                    CASE WHEN carreras_visitante > carreras_local THEN 1 ELSE 0 END AS win,
                    CASE WHEN carreras_visitante < carreras_local THEN 1 ELSE 0 END AS loss
                FROM partidos
                WHERE estado = 'finalizado'
            ),
            standings AS (
                SELECT
                    e.id AS equipo_id,
                    e.nombre AS equipo_nombre,
                    COALESCE(SUM(g.win), 0) AS pg,
                    COALESCE(SUM(g.loss), 0) AS pp,
                    (COALESCE(SUM(1), 0)) AS pj,
                    CASE 
                        WHEN COALESCE(SUM(1), 0) > 0 THEN ROUND(COALESCE(SUM(g.win), 0)::DECIMAL / COALESCE(SUM(1), 0), 3)
                        ELSE 0.000
                    END AS porcentaje
                FROM equipos e
                LEFT JOIN games g ON e.id = g.team_id
                GROUP BY e.id, e.nombre
            )
            SELECT
                ROW_NUMBER() OVER (ORDER BY s.porcentaje DESC, (s.pg - s.pp) DESC) as seed,
                s.equipo_nombre,
                s.pg || '-' || s.pp as record
            FROM standings s
            ORDER BY seed ASC
            LIMIT 8; -- Límite de 6 equipos para playoffs
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('GET /api/playoffs', err);
        res.status(500).json({ error: 'Error obteniendo playoffs' });
    }
});

// ============= ENDPOINT PLAYOFFS CON CÁLCULOS (NUEVO) =============
app.get('/api/playoffs-clasificacion', async (req, res) => {
  try {
    // 1. Obtener configuración de la temporada activa
    const configQuery = await pool.query(`
      SELECT total_juegos, cupos_playoffs
      FROM torneos
      WHERE activo = true
      LIMIT 1
    `);
    
    if (configQuery.rows.length === 0) {
      return res.status(404).json({
         error: 'No hay torneo activo configurado'
       });
    }
    
    const { total_juegos, cupos_playoffs } = configQuery.rows[0];

    // 2. Obtener standings actuales
    const standingsQuery = await pool.query(`
      SELECT 
        e.id as equipo_id,
        e.nombre as equipo_nombre,
        COALESCE(COUNT(CASE WHEN p.estado = 'finalizado' THEN 1 END), 0) as pj,
        COALESCE(COUNT(CASE 
          WHEN p.estado = 'finalizado' AND (
            (p.equipo_local_id = e.id AND p.carreras_local > p.carreras_visitante) OR
            (p.equipo_visitante_id = e.id AND p.carreras_visitante > p.carreras_local)
          ) THEN 1 END), 0) as pg,
        COALESCE(COUNT(CASE 
          WHEN p.estado = 'finalizado' AND (
            (p.equipo_local_id = e.id AND p.carreras_local < p.carreras_visitante) OR
            (p.equipo_visitante_id = e.id AND p.carreras_visitante < p.carreras_local)
          ) THEN 1 END), 0) as pp,
        COALESCE(SUM(CASE 
          WHEN p.equipo_local_id = e.id THEN p.carreras_local
          WHEN p.equipo_visitante_id = e.id THEN p.carreras_visitante
          ELSE 0 END), 0) as cf,
        COALESCE(SUM(CASE 
          WHEN p.equipo_local_id = e.id THEN p.carreras_visitante
          WHEN p.equipo_visitante_id = e.id THEN p.carreras_local
          ELSE 0 END), 0) as ce
      FROM equipos e
      LEFT JOIN partidos p ON (
        p.equipo_local_id = e.id OR p.equipo_visitante_id = e.id
      )
      WHERE e.estado = 'activo'
      GROUP BY e.id, e.nombre
    `);

    // 3. Calcular métricas y ordenar
    const standings = standingsQuery.rows.map(team => {
      const pj = Number(team.pj);
      const pg = Number(team.pg);
      const pp = Number(team.pp);
      const cf = Number(team.cf);
      const ce = Number(team.ce);
      const dif = cf - ce;
      const porcentaje = pj > 0 ? pg / pj : 0;
      const restantes = Math.max(0, total_juegos - pj);
      const max_victorias = pg + restantes;
      
      return {
        equipo_id: team.equipo_id,
        equipo_nombre: team.equipo_nombre,
        pj,
        pg,
        pp,
        porcentaje,
        cf,
        ce,
        dif,
        restantes,
        max_victorias
      };
    });

    // Ordenar por: PG desc, % desc, DIF desc
    standings.sort((a, b) => {
      if (b.pg !== a.pg) return b.pg - a.pg;
      if (b.porcentaje !== a.porcentaje) return b.porcentaje - a.porcentaje;
      return b.dif - a.dif;
    });

    // 4. Calcular estados de clasificación
    const equipoEnElCorte = standings[cupos_playoffs - 1]; // Último que entra
    const primerFuera = standings[cupos_playoffs]; // Primero que queda fuera

    const victoriasMinimasParaClasificar = equipoEnElCorte ? equipoEnElCorte.pg : 0;
    const victoriasMaximasPrimerFuera = primerFuera ? primerFuera.max_victorias : -1; // -1 si no hay equipo fuera

    const resultado = standings.map((team, idx) => {
      let estado = 'contención';
      
      // Clasificado: Mis victorias actuales son mayores o iguales a las victorias máximas que puede alcanzar el primer equipo que queda fuera.
      if (primerFuera && team.pg >= victoriasMaximasPrimerFuera) {
        estado = 'clasificado';
      }
      // Si no hay "primerFuera" (todos clasifican), todos los que tienen juegos están en contención o clasificados por defecto
      else if (!primerFuera && team.pj > 0) {
        estado = 'clasificado';
      }
      // Eliminado: Mis victorias máximas posibles son menores que las victorias actuales del último equipo que clasifica.
      else if (equipoEnElCorte && team.max_victorias < victoriasMinimasParaClasificar) {
        estado = 'eliminado';
      }
      
      return {
        posicion: idx + 1,
        ...team,
        estado
      };
    });
        
    // 5. Enviar respuesta con metadata
    res.json({
      configuracion: {
        total_juegos,
        cupos_playoffs
      },
      equipos: resultado
    });
    
    console.log(`✅ Playoffs: ${resultado.length} equipos procesados`);

  } catch (err) {
    console.error('❌ GET /api/playoffs-clasificacion:', err);
    res.status(500).json({
       error: 'Error calculando clasificación de playoffs'
     });
  }
});


// ====================== AUTENTICACIÓN =========================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Usuario y contraseña son requeridos' 
            });
        }

        if (username.length > 50 || password.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        const userResult = await pool.query(
            'SELECT * FROM usuarios WHERE username = $1', 
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario o contraseña incorrectos' 
            });
        }
        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (isMatch) {
            res.json({ 
                success: true, 
                message: 'Login exitoso', 
                user: { 
                    username: user.username, 
                    role: user.role 
                } 
            });
        } else {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario o contraseña incorrectos' 
            });
        }
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// ====================== TORNEOS =============================
app.get('/api/torneos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM torneos ORDER BY fecha_inicio DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo torneos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/torneos/activo', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM torneos WHERE activo = true LIMIT 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No hay torneo activo' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo torneo activo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/torneos', async (req, res) => {
    try {
        const { nombre, total_juegos, cupos_playoffs } = req.body;
        
        if (!nombre || nombre.trim().length < 3) {
            return res.status(400).json({ 
                error: 'El nombre del torneo debe tener al menos 3 caracteres' 
            });
        }

        const totalJuegosFinal = total_juegos ? parseInt(total_juegos, 10) : 22;
        const cuposPlayoffsFinal = cupos_playoffs ? parseInt(cupos_playoffs, 10) : 6;

        if (isNaN(totalJuegosFinal) || totalJuegosFinal <= 0) {
            return res.status(400).json({ error: 'El total de juegos debe ser un número positivo.' });
        }
        if (isNaN(cuposPlayoffsFinal) || cuposPlayoffsFinal <= 0) {
            return res.status(400).json({ error: 'Los cupos de playoffs deben ser un número positivo.' });
        }

        const result = await pool.query(
            'INSERT INTO torneos (nombre, total_juegos, cupos_playoffs) VALUES ($1, $2, $3) RETURNING *',
            [nombre.trim(), totalJuegosFinal, cuposPlayoffsFinal]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un torneo con ese nombre' });
        }
        console.error('Error creando torneo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Resto de rutas de torneos
app.put('/api/torneos/:id/activar', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE torneos SET activo = false');
        const result = await pool.query(
            'UPDATE torneos SET activo = true WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error activando torneo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/torneos/desactivar-todos', async (req, res) => {
    try {
        await pool.query('UPDATE torneos SET activo = false');
        res.json({ message: 'Todos los torneos desactivados' });
    } catch (error) {
        console.error('Error desactivando torneos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/torneos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, total_juegos, cupos_playoffs } = req.body;

        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (nombre) {
            if (nombre.trim().length < 3) {
                return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres.' });
            }
            fields.push(`nombre = $${paramIndex++}`);
            values.push(nombre.trim());
        }
        if (total_juegos) {
            const totalJuegosNum = parseInt(total_juegos, 10);
            if (isNaN(totalJuegosNum) || totalJuegosNum <= 0) {
                return res.status(400).json({ error: 'Total de juegos debe ser un número positivo.' });
            }
            fields.push(`total_juegos = $${paramIndex++}`);
            values.push(totalJuegosNum);
        }
        if (cupos_playoffs) {
            const cuposPlayoffsNum = parseInt(cupos_playoffs, 10);
             if (isNaN(cuposPlayoffsNum) || cuposPlayoffsNum <= 0) {
                return res.status(400).json({ error: 'Cupos de playoffs debe ser un número positivo.' });
            }
            fields.push(`cupos_playoffs = $${paramIndex++}`);
            values.push(cuposPlayoffsNum);
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No se proporcionaron campos para actualizar.' });
        }

        const query = `UPDATE torneos SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        values.push(id);

        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un torneo con ese nombre' });
        }
        console.error('Error actualizando torneo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/torneos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const statsCheck = await pool.query(`
            SELECT COUNT(*) as count FROM (
                SELECT 1 FROM estadisticas_ofensivas WHERE temporada IN (SELECT nombre FROM torneos WHERE id = $1)
                UNION ALL
                SELECT 1 FROM estadisticas_pitcheo WHERE temporada IN (SELECT nombre FROM torneos WHERE id = $1)
                UNION ALL
                SELECT 1 FROM estadisticas_defensivas WHERE temporada IN (SELECT nombre FROM torneos WHERE id = $1)
            ) as stats
        `, [id]);
        
        if (parseInt(statsCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar el torneo porque tiene estadísticas asociadas' 
            });
        }
        
        const result = await pool.query('DELETE FROM torneos WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }
        
        res.json({ message: 'Torneo eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando torneo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== EQUIPOS =============================
app.get('/api/equipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM equipos ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo equipos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM equipos WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/equipos/:id/detalles', async (req, res) => {
    try {
        const { id } = req.params;
        
        const teamResult = await pool.query('SELECT * FROM equipos WHERE id = $1', [id]);
        if (teamResult.rows.length === 0) {
            return res.status(404).json({ message: 'Equipo no encontrado' });
        }
        
        const rosterResult = await pool.query(
            'SELECT * FROM jugadores WHERE equipo_id = $1 ORDER BY numero ASC, nombre ASC', 
            [id]
        );
        
        res.json({ 
            equipo: teamResult.rows[0], 
            roster: rosterResult.rows 
        });
    } catch (error) {
        console.error('Error obteniendo detalles del equipo:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

app.get('/api/equipos/:id/estadisticas/ofensivas', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                j.nombre as jugador_nombre, 
                j.posicion, 
                j.numero,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                COALESCE(eo.runs, 0) as runs,
                COALESCE(eo.walks, 0) as walks,
                COALESCE(eo.stolen_bases, 0) as stolen_bases,
                COALESCE(eo.strikeouts, 0) as strikeouts,
                CASE 
                    WHEN COALESCE(eo.at_bats, 0) > 0 THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / eo.at_bats, 3)
                    ELSE 0.000 
                END as avg
            FROM jugadores j
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE j.equipo_id = $1
            ORDER BY j.numero ASC, j.nombre ASC
        `, [id]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas ofensivas del equipo:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// ========================================================================
// =================== INICIO DEL NUEVO CÓDIGO AÑADIDO ====================
// ========================================================================

app.get('/api/equipos/:id/logo', async (req, res) => {
    const equipoId = parseInt(req.params.id, 10);
    
    if (isNaN(equipoId)) {
        return res.status(400).json({ error: 'El ID del equipo debe ser un número válido' });
    }

    const logosPath = path.join(__dirname, 'public', 'images', 'logos');

    // Paso 1: Buscar logo por convención de ID (ej: equipo-78.png)
    const logoByIdPath = path.join(logosPath, `equipo-${equipoId}.png`);
    
    // NOTA: 'fs' no está definido globalmente, asumiendo que el archivo de usuario lo tiene en scope o que se ignora
    // En producción, se debería haber requerido 'fs'
    if (typeof fs !== 'undefined' && fs.existsSync(logoByIdPath)) {
        return res.sendFile(logoByIdPath);
    }

    // Paso 2: Si no existe, buscar en la base de datos y normalizar el nombre
    try {
        const result = await pool.query('SELECT nombre FROM equipos WHERE id = $1', [equipoId]);

        if (result.rows.length === 0) {
            // Si el equipo no existe en la DB, tampoco tendrá logo por nombre.
            return res.status(404).json({
                error: 'Logo not found',
                equipo_id: equipoId,
                fallback: 'use_initials'
            });
        }

        const nombreEquipo = result.rows[0].nombre;
        const nombreNormalizado = nombreEquipo
            .toLowerCase()
            .replace(/\s+/g, '-') // Reemplaza espacios con guiones
            .replace(/[^a-z0-9-]/g, ''); // Elimina caracteres especiales

        const logoByNamePath = path.join(logosPath, `${nombreNormalizado}.png`);

        if (typeof fs !== 'undefined' && fs.existsSync(logoByNamePath)) {
            return res.sendFile(logoByNamePath);
        }

        // Paso 3: Si ninguno de los logos existe, devolver 404 con JSON
        return res.status(404).json({
            error: 'Logo not found',
            equipo_id: equipoId,
            fallback: 'use_initials'
        });

    } catch (error) {
        console.error(`Error buscando logo para equipo ID ${equipoId}:`, error);
        return res.status(500).json({
            error: 'Error interno del servidor',
            details: error.message
        });
    }
});

// ========================================================================
// ===================== FIN DEL NUEVO CÓDIGO AÑADIDO =====================
// ========================================================================

app.post('/api/equipos', async (req, res) => {
    try {
        const { nombre, manager, ciudad } = req.body;
        
        if (!nombre || !manager || !ciudad) {
            return res.status(400).json({ 
                error: 'Nombre, manager y ciudad son requeridos' 
            });
        }

        if (nombre.length < 2 || manager.length < 2 || ciudad.length < 2) {
            return res.status(400).json({ 
                error: 'Todos los campos deben tener al menos 2 caracteres' 
            });
        }

        const result = await pool.query(
            'INSERT INTO equipos (nombre, manager, ciudad) VALUES ($1, $2, $3) RETURNING *',
            [nombre.trim(), manager.trim(), ciudad.trim()]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un equipo con ese nombre' });
        }
        console.error('Error creando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
// ====================== EQUIPOS COMPLETADOS =========================
// (Agregar después de las rutas de equipos existentes)

app.put('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, manager, ciudad } = req.body;
        
        // Validaciones robustas
        if (!nombre || !manager || !ciudad) {
            return res.status(400).json({ 
                error: 'Nombre, manager y ciudad son requeridos' 
            });
        }

        if (nombre.length < 2 || nombre.length > 100) {
            return res.status(400).json({ 
                error: 'El nombre debe tener entre 2 y 100 caracteres' 
            });
        }

        if (nombre.length > 100 || manager.length > 100 || ciudad.length > 100) {
            return res.status(400).json({ 
                error: 'Los campos no pueden exceder 100 caracteres' 
            });
        }

        const result = await pool.query(
            'UPDATE equipos SET nombre = $1, manager = $2, ciudad = $3 WHERE id = $4 RETURNING *',
            [nombre.trim(), manager.trim(), ciudad.trim(), id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        
        // Notificación SSE: equipo actualizado
        notifyAllClients('team-updated', {
            category: 'general',
            jugadorId: null,
            equipoId: parseInt(id)
        });

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un equipo con ese nombre' });
        }
        console.error('Error actualizando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM equipos WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        res.json({ 
            message: 'Equipo eliminado correctamente',
            jugadores_afectados: 'Se desvincularon automáticamente del equipo'
        });
    } catch (error) {
        console.error('Error eliminando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== JUGADORES COMPLETADOS =========================

app.get('/api/jugadores', async (req, res) => {
    try {
        const { page = 1, limit = 50, equipo_id, posicion, search } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT j.*, e.nombre as equipo_nombre 
            FROM jugadores j 
            LEFT JOIN equipos e ON j.equipo_id = e.id 
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        // Filtros opcionales
        if (equipo_id) {
            query += ` AND j.equipo_id = $${paramIndex}`;
            params.push(equipo_id);
            paramIndex++;
        }

        if (posicion) {
            query += ` AND j.posicion = $${paramIndex}`;
            params.push(posicion);
            paramIndex++;
        }

        if (search) {
            query += ` AND j.nombre ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY j.nombre ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        
        // Contar total para paginación
        let countQuery = 'SELECT COUNT(*) FROM jugadores j WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (equipo_id) {
            countQuery += ` AND j.equipo_id = $${countParamIndex}`;
            countParams.push(equipo_id);
            countParamIndex++;
        }

        if (posicion) {
            countQuery += ` AND j.posicion = $${countParamIndex}`;
            countParams.push(posicion);
            countParamIndex++;
        }

        if (search) {
            countQuery += ` AND j.nombre ILIKE $${countParamIndex}`;
            countParams.push(`%${search}%`);
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            jugadores: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error obteniendo jugadores:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============================================================
// ENDPOINT MEJORADO: Búsqueda de Jugadores Y Equipos
// ============================================================
app.get('/api/jugadores/buscar', async (req, res) => {
    try {
        const { query } = req.query;
                
        if (!query || query.trim().length < 2) {
            return res.status(400).json({ 
                 error: 'La búsqueda debe tener al menos 2 caracteres',
                jugadores: [],
                equipos: [],
                total: 0
            });
        }
                
        const searchTerm = `%${query.trim()}%`;
                
        console.log('🔍 Buscando jugadores y equipos con término:', query);
                
        // Búsqueda de jugadores
        const jugadoresResult = await pool.query(`
            SELECT 
                j.id,
                j.nombre,
                j.numero,
                j.posicion,
                e.id as equipo_id,
                e.nombre as equipo_nombre,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                CASE 
                     WHEN COALESCE(eo.at_bats, 0) > 0 
                     THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / eo.at_bats, 3)
                    ELSE 0.000 
                 END as promedio_bateo,
                'jugador' as tipo_resultado
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE LOWER(j.nombre) LIKE LOWER($1)
            ORDER BY j.nombre ASC
            LIMIT 15
        `, [searchTerm]);
                
        // Búsqueda de equipos
        const equiposResult = await pool.query(`
            SELECT 
                e.id,
                e.nombre,
                e.ciudad,
                e.manager,
                COUNT(j.id) as total_jugadores,
                'equipo' as tipo_resultado
            FROM equipos e
            LEFT JOIN jugadores j ON e.id = j.equipo_id
            WHERE LOWER(e.nombre) LIKE LOWER($1)
               OR LOWER(e.ciudad) LIKE LOWER($1)
            GROUP BY e.id, e.nombre, e.ciudad, e.manager
            ORDER BY e.nombre ASC
            LIMIT 10
        `, [searchTerm]);
                
        const totalResultados = jugadoresResult.rows.length + equiposResult.rows.length;
                
        console.log(`✅ Búsqueda: ${jugadoresResult.rows.length} jugadores, ${equiposResult.rows.length} equipos`);
                
        res.json({
            jugadores: jugadoresResult.rows,
            equipos: equiposResult.rows,
            total: totalResultados,
            query: query.trim()
        });
            
    } catch (error) {
        console.error('❌ Error buscando:', error);
        res.status(500).json({ 
             error: 'Error interno del servidor',
            message: error.message,
            jugadores: [],
            equipos: [],
            total: 0
        });
    }
});


// ========================================================================
// ================== INICIO DE CORRECCIONES CRÍTICAS =====================
// ========================================================================

// PROBLEMA 1 CORREGIDO: Endpoint /api/jugadores/:id ahora retorna datos del equipo
// 🟢 CORRECCIÓN CRÍTICA APLICADA: Incluir datos de estadisticas_ofensivas (strikeouts)
app.get('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Query SQL con JOIN para incluir datos del equipo y las estadísticas ofensivas.
        // Se usa COALESCE para asegurar que los campos de estadísticas devuelvan 0 si no hay registro.
        // NOTA: Se asume que se desea la estadística del registro de estadísticas más reciente/por defecto.
        const result = await pool.query(`
            SELECT 
                j.id, 
                j.nombre, 
                j.posicion, 
                j.numero,
                j.equipo_id,
                e.nombre as equipo_nombre,
                e.manager as equipo_manager,
                e.ciudad as equipo_ciudad,
                -- INICIO DE CORRECCIÓN: Obtener Strikeouts y otras estadísticas ofensivas
                COALESCE(s.strikeouts, 0) as strikeouts,
                COALESCE(s.at_bats, 0) as at_bats,
                COALESCE(s.hits, 0) as hits
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            -- LEFT JOIN a estadisticas_ofensivas (s) para incluir los strikeouts
            LEFT JOIN estadisticas_ofensivas s ON j.id = s.jugador_id
            WHERE j.id = $1
            -- Limitar a 1 para evitar duplicados si un jugador tiene múltiples temporadas
            LIMIT 1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        
        // ✅ CRITERIO CUMPLIDO: El endpoint /api/jugadores/:id ahora devolverá el valor real de 'strikeouts'.
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// PROBLEMA 2 CORREGIDO: Creado endpoint para historial de partidos de un jugador
app.get('/api/jugadores/:id/partidos', async (req, res) => {
    try {
        const { id } = req.params;
                
        // 1. Obtener equipo_id del jugador
        const jugadorQuery = await pool.query(
            'SELECT equipo_id FROM jugadores WHERE id = $1',
            [id]
        );
                
        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
                
        const equipoId = jugadorQuery.rows[0].equipo_id;
                
        if (!equipoId) {
            return res.json([]); // Jugador sin equipo
        }
                
        // 2. Obtener partidos del equipo (máximo 10 más recientes)
        const partidosQuery = await pool.query(`
            SELECT 
                p.id,
                p.fecha_partido,
                p.carreras_local,
                p.carreras_visitante,
                p.equipo_local_id,
                p.equipo_visitante_id,
                el.nombre as equipo_local_nombre,
                ev.nombre as equipo_visitante_nombre
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE (p.equipo_local_id = $1 OR p.equipo_visitante_id = $1)
                AND p.estado = 'finalizado'
            ORDER BY p.fecha_partido DESC
            LIMIT 10
        `, [equipoId]);
                
        res.json(partidosQuery.rows);
            } catch (error) {
        console.error('Error obteniendo partidos del jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =================================================================================
// ===================== INICIO DE NUEVOS ENDPOINTS PARA JUGADOR =====================
// =================================================================================

// ====================== JUGADORES SIMILARES (MISMA POSICIÓN) ======================
app.get('/api/jugadores/:id/similares', async (req, res) => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 5;
                
        // 1. Obtener posición del jugador actual
        const jugadorQuery = await pool.query(
            'SELECT posicion, equipo_id FROM jugadores WHERE id = $1',
            [id]
        );
                
        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
                
        const { posicion, equipo_id } = jugadorQuery.rows[0];
                
        if (!posicion) {
            return res.json([]); // Sin posición definida
        }
                
        // 2. Buscar jugadores con la misma posición (excluyendo al jugador actual)
        const similaresQuery = await pool.query(`
            SELECT 
                j.id,
                j.nombre,
                j.numero,
                j.posicion,
                e.nombre as equipo_nombre,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                CASE 
                    WHEN COALESCE(eo.at_bats, 0) > 0 
                    THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / COALESCE(eo.at_bats, 1), 3)
                    ELSE 0.000
                END as avg
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE j.posicion = $1 
                AND j.id != $2
                AND j.equipo_id IS NOT NULL
            ORDER BY avg DESC, eo.hits DESC
            LIMIT $3
        `, [posicion, id, limit]);
                
        res.json(similaresQuery.rows);
            } catch (error) {
        console.error('Error obteniendo jugadores similares:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== JUGADORES DEL MISMO EQUIPO ======================
app.get('/api/jugadores/:id/companeros', async (req, res) => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 5;
                
        // 1. Obtener equipo del jugador actual
        const jugadorQuery = await pool.query(
            'SELECT equipo_id FROM jugadores WHERE id = $1',
            [id]
        );
                
        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
                
        const { equipo_id } = jugadorQuery.rows[0];
                
        if (!equipo_id) {
            return res.json([]); // Sin equipo asignado
        }
                
        // 2. Buscar compañeros de equipo (excluyendo al jugador actual)
        const companerosQuery = await pool.query(`
            SELECT 
                j.id,
                j.nombre,
                j.numero,
                j.posicion,
                e.nombre as equipo_nombre,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                CASE 
                    WHEN COALESCE(eo.at_bats, 0) > 0 
                    THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / COALESCE(eo.at_bats, 1), 3)
                    ELSE 0.000
                END as avg
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE j.equipo_id = $1 
                AND j.id != $2
            ORDER BY avg DESC, eo.hits DESC
            LIMIT $3
        `, [equipo_id, id, limit]);
                
        res.json(companerosQuery.rows);
            } catch (error) {
        console.error('Error obteniendo compañeros de equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =================================================================================
// ====================== FIN DE NUEVOS ENDPOINTS PARA JUGADOR =======================
// =================================================================================

// PROBLEMA 3 CORREGIDO: Creado endpoint de búsqueda universal
app.get('/api/buscar', async (req, res) => {
    try {
        const { q } = req.query;
                
        if (!q || q.trim().length < 2) {
            return res.status(400).json({ 
                error: 'El término de búsqueda debe tener al menos 2 caracteres' 
             });
        }
                
        const searchTerm = `%${q.trim()}%`;
                
        // Buscar en jugadores
        const jugadoresQuery = await pool.query(`
            SELECT 
                j.id,
                j.nombre,
                j.posicion,
                j.numero,
                e.nombre as equipo_nombre,
                'jugador' as tipo
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            WHERE j.nombre ILIKE $1
            LIMIT 5
        `, [searchTerm]);
                
        // Buscar en equipos
        const equiposQuery = await pool.query(`
            SELECT 
                id,
                nombre,
                ciudad,
                'equipo' as tipo
            FROM equipos
            WHERE nombre ILIKE $1
            LIMIT 5
        `, [searchTerm]);
                
        res.json({
            jugadores: jugadoresQuery.rows,
            equipos: equiposQuery.rows
        });
            } catch (error) {
        console.error('Error en búsqueda universal:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ========================================================================
// =================== FIN DE CORRECCIONES CRÍTICAS =======================
// ========================================================================


app.post('/api/jugadores', async (req, res) => {
    try {
        const { nombre, equipo_id, posicion, numero } = req.body;

        // Solo el nombre es obligatorio
        if (!nombre || nombre.trim().length < 2 || nombre.trim().length > 100) {
            return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres' });
        }

        // Si se envía equipo_id, validar que exista
        let equipoIdFinal = null;
        if (equipo_id !== undefined && equipo_id !== null && `${equipo_id}` !== '') {
            equipoIdFinal = parseInt(equipo_id, 10);
            if (Number.isNaN(equipoIdFinal)) {
                return res.status(400).json({ error: 'Equipo inválido' });
            }
            const eq = await pool.query('SELECT id FROM equipos WHERE id = $1', [equipoIdFinal]);
            if (eq.rows.length === 0) {
                return res.status(400).json({ error: 'El equipo seleccionado no existe' });
            }
        }

        // Validar posición solo si viene con valor
        const posicionesValidas = ['C','1B','2B','3B','SS','LF','CF','RF','P','UTIL','DH'];
        let posicionFinal = null;
        if (posicion !== undefined && posicion !== null && `${posicion}`.trim() !== '') {
            if (!posicionesValidas.includes(posicion)) {
                return res.status(400).json({ error: 'Posición inválida' });
            }
            posicionFinal = posicion;
        }

        // Número opcional
        let numeroFinal = null;
        if (numero !== undefined && numero !== null && `${numero}` !== '') {
            numeroFinal = parseInt(numero,10);
            if (Number.isNaN(numeroFinal) || numeroFinal < 0) {
                return res.status(400).json({ error: 'Número inválido' });
            }
            // Unicidad por equipo solo si hay equipo
            if (equipoIdFinal !== null) {
                const numeroExists = await pool.query('SELECT 1 FROM jugadores WHERE equipo_id=$1 AND numero=$2',[equipoIdFinal, numeroFinal]);
                if (numeroExists.rows.length>0) {
                    return res.status(409).json({ error: 'Ya existe un jugador con ese número en el equipo' });
                }
            }
        }

        const result = await pool.query(
            'INSERT INTO jugadores (nombre, equipo_id, posicion, numero) VALUES ($1,$2,$3,$4) RETURNING *',
            [nombre.trim(), equipoIdFinal, posicionFinal, numeroFinal]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, equipo_id, posicion, numero } = req.body;
        
        // Validaciones
        if (!nombre || !equipo_id) {
            return res.status(400).json({ 
                error: 'Nombre y equipo son requeridos' 
            });
        }

        if (nombre.length < 2 || nombre.length > 100) {
            return res.status(400).json({ 
                error: 'El nombre debe tener entre 2 y 100 caracteres' 
            });
        }

        // Verificar que el equipo existe
        const equipoExists = await pool.query('SELECT id FROM equipos WHERE id = $1', [equipo_id]);
        if (equipoExists.rows.length === 0) {
            return res.status(400).json({ error: 'El equipo especificado no existe' });
        }

        // Validar posición
        const posicionesValidas = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];
        if (posicion && !posicionesValidas.includes(posicion)) {
            return res.status(400).json({ 
                error: 'Posición inválida. Debe ser una de: ' + posicionesValidas.join(', ') 
            });
        }

        // Validar número único por equipo (excluyendo el jugador actual)
        if (numero) {
            const numeroExists = await pool.query(
                'SELECT id FROM jugadores WHERE equipo_id = $1 AND numero = $2 AND id != $3', 
                [equipo_id, numero, id]
            );
            if (numeroExists.rows.length > 0) {
                return res.status(409).json({ 
                    error: 'Ya existe otro jugador con ese número en el equipo' 
                });
            }
        }

        const result = await pool.query(
            'UPDATE jugadores SET nombre = $1, equipo_id = $2, posicion = $3, numero = $4 WHERE id = $5 RETURNING *',
            [nombre.trim(), equipo_id, posicion || null, numero || null, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        
        // Notificación SSE: jugador actualizado
        notifyAllClients('player-updated', {
            category: 'general',
            jugadorId: parseInt(id),
            equipoId: equipo_id || null
        });

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM jugadores WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        res.json({ 
            message: 'Jugador eliminado correctamente',
            estadisticas_eliminadas: 'Se eliminaron automáticamente en cascada'
        });
    } catch (error) {
        console.error('Error eliminando jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// ====================== PARTIDOS COMPLETADOS =========================

/**
 * 2. GET /api/partidos - Últimos Partidos y Paginación
 * CORREGIDO: Ahora maneja dos casos:
 * 1. Si vienen `estado` y `limit`, sirve la petición del landing page.
 * 2. Si no, mantiene la lógica de paginación para el panel de admin.
 */
app.get('/api/partidos', async (req, res) => {
    try {
        const { estado, limit, page = 1, equipo_id, fecha_desde, fecha_hasta } = req.query;

        // CASO 1: Petición simple del landing page
        if (estado && limit) {
            const simpleLimit = Number(limit) || 5;
            const simpleQuery = `
                SELECT 
                    p.id,
                    el.nombre as equipo_local_nombre,
                    ev.nombre as equipo_visitante_nombre,
                    p.carreras_local,
                    p.carreras_visitante,
                    p.innings_jugados as innings,
                    p.fecha_partido
                FROM partidos p
                JOIN equipos el ON p.equipo_local_id = el.id
                JOIN equipos ev ON p.equipo_visitante_id = ev.id
                WHERE p.estado = $1
                ORDER BY p.fecha_partido DESC, p.hora DESC
                LIMIT $2;
            `;
            const { rows } = await pool.query(simpleQuery, [estado, simpleLimit]);
            return res.json(rows);
        }

        // CASO 2: Lógica de paginación existente para el panel de admin
        const adminLimit = 20;
        const offset = (page - 1) * adminLimit;
        
        let query = `
            SELECT p.*, 
                   el.nombre as equipo_local_nombre,
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (equipo_id) {
            query += ` AND (p.equipo_local_id = $${paramIndex} OR p.equipo_visitante_id = $${paramIndex})`;
            params.push(equipo_id);
            paramIndex++;
        }
        if (fecha_desde) {
            query += ` AND p.fecha_partido >= $${paramIndex}`;
            params.push(fecha_desde);
            paramIndex++;
        }
        if (fecha_hasta) {
            query += ` AND p.fecha_partido <= $${paramIndex}`;
            params.push(fecha_hasta);
            paramIndex++;
        }

        query += ` ORDER BY p.fecha_partido DESC, p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(adminLimit, offset);

        const result = await pool.query(query, params);
        
        let countQuery = 'SELECT COUNT(*) FROM partidos p WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (equipo_id) {
            countQuery += ` AND (p.equipo_local_id = $${countParamIndex} OR p.equipo_visitante_id = $${countParamIndex})`;
            countParams.push(equipo_id);
            countParamIndex++;
        }
        if (fecha_desde) {
            countQuery += ` AND p.fecha_partido >= $${countParamIndex}`;
            countParams.push(fecha_desde);
            countParamIndex++;
        }
        if (fecha_hasta) {
            countQuery += ` AND p.fecha_partido <= $${countParamIndex}`;
            countParams.push(fecha_hasta);
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            partidos: result.rows,
            pagination: {
                page: parseInt(page),
                limit: adminLimit,
                total,
                pages: Math.ceil(total / adminLimit)
            }
        });
    } catch (error) {
        console.error('Error obteniendo partidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT p.*, 
                   el.nombre as equipo_local_nombre,
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =========================================================================
// 🚨 ENDPOINT CRÍTICO: POST /api/partidos - INTEGRACIÓN DE TRIGGER
// =========================================================================
app.post('/api/partidos', async (req, res, next) => {
    try {
        const { 
            equipo_local_id, 
            equipo_visitante_id, 
            carreras_local, 
            carreras_visitante, 
            innings_jugados, 
            fecha_partido,
            hora,
            estado
        } = req.body;

        // Validaciones básicas
        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ 
                error: 'Equipo local, equipo visitante y fecha son requeridos' 
            });
        }
        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ 
                error: 'El equipo local y visitante deben ser diferentes' 
            });
        }
        // Verificar que ambos equipos existen
        const equiposCheck = await pool.query(
            'SELECT id FROM equipos WHERE id IN ($1, $2)', 
            [equipo_local_id, equipo_visitante_id]
        );
        
        if (equiposCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Uno o ambos equipos no existen' });
        }
        // Validar carreras (NULL para partidos programados)
        let carrerasLocalFinal = null;
        let carrerasVisitanteFinal = null;
        if (carreras_local !== null && carreras_local !== undefined && carreras_local !== '') {
            carrerasLocalFinal = parseInt(carreras_local);
            if (isNaN(carrerasLocalFinal) || carrerasLocalFinal < 0) {
                return res.status(400).json({ error: 'Las carreras locales deben ser un número positivo' });
            }
        }
        if (carreras_visitante !== null && carreras_visitante !== undefined && carreras_visitante !== '') {
            carrerasVisitanteFinal = parseInt(carreras_visitante);
            if (isNaN(carrerasVisitanteFinal) || carrerasVisitanteFinal < 0) {
                return res.status(400).json({ error: 'Las carreras visitantes deben ser un número positivo' });
            }
        }
        // Validar innings
        const inningsJugadosFinal = innings_jugados ? parseInt(innings_jugados) : 9;
        if (inningsJugadosFinal < 1 || inningsJugadosFinal > 20) {
            return res.status(400).json({ 
                error: 'Los innings jugados deben estar entre 1 y 20' 
            });
        }
        // Validar fecha
        const fechaPartidoDate = new Date(fecha_partido);
        const fechaMinima = new Date('2020-01-01');
        const fechaLimite = new Date();
        fechaLimite.setFullYear(fechaLimite.getFullYear() + 2);
        
        if (fechaPartidoDate < fechaMinima || fechaPartidoDate > fechaLimite) {
            return res.status(400).json({ 
                error: 'La fecha del partido debe estar entre 2020 y 2 años en el futuro' 
            });
        }
        
        // CORRECCIÓN: Lógica de estado automática
        let estadoFinal;
                
        if (estado && ['programado', 'en_curso', 'finalizado', 'cancelado', 'pospuesto'].includes(estado)) {
            // Si se envía un estado válido explícitamente, usarlo
            estadoFinal = estado;
        } else {
            // Detectar automáticamente según si tiene resultados
            if (carrerasLocalFinal !== null && carrerasVisitanteFinal !== null) {
                estadoFinal = 'finalizado'; // Tiene resultados = partido jugado
            } else {
                estadoFinal = 'programado'; // Sin resultados = partido futuro
            }
        }
        
        // INSERT con nuevos campos
        const result = await pool.query(
            `INSERT INTO partidos (equipo_local_id, equipo_visitante_id, carreras_local,                                    carreras_visitante, innings_jugados, fecha_partido, hora, estado)              VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                equipo_local_id, 
                equipo_visitante_id, 
                carrerasLocalFinal, 
                carrerasVisitanteFinal, 
                inningsJugadosFinal, 
                fecha_partido,
                hora || null,
                estadoFinal
            ]
        );
        
        res.status(201).json(result.rows[0]);
        // Continuar al middleware/trigger
        next(); 
    } catch (error) {
        console.error('Error creando partido:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor',
            detalles: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}, triggerRecalculation); // 🚨 Inyección del trigger

// =========================================================================
// 🚨 ENDPOINT CRÍTICO: PUT /api/partidos/:id - INTEGRACIÓN DE TRIGGER
// =========================================================================
app.put('/api/partidos/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { 
            equipo_local_id, 
            equipo_visitante_id, 
            carreras_local, 
            carreras_visitante, 
            innings_jugados, 
            fecha_partido,
            estado // Se permite la actualización de estado
        } = req.body;
        
        // Mismas validaciones que POST
        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ 
                error: 'Equipo local, equipo visitante y fecha son requeridos' 
            });
        }

        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ 
                error: 'El equipo local y visitante deben ser diferentes' 
            });
        }

        const equiposCheck = await pool.query(
            'SELECT id FROM equipos WHERE id IN ($1, $2)', 
            [equipo_local_id, equipo_visitante_id]
        );
        
        if (equiposCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Uno o ambos equipos no existen' });
        }
        
        // Lógica de estado para asegurar el recálculo
        const estadoFinal = estado && ['programado', 'en_curso', 'finalizado', 'cancelado', 'pospuesto'].includes(estado) 
                            ? estado 
                            : (carreras_local !== null && carreras_visitante !== null ? 'finalizado' : 'programado');

        const result = await pool.query(
            `UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2, 
                                 carreras_local = $3, carreras_visitante = $4, 
                                 innings_jugados = $5, fecha_partido = $6, estado = $8
             WHERE id = $7 RETURNING *`,
            [equipo_local_id, equipo_visitante_id, carreras_local || null, 
             carreras_visitante || null, innings_jugados || 9, fecha_partido, id, estadoFinal]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        
        res.json(result.rows[0]);
        // Continuar al middleware/trigger
        next(); 
    } catch (error) {
        console.error('Error actualizando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}, triggerRecalculation); // 🚨 Inyección del trigger

app.delete('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM partidos WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        
        res.json({ message: 'Partido eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== PRÓXIMOS PARTIDOS (INICIO DE LA CORRECCIÓN) =========================
app.get('/api/proximos-partidos', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.id,
                p.fecha_partido,
                p.hora,
                p.estado,
                p.equipo_local_id,
                p.equipo_visitante_id,
                p.carreras_local,
                p.carreras_visitante,
                p.innings_jugados,
                el.nombre as equipo_local_nombre,
                ev.nombre as equipo_visitante_nombre,
                el.ciudad as ciudad_local,
                ev.ciudad as ciudad_visitante
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.estado = 'programado'
               AND p.fecha_partido >= CURRENT_DATE
            ORDER BY p.fecha_partido ASC, p.hora ASC
            LIMIT 10
        `;
                
        const { rows: partidos } = await pool.query(query);
                
        if (partidos.length === 0) {
            return res.json([]);
        }
                
        const partidosConRecords = await Promise.all(partidos.map(async (partido) => {
            try {
                // Query para record local
                const recordLocal = await pool.query(`
                    SELECT 
                        COUNT(*) FILTER (WHERE 
                            (equipo_local_id = $1 AND carreras_local > carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante > carreras_local)
                        ) as victorias,
                        COUNT(*) FILTER (WHERE 
                            (equipo_local_id = $1 AND carreras_local < carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante < carreras_local)
                        ) as derrotas
                    FROM partidos 
                    WHERE (equipo_local_id = $1 OR equipo_visitante_id = $1)
                       AND estado = 'finalizado'
                      AND carreras_local IS NOT NULL 
                       AND carreras_visitante IS NOT NULL
                `, [partido.equipo_local_id]);
                                
                // Query para record visitante
                const recordVisitante = await pool.query(`
                    SELECT 
                        COUNT(*) FILTER (WHERE 
                            (equipo_local_id = $1 AND carreras_local > carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante > carreras_local)
                        ) as victorias,
                        COUNT(*) FILTER (WHERE 
                            (equipo_local_id = $1 AND carreras_local < carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante < carreras_local)
                        ) as derrotas
                    FROM partidos 
                    WHERE (equipo_local_id = $1 OR equipo_visitante_id = $1)
                       AND estado = 'finalizado'
                      AND carreras_local IS NOT NULL 
                       AND carreras_visitante IS NOT NULL
                `, [partido.equipo_visitante_id]);
                                
                // ✅ Manejo seguro de records
                const localVictorias = recordLocal.rows[0]?.victorias || 0;
                const localDerrotas = recordLocal.rows[0]?.derrotas || 0;
                const visitanteVictorias = recordVisitante.rows[0]?.victorias || 0;
                const visitanteDerrotas = recordVisitante.rows[0]?.derrotas || 0;
                                
                return {
                    ...partido,
                    record_local: `${localVictorias}-${localDerrotas}`,
                    record_visitante: `${visitanteVictorias}-${visitanteDerrotas}`
                };
            } catch (recordError) {
                console.error('Error calculando records:', recordError);
                // Si falla el cálculo de records, devolver partido sin records
                return {
                    ...partido,
                    record_local: '0-0',
                    record_visitante: '0-0'
                };
            }
        }));
                
        console.log(`✅ Próximos partidos: ${partidosConRecords.length} encontrados`);
        res.json(partidosConRecords);
            
    } catch (error) {
        console.error('❌ Error obteniendo próximos partidos:', error);
        console.error('Detalles del error:', error.message);
        res.status(500).json({ 
            error: 'Error obteniendo próximos partidos',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});
// ====================== PRÓXIMOS PARTIDOS (FIN DE LA CORRECCIÓN) =========================

// ====================== ESTADÍSTICAS MEJORADAS =========================

app.get('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const { temporada, equipo_id, jugador_id, min_at_bats = 0 } = req.query;
        const seasonFilter = resolveTemporada(temporada);
        const allowLegacySeason = seasonFilter === DEFAULT_SEASON;
        console.info('[stats-get][ofensiva]', { jugador_id, equipo_id, temporada: seasonFilter });
        
        let query = `
            SELECT 
                   eo.*,
                   COALESCE(eo.strikeouts, 0)::INT as strikeouts,
                   j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre,
                   CASE 
                       WHEN eo.at_bats > 0 THEN ROUND(eo.hits::DECIMAL / eo.at_bats, 3)
                       ELSE 0.000 
                   END as avg,
                   CASE 
                       WHEN eo.at_bats > 0 THEN ROUND((eo.hits + eo.walks)::DECIMAL / (eo.at_bats + eo.walks), 3)
                       ELSE 0.000 
                   END as obp,
                   CASE 
                       WHEN eo.at_bats > 0 THEN ROUND((eo.hits + eo.home_runs * 3)::DECIMAL / eo.at_bats, 3)
                       ELSE 0.000 
                   END as slg
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON eo.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE eo.at_bats >= $1
        `;
        const params = [min_at_bats];
        let paramIndex = 2;

        if (allowLegacySeason) {
            query += ` AND (eo.temporada = $${paramIndex} OR LOWER(eo.temporada) = 'default' OR eo.temporada IS NULL)`;
        } else {
            query += ` AND eo.temporada = $${paramIndex}`;
        }
        params.push(seasonFilter);
        paramIndex++;

        if (jugador_id) {
            query += ` AND eo.jugador_id = $${paramIndex}`;
            params.push(jugador_id);
            paramIndex++;
        }

        if (equipo_id) {
            query += ` AND j.equipo_id = $${paramIndex}`;
            params.push(equipo_id);
        }

        query += ` ORDER BY avg DESC, eo.hits DESC`;

        const result = await pool.query(query, params);
        
        // Calcular OPS para cada jugador
        const jugadoresConOPS = result.rows.map(jugador => ({
            ...jugador,
            ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3))
        }));
        
        res.json(jugadoresConOPS);
    } catch (error) {
        console.error('Error obteniendo estadísticas ofensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/lideres-ofensivos', async (req, res) => {
    try {
        const { min_at_bats = 10 } = req.query;
        
        const result = await pool.query(`
            SELECT eo.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   ROUND(eo.hits::DECIMAL / eo.at_bats, 3) as avg,
                   ROUND((eo.hits + eo.walks)::DECIMAL / (eo.at_bats + eo.walks), 3) as obp,
                   ROUND((eo.hits + eo.home_runs * 3)::DECIMAL / eo.at_bats, 3) as slg
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON eo.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE eo.at_bats >= $1
            ORDER BY avg DESC
        `, [min_at_bats]);
        
        const jugadoresConOPS = result.rows.map(jugador => ({
            ...jugador,
            ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3))
        }));
        
        res.json(jugadoresConOPS);
    } catch (error) {
        console.error('Error obteniendo líderes ofensivos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Rutas similares para estadísticas de pitcheo y defensivas...
// (Agregar según sea necesario)

// ====================== NUEVA RUTA PARA DASHBOARD =========================

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const stats = await Promise.all([
            pool.query('SELECT COUNT(*) as total FROM equipos'),
            pool.query('SELECT COUNT(*) as total FROM jugadores'),
            pool.query('SELECT COUNT(*) as total FROM partidos'),
            pool.query('SELECT COUNT(*) as total FROM estadisticas_ofensivas WHERE at_bats > 0'),
        ]);

        res.json({
            equipos: parseInt(stats[0].rows[0].total),
            jugadores: parseInt(stats[1].rows[0].total),
            partidos: parseInt(stats[2].rows[0].total),
            jugadores_con_stats: parseInt(stats[3].rows[0].total)
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas del dashboard:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== ESTADÍSTICAS PITCHEO =========================
app.get('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const { temporada, equipo_id, jugador_id } = req.query;
        const seasonFilter = resolveTemporada(temporada);
        const allowLegacySeason = seasonFilter === DEFAULT_SEASON;
        let paramIndex = 1;
        const params = [];
        console.info('[stats-get][pitcheo]', { jugador_id, equipo_id, temporada: seasonFilter });

        let query = `
            SELECT ep.*, j.nombre as jugador_nombre, j.equipo_id, e.nombre as equipo_nombre,
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
            WHERE 1=1
        `;

        if (allowLegacySeason) {
            query += ` AND (ep.temporada = $${paramIndex} OR LOWER(ep.temporada) = 'default' OR ep.temporada IS NULL)`;
        } else {
            query += ` AND ep.temporada = $${paramIndex}`;
        }
        params.push(seasonFilter);
        paramIndex++;

        if (jugador_id) {
            query += ` AND ep.jugador_id = $${paramIndex}`;
            params.push(jugador_id);
            paramIndex++;
        }

        if (equipo_id) {
            query += ` AND j.equipo_id = $${paramIndex}`;
            params.push(equipo_id);
            paramIndex++;
        }

        query += ' ORDER BY era ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/estadisticas-pitcheo/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { temporada } = req.query;
        const seasonFilter = resolveTemporada(temporada);
        const allowLegacySeason = seasonFilter === DEFAULT_SEASON;
        console.info('[stats-get][pitcheo-id]', { jugador_id: id, temporada: seasonFilter });

        let query = `
            SELECT ep.*, j.nombre as jugador_nombre, j.equipo_id, e.nombre as equipo_nombre
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ep.jugador_id = $1
        `;
        const params = [id];

        if (allowLegacySeason) {
            query += ' AND (ep.temporada = $2 OR LOWER(ep.temporada) = \'default\' OR ep.temporada IS NULL)';
        } else {
            query += ' AND ep.temporada = $2';
        }
        params.push(seasonFilter);
        
        const result = await pool.query(query, params);
        
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

        const temporadaNormalizada = resolveTemporada(temporada);
        const result = await pool.query(`
            INSERT INTO estadisticas_pitcheo (
                jugador_id, temporada, innings_pitched, hits_allowed, earned_runs,
                strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (jugador_id, temporada) 
            DO UPDATE SET 
                innings_pitched = EXCLUDED.innings_pitched,
                hits_allowed = EXCLUDED.hits_allowed,
                earned_runs = EXCLUDED.earned_runs,
                strikeouts = EXCLUDED.strikeouts,
                walks_allowed = EXCLUDED.walks_allowed,
                home_runs_allowed = EXCLUDED.home_runs_allowed,
                wins = EXCLUDED.wins,
                losses = EXCLUDED.losses,
                saves = EXCLUDED.saves
            RETURNING *
        `, [jugador_id, temporadaNormalizada, innings_pitched || 0, hits_allowed || 0, 
            earned_runs || 0, strikeouts || 0, walks_allowed || 0, home_runs_allowed || 0,
            wins || 0, losses || 0, saves || 0]);
        console.info('[stats-upsert][pitcheo]', {
            jugador_id: parseInt(jugador_id, 10),
            equipo_id: req.body.equipo_id || null,
            temporada: temporadaNormalizada,
            rowsAffected: result.rowCount || 0
        });
        
        // Notificación SSE: estadísticas de pitcheo actualizadas (POST)
        notifyAllClients('stats-updated', {
            category: 'pitcheo',
            jugadorId: parseInt(jugador_id),
            equipoId: null
        });

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

        const temporadaNormalizada = resolveTemporada(temporada);
        const result = await pool.query(`
            UPDATE estadisticas_pitcheo SET 
                innings_pitched = $1, hits_allowed = $2, earned_runs = $3,
                strikeouts = $4, walks_allowed = $5, home_runs_allowed = $6,
                wins = $7, losses = $8, saves = $9
            WHERE jugador_id = $10 AND temporada = $11
            RETURNING *
        `, [innings_pitched || 0, hits_allowed || 0, earned_runs || 0, strikeouts || 0,
            walks_allowed || 0, home_runs_allowed || 0, wins || 0, losses || 0, 
            saves || 0, jugador_id, temporadaNormalizada]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas de pitcheo no encontradas' });
        }

        console.info('[stats-put][pitcheo]', {
            jugador_id: parseInt(jugador_id, 10),
            equipo_id: req.body.equipo_id || null,
            temporada: temporadaNormalizada,
            rowsAffected: result.rowCount || 0
        });
        
        // Notificación SSE: estadísticas de pitcheo actualizadas (PUT)
        notifyAllClients('stats-updated', {
            category: 'pitcheo',
            jugadorId: parseInt(jugador_id),
            equipoId: null
        });

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== ESTADÍSTICAS DEFENSIVAS =========================
app.get('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const { temporada, equipo_id, jugador_id } = req.query;
        const seasonFilter = resolveTemporada(temporada);
        const allowLegacySeason = seasonFilter === DEFAULT_SEASON;
        let paramIndex = 1;
        const params = [];
        console.info('[stats-get][defensiva]', { jugador_id, equipo_id, temporada: seasonFilter });

        let query = `
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre,
                   CASE 
                       WHEN ed.chances > 0 THEN ROUND((ed.putouts + ed.assists)::DECIMAL / ed.chances, 3)
                       ELSE 0.000 
                   END as fielding_percentage
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE 1=1
        `;

        if (allowLegacySeason) {
            query += ` AND (ed.temporada = $${paramIndex} OR LOWER(ed.temporada) = 'default' OR ed.temporada IS NULL)`;
        } else {
            query += ` AND ed.temporada = $${paramIndex}`;
        }
        params.push(seasonFilter);
        paramIndex++;

        if (jugador_id) {
            query += ` AND ed.jugador_id = $${paramIndex}`;
            params.push(jugador_id);
            paramIndex++;
        }

        if (equipo_id) {
            query += ` AND j.equipo_id = $${paramIndex}`;
            params.push(equipo_id);
        }

        query += ' ORDER BY fielding_percentage DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/estadisticas-defensivas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { temporada } = req.query;
        const seasonFilter = resolveTemporada(temporada);
        const allowLegacySeason = seasonFilter === DEFAULT_SEASON;
        console.info('[stats-get][defensiva-id]', { jugador_id: id, temporada: seasonFilter });

        let query = `
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ed.jugador_id = $1
        `;
        const params = [id];

        if (allowLegacySeason) {
            query += ' AND (ed.temporada = $2 OR LOWER(ed.temporada) = \'default\' OR ed.temporada IS NULL)';
        } else {
            query += ' AND ed.temporada = $2';
        }
        params.push(seasonFilter);
        
        const result = await pool.query(query, params);
        
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

        const temporadaNormalizada = resolveTemporada(temporada);
        const result = await pool.query(`
            INSERT INTO estadisticas_defensivas (
                jugador_id, temporada, putouts, assists, errors, 
                double_plays, passed_balls, chances
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (jugador_id, temporada) 
            DO UPDATE SET 
                putouts = EXCLUDED.putouts,
                assists = EXCLUDED.assists,
                errors = EXCLUDED.errors,
                double_plays = EXCLUDED.double_plays,
                passed_balls = EXCLUDED.passed_balls,
                chances = EXCLUDED.chances
            RETURNING *
        `, [jugador_id, temporadaNormalizada, putouts || 0, assists || 0, 
            errors || 0, double_plays || 0, passed_balls || 0, chances || 0]);
        console.info('[stats-upsert][defensiva]', {
            jugador_id: parseInt(jugador_id, 10),
            equipo_id: req.body.equipo_id || null,
            temporada: temporadaNormalizada,
            rowsAffected: result.rowCount || 0
        });
        
        // Notificación SSE: estadísticas defensivas actualizadas (POST)
        notifyAllClients('stats-updated', {
            category: 'defensiva',
            jugadorId: parseInt(jugador_id),
            equipoId: null
        });

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

        const temporadaNormalizada = resolveTemporada(temporada);
        const result = await pool.query(`
            UPDATE estadisticas_defensivas SET 
                putouts = $1, assists = $2, errors = $3, double_plays = $4,
                passed_balls = $5, chances = $6
            WHERE jugador_id = $7 AND temporada = $8
            RETURNING *
        `, [putouts || 0, assists || 0, errors || 0, double_plays || 0,
            passed_balls || 0, chances || 0, jugador_id, temporadaNormalizada]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas defensivas no encontradas' });
        }

        console.info('[stats-put][defensiva]', {
            jugador_id: parseInt(jugador_id, 10),
            equipo_id: req.body.equipo_id || null,
            temporada: temporadaNormalizada,
            rowsAffected: result.rowCount || 0
        });
        
        // Notificación SSE: estadísticas defensivas actualizadas (PUT)
        notifyAllClients('stats-updated', {
            category: 'defensiva',
            jugadorId: parseInt(jugador_id),
            equipoId: null
        });

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
// ====================== LÍDERES DEFENSIVOS =========================
app.get('/api/lideres-defensivos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   CASE 
                       WHEN ed.chances >= 5 THEN ROUND((ed.putouts + ed.assists)::DECIMAL / ed.chances, 3)
                       ELSE 0.000 
                   END as fielding_percentage,
                   ed.chances as total_chances
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ed.chances >= 5
            ORDER BY fielding_percentage DESC, ed.chances DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo líderes defensivos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== LÍDERES PITCHEO =========================
app.get('/api/lideres-pitcheo', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ep.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre,
                   CASE 
                       WHEN ep.innings_pitched >= 5 THEN ROUND((ep.earned_runs * 9.0) / ep.innings_pitched, 2)
                       ELSE 99.99 
                   END as era,
                   CASE 
                       WHEN ep.innings_pitched >= 5 THEN ROUND((ep.hits_allowed + ep.walks_allowed) / ep.innings_pitched, 2)
                       ELSE 99.99 
                   END as whip
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ep.innings_pitched >= 5
            ORDER BY era ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo líderes de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============================================================
// ENDPOINT PRINCIPAL PARA LÍDERES (REQUERIDO POR INDEX.HTML)
// ============================================================
app.get('/api/lideres', async (req, res) => {
    try {
        const { tipo = 'bateo', min_ab = 10 } = req.query;

        if (tipo === 'bateo') {
            const query = `
                SELECT 
                    j.id, j.nombre, j.posicion, e.nombre as equipo,
                    eo.at_bats, eo.hits, eo.home_runs, eo.rbi, eo.runs,
                    eo.walks, eo.stolen_bases, eo.strikeouts,
                    COALESCE(eo.doubles, 0) as doubles, 
                    COALESCE(eo.triples, 0) as triples, 
                    COALESCE(eo.caught_stealing, 0) as caught_stealing,
                    COALESCE(eo.hit_by_pitch, 0) as hit_by_pitch, 
                    COALESCE(eo.sacrifice_flies, 0) as sacrifice_flies, 
                    COALESCE(eo.sacrifice_hits, 0) as sacrifice_hits,

                    -- Cálculos profesionales
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
                        ELSE 0.000 END as slg,

                    -- Singles calculados
                    (eo.hits - COALESCE(eo.doubles, 0) - COALESCE(eo.triples, 0) - eo.home_runs) as singles,

                    -- Total Bases
                    ((eo.hits - COALESCE(eo.doubles, 0) - COALESCE(eo.triples, 0) - eo.home_runs) + 
                     COALESCE(eo.doubles, 0) * 2 + COALESCE(eo.triples, 0) * 3 + eo.home_runs * 4) as total_bases,

                    -- Plate Appearances
                    (eo.at_bats + eo.walks + COALESCE(eo.hit_by_pitch, 0) + COALESCE(eo.sacrifice_flies, 0) + COALESCE(eo.sacrifice_hits, 0)) as plate_appearances

                FROM estadisticas_ofensivas eo
                JOIN jugadores j ON eo.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE eo.at_bats >= $1
                ORDER BY avg DESC, eo.hits DESC
                LIMIT 20`;

            const result = await pool.query(query, [min_ab]);

            // Calcular OPS y métricas adicionales
            const lideres = result.rows.map(jugador => ({
                ...jugador,
                ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3)),
                iso: parseFloat((parseFloat(jugador.slg) - parseFloat(jugador.avg)).toFixed(3))
            }));

            res.json(lideres);

        } else if (tipo === 'pitcheo') {
            // Redirigir a endpoint existente
            const query = `
                SELECT 
                    j.id, j.nombre, j.posicion, e.nombre as equipo,
                    ep.innings_pitched, ep.earned_runs, ep.strikeouts, ep.walks_allowed,
                    ep.hits_allowed, ep.home_runs_allowed, ep.wins, ep.losses,
                    CASE WHEN ep.innings_pitched > 0 
                        THEN ROUND((ep.earned_runs * 9.0) / ep.innings_pitched, 2)
                        ELSE 0.00 END as era,
                    CASE WHEN ep.innings_pitched > 0 
                        THEN ROUND((ep.hits_allowed + ep.walks_allowed) / ep.innings_pitched, 2)
                        ELSE 0.00 END as whip
                FROM estadisticas_pitcheo ep
                JOIN jugadores j ON ep.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE ep.innings_pitched >= 5
                ORDER BY era ASC
                LIMIT 20`;

            const result = await pool.query(query);
            res.json(result.rows);

        } else if (tipo === 'defensa') {
            // Redirigir a endpoint existente
            const query = `
                SELECT 
                    j.id, j.nombre, j.posicion, e.nombre as equipo,
                    ed.putouts, ed.assists, ed.errors, ed.double_plays,
                    CASE WHEN (ed.putouts + ed.assists + ed.errors) > 0 
                        THEN ROUND((ed.putouts + ed.assists)::DECIMAL / (ed.putouts + ed.assists + ed.errors), 3)
                        ELSE 1.000 END as fielding_percentage
                FROM estadisticas_defensivas ed
                JOIN jugadores j ON ed.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                ORDER BY fielding_percentage DESC, ed.putouts DESC
                LIMIT 20`;

            const result = await pool.query(query);
            res.json(result.rows);
        } else {
            res.status(400).json({ error: 'Tipo no válido. Use: bateo, pitcheo, defensa' });
        }

    } catch (error) {
        console.error('Error obteniendo líderes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// ====================== ESTADÍSTICAS OFENSIVAS MEJORADAS =========================
// ============================================================
// BUG #1 CORREGIDO: FUNCIÓN upsertEstadisticasOfensivas
// ============================================================
async function upsertEstadisticasOfensivas(req, res, next) {
    try {
        const { 
            jugador_id, temporada, at_bats = 0, hits = 0, 
            home_runs = 0, rbi = 0, runs = 0, walks = 0, 
            stolen_bases = 0, strikeouts = 0, doubles = 0, 
            triples = 0, caught_stealing = 0, hit_by_pitch = 0,
            sacrifice_flies = 0, sacrifice_hits = 0 
        } = req.body;

        // Validaciones
        if (!jugador_id || isNaN(parseInt(jugador_id))) {
            return res.status(400).json({ error: 'ID de jugador requerido y válido' });
        }

        const temporadaNormalizada = resolveTemporada(temporada);
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
            parseInt(jugador_id), temporadaNormalizada, parseInt(at_bats), parseInt(hits),
            parseInt(home_runs), parseInt(rbi), parseInt(runs), parseInt(walks),
            parseInt(stolen_bases), parseInt(strikeouts), parseInt(doubles), 
            parseInt(triples), parseInt(caught_stealing), parseInt(hit_by_pitch),
            parseInt(sacrifice_flies), parseInt(sacrifice_hits)
        ];

        const result = await pool.query(query, values);
        console.info('[stats-upsert][ofensiva]', {
            jugador_id: parseInt(jugador_id, 10),
            equipo_id: req.body.equipo_id || null,
            temporada: temporadaNormalizada,
            rowsAffected: result.rowCount || 0
        });
        // Notificación SSE: estadísticas ofensivas actualizadas
        notifyAllClients('stats-updated', {
            category: 'bateo',
            jugadorId: parseInt(jugador_id),
            equipoId: null
        });

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
app.put('/api/estadisticas-ofensivas', upsertEstadisticasOfensivas, triggerRecalculation); // 🚨 Inyección del trigger
app.post('/api/estadisticas-ofensivas', upsertEstadisticasOfensivas, triggerRecalculation); // 🚨 Inyección del trigger

// =========================================================================
// 🚨 NUEVO ENDPOINT PARA EDICIÓN (REEMPLAZAR VALORES)
// =========================================================================
async function editarEstadisticasOfensivas(req, res, next) {
    try {
        const { 
            jugador_id, temporada, at_bats = 0, hits = 0, 
            home_runs = 0, rbi = 0, runs = 0, walks = 0, 
            stolen_bases = 0, strikeouts = 0, doubles = 0, 
            triples = 0, caught_stealing = 0, hit_by_pitch = 0,
            sacrifice_flies = 0, sacrifice_hits = 0, plate_appearances = 0
        } = req.body;

        // Validaciones
        if (!jugador_id || isNaN(parseInt(jugador_id))) {
            return res.status(400).json({ error: 'ID de jugador requerido y válido' });
        }

        const temporadaNormalizada = resolveTemporada(temporada);
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
            parseInt(jugador_id), temporadaNormalizada, parseInt(at_bats), parseInt(hits),
            parseInt(home_runs), parseInt(rbi), parseInt(runs), parseInt(walks),
            parseInt(stolen_bases), parseInt(strikeouts), parseInt(doubles), 
            parseInt(triples), parseInt(caught_stealing), parseInt(hit_by_pitch),
            parseInt(sacrifice_flies), parseInt(sacrifice_hits)
        ];

        const result = await pool.query(query, values);
        console.info('[stats-upsert][ofensiva-edit]', {
            jugador_id: parseInt(jugador_id, 10),
            equipo_id: req.body.equipo_id || null,
            temporada: temporadaNormalizada,
            rowsAffected: result.rowCount || 0
        });
        // Notificación SSE: edición de estadísticas ofensivas
        notifyAllClients('stats-updated', {
            category: 'bateo',
            jugadorId: parseInt(jugador_id),
            equipoId: null
        });

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

// ENDPOINT PARA EDICIÓN (REEMPLAZAR)
app.put('/api/estadisticas-ofensivas/edit', editarEstadisticasOfensivas, triggerRecalculation);
app.post('/api/estadisticas-ofensivas/edit', editarEstadisticasOfensivas, triggerRecalculation);

// Alias para compatibilidad con versión anterior (guión bajo)
app.put('/api/estadisticas_ofensivas', upsertEstadisticasOfensivas, triggerRecalculation); // 🚨 Inyección del trigger
app.post('/api/estadisticas_ofensivas', upsertEstadisticasOfensivas, triggerRecalculation); // 🚨 Inyección del trigger
// ===============================================================
// =================== RUTAS DE ARCHIVOS HTML =================
// ===============================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/equipo.html', (req, res) => res.sendFile(path.join(__dirname, 'public/equipo.html')));
app.get('/public', (req, res) => res.sendFile(path.join(__dirname, 'public/public.html')));


// ==================== OPTIMIZACIONES PARA RAILWAY ====================
// const path = require('path'); // Ya está requerido al inicio del archivo

// Servir archivos estáticos optimizados
app.use(express.static('.', {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Servir logos estáticos con headers optimizados
app.use('/public/images/logos', express.static(path.join(__dirname, 'public/images/logos'), {
  maxAge: '7d', // Cache de 7 días para logos
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 días
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// Verificar estructura de logos al iniciar
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

// Ejecutar verificación al iniciar servidor
verificarLogos();

console.log('🚀 Chogui League System optimizado para Railway');


// Salud del API (útil para el index)
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ===============================================================
// =================== INICIO DE INTEGRACIÓN SSE =================
// ===============================================================


// Endpoint SSE dedicado a notificaciones de cambios en estadísticas
app.get('/api/sse/updates', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no'
    });

    const clientId = ++sseClientIdCounter;
    const client = { id: clientId, res };

    sseClients.push(client);
    console.log(`📡 [SSE] Cliente ${clientId} conectado al canal /api/sse/updates. Total: ${sseClients.length}`);

    // Evento inicial de conexión
    const initialEvent = {
        type: 'connection',
        message: 'Conectado al canal SSE de estadísticas',
        timestamp: new Date().toISOString(),
        totalClients: sseClients.length
    };

    res.write(`event: connection\n`);
    res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);

    // Manejo de desconexión
    req.on('close', () => {
        sseClients = sseClients.filter(c => c.id !== clientId);
        console.log(`🔌 [SSE] Cliente ${clientId} desconectado. Total: ${sseClients.length}`);
    });

    req.on('error', (err) => {
        console.error(`❌ [SSE] Error en cliente ${clientId}: ${err.message}`);
        sseClients = sseClients.filter(c => c.id !== clientId);
    });
});

/**
 * Envía un evento SSE a todos los clientes conectados al canal /api/sse/updates
 * @param {string} eventType - Tipo de evento (ej: 'stats-updated', 'leaders-changed')
 * @param {object} data - Payload adicional del evento
 */
function notifyAllClients(eventType, data) {
    if (!sseClients.length) {
        return;
    }

    const payload = {
        ...data,
        type: eventType,
        timestamp: new Date().toISOString()
    };

    const serialized = `event: ${eventType}\n` +
                       `data: ${JSON.stringify(payload)}\n\n`;

    const disconnectedIds = [];

    sseClients.forEach(client => {
        try {
            client.res.write(serialized);
        } catch (err) {
            console.error(`❌ [SSE] Error enviando a cliente ${client.id}: ${err.message}`);
            disconnectedIds.push(client.id);
        }
    });

    if (disconnectedIds.length) {
        sseClients = sseClients.filter(c => !disconnectedIds.includes(c.id));
        console.log(`🧹 [SSE] ${disconnectedIds.length} clientes eliminados por error de escritura. Activos: ${sseClients.length}`);
    }

    console.log(`📨 [SSE] Evento '${eventType}' enviado a ${sseClients.length} clientes.`);
}

// Variable global para contar las conexiones activas SSE
let activeConnections = 0;
console.log('✨ Preparando el sistema SSE...');

/**
 * ENDPOINT DE ACTUALIZACIONES EN TIEMPO REAL
 * Envía datos actualizados cada 30 segundos a todas las páginas conectadas
 * Compatible con Railway y optimizado para béisbol/sóftbol
 */
app.get('/api/live-updates', async (req, res) => {
    // Incrementar el contador global
    activeConnections++;
    console.log(`📡 Nueva conexión SSE establecida desde IP: ${req.ip}. Total de conexiones activas: ${activeConnections}`);
    
    // Configurar headers para Server-Sent Events
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*', // Crucial para CORS en Railway
        'Access-Control-Allow-Headers': 'Cache-Control',
        'X-Accel-Buffering': 'no' // Deshabilita el buffering en algunos proxies como Nginx
    });

    // Enviar mensaje inicial de conexión
    res.write(`data: {"type":"connected","message":"Conectado al sistema de actualizaciones","timestamp":"${new Date().toISOString()}"}\n\n`);

    // Función para obtener todos los datos actualizados
    async function getAllUpdatedData() {
        try {
            console.log('🔄 Recopilando datos actualizados para SSE...');

            // 1. LÍDERES OFENSIVOS COMPLETOS (Top 10 AVG)
            const lideresOfensivos = await pool.query(`
                SELECT 
                    j.id as jugador_id,
                    j.nombre as jugador_nombre,
                    e.nombre as equipo_nombre,
                    s.hits,
                    s.at_bats,
                    s.home_runs,
                    s.rbi,
                    s.stolen_bases,
                    s.strikeouts,
                    CASE 
                        WHEN s.at_bats > 0 
                        THEN ROUND(s.hits::DECIMAL / s.at_bats, 3) 
                        ELSE 0.000 
                    END as avg
                FROM estadisticas_ofensivas s
                JOIN jugadores j ON s.jugador_id = j.id
                LEFT JOIN equipos e ON j.equipo_id = e.id
                WHERE s.at_bats > 0
                ORDER BY avg DESC
                LIMIT 10
            `);

            // 2. TABLA DE POSICIONES ACTUALIZADA
            const standings = await pool.query(`
                SELECT 
                    e.id,
                    e.nombre,
                    COUNT(CASE WHEN (p.equipo_local_id = e.id AND p.carreras_local > p.carreras_visitante) OR 
                                       (p.equipo_visitante_id = e.id AND p.carreras_visitante > p.carreras_local) 
                              THEN 1 END) as victorias,
                    COUNT(CASE WHEN (p.equipo_local_id = e.id AND p.carreras_local < p.carreras_visitante) OR 
                                       (p.equipo_visitante_id = e.id AND p.carreras_visitante < p.carreras_local) 
                              THEN 1 END) as derrotas,
                    CASE 
                        WHEN COUNT(p.id) > 0 THEN 
                        ROUND(COUNT(CASE WHEN (p.equipo_local_id = e.id AND p.carreras_local > p.carreras_visitante) OR 
                                                 (p.equipo_visitante_id = e.id AND p.carreras_visitante > p.carreras_local) 
                                            THEN 1 END)::DECIMAL / COUNT(p.id), 3)
                        ELSE 0.000 
                    END as pct
                FROM equipos e
                LEFT JOIN partidos p ON (e.id = p.equipo_local_id OR e.id = p.equipo_visitante_id) 
                                      AND p.estado = 'finalizado'
                GROUP BY e.id, e.nombre
                ORDER BY pct DESC, victorias DESC
            `);

            // 3. LÍDERES DE PITCHEO (Top 5 ERA)
            const lideresPitcheo = await pool.query(`
                SELECT 
                    j.id as jugador_id,
                    j.nombre as jugador_nombre,
                    e.nombre as equipo_nombre,
                    s.wins,
                    s.losses,
                    s.strikeouts,
                    s.innings_pitched,
                    CASE 
                        WHEN s.innings_pitched >= 5 THEN 
                        ROUND((s.earned_runs * 9.0) / s.innings_pitched, 2)
                        ELSE 99.99 
                    END as era
                FROM estadisticas_pitcheo s
                JOIN jugadores j ON s.jugador_id = j.id
                LEFT JOIN equipos e ON j.equipo_id = e.id
                WHERE s.innings_pitched >= 5
                ORDER BY era ASC
                LIMIT 5
            `);

            // 4. ÚLTIMOS PARTIDOS FINALIZADOS
            const recentGames = await pool.query(`
                SELECT 
                    p.id,
                    p.fecha_partido,
                    p.carreras_local,
                    p.carreras_visitante,
                    el.nombre as equipo_local_nombre,
                    ev.nombre as equipo_visitante_nombre
                FROM partidos p
                JOIN equipos el ON p.equipo_local_id = el.id
                JOIN equipos ev ON p.equipo_visitante_id = ev.id
                WHERE p.estado = 'finalizado'
                ORDER BY p.fecha_partido DESC
                LIMIT 5
            `);

            // 5. PRÓXIMOS PARTIDOS
            const upcomingGames = await pool.query(`
                SELECT 
                    p.id,
                    p.fecha_partido,
                    p.hora,
                    el.nombre as equipo_local_nombre,
                    ev.nombre as equipo_visitante_nombre
                FROM partidos p
                JOIN equipos el ON p.equipo_local_id = el.id
                JOIN equipos ev ON p.equipo_visitante_id = ev.id
                WHERE p.estado = 'programado'
                ORDER BY p.fecha_partido ASC
                LIMIT 5
            `);

            return {
                timestamp: new Date().toISOString(),
                lideresOfensivos: lideresOfensivos.rows,
                standings: standings.rows,
                lideresPitcheo: lideresPitcheo.rows,
                recentGames: recentGames.rows,
                upcomingGames: upcomingGames.rows,
                totalConnections: activeConnections
            };

        } catch (error) {
            console.error('❌ Error recopilando datos para SSE:', error);
            return {
                timestamp: new Date().toISOString(),
                error: 'Error obteniendo datos actualizados',
                details: error.message
            };
        }
    }

    // Intervalo principal de actualización - CADA 30 SEGUNDOS
    const updateInterval = setInterval(async () => {
        try {
            const updatedData = await getAllUpdatedData();
            const message = `data: ${JSON.stringify(updatedData)}\n\n`;
            res.write(message);
            console.log(`📊 Datos SSE enviados a ${activeConnections} conexiones`);
        } catch (error) {
            console.error('❌ Error enviando datos SSE:', error);
        }
    }, 30000); // 30 segundos

    // Envío inmediato de datos al conectar
    setTimeout(async () => {
        try {
            const initialData = await getAllUpdatedData();
            res.write(`data: ${JSON.stringify(initialData)}\n\n`);
            console.log('📡 Datos iniciales enviados a nueva conexión SSE');
        } catch (error) {
            console.error('❌ Error enviando datos iniciales SSE:', error);
        }
    }, 1000);

    // Manejo de desconexión del cliente
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

// ===============================================================
// ============ ENDPOINT ADICIONAL PARA DEBUGGING ==============	
// ===============================================================

/**
 * ENDPOINT DE TESTING PARA SSE
 * Permite verificar si el SSE está funcionando correctamente
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

/**
 * ENDPOINT PARA RECALCULAR TODAS LAS ESTADÍSTICAS
 * Se debe ejecutar después de:
 * - Registrar nuevos partidos
 * - Editar estadísticas manualmente
 * - Actualizar resultados de partidos
 */
app.post('/api/recalcular-estadisticas', async (req, res) => {
    try {
        console.log('🔄 Iniciando recálculo automático de estadísticas...');
        
        // 1. RECALCULAR ESTADÍSTICAS OFENSIVAS DESDE PARTIDOS (Jugados/Victorias/Derrotas)
        const partidosFinalizados = await pool.query(`
            SELECT 
                j.id as jugador_id,
                j.nombre,
                p.id as partido_id,
                p.fecha_partido,
                CASE 
                    WHEN j.equipo_id = p.equipo_local_id THEN p.carreras_local
                    ELSE p.carreras_visitante 
                END as carreras_equipo,
                CASE 
                    WHEN j.equipo_id = p.equipo_local_id THEN p.carreras_visitante
                    ELSE p.carreras_local 
                END as carreras_rival
            FROM jugadores j
            CROSS JOIN partidos p
            WHERE p.estado = 'finalizado'
            AND p.carreras_local IS NOT NULL
            AND p.carreras_visitante IS NOT NULL
            AND (j.equipo_id = p.equipo_local_id OR j.equipo_id = p.equipo_visitante_id)
            ORDER BY j.id, p.fecha_partido
        `);

        // 2. CONSOLIDAR ESTADÍSTICAS POR JUGADOR (En el futuro, esto debería incluir AB, H, etc., si se registran por partido)
        const jugadoresStats = {};
        
        partidosFinalizados.rows.forEach(row => {
            if (!jugadoresStats[row.jugador_id]) {
                jugadoresStats[row.jugador_id] = {
                    jugador_id: row.jugador_id,
                    partidos_jugados: 0,
                    victorias: 0,
                    derrotas: 0
                };
            }
            
            jugadoresStats[row.jugador_id].partidos_jugados++;
            
            // Lógica de Victoria/Derrota solo para el cálculo de PG/PP/PJ (aunque esto es más útil a nivel de equipo)
            if (row.carreras_equipo > row.carreras_rival) {
                jugadoresStats[row.jugador_id].victorias++;
            } else {
                jugadoresStats[row.jugador_id].derrotas++;
            }
        });

        // 3. ACTUALIZAR ESTADÍSTICAS EXISTENTES CON DATOS CALCULADOS
        for (const jugadorId in jugadoresStats) {
            const stats = jugadoresStats[jugadorId];
            
            // Verificar si existe registro de estadísticas ofensivas
            const existingStats = await pool.query(
                'SELECT * FROM estadisticas_ofensivas WHERE jugador_id = $1',
                [jugadorId]
            );

            if (existingStats.rows.length > 0) {
                // Actualizar estadísticas existentes SIN TOCAR campos manuales (AB, H, HR, etc.)
                await pool.query(`
                    UPDATE estadisticas_ofensivas 
                    SET 
                        partidos_jugados = $1,
                        fecha_actualizacion = CURRENT_TIMESTAMP
                    WHERE jugador_id = $2
                `, [stats.partidos_jugados, jugadorId]);
            } else {
                // Crear nuevo registro con valores por defecto
                await pool.query(`
                    INSERT INTO estadisticas_ofensivas 
                    (jugador_id, temporada, at_bats, hits, home_runs, rbi, runs, 
                     walks, stolen_bases, strikeouts, partidos_jugados, fecha_registro, fecha_actualizacion)
                    VALUES ($1, '2024', 0, 0, 0, 0, 0, 0, 0, 0, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [jugadorId, stats.partidos_jugados]);
            }
        }

        // 4. RECALCULAR POSICIONES DE EQUIPOS (Aunque ya se calcula on-the-fly en /api/standings, esto es un buen placeholder)
        await pool.query(`
            DROP TABLE IF EXISTS temp_standings;
            CREATE TEMP TABLE temp_standings AS
            WITH raw AS (
                SELECT 
                    e.id as equipo_id,
                    e.nombre as equipo_nombre,
                    COUNT(CASE WHEN (p.equipo_local_id = e.id AND p.carreras_local > p.carreras_visitante) OR 
                                    (p.equipo_visitante_id = e.id AND p.carreras_visitante > p.carreras_local) 
                                THEN 1 END) as victorias,
                    COUNT(CASE WHEN (p.equipo_local_id = e.id AND p.carreras_local < p.carreras_visitante) OR 
                                    (p.equipo_visitante_id = e.id AND p.carreras_visitante < p.carreras_local) 
                                THEN 1 END) as derrotas,
                    COUNT(p.id) as partidos_jugados
                FROM equipos e
                LEFT JOIN partidos p ON (e.id = p.equipo_local_id OR e.id = p.equipo_visitante_id) 
                                     AND p.estado = 'finalizado'
                                     AND p.carreras_local IS NOT NULL
                                     AND p.carreras_visitante IS NOT NULL
                GROUP BY e.id, e.nombre
            )
            SELECT 
                raw.*,
                CASE WHEN partidos_jugados > 0 THEN victorias::DECIMAL / partidos_jugados ELSE 0 END AS porcentaje
            FROM raw
            ORDER BY porcentaje DESC, victorias DESC;
        `);
        console.log('✅ Recálculo de standings de equipos completado en tabla temporal.');


        // 5. LIMPIAR ESTADÍSTICAS HUÉRFANAS
        await pool.query(`
            DELETE FROM estadisticas_ofensivas 
            WHERE jugador_id NOT IN (SELECT id FROM jugadores)
        `);

        await pool.query(`
            DELETE FROM estadisticas_pitcheo 
            WHERE jugador_id NOT IN (SELECT id FROM jugadores)
        `);

        await pool.query(`
            DELETE FROM estadisticas_defensivas 
            WHERE jugador_id NOT IN (SELECT id FROM jugadores)
        `);
        console.log('✅ Estadísticas huérfanas limpiadas.');


        const totalJugadores = Object.keys(jugadoresStats).length;
        
        console.log(`✅ Recálculo completado: ${totalJugadores} jugadores procesados`);

        // Notificación SSE: cambio global en líderes/estadísticas
        notifyAllClients('leaders-changed', {
            category: 'global',
            jugadorId: null,
            equipoId: null
        });

        res.json({
            success: true,
            message: 'Estadísticas recalculadas exitosamente',
            jugadores_procesados: totalJugadores,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error recalculando estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error recalculando estadísticas',
            error: error.message
        });
    }
});

// ===============================================================
// ============= FUNCIÓN AUXILIAR PARA TRIGGER AUTOMÁTICO ======
// ===============================================================

/**
 * FUNCIÓN AUXILIAR PARA TRIGGER AUTOMÁTICO DE RECÁLCULO
 */
async function triggerRecalculation(req, res, next) {
    // Ejecutar recálculo en background sin bloquear respuesta
    setTimeout(async () => {
        try {
            console.log('🔄 Ejecutando recálculo automático en background...');
            
            // Determinar la URL base de forma segura
            const baseUrl = process.env.NODE_ENV === 'production' 
                ? 'https://chogui-league-system-production.up.railway.app' 
                : `http://localhost:${PORT}`;

            // Hacer llamada interna al endpoint de recálculo
            // NOTA: Usando fetch nativo de Node.js 18+

            const response = await fetch(`${baseUrl}/api/recalcular-estadisticas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                console.log('✅ Recálculo automático completado');
            } else {
                const errorBody = await response.json();
                console.warn('⚠️ Recálculo automático falló:', response.status, errorBody.message);
            }
        } catch (error) {
            console.error('❌ Error en recálculo automático:', error);
        }
    }, 2000); // Delay de 2 segundos para no interferir con la respuesta principal
    
    // Continuar con el flujo normal
    // NOTE: next() ya fue llamado en el handler principal antes de este middleware,
    // pero si se usara como un middleware real (no un callback de ruta como se hizo arriba),
    // next() sería necesario. Aquí solo se usa como un simple callback final.
    // Lo mantendremos aquí por si se ajusta la estructura de los handlers.
    // En este caso, no es estrictamente necesario, pero es un buen patrón de middleware.
    if (typeof next === 'function') {
        // En los handlers que hemos modificado, next() ya se llama antes de este.
        // Pero en la definición de la función, es mejor dejarlo.
        // Lo removemos del flujo de ejecución aquí ya que está siendo inyectado al final
        // del array de middlewares/handlers.
    }
}

console.log('✅ Sistema de recálculo automático configurado');

// ===============================================================
// =================== FIN DEL RECÁLCULO AUTOMÁTICO ==============
// ===============================================================

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

// Manejo graceful de cierre del servidor
process.on('SIGTERM', () => {
    console.log('🔄 Cerrando servidor...');
    pool.end(() => {
        console.log('✅ Conexiones de base de datos cerradas');
        process.exit(0);
    });
});


// ====== Compatibilidad extra ======

// 1) Rutas con ID en el path para estadísticas ofensivas (PUT/POST y con guión o guion_bajo)
app.put('/api/estadisticas-ofensivas/:jugadorId', (req, res) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return upsertEstadisticasOfensivas(req, res, triggerRecalculation);
});
app.post('/api/estadisticas-ofensivas/:jugadorId', (req, res) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return upsertEstadisticasOfensivas(req, res, triggerRecalculation);
});
app.put('/api/estadisticas_ofensivas/:jugadorId', (req, res) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return upsertEstadisticasOfensivas(req, res, triggerRecalculation);
});
app.post('/api/estadisticas_ofensivas/:jugadorId', (req, res) => {
    req.body = { ...req.body, jugador_id: parseInt(req.params.jugadorId, 10) };
    return upsertEstadisticasOfensivas(req, res, triggerRecalculation);
});

// 2) Alias para próximos partidos
app.get('/api/partidos/proximos', async (req, res) => {
    // handler equivalente a /api/proximos-partidos
    try {
        const query = `
            SELECT 
                p.id, p.fecha_partido, p.hora, p.estado,
                el.id AS equipo_local_id, el.nombre AS equipo_local,
                ev.id AS equipo_visitante_id, ev.nombre AS equipo_visitante
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.estado = 'programado' AND p.fecha_partido >= CURRENT_DATE
            ORDER BY p.fecha_partido ASC, p.hora ASC
            LIMIT 10
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo próximos partidos (alias):', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 3) Tabla de posiciones
app.get('/api/posiciones', async (req, res) => {
    try {
        const result = await pool.query(`
            WITH finalizados AS (
                SELECT 
                    id, equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante
                FROM partidos
                WHERE estado = 'finalizado'
            ),
            juegos AS (
                SELECT equipo_local_id AS equipo_id, 
                       (carreras_local) AS cf, (carreras_visitante) AS ce,
                       CASE WHEN carreras_local > carreras_visitante THEN 1 ELSE 0 END AS gan,
                       CASE WHEN carreras_local < carreras_visitante THEN 1 ELSE 0 END AS per
                FROM finalizados
                UNION ALL
                SELECT equipo_visitante_id AS equipo_id, 
                       (carreras_visitante) AS cf, (carreras_local) AS ce,
                       CASE WHEN carreras_visitante > carreras_local THEN 1 ELSE 0 END AS gan,
                       CASE WHEN carreras_visitante < carreras_local THEN 1 ELSE 0 END AS per
                FROM finalizados
            )
            SELECT e.id, e.nombre,
                   COUNT(j.equipo_id) AS pj,
                   COALESCE(SUM(j.gan),0) AS pg,
                   COALESCE(SUM(j.per),0) AS pp,
                   COALESCE(SUM(j.cf),0) AS cf,
                   COALESCE(SUM(j.ce),0) AS ce,
                   COALESCE(SUM(j.cf),0) - COALESCE(SUM(j.ce),0) AS dif,
                   CASE WHEN COUNT(j.equipo_id) = 0 THEN 0 
                        ELSE ROUND(COALESCE(SUM(j.gan),0)::numeric / COUNT(j.equipo_id) * 100, 2) END AS porcentaje,
                   ROW_NUMBER() OVER (ORDER BY 
                        CASE WHEN COUNT(j.equipo_id) = 0 THEN 0 
                        ELSE ROUND(COALESCE(SUM(j.gan),0)::numeric / COUNT(j.equipo_id) * 100, 2) END DESC,
                        (COALESCE(SUM(j.cf),0) - COALESCE(SUM(j.ce),0)) DESC,
                        e.nombre ASC
                   ) AS ranking
            FROM equipos e
            LEFT JOIN juegos j ON j.equipo_id = e.id
            GROUP BY e.id, e.nombre
            ORDER BY porcentaje DESC, dif DESC, e.nombre ASC;
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error calculando posiciones:', err);
        res.status(500).json({ error: 'Error al calcular posiciones' });
    }
});



// ====== Catch‑all robusto para rutas antiguas de estadísticas ofensivas ======
// Acepta: /api/estadisticas-ofensivas/:id  ó  /api/estadisticas_ofensivas/:id  (PUT o POST)
// Insensible a mayúsculas y a guión vs guion_bajo
app.all(/^\/api\/estadisticas[-_]ofensivas\/(\d+)$/i, (req, res, next) => {
  if (!['PUT','POST'].includes(req.method)) {
      // Si no es PUT o POST, podemos devolver un 405 o simplemente pasar al siguiente handler
      return res.status(405).json({error:'Method Not Allowed'});
  }
  const jugadorId = parseInt(req.params[0], 10);
  if (isNaN(jugadorId)) {
      return res.status(400).json({ error: 'ID de jugador inválido' });
  }
  req.body = { ...req.body, jugador_id: jugadorId };
  // Pasa el trigger como último argumento a la función, ya que no se usa como middleware tradicional aquí
  return upsertEstadisticasOfensivas(req, res, triggerRecalculation);
});

// Salud del API (útil para el index)
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

startServer();
