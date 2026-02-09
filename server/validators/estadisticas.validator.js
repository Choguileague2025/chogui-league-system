/**
 * Validators para Estadísticas
 */

function validarJugadorId(jugador_id) {
    if (!jugador_id || isNaN(parseInt(jugador_id))) {
        return { isValid: false, error: 'ID de jugador requerido y válido' };
    }
    return { isValid: true, value: parseInt(jugador_id) };
}

function validarStatsOfensivas(body) {
    const errors = [];
    const { jugador_id, torneo_id } = body;

    const jugadorValidation = validarJugadorId(jugador_id);
    if (!jugadorValidation.isValid) {
        errors.push(jugadorValidation.error);
    }

    // Valores numéricos: sanitizar a enteros, default 0
    const numericFields = [
        'at_bats', 'hits', 'home_runs', 'rbi', 'runs', 'walks',
        'stolen_bases', 'strikeouts', 'doubles', 'triples',
        'caught_stealing', 'hit_by_pitch', 'sacrifice_flies', 'sacrifice_hits'
    ];

    const sanitized = {
        jugador_id: jugadorValidation.value,
        torneo_id: torneo_id ? parseInt(torneo_id) : null
    };

    numericFields.forEach(field => {
        const val = parseInt(body[field]) || 0;
        if (val < 0) {
            errors.push(`${field} no puede ser negativo`);
        }
        sanitized[field] = val;
    });

    return {
        isValid: errors.length === 0,
        errors,
        sanitized
    };
}

function validarStatsPitcheo(body) {
    const errors = [];
    const { jugador_id, torneo_id } = body;

    const jugadorValidation = validarJugadorId(jugador_id);
    if (!jugadorValidation.isValid) {
        errors.push(jugadorValidation.error);
    }

    const sanitized = {
        jugador_id: jugadorValidation.value,
        torneo_id: torneo_id ? parseInt(torneo_id) : null,
        innings_pitched: parseFloat(body.innings_pitched) || 0,
        hits_allowed: parseInt(body.hits_allowed) || 0,
        earned_runs: parseInt(body.earned_runs) || 0,
        strikeouts: parseInt(body.strikeouts) || 0,
        walks_allowed: parseInt(body.walks_allowed) || 0,
        home_runs_allowed: parseInt(body.home_runs_allowed) || 0,
        wins: parseInt(body.wins) || 0,
        losses: parseInt(body.losses) || 0,
        saves: parseInt(body.saves) || 0
    };

    return {
        isValid: errors.length === 0,
        errors,
        sanitized
    };
}

function validarStatsDefensivas(body) {
    const errors = [];
    const { jugador_id, torneo_id } = body;

    const jugadorValidation = validarJugadorId(jugador_id);
    if (!jugadorValidation.isValid) {
        errors.push(jugadorValidation.error);
    }

    const sanitized = {
        jugador_id: jugadorValidation.value,
        torneo_id: torneo_id ? parseInt(torneo_id) : null,
        putouts: parseInt(body.putouts) || 0,
        assists: parseInt(body.assists) || 0,
        errors: parseInt(body.errors) || 0,
        double_plays: parseInt(body.double_plays) || 0,
        passed_balls: parseInt(body.passed_balls) || 0,
        chances: parseInt(body.chances) || 0
    };

    return {
        isValid: errors.length === 0,
        errors: errors,
        sanitized
    };
}

module.exports = {
    validarJugadorId,
    validarStatsOfensivas,
    validarStatsPitcheo,
    validarStatsDefensivas
};
