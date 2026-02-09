/**
 * Validators para Partidos
 */

const ESTADOS_VALIDOS = ['programado', 'en_curso', 'finalizado', 'cancelado', 'pospuesto'];

function validarCrearPartido(body) {
    const errors = [];
    const {
        equipo_local_id, equipo_visitante_id,
        carreras_local, carreras_visitante,
        innings_jugados, fecha_partido, hora, estado
    } = body;

    // Requeridos
    if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
        errors.push('Equipo local, equipo visitante y fecha son requeridos');
    }

    // No pueden ser el mismo equipo
    if (equipo_local_id && equipo_visitante_id && equipo_local_id === equipo_visitante_id) {
        errors.push('El equipo local y visitante deben ser diferentes');
    }

    // Carreras (opcionales, pero si se envían deben ser válidas)
    let carrerasLocalFinal = null;
    if (carreras_local !== null && carreras_local !== undefined && carreras_local !== '') {
        carrerasLocalFinal = parseInt(carreras_local);
        if (isNaN(carrerasLocalFinal) || carrerasLocalFinal < 0) {
            errors.push('Las carreras locales deben ser un número positivo');
        }
    }

    let carrerasVisitanteFinal = null;
    if (carreras_visitante !== null && carreras_visitante !== undefined && carreras_visitante !== '') {
        carrerasVisitanteFinal = parseInt(carreras_visitante);
        if (isNaN(carrerasVisitanteFinal) || carrerasVisitanteFinal < 0) {
            errors.push('Las carreras visitantes deben ser un número positivo');
        }
    }

    // Innings
    const inningsJugadosFinal = innings_jugados ? parseInt(innings_jugados) : 9;
    if (inningsJugadosFinal < 1 || inningsJugadosFinal > 20) {
        errors.push('Los innings jugados deben estar entre 1 y 20');
    }

    // Fecha
    if (fecha_partido) {
        const fechaPartidoDate = new Date(fecha_partido);
        const fechaMinima = new Date('2020-01-01');
        const fechaLimite = new Date();
        fechaLimite.setFullYear(fechaLimite.getFullYear() + 2);

        if (fechaPartidoDate < fechaMinima || fechaPartidoDate > fechaLimite) {
            errors.push('La fecha del partido debe estar entre 2020 y 2 años en el futuro');
        }
    }

    // Estado
    let estadoFinal;
    if (estado && ESTADOS_VALIDOS.includes(estado)) {
        estadoFinal = estado;
    } else {
        estadoFinal = (carrerasLocalFinal !== null && carrerasVisitanteFinal !== null)
            ? 'finalizado'
            : 'programado';
    }

    return {
        isValid: errors.length === 0,
        errors,
        sanitized: {
            equipo_local_id,
            equipo_visitante_id,
            carreras_local: carrerasLocalFinal,
            carreras_visitante: carrerasVisitanteFinal,
            innings_jugados: inningsJugadosFinal,
            fecha_partido,
            hora: hora || null,
            estado: estadoFinal
        }
    };
}

function validarActualizarPartido(body) {
    const errors = [];
    const {
        equipo_local_id, equipo_visitante_id,
        carreras_local, carreras_visitante,
        innings_jugados, fecha_partido, estado
    } = body;

    if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
        errors.push('Equipo local, equipo visitante y fecha son requeridos');
    }

    if (equipo_local_id && equipo_visitante_id && equipo_local_id === equipo_visitante_id) {
        errors.push('El equipo local y visitante deben ser diferentes');
    }

    const estadoFinal = (estado && ESTADOS_VALIDOS.includes(estado))
        ? estado
        : (carreras_local !== null && carreras_visitante !== null ? 'finalizado' : 'programado');

    return {
        isValid: errors.length === 0,
        errors,
        sanitized: {
            equipo_local_id,
            equipo_visitante_id,
            carreras_local: carreras_local || null,
            carreras_visitante: carreras_visitante || null,
            innings_jugados: innings_jugados || 9,
            fecha_partido,
            estado: estadoFinal
        }
    };
}

module.exports = {
    validarCrearPartido,
    validarActualizarPartido,
    ESTADOS_VALIDOS
};
