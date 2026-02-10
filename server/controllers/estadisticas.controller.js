const { resolveTorneoId } = require('../services/torneos.service');
const estadisticasService = require('../services/estadisticas.service');
const { validarStatsOfensivas, validarStatsPitcheo, validarStatsDefensivas } = require('../validators/estadisticas.validator');

// ============================================================
// ESTADISTICAS OFENSIVAS
// ============================================================

// GET /api/estadisticas-ofensivas
async function obtenerOfensivas(req, res, next) {
    try {
        const { torneo_id, temporada, equipo_id, jugador_id, min_at_bats = 0 } = req.query;

        const result = await estadisticasService.obtenerOfensivas({
            torneo_id,
            equipo_id,
            jugador_id,
            min_at_bats
        });

        res.json(result);
    } catch (error) {
        console.error('Error obteniendo estadísticas ofensivas:', error);
        next(error);
    }
}

// POST/PUT /api/estadisticas-ofensivas (upsert con modo sum/replace)
async function upsertOfensivas(req, res, next) {
    try {
        const validation = validarStatsOfensivas(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { jugador_id, torneo_id, ...stats } = validation.sanitized;
        const mode = (req.body.mode || 'sum').toLowerCase();

        // Validar modo
        if (!['sum', 'replace'].includes(mode)) {
            return res.status(400).json({ error: 'Modo inválido. Use "sum" o "replace".' });
        }

        // Resolver torneo_id: directo, o desde torneo activo
        const torneoIdFinal = torneo_id || await resolveTorneoId(null);

        if (!torneoIdFinal) {
            return res.status(400).json({ error: 'No se pudo determinar el torneo. Envie torneo_id o active un torneo.' });
        }

        const result = await estadisticasService.actualizarOfensivas(jugador_id, torneoIdFinal, stats, mode);

        res.json({
            success: true,
            message: `Estadísticas ofensivas ${mode === 'sum' ? 'sumadas' : 'reemplazadas'} correctamente`,
            mode: result.mode,
            data: result.data,
            previous: result.previous
        });
    } catch (error) {
        console.error('Error en upsertEstadisticasOfensivas:', error);
        next(error);
    }
}

// ============================================================
// ESTADISTICAS PITCHEO
// ============================================================

// GET /api/estadisticas-pitcheo
async function obtenerPitcheo(req, res, next) {
    try {
        const { torneo_id, equipo_id, jugador_id } = req.query;

        const result = await estadisticasService.obtenerPitcheo({
            torneo_id,
            equipo_id,
            jugador_id
        });

        res.json(result);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        next(error);
    }
}

// GET /api/estadisticas-pitcheo/:id
async function obtenerPitcheoPorJugador(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;

        const result = await estadisticasService.obtenerPitcheoPorJugador(id, torneo_id);

        if (!result) {
            return res.status(404).json({ error: 'Estadísticas de pitcheo no encontradas' });
        }

        res.json(result);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        next(error);
    }
}

