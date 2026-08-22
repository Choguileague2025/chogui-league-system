const { z } = require('zod');

const optionalTournamentSchema = z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional();

const playoffBracketInitSchema = z.object({
    torneo_id: optionalTournamentSchema,
    force: z.boolean().optional()
}).strict();

const playoffGameUpdateSchema = z.object({
    carreras_local: z.union([z.coerce.number().int().min(0), z.literal(''), z.null()]).optional(),
    carreras_visitante: z.union([z.coerce.number().int().min(0), z.literal(''), z.null()]).optional(),
    estado: z.enum(['programado', 'en_curso', 'finalizado', 'cancelado', 'pospuesto']).optional(),
    innings_jugados: z.coerce.number().int().min(1).max(20).optional(),
    mvp_jugador_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
    resumen: z.union([z.string().trim().max(1000), z.literal(''), z.null()]).optional(),
    torneo_id: optionalTournamentSchema,
    equipo_local_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
    equipo_visitante_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
    seed_local: z.union([z.coerce.number().int().min(1).max(32), z.literal(''), z.null()]).optional(),
    seed_visitante: z.union([z.coerce.number().int().min(1).max(32), z.literal(''), z.null()]).optional(),
    fecha: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
    hora: z.union([z.string().trim().regex(/^\d{2}:\d{2}$/), z.literal(''), z.null()]).optional()
}).strict();

module.exports = {
    playoffBracketInitSchema,
    playoffGameUpdateSchema
};
