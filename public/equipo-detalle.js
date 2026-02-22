// EQUIPO-DETALLE.JS - VERSIÓN CORREGIDA UTF-8
// MODIFICADO: 2025-11-12 - Corrección de caracteres y funcionalidad completa

// ===================================
// CONFIGURACIÓN DE API
// ===================================
const API_BASE_URL = 'https://chogui-league-system-production.up.railway.app';

// ===================================
// VARIABLES GLOBALES
// ===================================
let currentTeamId = null;
let teamData = null;
let rosterData = [];
let recentGames = [];
let filteredRoster = [];
let currentFilter = 'all';
let currentSeason = null;
let standingsData = [];

// ===================================
// FUNCIONES DE INICIALIZACIÓN
// ===================================

function getTeamIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

function getCurrentSeason() {
    const temporadaParam = new URLSearchParams(window.location.search).get('temporada');
    return temporadaParam && temporadaParam.trim() !== '' ? temporadaParam : null;
}

function getApiUrl(endpoint) {
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }
    return `${API_BASE_URL}${endpoint}`;
}

// ===================================
// MANEJO DE LOGOS CON FALLBACK
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
    
    if (logoFile) {
        return `/public/images/logos/${logoFile}`;
    }
    
    const nombreArchivo = nombreNormalizado
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') + '.png';
    
    return `/public/images/logos/${nombreArchivo}`;
}

function mostrarLogoEquipo(logoUrl, equipoNombre) {
    const logoContainer = document.querySelector('.team-logo');
    if (!logoContainer) return;

    const img = new Image();

    img.onload = function() {
        logoContainer.style.backgroundImage = `url('${logoUrl}')`;
        logoContainer.style.backgroundSize = 'contain';
        logoContainer.style.backgroundRepeat = 'no-repeat';
        logoContainer.style.backgroundPosition = 'center';
        logoContainer.innerHTML = '';
    };

    img.onerror = function() {
        console.warn(`Logo no encontrado para ${equipoNombre}, usando iniciales`);
        
        const iniciales = generarIniciales(equipoNombre);

        logoContainer.style.backgroundImage = 'none';
        logoContainer.innerHTML = `
            <div style="
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #ffc107;
                border-radius: 50%;
                font-size: 2.5rem;
                font-weight: bold;
                color: #0d1117;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
            ">
                ${iniciales}
            </div>
        `;
    };

    img.src = logoUrl;
}

function generarIniciales(nombreEquipo) {
    if (!nombreEquipo) return '?';
    
    const palabras = nombreEquipo.trim().split(/\s+/);
    
    if (palabras.length === 1) {
        return palabras[0].substring(0, 2).toUpperCase();
    } else {
        return palabras
            .slice(0, 3)
            .map(p => p.charAt(0).toUpperCase())
            .join('');
    }
}

// ===================================
// MANEJO DE FECHAS
// ===================================

function formatearFecha(fechaString) {
    if (!fechaString) return 'Fecha no disp.';
    const date = new Date(fechaString + 'T00:00:00Z');
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// ===================================
// INICIALIZACIÓN DEL DOM
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    currentTeamId = getTeamIdFromUrl();
    currentSeason = getCurrentSeason();
    
    if (!currentTeamId) {
        mostrarErrorEquipo('No se especificó un equipo válido. Verifica la URL.');
        return;
    }
    
    if (isNaN(currentTeamId)) {
        mostrarErrorEquipo('ID de equipo inválido. Debe ser un número.');
        return;
    }
    
    precargarDatosCriticos();
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

function precargarDatosCriticos() {
    new Image().src = '/public/images/logos/default-logo.png';
    if (!window.equiposCache) {
        fetch(getApiUrl('/api/equipos'))
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => { window.equiposCache = data; })
            .catch(err => console.log('Cache de equipos no disponible:', err));
    }
}

// ===================================
// CARGA DE DATOS
// ===================================

