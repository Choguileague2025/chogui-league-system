// EQUIPO-DETALLE.JS - VERSIÓN FINAL CORREGIDA

// Configuración de API
const API_BASE_URL = '';

// Variables globales
let currentTeamId = null;
let teamData = null;
let rosterData = [];
let recentGames = [];
let filteredRoster = [];
let currentFilter = 'all';

// ===================================
// FUNCIONES DE INICIALIZACIÓN
// ===================================

/**
 * Obtener ID del equipo desde URL
 */
function getTeamIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

/**
 * Función helper para construir URLs de API
 */
function getApiUrl(endpoint) {
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }
    return `${API_BASE_URL}${endpoint}`;
}

// ===================================
// CORRECCIÓN BUG-003: LOGO CON FALLBACK
// ===================================

/**
 * Obtener logo del equipo
 */
function getTeamLogo(equipoNombre) {
    if (!equipoNombre) return '/public/images/logos/default-logo.png';
    
    // Mapeo de nombres de equipos a archivos de logos
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
        'dragones fc': 'dragones-fc.png'
    };
    
    const nombreNormalizado = equipoNombre.toLowerCase().trim();
    const logoFile = logoMap[nombreNormalizado];
    
    if (logoFile) {
        return `/public/images/logos/${logoFile}`;
    }
    
    // Fallback: generar nombre de archivo automáticamente
    const nombreArchivo = nombreNormalizado
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') + '.png';
    
    return `/public/images/logos/${nombreArchivo}`;
}

/**
 * ✅ CORRECCIÓN: Mostrar logo del equipo con fallback a iniciales
 */
function mostrarLogoEquipo(logoUrl, equipoNombre) {
    const logoContainer = document.querySelector('.team-logo');
    if (!logoContainer) {
        console.warn('⚠️ Contenedor de logo no encontrado');
        return;
    }

    const img = new Image();

    img.onload = function() {
        // ✅ Logo cargado exitosamente
        logoContainer.style.backgroundImage = `url('${logoUrl}')`;
        logoContainer.style.backgroundSize = 'contain';
        logoContainer.style.backgroundRepeat = 'no-repeat';
        logoContainer.style.backgroundPosition = 'center';
        logoContainer.innerHTML = '';
        console.log(`✅ Logo cargado: ${equipoNombre}`);
    };

    img.onerror = function() {
        // ❌ Logo no encontrado, usar iniciales
        console.warn(`⚠️ Logo no encontrado para "${equipoNombre}", usando iniciales`);
        
        const iniciales = generarIniciales(equipoNombre);

        // Mostrar iniciales estilizadas
        logoContainer.style.backgroundImage = 'none';
        logoContainer.innerHTML = `
            <div style="
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(145deg, #ffd700, #ff8c00);
                border-radius: 50%;
                font-size: 2.5rem;
                font-weight: bold;
                color: #1a1a2e;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                border: 3px solid rgba(255, 215, 0, 0.5);
            ">
                ${iniciales}
            </div>
        `;
    };

    img.src = logoUrl;
}

/**
 * ✅ Función auxiliar para generar iniciales
 */
function generarIniciales(nombreEquipo) {
    if (!nombreEquipo) return '?';
    
    const palabras = nombreEquipo.trim().split(/\s+/);
    
    if (palabras.length === 1) {
        // Una palabra: primeras 2 letras
        return palabras[0].substring(0, 2).toUpperCase();
    } else if (palabras.length === 2) {
        // Dos palabras: primera letra de cada una
        return (palabras[0][0] + palabras[1][0]).toUpperCase();
    } else {
        // Tres o más palabras: primera letra de las primeras 3
        return palabras
            .slice(0, 3)
            .map(p => p.charAt(0).toUpperCase())
            .join('');
    }
}

// ===================================
// CORRECCIÓN BUG-004: MANEJO DE FECHAS
// ===================================

/**
 * ✅ CORRECCIÓN: Formatea fecha con manejo robusto de casos inválidos
 */
