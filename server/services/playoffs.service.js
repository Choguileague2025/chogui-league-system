const pool = require('../config/database');
const { resolveTorneoId } = require('./torneos.service');
const { normalizePlayoffFormat } = require('../utils/playoffFormat');

const DEFAULT_BRACKET = {
    nombre: 'Playoffs',
    games: [
        { slot: 'QF1', ronda: 'quarterfinal', orden: 1, seed_local: 1, seed_visitante: 8, hora: '14:15' },
        { slot: 'QF2', ronda: 'quarterfinal', orden: 2, seed_local: 4, seed_visitante: 5, hora: '10:45' },
        { slot: 'QF3', ronda: 'quarterfinal', orden: 3, seed_local: 2, seed_visitante: 7, hora: '09:00' },
        { slot: 'QF4', ronda: 'quarterfinal', orden: 4, seed_local: 3, seed_visitante: 6, hora: '12:30' },
        { slot: 'SF1', ronda: 'semifinal', orden: 5, hora: '10:00' },
        { slot: 'SF2', ronda: 'semifinal', orden: 6, hora: '12:00' },
        { slot: 'F', ronda: 'final', orden: 7, hora: '11:00' }
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

async function findTeamByName(client, name, torneoId) {
    if (!name) return null;
    const { rows } = await client.query(
        'SELECT e.id, e.nombre FROM equipos e JOIN torneo_equipos te ON te.equipo_id = e.id WHERE te.torneo_id = $1',
        [torneoId]
    );
    const target = normalizeName(name);
    return rows.find(team => normalizeName(team.nombre) === target) || null;
}

function normalizeTournamentIdInput(torneoId) {
    const parsed = Number(torneoId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function getTournamentMeta(client, torneoId) {
    if (!torneoId) return null;
    const { rows } = await client.query(`
        SELECT id, nombre, fecha_inicio, total_juegos, cupos_playoffs
        FROM torneos
        WHERE id = $1
        LIMIT 1
    `, [torneoId]);
    return rows[0] || null;
}

async function getTournamentSeeds(client, torneoId, slotCount = 8) {
    if (!torneoId) return [];
    const normalizedSlots = Number.isFinite(Number(slotCount)) && Number(slotCount) > 0
        ? Number(slotCount)
        : 8;
    const { rows } = await client.query(`
        WITH torneo_teams AS (
            SELECT equipo_id FROM torneo_equipos WHERE torneo_id = $1
        ),
        resultados AS (
            SELECT
                p.equipo_local_id AS equipo_id,
                CASE WHEN p.estado = 'finalizado' AND p.carreras_local > p.carreras_visitante THEN 1 ELSE 0 END AS win,
                CASE WHEN p.estado = 'finalizado' AND p.carreras_local < p.carreras_visitante THEN 1 ELSE 0 END AS loss,
                CASE WHEN p.estado = 'finalizado' THEN COALESCE(p.carreras_local, 0) ELSE 0 END AS cf,
                CASE WHEN p.estado = 'finalizado' THEN COALESCE(p.carreras_visitante, 0) ELSE 0 END AS ce
            FROM partidos p
            WHERE p.torneo_id = $1
            UNION ALL
            SELECT
                p.equipo_visitante_id AS equipo_id,
                CASE WHEN p.estado = 'finalizado' AND p.carreras_visitante > p.carreras_local THEN 1 ELSE 0 END AS win,
                CASE WHEN p.estado = 'finalizado' AND p.carreras_visitante < p.carreras_local THEN 1 ELSE 0 END AS loss,
                CASE WHEN p.estado = 'finalizado' THEN COALESCE(p.carreras_visitante, 0) ELSE 0 END AS cf,
                CASE WHEN p.estado = 'finalizado' THEN COALESCE(p.carreras_local, 0) ELSE 0 END AS ce
            FROM partidos p
            WHERE p.torneo_id = $1
        )
        SELECT
            e.id,
            e.nombre,
            COALESCE(SUM(r.win), 0)::int AS wins,
            COALESCE(SUM(r.loss), 0)::int AS losses,
            COALESCE(SUM(r.cf), 0)::int AS cf,
            COALESCE(SUM(r.ce), 0)::int AS ce
        FROM torneo_teams tt
        JOIN equipos e ON e.id = tt.equipo_id
        LEFT JOIN resultados r ON r.equipo_id = e.id
        GROUP BY e.id, e.nombre
        ORDER BY
            COALESCE(SUM(r.win), 0) DESC,
            (COALESCE(SUM(r.cf), 0) - COALESCE(SUM(r.ce), 0)) DESC,
            COALESCE(SUM(r.cf), 0) DESC,
            e.nombre ASC
        LIMIT $2
    `, [torneoId, normalizedSlots]);

    return rows.map((row, index) => ({
        id: row.id,
        nombre: row.nombre,
        seed: index + 1
    }));
}

function buildBracketTemplate({ torneo, seeds = [] } = {}) {
    const normalized = normalizePlayoffFormat({
        totalJuegos: torneo?.total_juegos,
        cuposPlayoffs: torneo?.cupos_playoffs,
        teamCount: seeds.length,
        tournamentName: torneo?.nombre
    });
    const slotCount = normalized.cuposPlayoffs || 8;
    const quarterDate = torneo?.fecha_inicio
        ? (torneo.fecha_inicio instanceof Date ? torneo.fecha_inicio.toISOString() : String(torneo.fecha_inicio)).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const semifinalDate = quarterDate;
    const finalDate = quarterDate;
    const teamBySeed = new Map(seeds.map(team => [team.seed, team]));

    return {
        nombre: torneo?.nombre ? `${torneo.nombre} - Playoffs` : DEFAULT_BRACKET.nombre,
        fecha_inicio: quarterDate,
        fecha_final: finalDate,
        games: DEFAULT_BRACKET.games.map((game) => {
            const localTeam = teamBySeed.get(game.seed_local);
            const visitorTeam = teamBySeed.get(game.seed_visitante);
            const fecha = game.ronda === 'quarterfinal'
                ? quarterDate
                : game.ronda === 'semifinal'
                    ? semifinalDate
                    : finalDate;

            return {
                ...game,
                fecha,
                local: localTeam?.nombre || null,
                visitante: visitorTeam?.nombre || null
            };
        }),
        slotCount
    };
}

async function getActiveBracket(client = pool, torneoIdInput = null) {
    await ensureSchema(client);
    const torneoId = normalizeTournamentIdInput(torneoIdInput) || await resolveTorneoId(null);
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

async function initializeDefaultBracket(torneoIdInput = null, options = {}) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await ensureSchema(client);

        const torneoId = await require('./torneos.service').resolveTorneoEscritura(torneoIdInput);
        await require('./planteles.service').editable(client, torneoId);
        const force = options && options.force === true;
        const existing = await getActiveBracket(client, torneoId);
        if (existing) {
            if (force) {
                await client.query('DELETE FROM playoff_brackets WHERE id = $1', [existing.id]);
            } else {
                await client.query('COMMIT');
                return existing;
            }
        }

        const torneo = await getTournamentMeta(client, torneoId);
        const seeds = await getTournamentSeeds(client, torneoId, torneo?.cupos_playoffs || 8);
        const bracketTemplate = buildBracketTemplate({ torneo, seeds });

        const bracketResult = await client.query(`
            INSERT INTO playoff_brackets (torneo_id, nombre, fecha_inicio, fecha_final, estado)
            VALUES ($1, $2, $3, $4, 'programado')
            RETURNING *
        `, [torneoId, bracketTemplate.nombre, bracketTemplate.fecha_inicio, bracketTemplate.fecha_final]);

        const bracket = bracketResult.rows[0];

        for (const game of bracketTemplate.games) {
            const localTeam = await findTeamByName(client, game.local, torneoId);
            const visitorTeam = await findTeamByName(client, game.visitante, torneoId);

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

async function getBracket(torneoIdInput = null) {
    const torneoId = normalizeTournamentIdInput(torneoIdInput) || await resolveTorneoId(null);
    let bracket = await getActiveBracket(pool, torneoId);
    if (!bracket) {
        return null;
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

        const stored = await client.query(
            'SELECT pg.*, pb.torneo_id FROM playoff_games pg JOIN playoff_brackets pb ON pb.id = pg.bracket_id WHERE pg.id = $1',
            [gameId]
        );
        if (!stored.rows.length) require('./planteles.service').fail('Juego de playoff no encontrado', 404);
        const original = stored.rows[0];
        await require('./planteles.service').editable(client, original.torneo_id);
        const carrerasLocal = data.carreras_local === '' || data.carreras_local == null ? null : parseInt(data.carreras_local, 10);
        const carrerasVisitante = data.carreras_visitante === '' || data.carreras_visitante == null ? null : parseInt(data.carreras_visitante, 10);
        const estado = data.estado === 'en_vivo' ? 'en_curso' : (data.estado || 'programado');
        const innings = data.innings_jugados ? parseInt(data.innings_jugados, 10) : 7;
        const mvpJugadorId = data.mvp_jugador_id ? parseInt(data.mvp_jugador_id, 10) : null;
        const resumen = data.resumen || null;
        const equipoLocalId = data.equipo_local_id === '' || data.equipo_local_id == null ? null : parseInt(data.equipo_local_id, 10);
        const equipoVisitanteId = data.equipo_visitante_id === '' || data.equipo_visitante_id == null ? null : parseInt(data.equipo_visitante_id, 10);
        const seedLocal = data.seed_local === '' || data.seed_local == null ? null : parseInt(data.seed_local, 10);
        const seedVisitante = data.seed_visitante === '' || data.seed_visitante == null ? null : parseInt(data.seed_visitante, 10);
        const fecha = data.fecha === '' || data.fecha == null ? null : data.fecha;
        const hora = data.hora === '' || data.hora == null ? null : data.hora;

        let equipoLocalNombre = null;
        let equipoVisitanteNombre = null;

        if (equipoLocalId) {
            const localResult = await client.query('SELECT id, nombre FROM equipos WHERE id = $1 LIMIT 1', [equipoLocalId]);
            if (!localResult.rows.length) {
                const error = new Error('Equipo local no encontrado');
                error.statusCode = 400;
                throw error;
            }
            equipoLocalNombre = localResult.rows[0].nombre;
        }

        if (equipoVisitanteId) {
            const visitanteResult = await client.query('SELECT id, nombre FROM equipos WHERE id = $1 LIMIT 1', [equipoVisitanteId]);
            if (!visitanteResult.rows.length) {
                const error = new Error('Equipo visitante no encontrado');
                error.statusCode = 400;
                throw error;
            }
            equipoVisitanteNombre = visitanteResult.rows[0].nombre;
        }

        if (equipoLocalId && equipoVisitanteId && equipoLocalId === equipoVisitanteId) {
            const error = new Error('El equipo local y visitante no pueden ser el mismo');
            error.statusCode = 400;
            throw error;
        }

        const planteles = require('./planteles.service');
        if (equipoLocalId) await planteles.requireEquipo(client, original.torneo_id, equipoLocalId);
        if (equipoVisitanteId) await planteles.requireEquipo(client, original.torneo_id, equipoVisitanteId);
        if (mvpJugadorId) {
            const member = await planteles.requireJugador(client, original.torneo_id, mvpJugadorId);
            const equiposDelJuego = [equipoLocalId, equipoVisitanteId]
                .filter(Boolean)
                .map(Number);
            if (!equiposDelJuego.includes(Number(member.equipo_id))) {
                planteles.fail('El MVP no pertenece a los equipos del partido', 409);
            }
        }

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
                equipo_local_id = $7,
                equipo_local_nombre = $8,
                equipo_visitante_id = $9,
                equipo_visitante_nombre = $10,
                seed_local = $11,
                seed_visitante = $12,
                fecha = $13,
                hora = $14,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $15
            RETURNING *
        `, [
            carrerasLocal,
            carrerasVisitante,
            estado,
            innings,
            mvpJugadorId,
            resumen,
            equipoLocalId,
            equipoLocalNombre,
            equipoVisitanteId,
            equipoVisitanteNombre,
            seedLocal,
            seedVisitante,
            fecha,
            hora,
            gameId
        ]);

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
