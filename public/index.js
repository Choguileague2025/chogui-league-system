// =================================================================================
// INICIALIZACIÓN Y CONFIGURACIÓN GLOBAL
// =================================================================================

// Variables globales para almacenar datos cacheados
let leadersData = { bateo: [], pitcheo: [], defensiva: [] };
let currentLeaderCategory = 'bateo';

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Chogui League System Inicializado');
    
    // Configurar manejadores de eventos principales
    setupEventListeners();
    
    // Cargar todos los datos necesarios para la vista inicial
    loadInitialData();
});

function setupEventListeners() {
    // Navegación principal por pestañas
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            mostrarPestana(tab.dataset.section);
            window.history.pushState(null, '', `#${tab.dataset.section}`);
        });
    });

    // Filtros de la sección de líderes
    document.querySelectorAll('.leader-filter').forEach(btn => {
        btn.addEventListener('click', () => renderizarLideresPorCategoria(btn.dataset.category));
    });

    // Toggle de la vista de Playoffs
    initPlayoffsToggle();
    
    // Buscador principal
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }
}

async function loadInitialData() {
    // Cargar datos en paralelo para mejorar la velocidad
    await Promise.all([
        cargarProximosPartidos(),
        cargarTablaPosiciones(),
        cargarUltimosPartidos(),
        cargarLideres(),
        cargarPlayoffsClasificacion(),
        cargarEstadisticasCompletas() // Carga las tablas completas
    ]);

    // Navegar a la sección correcta según el hash en la URL
    const initialSection = window.location.hash.replace('#', '') || 'posiciones';
    mostrarPestana(initialSection);
}


// =================================================================================
// NAVEGACIÓN Y VISIBILIDAD DE SECCIONES
// =================================================================================

function mostrarPestana(sectionId) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    const activeContent = document.getElementById(sectionId);
    const activeTab = document.querySelector(`.nav-tab[data-section="${sectionId}"]`);

    if (activeContent) activeContent.classList.add('active');
    if (activeTab) activeTab.classList.add('active');
}

function toggleMobileMenu() {
    document.body.classList.toggle('mobile-menu-open');
}

function closeMobileMenu() {
    document.body.classList.remove('mobile-menu-open');
}


// =================================================================================
// FUNCIONES DE CARGA Y RENDERIZADO DE DATOS
// =================================================================================

async function fetchJSON(url, options = {}) {
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' }, ...options });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP error! status: ${res.status} ${res.statusText}${text ? ` :: ${text}` : ''}`);
        }
        return await res.json();
    } catch (err) {
        console.error(`❌ fetchJSON error [${url}]:`, err.message);
        throw err;
    }
}

function setLoading(containerId, isLoading, emptyMessage = null) {
    const root = document.getElementById(containerId);
    if (!root) return;
    const loader = root.querySelector('[data-loader]');
    const empty = root.querySelector('[data-empty]');
    
    if (loader) loader.style.display = isLoading ? 'flex' : 'none';
    
    if (empty) {
        empty.innerHTML = emptyMessage ? `<div class="empty-state">${emptyMessage}</div>` : '';
        empty.style.display = (!isLoading && emptyMessage) ? 'block' : 'none';
    }
}

// --- Próximos Partidos ---
async function cargarProximosPartidos() {
    const container = document.getElementById('proximosPartidosContainer');
    try {
        container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Cargando próximos partidos...</p></div>';
        const data = await fetchJSON('/api/partidos?estado=programado&limit=4');
        const partidos = data.partidos || [];
        if (partidos.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay partidos programados próximamente.</div>';
        } else {
            renderProximosPartidos(partidos, container);
        }
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Error al cargar los próximos partidos.</div>';
    }
}

