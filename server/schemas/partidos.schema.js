const { z } = require('zod');

const ESTADOS_VALIDOS = ['programado', 'en_curso', 'finalizado', 'cancelado', 'pospuesto'];

const nullableScore = z.union([z.coerce.number().int().min(0), z.literal(''), z.null()]).optional();

const partidoBaseSchema = z.object({
    equipo_local_id: z.coerce.number().int().positive('Equipo local invalido'),
    equipo_visitante_id: z.coerce.number().int().positive('Equipo visitante invalido'),
    carreras_local: nullableScore,
    carreras_visitante: nullableScore,
    innings_jugados: z.coerce.number().int().min(1).max(20).optional(),
    fecha_partido: z.string().trim().min(1, 'Fecha del partido requerida'),
    hora: z.union([z.string().trim().max(20), z.literal(''), z.null()]).optional(),
    estado: z.enum(ESTADOS_VALIDOS).optional(),
    torneo_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional()
}).strict().refine((payload) => payload.equipo_local_id !== payload.equipo_visitante_id, {
    message: 'El equipo local y visitante deben ser diferentes',
    path: ['equipo_visitante_id']
});

const partidoCreateSchema = partidoBaseSchema;
const partidoUpdateSchema = partidoBaseSchema;

const optionalNullableIntField = z.union([z.coerce.number().int().min(0), z.literal(''), z.null()]).optional();
const optionalNullableNumberField = z.union([z.coerce.number().min(0), z.literal(''), z.null()]).optional();

const boxscoreOfensivaRowSchema = z.object({
    jugador_id: z.coerce.number().int().positive('Jugador ofensivo inválido'),
    equipo_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
    batting_order: z.union([z.coerce.number().int().min(1).max(30), z.literal(''), z.null()]).optional(),
    plate_appearances: optionalNullableIntField,
    at_bats: optionalNullableIntField,
    hits: optionalNullableIntField,
    singles: optionalNullableIntField,
    doubles: optionalNullableIntField,
    triples: optionalNullableIntField,
    home_runs: optionalNullableIntField,
    rbi: optionalNullableIntField,
    runs: optionalNullableIntField,
    walks: optionalNullableIntField,
    strikeouts: optionalNullableIntField,
    stolen_bases: optionalNullableIntField,
    caught_stealing: optionalNullableIntField,
    hit_by_pitch: optionalNullableIntField,
    sacrifice_flies: optionalNullableIntField,
    sacrifice_hits: optionalNullableIntField
}).strict();

const boxscorePitcheoRowSchema = z.object({
    jugador_id: z.coerce.number().int().positive('Jugador pitcher inválido'),
    equipo_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
    innings_pitched: optionalNullableNumberField,
    hits_allowed: optionalNullableIntField,
    earned_runs: optionalNullableIntField,
    strikeouts: optionalNullableIntField,
    walks_allowed: optionalNullableIntField,
    home_runs_allowed: optionalNullableIntField,
    wins: optionalNullableIntField,
    losses: optionalNullableIntField,
    saves: optionalNullableIntField
}).strict();

const boxscoreDefensaRowSchema = z.object({
    jugador_id: z.coerce.number().int().positive('Jugador defensivo inválido'),
    equipo_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
    posicion: z.union([z.string().trim().max(10), z.literal(''), z.null()]).optional(),
    putouts: optionalNullableIntField,
    assists: optionalNullableIntField,
    errors: optionalNullableIntField,
    double_plays: optionalNullableIntField,
    passed_balls: optionalNullableIntField,
    chances: optionalNullableIntField
}).strict();

const boxscoreSchema = z.object({
    ofensiva: z.array(boxscoreOfensivaRowSchema).optional(),
    pitcheo: z.array(boxscorePitcheoRowSchema).optional(),
    defensa: z.array(boxscoreDefensaRowSchema).optional()
}).strict();

module.exports = {
    partidoCreateSchema,
    partidoUpdateSchema,
    boxscoreSchema
};
