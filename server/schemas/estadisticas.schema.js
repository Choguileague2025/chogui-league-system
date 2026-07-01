const { z } = require('zod');

const modeSchema = z.enum(['sum', 'replace']).optional();
const jugadorIdSchema = z.coerce.number().int().positive('Jugador inválido');
const optionalTournamentSchema = z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional()
    .transform((value) => (value === '' || value === undefined ? null : value));

const optionalNonNegativeInt = z.coerce.number().int().min(0);
const optionalNonNegativeNumber = z.coerce.number().min(0);

const ofensivasSchema = z.object({
    jugador_id: jugadorIdSchema,
    torneo_id: optionalTournamentSchema,
    at_bats: optionalNonNegativeInt.optional(),
    hits: optionalNonNegativeInt.optional(),
    home_runs: optionalNonNegativeInt.optional(),
    rbi: optionalNonNegativeInt.optional(),
    runs: optionalNonNegativeInt.optional(),
    walks: optionalNonNegativeInt.optional(),
    stolen_bases: optionalNonNegativeInt.optional(),
    strikeouts: optionalNonNegativeInt.optional(),
    doubles: optionalNonNegativeInt.optional(),
    triples: optionalNonNegativeInt.optional(),
    caught_stealing: optionalNonNegativeInt.optional(),
    hit_by_pitch: optionalNonNegativeInt.optional(),
    sacrifice_flies: optionalNonNegativeInt.optional(),
    sacrifice_hits: optionalNonNegativeInt.optional(),
    mode: modeSchema
}).strict();

const pitcheoSchema = z.object({
    jugador_id: jugadorIdSchema,
    torneo_id: optionalTournamentSchema,
    innings_pitched: optionalNonNegativeNumber.optional(),
    hits_allowed: optionalNonNegativeInt.optional(),
    earned_runs: optionalNonNegativeInt.optional(),
    strikeouts: optionalNonNegativeInt.optional(),
    walks_allowed: optionalNonNegativeInt.optional(),
    home_runs_allowed: optionalNonNegativeInt.optional(),
    wins: optionalNonNegativeInt.optional(),
    losses: optionalNonNegativeInt.optional(),
    saves: optionalNonNegativeInt.optional(),
    mode: modeSchema
}).strict();

const defensivasSchema = z.object({
    jugador_id: jugadorIdSchema,
    torneo_id: optionalTournamentSchema,
    putouts: optionalNonNegativeInt.optional(),
    assists: optionalNonNegativeInt.optional(),
    errors: optionalNonNegativeInt.optional(),
    double_plays: optionalNonNegativeInt.optional(),
    passed_balls: optionalNonNegativeInt.optional(),
    chances: optionalNonNegativeInt.optional(),
    mode: modeSchema
}).strict();

module.exports = {
    ofensivasSchema,
    pitcheoSchema,
    defensivasSchema
};