function renderProximosPartidos(partidos, container) {
    const formatOptions = { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' };
    container.innerHTML = partidos.map(p => {
        const fecha = new Date(p.fecha_partido);
        const fechaFormateada = fecha.toLocaleDateString('es-ES', formatOptions);
        const hora = p.hora ? p.hora.substring(0, 5) : 'Hora a conf.';
        const logoLocal = getTeamLogo(p.equipo_local_nombre);
        const logoVisitante = getTeamLogo(p.equipo_visitante_nombre);

        return `
            <div class="partido-card">
                <div class="partido-header">
                    <span class="partido-fecha">${fechaFormateada} - ${hora} hs</span>
                </div>
                <div class="partido-body">
                    <div class="equipo-info">
                        <div class="equipo-logo" style="background-image: url('${logoLocal}')"></div>
                        <span class="equipo-nombre">${p.equipo_local_nombre}</span>
                    </div>
                    <div class="partido-vs">VS</div>
                    <div class="equipo-info">
                        <div class="equipo-logo" style="background-image: url('${logoVisitante}')"></div>
                        <span class="equipo-nombre">${p.equipo_visitante_nombre}</span>
                    </div>
                </div>
                ${p.lugar ? `<div class="partido-footer">🏟️ ${p.lugar}</div>` : ''}
            </div>
        `;
    }).join('');
}

// --- Tabla de Posiciones ---
async function cargarTablaPosiciones() {
    const tbodyEl = document.getElementById('tablaPosicionesBody');
    try {
        setLoading('tablaPosiciones', true);
        const standings = await fetchJSON('/api/standings');
        renderTablaPosiciones(standings || [], tbodyEl);
        setLoading('tablaPosiciones', false, (standings && standings.length) ? null : 'Sin datos de posiciones.');
    } catch (e) {
        setLoading('tablaPosiciones', false, 'No se pudo cargar la tabla.');
    }
}

function renderTablaPosiciones(standings, tbodyEl) {
    if (!tbodyEl) return;
    tbodyEl.innerHTML = [...standings]
        .sort((a, b) => (b.porcentaje ?? 0) - (a.porcentaje ?? 0))
        .map((t, i) => `
            <tr data-equipo-id="${t.equipo_id}" onclick="window.location.href='equipo.html?id=${t.equipo_id}'">
                <td><span class="position-number">${i + 1}</span></td>
                <td><strong>${t.equipo_nombre ?? ''}</strong></td>
                <td>${t.pj ?? 0}</td>
                <td style="color: #4CAF50;">${t.pg ?? 0}</td>
                <td style="color: #dc143c;">${t.pp ?? 0}</td>
                <td><strong>${(t.porcentaje != null) ? Number(t.porcentaje).toFixed(3) : '.000'}</strong></td>
                <td>${t.cf ?? 0}</td>
                <td>${t.ce ?? 0}</td>
                <td style="color: ${t.dif >= 0 ? '#4CAF50' : '#dc143c'};">${t.dif >= 0 ? '+' : ''}${t.dif ?? 0}</td>
                <td><span class="status-indicator">${t.racha || '-'}</span></td>
            </tr>`
        ).join('');
}

// --- Últimos Partidos ---
async function cargarUltimosPartidos() {
    const tbody = document.getElementById('ultimosPartidosBody');
    try {
        setLoading('ultimosPartidos', true);
        const partidos = await fetchJSON('/api/partidos?estado=finalizado&limit=10');
        renderUltimosPartidos(partidos ? partidos.partidos : [], tbody);
        setLoading('ultimosPartidos', false, (partidos && partidos.partidos && partidos.partidos.length) ? null : 'Sin partidos finalizados.');
    } catch (e) {
        setLoading('ultimosPartidos', false, 'No se pudieron cargar los partidos.');
    }
}

function renderUltimosPartidos(partidos, tbody) {
    if (!tbody) return;
    const fmtFecha = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    tbody.innerHTML = (partidos || []).map(p => `
        <tr>
            <td>${p.equipo_local_nombre ?? ''}</td>
            <td>${p.equipo_visitante_nombre ?? ''}</td>
            <td><strong>${p.carreras_local ?? 0} – ${p.carreras_visitante ?? 0}</strong></td>
            <td>${p.innings ?? '-'}</td>
            <td>${fmtFecha(p.fecha_partido)}</td>
        </tr>`).join('');
}


// --- Líderes de la Liga ---
async function cargarLideres() {
    try {
        const [bateadores, pitchers, defensivos] = await Promise.all([
             fetchJSON('/api/leaders?tipo=bateo&limit=10'),
             fetchJSON('/api/leaders?tipo=pitcheo&limit=10'),
             fetchJSON('/api/leaders?tipo=defensiva&limit=10')
        ]);
        leadersData = {
            bateo: bateadores || [],
            pitcheo: pitchers || [],
            defensiva: defensivos || []
        };
        renderizarLideresPorCategoria(currentLeaderCategory);
    } catch (error) {
        console.error('❌ Error cargando líderes:', error);
        const container = document.getElementById('lideresGrid');
        if (container) container.innerHTML = `<div class="empty-state"><h3>Error al cargar</h3><p>No se pudieron obtener los datos de líderes.</p></div>`;
    }
}

function renderizarLideresPorCategoria(categoria) {
    currentLeaderCategory = categoria;
    document.querySelectorAll('.leader-filter').forEach(btn => btn.classList.toggle('active', btn.dataset.category === categoria));

    const lideresGrid = document.getElementById('lideresGrid');
    const positionsContainer = document.getElementById('positionsContainer');
    const searchContainer = document.getElementById('searchContainerTodos');

    if (categoria === 'todos') {
        lideresGrid.style.display = 'none';
        positionsContainer.style.display = 'block';
        searchContainer.style.display = 'block';
        renderizarTodosPorPosicion();
        initBuscadorJugadores();
    } else {
        lideresGrid.style.display = 'grid';
        positionsContainer.style.display = 'none';
        searchContainer.style.display = 'none';
        
        const datos = leadersData[categoria] || [];
        if (datos.length === 0) {
            lideresGrid.innerHTML = `<div class="empty-state"><h3>Sin datos</h3><p>No hay líderes para la categoría de ${categoria}.</p></div>`;
            return;
        }
        lideresGrid.innerHTML = datos.map((lider, index) => generarCardLider(lider, index, categoria)).join('');
    }
}

function generarCardLider(lider, index, categoria) {
    const nombreJugador = lider.nombre_jugador || 'N/A';
    const nombreEquipo = lider.equipo_nombre || 'N/A';
    const posicion = lider.posicion || 'UTIL';
    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    let statsHTML = '';

    if (categoria === 'bateo') {
        statsHTML = `<div class="stat"><span class="stat-value">${(lider.promedio_bateo || 0).toFixed(3)}</span><span class="stat-label">AVG</span></div>
                     <div class="stat"><span class="stat-value">${lider.home_runs || 0}</span><span class="stat-label">HR</span></div>
                     <div class="stat"><span class="stat-value">${lider.rbi || 0}</span><span class="stat-label">RBI</span></div>
                     <div class="stat"><span class="stat-value">${(lider.ops || 0).toFixed(3)}</span><span class="stat-label">OPS</span></div>`;
    } else if (categoria === 'pitcheo') {
        statsHTML = `<div class="stat"><span class="stat-value">${(lider.era || 0).toFixed(2)}</span><span class="stat-label">ERA</span></div>
                     <div class="stat"><span class="stat-value">${lider.strikeouts || 0}</span><span class="stat-label">SO</span></div>
                     <div class="stat"><span class="stat-value">${(lider.whip || 0).toFixed(2)}</span><span class="stat-label">WHIP</span></div>
                     <div class="stat"><span class="stat-value">${lider.wins || 0}</span><span class="stat-label">W</span></div>`;
    } else { // defensiva
        statsHTML = `<div class="stat"><span class="stat-value">${(lider.fielding_percentage || 0).toFixed(3)}</span><span class="stat-label">FLD%</span></div>
                     <div class="stat"><span class="stat-value">${lider.putouts || 0}</span><span class="stat-label">PO</span></div>
                     <div class="stat"><span class="stat-value">${lider.assists || 0}</span><span class="stat-label">A</span></div>
                     <div class="stat"><span class="stat-value">${lider.errors || 0}</span><span class="stat-label">E</span></div>`;
    }

    return `
        <div class="leader-card" onclick="window.location.href='jugador.html?id=${lider.jugador_id}'">
            <div class="leader-rank" style="background: ${rankColors[index] || '#4A90E2'};">${index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`}</div>
            <div class="leader-info">
                <h3>${nombreJugador}</h3>
                <p class="team-name">${nombreEquipo}</p>
                <p class="player-position">${posicion}</p>
                <div class="leader-stats">${statsHTML}</div>
            </div>
        </div>`;
}

// --- Estadísticas por Posición (Vista "Todos") ---
const POSICIONES_BEISBOL = [
    { codigo: 'P', nombre: 'Pitcher', icono: '🎯' },
    { codigo: 'C', nombre: 'Catcher', icono: '⚾' },
    { codigo: '1B', nombre: 'Primera Base', icono: '🥇' },
    { codigo: '2B', nombre: 'Segunda Base', icono: '🥈' },
    { codigo: '3B', nombre: 'Tercera Base', icono: '🥉' },
    { codigo: 'SS', nombre: 'Shortstop', icono: '💎' },
    { codigo: 'LF', nombre: 'Left Field', icono: '🦅' },
    { codigo: 'CF', nombre: 'Center Field', icono: '🦅' },
    { codigo: 'RF', nombre: 'Right Field', icono: '🦅' }
];

function renderizarTodosPorPosicion() {
    const container = document.getElementById('positionsContainer');
    if (!container) return;
    
    // Unificar todos los jugadores en un solo mapa para evitar duplicados
    const todosJugadoresMap = new Map();
    [...leadersData.bateo, ...leadersData.pitcheo, ...leadersData.defensiva].forEach(j => {
        if (!todosJugadoresMap.has(j.jugador_id)) {
            todosJugadoresMap.set(j.jugador_id, j);
        } else {
            // Fusionar estadísticas si un jugador aparece en múltiples listas
            const existing = todosJugadoresMap.get(j.jugador_id);
            todosJugadoresMap.set(j.jugador_id, { ...existing, ...j });
        }
    });

    const todosJugadores = Array.from(todosJugadoresMap.values());
    
    container.innerHTML = POSICIONES_BEISBOL.map(pos => {
        let jugadoresPosicion = todosJugadores.filter(j => (j.posicion || j.posicion_principal) === pos.codigo);

        if (pos.codigo === 'P') {
            jugadoresPosicion.sort((a, b) => (a.era || 99) - (b.era || 99));
        } else {
            jugadoresPosicion.sort((a, b) => (b.ops || 0) - (a.ops || 0));
        }
        
        const top5 = jugadoresPosicion.slice(0, 5);
        
        return `
            <div class="position-section" data-position="${pos.codigo}">
                <h3 class="position-title">
                    <span class="position-icon">${pos.icono}</span>
                    <span>${pos.nombre} (${pos.codigo}) - Top 5</span>
                </h3>
                <div class="position-cards">
                    ${top5.length > 0 ? top5.map((jugador, index) => generarCardJugador(jugador, index, pos.codigo)).join('') : '<div class="empty-position">Sin jugadores destacados en esta posición.</div>'}
                </div>
            </div>`;
    }).join('');
}

function generarCardJugador(jugador, index, posicion) {
    const nombreJugador = jugador.nombre_jugador || 'N/A';
    const nombreEquipo = jugador.equipo_nombre || 'N/A';
    const logoEquipo = getTeamLogo(nombreEquipo); // Utiliza la función centralizada
    let statsHTML = '';

    if (posicion === 'P') {
        statsHTML = `<div class="stat"><span class="stat-value">${(jugador.era || 0).toFixed(2)}</span><span class="stat-label">ERA</span></div>
                     <div class="stat"><span class="stat-value">${jugador.strikeouts || 0}</span><span class="stat-label">SO</span></div>`;
    } else {
        statsHTML = `<div class="stat"><span class="stat-value">${(jugador.promedio_bateo || 0).toFixed(3)}</span><span class="stat-label">AVG</span></div>
                     <div class="stat"><span class="stat-value">${(jugador.ops || 0).toFixed(3)}</span><span class="stat-label">OPS</span></div>`;
    }

    return `
        <div class="player-card-small" data-player-name="${nombreJugador.toLowerCase()}" onclick="window.location.href='jugador.html?id=${jugador.jugador_id}'">
            <div class="player-small-rank">${index + 1}</div>
            <div class="team-logo-small" style="background-image: url('${logoEquipo}')"></div>
            <div class="player-small-info">
                <div class="player-small-name">${nombreJugador}</div>
                <div class="player-small-team">${nombreEquipo}</div>
            </div>
            <div class="player-small-stats">${statsHTML}</div>
        </div>`;
}

// --- Estadísticas Completas (Tablas) ---
async function cargarEstadisticasCompletas() {
    try {
        const stats = await fetchJSON('/api/estadisticas-ofensivas');
        const tbody = document.querySelector('#statsTable tbody');
        if (!tbody) return;

        if (!stats || stats.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No hay estadísticas disponibles.</td></tr>';
            return;
        }

        tbody.innerHTML = stats
            .sort((a,b) => (b.ops || 0) - (a.ops || 0))
            .map(s => {
                const avg = (s.promedio_bateo || 0).toFixed(3);
                const obp = (s.obp || 0).toFixed(3);
                const ops = (s.ops || 0).toFixed(3);
                const war = (s.war || 0).toFixed(2);
                return `
                    <tr onclick="window.location.href='jugador.html?id=${s.jugador_id}'">
                        <td><strong>${s.jugador_nombre}</strong></td>
                        <td>${s.equipo_nombre}</td>
                        <td>${s.posicion || 'N/A'}</td>
                        <td>${s.at_bats || 0}</td>
                        <td>${s.hits || 0}</td>
                        <td style="color: #ffd700;">${avg}</td>
                        <td>${obp}</td>
                        <td style="color: #ff8c00;">${ops}</td>
                        <td>${s.home_runs || 0}</td>
                        <td>${s.rbi || 0}</td>
                        <td style="color: #4CAF50;">${war}</td>
                    </tr>
                `;
            }).join('');

        const grid = document.getElementById('positionLeadersGrid');
        if(grid) {
            const defensivas = await fetchJSON('/api/estadisticas-defensivas');
            renderizarLideresDefensivos(defensivas, grid);
        }

    } catch (e) {
        console.error("Error cargando estadísticas completas:", e);
    }
}

function renderizarLideresDefensivos(defensivas, grid) {
    const posGroups = {};
    defensivas.forEach(stat => {
        if (!stat.posicion) return;
        if (!posGroups[stat.posicion]) posGroups[stat.posicion] = [];
        const rating = parseFloat(stat.fielding_percentage || 0);
        posGroups[stat.posicion].push({ ...stat, rating });
    });

    grid.innerHTML = POSICIONES_BEISBOL
        .filter(p => p.codigo !== 'P')
        .map(pos => {
            const leaders = (posGroups[pos.codigo] || [])
                .sort((a,b) => b.rating - a.rating)
                .slice(0,1); // Solo el mejor

            let leaderHtml = '<div class="position-leader empty-state">Sin datos</div>';
            if (leaders.length > 0) {
                const l = leaders[0];
                leaderHtml = `<div class="position-leader">
                                <div class="leader-stat">${l.rating.toFixed(3)}</div>
                                <div class="leader-name">${l.jugador_nombre}</div>
                                <div class="leader-team">${l.equipo_nombre}</div>
                            </div>`;
            }

            return `<div class="position-card">
                        <div class="position-title">${pos.icono} MEJOR ${pos.codigo} (FLD%)</div>
                        ${leaderHtml}
                    </div>`;
    }).join('');
}


// --- Playoffs ---
async function cargarPlayoffsClasificacion() {
    setLoading('playoffs-section', true);
    try {
        const data = await fetchJSON('/api/playoffs-clasificacion');
        if (!data || !data.equipos || data.equipos.length === 0) {
            setLoading('playoffs-section', false, 'No hay datos de clasificación disponibles.');
            return;
        }
        renderPlayoffsClasificacion(data);
        setLoading('playoffs-section', false);
    } catch (err) {
        setLoading('playoffs-section', false, 'No se pudo cargar la clasificación de playoffs.');
    }
}

function renderPlayoffsClasificacion(data) {
    const { configuracion, equipos } = data;
    if (document.getElementById('playoffs-cupos')) {
        document.getElementById('playoffs-cupos').innerHTML = `<strong>${configuracion.cupos_playoffs || 6}</strong> equipos clasifican`;
    }
    const tbody = document.getElementById('playoffsBody');
    if (!tbody) return;
    tbody.innerHTML = equipos.map(team => {
        const estadoClass = team.estado;
        const estadoTexto = { 'clasificado': 'Clasificado', 'contención': 'En Contención', 'eliminado': 'Eliminado' }[team.estado] || team.estado;
        return `
            <tr class="estado-${estadoClass}">
                <td>${team.posicion}</td>
                <td><strong>${team.equipo_nombre}</strong></td>
                <td>${team.pj}</td>
                <td>${team.pg}</td>
                <td>${team.pp}</td>
                <td>${(team.porcentaje * 100).toFixed(1)}%</td>
                <td>${team.cf}</td>
                <td>${team.ce}</td>
                <td class="${team.dif >= 0 ? 'positive' : 'negative'}">${team.dif >= 0 ? '+' : ''}${team.dif}</td>
                <td>${team.restantes}</td>
                <td>${team.max_victorias}</td>
                <td><span class="badge ${estadoClass}">${estadoTexto}</span></td>
            </tr>`;
    }).join('');
}

function initPlayoffsToggle() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const esTabla = this.dataset.view === 'tabla';
            document.querySelector('.playoffs-container').style.display = esTabla ? 'block' : 'none';
            document.querySelector('.playoffs-barras-container').style.display = esTabla ? 'none' : 'block';
            if (!esTabla && !this.dataset.loaded) {
                cargarPlayoffsBarras();
                this.dataset.loaded = 'true';
            }
        });
    });
}

async function cargarPlayoffsBarras() {
    const container = document.querySelector('.equipos-barras-grid');
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Calculando probabilidades...</p></div>';
    try {
        const data = await fetchJSON('/api/playoffs-clasificacion');
        if (!data || !data.equipos) throw new Error("No data");
        renderPlayoffsBarras(data);
    } catch (err) {
        container.innerHTML = '<div class="empty-state">Error al cargar datos de barras.</div>';
    }
}

function renderPlayoffsBarras({ configuracion, equipos }) {
    const container = document.querySelector('.equipos-barras-grid');
    const cupos = configuracion.cupos_playoffs || 6;
    if (document.querySelector('.barras-subtitle')) {
        document.querySelector('.barras-subtitle').textContent = `Probabilidad de clasificación • Top ${cupos} avanzan`;
    }
    container.innerHTML = equipos.map((equipo, index) => {
        const prob = calcularProbabilidadVisual(equipo, index + 1, cupos, equipos);
        const zona = determinarZona(prob);
        return `
            <div class="equipo-barra-card ${zona.clase} ${index + 1 === cupos ? 'corte-playoffs' : ''}">
                <div class="equipo-info-bar">
                    <div class="equipo-ranking">${index < 3 ? ['🥇','🥈','🥉'][index] : `${index+1}°`}</div>
                    <div class="equipo-detalles">
                        <h4 class="equipo-nombre-bar">${equipo.equipo_nombre}</h4>
                        <p class="equipo-record">${equipo.pg}-${equipo.pp}</p>
                    </div>
                    <div class="equipo-probabilidad">${prob}%</div>
                </div>
                <div class="barra-progreso"><div class="barra-fill ${zona.fillClass}" style="width: ${prob}%;"></div></div>
                ${index + 1 === cupos ? `<div class="linea-corte"><span>✂️ LÍNEA DE CORTE</span></div>` : ''}
            </div>`;
    }).join('');
}

function calcularProbabilidadVisual(equipo, pos, cupos, todos) {
    if (equipo.estado === 'clasificado') return Math.round(95 + (Math.random() * 5));
    if (equipo.estado === 'eliminado') return Math.round(Math.random() * 5);
    const probBase = pos <= cupos ? 60 + (cupos - pos) * 5 : 40 - (pos - cupos) * 5;
    const factorDif = (equipo.dif / 10);
    return Math.max(10, Math.min(85, Math.round(probBase + factorDif)));
}

function determinarZona(prob) {
    if (prob >= 85) return { clase: 'clasificado-zona', fillClass: 'clasificado-fill' };
    if (prob >= 40) return { clase: 'contencion-zona', fillClass: 'contencion-fill' };
    if (prob >= 10) return { clase: 'peligro-zona', fillClass: 'peligro-fill' };
    return { clase: 'eliminado-zona', fillClass: 'eliminado-fill' };
}


// =================================================================================
// BÚSQUEDA Y UTILIDADES
// =================================================================================

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

async function handleSearch(event) {
    const query = event.target.value.toLowerCase().trim();
    const resultsContainer = document.getElementById('searchResults');
    
    if (query.length < 2) {
        resultsContainer.style.display = 'none';
        return;
    }
    
    try {
        const [jugadores, equipos] = await Promise.all([
            fetchJSON('/api/jugadores?limit=1000'),
            fetchJSON('/api/equipos')
        ]);
        
        const filteredJugadores = (jugadores.jugadores || jugadores).filter(j => j.nombre.toLowerCase().includes(query)).slice(0, 5);
        const filteredEquipos = equipos.filter(e => e.nombre.toLowerCase().includes(query)).slice(0, 3);
        
        if (filteredJugadores.length === 0 && filteredEquipos.length === 0) {
            resultsContainer.innerHTML = '<div class="search-result-item">No se encontraron resultados.</div>';
        } else {
            resultsContainer.innerHTML = `
                ${filteredEquipos.map(e => `
                    <a href="equipo.html?id=${e.id}" class="search-result-item">
                        <div class="result-icon">🏅</div>
                        <div class="result-text">
                            <div class="result-title">${e.nombre}</div>
                            <div class="result-subtitle">Equipo</div>
                        </div>
                    </a>`).join('')}
                ${filteredJugadores.map(j => `
                    <a href="jugador.html?id=${j.id}" class="search-result-item">
                        <div class="result-icon">👤</div>
                        <div class="result-text">
                            <div class="result-title">${j.nombre}</div>
                            <div class="result-subtitle">${j.equipo_nombre || 'Sin equipo'}</div>
                        </div>
                    </a>`).join('')}
            `;
        }
        resultsContainer.style.display = 'block';
    } catch (e) {
        resultsContainer.innerHTML = '<div class="search-result-item">Error en la búsqueda.</div>';
        resultsContainer.style.display = 'block';
    }
}

function initBuscadorJugadores() {
    const searchInput = document.getElementById('searchPlayerInput');
    const resultsCount = document.getElementById('searchResultsCount');
    if (!searchInput) return;

    searchInput.addEventListener('input', debounce(function(e) {
        const searchTerm = e.target.value.toLowerCase().trim();
        let count = 0;
        
        document.querySelectorAll('.position-section').forEach(section => {
            let sectionHasVisiblePlayer = false;
            section.querySelectorAll('.player-card-small').forEach(card => {
                const playerName = card.dataset.playerName;
                const matches = playerName.includes(searchTerm);
                card.style.display = matches ? 'flex' : 'none';
                if (matches) {
                    sectionHasVisiblePlayer = true;
                    count++;
                }
            });
            section.style.display = sectionHasVisiblePlayer ? 'block' : 'none';
        });

        if (resultsCount) {
            resultsCount.textContent = searchTerm ? `${count} jugador(es) encontrado(s)` : '';
        }
    }, 300));
}