function formatearFecha(fechaString) {
    if (!fechaString || fechaString === 'Invalid Date' || fechaString === '') {
        return 'Fecha no disponible';
    }
    
    try {
        // La fecha de la BD viene sin hora, la tratamos como UTC
        const date = new Date(fechaString + 'T00:00:00Z');
        
        // Verificar si la fecha es válida
        if (isNaN(date.getTime())) {
            console.warn(`⚠️ Fecha inválida: ${fechaString}`);
            return 'Fecha inválida';
        }
        
        return date.toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric', 
            timeZone: 'UTC' 
        });
    } catch (error) {
        console.error('❌ Error formateando fecha:', error);
        return 'Error en fecha';
    }
}

/**
 * ✅ CORRECCIÓN: Formatea año de fundación con validación
 */
function formatearAnioFundacion(fechaString) {
    if (!fechaString) {
        return 'No especificado';
    }
    
    try {
        const fecha = new Date(fechaString);
        const anio = fecha.getFullYear();
        
        // Validar que el año sea razonable
        const anioActual = new Date().getFullYear();
        if (isNaN(anio) || anio < 1900 || anio > anioActual + 1) {
            console.warn(`⚠️ Año inválido: ${anio}`);
            return 'Año inválido';
        }
        
        return anio.toString();
    } catch (error) {
        console.error('❌ Error formateando año:', error);
        return 'Error en fecha';
    }
}

// ===================================
// INICIALIZACIÓN DEL DOM
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    currentTeamId = getTeamIdFromUrl();
    
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

/**
 * Configurar event listeners
 */
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

/**
 * Precargar datos críticos
 */
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

/**
 * Cargar todos los datos del equipo
 */
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
        console.error('❌ Error cargando datos del equipo:', error);
    }
}

/**
 * Cargar información básica del equipo
 */
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
        console.error('❌ Error cargando información del equipo:', error);
        mostrarErrorEquipo(error.message);
        throw error;
    }
}

/**
 * Cargar roster del equipo
 */
async function cargarRosterEquipo() {
    const container = document.getElementById('rosterContainer');
    try {
        const response = await fetch(getApiUrl(`/api/jugadores?equipo_id=${currentTeamId}`));
        
        if (!response.ok) {
            throw new Error(`Error cargando roster: ${response.status}`);
        }
        
        const data = await response.json();
        
        // La API puede devolver objeto con 'jugadores' o array directo
        rosterData = Array.isArray(data.jugadores) ? data.jugadores : 
                     Array.isArray(data) ? data : [];
        
        filteredRoster = [...rosterData];
        renderizarRoster();
        
    } catch (error) {
        console.error('❌ Error cargando roster:', error);
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <h4>⚠️ Error cargando roster</h4>
                    <p>No se pudo cargar la información de los jugadores.<br>
                    <button onclick="cargarRosterEquipo()" class="btn-secondary" style="margin-top: 10px;">🔄 Reintentar</button></p>
                </div>`;
        }
    }
}

/**
 * Cargar partidos recientes
 */
async function cargarPartidosRecientes() {
    const container = document.getElementById('recentGamesContainer');
    try {
        const response = await fetch(getApiUrl(`/api/partidos?equipo_id=${currentTeamId}&limit=10`));
        
        if (!response.ok) {
            throw new Error(`Error cargando partidos: ${response.status}`);
        }
        
        const data = await response.json();
        recentGames = data.partidos || [];
        
        renderizarPartidosRecientes();
        
    } catch (error) {
        console.error('❌ Error cargando partidos recientes:', error);
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <h4>⚠️ Error cargando partidos</h4>
                    <p>No se pudo cargar el historial de partidos.<br>
                    <button onclick="cargarPartidosRecientes()" class="btn-secondary" style="margin-top: 10px;">🔄 Reintentar</button></p>
                </div>`;
        }
    }
}

// ===================================
// RENDERIZADO
// ===================================

/**
 * Renderizar información básica del equipo
 */
