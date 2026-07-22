// ===================================
// EQUIPO V2 - JavaScript Moderno
// Complementa equipo-detalle.js con tournament selector,
// collective stats, top 5 players, y SSE
// ===================================

// ===================================
// VARIABLES GLOBALES
// ===================================
let currentTeamId = null;
let teamData = null;
let rosterData = [];
let filteredRoster = [];
let recentGames = [];
let currentFilter = 'all';
let standingsData = [];
let currentTorneoId = null;
let allTorneos = [];
let sseConnection = null;
let teamGamesWithBoxscore = [];
let teamBattingRows = [];
let currentBattingPage = 1;
const TEAM_BATTING_PAGE_SIZE = 10;

function setTextContentSafe(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function registerTeamShareCard() {
    if (!window.ChoguiShare || !teamData) return;

    window.ChoguiShare.registerPage({
        getData: () => {
            const tournamentName = document.getElementById('tournamentSelect')?.selectedOptions?.[0]?.textContent || '';
            const zoneText = document.getElementById('teamSignalZone')?.textContent || '';
            const city = document.getElementById('teamLocation')?.textContent || teamData.ciudad || 'Liga';
            const manager = document.getElementById('teamManager')?.textContent || teamData.manager || 'Sin manager';
            const record = document.getElementById('teamRecord')?.textContent || '--';
            const pct = document.getElementById('teamWinPct')?.textContent || '--';
            const diff = document.getElementById('teamSignalDiff')?.textContent || '';
            const position = document.getElementById('teamPositionStat')?.textContent || '--';
            let tone = 'default';
            if (/playoff|clasifica|adentro/i.test(zoneText)) tone = 'playoff';
            if (/persigue|corte|pelea|acecho/i.test(zoneText)) tone = 'chase';

            return {
                type: 'equipo',
                tone,
                kicker: document.getElementById('teamHeroKicker')?.textContent || 'Perfil oficial del equipo',
                tournamentName,
                title: document.getElementById('teamHeroTitle')?.textContent || teamData.nombre || 'Perfil del equipo',
                subtitle: `${city} • Manager ${manager}`,
                badge: tournamentName || 'Perfil oficial',
                meta: `Récord ${record}`,
                badgeLabel: zoneText ? 'Estado' : 'Ciudad',
                badgeValue: zoneText || city,
                badgeMeta: `Posición ${position} • PCT ${pct}`,
                logo: document.getElementById('heroTeamLogo')?.src || getTeamLogo(teamData.id, teamData.nombre),
                initials: generarIniciales(teamData.nombre),
                fileName: `equipo-${teamData.nombre || 'perfil'}`,
                linkLabel: diff ? `DIF ${diff}` : (currentTorneoId ? 'Torneo seleccionado' : 'Todos los torneos'),
                brandText: tournamentName ? `${tournamentName} • choguileague.site` : 'choguileague.site',
                metrics: [
                    { label: 'Récord', value: record },
                    { label: 'Posición', value: position },
                    { label: 'PCT', value: pct },
                    { label: 'Carreras', value: document.getElementById('teamRuns')?.textContent || '--' }
                ]
            };
        }
    });
}

// ===================================
// INICIALIZACIÓN
// ===================================

function getTeamIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
}

document.addEventListener('DOMContentLoaded', function () {
    currentTeamId = getTeamIdFromUrl();

    if (!currentTeamId || isNaN(currentTeamId)) {
        mostrarErrorEquipo('No se especificó un equipo válido. Verifica la URL.');
        return;
    }

    configurarEventListeners();
    cargarTorneos();
    conectarSSE();
});

function configurarEventListeners() {
    // Position filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.position;
            filtrarRoster();
        });
    });

    // Tournament selector
    const select = document.getElementById('tournamentSelect');
    if (select) {
        select.addEventListener('change', function () {
            currentTorneoId = this.value || null;
            cargarTodosLosDatos();
        });
    }
}

// ===================================
// TOURNAMENT LOADING
// ===================================

async function cargarTorneos() {
    const select = document.getElementById('tournamentSelect');
    try {
        const response = await fetch('/api/torneos/publicos');
        if (!response.ok) throw new Error('Error cargando torneos');
        const data = await response.json();
        allTorneos = Array.isArray(data) ? data : (data.torneos || []);

        if (!allTorneos.length) {
            select.innerHTML = '<option value="">Archivo disponible</option>';
            select.disabled = true;
            currentTorneoId = null;
            cargarTodosLosDatos();
            return;
        }

        select.disabled = false;
        select.innerHTML = '<option value="">Todos los torneos</option>';
        const activo = allTorneos.find(t => t.activo);

        allTorneos.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.nombre + (t.activo ? ' (Activo)' : '');
            select.appendChild(opt);
        });

        // Default to active tournament
        if (activo) {
            select.value = activo.id;
            currentTorneoId = String(activo.id);
        }

        cargarTodosLosDatos();
    } catch (error) {
        console.error('Error cargando torneos:', error);
        select.innerHTML = '<option value="">Sin torneos públicos</option>';
        cargarTodosLosDatos();
    }
}

// ===================================
// DATA LOADING ORCHESTRATOR
// ===================================

async function cargarTodosLosDatos() {
    try {
        if (!currentTorneoId && allTorneos.length === 0) {
        await Promise.all([
            cargarInformacionEquipo(),
            cargarRosterEquipo(),
            cargarHistoricoEquipo(),
            cargarHeadToHead(),
            cargarComparadorEquipos(),
            cargarCaminoPlayoffs()
        ]);
        return;
    }

        await Promise.all([
            cargarInformacionEquipo(),
            cargarRosterEquipo(),
            cargarPartidosRecientes(),
            cargarStandings(),
            cargarHistoricoEquipo(),
            cargarHeadToHead(),
            cargarCaminoPlayoffs()
        ]);

        // After roster loaded, load collective stats and top players
        await Promise.all([
            cargarEstadisticasColectivas(),
            cargarTopBateadores(),
            cargarTopLanzadores(),
            cargarComparadorEquipos(),
            cargarScoutingEquipo(),
            cargarScoutingRosterEquipo()
        ]);
    } catch (error) {
        console.error('Error cargando datos del equipo:', error);
    }
}

