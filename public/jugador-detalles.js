// ===================================
// JUGADOR-DETALLES.JS - VERSIÓN CORREGIDA
// ===================================

// Variables globales
let currentPlayerId = null;
let playerData = null;

// ===================================
// INICIALIZACIÓN DEL DOM
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    // Usar la función de utils.js
    currentPlayerId = getIdFromUrl('id');

    if (!currentPlayerId || isNaN(currentPlayerId)) {
        // Usar la función de utils.js para mostrar el error
        showAppError('.container', "ID de jugador inválido o no encontrado en la URL.");
        return;
    }

    console.log('🔄 Cargando datos del jugador ID:', currentPlayerId);
    loadPlayerData(currentPlayerId);
});

// ===================================
// CARGA DE DATOS PRINCIPAL
// ===================================
async function loadPlayerData(id) {
    try {
        console.log('📡 Iniciando carga de datos del jugador...');
        
        const [player, statsOfensivas, statsPitcheo, statsDefensivas] = await Promise.all([
            fetch(`/api/jugadores/${id}`).then(res => {
                if (!res.ok) throw new Error(`Jugador no encontrado (status: ${res.status})`);
                return res.json();
            }),
            fetch(`/api/estadisticas-ofensivas?jugador_id=${id}`).then(res => res.json()).catch(e => []),
            fetch(`/api/estadisticas-pitcheo?jugador_id=${id}`).then(res => res.json()).catch(e => []),
            fetch(`/api/estadisticas-defensivas?jugador_id=${id}`).then(res => res.json()).catch(e => [])
        ]);

        console.log('✅ Datos cargados:', { player, statsOfensivas, statsPitcheo, statsDefensivas });

        // Guardar datos globalmente
        playerData = player;

        // Renderizar información
        renderPlayerInfo(player);
        renderStats(statsOfensivas, 'statsBateoContainer', 'bateo');
        renderStats(statsPitcheo, 'statsPitcheoContainer', 'pitcheo');
        renderStats(statsPitcheo, 'statsPitcheoDetailContainer', 'pitcheo-detail');
        renderStats(statsDefensivas, 'statsDefensaContainer', 'defensa');
        
        // Configurar navegación
        configurarNavegacion(player);

    } catch (error) {
        console.error("❌ Error al cargar los datos del jugador:", error);
        showAppError('.container', `No se pudieron cargar los datos del jugador. ${error.message}`);
    }
}

// ===================================
// RENDERIZADO DE INFORMACIÓN DEL JUGADOR
// ===================================
function renderPlayerInfo(player) {
    if (!player) {
        showAppError('.container', "No se encontró la información principal del jugador.");
        return;
    }

    console.log('🎨 Renderizando información del jugador:', player.nombre);

    // Título de la página
    document.title = `${player.nombre} - Perfil - Chogui League`;
    
    // Información básica del jugador
    document.getElementById('playerName').textContent = player.nombre;
    document.getElementById('playerNumber').textContent = player.numero ? `#${player.numero}` : '#--';
    document.getElementById('playerPosition').textContent = formatearPosicion(player.posicion);
    
    // Equipo en el resumen
    const teamNameEl = document.getElementById('playerTeamName');
    if (teamNameEl) {
        teamNameEl.textContent = player.equipo_nombre || 'Sin Equipo';
    }
    
    // Breadcrumbs
    const teamBreadcrumb = document.getElementById('teamBreadcrumbLink');
    if (player.equipo_nombre && player.equipo_id) {
        teamBreadcrumb.innerHTML = `<a href="equipo.html?id=${player.equipo_id}">${player.equipo_nombre}</a>`;
    } else {
        teamBreadcrumb.textContent = "Sin Equipo";
    }
    document.getElementById('playerBreadcrumb').textContent = player.nombre;

    // Logo del Equipo (usando utils.js)
    if (player.equipo_nombre) {
        const logoUrl = getTeamLogo(player.equipo_nombre);
        displayTeamLogo('#teamLogo', logoUrl, player.equipo_nombre);
    }

    console.log('✅ Información del jugador renderizada correctamente');
}

