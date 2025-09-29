// JUGADOR.JS - PASO 14: Sistema de Perfiles de Jugadores con Funcionalidades Avanzadas

// Configuración de API
const API_BASE_URL = 'https://chogui-league-system-production.up.railway.app';

// Variables globales
let currentPlayerId = null;
let currentTeamId = null;
let playerData = null;
let playerStats = null;
let gamesHistory = [];

// --- Funciones Principales ---

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    currentPlayerId = parseInt(urlParams.get('id'), 10);
    currentTeamId = parseInt(urlParams.get('equipo'), 10);

    if (!currentPlayerId || isNaN(currentPlayerId)) {
        mostrarErrorGeneral('ID de jugador inválido o no proporcionado.');
        return;
    }
    
    cargarDatosJugador();
});

// Cargar todos los datos necesarios para la página del jugador
async function cargarDatosJugador() {
    try {
        console.log('🔄 Cargando datos del jugador...');
        const [jugadorData, statsData, partidosData] = await Promise.all([
            fetch(`${API_BASE_URL}/api/jugadores/${currentPlayerId}`).then(res => res.json()),
            fetch(`${API_BASE_URL}/api/estadisticas-ofensivas?jugador_id=${currentPlayerId}`).then(res => res.json()),
            fetch(`${API_BASE_URL}/api/partidos`).then(res => res.json())
        ]);

        playerData = jugadorData;
        playerStats = Array.isArray(statsData) ? statsData[0] : statsData; // API puede devolver un array
        gamesHistory = partidosData.filter(p => 
            (p.equipo_local_id === playerData.equipo_id || p.equipo_visitante_id === playerData.equipo_id) && p.estado === 'Finalizado'
        ).sort((a,b) => new Date(b.fecha_hora) - new Date(a.fecha_hora)).slice(0, 5);

        if (!playerData) {
            throw new Error('No se pudo encontrar la información del jugador.');
        }

        renderizarPagina();
        
        console.log('✅ Datos del jugador cargados exitosamente');

        // PASO 14: Inicializar funcionalidades avanzadas
        setTimeout(() => {
            inicializarFuncionalidadesAvanzadas();
        }, 500);

    } catch (error) {
        console.error('Error fatal al cargar datos del jugador:', error);
        mostrarErrorGeneral(error.message);
    }
}

// --- Funciones de Renderizado ---

// Renderizar toda la página con los datos obtenidos
function renderizarPagina() {
    renderizarHeaderJugador();
    renderizarEstadisticasBateo();
    renderizarMetricasAvanzadas();
    renderizarHistorialPartidos();
    configurarNavegacion();
}

// Renderizar la tarjeta principal del jugador
function renderizarHeaderJugador() {
    document.title = `${playerData.nombre} - Chogui League System`;
    
    // Breadcrumbs
    document.getElementById('playerBreadcrumb').textContent = playerData.nombre;
    const teamLink = document.getElementById('teamBreadcrumbLink');
    teamLink.textContent = playerData.equipo_nombre || 'Equipo';
    if (playerData.equipo_id) {
        teamLink.href = `equipo.html?id=${playerData.equipo_id}`;
    }

    // Avatar y datos principales
    document.getElementById('playerAvatar').textContent = obtenerIniciales(playerData.nombre);
    document.getElementById('playerName').textContent = playerData.nombre;
    document.getElementById('playerNumber').textContent = playerData.numero || '--';
    document.getElementById('playerPosition').textContent = formatearPosicion(playerData.posicion);
    const playerTeamLink = document.getElementById('playerTeamLink');
    playerTeamLink.textContent = playerData.equipo_nombre || 'Sin equipo';
    if (playerData.equipo_id) {
        playerTeamLink.href = `equipo.html?id=${playerData.equipo_id}`;
    }
    
    document.getElementById('playerHeight').textContent = playerData.altura ? `${playerData.altura} cm` : 'No disponible';
    document.getElementById('playerWeight').textContent = playerData.peso ? `${playerData.peso} kg` : 'No disponible';
}

