jest.mock('../../server/config/database', () => ({ query: jest.fn() }));

const { __testing } = require('../../server/services/campeones.service');
const { torneoUpdateSchema } = require('../../server/schemas/torneos.schema');
const { validarActualizarTorneo } = require('../../server/validators/torneos.validator');

describe('Elegibilidad de premios por modalidad', () => {
    test('bateo exige partidos y apariciones al plato sin premiar muestras menores', () => {
        const rows = [
            { jugador_nombre: 'Una jornada', at_bats: 12, avg: .900, plate_appearances: 12, juegos_bateo: 1 },
            { jugador_nombre: 'Nueve PA', at_bats: 9, avg: .800, plate_appearances: 9, juegos_bateo: 2 },
            { jugador_nombre: 'Elegible', at_bats: 8, walks: 2, avg: .500, plate_appearances: 10, juegos_bateo: 2 }
        ];
        const result = __testing.qualifyOffensiveRows(rows, { minGames: 2, minPlateAppearances: 10 });
        expect(result.qualified.map(row => row.jugador_nombre)).toEqual(['Elegible']);
        expect(__testing.qualifyOffensiveRows(rows.slice(0, 2), { minGames: 2, minPlateAppearances: 10 }).qualified).toEqual([]);
    });

    test('pitcher requiere actuaciones en tres partidos de Bola puesta', () => {
        const rows = [
            { jugador_nombre: 'Dos partidos', innings_pitched: 20, juegos_pitcheo: 2, era: 0 },
            { jugador_nombre: 'Tres partidos', innings_pitched: 6, juegos_pitcheo: 3, era: 2 }
        ];
        expect(__testing.qualifyPitchingRows(rows, { minGames: 3 }).qualified.map(row => row.jugador_nombre)).toEqual(['Tres partidos']);
    });

    test('defensa requiere partidos en la posición y oportunidades suficientes', () => {
        const rows = [
            { jugador_nombre: 'Una oportunidad', posicion: 'SS', juegos_defensa: 3, chances: 1, putouts: 1, assists: 0, errors: 0, fielding_percentage: 1 },
            { jugador_nombre: 'Dos partidos', posicion: 'SS', juegos_defensa: 2, chances: 12, putouts: 9, assists: 2, errors: 1, fielding_percentage: .917 },
            { jugador_nombre: 'Elegible', posicion: 'SS', juegos_defensa: 3, chances: 10, putouts: 7, assists: 2, errors: 1, fielding_percentage: .900 }
        ];
        const result = __testing.qualifyDefensiveRows(rows, { minGames: 3 });
        expect(result.threshold).toBe(5);
        expect(result.qualified.map(row => row.jugador_nombre)).toEqual(['Elegible']);
    });

    test('el administrador puede configurar y limpiar los mínimos nuevos', () => {
        const parsed = torneoUpdateSchema.parse({ min_partidos_premios: '2', min_pa_bateo: '10' });
        expect(validarActualizarTorneo(parsed).values).toEqual([2, 10]);
        const cleared = torneoUpdateSchema.parse({ min_partidos_premios: '', min_pa_bateo: '' });
        expect(validarActualizarTorneo(cleared).values).toEqual([null, null]);
    });
});