// ===================================
// RENDERIZADO DE ESTADÍSTICAS
// ===================================
function renderStats(stats, containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`⚠️ Contenedor ${containerId} no encontrado`);
        return;
    }

    if (!stats || stats.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay estadísticas disponibles.</div>';
        return;
    }

    const stat = stats[0]; // Asumimos que la API devuelve un array con un solo objeto
    let html = '';

    const statMapping = {
        bateo: [
            { label: 'AVG', value: (stat.at_bats > 0 ? (stat.hits / stat.at_bats) : 0).toFixed(3) },
            { label: 'HR', value: stat.home_runs || 0 },
            { label: 'RBI', value: stat.rbi || 0 },
            { label: 'OPS', value: calcularOPS(stat).toFixed(3) },
            { label: 'At-Bats (AB)', value: stat.at_bats || 0 },
            { label: 'Hits (H)', value: stat.hits || 0 },
            { label: 'Carreras (R)', value: stat.runs || 0 },
            { label: 'Bases Robadas (SB)', value: stat.stolen_bases || 0 },
            { label: 'Bases por Bolas (BB)', value: stat.walks || 0 },
        ],
        pitcheo: [
            { label: 'ERA', value: (stat.innings_pitched > 0 ? (stat.earned_runs * 9) / stat.innings_pitched : 0).toFixed(2) },
            { label: 'Victorias (W)', value: stat.wins || 0 },
            { label: 'Derrotas (L)', value: stat.losses || 0 },
            { label: 'Ponches (SO)', value: stat.strikeouts || 0 },
        ],
        'pitcheo-detail': [
            { label: 'Innings (IP)', value: stat.innings_pitched || 0 },
            { label: 'Salvados (SV)', value: stat.saves || 0 },
            { label: 'Hits Permitidos (H)', value: stat.hits_allowed || 0 },
            { label: 'BB Permitidas (BB)', value: stat.walks_allowed || 0 },
        ],
        defensa: [
            { label: 'Fielding % (FLD)', value: calcularFieldingPercentage(stat).toFixed(3) },
            { label: 'Putouts (PO)', value: stat.putouts || 0 },
            { label: 'Asistencias (A)', value: stat.assists || 0 },
            { label: 'Errores (E)', value: stat.errors || 0 },
            { label: 'Double Plays (DP)', value: stat.double_plays || 0 },
            { label: 'Passed Balls (PB)', value: stat.passed_balls || 0 },
        ]
    };
    
    // Crear HTML para las estadísticas
    if (statMapping[type]) {
        html = statMapping[type].map(s => `
            <div class="stat-item">
                <span class="stat-value">${s.value}</span>
                <span class="stat-label">${s.label}</span>
            </div>
        `).join('');

        // Actualizar estadísticas principales si es bateo
        if (type === 'bateo') {
            actualizarEstadisticasPrincipales(stat);
        }
    }

    container.innerHTML = html || '<div class="empty-state">No hay estadísticas disponibles.</div>';
    console.log(`✅ Estadísticas ${type} renderizadas en ${containerId}`);
}

// ===================================
// FUNCIONES AUXILIARES
// ===================================
function formatearPosicion(posicion) {
    const posiciones = {
        'P': 'Pitcher',
        'C': 'Catcher',
        '1B': 'Primera Base',
        '2B': 'Segunda Base',
        '3B': 'Tercera Base',
        'SS': 'Shortstop',
        'LF': 'Left Field',
        'CF': 'Center Field',
        'RF': 'Right Field',
        'UTIL': 'Utility'
    };
    return posiciones[posicion] || posicion || 'N/A';
}

function calcularOPS(stat) {
    const avg = stat.at_bats > 0 ? (stat.hits / stat.at_bats) : 0;
    const obp = stat.at_bats > 0 ? ((stat.hits + (stat.walks || 0)) / (stat.at_bats + (stat.walks || 0))) : 0;
    const slg = stat.at_bats > 0 ? ((stat.hits + (stat.home_runs || 0) * 3) / stat.at_bats) : 0;
    return obp + slg;
}

function calcularFieldingPercentage(stat) {
    const total = (stat.putouts || 0) + (stat.assists || 0) + (stat.errors || 0);
    return total > 0 ? ((stat.putouts || 0) + (stat.assists || 0)) / total : 0;
}

function actualizarEstadisticasPrincipales(stat) {
    // Actualizar estadísticas en la card principal
    const avgEl = document.getElementById('playerAVG');
    const hrEl = document.getElementById('playerHR');
    const rbiEl = document.getElementById('playerRBI');
    const opsEl = document.getElementById('playerOPS');

    if (avgEl) avgEl.textContent = stat.at_bats > 0 ? (stat.hits / stat.at_bats).toFixed(3) : '---';
    if (hrEl) hrEl.textContent = stat.home_runs || '---';
    if (rbiEl) rbiEl.textContent = stat.rbi || '---';
    if (opsEl) opsEl.textContent = calcularOPS(stat).toFixed(3);
}

function configurarNavegacion(player) {
    const backButton = document.getElementById('backToTeamButton');
    if (backButton) {
        if (player.equipo_id) {
            backButton.href = `equipo.html?id=${player.equipo_id}`;
            backButton.style.display = 'inline-block';
        } else {
            backButton.style.display = 'none';
        }
    }
}

console.log('📄 jugador-detalles.js cargado correctamente');
