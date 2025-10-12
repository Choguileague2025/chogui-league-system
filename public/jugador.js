// JUGADOR.JS - CORREGIDO PARA FASE 1

// --- Configuración de API ---
// Usamos rutas relativas para que funcione en cualquier entorno (local o producción)
const API_BASE_URL = ''; 

// --- Variables globales ---
let currentPlayerId = null;
let playerData = null;
let playerStats = null; // Será un objeto, no un array
let gamesHistory = [];

// ===================================
// --- FUNCIONES PRINCIPALES ---
// ===================================

/**
 * Inicialización al cargar la página: obtiene el ID y carga los datos.
 */
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    currentPlayerId = parseInt(urlParams.get('id'), 10);

    if (!currentPlayerId || isNaN(currentPlayerId)) {
        mostrarErrorGeneral('ID de jugador inválido o no proporcionado.');
        return;
    }
    
    cargarDatosJugador();
});

/**
 * Carga todos los datos necesarios para la página del jugador desde la API.
 */
async function cargarDatosJugador() {
    try {
        console.log(`🔄 Cargando datos del jugador ID: ${currentPlayerId}...`);
        
        // Hacemos las llamadas a la API en paralelo para mayor eficiencia
        const [jugadorResponse, statsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/jugadores/${currentPlayerId}`),
            fetch(`${API_BASE_URL}/api/estadisticas-ofensivas?jugador_id=${currentPlayerId}`)
        ]);

        if (!jugadorResponse.ok) {
            throw new Error(`No se pudo encontrar la información del jugador (Error ${jugadorResponse.status}).`);
        }
        
        playerData = await jugadorResponse.json();
        
        // Las estadísticas pueden no existir, lo manejamos de forma segura
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            // El endpoint puede devolver un array, nos aseguramos de tomar el primer objeto
            playerStats = Array.isArray(statsData) ? statsData[0] : statsData;
        } else {
            console.warn(`⚠️ No se encontraron estadísticas ofensivas para el jugador ID: ${currentPlayerId}`);
            playerStats = {}; // Asignamos un objeto vacío para evitar errores
        }

        // ✅ INICIO DE CORRECCIÓN 4.1: Cargar historial de partidos REALES
        const partidosResponse = await fetch(`${API_BASE_URL}/api/jugadores/${currentPlayerId}/partidos`);
        if (partidosResponse.ok) {
            gamesHistory = await partidosResponse.json();
            console.log('✅ Historial de partidos cargado:', gamesHistory.length);
        } else {
            console.warn('⚠️ No se pudieron cargar los partidos del jugador');
            gamesHistory = [];
        }
        // ✅ FIN DE CORRECCIÓN 4.1

        console.log('✅ Datos del jugador cargados:', { playerData, playerStats });

        renderizarPagina();
        
        // Inicializamos funcionalidades avanzadas después de renderizar lo básico
        setTimeout(inicializarFuncionalidadesAvanzadas, 300);

    } catch (error) {
        console.error('❌ Error fatal al cargar datos del jugador:', error);
        mostrarErrorGeneral(error.message);
    }
}

// ===================================
// --- FUNCIONES DE RENDERIZADO ---
// ===================================

/**
 * Llama a todas las funciones de renderizado para construir la página.
 */
function renderizarPagina() {
    renderizarHeaderJugador();
    renderizarEstadisticasBateo();
    renderizarMetricasAvanzadas();
    renderizarHistorialPartidos();
    configurarNavegacion();
}

/**
 * Renderiza la tarjeta principal del jugador.
 */
function renderizarHeaderJugador() {
    document.title = `${playerData.nombre} - Chogui League System`;
    
    document.getElementById('playerBreadcrumb').textContent = playerData.nombre;
    const teamLink = document.getElementById('teamBreadcrumbLink');
    teamLink.textContent = playerData.equipo_nombre || 'Equipo';
    if (playerData.equipo_id) {
        teamLink.href = `equipo.html?id=${playerData.equipo_id}`;
    }

    document.getElementById('playerAvatar').textContent = obtenerIniciales(playerData.nombre);
    document.getElementById('playerName').textContent = playerData.nombre;
    document.getElementById('playerNumber').textContent = `#${playerData.numero || '--'}`;
    document.getElementById('playerPosition').textContent = formatearPosicion(playerData.posicion);
    const playerTeamLink = document.getElementById('playerTeamLink');
    playerTeamLink.textContent = playerData.equipo_nombre || 'Sin equipo';
    if (playerData.equipo_id) {
        playerTeamLink.href = `equipo.html?id=${playerData.equipo_id}`;
    }
    
    document.getElementById('playerHeight').textContent = playerData.altura ? `${playerData.altura} cm` : 'No disponible';
    document.getElementById('playerWeight').textContent = playerData.peso ? `${playerData.peso} kg` : 'No disponible';
}

/**
 * Renderiza las estadísticas de bateo principales.
 */
function renderizarEstadisticasBateo() {
    const stats = playerStats || {}; // Objeto seguro
    const avg = calcularAVG(stats);
    const obp = calcularOBP(stats);
    const slg = calcularSLG(stats);

    document.getElementById('battingAverage').textContent = avg.toFixed(3);
    document.getElementById('onBasePercentage').textContent = obp.toFixed(3);
    document.getElementById('sluggingPercentage').textContent = slg.toFixed(3);
    document.getElementById('ops').textContent = (obp + slg).toFixed(3);
    
    document.getElementById('homeRuns').textContent = stats.home_runs || 0;
    document.getElementById('rbi').textContent = stats.rbi || 0; 
    document.getElementById('hits').textContent = stats.hits || 0;
    document.getElementById('atBats').textContent = stats.at_bats || 0;
}

/**
 * Renderiza las métricas avanzadas (con datos simulados si no están en la API).
 */
function renderizarMetricasAvanzadas() {
    const stats = playerStats || {};
    document.getElementById('warTotal').textContent = (stats.war_total || 0.0).toFixed(2);
    document.getElementById('wrcPlus').textContent = 'N/A'; // Dato no disponible
    document.getElementById('stolenBases').textContent = stats.stolen_bases || 0;
    document.getElementById('defensiveRating').textContent = (stats.rating_defensivo || 0.0).toFixed(2);
}

/**
 * Renderiza el historial de partidos.
 */
// ✅ INICIO DE CORRECCIÓN 4.2: REEMPLAZO COMPLETO DE LA FUNCIÓN
function renderizarHistorialPartidos() {
    const container = document.getElementById('gamesHistoryContainer');

    if (!gamesHistory || gamesHistory.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay partidos registrados</div>';
        return;
    }

    const html = gamesHistory.map(partido => {
        const esLocal = partido.equipo_local_id === playerData.equipo_id;
        const equipoRival = esLocal ? partido.equipo_visitante_nombre : partido.equipo_local_nombre;
        const carrerasEquipo = esLocal ? partido.carreras_local : partido.carreras_visitante;
        const carrerasRival = esLocal ? partido.carreras_visitante : partido.carreras_local;

        const resultado = carrerasEquipo > carrerasRival ? 'G' : 'P';
        const resultadoClass = resultado === 'G' ? 'win' : 'loss';

        // Formatear fecha
        const fecha = new Date(partido.fecha_partido + 'T00:00:00Z');
        const fechaFormateada = fecha.toLocaleDateString('es-ES', { 
             day: '2-digit', 
             month: '2-digit', 
             year: 'numeric',
            timeZone: 'UTC'
        });

        return `
            <div class="game-item">
                <div class="game-opponent">vs ${equipoRival}</div>
                <div class="game-result ${resultadoClass}">
                    ${resultado} ${carrerasEquipo}-${carrerasRival}
                </div>
                <div class="game-date">${fechaFormateada}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}
// ✅ FIN DE CORRECCIÓN 4.2

// ===================================
// --- FUNCIONES HELPER Y CÁLCULOS ---
// ===================================

function calcularAVG(stats) {
    const h = stats.hits || 0;
    const ab = stats.at_bats || 0;
    return ab > 0 ? (h / ab) : 0;
}

function calcularOBP(stats) {
    const h = stats.hits || 0;
    const bb = stats.walks || 0;
    const hbp = stats.golpes_por_lanzador || 0;
    const ab = stats.at_bats || 0;
    const sf = stats.flies_de_sacrificio || 0;
    const denominador = ab + bb + sf + hbp;
    return denominador > 0 ? (h + bb + hbp) / denominador : 0;
}

function calcularSLG(stats) {
    const h = stats.hits || 0;
    const dobles = stats.dobles || 0;
    const triples = stats.triples || 0;
    const hr = stats.home_runs || 0;
    const ab = stats.at_bats || 0;
    const singles = h - dobles - triples - hr;
    const bases_alcanzadas = singles + (dobles * 2) + (triples * 3) + (hr * 4);
    return ab > 0 ? bases_alcanzadas / ab : 0;
}

function obtenerIniciales(nombre) {
    if (!nombre) return '?';
    const partes = nombre.trim().split(' ');
    if (partes.length > 1) {
        return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
    }
    return partes[0].substring(0, 2).toUpperCase();
}

function formatearPosicion(posicion) {
    const posiciones = { 'P': 'Pitcher', 'C': 'Catcher', '1B': 'Primera Base', '2B': 'Segunda Base', '3B': 'Tercera Base', 'SS': 'Shortstop', 'LF': 'Left Field', 'CF': 'Center Field', 'RF': 'Right Field', 'UTILITY': 'Utility' };
    return posiciones[posicion] || posicion || 'N/A';
}

function configurarNavegacion() {
    const backBtn = document.getElementById('backToTeamBtn');
    if (playerData.equipo_id) {
        backBtn.href = `equipo.html?id=${playerData.equipo_id}`;
    } else {
        backBtn.style.display = 'none';
    }
}

function mostrarErrorGeneral(mensaje) {
    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = `<div class="error-message"><h2>⚠️ Error</h2><p>${mensaje}</p><a href="index.html" class="btn-primary" style="margin-top:20px;">Volver al Inicio</a></div>`;
    }
}

// ✅ INICIO DE CORRECCIÓN 4.3: FUNCIÓN SIMULADA ELIMINADA
// La función generarHistorialPartidosSimulado() ha sido removida de esta sección.
// ✅ FIN DE CORRECCIÓN 4.3

// ==========================================================
// --- FUNCIONALIDADES AVANZADAS (SIN CAMBIOS PARA PROMPT 1) ---
// ==========================================================
let performanceCharts = {};
let playerFavorites = JSON.parse(localStorage.getItem('playerFavorites') || '[]');

function inicializarFuncionalidadesAvanzadas() {
    if (!playerData) return;
    crearGraficosRendimiento();
    configurarSistemaFavoritos();
    configurarSistemaComparaciones();
    cargarNotasJugador();
}

function crearGraficosRendimiento() {
    // Los gráficos siguen usando datos simulados por ahora, como indica el prompt.
    const partidosData = generarDatosHistoricosParaGraficos();
    crearGrafico(document.getElementById('battingChart'), 'AVG', partidosData.map(p => p.avg), '#ffd700');
    crearGrafico(document.getElementById('opsChart'), 'OPS', partidosData.map(p => p.ops), '#ff8c00');
}

function generarDatosHistoricosParaGraficos() {
    const partidos = [];
    const baseAvg = playerStats ? (calcularAVG(playerStats) || 0.250) : 0.250;
    for (let i = 0; i < 10; i++) {
        const variacion = (Math.random() - 0.5) * 0.100;
        const avg = Math.max(0, Math.min(0.5, baseAvg + variacion));
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
    if(chartWidth <= 0 || chartHeight <= 0) return; // Evitar errores si el canvas no es visible
    const maxValue = Math.max(...data) * 1.1 || 0.5;
    const stepX = chartWidth / (data.length > 1 ? data.length - 1 : 1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    ctx.fillStyle = color;
    data.forEach((point, i) => {
        const x = padding + i * stepX;
        const y = padding + chartHeight - (point / maxValue) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
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
    const data = { jugador: playerData, estadisticas: playerStats, fechaExportacion: new Date().toISOString() };
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
    noti.className = `notification ${tipo}`;
    document.body.appendChild(noti);
    setTimeout(() => { noti.classList.add('show'); }, 10);
    setTimeout(() => { noti.classList.remove('show'); setTimeout(() => noti.remove(), 300); }, 3000);
}

// Función de comparación (sin cambios)
function configurarSistemaComparaciones() {
    // Lógica futura para prompt 2
}