// POST /api/estadisticas-pitcheo (upsert con modo sum/replace)
async function crearPitcheo(req, res, next) {
    try {
        const validation = validarStatsPitcheo(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { jugador_id, torneo_id, ...stats } = validation.sanitized;
        const mode = (req.body.mode || 'sum').toLowerCase();

        if (!['sum', 'replace'].includes(mode)) {
            return res.status(400).json({ error: 'Modo inválido. Use "sum" o "replace".' });
        }

        const torneoIdFinal = torneo_id || await resolveTorneoId(null);

        if (!torneoIdFinal) {
            return res.status(400).json({ error: 'No se pudo determinar el torneo.' });
        }

        const result = await estadisticasService.actualizarPitcheo(jugador_id, torneoIdFinal, stats, mode);

        res.status(201).json({
            success: true,
            message: `Estadísticas de pitcheo ${mode === 'sum' ? 'sumadas' : 'reemplazadas'} correctamente`,
            mode: result.mode,
            data: result.data,
            previous: result.previous
        });
    } catch (error) {
        console.error('Error creando estadísticas de pitcheo:', error);
        next(error);
    }
}

// PUT /api/estadisticas-pitcheo (con modo sum/replace)
async function actualizarPitcheo(req, res, next) {
    try {
        const validation = validarStatsPitcheo(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { jugador_id, torneo_id, ...stats } = validation.sanitized;
        const mode = (req.body.mode || 'sum').toLowerCase();

        if (!['sum', 'replace'].includes(mode)) {
            return res.status(400).json({ error: 'Modo inválido. Use "sum" o "replace".' });
        }

        const torneoIdFinal = torneo_id || await resolveTorneoId(null);

        const result = await estadisticasService.actualizarPitcheo(jugador_id, torneoIdFinal, stats, mode);

        res.json({
            success: true,
            message: `Estadísticas de pitcheo ${mode === 'sum' ? 'sumadas' : 'reemplazadas'} correctamente`,
            mode: result.mode,
            data: result.data,
            previous: result.previous
        });
    } catch (error) {
        console.error('Error actualizando estadísticas de pitcheo:', error);
        next(error);
    }
}

// ============================================================
// ESTADISTICAS DEFENSIVAS
// ============================================================

// GET /api/estadisticas-defensivas
async function obtenerDefensivas(req, res, next) {
    try {
        const { torneo_id, equipo_id, jugador_id } = req.query;

        const result = await estadisticasService.obtenerDefensivas({
            torneo_id,
            equipo_id,
            jugador_id
        });

        res.json(result);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        next(error);
    }
}

// GET /api/estadisticas-defensivas/:id
async function obtenerDefensivasPorJugador(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;

        const result = await estadisticasService.obtenerDefensivasPorJugador(id, torneo_id);

        if (!result) {
            return res.status(404).json({ error: 'Estadísticas defensivas no encontradas' });
        }

        res.json(result);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        next(error);
    }
}

// POST /api/estadisticas-defensivas (upsert con modo sum/replace)
async function crearDefensivas(req, res, next) {
    try {
        const validation = validarStatsDefensivas(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { jugador_id, torneo_id, ...stats } = validation.sanitized;
        const mode = (req.body.mode || 'sum').toLowerCase();

        if (!['sum', 'replace'].includes(mode)) {
            return res.status(400).json({ error: 'Modo inválido. Use "sum" o "replace".' });
        }

        const torneoIdFinal = torneo_id || await resolveTorneoId(null);

        if (!torneoIdFinal) {
            return res.status(400).json({ error: 'No se pudo determinar el torneo.' });
        }

        const result = await estadisticasService.actualizarDefensivas(jugador_id, torneoIdFinal, stats, mode);

        res.status(201).json({
            success: true,
            message: `Estadísticas defensivas ${mode === 'sum' ? 'sumadas' : 'reemplazadas'} correctamente`,
            mode: result.mode,
            data: result.data,
            previous: result.previous
        });
    } catch (error) {
        console.error('Error creando estadísticas defensivas:', error);
        next(error);
    }
}

// PUT /api/estadisticas-defensivas (con modo sum/replace)
async function actualizarDefensivas(req, res, next) {
    try {
        const validation = validarStatsDefensivas(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { jugador_id, torneo_id, ...stats } = validation.sanitized;
        const mode = (req.body.mode || 'sum').toLowerCase();

        if (!['sum', 'replace'].includes(mode)) {
            return res.status(400).json({ error: 'Modo inválido. Use "sum" o "replace".' });
        }

        const torneoIdFinal = torneo_id || await resolveTorneoId(null);

        const result = await estadisticasService.actualizarDefensivas(jugador_id, torneoIdFinal, stats, mode);

        res.json({
            success: true,
            message: `Estadísticas defensivas ${mode === 'sum' ? 'sumadas' : 'reemplazadas'} correctamente`,
            mode: result.mode,
            data: result.data,
            previous: result.previous
        });
    } catch (error) {
        console.error('Error actualizando estadísticas defensivas:', error);
        next(error);
    }
}

module.exports = {
    resolveTorneoId,
    obtenerOfensivas,
    upsertOfensivas,
    obtenerPitcheo,
    obtenerPitcheoPorJugador,
    crearPitcheo,
    actualizarPitcheo,
    obtenerDefensivas,
    obtenerDefensivasPorJugador,
    crearDefensivas,
    actualizarDefensivas
};
