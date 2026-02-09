/**
 * Validators para Equipos
 */

function validarCrearEquipo(body) {
    const errors = [];
    const { nombre, manager, ciudad } = body;

    if (!nombre || !manager || !ciudad) {
        errors.push('Nombre, manager y ciudad son requeridos');
    } else {
        if (nombre.length < 2) errors.push('El nombre debe tener al menos 2 caracteres');
        if (manager.length < 2) errors.push('El manager debe tener al menos 2 caracteres');
        if (ciudad.length < 2) errors.push('La ciudad debe tener al menos 2 caracteres');
    }

    return {
        isValid: errors.length === 0,
        errors,
        sanitized: {
            nombre: nombre ? nombre.trim() : null,
            manager: manager ? manager.trim() : null,
            ciudad: ciudad ? ciudad.trim() : null
        }
    };
}

function validarActualizarEquipo(body) {
    const errors = [];
    const { nombre, manager, ciudad } = body;

    if (!nombre || !manager || !ciudad) {
        errors.push('Nombre, manager y ciudad son requeridos');
    } else {
        if (nombre.length < 2 || nombre.length > 100) {
            errors.push('El nombre debe tener entre 2 y 100 caracteres');
        }
        if (nombre.length > 100 || manager.length > 100 || ciudad.length > 100) {
            errors.push('Los campos no pueden exceder 100 caracteres');
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        sanitized: {
            nombre: nombre ? nombre.trim() : null,
            manager: manager ? manager.trim() : null,
            ciudad: ciudad ? ciudad.trim() : null
        }
    };
}

module.exports = {
    validarCrearEquipo,
    validarActualizarEquipo
};
