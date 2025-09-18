const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();
const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
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
    
    // Ejecutar migraciones después de que el servidor esté funcionando
    runMigrations();
});