function getTournamentQuery() {
    return currentTorneoId ? `?torneo_id=${currentTorneoId}` : '';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ===================================
// TEAM INFO
// ===================================

async function cargarInformacionEquipo() {
    try {
        const response = await fetch(`/api/equipos/${currentTeamId}`);
        if (!response.ok) {
            if (response.status === 404) throw new Error(`Equipo con ID ${currentTeamId} no encontrado`);
            throw new Error(`Error del servidor: ${response.status}`);
        }
        teamData = await response.json();
        if (!teamData.nombre) throw new Error('Datos del equipo incompletos');
        renderizarInformacionEquipo();
    } catch (error) {
        console.error('Error cargando info equipo:', error);
        mostrarErrorEquipo(error.message);
        throw error;
    }
}

function renderizarInformacionEquipo() {
    if (!teamData) return;

    document.title = `${teamData.nombre} - Chogui League`;

    // URL amigable
    const nombreAmigable = teamData.nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    window.history.replaceState(null, document.title, `equipo.html?id=${currentTeamId}&nombre=${nombreAmigable}`);

    // Breadcrumb
    const breadcrumb = document.getElementById('teamBreadcrumb');
    if (breadcrumb) breadcrumb.innerHTML = `<strong style="color: #ffc107;">${teamData.nombre}</strong>`;

    const city = teamData.ciudad || 'Liga';
    setTextContentSafe('teamHeroTitle', teamData.nombre);
    setTextContentSafe('teamHeroSubtitle', `${city} • Plantilla, histórico y rendimiento oficial del equipo.`);
    setTextContentSafe('teamHeroBadgeLabel', 'Ciudad');
    setTextContentSafe('teamHeroBadgeValue', city);
    setTextContentSafe('teamHeroBadgeMeta', 'Equipo oficial de la liga');

    // Logo
    const logoUrl = getTeamLogo(teamData.id, teamData.nombre);
    mostrarLogoEquipo(logoUrl, teamData.nombre);

    // Info fields
    setTextContent('teamName', teamData.nombre);
    setTextContent('teamLocation', teamData.ciudad || 'Ubicación no especificada');
    setTextContent('teamManager', teamData.manager || 'Manager no asignado');

    if (teamData.fecha_creacion) {
        const año = new Date(teamData.fecha_creacion).getFullYear();
        setTextContent('teamFounded', isNaN(año) ? 'N/A' : año);
    } else {
        setTextContent('teamFounded', 'N/A');
    }

    registerTeamShareCard();
}

// ===================================
// LOGO HANDLING
// ===================================

function getTeamLogo(equipoId, equipoNombre) {
    const numericId = Number(equipoId);
    if (numericId) {
        return `/api/equipos/${numericId}/logo`;
    }

    if (!equipoNombre) return '/images/logos/default-logo.png';
    const nombreArchivo = equipoNombre
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') + '.png';
    return `/images/logos/${nombreArchivo}`;
}

function mostrarLogoEquipo(logoUrl, equipoNombre) {
    const logoContainer = document.querySelector('.team-logo');
    const heroLogo = document.getElementById('heroTeamLogo');
    if (!logoContainer) return;

    const img = new Image();
    img.onload = function () {
        logoContainer.style.backgroundImage = `url('${logoUrl}')`;
        logoContainer.style.backgroundSize = 'contain';
        logoContainer.style.backgroundRepeat = 'no-repeat';
        logoContainer.style.backgroundPosition = 'center';
        logoContainer.innerHTML = '';
        if (heroLogo) {
            heroLogo.src = logoUrl;
            heroLogo.alt = `Escudo de ${equipoNombre}`;
        }
    };
    img.onerror = function () {
        const iniciales = generarIniciales(equipoNombre);
        logoContainer.style.backgroundImage = 'none';
        logoContainer.innerHTML = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                background:#ffc107;border-radius:50%;
                font-size:2.5rem;font-weight:bold;color:#0d1117;text-shadow:2px 2px 4px rgba(0,0,0,0.2);">
                ${iniciales}
            </div>`;
        if (heroLogo) {
            heroLogo.src = '/images/logos/chogui-league.png';
            heroLogo.alt = 'Escudo Chogui League';
        }
    };
    img.src = logoUrl;
}

function generarIniciales(nombreEquipo) {
    if (!nombreEquipo) return '?';
    const palabras = nombreEquipo.trim().split(/\s+/);
    if (palabras.length === 1) return palabras[0].substring(0, 2).toUpperCase();
    return palabras.slice(0, 3).map(p => p.charAt(0).toUpperCase()).join('');
}

function getTeamMediaMarkup(equipoId, equipoNombre) {
    const logoUrl = getTeamLogo(equipoId, equipoNombre);
    const initials = escapeHtml(generarIniciales(equipoNombre));
    const safeName = escapeHtml(equipoNombre || 'Equipo');
    return `
        <div class="team-media">
            <img src="${logoUrl}" alt="Escudo de ${safeName}" loading="lazy" onerror="this.closest('.team-media').innerHTML='<div class=&quot;team-media-fallback&quot;>${initials}</div>';">
        </div>
    `;
}

function renderTeamHistoricalExecutive({ career = {}, byTournament = [], awardsDetail = [] }) {
    const container = document.getElementById('teamHistoricalExecutive');
    const awardsVisual = document.getElementById('teamAwardsVisual');
    if (!container || !awardsVisual) return;

    const tournaments = byTournament.filter((row) => toNumber(row.juegos) > 0);
    const bestTournament = tournaments.reduce((best, row) => {
        const pct = toNumber(row.juegos) ? toNumber(row.victorias) / toNumber(row.juegos) : 0;
        if (!best) return { ...row, _pct: pct };
        if (pct > best._pct) return { ...row, _pct: pct };
        if (pct === best._pct && toNumber(row.diferencial) > toNumber(best.diferencial)) return { ...row, _pct: pct };
        return best;
    }, null);
    const bestDiff = tournaments.reduce((best, row) => {
        if (!best) return row;
        return toNumber(row.diferencial) > toNumber(best.diferencial) ? row : best;
    }, null);
    const bestOffense = tournaments.reduce((best, row) => {
        if (!best) return row;
        return toNumber(row.carreras_anotadas) > toNumber(best.carreras_anotadas) ? row : best;
    }, null);
    const latestAward = awardsDetail[0] || null;

    container.innerHTML = `
        <div class="historical-executive-card">
            <span class="historical-executive-label">Mejor torneo</span>
            <strong class="historical-executive-value">${escapeHtml(bestTournament?.torneo_nombre || 'Sin muestra')}</strong>
            <small class="historical-executive-meta">${bestTournament ? `${bestTournament.victorias}-${bestTournament.derrotas} • PCT ${Number(bestTournament._pct || 0).toFixed(3)}` : 'Todavía no hay juegos históricos suficientes.'}</small>
        </div>
        <div class="historical-executive-card">
            <span class="historical-executive-label">Pico ofensivo</span>
            <strong class="historical-executive-value">${bestOffense ? `${toNumber(bestOffense.carreras_anotadas)} carreras` : '--'}</strong>
            <small class="historical-executive-meta">${bestOffense ? `${escapeHtml(bestOffense.torneo_nombre || 'Sin torneo')} fue el torneo más productivo al bate.` : 'Sin lectura ofensiva todavía.'}</small>
        </div>
        <div class="historical-executive-card">
            <span class="historical-executive-label">Techo competitivo</span>
            <strong class="historical-executive-value">${bestDiff ? `${toNumber(bestDiff.diferencial) >= 0 ? '+' : ''}${toNumber(bestDiff.diferencial)}` : '--'}</strong>
            <small class="historical-executive-meta">${bestDiff ? `Mejor diferencial en ${escapeHtml(bestDiff.torneo_nombre || 'archivo histórico')}.` : 'Sin diferencial histórico todavía.'}</small>
        </div>
        <div class="historical-executive-card">
            <span class="historical-executive-label">Último premio</span>
            <strong class="historical-executive-value">${escapeHtml(latestAward?.jugador_nombre || 'Sin títulos')}</strong>
            <small class="historical-executive-meta">${latestAward ? `${escapeHtml(latestAward.posicion || 'UTIL')} • ${latestAward.lado === 'ofensiva' ? 'Ofensiva' : 'Defensiva'} • ${escapeHtml(latestAward.ultimo_torneo || 'Sin torneo')}` : 'El equipo aún no registra títulos posicionales.'}</small>
        </div>
    `;

    if (!awardsDetail.length) {
        awardsVisual.innerHTML = '<div class="award-visual-chip muted">Todavía no hay palmarés visual para este equipo.</div>';
        return;
    }

    awardsVisual.innerHTML = awardsDetail.slice(0, 10).map((row) => `
        <div class="award-visual-chip">
            ${escapeHtml(row.jugador_nombre || 'Jugador')} • ${escapeHtml(row.posicion || 'UTIL')} • ${toNumber(row.titulos)} título${toNumber(row.titulos) === 1 ? '' : 's'}
        </div>
    `).join('');
}

function renderHeadToHeadExecutive(rows = []) {
    const container = document.getElementById('headToHeadExecutive');
    if (!container) return;

    if (!rows.length) {
        container.innerHTML = `
            <div class="historical-executive-card">
                <span class="historical-executive-label">Lectura de rivales</span>
                <strong class="historical-executive-value">Sin cruces</strong>
                <small class="historical-executive-meta">Todavía no hay cara a cara suficiente para identificar rivalidades.</small>
            </div>
        `;
        return;
    }

    const toughest = rows.reduce((best, row) => {
        const margin = toNumber(row.victorias) - toNumber(row.derrotas);
        const runsMargin = toNumber(row.carreras_anotadas) - toNumber(row.carreras_permitidas);
        if (!best) return { ...row, _margin: margin, _runsMargin: runsMargin };
        if (margin < best._margin) return { ...row, _margin: margin, _runsMargin: runsMargin };
        if (margin === best._margin && runsMargin < best._runsMargin) return { ...row, _margin: margin, _runsMargin: runsMargin };
        return best;
    }, null);

    const favorite = rows.reduce((best, row) => {
        const margin = toNumber(row.victorias) - toNumber(row.derrotas);
        if (!best) return { ...row, _margin: margin };
        return margin > best._margin ? { ...row, _margin: margin } : best;
    }, null);

    container.innerHTML = `
        <div class="historical-executive-card">
            <span class="historical-executive-label">Rival más duro</span>
            <strong class="historical-executive-value">${escapeHtml(toughest?.rival_nombre || 'Sin dato')}</strong>
            <small class="historical-executive-meta">${toughest ? `${toNumber(toughest.victorias)}-${toNumber(toughest.derrotas)} • ${toNumber(toughest.carreras_anotadas)} CF / ${toNumber(toughest.carreras_permitidas)} CE` : 'Sin lectura disponible.'}</small>
        </div>
        <div class="historical-executive-card">
            <span class="historical-executive-label">Cruce favorable</span>
            <strong class="historical-executive-value">${escapeHtml(favorite?.rival_nombre || 'Sin dato')}</strong>
            <small class="historical-executive-meta">${favorite ? `${toNumber(favorite.victorias)}-${toNumber(favorite.derrotas)} en el historial directo.` : 'Sin lectura disponible.'}</small>
        </div>
    `;
}

function renderTeamScoutingHighlights(data = {}) {
    const container = document.getElementById('teamScoutingHighlights');
    if (!container) return;

    const recent5 = data.recent5 || {};
    const previous5 = data.previous5 || {};
    const trend = data.trend || {};
    const local = data.splits?.local || {};
    const visitante = data.splits?.visitante || {};

    const betterSplit = Number(local.pct || 0) >= Number(visitante.pct || 0)
        ? { label: 'Fortaleza local', value: Number(local.pct || 0).toFixed(3), meta: `${toNumber(local.victorias)}-${toNumber(local.derrotas)} en casa.` }
        : { label: 'Mejor en ruta', value: Number(visitante.pct || 0).toFixed(3), meta: `${toNumber(visitante.victorias)}-${toNumber(visitante.derrotas)} como visitante.` };

    const trendText = trend.estado === 'subiendo' ? 'En alza'
        : trend.estado === 'bajando' ? 'En baja'
            : 'Estable';

    container.innerHTML = `
        <div class="historical-executive-card">
            <span class="historical-executive-label">Momento actual</span>
            <strong class="historical-executive-value">${toNumber(recent5.victorias)}-${toNumber(recent5.derrotas)}</strong>
            <small class="historical-executive-meta">Últimos 5 con ${toNumber(recent5.carreras_favor)} CF y ${toNumber(recent5.carreras_contra)} CE.</small>
        </div>
        <div class="historical-executive-card">
            <span class="historical-executive-label">Tendencia</span>
            <strong class="historical-executive-value">${trendText}</strong>
            <small class="historical-executive-meta">${toNumber(trend.victorias_delta) >= 0 ? '+' : ''}${toNumber(trend.victorias_delta)} victorias vs tramo anterior (${toNumber(previous5.victorias)}-${toNumber(previous5.derrotas)}).</small>
        </div>
        <div class="historical-executive-card">
            <span class="historical-executive-label">${betterSplit.label}</span>
            <strong class="historical-executive-value">${betterSplit.value}</strong>
            <small class="historical-executive-meta">${betterSplit.meta}</small>
        </div>
    `;
}

function buildRosterScoutCard({ kicker, player, meta, value, linkLabel = 'Ver perfil', icon = '🥎', suffix = '' }) {
    if (!player || !player.id) {
        return `
            <div class="roster-scout-card">
                <span class="roster-scout-kicker">${escapeHtml(kicker)}</span>
                <strong class="roster-scout-name">Sin líder todavía</strong>
                <small class="roster-scout-meta">${escapeHtml(meta || 'Todavía no hay suficiente muestra.')}</small>
            </div>
        `;
    }

    return `
        <div class="roster-scout-card">
            <span class="roster-scout-kicker">${escapeHtml(kicker)}</span>
            <div class="roster-scout-player">
                <div class="roster-scout-avatar">${icon}</div>
                <div class="roster-scout-copy">
                    <strong>${escapeHtml(player.nombre || 'Jugador')}</strong>
                    <small>${escapeHtml(player.posicion || 'UTIL')} • ${escapeHtml(meta || 'Sin lectura adicional')}</small>
                </div>
            </div>
            <span class="roster-scout-value">${escapeHtml(value)}${suffix}</span>
            <a class="roster-scout-link" href="jugador.html?id=${player.id}&equipo=${currentTeamId}">Ver perfil →</a>
        </div>
    `;
}

function buildPremiumPlayerCard({ role, player, icon = '🥎', metrics = [], note = '', fallback = 'Sin lectura todavía' }) {
    if (!player || !player.id) {
        return `
            <div class="premium-player-card">
                <span class="premium-player-role">${escapeHtml(role)}</span>
                <div class="premium-player-note">${escapeHtml(fallback)}</div>
            </div>
        `;
    }

    return `
        <div class="premium-player-card">
            <span class="premium-player-role">${escapeHtml(role)}</span>
            <div class="premium-player-head">
                <div class="premium-player-avatar">${icon}</div>
                <div class="premium-player-copy">
                    <strong>${escapeHtml(player.nombre || 'Jugador')}</strong>
                    <small>${escapeHtml(player.posicion || 'UTIL')}</small>
                </div>
            </div>
            <div class="premium-player-metrics">
                ${metrics.slice(0, 4).map((metric) => `
                    <div class="premium-player-metric">
                        <span class="premium-player-metric-label">${escapeHtml(metric.label)}</span>
                        <span class="premium-player-metric-value">${escapeHtml(metric.value)}</span>
                    </div>
                `).join('')}
            </div>
            <div class="premium-player-note">${escapeHtml(note)}</div>
            <a class="premium-player-link" href="jugador.html?id=${player.id}&equipo=${currentTeamId}">Ver perfil →</a>
        </div>
    `;
}

async function cargarScoutingRosterEquipo() {
    const grid = document.getElementById('teamRosterScoutingGrid');
    const tridentGrid = document.getElementById('teamOffensiveTrident');
    const lineupGrid = document.getElementById('teamIdealLineup');
    const pitchingGrid = document.getElementById('teamPitchingHierarchy');
    const temperatureGrid = document.getElementById('teamRosterTemperature');
    if (!grid) return;

    try {
        const torneoQuery = currentTorneoId ? `&torneo_id=${currentTorneoId}` : '';
        const [battingRes, pitchingRes] = await Promise.all([
            fetch(`/api/estadisticas-ofensivas?equipo_id=${currentTeamId}${torneoQuery}`),
            fetch(`/api/estadisticas-pitcheo?equipo_id=${currentTeamId}${torneoQuery}`)
        ]);

        const battingRaw = battingRes.ok ? await battingRes.json() : [];
        const pitchingRaw = pitchingRes.ok ? await pitchingRes.json() : [];
        const battingStats = Array.isArray(battingRaw) ? battingRaw : [];
        const pitchingStats = Array.isArray(pitchingRaw) ? pitchingRaw : [];

        const hitters = battingStats
            .map((row) => {
                const ab = toNumber(row.at_bats);
                const h = toNumber(row.hits);
                const d2 = toNumber(row.doubles);
                const d3 = toNumber(row.triples);
                const hr = toNumber(row.home_runs);
                const bb = toNumber(row.walks);
                const hbp = toNumber(row.hit_by_pitch);
                const sf = toNumber(row.sacrifice_flies);
                const singles = Math.max(0, h - d2 - d3 - hr);
                const avg = ab > 0 ? h / ab : 0;
                const obp = (ab + bb + hbp + sf) > 0 ? (h + bb + hbp) / (ab + bb + hbp + sf) : 0;
                const slg = ab > 0 ? (singles + d2 * 2 + d3 * 3 + hr * 4) / ab : 0;
                const ops = obp + slg;
                return {
                    id: row.jugador_id || row.id,
                    nombre: row.jugador_nombre || 'Jugador',
                    posicion: row.posicion || inferPlayerPosition(row.jugador_id),
                    avg,
                    obp,
                    slg,
                    ops,
                    hits: h,
                    hr,
                    rbi: toNumber(row.rbi),
                    sb: toNumber(row.stolen_bases),
                    ab
                };
            })
            .filter((row) => row.id);

        const pitchers = pitchingStats
            .map((row) => {
                const ip = parseFloat(row.innings_pitched) || 0;
                const er = toNumber(row.earned_runs);
                const bb = toNumber(row.walks_allowed);
                const ha = toNumber(row.hits_allowed);
                return {
                    id: row.jugador_id || row.id,
                    nombre: row.jugador_nombre || 'Pitcher',
                    posicion: row.posicion || inferPlayerPosition(row.jugador_id) || 'P',
                    ip,
                    era: ip > 0 ? (er / ip) * 9 : 99,
                    whip: ip > 0 ? (bb + ha) / ip : 99,
                    so: toNumber(row.strikeouts),
                    wins: toNumber(row.wins),
                    saves: toNumber(row.saves),
                    losses: toNumber(row.losses)
                };
            })
            .filter((row) => row.id);

        const qualifiedHitters = hitters.filter((row) => row.ab >= 5);
        const bestOps = [...qualifiedHitters].sort((a, b) => b.ops - a.ops)[0] || [...hitters].sort((a, b) => b.ops - a.ops)[0];
        const bestContact = [...qualifiedHitters].sort((a, b) => b.avg - a.avg)[0] || [...hitters].sort((a, b) => b.hits - a.hits)[0];
        const bestPower = [...hitters].sort((a, b) => b.hr - a.hr || b.ops - a.ops)[0];
        const bestProducer = [...hitters].sort((a, b) => b.rbi - a.rbi || b.ops - a.ops)[0];
        const bestSpeed = [...hitters].sort((a, b) => b.sb - a.sb || b.avg - a.avg)[0];

        const qualifiedPitchers = pitchers.filter((row) => row.ip >= 2);
        const staffAce = [...qualifiedPitchers].sort((a, b) => a.era - b.era || b.ip - a.ip)[0] || [...pitchers].sort((a, b) => a.era - b.era || b.ip - a.ip)[0];
        const strikeoutArm = [...pitchers].sort((a, b) => b.so - a.so || b.ip - a.ip)[0];
        const controlArm = [...qualifiedPitchers].sort((a, b) => a.whip - b.whip || b.ip - a.ip)[0] || [...pitchers].sort((a, b) => a.whip - b.whip || b.ip - a.ip)[0];
        const secondArm = [...pitchers].filter((row) => row.id !== staffAce?.id).sort((a, b) => b.ip - a.ip || a.era - b.era)[0];
        const closerArm = [...pitchers].sort((a, b) => b.saves - a.saves || a.whip - b.whip)[0] || null;
        const needsRebound = [...qualifiedHitters].sort((a, b) => a.ops - b.ops || a.avg - b.avg)[0] || [...hitters].sort((a, b) => a.ops - b.ops || a.avg - b.avg)[0];
        const hottestBat = [...qualifiedHitters].sort((a, b) => b.ops - a.ops || b.avg - a.avg)[0] || bestOps;

        grid.innerHTML = [
            buildRosterScoutCard({
                kicker: 'Bate central',
                player: bestOps,
                meta: 'Mayor OPS interno del roster',
                value: bestOps ? bestOps.ops.toFixed(3) : '--',
                icon: '🏏'
            }),
            buildRosterScoutCard({
                kicker: 'Contacto',
                player: bestContact,
                meta: bestContact?.ab >= 5 ? 'Mejor AVG con muestra útil' : 'Líder por hits/contacto actual',
                value: bestContact && bestContact.ab > 0 ? bestContact.avg.toFixed(3) : '--',
                icon: '🎯'
            }),
            buildRosterScoutCard({
                kicker: 'Poder',
                player: bestPower,
                meta: 'Cuadrangulares que cambian juegos',
                value: String(toNumber(bestPower?.hr || 0)),
                icon: '💥'
            }),
            buildRosterScoutCard({
                kicker: 'Productor',
                player: bestProducer,
                meta: 'Carreras impulsadas para cerrar innings',
                value: String(toNumber(bestProducer?.rbi || 0)),
                icon: '🔥'
            }),
            buildRosterScoutCard({
                kicker: 'Velocidad',
                player: bestSpeed,
                meta: 'Amenaza para alargar bases',
                value: String(toNumber(bestSpeed?.sb || 0)),
                icon: '⚡'
            }),
            buildRosterScoutCard({
                kicker: 'As del staff',
                player: staffAce,
                meta: 'Brazo más estable del cuerpo de pitcheo',
                value: staffAce ? staffAce.era.toFixed(2) : '--',
                icon: '🧤'
            }),
            buildRosterScoutCard({
                kicker: 'Ponches',
                player: strikeoutArm,
                meta: 'El brazo que más domina turnos',
                value: String(toNumber(strikeoutArm?.so || 0)),
                icon: '🥎'
            }),
            buildRosterScoutCard({
                kicker: 'Control',
                player: controlArm,
                meta: 'Mejor WHIP interno del staff',
                value: controlArm ? controlArm.whip.toFixed(2) : '--',
                icon: '🎖️'
            })
        ].join('');

        if (tridentGrid) {
            const trident = [bestOps, bestProducer, bestPower].filter(Boolean).filter((player, index, arr) => arr.findIndex((row) => row.id === player.id) === index);
            tridentGrid.innerHTML = trident.length ? trident.map((player, index) => buildPremiumPlayerCard({
                role: index === 0 ? 'Bate central' : index === 1 ? 'Productor' : 'Poder',
                player,
                icon: index === 0 ? '🏏' : index === 1 ? '🔥' : '💥',
                metrics: [
                    { label: 'OPS', value: player.ops.toFixed(3) },
                    { label: 'AVG', value: player.avg.toFixed(3) },
                    { label: 'RBI', value: String(player.rbi) },
                    { label: 'HR', value: String(player.hr) }
                ],
                note: index === 0
                    ? 'Es el bate que mejor equilibra embasado y slugging.'
                    : index === 1
                        ? 'Es quien más convierte tráfico en carreras.'
                        : 'Es la principal amenaza para extrabases y swings de impacto.'
            })).join('') : '<div class="premium-scout-empty">Todavía no hay suficiente data para definir el tridente ofensivo.</div>';
        }

        if (lineupGrid) {
            const leadoff = [...qualifiedHitters].sort((a, b) => b.obp - a.obp || b.sb - a.sb)[0] || bestSpeed || bestContact;
            const contacto2 = [...qualifiedHitters].filter((row) => row.id !== leadoff?.id).sort((a, b) => b.avg - a.avg || b.obp - a.obp)[0] || bestContact;
            const tercero = [...qualifiedHitters].filter((row) => ![leadoff?.id, contacto2?.id].includes(row.id)).sort((a, b) => b.ops - a.ops)[0] || bestOps;
            const cleanup = [...hitters].filter((row) => ![leadoff?.id, contacto2?.id, tercero?.id].includes(row.id)).sort((a, b) => b.hr - a.hr || b.rbi - a.rbi || b.ops - a.ops)[0] || bestPower;
            const protector = [...hitters].filter((row) => ![leadoff?.id, contacto2?.id, tercero?.id, cleanup?.id].includes(row.id)).sort((a, b) => b.rbi - a.rbi || b.ops - a.ops)[0] || bestProducer;
            const acelerador = [...hitters].filter((row) => ![leadoff?.id, contacto2?.id, tercero?.id, cleanup?.id, protector?.id].includes(row.id)).sort((a, b) => b.sb - a.sb || b.obp - a.obp)[0] || bestSpeed;
            const lineupCards = [
                { role: '1. Leadoff', player: leadoff, icon: '🚀', note: 'Ideal para abrir innings y poner tráfico desde arriba.', metricA: 'OBP', valueA: leadoff?.obp?.toFixed(3) || '--', metricB: 'SB', valueB: String(toNumber(leadoff?.sb || 0)) },
                { role: '2. Contacto', player: contacto2, icon: '🎯', note: 'Bate pensado para mover corredores y sostener la mesa.', metricA: 'AVG', valueA: contacto2?.avg?.toFixed(3) || '--', metricB: 'H', valueB: String(toNumber(contacto2?.hits || 0)) },
                { role: '3. Corazón', player: tercero, icon: '🏏', note: 'El bate premium del lineup para entrar siempre en zona de daño.', metricA: 'OPS', valueA: tercero?.ops?.toFixed(3) || '--', metricB: 'RBI', valueB: String(toNumber(tercero?.rbi || 0)) },
                { role: '4. Cleanup', player: cleanup, icon: '💥', note: 'Perfil para limpiar bases y cambiar juegos con poder.', metricA: 'HR', valueA: String(toNumber(cleanup?.hr || 0)), metricB: 'SLG', valueB: cleanup?.slg?.toFixed(3) || '--' },
                { role: '5. Protector', player: protector, icon: '🔥', note: 'Mantiene la presión detrás del cleanup y sigue produciendo.', metricA: 'RBI', valueA: String(toNumber(protector?.rbi || 0)), metricB: 'OPS', valueB: protector?.ops?.toFixed(3) || '--' },
                { role: '6. Acelerador', player: acelerador, icon: '⚡', note: 'Activa segundas oportunidades y extiende innings.', metricA: 'SB', valueA: String(toNumber(acelerador?.sb || 0)), metricB: 'OBP', valueB: acelerador?.obp?.toFixed(3) || '--' }
            ];
            lineupGrid.innerHTML = lineupCards.map(({ role, player, icon, note, metricA, valueA, metricB, valueB }) => buildPremiumPlayerCard({
                role,
                player,
                icon,
                metrics: [
                    { label: metricA, value: valueA },
                    { label: metricB, value: valueB }
                ],
                note,
                fallback: 'Falta muestra para completar este tramo del lineup.'
            })).join('');
        }

        if (pitchingGrid) {
            const staffCards = [
                {
                    role: 'As',
                    player: staffAce,
                    icon: '🧤',
                    metrics: [
                        { label: 'ERA', value: staffAce ? staffAce.era.toFixed(2) : '--' },
                        { label: 'IP', value: staffAce ? staffAce.ip.toFixed(1) : '--' },
                        { label: 'SO', value: String(toNumber(staffAce?.so || 0)) }
                    ],
                    note: 'Brazo principal para abrir series y sostener la carga del torneo.'
                },
                {
                    role: 'Brazo 2',
                    player: secondArm,
                    icon: '🎯',
                    metrics: [
                        { label: 'IP', value: secondArm ? secondArm.ip.toFixed(1) : '--' },
                        { label: 'ERA', value: secondArm ? secondArm.era.toFixed(2) : '--' },
                        { label: 'WHIP', value: secondArm ? secondArm.whip.toFixed(2) : '--' }
                    ],
                    note: 'El segundo brazo más utilizable para acompañar al as.'
                },
                {
                    role: 'Cierre / control',
                    player: closerArm || controlArm,
                    icon: '🔒',
                    metrics: [
                        { label: 'SV', value: String(toNumber((closerArm || controlArm)?.saves || 0)) },
                        { label: 'WHIP', value: (closerArm || controlArm) ? (closerArm || controlArm).whip.toFixed(2) : '--' },
                        { label: 'IP', value: (closerArm || controlArm) ? (closerArm || controlArm).ip.toFixed(1) : '--' }
                    ],
                    note: 'El brazo más confiable para cerrar o controlar daños.'
                },
                {
                    role: 'Ponchador',
                    player: strikeoutArm,
                    icon: '🥎',
                    metrics: [
                        { label: 'SO', value: String(toNumber(strikeoutArm?.so || 0)) },
                        { label: 'ERA', value: strikeoutArm ? strikeoutArm.era.toFixed(2) : '--' },
                        { label: 'IP', value: strikeoutArm ? strikeoutArm.ip.toFixed(1) : '--' }
                    ],
                    note: 'Es el brazo que más puede apagar rallies por dominio puro.'
                }
            ];
            pitchingGrid.innerHTML = staffCards.map((card) => buildPremiumPlayerCard({
                role: card.role,
                player: card.player,
                icon: card.icon,
                metrics: card.metrics,
                note: card.note,
                fallback: 'El staff todavía no tiene suficiente muestra para esta jerarquía.'
            })).join('');
        }

        if (temperatureGrid) {
            temperatureGrid.innerHTML = [
                buildPremiumPlayerCard({
                    role: 'Más encendido',
                    player: hottestBat,
                    icon: '🔥',
                    metrics: [
                        { label: 'OPS', value: hottestBat ? hottestBat.ops.toFixed(3) : '--' },
                        { label: 'AVG', value: hottestBat ? hottestBat.avg.toFixed(3) : '--' },
                        { label: 'RBI', value: String(toNumber(hottestBat?.rbi || 0)) }
                    ],
                    note: 'Es el bate que hoy mejor define la identidad ofensiva del club.',
                    fallback: 'Todavía no hay suficiente muestra para marcar al jugador más encendido.'
                }),
                buildPremiumPlayerCard({
                    role: 'Pide repunte',
                    player: needsRebound,
                    icon: '🛠️',
                    metrics: [
                        { label: 'OPS', value: needsRebound ? needsRebound.ops.toFixed(3) : '--' },
                        { label: 'AVG', value: needsRebound ? needsRebound.avg.toFixed(3) : '--' },
                        { label: 'AB', value: String(toNumber(needsRebound?.ab || 0)) }
                    ],
                    note: 'Tiene volumen suficiente como para esperar una mejor respuesta en próximas jornadas.',
                    fallback: 'El roster todavía no tiene suficiente volumen para detectar un bajón real.'
                })
            ].join('');
        }
    } catch (error) {
        console.error('Error cargando scouting del roster:', error);
        grid.innerHTML = `
            <div class="roster-scout-card">
                <span class="roster-scout-kicker">Scouting del roster</span>
                <strong class="roster-scout-name">No se pudo cargar</strong>
                <small class="roster-scout-meta">Intenta recargar cuando ya existan datos del equipo en bateo y pitcheo.</small>
            </div>
        `;
        if (tridentGrid) tridentGrid.innerHTML = '<div class="premium-scout-empty">No se pudo cargar el tridente ofensivo.</div>';
        if (lineupGrid) lineupGrid.innerHTML = '<div class="premium-scout-empty">No se pudo cargar la alineación sugerida.</div>';
        if (pitchingGrid) pitchingGrid.innerHTML = '<div class="premium-scout-empty">No se pudo cargar la jerarquía del staff.</div>';
        if (temperatureGrid) temperatureGrid.innerHTML = '<div class="premium-scout-empty">No se pudo cargar la temperatura del roster.</div>';
    }
}

function inferPlayerPosition(playerId) {
    const player = rosterData.find((row) => Number(row.id) === Number(playerId));
    return player?.posicion || 'UTIL';
}

// ===================================
// STANDINGS
// ===================================

async function cargarStandings() {
    try {
        const torneoQuery = currentTorneoId ? `?torneo_id=${currentTorneoId}` : '';
        const response = await fetch(`/api/standings${torneoQuery}`);
        if (!response.ok) {
            standingsData = [];
            calcularEstadisticasEquipo(null);
            return;
        }
        standingsData = await response.json();
        if (!Array.isArray(standingsData)) standingsData = [];

        const standing = standingsData.find(e => Number(e.id || e.equipo_id) === Number(currentTeamId));
        calcularEstadisticasEquipo(standing);
    } catch (error) {
        console.warn('Error cargando standings:', error);
        standingsData = [];
        calcularEstadisticasEquipo(null);
    }
}

async function cargarHistoricoEquipo() {
    try {
        const response = await fetch(`/api/equipos/${currentTeamId}/historico${getTournamentQuery()}`);
        if (!response.ok) throw new Error('No se pudo cargar el histórico');
        const data = await response.json();
        const career = data?.career || {};
        const byTournament = Array.isArray(data?.by_tournament) ? data.by_tournament : [];
        const awards = career?.awards || {};
        const awardsDetail = Array.isArray(awards.detalle) ? awards.detalle : [];
        const pct = Number(career.porcentaje) || 0;
        const diff = Number(career.diferencial) || 0;

        setTextContent('historicRecord', `${toNumber(career.victorias)}-${toNumber(career.derrotas)}`);
        setTextContent('historicPct', pct.toFixed(3));
        setTextContent('historicDiff', `${diff >= 0 ? '+' : ''}${diff}`);
        setTextContent('historicRoster', toNumber(career.roster?.total_jugadores));
        setTextContent('historicAwardsTotal', toNumber(awards.total));

        const tbody = document.getElementById('historicTournamentsBody');
        const awardsBody = document.getElementById('historicAwardsBody');
        if (!tbody) return;
        tbody.innerHTML = byTournament.length
            ? byTournament.map(row => {
                const pctRow = toNumber(row.juegos) > 0 ? toNumber(row.victorias) / toNumber(row.juegos) : 0;
                return `
                    <tr>
                        <td>${row.torneo_nombre || 'Sin torneo'}</td>
                        <td>${toNumber(row.juegos)}</td>
                        <td>${toNumber(row.victorias)}</td>
                        <td>${toNumber(row.derrotas)}</td>
                        <td>${pctRow.toFixed(3)}</td>
                        <td>${toNumber(row.carreras_anotadas)}</td>
                        <td>${toNumber(row.carreras_permitidas)}</td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="7" class="empty-cell">No hay histórico por torneo todavía</td></tr>';

        if (awardsBody) {
            awardsBody.innerHTML = awardsDetail.length
                ? awardsDetail.map((row) => `
                    <tr>
                        <td>${row.jugador_nombre || 'Jugador'}</td>
                        <td>${row.lado === 'ofensiva' ? 'Ofensiva' : 'Defensiva'}</td>
                        <td>${row.posicion || 'UTIL'}</td>
                        <td>${toNumber(row.titulos)}</td>
                        <td>${row.ultimo_torneo || 'Sin torneo'}</td>
                    </tr>
                `).join('')
                : '<tr><td colspan="5" class="empty-cell">Este equipo todavía no tiene títulos posicionales registrados</td></tr>';
        }

        renderTeamHistoricalExecutive({ career, byTournament, awardsDetail });
    } catch (error) {
        console.error('Error cargando histórico del equipo:', error);
        const tbody = document.getElementById('historicTournamentsBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No se pudo cargar el histórico</td></tr>';
        const awardsBody = document.getElementById('historicAwardsBody');
        if (awardsBody) awardsBody.innerHTML = '<tr><td colspan="5" class="empty-cell">No se pudo cargar el palmarés</td></tr>';
        renderTeamHistoricalExecutive({});
    }
}

async function cargarHeadToHead() {
    try {
        const response = await fetch(`/api/equipos/${currentTeamId}/head-to-head${getTournamentQuery()}`);
        if (!response.ok) throw new Error('No se pudo cargar head to head');
        const data = await response.json();
        const rows = Array.isArray(data) ? data : [];
        const tbody = document.getElementById('headToHeadBody');
        if (!tbody) return;
        tbody.innerHTML = rows.length
            ? rows.map(row => `
                <tr>
                    <td>${row.rival_nombre || 'Rival'}</td>
                    <td>${toNumber(row.juegos)}</td>
                    <td>${toNumber(row.victorias)}</td>
                    <td>${toNumber(row.derrotas)}</td>
                    <td>${toNumber(row.carreras_anotadas)}</td>
                    <td>${toNumber(row.carreras_permitidas)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="6" class="empty-cell">Sin cruces registrados</td></tr>';
        renderHeadToHeadExecutive(rows);
    } catch (error) {
        console.error('Error cargando head to head:', error);
        const tbody = document.getElementById('headToHeadBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No se pudo cargar el cara a cara</td></tr>';
        renderHeadToHeadExecutive([]);
    }
}

async function cargarComparadorEquipos() {
    const chips = document.getElementById('teamCompareChips');
    const body = document.getElementById('teamCompareBody');
    const baseHeader = document.getElementById('teamCompareBaseHeader');
    const rivalHeader = document.getElementById('teamCompareRivalHeader');
    if (baseHeader && teamData?.nombre) baseHeader.textContent = teamData.nombre;

    try {
        const response = await fetch(`/api/equipos/${currentTeamId}/head-to-head${getTournamentQuery()}`);
        if (!response.ok) throw new Error('No se pudo cargar los rivales');
        const rivales = await response.json();
        const list = Array.isArray(rivales) ? rivales.filter((row) => Number(row.rival_id) > 0) : [];

        if (!chips || !body) return;
        if (!list.length) {
            chips.innerHTML = '<div class="empty-state">Sin rivales para comparar todavía</div>';
            body.innerHTML = '<tr><td colspan="3" class="empty-cell">No hay cruces suficientes para comparador</td></tr>';
            return;
        }

        chips.innerHTML = list.slice(0, 8).map((row) => `
            <button class="filter-btn" type="button" data-compare-team="${row.rival_id}">
                ${row.rival_nombre}
            </button>
        `).join('');

        chips.querySelectorAll('[data-compare-team]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                chips.querySelectorAll('[data-compare-team]').forEach((item) => item.classList.remove('active'));
                btn.classList.add('active');
                await cargarDetalleComparadorEquipo(btn.dataset.compareTeam);
            });
        });

        const first = chips.querySelector('[data-compare-team]');
        if (first) {
            first.classList.add('active');
            await cargarDetalleComparadorEquipo(first.dataset.compareTeam);
        }
    } catch (error) {
        console.error('Error cargando comparador de equipos:', error);
        if (chips) chips.innerHTML = '<div class="empty-state">No se pudo cargar el comparador</div>';
        if (body) body.innerHTML = '<tr><td colspan="3" class="empty-cell">No se pudo cargar la comparativa</td></tr>';
    }
}

async function cargarDetalleComparadorEquipo(rivalId) {
    const body = document.getElementById('teamCompareBody');
    const rivalHeader = document.getElementById('teamCompareRivalHeader');
    const faceoff = document.getElementById('teamCompareFaceoffSummary');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="3" class="loading-cell">Cargando comparativa...</td></tr>';
    if (faceoff) {
        faceoff.innerHTML = '<div class="empty-state">Cargando lectura del cruce...</div>';
    }

    try {
        const response = await fetch(`/api/equipos/${currentTeamId}/comparar/${rivalId}${getTournamentQuery()}`);
        if (!response.ok) throw new Error('No se pudo cargar la comparación');
        const data = await response.json();
        if (rivalHeader) rivalHeader.textContent = data?.equipo_rival?.nombre || 'Rival';

        const base = data?.equipo_base?.resumen || {};
        const rival = data?.equipo_rival?.resumen || {};
        const head = data?.head_to_head || {};
        const rows = [
            ['Récord actual', `${toNumber(base.victorias)}-${toNumber(base.derrotas)}`, `${toNumber(rival.victorias)}-${toNumber(rival.derrotas)}`],
            ['PCT', Number(base.pct || 0).toFixed(3), Number(rival.pct || 0).toFixed(3)],
            ['Carreras a favor', toNumber(base.carreras_favor), toNumber(rival.carreras_favor)],
            ['Carreras en contra', toNumber(base.carreras_contra), toNumber(rival.carreras_contra)],
            ['Diferencial', `${toNumber(base.diferencial) >= 0 ? '+' : ''}${toNumber(base.diferencial)}`, `${toNumber(rival.diferencial) >= 0 ? '+' : ''}${toNumber(rival.diferencial)}`],
            ['Head to head', `${toNumber(head.victorias_base)}-${toNumber(head.victorias_rival)}`, `${toNumber(head.victorias_rival)}-${toNumber(head.victorias_base)}`],
            ['Carreras H2H', toNumber(head.carreras_base), toNumber(head.carreras_rival)]
        ];

        body.innerHTML = rows.map(([label, baseVal, rivalVal]) => `
            <tr>
                <td>${label}</td>
                <td>${baseVal}</td>
                <td>${rivalVal}</td>
            </tr>
        `).join('');

        if (faceoff) {
            const baseDiff = toNumber(base.diferencial);
            const rivalDiff = toNumber(rival.diferencial);
            const h2hBase = toNumber(head.victorias_base);
            const h2hRival = toNumber(head.victorias_rival);
            const verdict = h2hBase === h2hRival
                ? 'Cruce parejo'
                : h2hBase > h2hRival
                    ? `${teamData?.nombre || 'Equipo base'} llega arriba`
                    : `${data?.equipo_rival?.nombre || 'Rival'} domina el historial`;
            const verdictMeta = h2hBase === h2hRival
                ? 'No hay ventaja clara en el cara a cara directo.'
                : `Head to head ${h2hBase}-${h2hRival} y diferencial ${baseDiff >= 0 ? '+' : ''}${baseDiff} vs ${rivalDiff >= 0 ? '+' : ''}${rivalDiff}.`;

            faceoff.innerHTML = `
                <div class="faceoff-team-card">
                    <div class="faceoff-team-head">
                        ${getTeamMediaMarkup(currentTeamId, teamData?.nombre)}
                        <div class="faceoff-team-copy">
                            <strong>${escapeHtml(teamData?.nombre || 'Equipo')}</strong>
                            <small>Equipo base</small>
                        </div>
                    </div>
                    <div class="faceoff-team-metrics">
                        <div class="faceoff-metric"><span class="faceoff-metric-label">Récord</span><span class="faceoff-metric-value">${toNumber(base.victorias)}-${toNumber(base.derrotas)}</span></div>
                        <div class="faceoff-metric"><span class="faceoff-metric-label">PCT</span><span class="faceoff-metric-value">${Number(base.pct || 0).toFixed(3)}</span></div>
                        <div class="faceoff-metric"><span class="faceoff-metric-label">CF</span><span class="faceoff-metric-value">${toNumber(base.carreras_favor)}</span></div>
                        <div class="faceoff-metric"><span class="faceoff-metric-label">DIF</span><span class="faceoff-metric-value">${baseDiff >= 0 ? '+' : ''}${baseDiff}</span></div>
                    </div>
                </div>
                <div class="faceoff-verdict">
                    <span class="faceoff-verdict-label">Lectura</span>
                    <strong>${escapeHtml(verdict)}</strong>
                    <small>${escapeHtml(verdictMeta)}</small>
                </div>
                <div class="faceoff-team-card">
                    <div class="faceoff-team-head">
                        ${getTeamMediaMarkup(data?.equipo_rival?.id || rivalId, data?.equipo_rival?.nombre)}
                        <div class="faceoff-team-copy">
                            <strong>${escapeHtml(data?.equipo_rival?.nombre || 'Rival')}</strong>
                            <small>Rival comparado</small>
                        </div>
                    </div>
                    <div class="faceoff-team-metrics">
                        <div class="faceoff-metric"><span class="faceoff-metric-label">Récord</span><span class="faceoff-metric-value">${toNumber(rival.victorias)}-${toNumber(rival.derrotas)}</span></div>
                        <div class="faceoff-metric"><span class="faceoff-metric-label">PCT</span><span class="faceoff-metric-value">${Number(rival.pct || 0).toFixed(3)}</span></div>
                        <div class="faceoff-metric"><span class="faceoff-metric-label">CF</span><span class="faceoff-metric-value">${toNumber(rival.carreras_favor)}</span></div>
                        <div class="faceoff-metric"><span class="faceoff-metric-label">DIF</span><span class="faceoff-metric-value">${rivalDiff >= 0 ? '+' : ''}${rivalDiff}</span></div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando detalle comparador de equipos:', error);
        body.innerHTML = '<tr><td colspan="3" class="empty-cell">No se pudo cargar la comparativa</td></tr>';
        if (faceoff) {
            faceoff.innerHTML = '<div class="empty-state">No se pudo cargar la lectura visual del comparador.</div>';
        }
    }
}

async function cargarScoutingEquipo() {
    const summary = document.getElementById('teamScoutingSummary');
    const splitsBody = document.getElementById('teamScoutingSplitsBody');
    const tournamentsBody = document.getElementById('teamScoutingTournamentsBody');

    try {
        const response = await fetch(`/api/equipos/${currentTeamId}/scouting${getTournamentQuery()}`);
        if (!response.ok) throw new Error('No se pudo cargar scouting del equipo');
        const data = await response.json();

        const recent5 = data.recent5 || {};
        const previous5 = data.previous5 || {};
        const trend = data.trend || {};
        const local = data.splits?.local || {};
        const visitante = data.splits?.visitante || {};
        const trendLabel = trend.estado === 'subiendo' ? 'En alza' : (trend.estado === 'bajando' ? 'En baja' : 'Estable');

        if (summary) {
            summary.innerHTML = `
                <div class="collective-stat-card">
                    <span class="collective-stat-title">Últimos 5</span>
                    <span class="collective-stat-value">${toNumber(recent5.victorias)}-${toNumber(recent5.derrotas)}</span>
                    <span class="collective-stat-desc">${toNumber(recent5.carreras_favor)} CF • ${toNumber(recent5.carreras_contra)} CE</span>
                </div>
                <div class="collective-stat-card">
                    <span class="collective-stat-title">Tendencia</span>
                    <span class="collective-stat-value">${trendLabel}</span>
                    <span class="collective-stat-desc">${trend.victorias_delta >= 0 ? '+' : ''}${toNumber(trend.victorias_delta)} victorias • DIF ${trend.diferencial_delta >= 0 ? '+' : ''}${toNumber(trend.diferencial_delta)}</span>
                </div>
                <div class="collective-stat-card">
                    <span class="collective-stat-title">Casa vs ruta</span>
                    <span class="collective-stat-value">${Number(local.pct || 0).toFixed(3)} / ${Number(visitante.pct || 0).toFixed(3)}</span>
                    <span class="collective-stat-desc">PCT local / visitante</span>
                </div>
            `;
        }

        if (splitsBody) {
            const rows = [
                ['Local', local],
                ['Visitante', visitante],
                ['Últimos 5', recent5],
                ['5 anteriores', previous5]
            ];
            splitsBody.innerHTML = rows.map(([label, row]) => `
                <tr>
                    <td>${label}</td>
                    <td>${toNumber(row.juegos)}</td>
                    <td>${toNumber(row.victorias)}</td>
                    <td>${toNumber(row.derrotas)}</td>
                    <td>${Number(row.pct || 0).toFixed(3)}</td>
                    <td>${toNumber(row.carreras_favor)}</td>
                    <td>${toNumber(row.carreras_contra)}</td>
                    <td>${toNumber(row.diferencial) >= 0 ? '+' : ''}${toNumber(row.diferencial)}</td>
                </tr>
            `).join('');
        }

        const torneos = Array.isArray(data.torneos) ? data.torneos : [];
        if (tournamentsBody) {
            tournamentsBody.innerHTML = torneos.length
                ? torneos.map((row) => `
                    <tr>
                        <td>${row.torneo_nombre || 'Sin torneo'}</td>
                        <td>${toNumber(row.juegos)}</td>
                        <td>${toNumber(row.victorias)}</td>
                        <td>${toNumber(row.derrotas)}</td>
                        <td>${Number(row.pct || 0).toFixed(3)}</td>
                        <td>${toNumber(row.carreras_favor)}</td>
                        <td>${toNumber(row.carreras_contra)}</td>
                        <td>${toNumber(row.diferencial) >= 0 ? '+' : ''}${toNumber(row.diferencial)}</td>
                    </tr>
                `).join('')
                : '<tr><td colspan="8" class="empty-cell">Sin scouting por torneo todavía</td></tr>';
        }
        renderTeamScoutingHighlights(data);
    } catch (error) {
        console.error('Error cargando scouting del equipo:', error);
        if (summary) {
            summary.innerHTML = `
                <div class="collective-stat-card"><span class="collective-stat-title">Últimos 5</span><span class="collective-stat-value">--</span><span class="collective-stat-desc">No disponible</span></div>
                <div class="collective-stat-card"><span class="collective-stat-title">Tendencia</span><span class="collective-stat-value">--</span><span class="collective-stat-desc">No disponible</span></div>
                <div class="collective-stat-card"><span class="collective-stat-title">Casa vs ruta</span><span class="collective-stat-value">--</span><span class="collective-stat-desc">No disponible</span></div>
            `;
        }
        if (splitsBody) splitsBody.innerHTML = '<tr><td colspan="8" class="empty-cell">No se pudo cargar scouting del equipo</td></tr>';
        if (tournamentsBody) tournamentsBody.innerHTML = '<tr><td colspan="8" class="empty-cell">No se pudo cargar scouting por torneo</td></tr>';
        renderTeamScoutingHighlights({});
    }
}

function calcularEstadisticasEquipo(standingRow) {
    if (standingRow) {
        const pj = toNumber(standingRow.pj);
        const pg = toNumber(standingRow.pg);
        const pp = toNumber(standingRow.pp);
        const cf = toNumber(standingRow.cf);
        const ce = toNumber(standingRow.ce);
        const porcentaje = Number(standingRow.porcentaje) || 0;
        const ranking = standingRow.ranking ? `#${standingRow.ranking}` : '--';
        const racha = calcularRacha(recentGames);

        setTextContent('teamRecord', `${pg}-${pp}${racha ? ` (${racha})` : ''}`);
        setTextContent('teamPositionStat', ranking);
        setTextContent('teamWinPct', porcentaje.toFixed(3));
        setTextContent('teamRuns', cf);
        setTextContent('winPercentage', porcentaje.toFixed(3));
        setTextContent('gamesPlayed', pj);
        setTextContent('wins', pg);
        setTextContent('losses', pp);
        setTextContent('runsScored', cf);
        setTextContent('runsAllowed', ce);
        actualizarSenalesEquipo({ pj, pg, pp, cf, ce, porcentaje, ranking: standingRow.ranking, racha });
        return;
    }

    // Fallback: calculate from recent games
    let victorias = 0, derrotas = 0, carrerasAnotadas = 0, carrerasPermitidas = 0;
    const finalizados = recentGames.filter(p => p.carreras_local !== null && p.carreras_visitante !== null);

    finalizados.forEach(partido => {
        const esLocal = partido.equipo_local_id == currentTeamId;
        const ce = esLocal ? partido.carreras_local : partido.carreras_visitante;
        const cr = esLocal ? partido.carreras_visitante : partido.carreras_local;
        carrerasAnotadas += ce || 0;
        carrerasPermitidas += cr || 0;
        if (ce > cr) victorias++; else derrotas++;
    });

    const pj = victorias + derrotas;
    const pct = pj > 0 ? (victorias / pj) : 0;
    const racha = calcularRacha(recentGames);

    setTextContent('teamRecord', `${victorias}-${derrotas}${racha ? ` (${racha})` : ''}`);
    setTextContent('teamPositionStat', '--');
    setTextContent('teamWinPct', pct.toFixed(3));
    setTextContent('teamRuns', carrerasAnotadas);
    setTextContent('winPercentage', pct.toFixed(3));
    setTextContent('gamesPlayed', pj);
    setTextContent('wins', victorias);
    setTextContent('losses', derrotas);
    setTextContent('runsScored', carrerasAnotadas);
    setTextContent('runsAllowed', carrerasPermitidas);
    actualizarSenalesEquipo({
        pj,
        pg: victorias,
        pp: derrotas,
        cf: carrerasAnotadas,
        ce: carrerasPermitidas,
        porcentaje: pct,
        ranking: null,
        racha
    });
}

function actualizarSenalesEquipo({ pj, pg, pp, cf, ce, porcentaje, ranking, racha }) {
    const diff = cf - ce;
    let zona = 'En lucha';
    if (ranking && ranking <= 6) zona = 'Playoffs';
    else if (ranking && ranking <= 8) zona = 'Burbuja';
    else if (porcentaje >= 0.65) zona = 'Zona alta';
    else if (pj === 0) zona = 'Sin muestra';

    const forma = racha || (pj ? `${pg}-${pp}` : '--');
    const diffText = `${diff >= 0 ? '+' : ''}${diff}`;
    const diffMeta = diff > 0 ? 'Produce más de lo que permite' : diff < 0 ? 'Necesita cerrar el diferencial' : 'Diferencial equilibrado';

    setTextContent('teamSignalZone', zona);
    setTextContent('teamSignalZoneMeta', ranking ? `posición #${ranking} • ${porcentaje.toFixed(3)}` : `${pj} partidos evaluados`);
    setTextContent('teamSignalDiff', diffText);
    setTextContent('teamSignalDiffMeta', diffMeta);
    setTextContent('teamSignalForm', forma);
    setTextContent('teamSignalFormMeta', pj ? `${pg} victorias, ${pp} derrotas` : 'Sin partidos finalizados');
}

async function cargarCaminoPlayoffs() {
    const rivalsBody = document.getElementById('playoffPathRivalsBody');
    if (rivalsBody) {
        rivalsBody.innerHTML = '<tr><td colspan="5" class="loading-cell">Cargando carrera al corte...</td></tr>';
    }

    try {
        const response = await fetch(`/api/equipos/${currentTeamId}/playoff-path${getTournamentQuery()}`);
        if (!response.ok) throw new Error('No se pudo calcular la carrera a playoffs');
        const data = await response.json();
        const team = data?.equipo || {};
        const cutoff = data?.corte || null;
        const projected = data?.rival_proyectado || null;
        const rivals = Array.isArray(data?.rivales_directos) ? data.rivales_directos : [];

        const stateMap = {
            clasificado: 'Clasificado',
            clasificando: 'Dentro',
            en_pelea: 'En pelea',
            eliminado: 'Eliminado',
            sin_muestra: 'Sin muestra'
        };

        setTextContent('playoffPathState', stateMap[team.estado] || '--');
        setTextContent('playoffPathStateMeta', team.ranking ? `Posición #${team.ranking} • ${Number(team.porcentaje || 0).toFixed(2)}%` : 'Sin posición oficial');
        setTextContent('playoffPathCutoff', cutoff ? `#${cutoff.ranking}` : '--');
        setTextContent('playoffPathCutoffMeta', cutoff ? cutoff.equipo_nombre : 'Sin equipo corte todavía');

        const margin = Number(team.juegos_de_margen || 0);
        setTextContent('playoffPathMargin', team.estado === 'sin_muestra' ? '--' : `${margin >= 0 ? '+' : ''}${margin}`);
        setTextContent('playoffPathMarginMeta', team.estado === 'sin_muestra'
            ? 'Esperando partidos'
            : (margin >= 0 ? 'Sobre el corte actual' : 'Debajo del corte actual'));

        if (projected) {
            setTextContent('playoffPathTarget', `vs #${projected.ranking}`);
            setTextContent('playoffPathTargetMeta', projected.equipo_nombre);
        } else {
            setTextContent('playoffPathTarget', team.victorias_necesarias ? `${team.victorias_necesarias} W` : '--');
            setTextContent('playoffPathTargetMeta', team.victorias_necesarias
                ? 'Victorias extra para asegurar el corte'
                : 'Ruta por definir');
        }

        setTextContent('playoffPathHeadline', cutoff
            ? `${team.nombre || teamData?.nombre || 'Equipo'} vs corte #${cutoff.ranking}`
            : 'Carrera a playoffs');
        setTextContent('playoffPathMessage', data?.mensaje || 'Sin lectura competitiva disponible todavía.');

        if (!rivalsBody) return;
        if (!rivals.length) {
            rivalsBody.innerHTML = '<tr><td colspan="5" class="empty-cell">Sin rivales directos suficientes para comparar.</td></tr>';
            return;
        }

        rivalsBody.innerHTML = rivals.map((row) => `
            <tr>
                <td>${row.equipo_nombre}</td>
                <td>#${toNumber(row.ranking)}</td>
                <td>${toNumber(row.pg)}-${toNumber(row.pp)}</td>
                <td>${Number(row.porcentaje || 0).toFixed(2)}%</td>
                <td>${toNumber(row.delta_victorias) >= 0 ? '+' : ''}${toNumber(row.delta_victorias)} W</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error cargando camino a playoffs:', error);
        setTextContent('playoffPathState', '--');
        setTextContent('playoffPathStateMeta', 'No se pudo calcular');
        setTextContent('playoffPathCutoff', '--');
        setTextContent('playoffPathCutoffMeta', 'Sin corte disponible');
        setTextContent('playoffPathMargin', '--');
        setTextContent('playoffPathMarginMeta', 'Error de cálculo');
        setTextContent('playoffPathTarget', '--');
        setTextContent('playoffPathTargetMeta', 'Sin ruta disponible');
        setTextContent('playoffPathHeadline', 'No se pudo cargar la ruta a playoffs');
        setTextContent('playoffPathMessage', 'Intenta recargar o revisar si el torneo tiene partidos finalizados.');
        if (rivalsBody) {
            rivalsBody.innerHTML = '<tr><td colspan="5" class="empty-cell">No se pudo cargar la carrera a playoffs</td></tr>';
        }
    }
}

// ===================================
// COLLECTIVE STATS
// ===================================

async function cargarEstadisticasColectivas() {
    try {
        // Single API call with equipo_id instead of N individual calls
        const torneoQuery = currentTorneoId ? `&torneo_id=${currentTorneoId}` : '';

        if (rosterData.length === 0) {
            resetCollectiveStats();
            return;
        }

        const response = await fetch(`/api/estadisticas-ofensivas?equipo_id=${currentTeamId}${torneoQuery}`);
        const allPlayerStats = response.ok ? await response.json() : [];

        // Aggregate
        let totalAB = 0, totalH = 0, totalHR = 0, totalRBI = 0;
        let totalBB = 0, totalHBP = 0, totalSF = 0, totalSB = 0;
        let total2B = 0, total3B = 0;

        const stats = Array.isArray(allPlayerStats) ? allPlayerStats : [];
        stats.forEach(s => {
            totalAB += toNumber(s.at_bats);
            totalH += toNumber(s.hits);
            total2B += toNumber(s.doubles);
            total3B += toNumber(s.triples);
            totalHR += toNumber(s.home_runs);
            totalRBI += toNumber(s.rbi);
            totalBB += toNumber(s.walks);
            totalHBP += toNumber(s.hit_by_pitch);
            totalSF += toNumber(s.sacrifice_flies);
            totalSB += toNumber(s.stolen_bases);
        });

        const avg = totalAB > 0 ? (totalH / totalAB) : 0;
        const obp = (totalAB + totalBB + totalHBP + totalSF) > 0
            ? (totalH + totalBB + totalHBP) / (totalAB + totalBB + totalHBP + totalSF) : 0;
        const singles = totalH - total2B - total3B - totalHR;
        const slg = totalAB > 0
            ? (singles + total2B * 2 + total3B * 3 + totalHR * 4) / totalAB : 0;
        const ops = obp + slg;

        setTextContent('teamAvg', avg.toFixed(3));
        setTextContent('teamHr', totalHR);
        setTextContent('teamRbi', totalRBI);
        setTextContent('teamOps', ops.toFixed(3));
        setTextContent('teamHits', totalH);
        setTextContent('teamSb', totalSB);

    } catch (error) {
        console.error('Error cargando estadísticas colectivas:', error);
        resetCollectiveStats();
    }
}

function resetCollectiveStats() {
    setTextContent('teamAvg', '.000');
    setTextContent('teamHr', '0');
    setTextContent('teamRbi', '0');
    setTextContent('teamOps', '.000');
    setTextContent('teamHits', '0');
    setTextContent('teamSb', '0');
}

// ===================================
// TOP 5 BATTERS
// ===================================

function renderBattingPagination() {
    const container = document.getElementById('topBattersPagination');
    const meta = document.getElementById('topBattersPaginationMeta');
    if (!container) return;

    const totalRows = teamBattingRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / TEAM_BATTING_PAGE_SIZE));
    currentBattingPage = Math.min(Math.max(currentBattingPage, 1), totalPages);

    if (meta) {
        const start = totalRows === 0 ? 0 : ((currentBattingPage - 1) * TEAM_BATTING_PAGE_SIZE) + 1;
        const end = Math.min(currentBattingPage * TEAM_BATTING_PAGE_SIZE, totalRows);
        meta.textContent = totalRows > 0
            ? `Mostrando ${start}-${end} de ${totalRows} bateadores • Página ${currentBattingPage} de ${totalPages}`
            : 'Sin bateadores para mostrar';
    }

    if (totalRows <= TEAM_BATTING_PAGE_SIZE) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <button type="button" class="page-quicknav-link" ${currentBattingPage === 1 ? 'disabled' : ''} data-batting-page-action="prev">← Anterior</button>
        <span class="page-quicknav-link" style="cursor:default; opacity:0.9;">Página ${currentBattingPage} / ${totalPages}</span>
        <button type="button" class="page-quicknav-link" ${currentBattingPage === totalPages ? 'disabled' : ''} data-batting-page-action="next">Siguiente →</button>
    `;

    container.querySelectorAll('[data-batting-page-action]').forEach(button => {
        button.addEventListener('click', () => {
            currentBattingPage += button.dataset.battingPageAction === 'prev' ? -1 : 1;
            renderBattingTablePage();
        });
    });
}

function renderBattingTablePage() {
    const tbody = document.getElementById('topBattersBody');
    if (!tbody) return;

    if (!teamBattingRows.length) {
        tbody.innerHTML = '<tr><td colspan="14" class="empty-cell">Sin estadísticas disponibles</td></tr>';
        renderBattingPagination();
        return;
    }

    const startIndex = (currentBattingPage - 1) * TEAM_BATTING_PAGE_SIZE;
    const pageRows = teamBattingRows.slice(startIndex, startIndex + TEAM_BATTING_PAGE_SIZE);

    tbody.innerHTML = pageRows.map((p, index) => `
        <tr>
            <td class="rank-cell">${startIndex + index + 1}</td>
            <td class="player-name-cell"><a href="jugador.html?id=${p.id}&equipo=${currentTeamId}">${p.nombre}</a></td>
            <td>${p.ab}</td>
            <td>${p.h}</td>
            <td>${p.d2}</td>
            <td>${p.d3}</td>
            <td>${p.hr}</td>
            <td>${p.rbi}</td>
            <td>${p.r}</td>
            <td>${p.bb}</td>
            <td>${p.so}</td>
            <td>${p.sb}</td>
            <td>${p.hbp}</td>
            <td>${p.sf}</td>
        </tr>
    `).join('');

    renderBattingPagination();
}

async function cargarTopBateadores() {
    const tbody = document.getElementById('topBattersBody');
    try {
        const torneoQuery = currentTorneoId ? `&torneo_id=${currentTorneoId}` : '';

        if (rosterData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="14" class="empty-cell">No hay jugadores</td></tr>';
            return;
        }

        // Single API call with equipo_id
        const response = await fetch(`/api/estadisticas-ofensivas?equipo_id=${currentTeamId}${torneoQuery}`);
        const allPlayerStats = response.ok ? await response.json() : [];
        const stats = Array.isArray(allPlayerStats) ? allPlayerStats : [];

        const playerAggs = [];
        stats.forEach(s => {
            const ab = toNumber(s.at_bats);
            const h = toNumber(s.hits);
            const d2 = toNumber(s.doubles);
            const d3 = toNumber(s.triples);
            const hr = toNumber(s.home_runs);
            const rbi = toNumber(s.rbi);
            const r = toNumber(s.runs);
            const bb = toNumber(s.walks);
            const so = toNumber(s.strikeouts);
            const sb = toNumber(s.stolen_bases);
            const hbp = toNumber(s.hit_by_pitch);
            const sf = toNumber(s.sacrifice_flies);

            const avg = ab > 0 ? h / ab : 0;
            const obp = (ab + bb + hbp + sf) > 0
                ? (h + bb + hbp) / (ab + bb + hbp + sf) : 0;
            const singles = h - d2 - d3 - hr;
            const slg = ab > 0 ? (singles + d2 * 2 + d3 * 3 + hr * 4) / ab : 0;
            const ops = obp + slg;

            playerAggs.push({
                id: s.jugador_id || s.id,
                nombre: s.jugador_nombre || 'N/A',
                avg,
                ab,
                h,
                d2,
                d3,
                hr,
                rbi,
                r,
                bb,
                so,
                sb,
                hbp,
                sf,
                ops
            });
        });

        playerAggs.sort((a, b) => b.avg - a.avg);
        teamBattingRows = playerAggs;
        currentBattingPage = 1;
        renderBattingTablePage();

    } catch (error) {
        console.error('Error cargando top bateadores:', error);
        teamBattingRows = [];
        tbody.innerHTML = '<tr><td colspan="14" class="empty-cell">Error cargando datos</td></tr>';
        renderBattingPagination();
    }
}

// ===================================
// TOP 5 PITCHERS
// ===================================

async function cargarTopLanzadores() {
    const tbody = document.getElementById('topPitchersBody');
    try {
        const torneoQuery = currentTorneoId ? `&torneo_id=${currentTorneoId}` : '';

        if (rosterData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No hay jugadores</td></tr>';
            return;
        }

        // Single API call with equipo_id
        const response = await fetch(`/api/estadisticas-pitcheo?equipo_id=${currentTeamId}${torneoQuery}`);
        const allPlayerStats = response.ok ? await response.json() : [];
        const stats = Array.isArray(allPlayerStats) ? allPlayerStats : [];

        const playerAggs = [];
        stats.forEach(s => {
            const ip = parseFloat(s.innings_pitched) || 0;
            if (ip === 0) return;

            const er = toNumber(s.earned_runs);
            const ha = toNumber(s.hits_allowed);
            const so = toNumber(s.strikeouts);
            const wa = toNumber(s.walks_allowed);
            const w = toNumber(s.wins);
            const l = toNumber(s.losses);

            const era = (er / ip) * 9;
            const whip = (wa + ha) / ip;

            playerAggs.push({
                id: s.jugador_id || s.id,
                nombre: s.jugador_nombre || 'N/A',
                era, wl: `${w}-${l}`, so, ip: ip.toFixed(1), whip
            });
        });

        // Sort by ERA asc (lower is better), show ALL pitchers
        playerAggs.sort((a, b) => a.era - b.era);

        if (playerAggs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Sin estadísticas disponibles</td></tr>';
            return;
        }

        tbody.innerHTML = playerAggs.map((p, i) => `
            <tr onclick="verJugador(${p.id})">
                <td class="rank-cell">${i + 1}</td>
                <td class="player-name-cell"><a href="jugador.html?id=${p.id}&equipo=${currentTeamId}">${p.nombre}</a></td>
                <td>${p.era.toFixed(2)}</td>
                <td>${p.wl}</td>
                <td>${p.so}</td>
                <td>${p.ip}</td>
                <td>${p.whip.toFixed(2)}</td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error cargando top lanzadores:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Error cargando datos</td></tr>';
    }
}

// ===================================
// ROSTER
// ===================================

async function cargarRosterEquipo() {
    const container = document.getElementById('rosterContainer');
    try {
        const response = await fetch(`/api/jugadores?equipo_id=${currentTeamId}`);
        if (!response.ok) throw new Error(`Error cargando roster: ${response.status}`);

        const data = await response.json();
        rosterData = Array.isArray(data.jugadores) ? data.jugadores : [];
        filteredRoster = [...rosterData];
        renderizarRoster();
    } catch (error) {
        console.error('Error cargando roster:', error);
        container.innerHTML = `
            <div class="empty-state">
                <h4>⚠️ Error cargando roster</h4>
                <p>No se pudo cargar la información de los jugadores.<br>
                <button onclick="cargarRosterEquipo()" class="btn-secondary" style="margin-top: 10px;">🔄 Reintentar</button></p>
            </div>`;
    }
}

function filtrarRoster() {
    if (currentFilter === 'all') {
        filteredRoster = [...rosterData];
    } else if (currentFilter === 'IF') {
        filteredRoster = rosterData.filter(p => ['1B', '2B', '3B', 'SS', 'SF'].includes(p.posicion));
    } else if (currentFilter === 'OF') {
        filteredRoster = rosterData.filter(p => ['LF', 'CF', 'RF'].includes(p.posicion));
    } else {
        filteredRoster = rosterData.filter(p => p.posicion === currentFilter);
    }
    renderizarRoster();
}

function renderizarRoster() {
    const container = document.getElementById('rosterContainer');
    const urlParams = new URLSearchParams(window.location.search);
    const jugadorDestacado = urlParams.get('jugador');

    if (!filteredRoster || filteredRoster.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay jugadores en este filtro</div>';
        return;
    }

    container.innerHTML = filteredRoster.map(jugador => {
        const esDestacado = jugadorDestacado && jugador.nombre.toLowerCase().includes(jugadorDestacado.toLowerCase());
        const claseExtra = esDestacado ? ' style="border: 2px solid #ffc107; background: rgba(255,193,7,0.15);"' : '';

        return `
            <div class="roster-player-card"${claseExtra} onclick="verJugador(${jugador.id})">
                <div class="roster-player-number"${!jugador.numero && jugador.numero !== 0 ? ' style="opacity:0.5"' : ''}>#${jugador.numero ?? '0'}</div>
                <div class="roster-player-info">
                    <div class="roster-player-name">${jugador.nombre}</div>
                    <div class="roster-player-pos">${formatearPosicion(jugador.posicion)}</div>
                </div>
            </div>`;
    }).join('');

    if (jugadorDestacado) {
        setTimeout(() => {
            const el = container.querySelector('[style*="rgba(255,193,7,0.15)"]');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500);
    }
}

// ===================================
// RECENT GAMES
// ===================================

async function cargarPartidosRecientes() {
    const container = document.getElementById('recentGamesContainer');
    try {
        const torneoQuery = currentTorneoId ? `&torneo_id=${currentTorneoId}` : '';
        const response = await fetch(`/api/partidos?equipo_id=${currentTeamId}&limit=10${torneoQuery}`);
        if (!response.ok) throw new Error(`Error cargando partidos: ${response.status}`);

        const data = await response.json();
        recentGames = data.partidos || [];
        teamGamesWithBoxscore = await Promise.all(
            recentGames.map(async (partido) => {
                if (!partido?.id) {
                    return { ...partido, boxscore: null };
                }

                try {
                    const boxscoreResponse = await fetch(`/api/partidos/${partido.id}/boxscore`);
                    if (!boxscoreResponse.ok) {
                        return { ...partido, boxscore: null };
                    }

                    const boxscore = await boxscoreResponse.json();
                    return { ...partido, boxscore };
                } catch (boxscoreError) {
                    console.warn('Boxscore no disponible para partido', partido.id, boxscoreError);
                    return { ...partido, boxscore: null };
                }
            })
        );

        renderizarPartidosRecientes();
    } catch (error) {
        console.error('Error cargando partidos:', error);
        container.innerHTML = `
            <div class="empty-state">
                <h4>⚠️ Error cargando juegos del torneo</h4>
                <button onclick="cargarPartidosRecientes()" class="btn-secondary" style="margin-top: 10px;">🔄 Reintentar</button>
            </div>`;
    }
}

function renderizarPartidosRecientes() {
    const container = document.getElementById('recentGamesContainer');
    const summary = document.getElementById('teamGamesSummary');
    const games = Array.isArray(teamGamesWithBoxscore) && teamGamesWithBoxscore.length ? teamGamesWithBoxscore : recentGames;

    if (!games || games.length === 0) {
        if (summary) {
            summary.innerHTML = `
                <div class="collective-stat-card">
                    <span class="collective-stat-title">Calendario</span>
                    <span class="collective-stat-value">0</span>
                    <span class="collective-stat-desc">Sin juegos registrados</span>
                </div>
                <div class="collective-stat-card">
                    <span class="collective-stat-title">Boxscores</span>
                    <span class="collective-stat-value">0</span>
                    <span class="collective-stat-desc">Todavía no hay carga oficial</span>
                </div>
                <div class="collective-stat-card">
                    <span class="collective-stat-title">Balance</span>
                    <span class="collective-stat-value">--</span>
                    <span class="collective-stat-desc">Esperando apertura del torneo</span>
                </div>
            `;
        }
        container.innerHTML = '<div class="empty-state">No hay juegos registrados para este equipo en el torneo seleccionado.</div>';
        return;
    }

    const finalizados = games.filter((partido) => partido.carreras_local !== null && partido.carreras_visitante !== null);
    const boxscoresCargados = games.filter((partido) => partido.boxscore?.resumen?.boxscore_cargado).length;
    const wins = finalizados.filter((partido) => {
        const esLocal = partido.equipo_local_id == currentTeamId;
        const carrerasEquipo = esLocal ? Number(partido.carreras_local) : Number(partido.carreras_visitante);
        const carrerasRival = esLocal ? Number(partido.carreras_visitante) : Number(partido.carreras_local);
        return carrerasEquipo > carrerasRival;
    }).length;
    const losses = Math.max(0, finalizados.length - wins);

    if (summary) {
        summary.innerHTML = `
            <div class="collective-stat-card">
                <span class="collective-stat-title">Calendario</span>
                <span class="collective-stat-value">${games.length}</span>
                <span class="collective-stat-desc">${finalizados.length} finalizado(s) y ${Math.max(0, games.length - finalizados.length)} pendiente(s)</span>
            </div>
            <div class="collective-stat-card">
                <span class="collective-stat-title">Boxscores</span>
                <span class="collective-stat-value">${boxscoresCargados}</span>
                <span class="collective-stat-desc">${boxscoresCargados === games.length ? 'Todos sincronizados' : 'Carga oficial en progreso'}</span>
            </div>
            <div class="collective-stat-card">
                <span class="collective-stat-title">Balance</span>
                <span class="collective-stat-value">${wins}-${losses}</span>
                <span class="collective-stat-desc">Récord del bloque mostrado</span>
            </div>
        `;
    }

    container.innerHTML = `<div class="team-games-grid">${games.map(partido => {
        const esLocal = partido.equipo_local_id == currentTeamId;
        const equipoRival = esLocal ? partido.equipo_visitante_nombre : partido.equipo_local_nombre;
        const resultado = obtenerResultadoPartido(partido, esLocal);
        const fechaFormateada = formatearFecha(partido.fecha_partido);
        const rol = esLocal ? 'Local' : 'Visitante';
        const estado = partido.estado || 'programado';
        const boxscore = partido.boxscore;
        const resumen = boxscore?.resumen || null;
        const isWin = resultado.startsWith('G');
        const isLoss = resultado.startsWith('P');
        const resultClass = resultado === 'Pendiente' ? 'pending' : isWin ? 'win' : isLoss ? 'loss' : '';
        const hitsEquipo = resumen
            ? esLocal
                ? toNumber(resumen.total_hits_local)
                : toNumber(resumen.total_hits_visitante)
            : null;
        const errorsEquipo = resumen
            ? esLocal
                ? toNumber(resumen.total_errors_local)
                : toNumber(resumen.total_errors_visitante)
            : null;
        const hrEquipo = resumen
            ? esLocal
                ? toNumber(resumen.total_hr_local)
                : toNumber(resumen.total_hr_visitante)
            : null;
        const boxscoreState = resumen?.boxscore_cargado
            ? `Boxscore cargado • H ${hitsEquipo} • E ${errorsEquipo} • HR ${hrEquipo}`
            : (estado === 'finalizado'
                ? 'Juego finalizado, boxscore pendiente por cargar'
                : 'Partido programado, todavía sin boxscore');
        const ctaLabel = resumen?.boxscore_cargado ? 'Abrir boxscore →' : 'Ver partido →';

        return `
            <article class="team-game-card">
                <div class="team-game-card-head">
                    <div>
                        <span class="team-game-stage">${escapeHtml(rol)} • ${escapeHtml(estado)}</span>
                        <div class="team-game-date">${escapeHtml(fechaFormateada)}${partido.hora ? ` • ${escapeHtml(partido.hora.slice(0, 5))}` : ''}</div>
                    </div>
                    <span class="team-game-result ${resultClass}">${escapeHtml(resultado)}</span>
                </div>
                <div class="team-game-rival">
                    <strong>vs ${escapeHtml(equipoRival || 'Rival pendiente')}</strong>
                    <small>${escapeHtml((currentTorneoId ? (allTorneos.find((torneo) => String(torneo.id) === String(currentTorneoId))?.nombre || 'Torneo seleccionado') : 'Archivo general'))}</small>
                </div>
                <div class="team-game-meta">
                    <div class="team-game-metric">
                        <span class="team-game-metric-label">Marcador</span>
                        <span class="team-game-metric-value">${partido.carreras_local !== null && partido.carreras_visitante !== null ? `${escapeHtml(String(partido.carreras_local))}-${escapeHtml(String(partido.carreras_visitante))}` : 'Pendiente'}</span>
                    </div>
                    <div class="team-game-metric">
                        <span class="team-game-metric-label">Hits</span>
                        <span class="team-game-metric-value">${resumen?.boxscore_cargado ? hitsEquipo : '--'}</span>
                    </div>
                    <div class="team-game-metric">
                        <span class="team-game-metric-label">Errores</span>
                        <span class="team-game-metric-value">${resumen?.boxscore_cargado ? errorsEquipo : '--'}</span>
                    </div>
                </div>
                <div class="team-game-footer">
                    <span class="team-game-boxscore-state">${escapeHtml(boxscoreState)}</span>
                    <a class="team-game-link" href="partido.html?id=${partido.id}">${escapeHtml(ctaLabel)}</a>
                </div>
            </article>`;
    }).join('')}</div>`;
}

// ===================================
// SSE - REAL TIME UPDATES
// ===================================

function conectarSSE() {
    if (typeof EventSource === 'undefined') return;

    try {
        sseConnection = new EventSource('/api/sse/updates');

        sseConnection.addEventListener('stats-update', function (e) {
            console.log('[SSE] Stats update recibido');
            // Reload collective stats and top players
            cargarEstadisticasColectivas();
            cargarTopBateadores();
            cargarTopLanzadores();
        });

        sseConnection.addEventListener('tournament-change', function (e) {
            console.log('[SSE] Tournament change recibido');
            cargarTorneos(); // Reload tournaments and all data
        });

        sseConnection.addEventListener('general-update', function (e) {
            console.log('[SSE] General update recibido');
            cargarTodosLosDatos();
        });

        sseConnection.onerror = function () {
            console.warn('[SSE] Error de conexión, reintentando...');
        };
    } catch (error) {
        console.warn('[SSE] No se pudo conectar:', error);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function () {
    if (sseConnection) {
        sseConnection.close();
        sseConnection = null;
    }
});

// ===================================
// UTILITY FUNCTIONS
// ===================================

function formatearPosicion(posicion) {
    const posiciones = {
        'P': 'Pitcher', 'C': 'Catcher',
        '1B': 'Primera Base', '2B': 'Segunda Base',
        '3B': 'Tercera Base', 'SS': 'Shortstop',
        'SF': 'Short Field',
        'LF': 'Left Field', 'CF': 'Center Field', 'RF': 'Right Field',
        'UTIL': 'Utilidad'
    };
    return posiciones[posicion] || posicion || 'N/A';
}

function formatearFecha(fechaString) {
    if (!fechaString) return 'Fecha no disp.';
    const date = new Date(fechaString + 'T00:00:00Z');
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function calcularRacha(partidos) {
    const finalizados = Array.isArray(partidos)
        ? partidos.filter(p => p.carreras_local !== null && p.carreras_visitante !== null) : [];
    if (finalizados.length === 0) return null;

    finalizados.sort((a, b) => {
        return new Date(`${b.fecha_partido}T00:00:00Z`).getTime() - new Date(`${a.fecha_partido}T00:00:00Z`).getTime();
    });

    const resultado = (p) => {
        const esLocal = p.equipo_local_id == currentTeamId;
        const ce = esLocal ? p.carreras_local : p.carreras_visitante;
        const cr = esLocal ? p.carreras_visitante : p.carreras_local;
        return ce > cr ? 'W' : 'L';
    };

    let racha = 0, signo = null;
    for (const juego of finalizados) {
        const res = resultado(juego);
        if (!signo) { signo = res; racha = 1; continue; }
        if (res === signo) racha++;
        else break;
    }
    return signo ? `${signo}${racha}` : null;
}

function obtenerResultadoPartido(partido, esLocal) {
    if (partido.carreras_local === null || partido.carreras_visitante === null) return 'Pendiente';
    const ce = esLocal ? partido.carreras_local : partido.carreras_visitante;
    const cr = esLocal ? partido.carreras_visitante : partido.carreras_local;
    return `${ce > cr ? 'G' : 'P'} ${ce}-${cr}`;
}

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function setTextContent(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = value;
}

function verJugador(jugadorId) {
    const jugador = rosterData.find(j => j.id === jugadorId);
    if (!jugador) { alert('Información del jugador no disponible'); return; }

    const nombreAmigable = jugador.nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    window.location.href = `jugador.html?id=${jugadorId}&nombre=${nombreAmigable}&equipo=${currentTeamId}`;
}

function mostrarErrorEquipo(mensaje) {
    const mainCard = document.querySelector('.team-main-card');
    if (!mainCard) return;
    mainCard.innerHTML = `
        <div style="text-align:center;padding:40px 20px;">
            <h2 style="color:#f44336;margin-bottom:20px;">⚠️ Error</h2>
            <p style="color:#fff;margin-bottom:20px;">${mensaje}</p>
            <div style="display:flex;gap:15px;justify-content:center;flex-wrap:wrap;">
                <button onclick="location.reload()" class="btn-primary">🔄 Reintentar</button>
                <a href="index.html" class="btn-secondary">🏠 Volver al Inicio</a>
            </div>
        </div>`;

    const contentGrid = document.querySelector('.content-grid');
    const recentGames = document.querySelector('.recent-games');
    if (contentGrid) contentGrid.style.display = 'none';
    if (recentGames) recentGames.style.display = 'none';
}

console.log('✅ equipo_v2.js cargado correctamente');
