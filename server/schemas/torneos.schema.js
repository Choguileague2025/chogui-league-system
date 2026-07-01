const { z } = require('zod');

const optionalInt = z.coerce.number().int().min(0);
const optionalPositiveInt = z.coerce.number().int().positive();
const optionalNonNegativeNumber = z.coerce.number().min(0);

const torneoCreateSchema = z.object({
    nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(120, 'El nombre es demasiado largo'),
    fecha_inicio: z.union([z.string().trim().min(1), z.literal('')]).optional(),
    total_juegos: optionalPositiveInt.optional(),
    cupos_playoffs: optionalPositiveInt.optional(),
    min_ab_rate_stats: optionalInt.optional(),
    min_ab_counting_stats: optionalInt.optional(),
    min_ab_mvp: optionalInt.optional(),
    min_ip_rate_stats: optionalNonNegativeNumber.optional(),
    min_ip_counting_stats: optionalNonNegativeNumber.optional(),
    min_ip_pitcher_award: optionalNonNegativeNumber.optional(),
    min_chances_defense: optionalInt.optional()
}).strict();

const torneoUpdateSchema = z.object({
    nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(120, 'El nombre es demasiado largo').optional(),
    total_juegos: optionalPositiveInt.optional(),
    cupos_playoffs: optionalPositiveInt.optional(),
    estado: z.enum(['preparacion', 'activo', 'finalizado', 'archivado']).optional(),
    visible_publico: z.union([z.boolean(), z.string(), z.number()]).optional(),
    min_ab_rate_stats: z.union([optionalInt, z.literal(''), z.null()]).optional(),
    min_ab_counting_stats: z.union([optionalInt, z.literal(''), z.null()]).optional(),
    min_ab_mvp: z.union([optionalInt, z.literal(''), z.null()]).optional(),
    min_ip_rate_stats: z.union([optionalNonNegativeNumber, z.literal(''), z.null()]).optional(),
    min_ip_counting_stats: z.union([optionalNonNegativeNumber, z.literal(''), z.null()]).optional(),
    min_ip_pitcher_award: z.union([optionalNonNegativeNumber, z.literal(''), z.null()]).optional(),
    min_chances_defense: z.union([optionalInt, z.literal(''), z.null()]).optional()
}).strict().refine((payload) => Object.keys(payload).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar'
});

module.exports = {
    torneoCreateSchema,
    torneoUpdateSchema
};
