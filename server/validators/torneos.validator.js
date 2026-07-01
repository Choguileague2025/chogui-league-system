/**
 * Validators para Torneos
 */
const { DEFAULT_TOTAL_GAMES, DEFAULT_PLAYOFF_SLOTS } = require('../utils/playoffFormat');

function validarCrearTorneo(body) {
    const errors = [];
    const {
        nombre,
        total_juegos,
        cupos_playoffs,
        min_ab_rate_stats,
        min_ab_counting_stats,
        min_ab_mvp,
        min_ip_rate_stats,
        min_ip_counting_stats,
        min_ip_pitcher_award,
        min_chances_defense
    } = body;

    if (!nombre || nombre.trim().length < 3) {
        errors.push('El nombre del torneo debe tener al menos 3 caracteres');
    }

    if (total_juegos !== undefined) {
        const totalJuegosNum = parseInt(total_juegos, 10);
        if (isNaN(totalJuegosNum) || totalJuegosNum <= 0) {
            errors.push('El total de juegos debe ser un número positivo');
        }
    }

    if (cupos_playoffs !== undefined) {
        const cuposPlayoffsNum = parseInt(cupos_playoffs, 10);
        if (isNaN(cuposPlayoffsNum) || cuposPlayoffsNum <= 0) {
            errors.push('Los cupos de playoffs deben ser un número positivo');
        }
    }

    const validateIntField = (value, label) => {
        if (value === undefined || value === null || value === '') return;
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed < 0) {
            errors.push(`${label} debe ser un número entero igual o mayor a 0`);
        }
    };

    const validateDecimalField = (value, label) => {
        if (value === undefined || value === null || value === '') return;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
            errors.push(`${label} debe ser un número igual o mayor a 0`);
        }
    };

    validateIntField(min_ab_rate_stats, 'Min AB métricas rate');
    validateIntField(min_ab_counting_stats, 'Min AB métricas acumulativas');
    validateIntField(min_ab_mvp, 'Min AB MVP');
    validateDecimalField(min_ip_rate_stats, 'Min IP métricas rate');
    validateDecimalField(min_ip_counting_stats, 'Min IP métricas acumulativas');
    validateDecimalField(min_ip_pitcher_award, 'Min IP premio pitcher');
    validateIntField(min_chances_defense, 'Min chances defensa');

    return {
        isValid: errors.length === 0,
        errors,
        sanitized: {
            nombre: nombre ? nombre.trim() : null,
            total_juegos: total_juegos ? parseInt(total_juegos, 10) : DEFAULT_TOTAL_GAMES,
            cupos_playoffs: cupos_playoffs ? parseInt(cupos_playoffs, 10) : DEFAULT_PLAYOFF_SLOTS,
            min_ab_rate_stats: min_ab_rate_stats !== undefined && min_ab_rate_stats !== '' ? parseInt(min_ab_rate_stats, 10) : null,
            min_ab_counting_stats: min_ab_counting_stats !== undefined && min_ab_counting_stats !== '' ? parseInt(min_ab_counting_stats, 10) : null,
            min_ab_mvp: min_ab_mvp !== undefined && min_ab_mvp !== '' ? parseInt(min_ab_mvp, 10) : null,
            min_ip_rate_stats: min_ip_rate_stats !== undefined && min_ip_rate_stats !== '' ? Number(min_ip_rate_stats) : null,
            min_ip_counting_stats: min_ip_counting_stats !== undefined && min_ip_counting_stats !== '' ? Number(min_ip_counting_stats) : null,
            min_ip_pitcher_award: min_ip_pitcher_award !== undefined && min_ip_pitcher_award !== '' ? Number(min_ip_pitcher_award) : null,
            min_chances_defense: min_chances_defense !== undefined && min_chances_defense !== '' ? parseInt(min_chances_defense, 10) : null
        }
    };
}

function validarActualizarTorneo(body) {
    const errors = [];
    const {
        nombre,
        total_juegos,
        cupos_playoffs,
        estado,
        visible_publico,
        min_ab_rate_stats,
        min_ab_counting_stats,
        min_ab_mvp,
        min_ip_rate_stats,
        min_ip_counting_stats,
        min_ip_pitcher_award,
        min_chances_defense
    } = body;
    const fields = [];
    const values = [];
    const estadosPermitidos = ['preparacion', 'activo', 'finalizado', 'archivado'];

    if (nombre !== undefined) {
        if (nombre.trim().length < 3) {
            errors.push('El nombre debe tener al menos 3 caracteres');
        } else {
            fields.push('nombre');
            values.push(nombre.trim());
        }
    }

    if (total_juegos !== undefined) {
        const totalJuegosNum = parseInt(total_juegos, 10);
        if (isNaN(totalJuegosNum) || totalJuegosNum <= 0) {
            errors.push('Total de juegos debe ser un número positivo');
        } else {
            fields.push('total_juegos');
            values.push(totalJuegosNum);
        }
    }

    if (cupos_playoffs !== undefined) {
        const cuposPlayoffsNum = parseInt(cupos_playoffs, 10);
        if (isNaN(cuposPlayoffsNum) || cuposPlayoffsNum <= 0) {
            errors.push('Cupos de playoffs debe ser un número positivo');
        } else {
            fields.push('cupos_playoffs');
            values.push(cuposPlayoffsNum);
        }
    }

    if (estado !== undefined) {
        if (!estadosPermitidos.includes(String(estado).trim().toLowerCase())) {
            errors.push(`Estado no válido. Use: ${estadosPermitidos.join(', ')}`);
        } else {
            fields.push('estado');
            values.push(String(estado).trim().toLowerCase());
        }
    }

    if (visible_publico !== undefined) {
        const visibleNormalizado = typeof visible_publico === 'string'
            ? visible_publico.trim().toLowerCase() === 'true'
            : Boolean(visible_publico);
        fields.push('visible_publico');
        values.push(visibleNormalizado);
    }

    const pushNullableInt = (field, value, label) => {
        if (value === undefined) return;
        if (value === null || value === '') {
            fields.push(field);
            values.push(null);
            return;
        }
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed < 0) {
            errors.push(`${label} debe ser un número entero igual o mayor a 0`);
            return;
        }
        fields.push(field);
        values.push(parsed);
    };

    const pushNullableDecimal = (field, value, label) => {
        if (value === undefined) return;
        if (value === null || value === '') {
            fields.push(field);
            values.push(null);
            return;
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
            errors.push(`${label} debe ser un número igual o mayor a 0`);
            return;
        }
        fields.push(field);
        values.push(parsed);
    };

    pushNullableInt('min_ab_rate_stats', min_ab_rate_stats, 'Min AB métricas rate');
    pushNullableInt('min_ab_counting_stats', min_ab_counting_stats, 'Min AB métricas acumulativas');
    pushNullableInt('min_ab_mvp', min_ab_mvp, 'Min AB MVP');
    pushNullableDecimal('min_ip_rate_stats', min_ip_rate_stats, 'Min IP métricas rate');
    pushNullableDecimal('min_ip_counting_stats', min_ip_counting_stats, 'Min IP métricas acumulativas');
    pushNullableDecimal('min_ip_pitcher_award', min_ip_pitcher_award, 'Min IP premio pitcher');
    pushNullableInt('min_chances_defense', min_chances_defense, 'Min chances defensa');

    if (errors.length === 0 && fields.length === 0) {
        errors.push('No se proporcionaron campos para actualizar');
    }

    return {
        isValid: errors.length === 0,
        errors,
        fields,
        values
    };
}

module.exports = {
    validarCrearTorneo,
    validarActualizarTorneo
};