async function cargarDatosEquipo() {
    try {
        const [, , , standings] = await Promise.all([
            cargarInformacionEquipo(),
            cargarRosterEquipo(),
            cargarPartidosRecientes(),
            cargarStandingsEquipo()
        ]);
        standingsData = Array.isArray(standings) ? standings : [];
        calcularEstadisticas(obtenerStandingEquipo(standingsData));
        actualizarBreadcrumbConPosicion(standingsData);
    } catch (error) {
        console.error('Error cargando datos del equipo:', error);
    }
}

async function cargarInformacionEquipo() {
    try {
        const response = await fetch(getApiUrl(`/api/equipos/${currentTeamId}`));
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`Equipo con ID ${currentTeamId} no encontrado`);
            }
            throw new Error(`Error del servidor: ${response.status}`);
        }
        
        teamData = await response.json();
        
        if (!teamData.nombre) {
            throw new Error('Datos del equipo incompletos');
        }
        
        renderizarInformacionEquipo();
        
    } catch (error) {
        console.error('Error cargando información del equipo:', error);
        mostrarErrorEquipo(error.message);
        throw error;
    }
}

async function cargarStandingsEquipo() {
    try {
        const response = await fetch(getApiUrl('/api/standings'));
        if (!response.ok) {
            console.warn('No se pudo obtener standings, respuesta no OK');
            return [];
        }
        return await response.json();
    } catch (error) {
        console.warn('No se pudo obtener standings:', error);
        return [];
    }
}

async function cargarRosterEquipo() {
    const container = document.getElementById('rosterContainer');
    try {
        const response = await fetch(getApiUrl(`/api/jugadores?equipo_id=${currentTeamId}`));
        if (!response.ok) {
            throw new Error(`Error cargando roster: ${response.status}`);
        }
        
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

async function cargarPartidosRecientes() {
    const container = document.getElementById('recentGamesContainer');
    try {
        const temporadaQuery = currentSeason ? `&temporada=${encodeURIComponent(currentSeason)}` : '';
        const response = await fetch(getApiUrl(`/api/partidos?equipo_id=${currentTeamId}&limit=10${temporadaQuery}`));
        if (!response.ok) {
            throw new Error(`Error cargando partidos: ${response.status}`);
        }
        
        const data = await response.json();
        recentGames = data.partidos || [];
        
        renderizarPartidosRecientes();
        
    } catch (error) {
        console.error('Error cargando partidos recientes:', error);
        container.innerHTML = `
            <div class="empty-state">
                <h4>⚠️ Error cargando partidos</h4>
                <p>No se pudo cargar el historial de partidos.<br>
                <button onclick="cargarPartidosRecientes()" class="btn-secondary" style="margin-top: 10px;">🔄 Reintentar</button></p>
            </div>`;
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
        
        const nombreAmigable = teamData.nombre
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        
        const nuevaURL = `equipo.html?id=${currentTeamId}&nombre=${nombreAmigable}`;
        
        const currentPath = window.location.pathname;
        const newFullPath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1) + nuevaURL;
        
        if (window.location.href !== window.location.origin + newFullPath) {
            window.history.replaceState(null, document.title, nuevaURL);
        }
        
        const breadcrumb = document.getElementById('teamBreadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML = `<strong style="color: #ffc107;">${teamData.nombre}</strong>`;
        }
    }
    actualizarURLAmigable();
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.content = `Información completa de ${teamData.nombre} - Roster, estadísticas y partidos en Chogui League`;
    }
    
    const logoUrl = getTeamLogo(teamData.nombre);
    mostrarLogoEquipo(logoUrl, teamData.nombre);
    
    document.getElementById('teamName').textContent = teamData.nombre;
    document.getElementById('teamLocation').textContent = teamData.ciudad || 'Ubicación no especificada';
    document.getElementById('teamManager').textContent = teamData.manager || 'Manager no asignado';
    
    if (teamData.fecha_creacion) {
        const fecha = new Date(teamData.fecha_creacion);
        const año = fecha.getFullYear();
        document.getElementById('teamFounded').textContent = isNaN(año) ? 'Fecha no disponible' : año;
    } else {
        document.getElementById('teamFounded').textContent = 'Fecha no disponible';
    }
}

