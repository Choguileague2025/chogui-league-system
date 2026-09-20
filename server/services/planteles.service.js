const pool = require('../config/database');
const cache = require('../utils/cache');

function fail(message, statusCode = 400) {
    throw Object.assign(new Error(message), { statusCode });
}
function id(value, label = 'ID') {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(`${label} inválido`);
    return parsed;
}
async function editable(client, torneoId) {
    const result = await client.query('SELECT * FROM torneos WHERE id = $1 FOR UPDATE', [id(torneoId, 'Torneo')]);
    if (!result.rows.length) fail('Torneo no encontrado', 404);
    if (['finalizado', 'archivado'].includes(result.rows[0].estado)) fail('El torneo está finalizado: su plantel e historial están protegidos', 409);
    return result.rows[0];
}
async function transaction(work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        cache.clear();
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23503') err = Object.assign(new Error('El equipo o jugador no existe, o tiene inscripciones que deben conservarse'), { statusCode: 409 });
        throw err;
    } finally { client.release(); }
}
async function equipos(torneoId, client = pool) {
    const result = await client.query(`SELECT e.* FROM equipos e JOIN torneo_equipos te ON te.equipo_id = e.id WHERE te.torneo_id = $1 ORDER BY e.nombre`, [id(torneoId)]);
    return result.rows;
}
async function jugadores(torneoId, equipoId, client = pool) {
    const result = await client.query(`SELECT j.*, tj.equipo_id, tj.numero, tj.posicion, tj.origen, e.nombre AS equipo_nombre
        FROM torneo_jugadores tj JOIN jugadores j ON j.id = tj.jugador_id JOIN equipos e ON e.id = tj.equipo_id
        WHERE tj.torneo_id = $1 ${equipoId ? 'AND tj.equipo_id = $2' : ''} ORDER BY j.nombre`, equipoId ? [id(torneoId), id(equipoId)] : [id(torneoId)]);
    return result.rows;
}
async function inscribirEquipo(torneoId, equipoId) {
    return transaction(async client => {
        await editable(client, torneoId);
        await client.query('INSERT INTO torneo_equipos(torneo_id, equipo_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id(torneoId), id(equipoId)]);
        return equipos(torneoId, client);
    });
}
async function requireEquipo(client, torneoId, equipoId) {
    const result = await client.query('SELECT 1 FROM torneo_equipos WHERE torneo_id = $1 AND equipo_id = $2', [id(torneoId), id(equipoId)]);
    if (!result.rows.length) fail('El equipo no está inscrito en este torneo', 409);
}
async function requireJugador(client, torneoId, jugadorId, equipoId) {
    const result = await client.query('SELECT * FROM torneo_jugadores WHERE torneo_id = $1 AND jugador_id = $2', [id(torneoId), id(jugadorId)]);
    if (!result.rows.length || (equipoId && Number(result.rows[0].equipo_id) !== Number(equipoId))) fail('El jugador no pertenece al plantel de ese equipo en este torneo', 409);
    return result.rows[0];
}
async function tieneActividad(client, torneoId, jugadorId) {
    const result = await client.query(`SELECT EXISTS (
        SELECT 1 FROM partido_jugador_ofensiva b JOIN partidos p ON p.id=b.partido_id WHERE p.torneo_id=$1 AND b.jugador_id=$2
        UNION ALL SELECT 1 FROM partido_jugador_pitcheo b JOIN partidos p ON p.id=b.partido_id WHERE p.torneo_id=$1 AND b.jugador_id=$2
        UNION ALL SELECT 1 FROM partido_jugador_defensa b JOIN partidos p ON p.id=b.partido_id WHERE p.torneo_id=$1 AND b.jugador_id=$2
        UNION ALL SELECT 1 FROM estadisticas_ofensivas WHERE torneo_id=$1 AND jugador_id=$2 AND (at_bats+hits+runs+walks+home_runs+rbi+stolen_bases+COALESCE(strikeouts,0)+COALESCE(hit_by_pitch,0)+COALESCE(sacrifice_flies,0)+COALESCE(sacrifice_hits,0))>0
        UNION ALL SELECT 1 FROM estadisticas_pitcheo WHERE torneo_id=$1 AND jugador_id=$2 AND (innings_pitched+hits_allowed+earned_runs+strikeouts+walks_allowed+home_runs_allowed+wins+losses+saves)>0
        UNION ALL SELECT 1 FROM estadisticas_defensivas WHERE torneo_id=$1 AND jugador_id=$2 AND (putouts+assists+errors+double_plays+passed_balls+chances)>0
    ) AS actividad`, [torneoId, jugadorId]);
    if (result.rows[0].actividad) return true;
    const exists = await client.query("SELECT to_regclass('public.playoff_games') AS tabla");
    if (!exists.rows[0].tabla) return false;
    const playoff = await client.query('SELECT 1 FROM playoff_games g JOIN playoff_brackets b ON b.id=g.bracket_id WHERE b.torneo_id=$1 AND g.mvp_jugador_id=$2 LIMIT 1',[torneoId,jugadorId]);
    return playoff.rows.length > 0;
}
async function guardarJugador(client, torneoId, jugadorId, body) {
    await editable(client, torneoId);
    const equipoId = id(body.equipo_id, 'Equipo');
    await requireEquipo(client, torneoId, equipoId);
    const existing = await client.query('SELECT * FROM torneo_jugadores WHERE torneo_id=$1 AND jugador_id=$2', [torneoId, jugadorId]);
    if (existing.rows[0] && Number(existing.rows[0].equipo_id) !== equipoId && await tieneActividad(client, torneoId, jugadorId)) fail('No se puede cambiar de equipo a un jugador con actividad en este torneo', 409);
    const numero = body.numero === '' || body.numero == null ? null : Number(body.numero);
    if (numero !== null && (!Number.isInteger(numero) || numero < 0)) fail('Número inválido');
    const posicion = body.posicion || null;
    if (posicion && !['C','1B','2B','3B','SS','SF','LF','CF','RF','P','UTIL','DH'].includes(posicion)) fail('Posición inválida');
    const duplicate = await client.query('SELECT 1 FROM torneo_jugadores WHERE torneo_id=$1 AND equipo_id=$2 AND numero=$3 AND jugador_id<>$4', [torneoId, equipoId, numero, jugadorId]);
    if (duplicate.rows.length) fail('Ese número ya está asignado en el plantel de este torneo', 409);
    const result = await client.query(`INSERT INTO torneo_jugadores(torneo_id,jugador_id,equipo_id,numero,posicion)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (torneo_id,jugador_id) DO UPDATE SET equipo_id=EXCLUDED.equipo_id,numero=EXCLUDED.numero,posicion=EXCLUDED.posicion RETURNING *`, [torneoId,id(jugadorId),equipoId,numero,posicion]);
    for (const table of ['estadisticas_ofensivas','estadisticas_pitcheo','estadisticas_defensivas']) {
        await client.query(`INSERT INTO ${table}(torneo_id,jugador_id) VALUES ($1,$2) ON CONFLICT (jugador_id,torneo_id) DO NOTHING`, [torneoId,jugadorId]);
    }
    return result.rows[0];
}
async function inscribirJugador(torneoId, jugadorId, body) {
    return transaction(client => guardarJugador(client, id(torneoId), id(jugadorId), body));
}
async function retirarJugador(torneoId, jugadorId) {
    return transaction(async client => {
        await editable(client, torneoId);
        if (await tieneActividad(client, torneoId, jugadorId)) fail('El jugador tiene actividad en este torneo y debe conservarse en el historial',409);
        for (const tabla of ['estadisticas_ofensivas','estadisticas_pitcheo','estadisticas_defensivas']) await client.query(`DELETE FROM ${tabla} WHERE torneo_id=$1 AND jugador_id=$2`,[id(torneoId),id(jugadorId)]);
        await client.query('DELETE FROM torneo_jugadores WHERE torneo_id=$1 AND jugador_id=$2',[id(torneoId),id(jugadorId)]);
        return { success:true };
    });
}
async function retirarEquipo(torneoId, equipoId) {
    return transaction(async client => {
        await editable(client, torneoId);
        const used = await client.query('SELECT 1 FROM partidos WHERE torneo_id=$1 AND (equipo_local_id=$2 OR equipo_visitante_id=$2)', [id(torneoId),id(equipoId)]);
        if (used.rows.length) fail('El equipo tiene partidos en este torneo',409);
        const exists = await client.query("SELECT to_regclass('public.playoff_games') AS tabla");
        if (exists.rows[0].tabla) {
            const playoffs = await client.query('SELECT 1 FROM playoff_games g JOIN playoff_brackets b ON b.id=g.bracket_id WHERE b.torneo_id=$1 AND (g.equipo_local_id=$2 OR g.equipo_visitante_id=$2) LIMIT 1',[torneoId,equipoId]);
            if (playoffs.rows.length) fail('El equipo participa en los playoffs de este torneo',409);
        }
        await client.query('DELETE FROM torneo_equipos WHERE torneo_id=$1 AND equipo_id=$2',[id(torneoId),id(equipoId)]);
        return {success:true};
    });
}
module.exports = { id, fail, editable, transaction, equipos, jugadores, inscribirEquipo, inscribirJugador, guardarJugador, retirarJugador, retirarEquipo, requireEquipo, requireJugador };
