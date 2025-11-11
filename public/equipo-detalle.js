// ===================================
// VARIABLES GLOBALES
// ===================================
let currentTeamId = null;
let teamData = null;
let rosterData = [];
let recentGames = [];
let filteredRoster = [];
let currentFilter = 'all';

// ===================================
// MANEJO DE FECHAS
// ===================================
function formatearFecha(fechaString) {
    if (!fechaString) return 'Fecha no disp.';
    const date = new Date(fechaString);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// ===================================
// INICIALIZACIÓN DEL DOM
// ===================================
document.addEventListener('DOMContentLoaded', function() {
    currentTeamId = getIdFromUrl('id');
    
    if (!currentTeamId) {
        showAppError('.container', 'No se especificó un equipo válido. Verifica la URL.');
        return;
    }
    
    if (isNaN(currentTeamId)) {
        showAppError('.container', 'ID de equipo inválido. Debe ser un número.');
        return;
    }
    
    configurarEventListeners();
    cargarDatosEquipo();
});

function configurarEventListeners() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.position;
            filtrarRoster();
        });
    });
}

// ===================================
// CARGA DE DATOS
// ===================================
async function cargarDatosEquipo() {
    try {
        await Promise.all([
            cargarInformacionEquipo(),
            cargarRosterEquipo(),
            cargarPartidosRecientes()
        ]);
        calcularEstadisticas();
        actualizarBreadcrumbConPosicion();
    } catch (error) {
        console.error('Error cargando datos del equipo:', error);
    }
}

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
        console.error('Error cargando información del equipo:', error);
        showAppError('.container', error.message);
        throw error;
    }
}

async function cargarRosterEquipo() {
    const container = document.getElementById('rosterContainer');
    try {
        const response = await fetch(`/api/jugadores?equipo_id=${currentTeamId}`);
        if (!response.ok) throw new Error(`Error cargando roster: ${response.status}`);
        
        const data = await response.json();
        rosterData = Array.isArray(data.jugadores) ? data.jugadores : (Array.isArray(data) ? data : []);
        filteredRoster = [...rosterData];
        renderizarRoster();
        
    } catch (error) {
        console.error('Error cargando roster:', error);
        container.innerHTML = `<div class="empty-state"><h4>⚠️ Error cargando roster</h4><p>No se pudo cargar la información de los jugadores.<br><button onclick="cargarRosterEquipo()" class="btn-secondary" style="margin-top: 10px;">🔄 Reintentar</button></p></div>`;
    }
}

async function cargarPartidosRecientes() {
    const container = document.getElementById('recentGamesContainer');
    try {
        const response = await fetch(`/api/partidos?equipo_id=${currentTeamId}&limit=10`);
        if (!response.ok) throw new Error(`Error cargando partidos: ${response.status}`);
        
        const data = await response.json();
        recentGames = data.partidos || [];
        
        renderizarPartidosRecientes();
        
    } catch (error) {
        console.error('Error cargando partidos recientes:', error);
        container.innerHTML = `<div class="empty-state"><h4>⚠️ Error cargando partidos</h4><p>No se pudo cargar el historial de partidos.<br><button onclick="cargarPartidosRecientes()" class="btn-secondary" style="margin-top: 10px;">🔄 Reintentar</button></p></div>`;
    }
}

// ===================================
// RENDERIZADO
// ===================================
function renderizarInformacionEquipo() {
    if (!teamData) return;
    
    document.title = `${teamData.nombre} - Chogui League`;

    function actualizarURLAmigable() {
        if (!teamData || !teamData.nombre) return;
        
        const nombreAmigable = teamData.nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const nuevaURL = `equipo.html?id=${currentTeamId}&nombre=${nombreAmigable}`;
        
        window.history.replaceState(null, document.title, nuevaURL);
        
        const breadcrumb = document.getElementById('teamBreadcrumb');
        if (breadcrumb) breadcrumb.innerHTML = `<strong style="color: #ffd700;">${teamData.nombre}</strong>`;
    }
    actualizarURLAmigable();
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = `Información completa de ${teamData.nombre} - Roster, estadísticas y partidos en Chogui League`;
    
    // Usar la función de utils.js
    const logoUrl = getTeamLogo(teamData.nombre);
    displayTeamLogo('.team-logo', logoUrl, teamData.nombre);
    
    document.getElementById('teamName').textContent = teamData.nombre;
    document.getElementById('teamLocation').textContent = teamData.ciudad || 'Ubicación no especificada';
    document.getElementById('teamManager').textContent = teamData.manager || 'Manager no asignado';
    
    if (teamData.fecha_creacion) {
        const año = new Date(teamData.fecha_creacion).getFullYear();
        document.getElementById('teamFounded').textContent = isNaN(año) ? 'Fecha no disponible' : año;
    } else {
        document.getElementById('teamFounded').textContent = 'Fecha no disponible';
    }
}

