const { z } = require('zod');

const requiredText = (label) => z.string()
    .trim()
    .min(2, `${label} debe tener al menos 2 caracteres`)
    .max(100, `${label} no puede exceder 100 caracteres`);

const equipoCreateSchema = z.object({
    nombre: requiredText('El nombre'),
    manager: requiredText('El manager'),
    ciudad: requiredText('La ciudad')
}).strict();

const equipoUpdateSchema = equipoCreateSchema;

module.exports = {
    equipoCreateSchema,
    equipoUpdateSchema
};
