// JUGADOR.JS - VERSIÓN FINAL 2025 - CORREGIDA

// ===================================
// CONFIGURACIÓN DE API
// ===================================
const API_BASE_URL = 'https://chogui-league-system-production.up.railway.app';

// ===================================
// VARIABLES GLOBALES
// ===================================
let currentPlayerId = null;
let playerData = null;
let playerStats = null;
let gamesHistory = [];
let performanceCharts = {};
let playerFavorites = JSON.parse(localStorage.getItem('playerFavorites') || '[]');

// ===================================
// FUNCIONES PRINCIPALES
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    currentPlayerId = parseInt(urlParams.get('id'), 10);

    if (!currentPlayerId || isNaN(currentPlayerId)) {
        mostrarErrorGeneral('ID de jugador inválido o no proporcionado.');
        return;
    }
    
    cargarDatosJugador();
});

async function cargarDatosJugador() {
    try {
        console.log(`📄 Cargando datos del jugador ID: ${currentPlayerId}...`);
        
        const [jugadorResponse, statsResponse, partidosResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/jugadores/${currentPlayerId}`),
            fetch(`${API_BASE_URL}/api/estadisticas-ofensivas?jugador_id=${currentPlayerId}`),
            fetch(`${API_BASE_URL}/api/jugadores/${currentPlayerId}/partidos`)
        ]);

        if (!jugadorResponse.ok) {
            throw new Error(`No se pudo encontrar la información del jugador (Error ${jugadorResponse.status}).`);
        }
        
        playerData = await jugadorResponse.json();
        console.log('✅ Datos del jugador:', playerData);
        
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            playerStats = Array.isArray(statsData) ? statsData[0] : statsData;
            console.log('✅ Estadísticas del jugador:', playerStats);
        } else {
            console.warn(`⚠️ No se encontraron estadísticas para el jugador ID: ${currentPlayerId}`);
            playerStats = {};
        }

        if (partidosResponse.ok) {
            gamesHistory = await partidosResponse.json();
            console.log('✅ Historial de partidos cargado:', gamesHistory.length, gamesHistory);
        } else {
            console.warn('⚠️ No se pudieron cargar los partidos del jugador');
            gamesHistory = [];
        }

        renderizarPagina();
        setTimeout(inicializarFuncionalidadesAvanzadas, 300);

    } catch (error) {
        console.error('❌ Error fatal al cargar datos del jugador:', error);
        mostrarErrorGeneral(error.message);
    }
}

// ===================================
// FUNCIONES DE RENDERIZADO
// ===================================

function renderizarPagina() {
    renderizarHeaderJugador();
    renderizarEstadisticasBateo();
    renderizarMetricasAvanzadas();
    renderizarHistorialPartidos();
    configurarNavegacion();
}

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

function renderizarEstadisticasBateo() {
    const stats = playerStats || {};
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

function renderizarMetricasAvanzadas() {
    const stats = playerStats || {};
    document.getElementById('warTotal').textContent = (stats.war_total || 0.0).toFixed(2);
    document.getElementById('wrcPlus').textContent = 'N/A';
    document.getElementById('stolenBases').textContent = stats.stolen_bases || 0;
    document.getElementById('defensiveRating').textContent = (stats.rating_defensivo || 0.0).toFixed(2);
}

function renderizarHistorialPartidos() {
    const container = document.getElementById('gamesHistoryContainer');
    
    console.log('🔍 Renderizando historial. gamesHistory:', gamesHistory);
    console.log('🔍 playerData.equipo_id:', playerData.equipo_id);
    
    if (!gamesHistory || gamesHistory.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay partidos finalizados para este jugador</div>';
        return;
    }
    
    const html = gamesHistory.map(partido => {
        console.log('🔍 Procesando partido:', partido);
        
        const esLocal = partido.equipo_local_id == playerData.equipo_id;
        const equipoRival = esLocal ? partido.equipo_visitante_nombre : partido.equipo_local_nombre;
        const carrerasEquipo = esLocal ? partido.carreras_local : partido.carreras_visitante;
        const carrerasRival = esLocal ? partido.carreras_visitante : partido.carreras_local;
        
        const resultado = carrerasEquipo > carrerasRival ? 'G' : 'P';
        const resultadoClass = resultado === 'G' ? 'win' : 'loss';
        
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

// ===================================
// FUNCIONES HELPER
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

function configurarNavegacion() {
    const backBtn = document.getElementById('backToTeamBtn');
    if (backBtn) {
        if (playerData.equipo_id) {
            backBtn.href = `equipo.html?id=${playerData.equipo_id}`;
        } else {
            backBtn.style.display = 'none';
        }
    }
}

function mostrarErrorGeneral(mensaje) {
    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = `
            <div class="error-message">
                <h2>⚠️ Error</h2>
                <p>${mensaje}</p>
                <a href="index.html" class="btn-primary" style="margin-top:20px;">Volver al Inicio</a>
            </div>
        `;
    }
}

// ===================================
// FUNCIONALIDADES AVANZADAS
// ===================================

function inicializarFuncionalidadesAvanzadas() {
    if (!playerData) return;
    crearGraficosRendimiento();
    configurarSistemaFavoritos();
    configurarSistemaComparaciones();
    cargarJugadoresRelacionados();
    cargarNotasJugador();
}

// ===================================
// GRÁFICOS DE RENDIMIENTO
// ===================================

function crearGraficosRendimiento() {
    const partidosData = generarDatosHistoricosParaGraficos();
    crearGrafico(document.getElementById('battingChart'), 'AVG', partidosData.map(p => p.avg), '#ffc107');
    crearGrafico(document.getElementById('opsChart'), 'OPS', partidosData.map(p => p.ops), '#ff9800');
    
    const tendenciaEl = document.getElementById('tendenciaAvg');
    if (tendenciaEl && partidosData.length >= 2) {
        const ultimoAvg = partidosData[partidosData.length - 1].avg;
        const penultimoAvg = partidosData[partidosData.length - 2].avg;
        const diff = ultimoAvg - penultimoAvg;
        tendenciaEl.textContent = diff >= 0 ? `+${(diff * 100).toFixed(1)}%` : `${(diff * 100).toFixed(1)}%`;
    }
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
    if(chartWidth <= 0 || chartHeight <= 0) return;
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

// ===================================
// JUGADORES RELACIONADOS
// ===================================

async function cargarJugadoresRelacionados() {
    await cargarJugadoresMismaPosicion();
    await cargarJugadoresMismoEquipo();
}

async function cargarJugadoresMismaPosicion() {
    const container = document.getElementById('samePositionPlayers');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/jugadores/${currentPlayerId}/similares?limit=5`);

        if (!response.ok) {
            throw new Error('Error cargando jugadores similares');
        }

        const jugadores = await response.json();

        if (jugadores.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay otros jugadores en esta posición</div>';
            return;
        }

        const html = jugadores.map(jugador => {
            const avgValue = parseFloat(jugador.avg) || 0;

            return `
                <a href="jugador.html?id=${jugador.id}" class="related-player">
                    <div class="related-avatar">${obtenerIniciales(jugador.nombre)}</div>
                    <div class="related-info">
                        <div class="related-name">${jugador.nombre}</div>
                        <div class="related-team">${jugador.equipo_nombre || 'Sin equipo'}</div>
                    </div>
                    <div class="related-stat">
                        <span style="color: #ffc107; font-weight: bold;">${avgValue.toFixed(3)}</span>
                        <span style="font-size: 0.7rem; opacity: 0.8;">AVG</span>
                    </div>
                </a>
            `;
        }).join('');

        container.innerHTML = html;
    } catch (error) {
        console.error('Error cargando jugadores de misma posición:', error);
        container.innerHTML = '<div class="empty-state">Error cargando jugadores</div>';
    }
}

