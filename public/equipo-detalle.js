// EQUIPO-DETALLE.JS - ACTUALIZADO HASTA PASO 15.5

// ConfiguraciÃ³n de API
const API_BASE_URL = 'https://chogui-league-system-production.up.railway.app';

// Variables globales
let currentTeamId = null;
let teamData = null;
let rosterData = [];
let recentGames = [];
let filteredRoster = [];
let currentFilter = 'all';

// Obtener ID del equipo desde URL
function getTeamIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

// FunciÃ³n helper para construir URLs de API
function getApiUrl(endpoint) {
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }
    return `${API_BASE_URL}${endpoint}`;
}

// Obtener logo del equipo (ACTUALIZADO)
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
    'caribes rd': 'caribes-rd.png'
  };
  
  const nombreNormalizado = equipoNombre.toLowerCase().trim();
  const logoFile = logoMap[nombreNormalizado];
  
  if (logoFile) {
    return `/public/images/logos/${logoFile}`;
  }
  
  // Fallback: generar nombre de archivo automÃ¡ticamente
  const nombreArchivo = nombreNormalizado
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '') + '.png';
  
  return `/public/images/logos/${nombreArchivo}`;
}

// âœ… INICIO DE LA CORRECCIÃ“N: FunciÃ³n de manejo de logos con fallback a iniciales
function mostrarLogoEquipo(logoUrl, equipoNombre) {
    const logoContainer = document.querySelector('.team-logo');
    if (!logoContainer) return;

    const img = new Image();

    img.onload = function() {
        logoContainer.style.backgroundImage = `url('${logoUrl}')`;
        logoContainer.style.backgroundSize = 'contain';
        logoContainer.style.backgroundRepeat = 'no-repeat';
        logoContainer.style.backgroundPosition = 'center';
        logoContainer.innerHTML = ''; // Limpiar iniciales si el logo carga correctamente
    };

    img.onerror = function() {
        console.warn(`Logo no encontrado para ${equipoNombre}, usando iniciales`);
        
        // Generar iniciales
        const iniciales = generarIniciales(equipoNombre);

        // Mostrar iniciales en lugar de logo
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
            ">
                ${iniciales}
            </div>
        `;
    };

    img.src = logoUrl;
}

// âœ… FunciÃ³n auxiliar para generar iniciales
function generarIniciales(nombreEquipo) {
    if (!nombreEquipo) return '?';
    
    const palabras = nombreEquipo.trim().split(/\s+/);
    
    if (palabras.length === 1) {
        // Una palabra: primeras 2 letras
        return palabras[0].substring(0, 2).toUpperCase();
    } else {
        // MÃºltiples palabras: primera letra de cada palabra (mÃ¡ximo 3)
        return palabras
            .slice(0, 3)
            .map(p => p.charAt(0).toUpperCase())
            .join('');
    }
}
// âœ… FIN DE LA CORRECCIÃ“N

// InicializaciÃ³n mejorada
document.addEventListener('DOMContentLoaded', function() {
    currentTeamId = getTeamIdFromUrl();
    
    if (!currentTeamId) {
        mostrarErrorEquipo('No se especificÃ³ un equipo vÃ¡lido. Verifica la URL.');
        return;
    }
    
    if (isNaN(currentTeamId)) {
        mostrarErrorEquipo('ID de equipo invÃ¡lido. Debe ser un nÃºmero.');
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
        console.error('Error cargando informaciÃ³n del equipo:', error);
        mostrarErrorEquipo(error.message);
        throw error;
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
        // CorrecciÃ³n: La API devuelve un objeto con la propiedad 'jugadores'
        rosterData = Array.isArray(data.jugadores) ? data.jugadores : [];
        filteredRoster = [...rosterData];
        renderizarRoster();
        
    } catch (error) {
        console.error('Error cargando roster:', error);
        container.innerHTML = `
            <div class="empty-state">
                <h4>âš ï¸ Error cargando roster</h4>
                <p>No se pudo cargar la informaciÃ³n de los jugadores.<br>
                <button onclick="cargarRosterEquipo()" class="btn-secondary" style="margin-top: 10px;">ðŸ”„ Reintentar</button></p>
            </div>`;
    }
}

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
        console.error('Error cargando partidos recientes:', error);
        container.innerHTML = `
            <div class="empty-state">
                <h4>âš ï¸ Error cargando partidos</h4>
                <p>No se pudo cargar el historial de partidos.<br>
                <button onclick="cargarPartidosRecientes()" class="btn-secondary" style="margin-top: 10px;">ðŸ”„ Reintentar</button></p>
            </div>`;
    }
}

function mostrarErrorEquipo(mensaje) {
    const mainCard = document.querySelector('.team-main-card');
    if (!mainCard) return;
    mainCard.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
            <h2 style="color: #dc143c; margin-bottom: 20px;">âš ï¸ Error</h2>
            <p style="color: #fff; margin-bottom: 20px;">${mensaje}</p>
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button onclick="location.reload()" class="btn-primary">ðŸ”„ Reintentar</button>
                <a href="index.html" class="btn-secondary">ðŸ  Volver al Inicio</a>
            </div>
        </div>
    `;
    document.querySelector('.content-grid').style.display = 'none';
    document.querySelector('.recent-games').style.display = 'none';
}

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
            breadcrumb.innerHTML = `<strong style="color: #ffd700;">${teamData.nombre}</strong>`;
        }
    }
    actualizarURLAmigable();
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.content = `InformaciÃ³n completa de ${teamData.nombre} - Roster, estadÃ­sticas y partidos en Chogui League`;
    }
    
    // LÃ³gica de carga de logo actualizada
    const logoUrl = getTeamLogo(teamData.nombre);
    mostrarLogoEquipo(logoUrl, teamData.nombre);
    
    document.getElementById('teamName').textContent = teamData.nombre;
    document.getElementById('teamLocation').textContent = teamData.ciudad || 'UbicaciÃ³n no especificada';
    document.getElementById('teamManager').textContent = teamData.manager || 'Manager no asignado';
    
    if (teamData.fecha_creacion) {
        const fecha = new Date(teamData.fecha_creacion);
        const aÃ±o = fecha.getFullYear();
        document.getElementById('teamFounded').textContent = isNaN(aÃ±o) ? 'Fecha no disponible' : aÃ±o;
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
        const claseDestacado = esDestacado ? ' style="background: rgba(255, 215, 0, 0.3); border: 2px solid #ffd700; animation: highlight 2s ease-in-out;"' : '';
        
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
            const jugadorElement = container.querySelector('[style*="rgba(255, 215, 0, 0.3)"]');
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
        return `
            <div class="game-item">
                <div class="game-teams">vs ${equipoRival}</div>
                <div class="game-score">${resultado}</div>
                <div class="game-date">${formatearFecha(partido.fecha_partido)}</div>
            </div>
        `;
    }).join('');
}

