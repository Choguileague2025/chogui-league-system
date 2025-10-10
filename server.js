const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

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
                    cupos_playoffs INTEGER DEFAULT 8
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
            await pool.query(`ALTER TABLE torneos ADD COLUMN IF NOT EXISTS cupos_playoffs INTEGER DEFAULT 8;`);
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

// ... (TODAS LAS RUTAS API EXISTENTES, SIN CAMBIOS HASTA JUGADORES) ...
// ... (EQUIPOS, TORNEOS, LOGIN, STANDINGS, ETC.) ...
// =================================================================================
// ============== NUEVOS ENDPOINTS PARA EL LANDING PAGE (CORRECCIÓN) ===============
// =================================================================================

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
 * 3. GET /api/leaders - Líderes por Categoría
 * Devuelve los líderes estadísticos según el tipo (bateo, pitcheo, defensiva).
 */
app.get('/api/leaders', async (req, res, next) => {
    try {
        const { tipo = 'bateo', limit = 10 } = req.query;
        let sql = '';
        const params = [Number(limit) || 10];

        const validTypes = ['bateo', 'pitcheo', 'defensiva', 'todos'];
        if (!validTypes.includes(tipo)) {
            return res.status(400).json({ error: 'Tipo de líder no válido.' });
        }

        if (tipo === 'bateo') {
            sql = `
                SELECT 
                    j.nombre, 
                    e.nombre as equipo_nombre,
                    CASE WHEN s.at_bats > 0 THEN ROUND(s.hits::DECIMAL / s.at_bats, 3) ELSE 0.000 END as avg,
                    CASE WHEN s.at_bats + s.walks > 0 THEN ROUND((s.hits + s.walks)::DECIMAL / (s.at_bats + s.walks), 3) ELSE 0.000 END as obp,
                    CASE WHEN s.at_bats > 0 THEN ROUND(((s.hits) + (s.home_runs * 3))::DECIMAL / s.at_bats, 3) + ROUND((s.hits + s.walks)::DECIMAL / (s.at_bats + s.walks), 3) ELSE 0.000 END as ops,
                    s.home_runs as hr,
                    s.rbi
                FROM estadisticas_ofensivas s
                JOIN jugadores j ON s.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE s.at_bats > 10 -- Mínimo para calificar
                ORDER BY avg DESC NULLS LAST
                LIMIT $1;
            `;
        } else if (tipo === 'pitcheo') {
            sql = `
                SELECT 
                    j.nombre,
                    e.nombre as equipo_nombre,
                    CASE WHEN s.innings_pitched > 0 THEN ROUND((s.earned_runs * 9.0) / s.innings_pitched, 2) ELSE 0.00 END as era,
                    CASE WHEN s.innings_pitched > 0 THEN ROUND((s.hits_allowed + s.walks_allowed) / s.innings_pitched, 2) ELSE 0.00 END as whip
                FROM estadisticas_pitcheo s
                JOIN jugadores j ON s.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE s.innings_pitched > 5 -- Mínimo para calificar
                ORDER BY era ASC NULLS LAST
                LIMIT $1;
            `;
        } else if (tipo === 'defensiva') {
            sql = `
                SELECT 
                    j.nombre,
                    e.nombre as equipo_nombre,
                    CASE WHEN s.chances > 0 THEN ROUND((s.putouts + s.assists)::DECIMAL / s.chances, 3) ELSE 0.000 END as fpct
                FROM estadisticas_defensivas s
                JOIN jugadores j ON s.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE s.chances > 10 -- Mínimo para calificar
                ORDER BY fpct DESC NULLS LAST
                LIMIT $1;
            `;
        } else { // 'todos' - Devuelve los mejores bateadores por OPS como default
            sql = `
                SELECT 
                    j.nombre, 
                    e.nombre as equipo_nombre,
                    CASE WHEN s.at_bats > 0 THEN ROUND(s.hits::DECIMAL / s.at_bats, 3) ELSE 0.000 END as avg,
                    CASE WHEN s.at_bats > 0 THEN ROUND(((s.hits) + (s.home_runs * 3))::DECIMAL / s.at_bats, 3) + ROUND((s.hits + s.walks)::DECIMAL / (s.at_bats + s.walks), 3) ELSE 0.000 END as ops,
                    s.home_runs as hr
                FROM estadisticas_ofensivas s
                JOIN jugadores j ON s.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE s.at_bats > 10
                ORDER BY ops DESC NULLS LAST
                LIMIT $1;
            `;
        }
        
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(`GET /api/leaders (tipo: ${req.query.tipo})`, err);
        res.status(500).json({ error: 'Error obteniendo líderes' });
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
            LIMIT 8; -- Límite de 8 equipos para playoffs
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
        const cuposPlayoffsFinal = cupos_playoffs ? parseInt(cupos_playoffs, 10) : 8;

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

app.put('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
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


// ====================== JUGADORES =========================
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

        if (equipo_id) {
            query += ` AND j.equipo_id = $${paramIndex++}`;
            params.push(equipo_id);
        }
        if (posicion) {
            query += ` AND j.posicion = $${paramIndex++}`;
            params.push(posicion);
        }
        if (search) {
            query += ` AND j.nombre ILIKE $${paramIndex++}`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY j.nombre ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        
        let countQuery = 'SELECT COUNT(*) FROM jugadores j WHERE 1=1';
        const countParams = [];
        paramIndex = 1; // Reset for count params

        if (equipo_id) {
            countQuery += ` AND j.equipo_id = $${paramIndex++}`;
            countParams.push(equipo_id);
        }
        if (posicion) {
            countQuery += ` AND j.posicion = $${paramIndex++}`;
            countParams.push(posicion);
        }
        if (search) {
            countQuery += ` AND j.nombre ILIKE $${paramIndex++}`;
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

// ✅ CORRECCIÓN BUG #4: Endpoint verificado y mejorado
app.get('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                j.*,
                e.nombre as equipo_nombre,
                e.ciudad as equipo_ciudad
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            WHERE j.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        
        console.log(`✅ [INFO] Datos del jugador ID:${id} consultados correctamente.`);
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error(`❌ [ERROR] Obteniendo jugador ID:${req.params.id}:`, error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ✅ CORRECCIÓN BUG #3: Nuevo endpoint de búsqueda
/**
 * Endpoint de búsqueda de jugadores
 * GET /api/jugadores/buscar?query=nombre
 */
app.get('/api/jugadores/buscar', async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query || query.trim().length < 2) {
            return res.status(400).json({ 
                error: 'La búsqueda debe tener al menos 2 caracteres' 
            });
        }
        
        const searchTerm = `%${query.trim()}%`;
        console.log(`🔍 [SEARCH] Buscando jugadores con el término: "${query}"`);
        
        const result = await pool.query(`
            SELECT 
                j.id,
                j.nombre,
                j.numero,
                j.posicion,
                e.id as equipo_id,
                e.nombre as equipo_nombre,
                eo.at_bats,
                eo.hits,
                eo.home_runs,
                eo.rbi,
                CASE 
                    WHEN COALESCE(eo.at_bats, 0) > 0 
                    THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / eo.at_bats, 3)
                    ELSE 0.000 
                END as promedio_bateo
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE LOWER(j.nombre) LIKE LOWER($1)
            ORDER BY j.nombre ASC
            LIMIT 20
        `, [searchTerm]);
        
        console.log(`✅ [SEARCH] Se encontraron ${result.rows.length} resultados para "${query}"`);
        res.json({
            jugadores: result.rows,
            total: result.rows.length,
            query: query
        });
        
    } catch (error) {
        console.error('❌ [ERROR] Buscando jugadores:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


app.post('/api/jugadores', async (req, res) => {
    try {
        const { nombre, equipo_id, posicion, numero } = req.body;

        if (!nombre || nombre.trim().length < 2 || nombre.trim().length > 100) {
            return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres' });
        }

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

        const posicionesValidas = ['C','1B','2B','3B','SS','LF','CF','RF','P','UTIL','DH'];
        let posicionFinal = null;
        if (posicion !== undefined && posicion !== null && `${posicion}`.trim() !== '') {
            if (!posicionesValidas.includes(posicion)) {
                return res.status(400).json({ error: 'Posición inválida' });
            }
            posicionFinal = posicion;
        }

        let numeroFinal = null;
        if (numero !== undefined && numero !== null && `${numero}` !== '') {
            numeroFinal = parseInt(numero,10);
            if (Number.isNaN(numeroFinal) || numeroFinal < 0) {
                return res.status(400).json({ error: 'Número inválido' });
            }
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
        
        if (!nombre || !equipo_id) {
            return res.status(400).json({ error: 'Nombre y equipo son requeridos' });
        }
        if (nombre.length < 2 || nombre.length > 100) {
            return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres' });
        }

        const equipoExists = await pool.query('SELECT id FROM equipos WHERE id = $1', [equipo_id]);
        if (equipoExists.rows.length === 0) {
            return res.status(400).json({ error: 'El equipo especificado no existe' });
        }

        const posicionesValidas = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];
        if (posicion && !posicionesValidas.includes(posicion)) {
            return res.status(400).json({ error: 'Posición inválida. Debe ser una de: ' + posicionesValidas.join(', ') });
        }

        if (numero) {
            const numeroExists = await pool.query(
                'SELECT id FROM jugadores WHERE equipo_id = $1 AND numero = $2 AND id != $3', 
                [equipo_id, numero, id]
            );
            if (numeroExists.rows.length > 0) {
                return res.status(409).json({ error: 'Ya existe otro jugador con ese número en el equipo' });
            }
        }

        const result = await pool.query(
            'UPDATE jugadores SET nombre = $1, equipo_id = $2, posicion = $3, numero = $4 WHERE id = $5 RETURNING *',
            [nombre.trim(), equipo_id, posicion || null, numero || null, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM jugadores WHERE id = $1 RETURNING *', [id]);
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


// ====================== PARTIDOS =========================

// ✅ CORRECCIÓN BUG #2: Endpoint refactorizado para soportar ?estado=Programado
app.get('/api/partidos', async (req, res) => {
    try {
        const { estado, equipo_id, limit, page = 1, fecha_desde, fecha_hasta } = req.query;
        
        let query = `
            SELECT p.*, 
                   el.nombre as equipo_local_nombre, 
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;
        
        if (estado) {
            query += ` AND LOWER(p.estado) = LOWER($${paramIndex++})`;
            params.push(estado);
        }
        if (equipo_id) {
            query += ` AND (p.equipo_local_id = $${paramIndex} OR p.equipo_visitante_id = $${paramIndex++})`;
            params.push(equipo_id);
        }
        if (fecha_desde) {
            query += ` AND p.fecha_partido >= $${paramIndex++}`;
            params.push(fecha_desde);
        }
        if (fecha_hasta) {
            query += ` AND p.fecha_partido <= $${paramIndex++}`;
            params.push(fecha_hasta);
        }
        
        query += ` ORDER BY p.fecha_partido ASC, p.hora ASC`;
        
        if (limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(parseInt(limit));
        }
        
        console.log(`🔎 [PARTIDOS] Ejecutando query con filtros:`, { estado, equipo_id, limit });
        const result = await pool.query(query, params);
        res.json(result.rows);
        
    } catch (error) {
        console.error('❌ [ERROR] Obteniendo partidos:', error);
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

app.post('/api/partidos', async (req, res) => {
    try {
        const { 
            equipo_local_id, equipo_visitante_id, carreras_local, 
            carreras_visitante, innings_jugados, fecha_partido, hora, estado
        } = req.body;

        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ error: 'Equipo local, equipo visitante y fecha son requeridos' });
        }
        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ error: 'El equipo local y visitante deben ser diferentes' });
        }

        const equiposCheck = await pool.query('SELECT id FROM equipos WHERE id IN ($1, $2)', [equipo_local_id, equipo_visitante_id]);
        if (equiposCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Uno o ambos equipos no existen' });
        }

        let carrerasLocalFinal = null;
        if (carreras_local !== null && carreras_local !== undefined && carreras_local !== '') {
            carrerasLocalFinal = parseInt(carreras_local);
            if (isNaN(carrerasLocalFinal) || carrerasLocalFinal < 0) return res.status(400).json({ error: 'Las carreras locales deben ser un número positivo' });
        }
        let carrerasVisitanteFinal = null;
        if (carreras_visitante !== null && carreras_visitante !== undefined && carreras_visitante !== '') {
            carrerasVisitanteFinal = parseInt(carreras_visitante);
            if (isNaN(carrerasVisitanteFinal) || carrerasVisitanteFinal < 0) return res.status(400).json({ error: 'Las carreras visitantes deben ser un número positivo' });
        }

        const inningsJugadosFinal = innings_jugados ? parseInt(innings_jugados) : 9;
        if (inningsJugadosFinal < 1 || inningsJugadosFinal > 20) return res.status(400).json({ error: 'Los innings jugados deben estar entre 1 y 20' });

        const fechaPartidoDate = new Date(fecha_partido);
        if (isNaN(fechaPartidoDate.getTime())) return res.status(400).json({ error: 'Fecha de partido inválida' });

        let estadoFinal = estado;
        if (!estado || !['programado', 'en_curso', 'finalizado', 'cancelado', 'pospuesto'].includes(estado)) {
            estadoFinal = (carrerasLocalFinal !== null && carrerasVisitanteFinal !== null) ? 'finalizado' : 'programado';
        }
        
        const result = await pool.query(
            `INSERT INTO partidos (equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido, hora, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [equipo_local_id, equipo_visitante_id, carrerasLocalFinal, carrerasVisitanteFinal, inningsJugadosFinal, fecha_partido, hora || null, estadoFinal]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor', detalles: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
});


app.put('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido } = req.body;
        
        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ error: 'Equipo local, equipo visitante y fecha son requeridos' });
        }
        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ error: 'El equipo local y visitante deben ser diferentes' });
        }

        const equiposCheck = await pool.query('SELECT id FROM equipos WHERE id IN ($1, $2)', [equipo_local_id, equipo_visitante_id]);
        if (equiposCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Uno o ambos equipos no existen' });
        }

        const result = await pool.query(
            `UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2, carreras_local = $3, carreras_visitante = $4, innings_jugados = $5, fecha_partido = $6 WHERE id = $7 RETURNING *`,
            [equipo_local_id, equipo_visitante_id, carreras_local || null, carreras_visitante || null, innings_jugados || 9, fecha_partido, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM partidos WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        res.json({ message: 'Partido eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// ====================== ESTADÍSTICAS =========================

// ✅ CORRECCIÓN BUG #1: Handler para upsert de estadísticas OFENSIVAS (REEMPLAZA)
async function upsertEstadisticasOfensivas(req, res) {
    try {
        const { jugador_id, temporada, at_bats, hits, home_runs, rbi, runs, walks, stolen_bases } = req.body;
        if (!jugador_id) return res.status(400).json({ error: 'ID del jugador es requerido' });

        const ab = parseInt(at_bats || 0, 10), h = parseInt(hits || 0, 10);
        if (h > ab) return res.status(400).json({ error: 'Los hits no pueden ser mayores que los at-bats' });

        const temp = (temporada && String(temporada).trim()) ? String(temporada).trim() : '2025';
        console.log(`🔄 [UPSERT] Ofensiva para Jugador ID: ${jugador_id}, Temporada: ${temp}`);

        const result = await pool.query(`
            INSERT INTO estadisticas_ofensivas (jugador_id, temporada, at_bats, hits, home_runs, rbi, runs, walks, stolen_bases)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (jugador_id, temporada) DO UPDATE SET
                at_bats = EXCLUDED.at_bats,
                hits = EXCLUDED.hits,
                home_runs = EXCLUDED.home_runs,
                rbi = EXCLUDED.rbi,
                runs = EXCLUDED.runs,
                walks = EXCLUDED.walks,
                stolen_bases = EXCLUDED.stolen_bases
            RETURNING *;
        `, [jugador_id, temp, ab, h, parseInt(home_runs || 0, 10), parseInt(rbi || 0, 10), parseInt(runs || 0, 10), parseInt(walks || 0, 10), parseInt(stolen_bases || 0, 10)]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('❌ [ERROR] en upsert de estadísticas ofensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar estadísticas' });
    }
}
app.put('/api/estadisticas-ofensivas', upsertEstadisticasOfensivas);
app.post('/api/estadisticas-ofensivas', upsertEstadisticasOfensivas);


// ✅ CORRECCIÓN BUG #1: Handler para upsert de estadísticas de PITCHEO (REEMPLAZA)
async function upsertEstadisticasPitcheo(req, res) {
    try {
        const { jugador_id, temporada, innings_pitched, hits_allowed, earned_runs, strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves } = req.body;
        if (!jugador_id) return res.status(400).json({ error: 'ID del jugador es requerido' });
        
        const temp = (temporada && String(temporada).trim()) ? String(temporada).trim() : '2025';
        console.log(`🔄 [UPSERT] Pitcheo para Jugador ID: ${jugador_id}, Temporada: ${temp}`);

        const result = await pool.query(`
            INSERT INTO estadisticas_pitcheo (jugador_id, temporada, innings_pitched, hits_allowed, earned_runs, strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (jugador_id, temporada) DO UPDATE SET
                innings_pitched = EXCLUDED.innings_pitched,
                hits_allowed = EXCLUDED.hits_allowed,
                earned_runs = EXCLUDED.earned_runs,
                strikeouts = EXCLUDED.strikeouts,
                walks_allowed = EXCLUDED.walks_allowed,
                home_runs_allowed = EXCLUDED.home_runs_allowed,
                wins = EXCLUDED.wins,
                losses = EXCLUDED.losses,
                saves = EXCLUDED.saves
            RETURNING *;
        `, [jugador_id, temp, parseFloat(innings_pitched || 0.0), parseInt(hits_allowed || 0), parseInt(earned_runs || 0), parseInt(strikeouts || 0), parseInt(walks_allowed || 0), parseInt(home_runs_allowed || 0), parseInt(wins || 0), parseInt(losses || 0), parseInt(saves || 0)]);
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('❌ [ERROR] en upsert de estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}
app.post('/api/estadisticas-pitcheo', upsertEstadisticasPitcheo);
app.put('/api/estadisticas-pitcheo', upsertEstadisticasPitcheo);


app.get('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const { jugador_id, temporada, equipo_id, min_at_bats = 0 } = req.query;
        
        let query = `SELECT eo.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   CASE WHEN eo.at_bats > 0 THEN ROUND(eo.hits::DECIMAL / eo.at_bats, 3) ELSE 0.000 END as avg,
                   CASE WHEN eo.at_bats > 0 THEN ROUND((eo.hits + eo.walks)::DECIMAL / (eo.at_bats + eo.walks), 3) ELSE 0.000 END as obp,
                   CASE WHEN eo.at_bats > 0 THEN ROUND((eo.hits + eo.home_runs * 3)::DECIMAL / eo.at_bats, 3) ELSE 0.000 END as slg
                   FROM estadisticas_ofensivas eo
                   JOIN jugadores j ON eo.jugador_id = j.id
                   LEFT JOIN equipos e ON j.equipo_id = e.id
                   WHERE eo.at_bats >= $1`;
        const params = [min_at_bats];
        let paramIndex = 2;

        if(jugador_id) {
            query += ` AND eo.jugador_id = $${paramIndex++}`;
            params.push(jugador_id);
        }
        if (temporada) {
            query += ` AND eo.temporada = $${paramIndex++}`;
            params.push(temporada);
        }
        if (equipo_id) {
            query += ` AND j.equipo_id = $${paramIndex++}`;
            params.push(equipo_id);
        }

        query += ` ORDER BY avg DESC, eo.hits DESC`;
        const result = await pool.query(query, params);
        
        const jugadoresConOPS = result.rows.map(j => ({ ...j, ops: parseFloat((parseFloat(j.obp) + parseFloat(j.slg)).toFixed(3)) }));
        res.json(jugadoresConOPS);
    } catch (error) {
        console.error('Error obteniendo estadísticas ofensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const { jugador_id } = req.query;
        let query = `SELECT ep.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre,
                   CASE WHEN ep.innings_pitched > 0 THEN ROUND((ep.earned_runs * 9.0) / ep.innings_pitched, 2) ELSE 0.00 END as era,
                   CASE WHEN ep.innings_pitched > 0 THEN ROUND((ep.hits_allowed + ep.walks_allowed) / ep.innings_pitched, 2) ELSE 0.00 END as whip
                   FROM estadisticas_pitcheo ep
                   JOIN jugadores j ON ep.jugador_id = j.id
                   LEFT JOIN equipos e ON j.equipo_id = e.id`;
        const params = [];
        if (jugador_id) {
            query += ' WHERE ep.jugador_id = $1';
            params.push(jugador_id);
        }
        query += ' ORDER BY era ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const { jugador_id } = req.query;
        let query = `SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   CASE WHEN ed.chances > 0 THEN ROUND((ed.putouts + ed.assists)::DECIMAL / ed.chances, 3) ELSE 0.000 END as fielding_percentage
                   FROM estadisticas_defensivas ed
                   JOIN jugadores j ON ed.jugador_id = j.id
                   LEFT JOIN equipos e ON j.equipo_id = e.id`;
        const params = [];
        if (jugador_id) {
            query += ' WHERE ed.jugador_id = $1';
            params.push(jugador_id);
        }
        query += ' ORDER BY fielding_percentage DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// ... (RESTO DEL CÓDIGO: RUTAS HTML, OPTIMIZACIONES, INICIO DEL SERVIDOR, ETC. PERMANECEN IGUAL) ...

// ===============================================================
// =================== RUTAS DE ARCHIVOS HTML =================
// ===============================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/equipo.html', (req, res) => res.sendFile(path.join(__dirname, 'public/equipo.html')));
app.get('/public', (req, res) => res.sendFile(path.join(__dirname, 'public/public.html')));
app.get('/jugador.html', (req, res) => res.sendFile(path.join(__dirname, 'public/jugador.html')));


// ==================== OPTIMIZACIONES PARA RAILWAY ====================
app.use('/public/images/logos', express.static(path.join(__dirname, 'public/images/logos'), {
  maxAge: '7d', // Cache de 7 días para logos
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 días
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
}
verificarLogos();
console.log('🚀 Chogui League System optimizado para Railway');


// ===============================================================
// =================== MIDDLEWARE FINAL =========================
// ===============================================================
app.use(errorHandler);

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

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

startServer();