async function cargarJugadoresMismoEquipo() {
    const container = document.getElementById('sameTeamPlayers');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/jugadores/${currentPlayerId}/companeros?limit=5`);

        if (!response.ok) {
            throw new Error('Error cargando compañeros');
        }

        const jugadores = await response.json();

        if (jugadores.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay otros jugadores en este equipo</div>';
            return;
        }

        const html = jugadores.map(jugador => {
            const avgValue = parseFloat(jugador.avg) || 0;

            return `
                <a href="jugador.html?id=${jugador.id}" class="related-player">
                    <div class="related-avatar">${obtenerIniciales(jugador.nombre)}</div>
                    <div class="related-info">
                        <div class="related-name">${jugador.nombre}</div>
                        <div class="related-team">${formatearPosicion(jugador.posicion)}</div>
                    </div>
                    <div class="related-stat">
                        <span style="color: #ffc107; font-weight: bold;">${avgValue.toFixed(3)}</span>
                        <span style="font-size: 0.7rem; opacity: 0.8;">AVG</span>
                    </div>
                </a>
            `;
        }).join('');

        container.innerHTML = html;
    } catch (error) {
        console.error('Error cargando compañeros de equipo:', error);
        container.innerHTML = '<div class="empty-state">Error cargando jugadores</div>';
    }
}

// ===================================
// COMPARACIÓN DE JUGADORES
// ===================================

function configurarSistemaComparaciones() {
    const generateBtn = document.getElementById('generateComparison');
    if (generateBtn) {
        generateBtn.addEventListener('click', generarComparacion);
    }
}

async function generarComparacion() {
    const positionSelect = document.getElementById('comparisonPosition');
    const metricSelect = document.getElementById('comparisonMetric');
    const resultsContainer = document.getElementById('comparisonResults');
    
    if (!positionSelect || !metricSelect || !resultsContainer) return;
    
    const positionFilter = positionSelect.value;
    const metric = metricSelect.value;
    
    resultsContainer.innerHTML = '<div class="loading">Generando comparación...</div>';
    
    try {
        let endpoint = '';
        
        if (positionFilter === 'team') {
            endpoint = `${API_BASE_URL}/api/jugadores/${currentPlayerId}/companeros?limit=10`;
        } else {
            endpoint = `${API_BASE_URL}/api/jugadores/${currentPlayerId}/similares?limit=10`;
        }
        
        const response = await fetch(endpoint);
        
        if (!response.ok) {
            throw new Error('Error obteniendo datos para comparación');
        }
        
        const jugadores = await response.json();
        
        if (jugadores.length === 0) {
            resultsContainer.innerHTML = '<div class="empty-state">No hay jugadores disponibles para comparar</div>';
            return;
        }
        
        const jugadorActual = {
            id: currentPlayerId,
            nombre: playerData.nombre,
            equipo_nombre: playerData.equipo_nombre,
            avg: calcularAVG(playerStats),
            hits: playerStats.hits || 0,
            home_runs: playerStats.home_runs || 0,
            rbi: playerStats.rbi || 0,
            at_bats: playerStats.at_bats || 0
        };
        
        const obp = calcularOBP(playerStats);
        const slg = calcularSLG(playerStats);
        jugadorActual.ops = obp + slg;
        
        const todosJugadores = [jugadorActual, ...jugadores];
        
        todosJugadores.sort((a, b) => {
            const valA = parseFloat(a[metric]) || 0;
            const valB = parseFloat(b[metric]) || 0;
            return valB - valA;
        });
        
        const html = todosJugadores.map(jugador => {
            const esJugadorActual = jugador.id == currentPlayerId;
            const valor = jugador[metric] || 0;
            const valorNumerico = parseFloat(valor) || 0;
            const valorFormateado = (metric === 'avg' || metric === 'ops') ? 
                valorNumerico.toFixed(3) : Math.round(valorNumerico);
            
            return `
                <div class="comparison-player ${esJugadorActual ? 'current-player' : ''}" 
                     style="${esJugadorActual ? 'border-left: 4px solid #00ff88; background: rgba(0, 255, 136, 0.1);' : ''}">
                    <div class="comparison-player-info">
                        <div class="comparison-avatar">${obtenerIniciales(jugador.nombre)}</div>
                        <div>
                            <div style="font-weight: bold; color: #fff;">
                                ${jugador.nombre} ${esJugadorActual ? '(Tú)' : ''}
                            </div>
                            <div style="font-size: 0.8rem; color: #ffc107;">
                                ${jugador.equipo_nombre || 'Sin equipo'}
                            </div>
                        </div>
                    </div>
                    <div class="comparison-stats">
                        <div class="comparison-stat">
                            <div class="comparison-stat-value">${valorFormateado}</div>
                            <div class="comparison-stat-label">${metric.toUpperCase()}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        resultsContainer.innerHTML = html;
        
    } catch (error) {
        console.error('Error generando comparación:', error);
        resultsContainer.innerHTML = '<div class="empty-state">Error generando comparación</div>';
    }
}

