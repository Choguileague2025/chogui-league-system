const { z } = require('zod');

const posiciones = ['C', '1B', '2B', '3B', 'SS', 'SF', 'LF', 'CF', 'RF', 'P', 'UTIL', 'DH'];

const optionalPosition = z.union([z.enum(posiciones), z.literal(''), z.null()]).optional()
    .transform((value) => (value === '' ? null : value ?? null));

const optionalNumber = z.union([z.coerce.number().int().min(0), z.literal(''), z.null()]).optional()
    .transform((value) => (value === '' || value === undefined ? null : value));

const optionalTeamId = z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional()
    .transform((value) => (value === '' || value === undefined ? null : value));

const jugadorCreateSchema = z.object({
    nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'El nombre no puede exceder 100 caracteres'),
    equipo_id: optionalTeamId,
    posicion: optionalPosition,
    numero: optionalNumber
}).strict();

const jugadorUpdateSchema = z.object({
    nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'El nombre no puede exceder 100 caracteres'),
    equipo_id: z.coerce.number().int().positive('Equipo inválido'),
    posicion: optionalPosition,
    numero: optionalNumber
}).strict();

module.exports = {
    jugadorCreateSchema,
    jugadorUpdateSchema
};
