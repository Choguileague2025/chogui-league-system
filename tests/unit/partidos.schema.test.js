const { boxscoreSchema } = require('../../server/schemas/partidos.schema');

describe('esquema de boxscore', () => {
    test('interpreta orden al bate vacío o cero como no asignado', () => {
        for (const battingOrder of ['', 0, '0', null]) {
            const result = boxscoreSchema.safeParse({
                ofensiva: [{
                    jugador_id: 10,
                    equipo_id: 2,
                    batting_order: battingOrder,
                    at_bats: 3,
                    hits: 1
                }]
            });

            expect(result.success).toBe(true);
            expect(result.data.ofensiva[0].batting_order).toBeNull();
        }
    });

    test('mantiene un orden válido y rechaza valores fuera del rango', () => {
        const valid = boxscoreSchema.safeParse({
            ofensiva: [{ jugador_id: 10, batting_order: 4 }]
        });
        const invalid = boxscoreSchema.safeParse({
            ofensiva: [{ jugador_id: 10, batting_order: 31 }]
        });

        expect(valid.success).toBe(true);
        expect(valid.data.ofensiva[0].batting_order).toBe(4);
        expect(invalid.success).toBe(false);
    });
});
