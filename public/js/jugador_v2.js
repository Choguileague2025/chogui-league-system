// ===================================
// JUGADOR V2 - Página moderna con tabs, gráficos y SSE
// ===================================

const urlParams = new URLSearchParams(window.location.search);
const jugadorId = urlParams.get('id');

let currentTournamentId = null;
let playerData = null;
let offensiveChart = null;
let radarChart = null;
let chartJsLoaded = false;

async function loadChartJs() {
    if (chartJsLoaded || typeof Chart !== 'undefined') {
        chartJsLoaded = true;
        return;
    }

    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.onload = () => {
            chartJsLoaded = true;
            resolve();
        };
        script.onerror = () => {
            console.warn('Failed to load Chart.js');
            resolve();
        };
        document.head.appendChild(script);
    });
}

// ===================================
// INICIALIZACIÓN
// ===================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!jugadorId || isNaN(parseInt(jugadorId))) {
        showError('ID de jugador inválido o no encontrado en la URL.');
        return;
    }

    setupTabs();
    await loadTournaments();
    await loadPlayerInfo();
    setupSSE();
});

// ===================================
// UTILIDADES
// ===================================
function toNum(val) {
    return Number(val) || 0;
}

function showError(message) {
    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #ff9800;">
                <h2>⚠️ Error</h2>
                <p>${message}</p>
                <a href="index.html" style="color: #ffc107;">Volver al Inicio</a>
            </div>
        `;
    }
}

async function fetchSafe(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return null;
    }
}

function formatPos(pos) {
    const map = {
        'P': 'Pitcher', 'C': 'Catcher', '1B': 'Primera Base', '2B': 'Segunda Base',
        '3B': 'Tercera Base', 'SS': 'Shortstop', 'LF': 'Left Field',
        'CF': 'Center Field', 'RF': 'Right Field', 'UTIL': 'Utility'
    };
    return map[pos] || pos || 'N/A';
}

function getTeamLogo(teamName) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(teamName)}&background=ffc107&color=0d1117&size=120`;
}

function getPlayerAvatarByPosition(position) {
    const pos = String(position || '').toUpperCase();
    if (pos === 'P') return '/images/avatars/player-pitcher.svg';
    if (pos === 'C') return '/images/avatars/player-catcher.svg';
    if (['1B', '2B', '3B', 'SS'].includes(pos)) return '/images/avatars/player-infield.svg';
    if (['LF', 'CF', 'RF'].includes(pos)) return '/images/avatars/player-outfield.svg';
    return '/images/avatars/player-utility.svg';
}

