const { z } = require('zod');

const playoffGameUpdateSchema = z.object({
    carreras_local: z.union([z.coerce.number().int().min(0), z.literal(''), z.null()]).optional(),
    carreras_visitante: z.union([z.coerce.number().int().min(0), z.literal(''), z.null()]).optional(),
    estado: z.enum(['programado', 'en_curso', 'finalizado', 'cancelado', 'pospuesto']).optional(),
    innings_jugados: z.coerce.number().int().min(1).max(20).optional(),
    mvp_jugador_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
    resumen: z.union([z.string().trim().max(1000), z.literal(''), z.null()]).optional()
}).strict();

module.exports = {
    playoffGameUpdateSchema
};
