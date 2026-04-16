const pool = require('../config/database');
const { resolveTorneoId } = require('./torneos.service');

const DEFAULT_BRACKET = {
    nombre: 'Chogui League Playoffs 2026',
    fecha_inicio: '2026-04-19',
    fecha_final: '2026-04-26',
    games: [
        { slot: 'QF1', ronda: 'quarterfinal', orden: 1, seed_local: 1, local: 'Dominican Powers', seed_visitante: 8, visitante: 'Venarstone', fecha: '2026-04-19', hora: '14:15' },
        { slot: 'QF2', ronda: 'quarterfinal', orden: 2, seed_local: 4, local: 'Impulse', seed_visitante: 5, visitante: 'Team RD', fecha: '2026-04-19', hora: '10:45' },
        { slot: 'QF3', ronda: 'quarterfinal', orden: 3, seed_local: 2, local: 'Royals', seed_visitante: 7, visitante: 'Los Emilia', fecha: '2026-04-19', hora: '09:00' },
        { slot: 'QF4', ronda: 'quarterfinal', orden: 4, seed_local: 3, local: 'Tricolor', seed_visitante: 6, visitante: 'Llaneros', fecha: '2026-04-19', hora: '12:30' },
        { slot: 'SF1', ronda: 'semifinal', orden: 5, fecha: '2026-04-25', hora: '10:00' },
        { slot: 'SF2', ronda: 'semifinal', orden: 6, fecha: '2026-04-25', hora: '12:00' },
        { slot: 'F', ronda: 'final', orden: 7, fecha: '2026-04-26', hora: '11:00' }
    ]
};

const ADVANCEMENT = {
    QF1: { target: 'SF1', side: 'local' },
    QF2: { target: 'SF1', side: 'visitante' },
    QF3: { target: 'SF2', side: 'local' },
    QF4: { target: 'SF2', side: 'visitante' },
    SF1: { target: 'F', side: 'local' },
    SF2: { target: 'F', side: 'visitante' }
};

async function ensureSchema(client = pool) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS playoff_brackets (
            id SERIAL PRIMARY KEY,
            torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
            nombre VARCHAR(120) NOT NULL,
            fecha_inicio DATE NOT NULL,
            fecha_final DATE NOT NULL,
            estado VARCHAR(30) NOT NULL DEFAULT 'programado',
            campeon_equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
            campeon_nombre VARCHAR(120),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`
        CREATE TABLE IF NOT EXISTS playoff_games (
            id SERIAL PRIMARY KEY,
            bracket_id INTEGER NOT NULL REFERENCES playoff_brackets(id) ON DELETE CASCADE,
            ronda VARCHAR(30) NOT NULL,
            slot VARCHAR(12) NOT NULL,
            orden INTEGER NOT NULL DEFAULT 0,
            seed_local INTEGER,
            equipo_local_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
            equipo_local_nombre VARCHAR(120),
            seed_visitante INTEGER,
            equipo_visitante_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
            equipo_visitante_nombre VARCHAR(120),
            carreras_local INTEGER,
            carreras_visitante INTEGER,
            ganador_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
            ganador_nombre VARCHAR(120),
            fecha DATE,
            hora TIME,
            estado VARCHAR(30) NOT NULL DEFAULT 'programado',
            innings_jugados INTEGER DEFAULT 7,
            mvp_jugador_id INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
            resumen TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (bracket_id, slot)
        )
    `);
}

