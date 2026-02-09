/**
 * Validators para Torneos
 */

function validarCrearTorneo(body) {
    const errors = [];
    const { nombre, total_juegos, cupos_playoffs } = body;

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

    return {
        isValid: errors.length === 0,
        errors,
        sanitized: {
            nombre: nombre ? nombre.trim() : null,
            total_juegos: total_juegos ? parseInt(total_juegos, 10) : 22,
            cupos_playoffs: cupos_playoffs ? parseInt(cupos_playoffs, 10) : 6
        }
    };
}

function validarActualizarTorneo(body) {
    const errors = [];
    const { nombre, total_juegos, cupos_playoffs } = body;
    const fields = [];
    const values = [];

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
