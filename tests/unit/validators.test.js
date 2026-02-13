/**
 * Tests unitarios para todos los validators
 */

const { validarCrearEquipo, validarActualizarEquipo } = require('../../server/validators/equipos.validator');
const { validarCrearJugador, validarActualizarJugador, POSICIONES_VALIDAS } = require('../../server/validators/jugadores.validator');
const { validarCrearPartido, validarActualizarPartido, ESTADOS_VALIDOS } = require('../../server/validators/partidos.validator');
const { validarJugadorId, validarStatsOfensivas, validarStatsPitcheo, validarStatsDefensivas } = require('../../server/validators/estadisticas.validator');
const { validarCrearTorneo, validarActualizarTorneo } = require('../../server/validators/torneos.validator');

// =============================================
// EQUIPOS VALIDATOR
// =============================================

describe('Equipos Validator', () => {

    describe('validarCrearEquipo', () => {
        test('debe validar equipo válido', () => {
            const result = validarCrearEquipo({
                nombre: 'Tigres',
                manager: 'Juan Lopez',
                ciudad: 'Buenos Aires'
            });
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('debe rechazar sin nombre', () => {
            const result = validarCrearEquipo({
                manager: 'Juan', ciudad: 'BA'
            });
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        test('debe rechazar nombre corto', () => {
            const result = validarCrearEquipo({
                nombre: 'A', manager: 'Juan Lopez', ciudad: 'Buenos Aires'
            });
            expect(result.isValid).toBe(false);
        });

        test('debe sanitizar (trim) campos', () => {
            const result = validarCrearEquipo({
                nombre: '  Tigres  ',
                manager: '  Juan  ',
                ciudad: '  BA  '
            });
            expect(result.sanitized.nombre).toBe('Tigres');
            expect(result.sanitized.manager).toBe('Juan');
            expect(result.sanitized.ciudad).toBe('BA');
        });

        test('debe rechazar sin campos requeridos', () => {
            const result = validarCrearEquipo({});
            expect(result.isValid).toBe(false);
        });
    });

    describe('validarActualizarEquipo', () => {
        test('debe validar actualización válida', () => {
            const result = validarActualizarEquipo({
                nombre: 'Tigres FC',
                manager: 'Pedro Martinez',
                ciudad: 'Caracas'
            });
            expect(result.isValid).toBe(true);
        });

        test('debe rechazar nombre > 100 caracteres', () => {
            const result = validarActualizarEquipo({
                nombre: 'A'.repeat(101),
                manager: 'Manager',
                ciudad: 'Ciudad'
            });
            expect(result.isValid).toBe(false);
        });
    });
});

// =============================================
// JUGADORES VALIDATOR
// =============================================

describe('Jugadores Validator', () => {

    describe('validarCrearJugador', () => {
        test('debe validar jugador con todos los campos', () => {
            const result = validarCrearJugador({
                nombre: 'Carlos Perez',
                equipo_id: 1,
                posicion: 'SS',
                numero: 10
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.posicion).toBe('SS');
            expect(result.sanitized.numero).toBe(10);
        });

        test('debe validar jugador con solo nombre', () => {
            const result = validarCrearJugador({
                nombre: 'Carlos Perez'
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.equipo_id).toBeNull();
            expect(result.sanitized.posicion).toBeNull();
        });

        test('debe rechazar nombre corto', () => {
            const result = validarCrearJugador({ nombre: 'A' });
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar nombre vacío', () => {
            const result = validarCrearJugador({});
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar posición inválida', () => {
            const result = validarCrearJugador({
                nombre: 'Carlos Perez',
                posicion: 'INVALIDA'
            });
            expect(result.isValid).toBe(false);
        });

        test('debe aceptar todas las posiciones válidas', () => {
            POSICIONES_VALIDAS.forEach(pos => {
                const result = validarCrearJugador({
                    nombre: 'Jugador Test',
                    posicion: pos
                });
                expect(result.isValid).toBe(true);
            });
        });

        test('debe rechazar número negativo', () => {
            const result = validarCrearJugador({
                nombre: 'Carlos Perez',
                numero: -1
            });
            expect(result.isValid).toBe(false);
        });
    });

    describe('validarActualizarJugador', () => {
        test('debe validar actualización válida', () => {
            const result = validarActualizarJugador({
                nombre: 'Carlos Perez',
                equipo_id: 1,
                posicion: 'SS'
            });
            expect(result.isValid).toBe(true);
        });

        test('debe rechazar sin nombre y equipo', () => {
            const result = validarActualizarJugador({});
            expect(result.isValid).toBe(false);
        });
    });
});

// =============================================
// PARTIDOS VALIDATOR
// =============================================

describe('Partidos Validator', () => {

    describe('validarCrearPartido', () => {
        test('debe validar partido válido', () => {
            const result = validarCrearPartido({
                equipo_local_id: 1,
                equipo_visitante_id: 2,
                fecha_partido: '2025-06-15'
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.estado).toBe('programado');
        });

        test('debe auto-asignar estado finalizado con score', () => {
            const result = validarCrearPartido({
                equipo_local_id: 1,
                equipo_visitante_id: 2,
                fecha_partido: '2025-06-15',
                carreras_local: 5,
                carreras_visitante: 3
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.estado).toBe('finalizado');
        });

        test('debe rechazar sin campos requeridos', () => {
            const result = validarCrearPartido({});
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar mismo equipo local y visitante', () => {
            const result = validarCrearPartido({
                equipo_local_id: 1,
                equipo_visitante_id: 1,
                fecha_partido: '2025-06-15'
            });
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar carreras negativas', () => {
            const result = validarCrearPartido({
                equipo_local_id: 1,
                equipo_visitante_id: 2,
                fecha_partido: '2025-06-15',
                carreras_local: -1
            });
            expect(result.isValid).toBe(false);
        });

        test('debe usar innings default de 9', () => {
            const result = validarCrearPartido({
                equipo_local_id: 1,
                equipo_visitante_id: 2,
                fecha_partido: '2025-06-15'
            });
            expect(result.sanitized.innings_jugados).toBe(9);
        });

        test('debe aceptar estados válidos', () => {
            ESTADOS_VALIDOS.forEach(estado => {
                const result = validarCrearPartido({
                    equipo_local_id: 1,
                    equipo_visitante_id: 2,
                    fecha_partido: '2025-06-15',
                    estado
                });
                expect(result.sanitized.estado).toBe(estado);
            });
        });
    });

    describe('validarActualizarPartido', () => {
        test('debe validar actualización válida', () => {
            const result = validarActualizarPartido({
                equipo_local_id: 1,
                equipo_visitante_id: 2,
                fecha_partido: '2025-06-15'
            });
            expect(result.isValid).toBe(true);
        });

        test('debe rechazar sin campos requeridos', () => {
            const result = validarActualizarPartido({});
            expect(result.isValid).toBe(false);
        });
    });
});

// =============================================
// ESTADÍSTICAS VALIDATOR
// =============================================

describe('Estadísticas Validator', () => {

    describe('validarJugadorId', () => {
        test('debe validar ID numérico', () => {
            const result = validarJugadorId(123);
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(123);
        });

        test('debe validar ID string numérico', () => {
            const result = validarJugadorId('456');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(456);
        });

        test('debe rechazar null', () => {
            const result = validarJugadorId(null);
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar undefined', () => {
            const result = validarJugadorId(undefined);
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar texto', () => {
            const result = validarJugadorId('abc');
            expect(result.isValid).toBe(false);
        });
    });

    describe('validarStatsOfensivas', () => {
        test('debe validar stats válidas', () => {
            const result = validarStatsOfensivas({
                jugador_id: 1,
                at_bats: 10,
                hits: 5,
                home_runs: 2
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.at_bats).toBe(10);
            expect(result.sanitized.hits).toBe(5);
        });

        test('debe rechazar sin jugador_id', () => {
            const result = validarStatsOfensivas({
                at_bats: 10, hits: 5
            });
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar valores negativos', () => {
            const result = validarStatsOfensivas({
                jugador_id: 1,
                at_bats: -5
            });
            expect(result.isValid).toBe(false);
        });

        test('debe sanitizar campos numéricos a enteros', () => {
            const result = validarStatsOfensivas({
                jugador_id: 1,
                at_bats: '10',
                hits: '3.5',
                home_runs: 'abc'
            });
            expect(result.sanitized.at_bats).toBe(10);
            expect(result.sanitized.hits).toBe(3);
            expect(result.sanitized.home_runs).toBe(0);
        });

        test('debe incluir torneo_id si se provee', () => {
            const result = validarStatsOfensivas({
                jugador_id: 1,
                torneo_id: 52
            });
            expect(result.sanitized.torneo_id).toBe(52);
        });

        test('debe tener torneo_id null si no se provee', () => {
            const result = validarStatsOfensivas({
                jugador_id: 1
            });
            expect(result.sanitized.torneo_id).toBeNull();
        });
    });

    describe('validarStatsPitcheo', () => {
        test('debe validar stats de pitcheo válidas', () => {
            const result = validarStatsPitcheo({
                jugador_id: 1,
                innings_pitched: 7.0,
                earned_runs: 3,
                strikeouts: 8,
                walks_allowed: 2
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.innings_pitched).toBe(7.0);
            expect(result.sanitized.strikeouts).toBe(8);
        });

        test('debe rechazar sin jugador_id', () => {
            const result = validarStatsPitcheo({
                innings_pitched: 7
            });
            expect(result.isValid).toBe(false);
        });

        test('debe manejar valores faltantes como 0', () => {
            const result = validarStatsPitcheo({
                jugador_id: 1
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.innings_pitched).toBe(0);
            expect(result.sanitized.wins).toBe(0);
            expect(result.sanitized.losses).toBe(0);
        });
    });

    describe('validarStatsDefensivas', () => {
        test('debe validar stats defensivas válidas', () => {
            const result = validarStatsDefensivas({
                jugador_id: 1,
                putouts: 10,
                assists: 5,
                errors: 1
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.putouts).toBe(10);
        });

        test('debe rechazar sin jugador_id', () => {
            const result = validarStatsDefensivas({
                putouts: 10
            });
            expect(result.isValid).toBe(false);
        });

        test('debe manejar valores faltantes como 0', () => {
            const result = validarStatsDefensivas({
                jugador_id: 1
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.putouts).toBe(0);
            expect(result.sanitized.assists).toBe(0);
            expect(result.sanitized.errors).toBe(0);
        });
    });
});

// =============================================
// TORNEOS VALIDATOR
// =============================================

describe('Torneos Validator', () => {

    describe('validarCrearTorneo', () => {
        test('debe validar torneo válido', () => {
            const result = validarCrearTorneo({
                nombre: 'Copa Verano 2025'
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.nombre).toBe('Copa Verano 2025');
            expect(result.sanitized.total_juegos).toBe(22); // default
            expect(result.sanitized.cupos_playoffs).toBe(6); // default
        });

        test('debe rechazar nombre corto (< 3 chars)', () => {
            const result = validarCrearTorneo({ nombre: 'AB' });
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar sin nombre', () => {
            const result = validarCrearTorneo({});
            expect(result.isValid).toBe(false);
        });

        test('debe aceptar total_juegos personalizado', () => {
            const result = validarCrearTorneo({
                nombre: 'Copa Test',
                total_juegos: 30
            });
            expect(result.isValid).toBe(true);
            expect(result.sanitized.total_juegos).toBe(30);
        });

        test('debe rechazar total_juegos negativo', () => {
            const result = validarCrearTorneo({
                nombre: 'Copa Test',
                total_juegos: -5
            });
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar cupos_playoffs inválido', () => {
            const result = validarCrearTorneo({
                nombre: 'Copa Test',
                cupos_playoffs: 0
            });
            expect(result.isValid).toBe(false);
        });
    });

    describe('validarActualizarTorneo', () => {
        test('debe validar actualización de nombre', () => {
            const result = validarActualizarTorneo({
                nombre: 'Copa Invierno 2025'
            });
            expect(result.isValid).toBe(true);
            expect(result.fields).toContain('nombre');
            expect(result.values).toContain('Copa Invierno 2025');
        });

        test('debe rechazar nombre corto', () => {
            const result = validarActualizarTorneo({
                nombre: 'AB'
            });
            expect(result.isValid).toBe(false);
        });

        test('debe rechazar sin campos para actualizar', () => {
            const result = validarActualizarTorneo({});
            expect(result.isValid).toBe(false);
        });

        test('debe aceptar múltiples campos', () => {
            const result = validarActualizarTorneo({
                nombre: 'Copa Test',
                total_juegos: 15
            });
            expect(result.isValid).toBe(true);
            expect(result.fields).toHaveLength(2);
        });
    });
});