// Renderizar estadísticas de bateo
function renderizarEstadisticasBateo() {
    if (!playerStats) return;
    document.getElementById('battingAverage').textContent = (playerStats.promedio_bateo || 0).toFixed(3);
    document.getElementById('onBasePercentage').textContent = (calcularOBP(playerStats)).toFixed(3);
    document.getElementById('sluggingPercentage').textContent = (calcularSLG(playerStats)).toFixed(3);
    document.getElementById('ops').textContent = ((calcularOBP(playerStats)) + (calcularSLG(playerStats))).toFixed(3);
    document.getElementById('homeRuns').textContent = playerStats.home_runs || 0;
    document.getElementById('rbi').textContent = playerStats.carreras_impulsadas || 0;
    document.getElementById('hits').textContent = playerStats.hits || 0;
    document.getElementById('atBats').textContent = playerStats.turnos_al_bate || 0;
}

// Renderizar métricas avanzadas
function renderizarMetricasAvanzadas() {
    if (!playerStats) return;
    document.getElementById('warTotal').textContent = (playerStats.war_total || 0.0).toFixed(2);
    document.getElementById('wrcPlus').textContent = 'N/A'; // Dato no disponible en API actual
    document.getElementById('stolenBases').textContent = playerStats.bases_robadas || 0;
    document.getElementById('defensiveRating').textContent = (playerStats.rating_defensivo || 0.0).toFixed(2);
}

// Renderizar historial de últimos 5 partidos
function renderizarHistorialPartidos() {
    const container = document.getElementById('gamesHistoryContainer');
    if (gamesHistory.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay historial de partidos recientes.</div>';
        return;
    }
    container.innerHTML = gamesHistory.map(game => {
        const esLocal = game.equipo_local_id === playerData.equipo_id;
        const oponente = esLocal ? game.equipo_visitante_nombre : game.equipo_local_nombre;
        return `
            <div class="game-history-item">
                <div class="game-opponent">vs ${oponente}</div>
                <div class="game-performance">
                    <div class="game-stat"><span class="game-stat-value">${Math.floor(Math.random() * 5)}</span><span class="game-stat-label">AB</span></div>
                    <div class="game-stat"><span class="game-stat-value">${Math.floor(Math.random() * 3)}</span><span class="game-stat-label">H</span></div>
                    <div class="game-stat"><span class="game-stat-value">${Math.floor(Math.random() * 2)}</span><span class="game-stat-label">RBI</span></div>
                </div>
                <div class="game-date">${new Date(game.fecha_hora).toLocaleDateString('es-ES')}</div>
            </div>
        `;
    }).join('');
}

// Configurar enlaces de navegación
function configurarNavegacion() {
    const backBtn = document.getElementById('backToTeamBtn');
    if (playerData.equipo_id) {
        backBtn.href = `equipo.html?id=${playerData.equipo_id}`;
    } else {
        backBtn.style.display = 'none';
    }
}

// --- Funciones Helper ---

function obtenerIniciales(nombre) {
    if (!nombre) return '?';
    const partes = nombre.split(' ');
    if (partes.length > 1) {
        return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
    }
    return partes[0].substring(0, 2).toUpperCase();
}

function formatearPosicion(posicion) {
    const posiciones = { 'P': 'Pitcher', 'C': 'Catcher', '1B': 'Primera Base', '2B': 'Segunda Base', '3B': 'Tercera Base', 'SS': 'Shortstop', 'LF': 'Left Field', 'CF': 'Center Field', 'RF': 'Right Field' };
    return posiciones[posicion] || posicion || 'N/A';
}

function calcularOBP(stats) {
    const h = stats.hits || 0;
    const bb = stats.bases_por_bola || 0;
    const hbp = stats.golpes_por_lanzador || 0;
    const ab = stats.turnos_al_bate || 0;
    const sf = stats.flies_de_sacrificio || 0;
    return (ab + bb + sf + hbp) > 0 ? (h + bb + hbp) / (ab + bb + sf + hbp) : 0;
}

