// ===================================
// JUGADOR-DETALLES.JS - VERSIÓN FINAL CON STRIKEOUTS CORREGIDOS
// ===================================

// Variables globales
let currentPlayerId = null;
let playerData = null;
let currentSeason = null;

// ===================================
// INICIALIZACIÓN DEL DOM
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    // Implementación directa de getIdFromUrl para evitar dependencias
    const urlParams = new URLSearchParams(window.location.search);
    currentPlayerId = parseInt(urlParams.get('id'));
    currentSeason = getCurrentSeason();

    if (!currentPlayerId || isNaN(currentPlayerId)) {
        // Mostrar error sin dependencia de utils.js
        showAppError('.container', "ID de jugador inválido o no encontrado en la URL.");
        return;
    }

    console.log('📄 Cargando datos del jugador ID:', currentPlayerId);
    loadPlayerData(currentPlayerId);
});

// Función de error simple sin dependencias
function showAppError(selector, message) {
    const container = document.querySelector(selector);
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #ff8c00;">
                <h2>⚠️ Error</h2>
                <p>${message}</p>
                <a href="index.html" style="color: #ffd700;">Volver al Inicio</a>
            </div>
        `;
    }
}

function getCurrentSeason() {
    const temporadaParam = new URLSearchParams(window.location.search).get('temporada');
    return temporadaParam && temporadaParam.trim() !== '' ? temporadaParam : null;
}

// ===================================
// CARGA DE DATOS PRINCIPAL
// ===================================
async function loadPlayerData(id) {
    try {
        console.log('📡 Iniciando carga de datos del jugador...');

        const playerResponse = await fetch(`/api/jugadores/${id}`);
        if (!playerResponse.ok) {
            throw new Error(`Jugador no encontrado (status: ${playerResponse.status})`);
        }
        const player = await playerResponse.json();

        const statsQuery = buildStatsQuery(id, player.equipo_id, currentSeason);
        const [statsOfensivas, statsPitcheo, statsDefensivas] = await Promise.all([
            fetchJsonSafely(`/api/estadisticas-ofensivas${statsQuery}`),
            fetchJsonSafely(`/api/estadisticas-pitcheo${statsQuery}`),
            fetchJsonSafely(`/api/estadisticas-defensivas${statsQuery}`)
        ]);

        console.log('✅ Datos cargados:', { player, statsOfensivas, statsPitcheo, statsDefensivas });

        // 🔍 DEBUGGING ESPECÍFICO PARA STRIKEOUTS
        console.log('🔍 DEBUGGING DETALLADO - STRIKEOUTS:');
        console.log('  📊 Datos del Player (API /jugadores):', player);
        console.log('  🎯 STRIKEOUTS DEL PLAYER:', player.strikeouts);
        console.log('  📊 Estadísticas Ofensivas (API /estadisticas-ofensivas):', statsOfensivas);
        console.log('  ⚾ Estadísticas Pitcheo:', statsPitcheo);
        const offensiveSelected = selectStatRecord(statsOfensivas, { jugadorId: id, equipoId: player.equipo_id, temporada: currentSeason });
        const pitchingSelected = selectStatRecord(statsPitcheo, { jugadorId: id, equipoId: player.equipo_id, temporada: currentSeason });
        if (offensiveSelected) {
            console.log('  🎯 STRIKEOUTS DE STATS OFENSIVAS:', offensiveSelected.strikeouts);
            console.log('  📋 TODOS LOS CAMPOS OFENSIVOS:', Object.keys(offensiveSelected));
        }
        if (pitchingSelected) {
            console.log('  🥎 STRIKEOUTS DEL PITCHER:', pitchingSelected.strikeouts);
            console.log('  📋 TODOS LOS CAMPOS PITCHEO:', Object.keys(pitchingSelected));
        }

        // Guardar datos globalmente
        playerData = player;

        // Renderizar información
        renderPlayerInfo(player);
        const statsContext = { jugadorId: id, equipoId: player.equipo_id, temporada: currentSeason };
        renderStats(statsOfensivas, 'statsBateoContainer', 'bateo', statsContext);
        renderStats(statsPitcheo, 'statsPitcheoContainer', 'pitcheo', statsContext);
        renderStats(statsPitcheo, 'statsPitcheoDetailContainer', 'pitcheo-detail', statsContext);
        renderStats(statsDefensivas, 'statsDefensaContainer', 'defensa', statsContext);
        
        // Configurar navegación
        configurarNavegacion(player);

    } catch (error) {
        console.error("⚠ Error al cargar los datos del jugador:", error);
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
    
    // Equipo en el resumen y header
    const teamNameEl = document.getElementById('playerTeamName');
    const teamNameHeaderEl = document.getElementById('playerTeamNameHeader');
    if (teamNameEl) {
        teamNameEl.textContent = player.equipo_nombre || 'Sin Equipo';
        // ✅ NUEVO: Ajustar tamaño si es muy largo
        if (player.equipo_nombre && player.equipo_nombre.length > 12) {
            teamNameEl.style.fontSize = '1.5rem';
        }
    }
    if (teamNameHeaderEl) {
        teamNameHeaderEl.textContent = player.equipo_nombre || 'Sin Equipo';
    }
    
    // Breadcrumbs
    const teamBreadcrumb = document.getElementById('teamBreadcrumbLink');
    if (player.equipo_nombre && player.equipo_id) {
        teamBreadcrumb.innerHTML = `<a href="equipo.html?id=${player.equipo_id}">${player.equipo_nombre}</a>`;
    } else {
        teamBreadcrumb.textContent = "Sin Equipo";
    }
    document.getElementById('playerBreadcrumb').textContent = player.nombre;

    // Logo del Jugador: Iniciales si no hay logo de equipo
    const teamLogoEl = document.getElementById('teamLogo');
    if (teamLogoEl) {
        if (player.equipo_nombre) {
            const logoUrl = getTeamLogo(player.equipo_nombre);
            // Intentar mostrar logo del equipo, si falla mostrar iniciales del jugador
            const img = new Image();
            img.onload = function() {
                teamLogoEl.style.backgroundImage = `url('${logoUrl}')`;
                teamLogoEl.style.backgroundSize = 'cover';
                teamLogoEl.style.backgroundPosition = 'center';
                teamLogoEl.innerHTML = '';
            };
            img.onerror = function() {
                // Si falla el logo, mostrar iniciales del jugador
                mostrarInicialesJugador(teamLogoEl, player.nombre);
            };
            img.src = logoUrl;
        } else {
            // Si no hay equipo, mostrar iniciales del jugador
            mostrarInicialesJugador(teamLogoEl, player.nombre);
        }
    }

    console.log('✅ Información del jugador renderizada correctamente');
}

// ===================================
// RENDERIZADO DE ESTADÍSTICAS - VERSIÓN CORREGIDA
// ===================================
function renderStats(stats, containerId, type, context = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`⚠️ Contenedor ${containerId} no encontrado`);
        return;
    }

    if (!stats || stats.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay estadísticas disponibles.</div>';
        if (type === 'bateo') {
            actualizarEstadisticasPrincipales({});
        }
        return;
    }

    const stat = selectStatRecord(stats, context);
    if (!stat) {
        container.innerHTML = '<div class="empty-state">No hay estadísticas disponibles.</div>';
        if (type === 'bateo') {
            actualizarEstadisticasPrincipales({});
        }
        return;
    }
    
    // 🔍 DEBUGGING: Ver qué datos llegan
    console.log('🔍 DEBUGGING - Datos de estadísticas:', stat);
    console.log('🔍 DEBUGGING - Strikeouts value:', stat.strikeouts);
    console.log('🔍 DEBUGGING - Tipo de estadística:', type);
    
    let html = '';

    const valueOrZero = toNumber;
    const atBats = valueOrZero(stat.at_bats);
    const hits = valueOrZero(stat.hits);
    const homeRuns = valueOrZero(stat.home_runs);
    const rbi = valueOrZero(stat.rbi);
    const runs = valueOrZero(stat.runs);
    const walks = valueOrZero(stat.walks);
    const stolenBases = valueOrZero(stat.stolen_bases);
    const strikeouts = valueOrZero(stat.strikeouts);
    const doubles = valueOrZero(stat.doubles);
    const triples = valueOrZero(stat.triples);
    const caughtStealing = valueOrZero(stat.caught_stealing);
    const hitByPitch = valueOrZero(stat.hit_by_pitch);
    const sacrificeFlies = valueOrZero(stat.sacrifice_flies);
    const sacrificeHits = valueOrZero(stat.sacrifice_hits);

    const inningsPitched = valueOrZero(stat.innings_pitched);
    const earnedRuns = valueOrZero(stat.earned_runs);
    const wins = valueOrZero(stat.wins);
    const losses = valueOrZero(stat.losses);
    const saves = valueOrZero(stat.saves);
    const hitsAllowed = valueOrZero(stat.hits_allowed);
    const walksAllowed = valueOrZero(stat.walks_allowed);

    const putouts = valueOrZero(stat.putouts);
    const assists = valueOrZero(stat.assists);
    const errors = valueOrZero(stat.errors);
    const doublePlays = valueOrZero(stat.double_plays);
    const passedBalls = valueOrZero(stat.passed_balls);
    const chances = valueOrZero(stat.chances);

    const statMapping = {
        bateo: [
            { label: 'AVG', value: (atBats > 0 ? (hits / atBats) : 0).toFixed(3) },
            { label: 'HR', value: homeRuns },
            { label: 'RBI', value: rbi },
            { label: 'OPS', value: calcularOPS({ ...stat, at_bats: atBats, hits, walks, home_runs: homeRuns }).toFixed(3) },
            { label: 'At-Bats (AB)', value: atBats },
            { label: 'Hits (H)', value: hits },
            { label: 'Carreras (R)', value: runs },
            { label: 'Bases Robadas (SB)', value: stolenBases },
            { label: 'Bases por Bolas (BB)', value: walks },
            { label: 'Ponches (SO)', value: strikeouts }, // ✅ CORREGIDO: Agregado strikeouts
        ],
        pitcheo: [
            { label: 'ERA', value: (inningsPitched > 0 ? (earnedRuns * 9) / inningsPitched : 0).toFixed(2) },
            { label: 'Victorias (W)', value: wins },
            { label: 'Derrotas (L)', value: losses },
            { label: 'Ponches (SO)', value: strikeouts },
        ],
        'pitcheo-detail': [
            { label: 'Innings (IP)', value: inningsPitched },
            { label: 'Salvados (SV)', value: saves },
            { label: 'Hits Permitidos (H)', value: hitsAllowed },
            { label: 'BB Permitidas (BB)', value: walksAllowed },
        ],
        defensa: [
            { label: 'Fielding % (FLD)', value: calcularFieldingPercentage({ ...stat, putouts, assists, errors }).toFixed(3) },
            { label: 'Putouts (PO)', value: putouts },
            { label: 'Asistencias (A)', value: assists },
            { label: 'Errores (E)', value: errors },
            { label: 'Double Plays (DP)', value: doublePlays },
            { label: 'Passed Balls (PB)', value: passedBalls },
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

        // 🔍 DEBUGGING: Ver el HTML generado
        if (type === 'bateo') {
            console.log('🔍 DEBUGGING - HTML de bateo generado:', html);
        }

        // Actualizar estadísticas principales si es bateo
        if (type === 'bateo') {
            actualizarEstadisticasPrincipales({ 
                ...stat, 
                at_bats: atBats, 
                hits, 
                home_runs: homeRuns, 
                rbi, 
                runs, 
                walks 
            });
        }
    }

    container.innerHTML = html || '<div class="empty-state">No hay estadísticas disponibles.</div>';
    console.log(`✅ Estadísticas ${type} renderizadas en ${containerId}`);
    
    // 🔍 DEBUGGING: Verificar que se renderizó correctamente
    if (type === 'bateo') {
        console.log('🔍 DEBUGGING - Contenedor después de renderizar:', container.innerHTML);
    }
}

// ===================================
// FUNCIONES AUXILIARES
// ===================================
function toNumber(value) {
    return Number(value) || 0;
}

function buildStatsQuery(jugadorId, equipoId, temporada) {
    const params = new URLSearchParams();
    if (jugadorId) params.set('jugador_id', jugadorId);
    if (equipoId) params.set('equipo_id', equipoId);
    if (temporada) params.set('temporada', temporada);
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
}

function selectStatRecord(stats, { jugadorId, equipoId, temporada }) {
    if (!Array.isArray(stats) || stats.length === 0) return null;
    const normalizedSeason = temporada ? `${temporada}` : null;
    const match = stats.find(item => {
        const matchesPlayer = jugadorId ? Number(item.jugador_id) === Number(jugadorId) : true;
        const matchesTeam = equipoId ? Number(item.equipo_id || item.equipoId) === Number(equipoId) : true;
        const matchesSeason = normalizedSeason ? `${item.temporada}` === normalizedSeason : true;
        return matchesPlayer && matchesTeam && matchesSeason;
    });
    return match || stats[0] || null;
}

async function fetchJsonSafely(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        return await res.json();
    } catch (error) {
        console.error(`⚠️ Error obteniendo ${url}:`, error);
        return [];
    }
}

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
    const atBats = toNumber(stat.at_bats);
    const hits = toNumber(stat.hits);
    const walks = toNumber(stat.walks);
    const homeRuns = toNumber(stat.home_runs);
    const obpDenominator = atBats + walks;
    const obp = obpDenominator > 0 ? ((hits + walks) / obpDenominator) : 0;
    const slg = atBats > 0 ? ((hits + homeRuns * 3) / atBats) : 0;
    return obp + slg;
}

function calcularFieldingPercentage(stat) {
    const total = toNumber(stat.putouts) + toNumber(stat.assists) + toNumber(stat.errors);
    return total > 0 ? (toNumber(stat.putouts) + toNumber(stat.assists)) / total : 0;
}

function actualizarEstadisticasPrincipales(stat) {
    // Actualizar estadísticas en la card principal
    const avgEl = document.getElementById('playerAVG');
    const hrEl = document.getElementById('playerHR');
    const rbiEl = document.getElementById('playerRBI');
    const opsEl = document.getElementById('playerOPS');

    const atBats = toNumber(stat.at_bats);
    const hits = toNumber(stat.hits);
    const homeRuns = toNumber(stat.home_runs);
    const rbi = toNumber(stat.rbi);
    if (avgEl) avgEl.textContent = atBats > 0 ? (hits / atBats).toFixed(3) : '---';
    if (hrEl) hrEl.textContent = Number.isFinite(homeRuns) ? homeRuns : '---';
    if (rbiEl) rbiEl.textContent = Number.isFinite(rbi) ? rbi : '---';
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

function mostrarInicialesJugador(elemento, nombreJugador) {
    // Generar iniciales del jugador
    const iniciales = generarIniciales(nombreJugador);
    
    // Aplicar estilos para las iniciales - TAMAÑO FINAL OPTIMIZADO
    elemento.style.backgroundImage = 'linear-gradient(45deg, #ffd700, #ff8c00)';
    elemento.style.display = 'flex';
    elemento.style.alignItems = 'center';
    elemento.style.justifyContent = 'center';
    elemento.style.fontSize = '1.4rem'; // ✅ REDUCIDO más de 1.8rem a 1.4rem
    elemento.style.fontWeight = 'bold';
    elemento.style.color = '#1a1a2e';
    elemento.style.textShadow = '1px 1px 2px rgba(0,0,0,0.3)';
    elemento.style.border = '3px solid #fff';
    elemento.style.boxShadow = '0 8px 25px rgba(255, 215, 0, 0.4)';
    elemento.style.letterSpacing = '1px'; // ✅ REDUCIDO de 2px a 1px
    elemento.style.width = '120px'; // ✅ FORZAR tamaño exacto
    elemento.style.height = '120px'; // ✅ FORZAR tamaño exacto
    elemento.style.borderRadius = '50%'; // ✅ ASEGURAR círculo perfecto
    
    // Mostrar iniciales
    elemento.innerHTML = iniciales;
}

function generarIniciales(nombre) {
    if (!nombre) return 'JG';
    
    const palabras = nombre.trim().split(/\s+/);
    if (palabras.length === 1) {
        // Si solo hay una palabra, tomar las primeras 2 letras
        return palabras[0].substring(0, 2).toUpperCase();
    } else {
        // Si hay múltiples palabras, tomar primera letra de las primeras 2 palabras
        return palabras.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('');
    }
}

// Función para obtener logo del equipo (implementación simple)
function getTeamLogo(teamName) {
    // Implementación básica - podrías mejorar esto con logos reales
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(teamName)}&background=ffd700&color=1a1a2e&size=120`;
}

console.log('📄 jugador-detalles.js cargado correctamente - VERSIÓN CON STRIKEOUTS CORREGIDOS');