function calcularEstadisticas() {
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
    const posiciones = { 'P': 'Pitcher', 'C': 'Catcher', '1B': 'Primera Base', '2B': 'Segunda Base', '3B': 'Tercera Base', 'SS': 'Shortstop', 'LF': 'Left Field', 'CF': 'Center Field', 'RF': 'Right Field' };
    return posiciones[posicion] || posicion || 'N/A';
}

function formatearFecha(fechaString) {
    if (!fechaString) return 'Fecha no disp.';
    // La fecha de la DB viene sin hora, asÃ­ que la tratamos como UTC para evitar problemas de zona horaria
    const date = new Date(fechaString + 'T00:00:00Z');
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function obtenerResultadoPartido(partido, esLocal) {
    if (partido.carreras_local === null || partido.carreras_visitante === null) return 'Pendiente';
    const carrerasEquipo = esLocal ? partido.carreras_local : partido.carreras_visitante;
    const carrerasRival = esLocal ? partido.carreras_visitante : partido.carreras_local;
    const resultado = carrerasEquipo > carrerasRival ? 'G' : 'P';
    return `${resultado} ${carrerasEquipo}-${carrerasRival}`;
}

// ACTUALIZADO PARA NAVEGAR A JUGADOR.HTML
function verJugador(jugadorId) {
    const jugador = rosterData.find(j => j.id === jugadorId);
    if (!jugador) {
        alert('InformaciÃ³n del jugador no disponible');
        return;
    }
    
    const nombreAmigable = jugador.nombre
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    
    window.location.href = `jugador.html?id=${jugadorId}&nombre=${nombreAmigable}&equipo=${currentTeamId}`;
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