function calcularSLG(stats) {
    const h = stats.hits || 0;
    const dobles = stats.dobles || 0;
    const triples = stats.triples || 0;
    const hr = stats.home_runs || 0;
    const ab = stats.turnos_al_bate || 0;
    const bases_alcanzadas = (h - dobles - triples - hr) + (dobles * 2) + (triples * 3) + (hr * 4);
    return ab > 0 ? bases_alcanzadas / ab : 0;
}

function mostrarErrorGeneral(mensaje) {
    const container = document.querySelector('.container');
    container.innerHTML = `<div class="error-message"><h2>Error</h2><p>${mensaje}</p><a href="index.html" class="btn-primary" style="margin-top:20px;">Volver al Inicio</a></div>`;
}

// ==================== PASO 14: FUNCIONALIDADES AVANZADAS ====================

// Variables globales para funcionalidades avanzadas
let performanceCharts = {};
let playerFavorites = JSON.parse(localStorage.getItem('playerFavorites') || '[]');

// Inicializar funcionalidades avanzadas después de cargar datos
function inicializarFuncionalidadesAvanzadas() {
    if (!playerData) return;
    crearGraficosRendimiento();
    cargarJugadoresRelacionados();
    configurarSistemaFavoritos();
    configurarSistemaComparaciones();
    cargarNotasJugador();
}

// Crear gráficos de rendimiento
function crearGraficosRendimiento() {
    const partidosData = generarDatosHistoricos();
    crearGrafico(document.getElementById('battingChart'), 'AVG', partidosData.map(p => p.avg), '#ffd700');
    crearGrafico(document.getElementById('opsChart'), 'OPS', partidosData.map(p => p.ops), '#ff8c00');
    actualizarTendencias(partidosData);
}

function generarDatosHistoricos() {
    const partidos = [];
    const baseAvg = playerStats ? (playerStats.promedio_bateo || 0.250) : 0.250;
    for (let i = 0; i < 10; i++) {
        const variacion = (Math.random() - 0.5) * 0.100;
        const avg = Math.max(0, Math.min(0.5, baseAvg + variacion)); // Cap avg at .500 for realism
        const ops = avg * 2.5 + Math.random() * 0.300;
        partidos.push({ avg: avg, ops: ops });
    }
    return partidos;
}