function renderizarRoster() {
    const container = document.getElementById('rosterContainer');
    
    const urlParams = new URLSearchParams(window.location.search);
    const jugadorDestacado = urlParams.get('jugador');
    
    if (!filteredRoster || filteredRoster.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay jugadores en este equipo</div>';
        return;
    }
    
    let html = '';
    filteredRoster.forEach(jugador => {
        const esDestacado = jugadorDestacado && jugador.nombre.toLowerCase().includes(jugadorDestacado.toLowerCase());
        const claseDestacado = esDestacado ? ' style="background: rgba(255, 193, 7, 0.3); border: 2px solid #ffc107; animation: highlight 2s ease-in-out;"' : '';
        
        html += `
            <div class="player-card"${claseDestacado} onclick="verJugador(${jugador.id})">
                <div class="player-number">${jugador.numero || '--'}</div>
                <div class="player-info">
                    <div class="player-name">${jugador.nombre}</div>
                    <div class="player-position">${formatearPosicion(jugador.posicion)}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    if (jugadorDestacado) {
        setTimeout(() => {
            const jugadorElement = container.querySelector('[style*="rgba(255, 193, 7, 0.3)"]');
            if (jugadorElement) {
                jugadorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
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
        
        // ✅ CORRECCIÓN: Agregar fecha formateada
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

function calcularEstadisticas(standingRow) {
    if (standingRow) {
        const pj = toNumber(standingRow.pj);
        const pg = toNumber(standingRow.pg);
        const pp = toNumber(standingRow.pp);
        const cf = toNumber(standingRow.cf);
        const ce = toNumber(standingRow.ce);
        const porcentajeVal = Number(standingRow.porcentaje) || 0;
        const porcentajeDisplay = porcentajeVal.toFixed(3);
        const ranking = standingRow.ranking ? `#${standingRow.ranking}` : '--';
        const racha = calcularRacha(recentGames);

        setTextContent('teamRecord', `${pg}-${pp}${racha ? ` (${racha})` : ''}`);
        document.querySelectorAll('#teamPosition').forEach(el => el.textContent = ranking);
        setTextContent('teamAverage', porcentajeDisplay);
        setTextContent('teamRuns', cf);

        setTextContent('winPercentage', porcentajeDisplay);
        setTextContent('gamesPlayed', pj);
        setTextContent('wins', pg);
        setTextContent('losses', pp);
        setTextContent('runsScored', cf);
        setTextContent('runsAllowed', ce);
        return;
    }

    // Fallback si no hay standings disponibles: usar partidos recientes
    let victorias = 0, derrotas = 0, carrerasAnotadas = 0, carrerasPermitidas = 0;
    
    const partidosFinalizados = recentGames.filter(partido => partido.carreras_local !== null && partido.carreras_visitante !== null);
    
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
    const racha = calcularRacha(recentGames);
    
    setTextContent('teamRecord', `${victorias}-${derrotas}${racha ? ` (${racha})` : ''}`);
    document.querySelectorAll('#teamPosition').forEach(el => el.textContent = '--');
    setTextContent('teamAverage', porcentajeVictorias.toFixed(3));
    setTextContent('teamRuns', carrerasAnotadas);
    
    setTextContent('winPercentage', porcentajeVictorias.toFixed(3));
    setTextContent('gamesPlayed', partidosJugados);
    setTextContent('wins', victorias);
    setTextContent('losses', derrotas);
    setTextContent('runsScored', carrerasAnotadas);
    setTextContent('runsAllowed', carrerasPermitidas);
}

async function actualizarBreadcrumbConPosicion(standingsOverride) {
    const standings = Array.isArray(standingsOverride) ? standingsOverride : standingsData;
    try {
        const entry = obtenerStandingEquipo(standings);
        if (entry) {
            document.querySelectorAll('#teamPosition').forEach(el => {
                el.textContent = entry.ranking ? `#${entry.ranking}` : `#${(standings || []).indexOf(entry) + 1}`;
            });
            return;
        }
    } catch (error) {
        console.warn('No se pudo obtener la posición en la tabla');
    }
}

// ===================================
// FUNCIONES AUXILIARES
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
    const posiciones = { 
        'P': 'Pitcher', 
        'C': 'Catcher', 
        '1B': 'Primera Base', 
        '2B': 'Segunda Base', 
        '3B': 'Tercera Base', 
        'SS': 'Shortstop', 
        'LF': 'Left Field', 
        'CF': 'Center Field', 
        'RF': 'Right Field' 
    };
    return posiciones[posicion] || posicion || 'N/A';
}