// ===================================
// SISTEMA DE FAVORITOS
// ===================================

function configurarSistemaFavoritos() {
    const toggleBtn = document.getElementById('toggleFavorite');
    const shareBtn = document.getElementById('sharePlayer');
    const exportBtn = document.getElementById('exportPlayerData');
    const saveNotesBtn = document.getElementById('saveNotes');
    
    if (toggleBtn) toggleBtn.addEventListener('click', toggleFavorito);
    if (shareBtn) shareBtn.addEventListener('click', compartirJugador);
    if (exportBtn) exportBtn.addEventListener('click', exportarDatosJugador);
    if (saveNotesBtn) saveNotesBtn.addEventListener('click', guardarNotasJugador);
    
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
    const iconEl = document.getElementById('favoriteIcon');
    const textEl = document.getElementById('favoriteText');
    const btnEl = document.getElementById('toggleFavorite');
    
    if (iconEl) iconEl.textContent = isFavorite ? '★' : '☆';
    if (textEl) textEl.textContent = isFavorite ? 'Quitar de Favoritos' : 'Agregar a Favoritos';
    if (btnEl) btnEl.classList.toggle('active', isFavorite);
}

function compartirJugador() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ 
            title: `Perfil de ${playerData.nombre}`, 
            url 
        }).catch(console.error);
    } else {
        navigator.clipboard.writeText(url).then(() => {
            mostrarNotificacion('Enlace copiado al portapapeles', 'success');
        }).catch(() => {
            mostrarNotificacion('No se pudo copiar el enlace', 'warning');
        });
    }
}

