const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();
const pool = require('./database');

const app = express();
// PUERTO CORREGIDO (eliminada la línea duplicada)
const PORT = process.env.PORT || 3000;

// Configuración CORS unificada (eliminado el bloque duplicado)
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:8080',
        'https://choguileague2025.github.io',
        'https://chogui-league-system-production.up.railway.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middlewares unificados (eliminado el express.json duplicado)
app.use(express.json());
app.use(cookieParser());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Función para ejecutar migraciones de base de datos
async function runMigrations() {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Leer el archivo SQL
        const sqlPath = path.join(__dirname, 'setup-pitching-stats.sql');
        
        if (fs.existsSync(sqlPath)) {
            const sql = fs.readFileSync(sqlPath, 'utf8');
            
            // Ejecutar el SQL
            await pool.query(sql);
            console.log('✅ Migraciones de estadísticas de pitcheo ejecutadas correctamente');
            
            // Opcional: renombrar el archivo para que no se ejecute de nuevo
            const executedPath = path.join(__dirname, 'setup-pitching-stats.executed.sql');
            fs.renameSync(sqlPath, executedPath);
            
        } else {
            console.log('📄 No hay migraciones pendientes');
        }
    } catch (error) {
        console.error('❌ Error ejecutando migraciones:', error.message);
    }
}