function renderizarInformacionEquipo() {
    if (!teamData) return;
    
    document.title = `${teamData.nombre} - Chogui League System`;

    // Actualizar URL amigable
    function actualizarURLAmigable() {
        if (!teamData || !teamData.nombre) return;
        
        const nombreAmigable = teamData.nombre
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
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
            breadcrumb.innerHTML = `<strong style="color: #ffd700;">${teamData.nombre}</strong>`;
        }
    }
    actualizarURLAmigable();
    
    // Meta descripción
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.content = `Información completa de ${teamData.nombre} - Roster, estadísticas y partidos`;
    }
    
    // ✅ Cargar logo con fallback
    const logoUrl = getTeamLogo(teamData.nombre);
    mostrarLogoEquipo(logoUrl, teamData.nombre);
    
    // Información del equipo
    document.getElementById('teamName').textContent = teamData.nombre;
    document.getElementById('teamLocation').textContent = teamData.ciudad || 'Ubicación no especificada';
    document.getElementById('teamManager').textContent = teamData.manager || 'Manager no asignado';
    
    // ✅ Año de fundación con manejo robusto
    const anioFundacion = formatearAnioFundacion(teamData.fecha_creacion);
    document.getElementById('teamFounded').textContent = anioFundacion;
}

/**
 * Renderizar roster del equipo
 */
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
        const esDestacado = jugadorDestacado && 
            jugador.nombre.toLowerCase().includes(jugadorDestacado.toLowerCase());
        const claseDestacado = esDestacado ? 
            ' style="background: rgba(255, 215, 0, 0.3); border: 2px solid #ffd700; animation: highlight 2s ease-in-out;"' : '';
        
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
    
    // Scroll al jugador destacado
    if (jugadorDestacado) {
        setTimeout(() => {
            const jugadorElement = container.querySelector('[style*="rgba(255, 215, 0, 0.3)"]');
            if (jugadorElement) {
                jugadorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 500);
    }
}

/**
 * Renderizar partidos recientes
 */
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
        
        // ✅ Usar función con manejo de fechas inválidas
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

/**
 * Calcular estadísticas del equipo
 */
function calcularEstadisticas() {
    let victorias = 0, derrotas = 0, carrerasAnotadas = 0, carrerasPermitidas = 0;
    
    const partidosFinalizados = recentGames.filter(partido => 
        partido.carreras_local !== null && partido.carreras_visitante !== null
    );
    
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
    
    // Actualizar elementos
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

/**
 * Actualizar breadcrumb con posición
 */
async function actualizarBreadcrumbConPosicion() {
    try {
        const response = await fetch(getApiUrl('/api/posiciones'));
        if (!response.ok) return;
        
        const standings = await response.json();
        const posicion = standings.findIndex(e => e.id == currentTeamId) + 1;
        
        if (posicion > 0) {
            document.getElementById('teamPosition').textContent = `#${posicion}`;
        }
    } catch (error) {
        console.warn('No se pudo obtener la posición en la tabla');
    }
}

// ===================================
// FUNCIONES AUXILIARES
// ===================================

/**
 * Filtrar roster por posición
 */
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

/**
 * Formatear nombre de posición
 */
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
        'UTILITY': 'Utility'
    };
    return posiciones[posicion] || posicion || 'N/A';
}

/**
 * Obtener resultado de partido
 */
function obtenerResultadoPartido(partido, esLocal) {
    if (partido.carreras_local === null || partido.carreras_visitante === null) {
        return 'Pendiente';
    }
    
    const carrerasEquipo = esLocal ? partido.carreras_local : partido.carreras_visitante;
    const carrerasRival = esLocal ? partido.carreras_visitante : partido.carreras_local;
    const resultado = carrerasEquipo > carrerasRival ? 'G' : 'P';
    
    return `${resultado} ${carrerasEquipo}-${carrerasRival}`;
}

/**
 * Navegar a página del jugador
 */
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

/**
 * Mostrar mensaje de error
 */
function mostrarErrorEquipo(mensaje) {
    const mainCard = document.querySelector('.team-main-card');
    if (!mainCard) return;
    
    mainCard.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
            <h2 style="color: #dc143c; margin-bottom: 20px;">⚠️ Error</h2>
            <p style="color: #fff; margin-bottom: 20px;">${mensaje}</p>
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button onclick="location.reload()" class="btn-primary">🔄 Reintentar</button>
                <a href="index.html" class="btn-secondary">🏠 Volver al Inicio</a>
            </div>
        </div>
    `;
    
    const contentGrid = document.querySelector('.content-grid');
    const recentGamesSection = document.querySelector('.recent-games');
    if (contentGrid) contentGrid.style.display = 'none';
    if (recentGamesSection) recentGamesSection.style.display = 'none';
}
