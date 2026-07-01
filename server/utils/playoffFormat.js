const DEFAULT_TOTAL_GAMES = 8;
const DEFAULT_PLAYOFF_SLOTS = 8;

function toPositiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePlayoffFormat({
    totalJuegos,
    cuposPlayoffs,
    teamCount = 0,
    tournamentName = ''
} = {}) {
    let normalizedTotalGames = toPositiveNumber(totalJuegos, DEFAULT_TOTAL_GAMES);
    let normalizedPlayoffSlots = toPositiveNumber(cuposPlayoffs, DEFAULT_PLAYOFF_SLOTS);
    const lowerName = String(tournamentName || '').toLowerCase();
    const looksLegacyFormat = normalizedTotalGames === 22 && normalizedPlayoffSlots === 6;
    const isKnownShortFormat = /(joey|otoño|otono|copa otoño|aprendiendo)/.test(lowerName);

    if (looksLegacyFormat && (teamCount === 9 || isKnownShortFormat)) {
        normalizedTotalGames = 8;
        normalizedPlayoffSlots = 8;
    }

    if (teamCount > 0) {
        normalizedPlayoffSlots = Math.min(normalizedPlayoffSlots, teamCount);
    }

    return {
        totalJuegos: normalizedTotalGames,
        cuposPlayoffs: normalizedPlayoffSlots
    };
}

module.exports = {
    DEFAULT_TOTAL_GAMES,
    DEFAULT_PLAYOFF_SLOTS,
    normalizePlayoffFormat
};
