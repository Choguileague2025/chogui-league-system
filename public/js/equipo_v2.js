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
        const response = await fetch('/api/torneos');
        if (!response.ok) throw new Error('Error cargando torneos');
        const data = await response.json();
        allTorneos = Array.isArray(data) ? data : (data.torneos || []);

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
        select.innerHTML = '<option value="">Sin torneos</option>';
        cargarTodosLosDatos();
    }
}

// ===================================
// DATA LOADING ORCHESTRATOR
// ===================================

async function cargarTodosLosDatos() {
    try {
        await Promise.all([
            cargarInformacionEquipo(),
            cargarRosterEquipo(),
            cargarPartidosRecientes(),
            cargarStandings()
        ]);

        // After roster loaded, load collective stats and top players
        await Promise.all([
            cargarEstadisticasColectivas(),
            cargarTopBateadores(),
            cargarTopLanzadores()
        ]);
    } catch (error) {
        console.error('Error cargando datos del equipo:', error);
    }
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

    // Logo
    const logoUrl = getTeamLogo(teamData.nombre);
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
}

// ===================================
// LOGO HANDLING
// ===================================

function getTeamLogo(equipoNombre) {
    if (!equipoNombre) return '/public/images/logos/default-logo.png';

    const logoMap = {
        'guerreros del norte': 'guerreros-del-norte.png',
        'la guaira': 'la-guaira.png',
        'furia del caribe': 'furia-del-caribe.png',
        'tigres unidos': 'tigres-unidos.png',
        'leones dorados': 'leones-dorados.png',
        'aguilas negras': 'aguilas-negras.png',
        'venearstone': 'venearstone.png',
        'desss': 'desss.png',
        'caribes rd': 'caribes-rd.png',
        'dragones fc': 'dragones-fc.png',
        'los del sur': 'los-del-sur.png'
    };

    const nombreNormalizado = equipoNombre.toLowerCase().trim();
    const logoFile = logoMap[nombreNormalizado];

    if (logoFile) return `/public/images/logos/${logoFile}`;

    const nombreArchivo = nombreNormalizado.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.png';
    return `/public/images/logos/${nombreArchivo}`;
}

function mostrarLogoEquipo(logoUrl, equipoNombre) {
    const logoContainer = document.querySelector('.team-logo');
    if (!logoContainer) return;

    const img = new Image();
    img.onload = function () {
        logoContainer.style.backgroundImage = `url('${logoUrl}')`;
        logoContainer.style.backgroundSize = 'contain';
        logoContainer.style.backgroundRepeat = 'no-repeat';
        logoContainer.style.backgroundPosition = 'center';
        logoContainer.innerHTML = '';
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
    };
    img.src = logoUrl;
}

function generarIniciales(nombreEquipo) {
    if (!nombreEquipo) return '?';
    const palabras = nombreEquipo.trim().split(/\s+/);
    if (palabras.length === 1) return palabras[0].substring(0, 2).toUpperCase();
    return palabras.slice(0, 3).map(p => p.charAt(0).toUpperCase()).join('');
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

async function cargarTopBateadores() {
    const tbody = document.getElementById('topBattersBody');
    try {
        const torneoQuery = currentTorneoId ? `&torneo_id=${currentTorneoId}` : '';

        if (rosterData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No hay jugadores</td></tr>';
            return;
        }

        // Single API call with equipo_id
        const response = await fetch(`/api/estadisticas-ofensivas?equipo_id=${currentTeamId}${torneoQuery}`);
        const allPlayerStats = response.ok ? await response.json() : [];
        const stats = Array.isArray(allPlayerStats) ? allPlayerStats : [];

        // Each row is already per-player (the API returns one row per jugador)
        const playerAggs = [];
        stats.forEach(s => {
            const ab = toNumber(s.at_bats);
            if (ab === 0) return;

            const h = toNumber(s.hits);
            const d2 = toNumber(s.doubles);
            const d3 = toNumber(s.triples);
            const hr = toNumber(s.home_runs);
            const rbi = toNumber(s.rbi);
            const bb = toNumber(s.walks);
            const hbp = toNumber(s.hit_by_pitch);
            const sf = toNumber(s.sacrifice_flies);

            const avg = h / ab;
            const obp = (ab + bb + hbp + sf) > 0
                ? (h + bb + hbp) / (ab + bb + hbp + sf) : 0;
            const singles = h - d2 - d3 - hr;
            const slg = (singles + d2 * 2 + d3 * 3 + hr * 4) / ab;
            const ops = obp + slg;

            playerAggs.push({
                id: s.jugador_id || s.id,
                nombre: s.jugador_nombre || 'N/A',
                avg, hr, rbi, h, ops
            });
        });

        // Sort by AVG desc, take top 5
        playerAggs.sort((a, b) => b.avg - a.avg);
        const top5 = playerAggs.slice(0, 5);

        if (top5.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Sin estadísticas disponibles</td></tr>';
            return;
        }

        tbody.innerHTML = top5.map((p, i) => `
            <tr onclick="verJugador(${p.id})">
                <td class="rank-cell">${i + 1}</td>
                <td class="player-name-cell"><a href="jugador.html?id=${p.id}&equipo=${currentTeamId}">${p.nombre}</a></td>
                <td>${p.avg.toFixed(3)}</td>
                <td>${p.hr}</td>
                <td>${p.rbi}</td>
                <td>${p.h}</td>
                <td>${p.ops.toFixed(3)}</td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error cargando top bateadores:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Error cargando datos</td></tr>';
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

        // Sort by ERA asc (lower is better), take top 5
        playerAggs.sort((a, b) => a.era - b.era);
        const top5 = playerAggs.slice(0, 5);

        if (top5.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Sin estadísticas disponibles</td></tr>';
            return;
        }

        tbody.innerHTML = top5.map((p, i) => `
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
        filteredRoster = rosterData.filter(p => ['1B', '2B', '3B', 'SS'].includes(p.posicion));
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
        renderizarPartidosRecientes();
    } catch (error) {
        console.error('Error cargando partidos:', error);
        container.innerHTML = `
            <div class="empty-state">
                <h4>⚠️ Error cargando partidos</h4>
                <button onclick="cargarPartidosRecientes()" class="btn-secondary" style="margin-top: 10px;">🔄 Reintentar</button>
            </div>`;
    }
}

function renderizarPartidosRecientes() {
    const container = document.getElementById('recentGamesContainer');
    if (!recentGames || recentGames.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay partidos recientes para este equipo.</div>';
        return;
    }

    container.innerHTML = recentGames.map(partido => {
        const esLocal = partido.equipo_local_id == currentTeamId;
        const equipoRival = esLocal ? partido.equipo_visitante_nombre : partido.equipo_local_nombre;
        const resultado = obtenerResultadoPartido(partido, esLocal);
        const fechaFormateada = formatearFecha(partido.fecha_partido);

        return `
            <div class="game-item">
                <div class="game-teams">vs ${equipoRival}</div>
                <div class="game-score">${resultado}</div>
                <div class="game-date">${fechaFormateada}</div>
            </div>`;
    }).join('');
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
        'LF': 'Left Field', 'CF': 'Center Field', 'RF': 'Right Field'
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
