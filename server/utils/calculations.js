/**
 * Cálculos de estadísticas de softball/baseball
 * Centraliza todas las fórmulas para consistencia entre controllers y services
 */

// ============================================================
// ESTADÍSTICAS OFENSIVAS
// ============================================================

/**
 * Batting Average (AVG) = H / AB
 */
function calcularAVG(hits, atBats) {
    if (!atBats || atBats === 0) return 0;
    return parseFloat((hits / atBats).toFixed(3));
}

/**
 * On-Base Percentage (OBP) = (H + BB + HBP) / (AB + BB + HBP + SF)
 */
function calcularOBP(hits, walks, hitByPitch, atBats, sacrificeFlies) {
    const numerator = (hits || 0) + (walks || 0) + (hitByPitch || 0);
    const denominator = (atBats || 0) + (walks || 0) + (hitByPitch || 0) + (sacrificeFlies || 0);
    if (denominator === 0) return 0;
    return parseFloat((numerator / denominator).toFixed(3));
}

/**
 * Slugging Percentage (SLG) = TB / AB
 * TB = 1B + 2B*2 + 3B*3 + HR*4
 */
function calcularSLG(singles, doubles, triples, homeRuns, atBats) {
    if (!atBats || atBats === 0) return 0;
    const totalBases = (singles || 0) + ((doubles || 0) * 2) + ((triples || 0) * 3) + ((homeRuns || 0) * 4);
    return parseFloat((totalBases / atBats).toFixed(3));
}

/**
 * On-base Plus Slugging (OPS) = OBP + SLG
 */
function calcularOPS(obp, slg) {
    return parseFloat(((obp || 0) + (slg || 0)).toFixed(3));
}

/**
 * Isolated Power (ISO) = SLG - AVG
 */
function calcularISO(slg, avg) {
    return parseFloat(((slg || 0) - (avg || 0)).toFixed(3));
}

/**
 * Calcula singles a partir de hits y extra-base hits
 */
function calcularSingles(hits, doubles, triples, homeRuns) {
    return (hits || 0) - (doubles || 0) - (triples || 0) - (homeRuns || 0);
}

/**
 * Total Bases = 1B + 2B*2 + 3B*3 + HR*4
 */
function calcularTotalBases(singles, doubles, triples, homeRuns) {
    return (singles || 0) + ((doubles || 0) * 2) + ((triples || 0) * 3) + ((homeRuns || 0) * 4);
}

/**
 * Plate Appearances = AB + BB + HBP + SF + SH
 */
function calcularPlateAppearances(atBats, walks, hitByPitch, sacrificeFlies, sacrificeHits) {
    return (atBats || 0) + (walks || 0) + (hitByPitch || 0) + (sacrificeFlies || 0) + (sacrificeHits || 0);
}

/**
 * Calcula todas las stats derivadas ofensivas de una vez
 * @param {object} raw - { hits, at_bats, doubles, triples, home_runs, walks, hit_by_pitch, sacrifice_flies, sacrifice_hits }
 * @returns {object} - { avg, obp, slg, ops, iso, singles, total_bases, plate_appearances }
 */
function calcularStatsOfensivas(raw) {
    const singles = calcularSingles(raw.hits, raw.doubles, raw.triples, raw.home_runs);
    const avg = calcularAVG(raw.hits, raw.at_bats);
    const obp = calcularOBP(raw.hits, raw.walks, raw.hit_by_pitch, raw.at_bats, raw.sacrifice_flies);
    const slg = calcularSLG(singles, raw.doubles, raw.triples, raw.home_runs, raw.at_bats);
    const ops = calcularOPS(obp, slg);
    const iso = calcularISO(slg, avg);
    const totalBases = calcularTotalBases(singles, raw.doubles, raw.triples, raw.home_runs);
    const plateAppearances = calcularPlateAppearances(raw.at_bats, raw.walks, raw.hit_by_pitch, raw.sacrifice_flies, raw.sacrifice_hits);

    return {
        avg,
        obp,
        slg,
        ops,
        iso,
        singles,
        total_bases: totalBases,
        plate_appearances: plateAppearances
    };
}

// ============================================================
// ESTADÍSTICAS DE PITCHEO
// ============================================================

/**
 * Earned Run Average (ERA) = (ER * 9) / IP
 */
function calcularERA(earnedRuns, inningsPitched) {
    if (!inningsPitched || inningsPitched === 0) return 0;
    return parseFloat(((earnedRuns * 9) / inningsPitched).toFixed(2));
}

/**
 * Walks + Hits per Innings Pitched (WHIP) = (BB + H) / IP
 */
function calcularWHIP(walksAllowed, hitsAllowed, inningsPitched) {
    if (!inningsPitched || inningsPitched === 0) return 0;
    return parseFloat((((walksAllowed || 0) + (hitsAllowed || 0)) / inningsPitched).toFixed(2));
}

/**
 * Strikeouts per 9 innings (K/9) = (K * 9) / IP
 */
function calcularK9(strikeouts, inningsPitched) {
    if (!inningsPitched || inningsPitched === 0) return 0;
    return parseFloat(((strikeouts * 9) / inningsPitched).toFixed(2));
}

/**
 * Walks per 9 innings (BB/9) = (BB * 9) / IP
 */
function calcularBB9(walksAllowed, inningsPitched) {
    if (!inningsPitched || inningsPitched === 0) return 0;
    return parseFloat(((walksAllowed * 9) / inningsPitched).toFixed(2));
}

/**
 * Calcula todas las stats derivadas de pitcheo
 */
function calcularStatsPitcheo(raw) {
    const era = calcularERA(raw.earned_runs, raw.innings_pitched);
    const whip = calcularWHIP(raw.walks_allowed, raw.hits_allowed, raw.innings_pitched);
    const k9 = calcularK9(raw.strikeouts, raw.innings_pitched);
    const bb9 = calcularBB9(raw.walks_allowed, raw.innings_pitched);

    return { era, whip, k9, bb9 };
}

// ============================================================
// ESTADÍSTICAS DEFENSIVAS
// ============================================================

/**
 * Fielding Percentage (FPCT) = (PO + A) / (PO + A + E)
 */
function calcularFPCT(putouts, assists, errors) {
    const chances = (putouts || 0) + (assists || 0) + (errors || 0);
    if (chances === 0) return 0;
    return parseFloat((((putouts || 0) + (assists || 0)) / chances).toFixed(3));
}

/**
 * Calcula chances totales
 */
function calcularChances(putouts, assists, errors) {
    return (putouts || 0) + (assists || 0) + (errors || 0);
}

/**
 * Calcula todas las stats derivadas defensivas
 */
function calcularStatsDefensivas(raw) {
    const chances = calcularChances(raw.putouts, raw.assists, raw.errors);
    const fpct = calcularFPCT(raw.putouts, raw.assists, raw.errors);

    return { fielding_percentage: fpct, chances };
}

module.exports = {
    // Ofensivas individuales
    calcularAVG,
    calcularOBP,
    calcularSLG,
    calcularOPS,
    calcularISO,
    calcularSingles,
    calcularTotalBases,
    calcularPlateAppearances,
    calcularStatsOfensivas,

    // Pitcheo individuales
    calcularERA,
    calcularWHIP,
    calcularK9,
    calcularBB9,
    calcularStatsPitcheo,

    // Defensivas individuales
    calcularFPCT,
    calcularChances,
    calcularStatsDefensivas
};