function obtenerStandingEquipo(standings = standingsData) {
    if (!Array.isArray(standings)) return null;
    return standings.find(e => Number(e.id || e.equipo_id) === Number(currentTeamId)) || null;
}

function calcularRacha(partidos = recentGames) {
    const finalizados = Array.isArray(partidos)
        ? partidos.filter(p => p.carreras_local !== null && p.carreras_visitante !== null)
        : [];
    if (finalizados.length === 0) return null;

    // Ordenar por fecha descendente para tomar la racha más reciente
    finalizados.sort((a, b) => {
        const fechaA = new Date(`${a.fecha_partido}T00:00:00Z`).getTime();
        const fechaB = new Date(`${b.fecha_partido}T00:00:00Z`).getTime();
        return fechaB - fechaA;
    });

    const resultado = (partido) => {
        const esLocal = partido.equipo_local_id == currentTeamId;
        const carrerasEquipo = esLocal ? partido.carreras_local : partido.carreras_visitante;
        const carrerasRival = esLocal ? partido.carreras_visitante : partido.carreras_local;
        return carrerasEquipo > carrerasRival ? 'W' : 'L';
    };

    let racha = 0;
    let signo = null;
    for (const juego of finalizados) {
        const res = resultado(juego);
        if (!signo) {
            signo = res;
            racha = 1;
            continue;
        }
        if (res === signo) {
            racha += 1;
        } else {
            break;
        }
    }

    return signo ? `${signo}${racha}` : null;
}

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function setTextContent(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = value;
}

function obtenerResultadoPartido(partido, esLocal) {
    if (partido.carreras_local === null || partido.carreras_visitante === null) return 'Pendiente';
    const carrerasEquipo = esLocal ? partido.carreras_local : partido.carreras_visitante;
    const carrerasRival = esLocal ? partido.carreras_visitante : partido.carreras_local;
    const resultado = carrerasEquipo > carrerasRival ? 'G' : 'P';
    return `${resultado} ${carrerasEquipo}-${carrerasRival}`;
}

function verJugador(jugadorId) {
    const jugador = rosterData.find(j => j.id === jugadorId);
    if (!jugador) {
        alert('Información del jugador no disponible');
        return;
    }
    
    const nombreAmigable = jugador.nombre
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    
    window.location.href = `jugador.html?id=${jugadorId}&nombre=${nombreAmigable}&equipo=${currentTeamId}`;
}

function mostrarErrorEquipo(mensaje) {
    const mainCard = document.querySelector('.team-main-card');
    if (!mainCard) return;
    mainCard.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
            <h2 style="color: #f44336; margin-bottom: 20px;">⚠️ Error</h2>
            <p style="color: #fff; margin-bottom: 20px;">${mensaje}</p>
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button onclick="location.reload()" class="btn-primary">🔄 Reintentar</button>
                <a href="index.html" class="btn-secondary">🏠 Volver al Inicio</a>
            </div>
        </div>
    `;
    document.querySelector('.content-grid').style.display = 'none';
    document.querySelector('.recent-games').style.display = 'none';
}

console.log('✅ equipo-detalle.js cargado correctamente');