function normalizeName(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

async function findTeamByName(client, name) {
    if (!name) return null;
    const { rows } = await client.query('SELECT id, nombre FROM equipos');
    const target = normalizeName(name);
    return rows.find(team => normalizeName(team.nombre) === target) || null;
}

async function getActiveBracket(client = pool) {
    await ensureSchema(client);
    const torneoId = await resolveTorneoId(null);
    const params = [];
    let query = 'SELECT * FROM playoff_brackets';

    if (torneoId) {
        query += ' WHERE torneo_id = $1';
        params.push(torneoId);
    }

    query += ' ORDER BY id DESC LIMIT 1';
    const { rows } = await client.query(query, params);
    return rows[0] || null;
}

async function initializeDefaultBracket() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await ensureSchema(client);

        const torneoId = await resolveTorneoId(null);
        const existing = await getActiveBracket(client);
        if (existing) {
            await client.query('COMMIT');
            return existing;
        }

        const bracketResult = await client.query(`
            INSERT INTO playoff_brackets (torneo_id, nombre, fecha_inicio, fecha_final, estado)
            VALUES ($1, $2, $3, $4, 'programado')
            RETURNING *
        `, [torneoId, DEFAULT_BRACKET.nombre, DEFAULT_BRACKET.fecha_inicio, DEFAULT_BRACKET.fecha_final]);

        const bracket = bracketResult.rows[0];

        for (const game of DEFAULT_BRACKET.games) {
            const localTeam = await findTeamByName(client, game.local);
            const visitorTeam = await findTeamByName(client, game.visitante);

            await client.query(`
                INSERT INTO playoff_games (
                    bracket_id, ronda, slot, orden,
                    seed_local, equipo_local_id, equipo_local_nombre,
                    seed_visitante, equipo_visitante_id, equipo_visitante_nombre,
                    fecha, hora, estado
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'programado')
            `, [
                bracket.id, game.ronda, game.slot, game.orden,
                game.seed_local || null, localTeam?.id || null, localTeam?.nombre || game.local || null,
                game.seed_visitante || null, visitorTeam?.id || null, visitorTeam?.nombre || game.visitante || null,
                game.fecha, game.hora
            ]);
        }

        await client.query('COMMIT');
        return bracket;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function getBracket() {
    let bracket = await getActiveBracket();
    if (!bracket) {
        bracket = await initializeDefaultBracket();
    }

    const { rows: games } = await pool.query(`
        SELECT pg.*, mvp.nombre as mvp_nombre
        FROM playoff_games pg
        LEFT JOIN jugadores mvp ON pg.mvp_jugador_id = mvp.id
        WHERE pg.bracket_id = $1
        ORDER BY pg.orden ASC
    `, [bracket.id]);

    return {
        bracket,
        games,
        rounds: {
            quarterfinal: games.filter(game => game.ronda === 'quarterfinal'),
            semifinal: games.filter(game => game.ronda === 'semifinal'),
            final: games.filter(game => game.ronda === 'final')
        }
    };
}

function getWinner(game) {
    const localRuns = Number(game.carreras_local);
    const visitorRuns = Number(game.carreras_visitante);

    if (!Number.isFinite(localRuns) || !Number.isFinite(visitorRuns) || localRuns === visitorRuns) {
        return null;
    }

    if (localRuns > visitorRuns) {
        return {
            id: game.equipo_local_id,
            nombre: game.equipo_local_nombre,
            seed: game.seed_local
        };
    }

    return {
        id: game.equipo_visitante_id,
        nombre: game.equipo_visitante_nombre,
        seed: game.seed_visitante
    };
}

async function advanceWinner(client, game) {
    const winner = getWinner(game);
    if (!winner) return;

    await client.query(`
        UPDATE playoff_games
        SET ganador_id = $1, ganador_nombre = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
    `, [winner.id || null, winner.nombre, game.id]);

    const advancement = ADVANCEMENT[game.slot];
    if (!advancement) {
        await client.query(`
            UPDATE playoff_brackets
            SET campeon_equipo_id = $1, campeon_nombre = $2, estado = 'finalizado', updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [winner.id || null, winner.nombre, game.bracket_id]);
        return;
    }

    const prefix = advancement.side === 'local' ? 'local' : 'visitante';
    await client.query(`
        UPDATE playoff_games
        SET seed_${prefix} = $1,
            equipo_${prefix}_id = $2,
            equipo_${prefix}_nombre = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE bracket_id = $4 AND slot = $5
    `, [winner.seed || null, winner.id || null, winner.nombre, game.bracket_id, advancement.target]);
}

async function updateGame(gameId, data) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await ensureSchema(client);

        const carrerasLocal = data.carreras_local === '' || data.carreras_local == null ? null : parseInt(data.carreras_local, 10);
        const carrerasVisitante = data.carreras_visitante === '' || data.carreras_visitante == null ? null : parseInt(data.carreras_visitante, 10);
        const estado = data.estado || 'programado';
        const innings = data.innings_jugados ? parseInt(data.innings_jugados, 10) : 7;
        const mvpJugadorId = data.mvp_jugador_id ? parseInt(data.mvp_jugador_id, 10) : null;
        const resumen = data.resumen || null;

        if (estado === 'finalizado' && carrerasLocal === carrerasVisitante) {
            const error = new Error('Un juego finalizado no puede quedar empatado');
            error.statusCode = 400;
            throw error;
        }

        const result = await client.query(`
            UPDATE playoff_games
            SET carreras_local = $1,
                carreras_visitante = $2,
                estado = $3,
                innings_jugados = $4,
                mvp_jugador_id = $5,
                resumen = $6,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
            RETURNING *
        `, [carrerasLocal, carrerasVisitante, estado, innings, mvpJugadorId, resumen, gameId]);

        if (result.rows.length === 0) {
            const error = new Error('Juego de playoff no encontrado');
            error.statusCode = 404;
            throw error;
        }

        const game = result.rows[0];

        if (estado === 'finalizado') {
            await advanceWinner(client, game);
        }

        await client.query('COMMIT');
        return game;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    initializeDefaultBracket,
    getBracket,
    updateGame
};
