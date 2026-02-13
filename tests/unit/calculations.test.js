/**
 * Tests unitarios para server/utils/calculations.js
 * Todas las fórmulas estadísticas de softball/baseball
 */

const {
    calcularAVG,
    calcularOBP,
    calcularSLG,
    calcularOPS,
    calcularISO,
    calcularSingles,
    calcularTotalBases,
    calcularPlateAppearances,
    calcularStatsOfensivas,
    calcularERA,
    calcularWHIP,
    calcularK9,
    calcularBB9,
    calcularStatsPitcheo,
    calcularFPCT,
    calcularChances,
    calcularStatsDefensivas
} = require('../../server/utils/calculations');

// =============================================
// OFFENSIVE STATS
// =============================================

describe('Offensive Statistics', () => {

    describe('calcularAVG', () => {
        test('debe calcular AVG correctamente', () => {
            expect(calcularAVG(5, 10)).toBe(0.500);
            expect(calcularAVG(3, 10)).toBe(0.300);
            expect(calcularAVG(1, 3)).toBe(0.333);
        });

        test('debe retornar 0 si AB es 0', () => {
            expect(calcularAVG(5, 0)).toBe(0);
        });

        test('debe retornar 0 si AB es null/undefined', () => {
            expect(calcularAVG(5, null)).toBe(0);
            expect(calcularAVG(5, undefined)).toBe(0);
        });

        test('debe retornar 0 si hits es 0', () => {
            expect(calcularAVG(0, 10)).toBe(0);
        });

        test('debe manejar bateo perfecto', () => {
            expect(calcularAVG(10, 10)).toBe(1.000);
        });
    });

    describe('calcularOBP', () => {
        test('debe calcular OBP correctamente', () => {
            // (5+2+1) / (10+2+1+1) = 8/14 = 0.571
            expect(calcularOBP(5, 2, 1, 10, 1)).toBe(0.571);
        });

        test('debe retornar 0 si denominador es 0', () => {
            expect(calcularOBP(0, 0, 0, 0, 0)).toBe(0);
        });

        test('debe manejar valores null como 0', () => {
            // (3+0+0) / (10+0+0+0) = 3/10 = 0.300
            expect(calcularOBP(3, null, null, 10, null)).toBe(0.3);
        });

        test('OBP >= AVG cuando hay walks', () => {
            const avg = calcularAVG(3, 10);
            const obp = calcularOBP(3, 2, 0, 10, 0);
            expect(obp).toBeGreaterThanOrEqual(avg);
        });
    });

    describe('calcularSLG', () => {
        test('debe calcular SLG correctamente', () => {
            // 1B=2, 2B=1, 3B=0, HR=1, AB=10
            // TB = 2 + 2 + 0 + 4 = 8
            // SLG = 8/10 = 0.800
            expect(calcularSLG(2, 1, 0, 1, 10)).toBe(0.800);
        });

        test('debe retornar 0 si AB es 0', () => {
            expect(calcularSLG(2, 1, 0, 1, 0)).toBe(0);
        });

        test('debe manejar solo singles', () => {
            // 5 singles, 0 extras, 10 AB → TB=5 → SLG=0.500
            expect(calcularSLG(5, 0, 0, 0, 10)).toBe(0.500);
        });

        test('debe manejar solo home runs', () => {
            // 0 singles, 0 doubles, 0 triples, 3 HR, 10 AB → TB=12 → SLG=1.200
            expect(calcularSLG(0, 0, 0, 3, 10)).toBe(1.200);
        });
    });

    describe('calcularOPS', () => {
        test('debe sumar OBP + SLG', () => {
            expect(calcularOPS(0.400, 0.500)).toBe(0.900);
        });

        test('debe manejar valores null', () => {
            expect(calcularOPS(null, 0.500)).toBe(0.500);
            expect(calcularOPS(0.400, null)).toBe(0.400);
        });

        test('debe retornar 0 si ambos son 0', () => {
            expect(calcularOPS(0, 0)).toBe(0);
        });
    });

    describe('calcularISO', () => {
        test('debe calcular ISO = SLG - AVG', () => {
            expect(calcularISO(0.500, 0.300)).toBe(0.200);
        });

        test('debe retornar 0 si ambos son iguales', () => {
            expect(calcularISO(0.300, 0.300)).toBe(0);
        });
    });

    describe('calcularSingles', () => {
        test('debe calcular singles correctamente', () => {
            // 10 hits - 2 doubles - 1 triple - 2 HR = 5 singles
            expect(calcularSingles(10, 2, 1, 2)).toBe(5);
        });

        test('debe retornar 0 si todos son extras', () => {
            expect(calcularSingles(5, 2, 1, 2)).toBe(0);
        });

        test('debe manejar valores null', () => {
            expect(calcularSingles(5, null, null, null)).toBe(5);
        });
    });

    describe('calcularTotalBases', () => {
        test('debe calcular TB correctamente', () => {
            // 2 singles + 1*2 doubles + 1*3 triple + 1*4 HR = 2+2+3+4 = 11
            expect(calcularTotalBases(2, 1, 1, 1)).toBe(11);
        });

        test('debe retornar 0 sin hits', () => {
            expect(calcularTotalBases(0, 0, 0, 0)).toBe(0);
        });
    });

    describe('calcularPlateAppearances', () => {
        test('debe calcular PA correctamente', () => {
            // AB=30 + BB=5 + HBP=2 + SF=1 + SH=0 = 38
            expect(calcularPlateAppearances(30, 5, 2, 1, 0)).toBe(38);
        });

        test('debe manejar valores null', () => {
            expect(calcularPlateAppearances(10, null, null, null, null)).toBe(10);
        });
    });

    describe('calcularStatsOfensivas (batch)', () => {
        test('debe calcular todas las stats derivadas', () => {
            const raw = {
                hits: 8,
                at_bats: 20,
                doubles: 2,
                triples: 1,
                home_runs: 1,
                walks: 3,
                hit_by_pitch: 1,
                sacrifice_flies: 0,
                sacrifice_hits: 0
            };

            const result = calcularStatsOfensivas(raw);

            expect(result).toHaveProperty('avg');
            expect(result).toHaveProperty('obp');
            expect(result).toHaveProperty('slg');
            expect(result).toHaveProperty('ops');
            expect(result).toHaveProperty('iso');
            expect(result).toHaveProperty('singles');
            expect(result).toHaveProperty('total_bases');
            expect(result).toHaveProperty('plate_appearances');

            // singles = 8 - 2 - 1 - 1 = 4
            expect(result.singles).toBe(4);
            // AVG = 8/20 = 0.400
            expect(result.avg).toBe(0.400);
            // PA = 20 + 3 + 1 + 0 + 0 = 24
            expect(result.plate_appearances).toBe(24);
            // TB = 4 + 4 + 3 + 4 = 15
            expect(result.total_bases).toBe(15);
            // SLG = 15/20 = 0.750
            expect(result.slg).toBe(0.750);
            // OPS = OBP + SLG
            expect(result.ops).toBe(calcularOPS(result.obp, result.slg));
        });

        test('debe manejar stats vacías', () => {
            const result = calcularStatsOfensivas({});
            expect(result.avg).toBe(0);
            expect(result.obp).toBe(0);
            expect(result.slg).toBe(0);
            expect(result.ops).toBe(0);
        });
    });
});