function getInitials(name) {
    if (!name) return 'JG';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return words.slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setHtml(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function registerPlayerShareCard() {
    if (!window.ChoguiShare || !playerData) return;

    window.ChoguiShare.registerPage({
        getData: () => {
            const labels = [
                document.getElementById('headerLabel1')?.textContent || 'AVG',
                document.getElementById('headerLabel2')?.textContent || 'HR',
                document.getElementById('headerLabel3')?.textContent || 'RBI',
                document.getElementById('headerLabel4')?.textContent || 'OPS'
            ];

            const values = [
                document.getElementById('headerAVG')?.textContent || '---',
                document.getElementById('headerHR')?.textContent || '---',
                document.getElementById('headerRBI')?.textContent || '---',
                document.getElementById('headerOPS')?.textContent || '---'
            ];

            return {
                type: 'jugador',
                kicker: document.getElementById('playerHeroKicker')?.textContent || 'Perfil oficial del jugador',
                title: document.getElementById('playerHeroTitle')?.textContent || playerData.nombre || 'Perfil del jugador',
                subtitle: document.getElementById('playerHeroSubtitle')?.textContent || '',
                badge: document.getElementById('playerHeroBadgeMeta')?.textContent || playerData.equipo_nombre || 'Jugador oficial',
                meta: document.getElementById('playerPosition')?.textContent || formatPos(playerData.posicion),
                badgeLabel: document.getElementById('playerHeroBadgeLabel')?.textContent || 'Equipo',
                badgeValue: document.getElementById('playerHeroBadgeValue')?.textContent || '--',
                badgeMeta: document.getElementById('playerHeroBadgeMeta')?.textContent || playerData.equipo_nombre || '',
                logo: document.getElementById('heroPlayerLogo')?.src || getPlayerAvatarByPosition(playerData.posicion),
                secondaryLogo: playerData.equipo_id ? `/api/equipos/${playerData.equipo_id}/logo` : '',
                secondaryInitials: getInitials(playerData.equipo_nombre || 'Equipo'),
                initials: getInitials(playerData.nombre),
                fileName: `jugador-${playerData.nombre || 'perfil'}`,
                linkLabel: currentTournamentId ? 'Torneo activo' : 'Histórico oficial',
                metrics: labels.map((label, index) => ({
                    label,
                    value: values[index]
                }))
            };
        }
    });
}

function isPitcherPrimary() {
    return String(playerData?.posicion || '').toUpperCase() === 'P';
}

function getTournamentParam() {
    if (!currentTournamentId || currentTournamentId === 'todos') return '';
    return `&torneo_id=${currentTournamentId}`;
}

function setHeaderLabels(labels = ['AVG', 'HR', 'RBI', 'OPS']) {
    setText('headerLabel1', labels[0] || 'AVG');
    setText('headerLabel2', labels[1] || 'HR');
    setText('headerLabel3', labels[2] || 'RBI');
    setText('headerLabel4', labels[3] || 'OPS');
}

function setHeaderValues(values = ['---', '---', '---', '---']) {
    setText('headerAVG', values[0] ?? '---');
    setText('headerHR', values[1] ?? '---');
    setText('headerRBI', values[2] ?? '---');
    setText('headerOPS', values[3] ?? '---');
}

function getTeamBadgeMarkup(teamName) {
    return `<span class="team-badge-mini">${getInitials(teamName || 'EQ')}</span>`;
}

function getTeamLogoUrl(equipoId, equipoNombre) {
    const numericId = Number(equipoId);
    if (numericId) return `/api/equipos/${numericId}/logo`;
    if (!equipoNombre) return '/images/logos/default-logo.png';
    const nombreArchivo = equipoNombre
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') + '.png';
    return `/images/logos/${nombreArchivo}`;
}

function getTeamMediaMarkup(equipoId, equipoNombre) {
    const logoUrl = getTeamLogoUrl(equipoId, equipoNombre);
    const initials = getInitials(equipoNombre || 'EQ');
    return `
        <span class="team-media">
            <img src="${logoUrl}" alt="Logo ${equipoNombre || 'equipo'}" loading="lazy"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
            <span class="team-media-fallback" style="display:none;">${initials}</span>
        </span>
    `;
}

function renderRecentGamesCards(games = [], source = 'fallback') {
    const strip = document.getElementById('recentGamesStrip');
    if (!strip) return;

    if (!games.length) {
        strip.innerHTML = `
            <article class="recent-game-card empty">
                <span class="recent-game-date">Sin juegos</span>
                <strong>Esperando partidos oficiales</strong>
                <p>La lectura rápida del rendimiento partido a partido aparecerá aquí cuando el jugador tenga actividad registrada.</p>
            </article>
        `;
        return;
    }

    strip.innerHTML = games.slice(0, 3).map((game) => {
        const matchup = `${game.equipo_local_nombre || 'Local'} ${game.carreras_local ?? '-'} - ${game.carreras_visitante ?? '-'} ${game.equipo_visitante_nombre || 'Visitante'}`;
        const chips = source === 'boxscore'
            ? `
                <span class="recent-game-chip">H ${toNum(game.hits)}</span>
                <span class="recent-game-chip">RBI ${toNum(game.rbi)}</span>
                <span class="recent-game-chip">IP ${Number(game.innings_pitched || 0).toFixed(1)}</span>
              `
            : `
                <span class="recent-game-chip">Marcador oficial</span>
                <span class="recent-game-chip">${game.equipo_local_nombre || 'Local'} vs ${game.equipo_visitante_nombre || 'Visitante'}</span>
              `;

        return `
            <article class="recent-game-card">
                <span class="recent-game-date">${formatDateShort(game.fecha_partido)}</span>
                <strong>${matchup}</strong>
                <p>${game.torneo_nombre || (currentTournamentId === 'todos' ? 'Histórico oficial' : 'Torneo activo')}</p>
                <div class="recent-game-meta">${chips}</div>
                <a class="recent-game-link" href="partido.html?id=${game.partido_id || game.id}">Abrir boxscore →</a>
            </article>
        `;
    }).join('');
}

function renderScoutingHighlights({ rivales = [], trend = {}, torneos = [] } = {}) {
    const wrap = document.getElementById('scoutingHighlights');
    if (!wrap) return;

    if (!rivales.length && !torneos.length) {
        wrap.innerHTML = `
            <article class="scouting-highlight-card">
                <span class="scouting-highlight-label">Scouting pendiente</span>
                <strong>Esperando datos suficientes</strong>
                <p>Cuando el jugador acumule boxscore oficial, aquí aparecerán sus focos de scouting.</p>
            </article>
        `;
        return;
    }

    const sortedByAvg = [...rivales].sort((a, b) => (Number(b.avg) || 0) - (Number(a.avg) || 0));
    const sortedByOps = [...rivales].sort((a, b) => (Number(b.ops) || 0) - (Number(a.ops) || 0));
    const sortedByDifficulty = [...rivales].sort((a, b) => (Number(a.avg) || 0) - (Number(b.avg) || 0));
    const bestRival = sortedByAvg[0] || sortedByOps[0];
    const toughRival = sortedByDifficulty[0] || null;
    const bestTournament = [...torneos].sort((a, b) => (Number(b.ops) || 0) - (Number(a.ops) || 0))[0] || null;
    const trendLabel = trend.estado === 'subiendo' ? 'Subiendo' : (trend.estado === 'bajando' ? 'Bajando' : 'Estable');

    wrap.innerHTML = `
        <article class="scouting-highlight-card">
            <span class="scouting-highlight-label">Rival objetivo</span>
            <strong>${bestRival?.rival_nombre || 'Sin lectura todavía'}</strong>
            <p>${bestRival ? `AVG ${Number(bestRival.avg || 0).toFixed(3)} • OPS ${Number(bestRival.ops || 0).toFixed(3)} • ${toNum(bestRival.hits)} hits` : 'No hay muestra rival por rival suficiente.'}</p>
        </article>
        <article class="scouting-highlight-card">
            <span class="scouting-highlight-label">Rival más duro</span>
            <strong>${toughRival?.rival_nombre || 'Sin lectura todavía'}</strong>
            <p>${toughRival ? `AVG ${Number(toughRival.avg || 0).toFixed(3)} • ${toNum(toughRival.juegos)} juego(s) • tendencia ${trendLabel.toLowerCase()}` : 'Aún no hay un rival que marque una diferencia clara.'}</p>
        </article>
        <article class="scouting-highlight-card">
            <span class="scouting-highlight-label">Torneo más fuerte</span>
            <strong>${bestTournament?.torneo_nombre || 'En construcción'}</strong>
            <p>${bestTournament ? `OPS ${Number(bestTournament.ops || 0).toFixed(3)} • AVG ${Number(bestTournament.avg || 0).toFixed(3)} • ${toNum(bestTournament.hits)} hits` : 'Se activará cuando existan cortes por torneo con boxscore.'}</p>
        </article>
    `;
}

function renderVsTeamsCards(rivales = []) {
    const grid = document.getElementById('vsTeamsCards');
    if (!grid) return;

    if (!rivales.length) {
        grid.innerHTML = `
            <article class="recent-game-card empty">
                <span class="recent-game-date">Sin lectura</span>
                <strong>Esperando rivales</strong>
                <p>Las tarjetas de scouting rival aparecerán cuando el jugador tenga boxscore cruzado contra otros equipos.</p>
            </article>
        `;
        return;
    }

    grid.innerHTML = rivales.slice(0, 4).map((row) => `
        <article class="recent-game-card">
            <div class="card-head-inline">
                ${getTeamMediaMarkup(row.rival_id, row.rival_nombre || 'Rival')}
                <div class="card-head-copy">
                    <strong>${row.rival_nombre || 'Rival'}</strong>
                    <span>Scouting rival oficial</span>
                </div>
            </div>
            <span class="recent-game-date">AVG ${Number(row.avg || 0).toFixed(3)} • OPS ${Number(row.ops || 0).toFixed(3)}</span>
            <p>${toNum(row.juegos)} juego(s) contra este rival con ${toNum(row.hits)} hits y ${toNum(row.rbi)} impulsadas.</p>
            <div class="recent-game-meta">
                <span class="recent-game-chip">AB ${toNum(row.at_bats)}</span>
                <span class="recent-game-chip">HR ${toNum(row.home_runs)}</span>
                <span class="recent-game-chip">RBI ${toNum(row.rbi)}</span>
            </div>
        </article>
    `).join('');
}

function renderHistoricalExecutive({ tournaments = [], awardsDetail = [], career = {}, rivals = [] } = {}) {
    const wrap = document.getElementById('historicalExecutiveSummary');
    const awardsWrap = document.getElementById('historicalAwardsVisual');
    if (!wrap || !awardsWrap) return;

    const bestTournament = tournaments.length
        ? [...tournaments].sort((a, b) => ((toNum(b.hits) + toNum(b.home_runs) * 2 + toNum(b.rbi)) - (toNum(a.hits) + toNum(a.home_runs) * 2 + toNum(a.rbi))))[0]
        : null;
    const bestRival = rivals.length
        ? [...rivals].sort((a, b) => (Number(b.avg) || 0) - (Number(a.avg) || 0))[0]
        : null;
    const totalTitles = toNum(career?.awards?.total);
    const totalTournaments = tournaments.length;

    wrap.innerHTML = `
        <article class="historical-executive-card">
            <span class="scouting-highlight-label">Mejor torneo</span>
            <strong>${bestTournament?.torneo_nombre || 'Sin histórico suficiente'}</strong>
            <p>${bestTournament ? `${toNum(bestTournament.hits)} hits • ${toNum(bestTournament.home_runs)} HR • ${toNum(bestTournament.rbi)} RBI` : 'Se activará cuando el jugador tenga más torneos acumulados.'}</p>
        </article>
        <article class="historical-executive-card">
            <span class="scouting-highlight-label">Mejor rival histórico</span>
            <strong>${bestRival?.rival_nombre || 'Sin lectura cruzada'}</strong>
            <p>${bestRival ? `AVG ${Number(bestRival.avg || 0).toFixed(3)} • ${toNum(bestRival.hits)} hits en ${toNum(bestRival.juegos)} juego(s)` : 'Aún no hay suficiente scouting histórico rival por rival.'}</p>
        </article>
        <article class="historical-executive-card">
            <span class="scouting-highlight-label">Palmarés global</span>
            <strong>${totalTitles} título(s) • ${totalTournaments} torneo(s)</strong>
            <p>AVG ${Number(career?.batting?.avg || 0).toFixed(3)} • OPS ${Number(career?.batting?.ops || 0).toFixed(3)} • ERA ${Number(career?.pitching?.era || 0).toFixed(2)}</p>
        </article>
    `;

    awardsWrap.innerHTML = awardsDetail.length
        ? awardsDetail.map((row) => `
            <span class="award-visual-chip">
                ${row.lado === 'ofensiva' ? '🏅' : '🛡️'}
                ${row.posicion || 'UTIL'} • ${toNum(row.titulos)} título(s)
            </span>
        `).join('')
        : '<span class="recent-game-chip">Sin palmarés posicional todavía</span>';
}

function formatDateShort(dateValue) {
    if (!dateValue) return '--';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ===================================
// PESTAÑAS
// ===================================
function setupTabs() {
    const tabs = document.querySelectorAll('.player-tab');
    const panels = document.querySelectorAll('.player-tab-panel');
    const quickNav = document.querySelectorAll('[data-jump-tab]');

    function activateTab(target) {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        quickNav.forEach(btn => btn.classList.remove('active'));

        const tabButton = document.querySelector(`.player-tab[data-tab="${target}"]`);
        const panel = document.getElementById(`tab-${target}`);
        const quickButton = document.querySelector(`.page-quicknav-link[data-jump-tab="${target}"]`);

        if (tabButton) tabButton.classList.add('active');
        if (panel) panel.classList.add('active');
        if (quickButton) quickButton.classList.add('active');
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            activateTab(tab.dataset.tab);
        });
    });

    quickNav.forEach(btn => {
        btn.addEventListener('click', () => {
            activateTab(btn.dataset.jumpTab);
            document.querySelector('.player-tab-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

// ===================================
// TORNEOS
// ===================================
async function loadTournaments() {
    try {
        const torneos = await fetchSafe('/api/torneos/publicos');
        if (!torneos) return;

        const select = document.getElementById('tournamentSelect');
        if (!torneos.length) {
            select.innerHTML = '<option value="">Archivo disponible</option>';
            select.disabled = true;
            currentTournamentId = null;
            return;
        }

        select.disabled = false;
        select.innerHTML = '<option value="todos">Todos los torneos</option>';

        torneos.forEach(torneo => {
            const option = document.createElement('option');
            option.value = torneo.id;
            option.textContent = torneo.nombre + (torneo.activo ? ' (Activo)' : '');
            if (torneo.activo) {
                option.selected = true;
                currentTournamentId = torneo.id;
            }
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            currentTournamentId = e.target.value === 'todos' ? 'todos' : parseInt(e.target.value);
            loadAllStats();
        });
    } catch (error) {
        console.error('Error cargando torneos:', error);
    }
}

// ===================================
// INFO DEL JUGADOR
// ===================================
async function loadPlayerInfo() {
    try {
        const player = await fetchSafe(`/api/jugadores/${jugadorId}`);
        if (!player) {
            showError('Jugador no encontrado');
            return;
        }

        playerData = player;
        document.title = `${player.nombre} - Chogui League`;

        const playerNumber = player.numero ? `#${player.numero}` : '#--';
        const playerPosition = formatPos(player.posicion);
        const playerTeam = player.equipo_nombre || 'Sin equipo';
        const teamInitials = playerTeam && playerTeam !== 'Sin equipo' ? getInitials(playerTeam) : '--';

        setText('playerHeroTitle', player.nombre);
        setText('playerHeroSubtitle', `${playerNumber} • ${playerPosition} • ${playerTeam}`);
        setText('playerHeroBadgeLabel', 'Equipo');
        setText('playerHeroBadgeValue', teamInitials);
        setText('playerHeroBadgeMeta', playerTeam);

        // Header info
        document.getElementById('playerName').textContent = player.nombre;
        document.getElementById('playerNumber').textContent = player.numero ? `#${player.numero}` : '#--';
        document.getElementById('playerPosition').textContent = formatPos(player.posicion);
        document.getElementById('playerTeamName').textContent = player.equipo_nombre || 'Sin equipo';
        setHeaderLabels(isPitcherPrimary() ? ['ERA', 'WHIP', 'SO', 'IP'] : ['AVG', 'HR', 'RBI', 'OPS']);

        // Breadcrumbs
        const teamBreadcrumb = document.getElementById('teamBreadcrumbLink');
        if (player.equipo_id) {
            teamBreadcrumb.innerHTML = `<a href="equipo.html?id=${player.equipo_id}">${player.equipo_nombre}</a>`;
        } else {
            teamBreadcrumb.textContent = 'Sin equipo';
        }
        document.getElementById('playerBreadcrumb').textContent = player.nombre;

        // Avatar del jugador por posición
        const logoEl = document.getElementById('teamLogo');
        const heroLogo = document.getElementById('heroPlayerLogo');
        const avatarUrl = getPlayerAvatarByPosition(player.posicion);
        if (logoEl) {
            logoEl.style.backgroundImage = `url('${avatarUrl}')`;
            logoEl.style.backgroundSize = 'cover';
            logoEl.style.backgroundPosition = 'center';
            logoEl.style.backgroundRepeat = 'no-repeat';
            logoEl.style.backgroundColor = '#0f1726';
            logoEl.innerHTML = '';
        }
        if (heroLogo) {
            heroLogo.src = avatarUrl;
            heroLogo.alt = `Avatar de ${player.nombre}`;
        }

        registerPlayerShareCard();

        // Navigation
        const backBtn = document.getElementById('backToTeamButton');
        if (backBtn) {
            backBtn.href = player.equipo_id ? `equipo.html?id=${player.equipo_id}` : '#';
            backBtn.style.display = player.equipo_id ? 'inline-block' : 'none';
        }

        await loadAllStats();
    } catch (error) {
        console.error('Error cargando jugador:', error);
        showError('Error al cargar datos del jugador');
    }
}

// ===================================
// CARGAR TODAS LAS STATS
// ===================================
async function loadAllStats() {
    if (!currentTournamentId) {
        setHtml('offensiveTableBody', '<tr><td colspan="12" class="empty-state-v2">Esperando nuevo torneo público</td></tr>');
        setHtml('pitchingTableBody', '<tr><td colspan="11" class="empty-state-v2">Esperando nuevo torneo público</td></tr>');
        setHtml('defensiveTableBody', '<tr><td colspan="7" class="empty-state-v2">Esperando nuevo torneo público</td></tr>');
        await Promise.all([loadHistoricalStats(), loadGameLog('')]);
        return;
    }

    const torneoParam = getTournamentParam();
    const tasks = [
        loadOffensiveStats(torneoParam),
        loadPitchingStats(torneoParam),
        loadDefensiveStats(torneoParam),
        loadComparison(torneoParam),
        loadPlayerScouting(torneoParam),
        loadPlayerInsights(torneoParam),
        loadHistoricalStats(),
        loadGameLog(torneoParam)
    ];

    const results = await Promise.allSettled(tasks);
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`Error cargando módulo de jugador #${index + 1}:`, result.reason);
        }
    });

    registerPlayerShareCard();
}

async function loadHistoricalStats() {
    const [data, rivalData] = await Promise.all([
        fetchSafe(`/api/jugadores/${jugadorId}/historico`),
        fetchSafe(`/api/jugadores/${jugadorId}/vs-equipos`)
    ]);
    const career = data?.career;
    const tournaments = Array.isArray(data?.by_tournament) ? data.by_tournament : [];
    const awards = career?.awards || {};
    const awardsDetail = Array.isArray(awards.detalle) ? awards.detalle : [];
    const rivals = Array.isArray(rivalData?.rivales) ? rivalData.rivales : [];

    if (!career) {
        document.getElementById('careerAvg').textContent = '.000';
        document.getElementById('careerOps').textContent = '.000';
        document.getElementById('careerEra').textContent = '0.00';
        document.getElementById('careerFpct').textContent = '.000';
        document.getElementById('careerAwardsTotal').textContent = '0';
        document.getElementById('careerAwardsOffense').textContent = '0';
        document.getElementById('careerAwardsDefense').textContent = '0';
        renderHistoricalExecutive();
        document.getElementById('historicalAwardsBody').innerHTML = '<tr><td colspan="4" class="empty-state-v2">Sin palmarés disponible</td></tr>';
        document.getElementById('historicalTableBody').innerHTML = '<tr><td colspan="10" class="empty-state-v2">Sin histórico disponible</td></tr>';
        return;
    }

    document.getElementById('careerAvg').textContent = Number(career.batting?.avg || 0).toFixed(3);
    document.getElementById('careerOps').textContent = Number(career.batting?.ops || 0).toFixed(3);
    document.getElementById('careerEra').textContent = Number(career.pitching?.era || 0).toFixed(2);
    document.getElementById('careerFpct').textContent = Number(career.fielding?.fielding_percentage || 0).toFixed(3);
    document.getElementById('careerAwardsTotal').textContent = toNum(awards.total);
    document.getElementById('careerAwardsOffense').textContent = toNum(awards.ofensivos);
    document.getElementById('careerAwardsDefense').textContent = toNum(awards.defensivos);
    renderHistoricalExecutive({ tournaments, awardsDetail, career: { ...career, awards }, rivals });

    document.getElementById('historicalAwardsBody').innerHTML = awardsDetail.length
        ? awardsDetail.map((row) => `
            <tr>
                <td>${row.lado === 'ofensiva' ? 'Ofensiva' : 'Defensiva'}</td>
                <td>${row.posicion || 'UTIL'}</td>
                <td>${toNum(row.titulos)}</td>
                <td>${row.ultimo_torneo || 'Sin torneo'}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="4" class="empty-state-v2">Este jugador todavía no tiene títulos posicionales registrados</td></tr>';

    document.getElementById('historicalTableBody').innerHTML = tournaments.length
        ? tournaments.map(row => `
            <tr>
                <td>${row.torneo_nombre || 'Sin torneo'}</td>
                <td>${toNum(row.at_bats)}</td>
                <td>${toNum(row.hits)}</td>
                <td>${toNum(row.home_runs)}</td>
                <td>${toNum(row.rbi)}</td>
                <td>${toNum(row.runs)}</td>
                <td>${Number(row.innings_pitched || 0).toFixed(1)}</td>
                <td>${toNum(row.wins)}-${toNum(row.losses)}</td>
                <td>${toNum(row.chances)}</td>
                <td>${toNum(row.errors)}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="10" class="empty-state-v2">Aún no hay torneos con histórico acumulado</td></tr>';
}

async function loadGameLog(torneoParam) {
    const query = torneoParam ? `?${torneoParam.replace(/^&/, '')}` : '';
    const [data, fallbackGames] = await Promise.all([
        fetchSafe(`/api/jugadores/${jugadorId}/game-log${query}`),
        fetchSafe(`/api/jugadores/${jugadorId}/partidos${query}`)
    ]);
    const games = Array.isArray(data?.games) ? data.games : [];
    const fallback = Array.isArray(fallbackGames) ? fallbackGames : [];
    const tbody = document.getElementById('gameLogTableBody');

    if (!games.length && !fallback.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state-v2">Sin game log cargado todavía</td></tr>';
        renderRecentGamesCards([]);
        return;
    }

    if (games.length) {
        renderRecentGamesCards(games, 'boxscore');
        tbody.innerHTML = games.map(game => {
            const matchup = `${game.equipo_local_nombre || 'Local'} ${game.carreras_local ?? '-'} - ${game.carreras_visitante ?? '-'} ${game.equipo_visitante_nombre || 'Visitante'}`;
            return `
                <tr>
                    <td>${formatDateShort(game.fecha_partido)}</td>
                    <td>${matchup}</td>
                    <td>${game.torneo_nombre || 'Sin torneo'}</td>
                    <td>${toNum(game.hits)}</td>
                    <td>${toNum(game.rbi)}</td>
                    <td>${toNum(game.runs)}</td>
                    <td>${Number(game.innings_pitched || 0).toFixed(1)}</td>
                    <td>${toNum(game.pitch_strikeouts)}</td>
                    <td>${toNum(game.chances)}</td>
                    <td>${toNum(game.errors)}</td>
                    <td><a class="boxscore-player-link" href="partido.html?id=${game.partido_id}">Abrir</a></td>
                </tr>
            `;
        }).join('');
        return;
    }

    renderRecentGamesCards(fallback, 'fallback');
    tbody.innerHTML = fallback.map(game => {
        const matchup = `${game.equipo_local_nombre || 'Local'} ${game.carreras_local ?? '-'} - ${game.carreras_visitante ?? '-'} ${game.equipo_visitante_nombre || 'Visitante'}`;
        return `
            <tr>
                <td>${formatDateShort(game.fecha_partido)}</td>
                <td>${matchup}</td>
                <td>${game.torneo_nombre || (currentTournamentId === 'todos' ? 'Histórico' : 'Torneo actual')}</td>
                <td>--</td>
                <td>--</td>
                <td>--</td>
                <td>--</td>
                <td>--</td>
                <td>--</td>
                <td>--</td>
                <td><a class="boxscore-player-link" href="partido.html?id=${game.id}">Abrir</a></td>
            </tr>
        `;
    }).join('');
}

async function loadPlayerInsights(torneoParam) {
    const query = torneoParam ? `?${torneoParam.replace(/^&/, '')}` : '';
    const [allOffensive, allPitching, playerGames] = await Promise.all([
        fetchSafe(`/api/estadisticas-ofensivas?min_at_bats=1${torneoParam}`),
        fetchSafe(`/api/estadisticas-pitcheo${query}`),
        fetchSafe(`/api/jugadores/${jugadorId}/partidos${query}`)
    ]);

    const insightOpsRank = document.getElementById('insightOpsRank');
    const insightOpsMeta = document.getElementById('insightOpsMeta');
    const insightProfile = document.getElementById('insightProfile');
    const insightProfileMeta = document.getElementById('insightProfileMeta');
    const insightStatus = document.getElementById('insightStatus');
    const insightStatusMeta = document.getElementById('insightStatusMeta');

    const statsList = Array.isArray(allOffensive) ? allOffensive : [];
    const playerStats = statsList.find(s => String(s.jugador_id) === String(jugadorId));

    if (!playerStats) {
        const pitchingList = Array.isArray(allPitching) ? allPitching : [];
        const playerPitching = pitchingList.find(s => String(s.jugador_id) === String(jugadorId));
        if (playerPitching) {
            const ip = Number(playerPitching.innings_pitched || 0);
            const so = toNum(playerPitching.strikeouts);
            const era = Number(playerPitching.era || 0).toFixed(2);
            const whip = Number(playerPitching.whip || 0).toFixed(2);
            const rankedEra = [...pitchingList]
                .filter((row) => Number(row.innings_pitched || 0) > 0)
                .sort((a, b) => (Number(a.era) || 999) - (Number(b.era) || 999));
            const pitchRank = rankedEra.findIndex((row) => String(row.jugador_id) === String(jugadorId)) + 1;

            if (insightOpsRank) insightOpsRank.textContent = pitchRank ? `#${pitchRank}` : '--';
            if (insightOpsMeta) insightOpsMeta.textContent = ip > 0 ? `ERA ${era} • WHIP ${whip}` : 'Sin innings suficientes';
            if (insightProfile) insightProfile.textContent = ip >= 4 ? 'Brazo en rotación' : 'Brazo en desarrollo';
            if (insightProfileMeta) insightProfileMeta.textContent = `IP ${ip.toFixed(1)} • SO ${so}`;
            if (insightStatus) insightStatus.textContent = ip > 0 ? 'Pitcher activo' : 'Pendiente';
            if (insightStatusMeta) insightStatusMeta.textContent = games ? `${games} partidos vinculados al jugador` : 'Sin partidos vinculados todavía';
            return;
        }

        if (insightOpsRank) insightOpsRank.textContent = '--';
        if (insightOpsMeta) insightOpsMeta.textContent = 'Sin turnos oficiales suficientes';
        if (insightProfile) insightProfile.textContent = 'Sin muestra';
        if (insightProfileMeta) insightProfileMeta.textContent = 'Carga estadísticas para activar el perfil';
        if (insightStatus) insightStatus.textContent = 'Pendiente';
        if (insightStatusMeta) insightStatusMeta.textContent = 'Sin estadísticas del torneo';
        return;
    }

    const ranked = [...statsList].sort((a, b) => (Number(b.ops) || 0) - (Number(a.ops) || 0));
    const rank = ranked.findIndex(s => String(s.jugador_id) === String(jugadorId)) + 1;
    const total = ranked.length;
    const avg = Number(playerStats.avg) || 0;
    const ops = Number(playerStats.ops) || 0;
    const hr = toNum(playerStats.home_runs);
    const sb = toNum(playerStats.stolen_bases);
    const games = Array.isArray(playerGames?.partidos) ? playerGames.partidos.length : (Array.isArray(playerGames) ? playerGames.length : 0);

    let profile = 'Contacto';
    if (ops >= 0.9 && hr >= 3) profile = 'Poder elite';
    else if (ops >= 0.8) profile = 'Productor';
    else if (avg >= 0.32 && sb >= 3) profile = 'Motor ofensivo';
    else if (avg >= 0.3) profile = 'Bate seguro';

    let status = 'En desarrollo';
    if (rank > 0 && rank <= 3) status = 'Top de liga';
    else if (rank > 0 && rank <= Math.ceil(total * 0.25)) status = 'Zona alta';
    else if (games > 0) status = 'Activo';

    if (insightOpsRank) insightOpsRank.textContent = rank ? `#${rank}` : '--';
    if (insightOpsMeta) insightOpsMeta.textContent = total ? `entre ${total} jugadores elegibles • OPS ${ops.toFixed(3)}` : 'Sin ranking disponible';
    if (insightProfile) insightProfile.textContent = profile;
    if (insightProfileMeta) insightProfileMeta.textContent = `AVG ${avg.toFixed(3)} • HR ${hr} • SB ${sb}`;
    if (insightStatus) insightStatus.textContent = status;
    if (insightStatusMeta) insightStatusMeta.textContent = games ? `${games} partidos vinculados al jugador` : 'Sin partidos vinculados todavía';
}

// ===================================
// OFENSIVAS
// ===================================
async function loadOffensiveStats(torneoParam) {
    const data = await fetchSafe(`/api/estadisticas-ofensivas?jugador_id=${jugadorId}${torneoParam}`);

    const stats = Array.isArray(data) ? data.find(s => String(s.jugador_id) === String(jugadorId)) || data[0] : data;

    if (!stats) {
        document.getElementById('statAVG').textContent = '.000';
        document.getElementById('statOBP').textContent = '.000';
        document.getElementById('statSLG').textContent = '.000';
        document.getElementById('statOPS').textContent = '.000';
        if (!isPitcherPrimary()) {
            setHeaderLabels(['AVG', 'HR', 'RBI', 'OPS']);
            setHeaderValues(['---', '0', '0', '---']);
        }
        document.getElementById('offensiveTableBody').innerHTML = '<tr><td colspan="12" class="empty-state-v2">Sin estadísticas ofensivas</td></tr>';
        return;
    }

    const ab = toNum(stats.at_bats);
    const h = toNum(stats.hits);
    const d = toNum(stats.doubles);
    const t = toNum(stats.triples);
    const hr = toNum(stats.home_runs);
    const rbi = toNum(stats.rbi);
    const r = toNum(stats.runs);
    const bb = toNum(stats.walks);
    const so = toNum(stats.strikeouts);
    const sb = toNum(stats.stolen_bases);
    const hbp = toNum(stats.hit_by_pitch);
    const sf = toNum(stats.sacrifice_flies);

    const avg = ab > 0 ? (h / ab) : 0;
    const obp = (ab + bb + hbp + sf) > 0 ? ((h + bb + hbp) / (ab + bb + hbp + sf)) : 0;
    const singles = h - d - t - hr;
    const slg = ab > 0 ? ((singles + d * 2 + t * 3 + hr * 4) / ab) : 0;
    const ops = obp + slg;

    // Cards
    document.getElementById('statAVG').textContent = avg.toFixed(3);
    document.getElementById('statOBP').textContent = obp.toFixed(3);
    document.getElementById('statSLG').textContent = slg.toFixed(3);
    document.getElementById('statOPS').textContent = ops.toFixed(3);

    // Header stats
    if (!isPitcherPrimary()) {
        setHeaderLabels(['AVG', 'HR', 'RBI', 'OPS']);
        setHeaderValues([avg.toFixed(3), String(hr), String(rbi), ops.toFixed(3)]);
    }

    // Table
    document.getElementById('offensiveTableBody').innerHTML = `
        <tr>
            <td>${ab}</td><td>${h}</td><td>${d}</td><td>${t}</td><td>${hr}</td>
            <td>${rbi}</td><td>${r}</td><td>${bb}</td><td>${so}</td><td>${sb}</td>
            <td>${hbp}</td><td>${sf}</td>
        </tr>
    `;

    // Chart
    createOffensiveChart({ h, d, t, hr, bb, so, sb });
}

// ===================================
// PITCHEO
// ===================================
async function loadPitchingStats(torneoParam) {
    const data = await fetchSafe(`/api/estadisticas-pitcheo?jugador_id=${jugadorId}${torneoParam}`);

    const stats = Array.isArray(data) ? data.find(s => String(s.jugador_id) === String(jugadorId)) || data[0] : data;

    if (!stats) {
        document.getElementById('statERA').textContent = '0.00';
        document.getElementById('statWL').textContent = '0-0';
        document.getElementById('statPitchSO').textContent = '0';
        document.getElementById('statWHIP').textContent = '0.00';
        if (isPitcherPrimary()) {
            setHeaderLabels(['ERA', 'WHIP', 'SO', 'IP']);
            setHeaderValues(['0.00', '0.00', '0', '0.0']);
        }
        document.getElementById('pitchingTableBody').innerHTML = '<tr><td colspan="11" class="empty-state-v2">Sin estadísticas de pitcheo</td></tr>';
        return;
    }

    const ip = parseFloat(stats.innings_pitched) || 0;
    const ha = toNum(stats.hits_allowed);
    const er = toNum(stats.earned_runs);
    const bba = toNum(stats.walks_allowed);
    const so = toNum(stats.strikeouts);
    const hra = toNum(stats.home_runs_allowed);
    const w = toNum(stats.wins);
    const l = toNum(stats.losses);
    const sv = toNum(stats.saves);

    const era = ip > 0 ? ((er * 9) / ip) : 0;
    const whip = ip > 0 ? ((ha + bba) / ip) : 0;

    // Cards
    document.getElementById('statERA').textContent = era.toFixed(2);
    document.getElementById('statWL').textContent = `${w}-${l}`;
    document.getElementById('statPitchSO').textContent = so;
    document.getElementById('statWHIP').textContent = whip.toFixed(2);
    if (isPitcherPrimary()) {
        setHeaderLabels(['ERA', 'WHIP', 'SO', 'IP']);
        setHeaderValues([era.toFixed(2), whip.toFixed(2), String(so), ip.toFixed(1)]);
    }

    // Table
    document.getElementById('pitchingTableBody').innerHTML = `
        <tr>
            <td>${ip}</td><td>${ha}</td><td>${er}</td><td>${bba}</td>
            <td>${so}</td><td>${hra}</td><td>${w}</td><td>${l}</td>
            <td>${sv}</td><td>${era.toFixed(2)}</td><td>${whip.toFixed(2)}</td>
        </tr>
    `;
}

// ===================================
// DEFENSIVAS
// ===================================
async function loadDefensiveStats(torneoParam) {
    const data = await fetchSafe(`/api/estadisticas-defensivas?jugador_id=${jugadorId}${torneoParam}`);

    const stats = Array.isArray(data) ? data.find(s => String(s.jugador_id) === String(jugadorId)) || data[0] : data;

    if (!stats) {
        document.getElementById('statFPCT').textContent = '.000';
        document.getElementById('statPO').textContent = '0';
        document.getElementById('statA').textContent = '0';
        document.getElementById('statE').textContent = '0';
        document.getElementById('defensiveTableBody').innerHTML = '<tr><td colspan="7" class="empty-state-v2">Sin estadísticas defensivas</td></tr>';
        return;
    }

    const po = toNum(stats.putouts);
    const a = toNum(stats.assists);
    const e = toNum(stats.errors);
    const dp = toNum(stats.double_plays);
    const pb = toNum(stats.passed_balls);
    const ch = toNum(stats.chances);

    const fpct = ch > 0 ? ((po + a) / ch) : 0;

    // Cards
    document.getElementById('statFPCT').textContent = fpct.toFixed(3);
    document.getElementById('statPO').textContent = po;
    document.getElementById('statA').textContent = a;
    document.getElementById('statE').textContent = e;

    // Table
    document.getElementById('defensiveTableBody').innerHTML = `
        <tr>
            <td>${po}</td><td>${a}</td><td>${e}</td><td>${dp}</td>
            <td>${pb}</td><td>${ch}</td><td>${fpct.toFixed(3)}</td>
        </tr>
    `;
}

// ===================================
// COMPARACIÓN CON LÍDERES
// ===================================
async function loadComparison(torneoParam) {
    const container = document.getElementById('comparisonContainer');
    const vsTeamsBody = document.getElementById('vsTeamsBody');
    const vsTeamsCards = document.getElementById('vsTeamsCards');
    const similarPlayersChips = document.getElementById('similarPlayersChips');
    const comparePlayersBody = document.getElementById('comparePlayersBody');
    const compareBaseHeader = document.getElementById('compareBaseHeader');
    const compareRivalHeader = document.getElementById('compareRivalHeader');
    const comparisonFaceoffSummary = document.getElementById('comparisonFaceoffSummary');

    // Get all offensive stats to find leaders
    const directQuery = torneoParam ? `?${torneoParam.replace(/^&/, '')}` : '';
    const allOffensive = await fetchSafe(`/api/estadisticas-ofensivas?min_at_bats=1${torneoParam}`);
    const [vsEquipos, similares] = await Promise.all([
        fetchSafe(`/api/jugadores/${jugadorId}/vs-equipos${directQuery}`),
        fetchSafe(`/api/jugadores/${jugadorId}/similares?limit=6`)
    ]);

    if (!allOffensive || !Array.isArray(allOffensive) || allOffensive.length === 0) {
        container.innerHTML = '<div class="empty-state-v2">No hay datos para comparar</div>';
        if (vsTeamsBody) vsTeamsBody.innerHTML = '<tr><td colspan="7" class="empty-state-v2">Sin datos de scouting por rival</td></tr>';
        if (vsTeamsCards) renderVsTeamsCards([]);
        if (similarPlayersChips) similarPlayersChips.innerHTML = '<div class="empty-state-v2">Sin comparables disponibles</div>';
        if (comparisonFaceoffSummary) comparisonFaceoffSummary.innerHTML = '<article class="historical-executive-card"><span class="scouting-highlight-label">Cara a cara</span><strong>Sin comparables disponibles</strong><p>Cuando existan perfiles comparables, aparecerá el resumen del duelo.</p></article>';
        return;
    }

    const playerStats = allOffensive.find(s => String(s.jugador_id) === String(jugadorId));
    if (!playerStats) {
        container.innerHTML = '<div class="empty-state-v2">No hay estadísticas del jugador para comparar</div>';
        return;
    }

    // Find leaders
    const categories = [
        { key: 'avg', label: 'AVG (Promedio)', format: v => parseFloat(v).toFixed(3), higher: true },
        { key: 'home_runs', label: 'HR (Jonrones)', format: v => toNum(v), higher: true },
        { key: 'rbi', label: 'RBI (Carreras Impulsadas)', format: v => toNum(v), higher: true },
        { key: 'hits', label: 'H (Hits)', format: v => toNum(v), higher: true },
        { key: 'stolen_bases', label: 'SB (Bases Robadas)', format: v => toNum(v), higher: true }
    ];

    let html = '<div class="comparison-card"><h4>Referencia contra líderes</h4><p style="color:rgba(255,255,255,0.68);margin:0 0 8px;">Mide al jugador contra los techos ofensivos del torneo visible.</p></div>';

    categories.forEach(cat => {
        const sorted = [...allOffensive].sort((a, b) => {
            const va = parseFloat(a[cat.key]) || 0;
            const vb = parseFloat(b[cat.key]) || 0;
            return cat.higher ? vb - va : va - vb;
        });

        const leader = sorted[0];
        const leaderVal = parseFloat(leader[cat.key]) || 0;
        const playerVal = parseFloat(playerStats[cat.key]) || 0;
        const pct = leaderVal > 0 ? Math.min((playerVal / leaderVal) * 100, 100) : 0;

        html += `
            <div class="comparison-card">
                <h4>${cat.label}</h4>
                <div class="comparison-bar-bg">
                    <div class="comparison-bar-fill" style="width: ${pct.toFixed(1)}%">${cat.format(playerVal)}</div>
                </div>
                <div class="comparison-labels">
                    <span class="player-value">Tú: ${cat.format(playerVal)}</span>
                    <span class="leader-value">Líder: ${cat.format(leaderVal)} (${leader.jugador_nombre || 'N/A'})</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Radar chart
    createRadarChart(playerStats, allOffensive);

    const rivales = Array.isArray(vsEquipos?.rivales) ? vsEquipos.rivales : [];
    renderVsTeamsCards(rivales);
    if (vsTeamsBody) {
        vsTeamsBody.innerHTML = rivales.length
            ? rivales.map((row) => `
                <tr>
                    <td>${row.rival_nombre || 'Rival'}</td>
                    <td>${toNum(row.juegos)}</td>
                    <td>${toNum(row.at_bats)}</td>
                    <td>${toNum(row.hits)}</td>
                    <td>${toNum(row.home_runs)}</td>
                    <td>${toNum(row.rbi)}</td>
                    <td>${Number(row.avg || 0).toFixed(3)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="7" class="empty-state-v2">Este jugador todavía no tiene suficiente detalle rival por rival</td></tr>';
    }

    const comparables = Array.isArray(similares) ? similares : [];
    if (similarPlayersChips) {
        similarPlayersChips.innerHTML = comparables.length
            ? comparables.map((row) => `
                <button class="player-tab comparable-player-card" type="button" data-compare-player="${row.id}">
                    <div class="card-head-inline">
                        ${getTeamMediaMarkup(row.equipo_id, row.equipo_nombre || 'EQ')}
                        <div class="card-head-copy">
                            <strong>${row.nombre}</strong>
                            <span>${row.equipo_nombre || 'Sin equipo'} • ${formatPos(row.posicion)}</span>
                        </div>
                    </div>
                    <div class="recent-game-meta">
                        <span class="recent-game-chip">Comparable</span>
                        <span class="recent-game-chip">Misma zona competitiva</span>
                    </div>
                </button>
            `).join('')
            : '<div class="empty-state-v2">No hay comparables por posición todavía</div>';

        similarPlayersChips.querySelectorAll('[data-compare-player]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                similarPlayersChips.querySelectorAll('[data-compare-player]').forEach((item) => item.classList.remove('active'));
                btn.classList.add('active');
                await loadPlayerComparisonDetail(btn.dataset.comparePlayer, torneoParam);
            });
        });

        if (comparables[0]) {
            const firstBtn = similarPlayersChips.querySelector('[data-compare-player]');
            if (firstBtn) {
                firstBtn.classList.add('active');
                await loadPlayerComparisonDetail(firstBtn.dataset.comparePlayer, torneoParam);
            }
        } else if (comparePlayersBody) {
            comparePlayersBody.innerHTML = '<tr><td colspan="3" class="empty-state-v2">Sin comparativa disponible todavía</td></tr>';
            if (comparisonFaceoffSummary) comparisonFaceoffSummary.innerHTML = '<article class="historical-executive-card"><span class="scouting-highlight-label">Cara a cara</span><strong>Sin comparables disponibles</strong><p>Este jugador todavía no tiene un espejo competitivo claro para comparar.</p></article>';
        }
    }
    if (compareBaseHeader) compareBaseHeader.textContent = playerStats.jugador_nombre || playerData?.nombre || 'Jugador';
    if (compareRivalHeader && !comparables.length) compareRivalHeader.textContent = 'Rival';
}

async function loadPlayerScouting(torneoParam) {
    const summary = document.getElementById('playerScoutingSummary');
    const splitsBody = document.getElementById('playerScoutingSplitsBody');
    const tournamentsBody = document.getElementById('playerScoutingTournamentsBody');
    const directQuery = torneoParam ? `?${torneoParam.replace(/^&/, '')}` : '';
    const data = await fetchSafe(`/api/jugadores/${jugadorId}/scouting${directQuery}`);

    if (!data || data.source === 'historico_no_disponible') {
        const fallbackGames = await fetchSafe(`/api/jugadores/${jugadorId}/partidos${directQuery}`);
        const gamesCount = Array.isArray(fallbackGames) ? fallbackGames.length : 0;
        if (summary) {
            summary.innerHTML = `
                <div class="stat-card-v2"><span class="stat-card-title">Partidos ligados</span><span class="stat-card-value">${gamesCount}</span><span class="stat-card-desc">Aparece en el calendario oficial</span></div>
                <div class="stat-card-v2"><span class="stat-card-title">Tendencia</span><span class="stat-card-value">Esperando boxscore</span><span class="stat-card-desc">Activa los splits juego a juego</span></div>
                <div class="stat-card-v2"><span class="stat-card-title">Estado de scouting</span><span class="stat-card-value">${gamesCount ? 'Base lista' : 'Pendiente'}</span><span class="stat-card-desc">Falta detalle ofensivo por partido</span></div>
            `;
        }
        renderScoutingHighlights();
        if (splitsBody) splitsBody.innerHTML = '<tr><td colspan="8" class="empty-state-v2">Sin splits de scouting todavía</td></tr>';
        if (tournamentsBody) tournamentsBody.innerHTML = '<tr><td colspan="8" class="empty-state-v2">Sin scouting por torneo todavía</td></tr>';
        return;
    }

    const recent5 = data.recent5 || {};
    const previous5 = data.previous5 || {};
    const trend = data.trend || {};
    const local = data.splits?.local || {};
    const visitante = data.splits?.visitante || {};
    const torneos = Array.isArray(data.torneos) ? data.torneos : [];
    const rivales = Array.isArray(data.rivales) ? data.rivales : [];
    const trendLabel = trend.estado === 'subiendo' ? 'En alza' : (trend.estado === 'bajando' ? 'En baja' : 'Estable');
    renderScoutingHighlights({ rivales, trend, torneos });

    if (summary) {
        summary.innerHTML = `
            <div class="stat-card-v2">
                <span class="stat-card-title">Últimos 5</span>
                <span class="stat-card-value">${Number(recent5.ops || 0).toFixed(3)}</span>
                <span class="stat-card-desc">OPS • ${toNum(recent5.hits)} H • ${toNum(recent5.home_runs)} HR</span>
            </div>
            <div class="stat-card-v2">
                <span class="stat-card-title">Tendencia</span>
                <span class="stat-card-value">${trendLabel}</span>
                <span class="stat-card-desc">AVG ${trend.avg_delta >= 0 ? '+' : ''}${Number(trend.avg_delta || 0).toFixed(3)} • OPS ${trend.ops_delta >= 0 ? '+' : ''}${Number(trend.ops_delta || 0).toFixed(3)}</span>
            </div>
            <div class="stat-card-v2">
                <span class="stat-card-title">Casa vs ruta</span>
                <span class="stat-card-value">${Number(local.ops || 0).toFixed(3)} / ${Number(visitante.ops || 0).toFixed(3)}</span>
                <span class="stat-card-desc">OPS local / visitante</span>
            </div>
        `;
    }

    if (splitsBody) {
        const splitRows = [
            ['Local', local],
            ['Visitante', visitante],
            ['Últimos 5', recent5],
            ['5 anteriores', previous5]
        ];
        splitsBody.innerHTML = splitRows.map(([label, row]) => `
            <tr>
                <td>${label}</td>
                <td>${toNum(row.juegos)}</td>
                <td>${toNum(row.at_bats)}</td>
                <td>${toNum(row.hits)}</td>
                <td>${toNum(row.home_runs)}</td>
                <td>${toNum(row.rbi)}</td>
                <td>${Number(row.avg || 0).toFixed(3)}</td>
                <td>${Number(row.ops || 0).toFixed(3)}</td>
            </tr>
        `).join('');
    }

    if (tournamentsBody) {
        tournamentsBody.innerHTML = torneos.length
            ? torneos.map((row) => `
                <tr>
                    <td>${row.torneo_nombre || 'Sin torneo'}</td>
                    <td>${toNum(row.juegos)}</td>
                    <td>${toNum(row.at_bats)}</td>
                    <td>${toNum(row.hits)}</td>
                    <td>${toNum(row.home_runs)}</td>
                    <td>${toNum(row.rbi)}</td>
                    <td>${Number(row.avg || 0).toFixed(3)}</td>
                    <td>${Number(row.ops || 0).toFixed(3)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="8" class="empty-state-v2">Sin scouting por torneo todavía</td></tr>';
    }
}

async function loadPlayerComparisonDetail(rivalId, torneoParam) {
    const comparePlayersBody = document.getElementById('comparePlayersBody');
    const compareRivalHeader = document.getElementById('compareRivalHeader');
    const comparisonFaceoffSummary = document.getElementById('comparisonFaceoffSummary');
    if (!comparePlayersBody) return;

    comparePlayersBody.innerHTML = '<tr><td colspan="3" class="loading">Cargando comparativa...</td></tr>';
    const directQuery = torneoParam ? `?${torneoParam.replace(/^&/, '')}` : '';
    const data = await fetchSafe(`/api/jugadores/${jugadorId}/comparar/${rivalId}${directQuery}`);

    if (!data?.jugador_base || !data?.jugador_rival) {
        comparePlayersBody.innerHTML = '<tr><td colspan="3" class="empty-state-v2">No se pudo armar la comparativa</td></tr>';
        if (comparisonFaceoffSummary) comparisonFaceoffSummary.innerHTML = '<article class="historical-executive-card"><span class="scouting-highlight-label">Cara a cara</span><strong>No disponible</strong><p>La comparación detallada todavía no tiene suficiente data oficial.</p></article>';
        return;
    }

    if (compareRivalHeader) compareRivalHeader.textContent = data.jugador_rival.nombre || 'Rival';

    const rows = [
        ['AVG torneo', Number(data.jugador_base.actual?.avg || 0).toFixed(3), Number(data.jugador_rival.actual?.avg || 0).toFixed(3)],
        ['OPS torneo', Number(data.jugador_base.actual?.ops || 0).toFixed(3), Number(data.jugador_rival.actual?.ops || 0).toFixed(3)],
        ['HR torneo', toNum(data.jugador_base.actual?.home_runs), toNum(data.jugador_rival.actual?.home_runs)],
        ['RBI torneo', toNum(data.jugador_base.actual?.rbi), toNum(data.jugador_rival.actual?.rbi)],
        ['SB torneo', toNum(data.jugador_base.actual?.stolen_bases), toNum(data.jugador_rival.actual?.stolen_bases)],
        ['AVG histórico', Number(data.jugador_base.historico?.avg || 0).toFixed(3), Number(data.jugador_rival.historico?.avg || 0).toFixed(3)],
        ['Hits históricos', toNum(data.jugador_base.historico?.hits), toNum(data.jugador_rival.historico?.hits)],
        ['HR históricos', toNum(data.jugador_base.historico?.home_runs), toNum(data.jugador_rival.historico?.home_runs)],
        ['Torneos jugados', toNum(data.jugador_base.historico?.torneos), toNum(data.jugador_rival.historico?.torneos)]
    ];

    const baseOps = Number(data.jugador_base.actual?.ops || 0);
    const rivalOps = Number(data.jugador_rival.actual?.ops || 0);
    const winner = baseOps === rivalOps
        ? 'Duelo parejo'
        : (baseOps > rivalOps ? (data.jugador_base.nombre || 'Jugador base') : (data.jugador_rival.nombre || 'Rival'));
    const baseTeam = data.jugador_base.equipo_nombre || playerData?.equipo_nombre || 'Equipo base';
    const rivalTeam = data.jugador_rival.equipo_nombre || 'Equipo rival';
    const baseId = data.jugador_base.equipo_id || playerData?.equipo_id || null;
    const rivalIdNum = data.jugador_rival.equipo_id || null;

    if (comparisonFaceoffSummary) {
        comparisonFaceoffSummary.innerHTML = `
            <article class="historical-executive-card">
                <span class="scouting-highlight-label">Cara a cara actual</span>
                <div class="card-head-inline">
                    ${getTeamMediaMarkup(baseId, baseTeam)}
                    <div class="card-head-copy">
                        <strong>${data.jugador_base.nombre || 'Jugador base'}</strong>
                        <span>${baseTeam}</span>
                    </div>
                </div>
                <p>OPS ${baseOps.toFixed(3)} • AVG ${Number(data.jugador_base.actual?.avg || 0).toFixed(3)}</p>
            </article>
            <article class="historical-executive-card">
                <span class="scouting-highlight-label">Ventaja del duelo</span>
                <strong>${winner}</strong>
                <p>${baseOps.toFixed(3)} vs ${rivalOps.toFixed(3)} en OPS del torneo actual.</p>
            </article>
            <article class="historical-executive-card">
                <span class="scouting-highlight-label">Rival comparado</span>
                <div class="card-head-inline">
                    ${getTeamMediaMarkup(rivalIdNum, rivalTeam)}
                    <div class="card-head-copy">
                        <strong>${data.jugador_rival.nombre || 'Rival'}</strong>
                        <span>${rivalTeam}</span>
                    </div>
                </div>
                <p>OPS ${rivalOps.toFixed(3)} • AVG ${Number(data.jugador_rival.actual?.avg || 0).toFixed(3)}</p>
            </article>
        `;
    }

    comparePlayersBody.innerHTML = rows.map(([label, baseVal, rivalVal]) => `
        <tr>
            <td>${label}</td>
            <td>${baseVal}</td>
            <td>${rivalVal}</td>
        </tr>
    `).join('');
}

// ===================================
// GRÁFICOS
// ===================================
async function createOffensiveChart(stats) {
    const ctx = document.getElementById('offensiveChart');
    if (!ctx) return;

    await loadChartJs();
    if (typeof Chart === 'undefined') return;

    if (offensiveChart) offensiveChart.destroy();

    offensiveChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['H', '2B', '3B', 'HR', 'BB', 'SO', 'SB'],
            datasets: [{
                label: 'Estadísticas',
                data: [stats.h, stats.d, stats.t, stats.hr, stats.bb, stats.so, stats.sb],
                backgroundColor: [
                    'rgba(255, 193, 7, 0.8)',
                    'rgba(255, 152, 0, 0.8)',
                    'rgba(255, 107, 53, 0.8)',
                    'rgba(244, 67, 54, 0.8)',
                    'rgba(102, 126, 234, 0.8)',
                    'rgba(255, 99, 132, 0.5)',
                    'rgba(75, 192, 192, 0.8)'
                ],
                borderColor: 'rgba(255, 193, 7, 0.3)',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: 'rgba(255, 255, 255, 0.5)' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                x: {
                    ticks: { color: '#ffc107', font: { weight: 'bold' } },
                    grid: { display: false }
                }
            }
        }
    });
}

async function createRadarChart(playerStats, allStats) {
    const ctx = document.getElementById('radarChart');
    if (!ctx) return;

    await loadChartJs();
    if (typeof Chart === 'undefined') return;

    if (radarChart) radarChart.destroy();

    // Normalize each stat to 0-100 based on max in league
    const cats = ['avg', 'hits', 'home_runs', 'rbi', 'stolen_bases'];
    const labels = ['AVG', 'H', 'HR', 'RBI', 'SB'];

    const maxVals = cats.map(cat => {
        return Math.max(...allStats.map(s => parseFloat(s[cat]) || 0), 1);
    });

    const playerVals = cats.map((cat, i) => {
        const val = parseFloat(playerStats[cat]) || 0;
        return Math.round((val / maxVals[i]) * 100);
    });

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: playerStats.jugador_nombre || 'Jugador',
                data: playerVals,
                backgroundColor: 'rgba(255, 193, 7, 0.2)',
                borderColor: '#ffc107',
                borderWidth: 2,
                pointBackgroundColor: '#ffc107',
                pointBorderColor: '#ff9800',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#ffc107' }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.4)',
                        backdropColor: 'transparent'
                    },
                    grid: { color: 'rgba(255, 193, 7, 0.15)' },
                    angleLines: { color: 'rgba(255, 193, 7, 0.15)' },
                    pointLabels: {
                        color: '#ff9800',
                        font: { size: 12, weight: 'bold' }
                    }
                }
            }
        }
    });
}

// ===================================
// SSE - ACTUALIZACIONES EN TIEMPO REAL
// ===================================
function setupSSE() {
    const eventSource = new EventSource('/api/sse/updates');

    eventSource.addEventListener('stats-update', (e) => {
        const data = JSON.parse(e.data);
        if (String(data.jugador_id) === String(jugadorId)) {
            console.log('[SSE] Stats del jugador actualizadas, recargando...');
            loadAllStats();
        }
    });

    eventSource.addEventListener('tournament-change', () => {
        console.log('[SSE] Torneo cambiado, recargando...');
        loadTournaments().then(() => loadAllStats());
    });

    eventSource.onerror = () => {
        console.warn('[SSE] Error de conexión, reconectando automáticamente...');
    };
}

console.log('📄 jugador_v2.js cargado correctamente');
