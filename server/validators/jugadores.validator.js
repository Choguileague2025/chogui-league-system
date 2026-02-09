/**
 * Validators para Jugadores
 */

const POSICIONES_VALIDAS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P', 'UTIL', 'DH'];

function validarCrearJugador(body) {
    const errors = [];
    const { nombre, equipo_id, posicion, numero } = body;

    // Nombre requerido
    if (!nombre || nombre.trim().length < 2 || nombre.trim().length > 100) {
        errors.push('El nombre debe tener entre 2 y 100 caracteres');
    }

    // Equipo (opcional pero si se envía debe ser válido)
    let equipoIdFinal = null;
    if (equipo_id !== undefined && equipo_id !== null && `${equipo_id}` !== '') {
        equipoIdFinal = parseInt(equipo_id, 10);
        if (Number.isNaN(equipoIdFinal)) {
            errors.push('Equipo inválido');
        }
    }

    // Posición (opcional pero si se envía debe ser válida)
    let posicionFinal = null;
    if (posicion !== undefined && posicion !== null && `${posicion}`.trim() !== '') {
        if (!POSICIONES_VALIDAS.includes(posicion)) {
            errors.push('Posición inválida. Debe ser una de: ' + POSICIONES_VALIDAS.join(', '));
        } else {
            posicionFinal = posicion;
        }
    }

    // Número (opcional pero si se envía debe ser válido)
    let numeroFinal = null;
    if (numero !== undefined && numero !== null && `${numero}` !== '') {
        numeroFinal = parseInt(numero, 10);
        if (Number.isNaN(numeroFinal) || numeroFinal < 0) {
            errors.push('Número inválido');
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        sanitized: {
            nombre: nombre ? nombre.trim() : null,
            equipo_id: equipoIdFinal,
            posicion: posicionFinal,
            numero: numeroFinal
        }
    };
}

function validarActualizarJugador(body) {
    const errors = [];
    const { nombre, equipo_id, posicion, numero } = body;

    if (!nombre || !equipo_id) {
        errors.push('Nombre y equipo son requeridos');
    }

    if (nombre && (nombre.length < 2 || nombre.length > 100)) {
        errors.push('El nombre debe tener entre 2 y 100 caracteres');
    }

    // Posición (se usa lista sin UTIL/DH para update, como en el original)
    const posicionesUpdate = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];
    if (posicion && !posicionesUpdate.includes(posicion)) {
        errors.push('Posición inválida. Debe ser una de: ' + posicionesUpdate.join(', '));
    }

    return {
        isValid: errors.length === 0,
        errors,
        sanitized: {
            nombre: nombre ? nombre.trim() : null,
            equipo_id: equipo_id ? parseInt(equipo_id, 10) : null,
            posicion: posicion || null,
            numero: numero || null
        }
    };
}

module.exports = {
    validarCrearJugador,
    validarActualizarJugador,
    POSICIONES_VALIDAS
};
