const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs'); // <-- ESTE ES EL ÚNICO CAMBIO
require('dotenv').config();
const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración CORS unificada
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

// Middlewares
app.use(express.json());
app.use(cookieParser());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Función para ejecutar migraciones de base de datos
async function runMigrations() {
    const fs = require('fs');
    
    const runSqlFile = async (fileName) => {
        try {
            const sqlPath = path.join(__dirname, fileName);
            if (fs.existsSync(sqlPath)) {
                const sql = fs.readFileSync(sqlPath, 'utf8');
                await pool.query(sql);
                console.log(`✅ Migración ${fileName} ejecutada correctamente`);
                
                const executedPath = path.join(__dirname, fileName.replace('.sql', '.executed.sql'));
                fs.renameSync(sqlPath, executedPath);
            }
        } catch (error) {
            console.error(`❌ Error ejecutando migración ${fileName}:`, error.message);
        }
    };

    await runSqlFile('setup-pitching-stats.sql');
    await runSqlFile('setup-offensive-stats.sql');
    await runSqlFile('setup-tournaments.sql');
    await runSqlFile('fix-temporada-length.sql'); 

    console.log('📄 Verificación de migraciones completada.');
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

// =================================================================
// ====================== RUTAS DE LA API ==========================
// =================================================================

// =================================================================
// ====================== AUTENTICACIÓN ============================
// =================================================================

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos' });
        }

        // 1. Buscar el usuario en la base de datos
        const userResult = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);

        if (userResult.rows.length === 0) {
            // Si el usuario no existe
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }

        const user = userResult.rows[0];

        // 2. Comparar la contraseña enviada con la encriptada en la DB
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // 3. Si la contraseña es correcta
            res.json({
                success: true,
                message: 'Login exitoso',
                user: {
                    username: user.username,
                    role: user.role
                }
            });
        } else {
            // 4. Si la contraseña es incorrecta
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }

    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});


