const { z } = require('zod');

const optionalNullableText = z.union([z.string().trim().max(500), z.literal(''), z.null()]).optional()
    .transform((value) => (value === '' || value === undefined ? null : value));

const booleanLike = z.union([z.boolean(), z.string(), z.number()]).transform((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Boolean(value);
    return String(value).trim().toLowerCase() === 'true';
});

const ligaCreateSchema = z.object({
    nombre: z.string().trim().min(3, 'El nombre de la liga debe tener al menos 3 caracteres').max(120, 'El nombre de la liga es demasiado largo'),
    descripcion: optionalNullableText,
    activa: booleanLike.optional()
}).strict();

const ligaUpdateSchema = z.object({
    nombre: z.string().trim().min(3, 'El nombre de la liga debe tener al menos 3 caracteres').max(120, 'El nombre de la liga es demasiado largo').optional(),
    descripcion: optionalNullableText,
    activa: booleanLike.optional()
}).strict().refine((payload) => Object.keys(payload).length > 0, {
    message: 'No hay campos para actualizar'
});

const divisionCreateSchema = z.object({
    liga_id: z.coerce.number().int().positive('liga_id es obligatorio'),
    nombre: z.string().trim().min(2, 'El nombre de la division debe tener al menos 2 caracteres').max(120, 'El nombre de la division es demasiado largo'),
    descripcion: optionalNullableText
}).strict();

const divisionUpdateSchema = z.object({
    liga_id: z.coerce.number().int().positive().optional(),
    nombre: z.string().trim().min(2, 'El nombre de la division debe tener al menos 2 caracteres').max(120, 'El nombre de la division es demasiado largo').optional(),
    descripcion: optionalNullableText
}).strict().refine((payload) => Object.keys(payload).length > 0, {
    message: 'No hay campos para actualizar'
});

const clasificacionAssignSchema = z.object({
    liga_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional()
        .transform((value) => (value === '' || value === undefined ? null : value)),
    division_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional()
        .transform((value) => (value === '' || value === undefined ? null : value))
}).strict();

module.exports = {
    ligaCreateSchema,
    ligaUpdateSchema,
    divisionCreateSchema,
    divisionUpdateSchema,
    clasificacionAssignSchema
};