// =============================================
// PITCHING STATS
// =============================================

describe('Pitching Statistics', () => {

    describe('calcularERA', () => {
        test('debe calcular ERA correctamente', () => {
            // ER=3, IP=9 → ERA = (3*9)/9 = 3.00
            expect(calcularERA(3, 9)).toBe(3.00);
        });

        test('debe retornar 0 si IP es 0', () => {
            expect(calcularERA(3, 0)).toBe(0);
        });

        test('debe retornar 0 si IP es null', () => {
            expect(calcularERA(3, null)).toBe(0);
        });

        test('ERA 0 con 0 earned runs', () => {
            expect(calcularERA(0, 7)).toBe(0);
        });

        test('debe calcular ERA alto correctamente', () => {
            // ER=10, IP=3 → ERA = (10*9)/3 = 30.00
            expect(calcularERA(10, 3)).toBe(30.00);
        });
    });

    describe('calcularWHIP', () => {
        test('debe calcular WHIP correctamente', () => {
            // BB=2, H=5, IP=9 → WHIP = (2+5)/9 = 0.78
            expect(calcularWHIP(2, 5, 9)).toBe(0.78);
        });

        test('debe retornar 0 si IP es 0', () => {
            expect(calcularWHIP(2, 5, 0)).toBe(0);
        });

        test('WHIP perfecto sin walks ni hits', () => {
            expect(calcularWHIP(0, 0, 7)).toBe(0);
        });
    });

    describe('calcularK9', () => {
        test('debe calcular K/9 correctamente', () => {
            // K=10, IP=9 → K/9 = (10*9)/9 = 10.00
            expect(calcularK9(10, 9)).toBe(10.00);
        });

        test('debe retornar 0 si IP es 0', () => {
            expect(calcularK9(10, 0)).toBe(0);
        });
    });

    describe('calcularBB9', () => {
        test('debe calcular BB/9 correctamente', () => {
            // BB=3, IP=9 → BB/9 = (3*9)/9 = 3.00
            expect(calcularBB9(3, 9)).toBe(3.00);
        });

        test('debe retornar 0 si IP es 0', () => {
            expect(calcularBB9(3, 0)).toBe(0);
        });
    });

    describe('calcularStatsPitcheo (batch)', () => {
        test('debe calcular todas las stats de pitcheo', () => {
            const raw = {
                earned_runs: 3,
                innings_pitched: 9,
                walks_allowed: 2,
                hits_allowed: 5,
                strikeouts: 10
            };

            const result = calcularStatsPitcheo(raw);

            expect(result).toHaveProperty('era');
            expect(result).toHaveProperty('whip');
            expect(result).toHaveProperty('k9');
            expect(result).toHaveProperty('bb9');

            expect(result.era).toBe(3.00);
            expect(result.whip).toBe(0.78);
            expect(result.k9).toBe(10.00);
            expect(result.bb9).toBe(2.00);
        });

        test('debe manejar stats vacías', () => {
            const result = calcularStatsPitcheo({});
            expect(result.era).toBe(0);
            expect(result.whip).toBe(0);
            expect(result.k9).toBe(0);
            expect(result.bb9).toBe(0);
        });
    });
});