// ====================== TORNEOS ======================
app.get('/api/torneos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM torneos ORDER BY fecha_inicio DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/torneos/activo', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM torneos WHERE activo = true LIMIT 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No hay ningún torneo activo' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/torneos', async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }
        const result = await pool.query(
            'INSERT INTO torneos (nombre) VALUES ($1) RETURNING *',
            [nombre]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un torneo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

app.put('/api/torneos/desactivar-todos', async (req, res) => {
    try {
        await pool.query('UPDATE torneos SET activo = false');
        res.json({ message: 'Todos los torneos han sido desactivados.' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/torneos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre } = req.body;
        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }
        const result = await pool.query(
            'UPDATE torneos SET nombre = $1 WHERE id = $2 RETURNING *',
            [nombre, id]
        );
         if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un torneo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

app.delete('/api/torneos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const torneo = await pool.query('SELECT * FROM torneos WHERE id = $1', [id]);
        if (torneo.rows.length > 0 && torneo.rows[0].activo) {
            return res.status(400).json({ error: 'No se puede eliminar un torneo activo.' });
        }
        const result = await pool.query('DELETE FROM torneos WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }
        res.json({ message: 'Torneo eliminado correctamente' });
    } catch (error) {
        if (error.code === '23503') {
             return res.status(400).json({ error: 'No se puede eliminar. Hay estadísticas asociadas a este torneo.' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== EQUIPOS ======================
app.get('/api/equipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM equipos ORDER BY id');
        res.json(result.rows);
    } catch (error) {
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

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
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un equipo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

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
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un equipo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

app.delete('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM equipos WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        res.json({ message: 'Equipo eliminado correctamente' });
    } catch (error) {
        if (error.code === '23503') {
            return res.status(400).json({ error: 'No se puede eliminar. Hay jugadores o partidos asociados.' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== JUGADORES ======================
app.get('/api/jugadores', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT j.*, e.nombre as equipo_nombre
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            ORDER BY j.equipo_id, j.nombre
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT j.*, e.nombre as equipo_nombre
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            WHERE j.id = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/jugadores', async (req, res) => {
    try {
        const { nombre, equipo_id, posicion, numero } = req.body;
        if (!nombre || !equipo_id) {
            return res.status(400).json({ error: 'Nombre y equipo son requeridos' });
        }
        const result = await pool.query(
            'INSERT INTO jugadores (nombre, equipo_id, posicion, numero) VALUES ($1, $2, $3, $4) RETURNING *',
            [nombre, equipo_id, posicion || null, numero || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
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
        const result = await pool.query(
            'UPDATE jugadores SET nombre = $1, equipo_id = $2, posicion = $3, numero = $4 WHERE id = $5 RETURNING *',
            [nombre, equipo_id, posicion || null, numero || null, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
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
        res.json({ message: 'Jugador eliminado correctamente' });
    } catch (error) {
        if (error.code === '23503') {
            return res.status(400).json({ error: 'No se puede eliminar. El jugador tiene estadísticas asociadas.' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== PARTIDOS ======================
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
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.id = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/partidos', async (req, res) => {
    try {
        const { equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido } = req.body;
        
        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ error: 'Equipo local, equipo visitante y fecha son requeridos' });
        }
        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ error: 'Los equipos local y visitante deben ser diferentes' });
        }
        
        const result = await pool.query(
            'INSERT INTO partidos (equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [equipo_local_id, equipo_visitante_id, carreras_local || null, carreras_visitante || null, innings_jugados || 9, fecha_partido]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido } = req.body;
        
        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ error: 'Equipo local, visitante y fecha son obligatorios' });
        }
        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ error: 'Los equipos local y visitante deben ser diferentes' });
        }
        
        const result = await pool.query(
            'UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2, carreras_local = $3, carreras_visitante = $4, innings_jugados = $5, fecha_partido = $6 WHERE id = $7 RETURNING *',
            [equipo_local_id, equipo_visitante_id, carreras_local === '' ? null : carreras_local, carreras_visitante === '' ? null : carreras_visitante, innings_jugados || 9, fecha_partido, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== ESTADÍSTICAS OFENSIVAS ======================
app.get('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT eo.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   CASE 
                       WHEN eo.at_bats = 0 THEN 0.000
                       ELSE (eo.hits::DECIMAL / eo.at_bats) 
                   END as avg
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON eo.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            ORDER BY eo.temporada DESC, avg DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/estadisticas-ofensivas/:jugadorId', async (req, res) => {
    try {
        const { jugadorId } = req.params;
        const result = await pool.query(`
            SELECT eo.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON eo.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE eo.jugador_id = $1
            ORDER BY eo.temporada DESC
        `, [jugadorId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas ofensivas no encontradas' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const {
            jugador_id, at_bats, hits, home_runs, rbi, 
            runs, walks, stolen_bases, temporada
        } = req.body;
        if (!jugador_id) {
            return res.status(400).json({ error: 'Jugador ID es requerido' });
        }
        
        if (!temporada || temporada === 'null' || temporada === 'NINGUNO') {
             return res.status(400).json({ error: 'No hay ningún torneo activo.' });
        }
        const activeTemporada = temporada;

        const existing = await pool.query(
            'SELECT id FROM estadisticas_ofensivas WHERE jugador_id = $1 AND temporada = $2',
            [parseInt(jugador_id), activeTemporada]
        );

        let result;
        if (existing.rows.length > 0) {
            result = await pool.query(`
                UPDATE estadisticas_ofensivas SET
                    at_bats = at_bats + $1,
                    hits = hits + $2,
                    home_runs = home_runs + $3,
                    rbi = rbi + $4,
                    runs = runs + $5,
                    walks = walks + $6,
                    stolen_bases = stolen_bases + $7,
                    fecha_registro = NOW()
                WHERE id = $8 RETURNING *
            `, [
                parseInt(at_bats) || 0,
                parseInt(hits) || 0,
                parseInt(home_runs) || 0,
                parseInt(rbi) || 0,
                parseInt(runs) || 0,
                parseInt(walks) || 0,
                parseInt(stolen_bases) || 0,
                existing.rows[0].id
            ]);
        } else {
            result = await pool.query(`
                INSERT INTO estadisticas_ofensivas (
                    jugador_id, at_bats, hits, home_runs, rbi, 
                    runs, walks, stolen_bases, temporada
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [
                parseInt(jugador_id),
                parseInt(at_bats) || 0,
                parseInt(hits) || 0,
                parseInt(home_runs) || 0,
                parseInt(rbi) || 0,
                parseInt(runs) || 0,
                parseInt(walks) || 0,
                parseInt(stolen_bases) || 0,
                activeTemporada
            ]);
        }
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});

app.put('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const {
            jugador_id, at_bats, hits, home_runs, rbi, 
            runs, walks, stolen_bases, temporada
        } = req.body;
        if (!jugador_id) {
            return res.status(400).json({ error: 'Jugador ID es requerido' });
        }
        if (!temporada || temporada === 'null' || temporada === 'NINGUNO') {
             return res.status(400).json({ error: 'No hay ningún torneo activo.' });
        }
        const activeTemporada = temporada;

        const result = await pool.query(`
            UPDATE estadisticas_ofensivas SET
                at_bats = $1,
                hits = $2,
                home_runs = $3,
                rbi = $4,
                runs = $5,
                walks = $6,
                stolen_bases = $7,
                fecha_registro = NOW()
            WHERE jugador_id = $8 AND temporada = $9 RETURNING * `, [
            parseInt(at_bats) || 0,
            parseInt(hits) || 0,
            parseInt(home_runs) || 0,
            parseInt(rbi) || 0,
            parseInt(runs) || 0,
            parseInt(walks) || 0,
            parseInt(stolen_bases) || 0,
            parseInt(jugador_id),
            activeTemporada
        ]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas no encontradas. Regístralas primero.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});

// ====================== ESTADÍSTICAS DE PITCHEO ======================
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const {
            jugador_id, innings_pitched, hits_allowed, earned_runs, strikeouts,
            walks_allowed, home_runs_allowed, wins, losses, saves, temporada
        } = req.body;
        if (!jugador_id) {
            return res.status(400).json({ error: 'Jugador ID es requerido' });
        }
        if (!temporada || temporada === 'null' || temporada === 'NINGUNO') {
             return res.status(400).json({ error: 'No hay ningún torneo activo.' });
        }
        const activeTemporada = temporada;

        const existing = await pool.query(
            'SELECT id FROM estadisticas_pitcheo WHERE jugador_id = $1 AND temporada = $2',
            [parseInt(jugador_id), activeTemporada]
        );
        let result;
        if (existing.rows.length > 0) {
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
            result = await pool.query(`
                INSERT INTO estadisticas_pitcheo (
                    jugador_id, innings_pitched, hits_allowed, earned_runs, strikeouts,
                    walks_allowed, home_runs_allowed, wins, losses, saves, temporada
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
                parseInt(saves) || 0,
                activeTemporada
            ]);
        }
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});

app.put('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const {
            jugador_id, innings_pitched, hits_allowed, earned_runs, strikeouts,
            walks_allowed, home_runs_allowed, wins, losses, saves, temporada
        } = req.body;
        if (!jugador_id) {
            return res.status(400).json({ error: 'Jugador ID es requerido' });
        }
        if (!temporada || temporada === 'null' || temporada === 'NINGUNO') {
             return res.status(400).json({ error: 'No hay ningún torneo activo.' });
        }
        const activeTemporada = temporada;

        const result = await pool.query(`
            UPDATE estadisticas_pitcheo SET
                innings_pitched = $1,
                hits_allowed = $2,
                earned_runs = $3,
                strikeouts = $4,
                walks_allowed = $5,
                home_runs_allowed = $6,
                wins = $7,
                losses = $8,
                saves = $9,
                fecha_registro = NOW()
            WHERE jugador_id = $10 AND temporada = $11 RETURNING *
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
            parseInt(jugador_id),
            activeTemporada
        ]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas no encontradas. Regístralas primero.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});

// ====================== ESTADÍSTICAS DEFENSIVAS ======================
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

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
            return res.status(400).json({ error: 'Jugador ID es requerido' });
        }
        if (!temporada || temporada === 'null' || temporada === 'NINGUNO') {
             return res.status(400).json({ error: 'No hay ningún torneo activo.' });
        }
        const activeTemporada = temporada;

        const existing = await pool.query(
            'SELECT id FROM estadisticas_defensivas WHERE jugador_id = $1 AND temporada = $2',
            [jugador_id, activeTemporada]
        );
        let result;
        if (existing.rows.length > 0) {
            result = await pool.query(`
                UPDATE estadisticas_defensivas SET
                    putouts = putouts + $1,
                    assists = assists + $2,
                    errors = errors + $3,
                    double_plays = double_plays + $4,
                    passed_balls = passed_balls + $5,
                    chances = chances + $6,
                    fecha_registro = NOW()
                WHERE id = $7 RETURNING *
            `, [
                parseInt(putouts) || 0,
                parseInt(assists) || 0,
                parseInt(errors) || 0,
                parseInt(double_plays) || 0,
                parseInt(passed_balls) || 0,
                parseInt(chances) || 0,
                existing.rows[0].id
            ]);
        } else {
            result = await pool.query(`
                INSERT INTO estadisticas_defensivas (
                    jugador_id, putouts, assists, errors, double_plays,
                    passed_balls, chances, temporada
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [
                parseInt(jugador_id),
                parseInt(putouts) || 0,
                parseInt(assists) || 0,
                parseInt(errors) || 0,
                parseInt(double_plays) || 0,
                parseInt(passed_balls) || 0,
                parseInt(chances) || 0,
                activeTemporada
            ]);
        }
        res.status(201).json(result.rows[0]);
    } catch (error) {
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
            return res.status(400).json({ error: 'Jugador ID es requerido' });
        }
        if (!temporada || temporada === 'null' || temporada === 'NINGUNO') {
             return res.status(400).json({ error: 'No hay ningún torneo activo.' });
        }
        const activeTemporada = temporada;
        
        const result = await pool.query(`
            UPDATE estadisticas_defensivas SET
                putouts = $1,
                assists = $2,
                errors = $3,
                double_plays = $4,
                passed_balls = $5,
                chances = $6,
                fecha_registro = NOW()
            WHERE jugador_id = $7 AND temporada = $8 RETURNING *
        `, [
            parseInt(putouts) || 0,
            parseInt(assists) || 0,
            parseInt(errors) || 0,
            parseInt(double_plays) || 0,
            parseInt(passed_balls) || 0,
            parseInt(chances) || 0,
            parseInt(jugador_id),
            activeTemporada
        ]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas no encontradas. Regístralas primero.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});

// ====================== LÍDERES (Rutas GET especializadas) ======================
app.get('/api/lideres-ofensivos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                j.nombre as jugador_nombre, e.nombre as equipo_nombre, j.posicion,
                eo.at_bats, eo.hits, eo.home_runs, eo.rbi, eo.runs, eo.walks, eo.stolen_bases,
                CASE 
                    WHEN eo.at_bats > 0 THEN (eo.hits::DECIMAL / eo.at_bats)
                    ELSE 0 
                END as avg,
                CASE 
                    WHEN (eo.at_bats + eo.walks) > 0 THEN (eo.hits + eo.walks)::DECIMAL / (eo.at_bats + eo.walks)
                    ELSE 0 
                END as obp,
                CASE 
                    WHEN eo.at_bats > 0 THEN (eo.hits + (eo.home_runs * 3))::DECIMAL / eo.at_bats
                    ELSE 0 
                END as slg,
                CASE 
                    WHEN (eo.at_bats + eo.walks) > 0 AND eo.at_bats > 0 THEN 
                        ((eo.hits + eo.walks)::DECIMAL / (eo.at_bats + eo.walks)) + 
                        ((eo.hits + (eo.home_runs * 3))::DECIMAL / eo.at_bats)
                    ELSE 0 
                END as ops
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON eo.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE eo.at_bats >= 10
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/lideres-defensivos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT j.nombre as jugador_nombre, e.nombre as equipo_nombre, j.posicion,
                   ed.putouts, ed.assists, ed.errors, ed.double_plays,
                   calcular_fielding_percentage(ed.putouts, ed.assists, ed.errors) as fielding_percentage,
                   (ed.putouts + ed.assists + ed.errors) as total_chances
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE (ed.putouts + ed.assists + ed.errors) >= 5
            ORDER BY j.posicion, fielding_percentage DESC, total_chances DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =================================================================
// ====================== RUTAS DE ARCHIVOS HTML ===================
// =================================================================

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

// =================================================================
// ====================== INICIAR SERVIDOR =========================
// =================================================================

app.listen(PORT, () => {
    console.log(`🚀 Servidor Chogui League corriendo en puerto ${PORT}`);
    console.log(`📱 Accede en: http://localhost:${PORT}`);
    console.log(`🔧 Modo: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️ APIs disponibles:`);
    console.log(`   - GET  /api/test (prueba de conexión)`);
    console.log(`   - POST /api/login`);
    console.log(`   - GET  /api/torneos`);
    console.log(`   - POST /api/torneos`);
    console.log(`   - PUT  /api/torneos/:id`);
    console.log(`   - PUT  /api/torneos/:id/activar`);
    console.log(`   - PUT  /api/torneos/desactivar-todos`);
    console.log(`   - DELETE /api/torneos/:id`);
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
    console.log(`   - GET  /api/estadisticas-ofensivas`);
    console.log(`   - GET  /api/estadisticas-ofensivas/:jugadorId`);
    console.log(`   - POST /api/estadisticas-ofensivas`);
    console.log(`   - PUT  /api/estadisticas-ofensivas`);
    console.log(`   - GET  /api/lideres-ofensivos`);
    console.log(`   - GET  /api/estadisticas-pitcheo`);
    console.log(`   - GET  /api/estadisticas-pitcheo/:jugadorId`);
    console.log(`   - POST /api/estadisticas-pitcheo`);
    console.log(`   - PUT  /api/estadisticas-pitcheo`);
    console.log(`   - GET  /api/estadisticas-defensivas`);
    console.log(`   - GET  /api/estadisticas-defensivas/:jugadorId`);
    console.log(`   - POST /api/estadisticas-defensivas`);
    console.log(`   - PUT  /api/estadisticas-defensivas`);
    console.log(`   - GET  /api/lideres-pitcheo`);
    console.log(`   - GET  /api/lideres-defensivos`);
    
    // Ejecutar migraciones después de que el servidor esté funcionando
    runMigrations();
});

// ... (El resto del archivo server.js se mantiene igual)