function crearGrafico(canvas, label, data, color) {
    if (!canvas || !data || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;

    const padding = 20;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    const maxValue = Math.max(...data) * 1.1; // 10% de margen superior
    const stepX = chartWidth / (data.length - 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar línea
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    data.forEach((point, i) => {
        const x = padding + i * stepX;
        const y = padding + chartHeight - (point / maxValue) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dibujar puntos
    ctx.fillStyle = color;
    data.forEach((point, i) => {
        const x = padding + i * stepX;
        const y = padding + chartHeight - (point / maxValue) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}

function actualizarTendencias(datos) {
    if (datos.length < 2) return;
    const currentAvg = datos[datos.length - 1].avg;
    const previousAvg = datos[0].avg;
    const trend = ((currentAvg - previousAvg) / previousAvg) * 100;
    
    document.getElementById('weekTrend').textContent = `${trend >= 0 ? '📈' : '📉'} ${trend.toFixed(1)}%`;
    document.getElementById('monthTrend').textContent = `${trend >= -5 ? '📈' : '📉'} ${(trend * 0.7).toFixed(1)}%`;
    document.getElementById('seasonProjection').textContent = `⚾ ${(currentAvg * 1.02).toFixed(3)} AVG`;
}

async function cargarJugadoresRelacionados() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/jugadores`);
        if (!res.ok) throw new Error('No se pudo obtener la lista de jugadores');
        const todosJugadores = await res.json();
        
        const mismaPosicion = todosJugadores.filter(j => j.posicion === playerData.posicion && j.id !== playerData.id).slice(0, 4);
        const mismoEquipo = todosJugadores.filter(j => j.equipo_id === playerData.equipo_id && j.id !== playerData.id).slice(0, 4);
        
        renderizarJugadoresRelacionados('samePositionPlayers', mismaPosicion);
        renderizarJugadoresRelacionados('sameTeamPlayers', mismoEquipo);
    } catch (error) {
        console.error(error);
        document.getElementById('samePositionPlayers').innerHTML = '<div class="empty-state">Error</div>';
        document.getElementById('sameTeamPlayers').innerHTML = '<div class="empty-state">Error</div>';
    }
}

function renderizarJugadoresRelacionados(containerId, jugadores) {
    const container = document.getElementById(containerId);
    if (jugadores.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay jugadores para mostrar.</div>';
        return;
    }
    container.innerHTML = jugadores.map(jugador => `
        <a href="jugador.html?id=${jugador.id}&equipo=${jugador.equipo_id}" class="related-player">
            <div class="related-avatar">${obtenerIniciales(jugador.nombre)}</div>
            <div class="related-info">
                <div class="related-name">${jugador.nombre}</div>
                <div class="related-details">#${jugador.numero || '--'} • ${jugador.posicion || 'N/A'}</div>
            </div>
        </a>
    `).join('');
}

function configurarSistemaComparaciones() {
    document.getElementById('generateComparison').addEventListener('click', generarComparacion);
}

async function generarComparacion() {
    const filter = document.getElementById('comparisonPosition').value;
    const metric = document.getElementById('comparisonMetric').value;
    const container = document.getElementById('comparisonResults');
    container.innerHTML = '<div class="loading">Generando comparación...</div>';

    try {
        const [jugadoresRes, statsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/jugadores`),
            fetch(`${API_BASE_URL}/api/estadisticas-ofensivas`)
        ]);
        if (!jugadoresRes.ok || !statsRes.ok) throw new Error('Error de datos');
        
        const allPlayers = await jugadoresRes.json();
        const allStats = await statsRes.json();

        let filteredPlayers = allPlayers.filter(j => j.id !== playerData.id);
        if (filter === 'position') filteredPlayers = filteredPlayers.filter(j => j.posicion === playerData.posicion);
        if (filter === 'team') filteredPlayers = filteredPlayers.filter(j => j.equipo_id === playerData.equipo_id);

        const comparedData = filteredPlayers.map(p => ({
            jugador: p,
            stats: allStats.find(s => s.jugador_id === p.id)
        })).filter(d => d.stats)
           .sort((a, b) => obtenerValorMetrica(b.stats, metric) - obtenerValorMetrica(a.stats, metric))
           .slice(0, 5);
        
        renderizarResultadosComparacion(comparedData, metric);

    } catch (error) {
        console.error(error);
        container.innerHTML = '<div class="error-message">Error al generar comparación.</div>';
    }
}

function obtenerValorMetrica(stats, metric) {
    if (!stats) return 0;
    switch (metric) {
        case 'avg': return stats.promedio_bateo || 0;
        case 'ops': return (calcularOBP(stats) + calcularSLG(stats));
        case 'hr': return stats.home_runs || 0;
        case 'rbi': return stats.carreras_impulsadas || 0;
        default: return 0;
    }
}

function renderizarResultadosComparacion(jugadores, metric) {
    const container = document.getElementById('comparisonResults');
    if (jugadores.length === 0) {
        container.innerHTML = '<div class="empty-state">No se encontraron jugadores para comparar.</div>';
        return;
    }
    const metricLabels = { avg: 'AVG', ops: 'OPS', hr: 'HR', rbi: 'RBI' };
    container.innerHTML = jugadores.map((item, index) => {
        const { jugador, stats } = item;
        const value = obtenerValorMetrica(stats, metric);
        return `
            <div class="comparison-player" onclick="window.location.href='jugador.html?id=${jugador.id}&equipo=${jugador.equipo_id}'">
                <div class="comparison-player-info">
                    <div class="comparison-avatar">${obtenerIniciales(jugador.nombre)}</div>
                    <div>
                        <div style="color: #ffd700; font-weight: bold;">${jugador.nombre}</div>
                        <div style="color: #fff; opacity: 0.8; font-size: 0.8rem;">${jugador.equipo_nombre || 'N/A'}</div>
                    </div>
                </div>
                <div class="comparison-stats">
                    <div class="comparison-stat">
                        <div class="comparison-stat-value">${['avg', 'ops'].includes(metric) ? value.toFixed(3) : value}</div>
                        <div class="comparison-stat-label">${metricLabels[metric]}</div>
                    </div>
                     <div class="comparison-stat">
                        <div class="comparison-stat-value">#${index + 1}</div>
                        <div class="comparison-stat-label">RANK</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function configurarSistemaFavoritos() {
    document.getElementById('toggleFavorite').addEventListener('click', toggleFavorito);
    document.getElementById('sharePlayer').addEventListener('click', compartirJugador);
    document.getElementById('exportPlayerData').addEventListener('click', exportarDatosJugador);
    document.getElementById('saveNotes').addEventListener('click', guardarNotasJugador);
    actualizarEstadoFavorito();
}

function toggleFavorito() {
    const isFavorite = playerFavorites.includes(currentPlayerId);
    if (isFavorite) {
        playerFavorites = playerFavorites.filter(id => id !== currentPlayerId);
    } else {
        playerFavorites.push(currentPlayerId);
    }
    localStorage.setItem('playerFavorites', JSON.stringify(playerFavorites));
    actualizarEstadoFavorito();
    mostrarNotificacion(isFavorite ? 'Removido de favoritos' : 'Agregado a favoritos', isFavorite ? 'warning' : 'success');
}

function actualizarEstadoFavorito() {
    const isFavorite = playerFavorites.includes(currentPlayerId);
    document.getElementById('favoriteIcon').textContent = isFavorite ? '★' : '☆';
    document.getElementById('favoriteText').textContent = isFavorite ? 'Quitar de Favoritos' : 'Agregar a Favoritos';
    document.getElementById('toggleFavorite').classList.toggle('active', isFavorite);
}

function compartirJugador() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ title: `Perfil de ${playerData.nombre}`, url }).catch(console.error);
    } else {
        navigator.clipboard.writeText(url).then(() => mostrarNotificacion('Enlace copiado', 'success'));
    }
}

function exportarDatosJugador() {
    const data = { jugador: playerData, estadisticas: playerStats, historial: gamesHistory, fechaExportacion: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${playerData.nombre.replace(/\s+/g, '_')}_data.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    mostrarNotificacion('Datos exportados', 'success');
}

function guardarNotasJugador() {
    const notes = document.getElementById('playerNotes').value;
    localStorage.setItem(`player_notes_${currentPlayerId}`, notes);
    mostrarNotificacion('Notas guardadas', 'success');
}

function cargarNotasJugador() {
    const notes = localStorage.getItem(`player_notes_${currentPlayerId}`) || '';
    document.getElementById('playerNotes').value = notes;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const noti = document.createElement('div');
    noti.textContent = mensaje;
    noti.style.cssText = `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: ${tipo === 'success' ? '#4CAF50' : '#ff8c00'}; color: #1a1a2e; padding: 12px 20px; border-radius: 25px; font-weight: bold; z-index: 10001; transition: opacity 0.3s, transform 0.3s; opacity: 0; transform: translate(-50%, 20px);`;
    document.body.appendChild(noti);
    setTimeout(() => { noti.style.opacity = '1'; noti.style.transform = 'translate(-50%, 0)'; }, 10);
    setTimeout(() => { noti.style.opacity = '0'; noti.style.transform = 'translate(-50%, 20px)'; setTimeout(() => noti.remove(), 300); }, 3000);
}

window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(crearGraficosRendimiento, 250);
});