function exportarDatosJugador() {
    const data = {
        jugador: playerData,
        estadisticas: playerStats,
        historial_partidos: gamesHistory,
        fechaExportacion: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${playerData.nombre.replace(/\s+/g, '_')}_data.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    mostrarNotificacion('Datos exportados correctamente', 'success');
}

function guardarNotasJugador() {
    const notesEl = document.getElementById('playerNotes');
    if (notesEl) {
        const notes = notesEl.value;
        localStorage.setItem(`player_notes_${currentPlayerId}`, notes);
        mostrarNotificacion('Notas guardadas correctamente', 'success');
    }
}

function cargarNotasJugador() {
    const notesEl = document.getElementById('playerNotes');
    if (notesEl) {
        const notes = localStorage.getItem(`player_notes_${currentPlayerId}`) || '';
        notesEl.value = notes;
    }
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const noti = document.createElement('div');
    noti.textContent = mensaje;
    noti.className = `notification ${tipo}`;
    noti.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${tipo === 'success' ? '#00ff88' : tipo === 'warning' ? '#ff9800' : '#ffc107'};
        color: #0d1117;
        border-radius: 8px;
        font-weight: bold;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(noti);
    setTimeout(() => { noti.style.opacity = '1'; }, 10);
    setTimeout(() => {
        noti.style.opacity = '0';
        setTimeout(() => noti.remove(), 300);
    }, 3000);
}
