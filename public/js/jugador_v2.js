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

function getInitials(name) {
    if (!name) return 'JG';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return words.slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
}

// ===================================
// PESTAÑAS
// ===================================
function setupTabs() {
    const tabs = document.querySelectorAll('.player-tab');
    const panels = document.querySelectorAll('.player-tab-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`tab-${target}`).classList.add('active');
        });
    });
}

// ===================================
// TORNEOS
// ===================================
async function loadTournaments() {
    try {
        const torneos = await fetchSafe('/api/torneos');
        if (!torneos) return;

        const select = document.getElementById('tournamentSelect');
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

        // Header info
        document.getElementById('playerName').textContent = player.nombre;
        document.getElementById('playerNumber').textContent = player.numero ? `#${player.numero}` : '#--';
        document.getElementById('playerPosition').textContent = formatPos(player.posicion);
        document.getElementById('playerTeamName').textContent = player.equipo_nombre || 'Sin Equipo';

        // Breadcrumbs
        const teamBreadcrumb = document.getElementById('teamBreadcrumbLink');
        if (player.equipo_id) {
            teamBreadcrumb.innerHTML = `<a href="equipo.html?id=${player.equipo_id}">${player.equipo_nombre}</a>`;
        } else {
            teamBreadcrumb.textContent = 'Sin Equipo';
        }
        document.getElementById('playerBreadcrumb').textContent = player.nombre;

        // Logo/Iniciales
        const logoEl = document.getElementById('teamLogo');
        if (logoEl && player.equipo_nombre) {
            const img = new Image();
            img.onload = () => {
                logoEl.style.backgroundImage = `url('${getTeamLogo(player.equipo_nombre)}')`;
                logoEl.style.backgroundSize = 'cover';
                logoEl.style.backgroundPosition = 'center';
                logoEl.innerHTML = '';
            };
            img.onerror = () => {
                logoEl.style.backgroundImage = 'none';
                logoEl.style.backgroundColor = '#ffc107';
                logoEl.style.display = 'flex';
                logoEl.style.alignItems = 'center';
                logoEl.style.justifyContent = 'center';
                logoEl.style.fontSize = '1.4rem';
                logoEl.style.fontWeight = 'bold';
                logoEl.style.color = '#0d1117';
                logoEl.innerHTML = getInitials(player.nombre);
            };
            img.src = getTeamLogo(player.equipo_nombre);
        }

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
    const torneoParam = currentTournamentId ? `&torneo_id=${currentTournamentId}` : '';

    await Promise.all([
        loadOffensiveStats(torneoParam),
        loadPitchingStats(torneoParam),
        loadDefensiveStats(torneoParam),
        loadComparison(torneoParam)
    ]);
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
        document.getElementById('headerAVG').textContent = '---';
        document.getElementById('headerHR').textContent = '0';
        document.getElementById('headerRBI').textContent = '0';
        document.getElementById('headerOPS').textContent = '---';
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
    document.getElementById('headerAVG').textContent = avg.toFixed(3);
    document.getElementById('headerHR').textContent = hr;
    document.getElementById('headerRBI').textContent = rbi;
    document.getElementById('headerOPS').textContent = ops.toFixed(3);

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

    // Get all offensive stats to find leaders
    const allOffensive = await fetchSafe(`/api/estadisticas-ofensivas?min_at_bats=1${torneoParam}`);

    if (!allOffensive || !Array.isArray(allOffensive) || allOffensive.length === 0) {
        container.innerHTML = '<div class="empty-state-v2">No hay datos para comparar</div>';
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

    let html = '';

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