// =============================================
// DEFENSIVE STATS
// =============================================

describe('Defensive Statistics', () => {

    describe('calcularFPCT', () => {
        test('debe calcular FPCT correctamente', () => {
            // PO=10, A=5, E=1 → FPCT = (10+5)/(10+5+1) = 15/16 = 0.938
            expect(calcularFPCT(10, 5, 1)).toBe(0.938);
        });

        test('debe retornar 0 si no hay chances', () => {
            expect(calcularFPCT(0, 0, 0)).toBe(0);
        });

        test('fielding perfecto sin errores', () => {
            // PO=20, A=10, E=0 → FPCT = 30/30 = 1.000
            expect(calcularFPCT(20, 10, 0)).toBe(1.000);
        });

        test('debe manejar solo errores', () => {
            // PO=0, A=0, E=5 → FPCT = 0/5 = 0.000
            expect(calcularFPCT(0, 0, 5)).toBe(0);
        });

        test('debe manejar valores null', () => {
            expect(calcularFPCT(null, null, null)).toBe(0);
        });
    });

    describe('calcularChances', () => {
        test('debe sumar PO + A + E', () => {
            expect(calcularChances(10, 5, 1)).toBe(16);
        });

        test('debe retornar 0 sin chances', () => {
            expect(calcularChances(0, 0, 0)).toBe(0);
        });

        test('debe manejar valores null', () => {
            expect(calcularChances(null, null, null)).toBe(0);
        });
    });

    describe('calcularStatsDefensivas (batch)', () => {
        test('debe calcular fielding percentage y chances', () => {
            const raw = { putouts: 10, assists: 5, errors: 1 };
            const result = calcularStatsDefensivas(raw);

            expect(result.fielding_percentage).toBe(0.938);
            expect(result.chances).toBe(16);
        });

        test('debe manejar stats vacías', () => {
            const result = calcularStatsDefensivas({});
            expect(result.fielding_percentage).toBe(0);
            expect(result.chances).toBe(0);
        });
    });
});