// Ruta de prueba de la base de datos
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as current_time');
        res.json({ 
            message: '🏆 Servidor Chogui League funcionando correctamente!',
            database: '✅ Conexión a PostgreSQL exitosa',
            timestamp: new Date().toISOString(),
            db_time: result.rows[0].current_time
        });
    } catch (error) {
        res.status(500).json({
            message: '🏆 Servidor funcionando',
            database: '❌ Error conectando a PostgreSQL',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ====================== EQUIPOS ======================
// Obtener todos los equipos
app.get('/api/equipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM equipos ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo equipos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener un equipo por ID
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

// Crear equipo
app.post('/api/equipos', async (req, res) => {
    try {
        const { nombre, manager, ciudad } = req.body;
        
        if (!nombre || !manager || !ciudad) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        const result = await pool.query(
            'INSERT INTO equipos (nombre, manager, ciudad, fecha_creacion) VALUES ($1, $2, $3, NOW()) RETURNING *',
            [nombre, manager, ciudad]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando equipo:', error);
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un equipo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

// Actualizar equipo
app.put('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, manager, ciudad } = req.body;
        
        if (!nombre || !manager || !ciudad) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        const result = await pool.query(
            'UPDATE equipos SET nombre = $1, manager = $2, ciudad = $3 WHERE id = $4 RETURNING *',
            [nombre, manager, ciudad, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando equipo:', error);
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un equipo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

// Eliminar equipo
app.delete('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que no tenga jugadores asociados
        const jugadores = await pool.query('SELECT COUNT(*) FROM jugadores WHERE equipo_id = $1', [id]);
        if (parseInt(jugadores.rows[0].count) > 0) {
            return res.status(400).json({ error: 'No se puede eliminar un equipo que tiene jugadores asociados. Elimina primero los jugadores.' });
        }

        // Verificar que no tenga partidos asociados
        const partidos = await pool.query('SELECT COUNT(*) FROM partidos WHERE equipo_local_id = $1 OR equipo_visitante_id = $1', [id]);
        if (parseInt(partidos.rows[0].count) > 0) {
            return res.status(400).json({ error: 'No se puede eliminar un equipo que tiene partidos registrados. Elimina primero los partidos.' });
        }

        const result = await pool.query('DELETE FROM equipos WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        res.json({ message: 'Equipo eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== JUGADORES ======================
// Obtener todos los jugadores
app.get('/api/jugadores', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT j.*, e.nombre as equipo_nombre
            FROM jugadores j
            JOIN equipos e ON j.equipo_id = e.id
            ORDER BY j.equipo_id, j.nombre
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo jugadores:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener un jugador por ID
app.get('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT j.*, e.nombre as equipo_nombre
            FROM jugadores j
            JOIN equipos e ON j.equipo_id = e.id
            WHERE j.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear jugador
app.post('/api/jugadores', async (req, res) => {
    try {
        const { nombre, equipo_id, posicion, numero } = req.body;
        
        if (!nombre || !equipo_id || !posicion) {
            return res.status(400).json({ error: 'Nombre, equipo y posición son requeridos' });
        }

        const result = await pool.query(
            'INSERT INTO jugadores (nombre, equipo_id, posicion, numero) VALUES ($1, $2, $3, $4) RETURNING *',
            [nombre, equipo_id, posicion, numero]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Actualizar jugador
app.put('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, equipo_id, posicion, numero } = req.body;
        
        if (!nombre || !equipo_id || !posicion) {
            return res.status(400).json({ error: 'Nombre, equipo y posición son requeridos' });
        }

        const result = await pool.query(
            'UPDATE jugadores SET nombre = $1, equipo_id = $2, posicion = $3, numero = $4 WHERE id = $5 RETURNING *',
            [nombre, equipo_id, posicion, numero, id]
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

// Eliminar jugador
app.delete('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM jugadores WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        res.json({ message: 'Jugador eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== PARTIDOS ======================
// Obtener todos los partidos
app.get('/api/partidos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, 
                   el.nombre as equipo_local_nombre,
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            ORDER BY p.fecha_partido DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo partidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener un partido por ID
app.get('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT p.*, 
                   el.nombre as equipo_local_nombre,
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
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

// Crear partido
app.post('/api/partidos', async (req, res) => {
    try {
        const { equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido } = req.body;
        
        if (!equipo_local_id || !equipo_visitante_id || carreras_local === undefined || carreras_visitante === undefined) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ error: 'Los equipos local y visitante deben ser diferentes' });
        }

        const result = await pool.query(
            'INSERT INTO partidos (equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados || 9, fecha_partido]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Actualizar partido
app.put('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido } = req.body;
        
        if (!equipo_local_id || !equipo_visitante_id || carreras_local === undefined || carreras_visitante === undefined) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ error: 'Los equipos local y visitante deben ser diferentes' });
        }

        const result = await pool.query(
            'UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2, carreras_local = $3, carreras_visitante = $4, innings_jugados = $5, fecha_partido = $6 WHERE id = $7 RETURNING *',
            [equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados || 9, fecha_partido, id]
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

// Eliminar partido
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
// ====================== ESTADÍSTICAS DE PITCHEO ======================
// Obtener todas las estadísticas de pitcheo
app.get('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ep.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   calcular_era(ep.earned_runs, ep.innings_pitched) as era,
                   calcular_whip(ep.hits_allowed, ep.walks_allowed, ep.innings_pitched) as whip
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            ORDER BY ep.temporada DESC, ep.innings_pitched DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener estadísticas de pitcheo por jugador
app.get('/api/estadisticas-pitcheo/:jugadorId', async (req, res) => {
    try {
        const { jugadorId } = req.params;
        const result = await pool.query(`
            SELECT ep.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   calcular_era(ep.earned_runs, ep.innings_pitched) as era,
                   calcular_whip(ep.hits_allowed, ep.walks_allowed, ep.innings_pitched) as whip
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ep.jugador_id = $1
            ORDER BY ep.temporada DESC
        `, [jugadorId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas de pitcheo no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear o actualizar estadísticas de pitcheo
// Crear o actualizar estadísticas de pitcheo
app.post('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const {
            jugador_id, innings_pitched, hits_allowed, earned_runs, strikeouts,
            walks_allowed, home_runs_allowed, wins, losses, saves
        } = req.body;
        
        console.log('Datos recibidos:', req.body);
        
        if (!jugador_id || innings_pitched === undefined) {
            return res.status(400).json({ error: 'Jugador ID e innings lanzados son requeridos' });
        }

        // Verificar si ya existen estadísticas para este jugador en esta temporada
        const existing = await pool.query(
            'SELECT id FROM estadisticas_pitcheo WHERE jugador_id = $1 AND temporada = $2',
            [parseInt(jugador_id), '2025']
        );

        let result;
        if (existing.rows.length > 0) {
            // Actualizar estadísticas existentes (sumar valores)
            result = await pool.query(`
                UPDATE estadisticas_pitcheo SET
                    innings_pitched = innings_pitched + $1,
                    hits_allowed = hits_allowed + $2,
                    earned_runs = earned_runs + $3,
                    strikeouts = strikeouts + $4,
                    walks_allowed = walks_allowed + $5,
                    home_runs_allowed = home_runs_allowed + $6,
                    wins = wins + $7,
                    losses = losses + $8,
                    saves = saves + $9,
                    fecha_registro = NOW()
                WHERE id = $10 RETURNING *
            `, [
                parseFloat(innings_pitched) || 0,
                parseInt(hits_allowed) || 0,
                parseInt(earned_runs) || 0,
                parseInt(strikeouts) || 0,
                parseInt(walks_allowed) || 0,
                parseInt(home_runs_allowed) || 0,
                parseInt(wins) || 0,
                parseInt(losses) || 0,
                parseInt(saves) || 0,
                existing.rows[0].id
            ]);
        } else {
            // Crear nuevas estadísticas
            result = await pool.query(`
                INSERT INTO estadisticas_pitcheo (
                    jugador_id, innings_pitched, hits_allowed, earned_runs, strikeouts,
                    walks_allowed, home_runs_allowed, wins, losses, saves
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
            `, [
                parseInt(jugador_id),
                parseFloat(innings_pitched) || 0,
                parseInt(hits_allowed) || 0,
                parseInt(earned_runs) || 0,
                parseInt(strikeouts) || 0,
                parseInt(walks_allowed) || 0,
                parseInt(home_runs_allowed) || 0,
                parseInt(wins) || 0,
                parseInt(losses) || 0,
                parseInt(saves) || 0
            ]);
        }
        
        console.log('Estadísticas registradas:', result.rows[0]);
        res.status(201).json(result.rows[0]);
        
    } catch (error) {
        console.error('Error registrando estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});

// ====================== ESTADÍSTICAS DEFENSIVAS ======================
// Obtener todas las estadísticas defensivas
app.get('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   calcular_fielding_percentage(ed.putouts, ed.assists, ed.errors) as fielding_percentage
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            ORDER BY ed.temporada DESC, j.posicion, j.nombre
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener estadísticas defensivas por jugador
app.get('/api/estadisticas-defensivas/:jugadorId', async (req, res) => {
    try {
        const { jugadorId } = req.params;
        const result = await pool.query(`
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   calcular_fielding_percentage(ed.putouts, ed.assists, ed.errors) as fielding_percentage
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ed.jugador_id = $1
            ORDER BY ed.temporada DESC
        `, [jugadorId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas defensivas no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear o actualizar estadísticas defensivas
// Crear o actualizar estadísticas defensivas
app.post('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const {
            jugador_id, putouts, assists, errors, double_plays,
            passed_balls, stolen_bases_against, caught_stealing, chances
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'Jugador ID es requerido' });
        }

        // Verificar si ya existen estadísticas para este jugador en esta temporada
        const existing = await pool.query(
            'SELECT id FROM estadisticas_defensivas WHERE jugador_id = $1 AND temporada = $2',
            [jugador_id, '2025']
        );

        let result;
        if (existing.rows.length > 0) {
            // Actualizar estadísticas existentes (sumar valores)
            result = await pool.query(`
                UPDATE estadisticas_defensivas SET
                    putouts = putouts + $2,
                    assists = assists + $3,
                    errors = errors + $4,
                    double_plays = double_plays + $5,
                    passed_balls = passed_balls + $6,
                    stolen_bases_against = stolen_bases_against + $7,
                    caught_stealing = caught_stealing + $8,
                    chances = chances + $9,
                    fecha_registro = NOW()
                WHERE id = $1 RETURNING *
            `, [
                existing.rows[0].id,
                parseInt(putouts) || 0,
                parseInt(assists) || 0,
                parseInt(errors) || 0,
                parseInt(double_plays) || 0,
                parseInt(passed_balls) || 0,
                0,
                0,
                parseInt(chances) || 0
            ]);
        } else {
            // Crear nuevas estadísticas
            result = await pool.query(`
                INSERT INTO estadisticas_defensivas (
                    jugador_id, putouts, assists, errors, double_plays,
                    passed_balls, stolen_bases_against, caught_stealing, chances
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [
                parseInt(jugador_id),
                parseInt(putouts) || 0,
                parseInt(assists) || 0,
                parseInt(errors) || 0,
                parseInt(double_plays) || 0,
                parseInt(passed_balls) || 0,
                0,
                0,
                parseInt(chances) || 0
            ]);
        }
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error registrando estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
// Obtener líderes de pitcheo
app.get('/api/lideres-pitcheo', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT j.nombre as jugador_nombre, e.nombre as equipo_nombre, j.posicion,
                   ep.wins, ep.losses, ep.saves, ep.innings_pitched, ep.strikeouts,
                   ep.earned_runs, ep.hits_allowed, ep.walks_allowed,
                   calcular_era(ep.earned_runs, ep.innings_pitched) as era,
                   calcular_whip(ep.hits_allowed, ep.walks_allowed, ep.innings_pitched) as whip,
                   CASE 
                       WHEN ep.innings_pitched > 0 
                       THEN ROUND((ep.strikeouts * 7.0) / ep.innings_pitched, 2)
                       ELSE 0 
                   END as k_per_7
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ep.innings_pitched >= 5
            ORDER BY era ASC, whip ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo líderes de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener líderes defensivos
app.get('/api/lideres-defensivos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT j.nombre as jugador_nombre, e.nombre as equipo_nombre, j.posicion,
                   ed.putouts, ed.assists, ed.errors, ed.double_plays,
                   calcular_fielding_percentage(ed.putouts, ed.assists, ed.errors) as fielding_percentage,
                   (ed.putouts + ed.assists) as total_chances
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE (ed.putouts + ed.assists + ed.errors) >= 5
            ORDER BY j.posicion, fielding_percentage DESC, total_chances DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo líderes defensivos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Rutas principales HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});

app.get('/public', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/public.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Chogui League corriendo en puerto ${PORT}`);
    console.log(`📱 Accede en: http://localhost:${PORT}`);
    console.log(`🔧 Modo: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️ APIs disponibles:`);
    console.log(`   - GET  /api/test (prueba de conexión)`);
    console.log(`   - GET  /api/equipos`);
    console.log(`   - GET  /api/equipos/:id`);
    console.log(`   - POST /api/equipos`);
    console.log(`   - PUT  /api/equipos/:id`);
    console.log(`   - DELETE /api/equipos/:id`);
    console.log(`   - GET  /api/jugadores`);
    console.log(`   - GET  /api/jugadores/:id`);
    console.log(`   - POST /api/jugadores`);
    console.log(`   - PUT  /api/jugadores/:id`);
    console.log(`   - DELETE /api/jugadores/:id`);
    console.log(`   - GET  /api/partidos`);
    console.log(`   - GET  /api/partidos/:id`);
    console.log(`   - POST /api/partidos`);
    console.log(`   - PUT  /api/partidos/:id`);
    console.log(`   - DELETE /api/partidos/:id`);
    console.log(`   - GET  /api/estadisticas-pitcheo`);
    console.log(`   - POST /api/estadisticas-pitcheo`);
    console.log(`   - GET  /api/estadisticas-defensivas`);
    console.log(`   - POST /api/estadisticas-defensivas`);
    console.log(`   - GET  /api/lideres-pitcheo`);
    console.log(`   - GET  /api/lideres-defensivos`);
    
    // Ejecutar migraciones después de que el servidor esté funcionando
    runMigrations();
});