function renderizarRoster() {
    const container = document.getElementById('rosterContainer');
    const jugadorDestacado = getIdFromUrl('jugador');
    
    if (!filteredRoster || filteredRoster.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay jugadores en este equipo</div>';
        return;
    }
    
    container.innerHTML = filteredRoster.map(jugador => {
        const esDestacado = jugadorDestacado && jugador.nombre.toLowerCase().includes(jugadorDestacado.toLowerCase());
        const claseDestacado = esDestacado ? ' style="background: rgba(245, 158, 11, 0.3); border: 2px solid var(--accent-gold); animation: highlight 2s ease-in-out;"' : '';
        
        return `
            <div class="player-card"${claseDestacado} onclick="verJugador(${jugador.id})">
                <div class="player-number">${jugador.numero || '--'}</div>
                <div class="player-info">
                    <div class="player-name">${jugador.nombre}</div>
                    <div class="player-position">${formatearPosicion(jugador.posicion)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    if (jugadorDestacado) {
        setTimeout(() => {
            const el = container.querySelector('[style*="rgba(245, 158, 11, 0.3)"]');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500);
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
            </div>
        `;
    }).join('');
}

// ===================================
// CÁLCULOS Y ESTADÍSTICAS
// ===================================
function calcularEstadisticas() {
    let victorias = 0, derrotas = 0, carrerasAnotadas = 0, carrerasPermitidas = 0;
    
    const partidosFinalizados = recentGames.filter(p => p.carreras_local !== null && p.carreras_visitante !== null);
    
    partidosFinalizados.forEach(partido => {
        const esLocal = partido.equipo_local_id == currentTeamId;
        const carrerasEquipo = esLocal ? partido.carreras_local : partido.carreras_visitante;
        const carrerasRival = esLocal ? partido.carreras_visitante : partido.carreras_local;
        
        carrerasAnotadas += carrerasEquipo || 0;
        carrerasPermitidas += carrerasRival || 0;
        
        if (carrerasEquipo > carrerasRival) victorias++;
        else derrotas++;
    });
    
    const partidosJugados = victorias + derrotas;
    const porcentajeVictorias = partidosJugados > 0 ? (victorias / partidosJugados) : 0;
    
    document.getElementById('teamRecord').textContent = `${victorias}-${derrotas}`;
    document.getElementById('teamPosition').textContent = '--';
    document.getElementById('teamAverage').textContent = porcentajeVictorias.toFixed(3);
    document.getElementById('teamRuns').textContent = carrerasAnotadas;
    
    document.getElementById('winPercentage').textContent = porcentajeVictorias.toFixed(3);
    document.getElementById('gamesPlayed').textContent = partidosJugados;
    document.getElementById('wins').textContent = victorias;
    document.getElementById('losses').textContent = derrotas;
    document.getElementById('runsScored').textContent = carrerasAnotadas;
    document.getElementById('runsAllowed').textContent = carrerasPermitidas;
}

async function actualizarBreadcrumbConPosicion() {
    try {
        const response = await fetch('/api/posiciones');
        if (!response.ok) return;
        
        const standings = await response.json();
        const posicion = standings.findIndex(e => e.id == currentTeamId) + 1;
        
        if (posicion > 0) document.getElementById('teamPosition').textContent = `#${posicion}`;

    } catch (error) {
        console.warn('No se pudo obtener la posición en la tabla');
    }
}

// ===================================
// FUNCIONES AUXILIARES Y NAVEGACIÓN
// ===================================
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

function formatearPosicion(posicion) {
    const posiciones = { 'P': 'Pitcher', 'C': 'Catcher', '1B': 'Primera Base', '2B': 'Segunda Base', '3B': 'Tercera Base', 'SS': 'Shortstop', 'LF': 'Left Field', 'CF': 'Center Field', 'RF': 'Right Field', 'UTIL': 'Utility' };
    return posiciones[posicion] || posicion || 'N/A';
}

function obtenerResultadoPartido(partido, esLocal) {
    if (partido.carreras_local === null || partido.carreras_visitante === null) return 'Pendiente';
    const carrerasEquipo = esLocal ? partido.carreras_local : partido.carreras_visitante;
    const carrerasRival = esLocal ? partido.carreras_visitante : partido.carreras_local;
    const resultado = carrerasEquipo > carrerasRival ? 'G' : 'P';
    return `${resultado} ${carrerasEquipo}-${carrerasRival}`;
}

function verJugador(jugadorId) {
    window.location.href = `jugador.html?id=${jugadorId}`;
}
