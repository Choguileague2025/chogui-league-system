// ============================================
// INDEX MODULES - Phase 3.3
// Tournament selector, pagination, SSE integration
// for index.html
// ============================================

// ============================================
// MODULE: TOURNAMENT MANAGEMENT
// ============================================
const TournamentModule = {
    currentTournamentId: null,
    allTorneos: [],

    async load() {
        try {
            const select = document.getElementById('indexTournamentSelect');
            if (!select) return;

            const response = await fetch('/api/torneos');
            if (!response.ok) throw new Error('Error cargando torneos');
            const data = await response.json();
            this.allTorneos = Array.isArray(data) ? data : (data.torneos || []);

            select.innerHTML = '<option value="todos">Todos los torneos</option>';

            this.allTorneos.forEach(torneo => {
                const option = document.createElement('option');
                option.value = torneo.id;
                option.textContent = torneo.nombre + (torneo.activo ? ' (Activo)' : '');
                if (torneo.activo) {
                    option.selected = true;
                    this.currentTournamentId = String(torneo.id);
                }
                select.appendChild(option);
            });

            select.addEventListener('change', (e) => {
                this.currentTournamentId = e.target.value === 'todos' ? 'todos' : e.target.value;
                this.onTournamentChange();
            });

            console.log('[Torneos] Cargados:', this.allTorneos.length);
        } catch (error) {
            console.error('[Torneos] Error:', error);
            const select = document.getElementById('indexTournamentSelect');
            if (select) select.innerHTML = '<option value="todos">Todos los torneos</option>';
        }
    },

    getCurrentId() {
        return this.currentTournamentId;
    },

    onTournamentChange() {
        console.log('[Torneos] Cambiado a:', this.currentTournamentId);
        // Reload leaders and stats with new tournament filter
        if (typeof cargarLideres === 'function') cargarLideres();
        if (typeof cargarEstadisticasCompletas === 'function') cargarEstadisticasCompletas();
        if (typeof cargarLideresOfensivos === 'function') cargarLideresOfensivos();
        if (typeof cargarTablaPosiciones === 'function') cargarTablaPosiciones();
        NotificationModule.show('Torneo actualizado', 'info');
    }
};

// ============================================
// MODULE: PAGINATION FOR STATS TABLE
// ============================================
const PaginationModule = {
    currentPage: 1,
    itemsPerPage: 15,
    totalData: [],
    tbodyId: null,
    renderFn: null,

    init(tbodyId, renderFn) {
        this.tbodyId = tbodyId;
        this.renderFn = renderFn;
        this.currentPage = 1;

        // Setup button listeners
        const prevBtn = document.getElementById('prevPageStats');
        const nextBtn = document.getElementById('nextPageStats');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousPage());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextPage());
        }
    },

    setData(data) {
        this.totalData = Array.isArray(data) ? data : [];
        this.currentPage = 1;
        this.render();
    },

    render() {
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageData = this.totalData.slice(start, end);

        if (this.renderFn) {
            this.renderFn(pageData, start);
        }

        this.updateControls();
    },

    updateControls() {
        const totalPages = Math.max(1, Math.ceil(this.totalData.length / this.itemsPerPage));
        const currentPageEl = document.getElementById('currentPageStats');
        const totalPagesEl = document.getElementById('totalPagesStats');
        const prevBtn = document.getElementById('prevPageStats');
        const nextBtn = document.getElementById('nextPageStats');
        const container = document.getElementById('statsPagination');

        if (currentPageEl) currentPageEl.textContent = this.currentPage;
        if (totalPagesEl) totalPagesEl.textContent = totalPages;
        if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= totalPages;

        // Hide pagination if only 1 page
        if (container) {
            container.style.display = totalPages <= 1 ? 'none' : 'flex';
        }
    },

    nextPage() {
        const totalPages = Math.ceil(this.totalData.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.render();
        }
    },

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.render();
        }
    },

    filter(query) {
        // This is called by search - filters then resets page
        this.currentPage = 1;
        this.render();
    }
};

// ============================================
// MODULE: NOTIFICATION SYSTEM
// ============================================
const NotificationModule = {
    show(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification-toast ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        // Trigger animation
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 400);
        }, 3000);
    }
};

// ============================================
// MODULE: SSE REAL-TIME UPDATES
// ============================================
const SSEModule = {
    connection: null,
    statusDot: null,

    init() {
        if (typeof EventSource === 'undefined') {
            console.warn('[SSE] EventSource no soportado');
            return;
        }

        this.statusDot = document.getElementById('sseDot');

        try {
            this.connection = new EventSource('/api/sse/updates');

            this.connection.addEventListener('stats-update', (e) => {
                console.log('[SSE] Stats update recibido');
                NotificationModule.show('Estadísticas actualizadas', 'info');
                // Reload leaders and stats
                if (typeof cargarLideres === 'function') cargarLideres();
                if (typeof cargarEstadisticasCompletas === 'function') cargarEstadisticasCompletas();
                if (typeof cargarLideresOfensivos === 'function') cargarLideresOfensivos();
            });

            this.connection.addEventListener('tournament-change', (e) => {
                console.log('[SSE] Tournament change recibido');
                NotificationModule.show('Torneo actualizado', 'warning');
                TournamentModule.load();
                if (typeof cargarTablaPosiciones === 'function') cargarTablaPosiciones();
                if (typeof cargarLideres === 'function') cargarLideres();
            });

            this.connection.addEventListener('general-update', (e) => {
                console.log('[SSE] General update recibido');
                if (typeof cargarTablaPosiciones === 'function') cargarTablaPosiciones();
                if (typeof cargarUltimosPartidos === 'function') cargarUltimosPartidos();
            });

            this.connection.onopen = () => {
                console.log('[SSE] Conectado');
                if (this.statusDot) this.statusDot.classList.remove('disconnected');
            };

            this.connection.onerror = () => {
                console.warn('[SSE] Error de conexión');
                if (this.statusDot) this.statusDot.classList.add('disconnected');
            };

        } catch (error) {
            console.warn('[SSE] No se pudo conectar:', error);
        }
    },

    destroy() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
    }
};

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    SSEModule.destroy();
});

// ============================================
// MODULE: STATS TABLE SEARCH
// ============================================
const StatsSearchModule = {
    init() {
        const searchInput = document.getElementById('searchStatsTable');
        if (!searchInput) return;

        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = e.target.value.trim().toLowerCase();
                if (!query) {
                    // Reset to full data
                    PaginationModule.setData(PaginationModule.totalData);
                    return;
                }

                // Filter the original estadisticas array
                if (typeof estadisticas !== 'undefined') {
                    const filtered = estadisticas.filter(s =>
                        (s.jugador_nombre || '').toLowerCase().includes(query) ||
                        (s.equipo_nombre || '').toLowerCase().includes(query)
                    );
                    PaginationModule.totalData = filtered;
                    PaginationModule.currentPage = 1;
                    PaginationModule.render();
                }
            }, 300);
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Modules] Inicializando módulos de optimización...');

    // Load tournaments
    await TournamentModule.load();

    // Init SSE
    SSEModule.init();

    // Init stats table search
    StatsSearchModule.init();

    // Init pagination for stats table (will be populated by cargarEstadisticasCompletas)
    PaginationModule.init('statsTable', (pageData, startIndex) => {
        const tbody = document.querySelector('#statsTable tbody');
        if (!tbody) return;

        if (pageData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="22" class="loading">No hay datos disponibles</td></tr>';
            return;
        }

        tbody.innerHTML = pageData.map((s, i) => {
            const ab = parseInt(s.at_bats) || 0;
            const h = parseInt(s.hits) || 0;
            const d2 = parseInt(s.doubles) || 0;
            const d3 = parseInt(s.triples) || 0;
            const hr = parseInt(s.home_runs) || 0;
            const rbi = parseInt(s.rbi) || 0;
            const r = parseInt(s.runs) || 0;
            const bb = parseInt(s.walks) || 0;
            const so = parseInt(s.strikeouts) || 0;
            const sb = parseInt(s.stolen_bases) || 0;
            const cs = parseInt(s.caught_stealing) || 0;
            const hbp = parseInt(s.hit_by_pitch) || 0;
            const sf = parseInt(s.sacrifice_flies) || 0;

            const singles = h - d2 - d3 - hr;
            const pa = ab + bb + hbp + sf;
            const avg = ab > 0 ? (h / ab) : 0;
            const obp = (ab + bb + hbp + sf) > 0 ? (h + bb + hbp) / (ab + bb + hbp + sf) : 0;
            const slg = ab > 0 ? (singles + d2 * 2 + d3 * 3 + hr * 4) / ab : 0;
            const ops = obp + slg;
            const iso = slg - avg;
            const tb = singles + d2 * 2 + d3 * 3 + hr * 4;

            return `<tr onclick="window.location.href='jugador.html?id=${s.jugador_id}'">
                <td>${s.jugador_nombre || '-'}</td>
                <td>${s.equipo_nombre || '-'}</td>
                <td>${s.posicion || '-'}</td>
                <td>${pa}</td>
                <td>${ab}</td>
                <td>${h}</td>
                <td>${singles}</td>
                <td>${d2}</td>
                <td>${d3}</td>
                <td>${hr}</td>
                <td>${rbi}</td>
                <td>${r}</td>
                <td>${bb}</td>
                <td>${so}</td>
                <td>${sb}</td>
                <td>${cs}</td>
                <td>${avg.toFixed(3)}</td>
                <td>${obp.toFixed(3)}</td>
                <td>${slg.toFixed(3)}</td>
                <td>${ops.toFixed(3)}</td>
                <td>${iso.toFixed(3)}</td>
                <td>${tb}</td>
            </tr>`;
        }).join('');
    });

    console.log('[Modules] Módulos inicializados correctamente');
});

// ============================================
// HOOK: Override cargarEstadisticasCompletas to use pagination
// ============================================
// This runs after the main script defines cargarEstadisticasCompletas
// We wrap it to feed data into PaginationModule
window.addEventListener('load', () => {
    // Hook into the existing stats loading to feed pagination
    const originalFn = window.cargarEstadisticasCompletas;
    if (typeof originalFn === 'function') {
        window.cargarEstadisticasCompletas = async function () {
            try {
                const fullUrl = typeof getApiUrl === 'function'
                    ? getApiUrl('/api/estadisticas-ofensivas')
                    : '/api/estadisticas-ofensivas';

                const res = await fetch(fullUrl, { headers: { 'Accept': 'application/json' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                // Apply same filter logic as original
                let estadisticasFiltradas;
                const tiene2025 = (data || []).some(r => (r.temporada ?? '').toString().trim() === '2025');
                if (tiene2025) {
                    estadisticasFiltradas = data.filter(r => (r.temporada ?? '').toString().trim() === '2025');
                } else {
                    estadisticasFiltradas = data || [];
                }

                // Store globally
                if (typeof estadisticas !== 'undefined') {
                    window.estadisticas = estadisticasFiltradas;
                }

                // Feed into pagination module
                PaginationModule.setData(estadisticasFiltradas);

                // Still update position leaders (from original fn)
                try {
                    const lideres = (typeof leadersData !== 'undefined' && leadersData.defensiva) || [];
                    const grid = document.getElementById('positionLeadersGrid');
                    if (grid && lideres.length > 0) {
                        // Let original handle it
                        const mejoresPorPosicion = {};
                        lideres.forEach(l => {
                            const pos = l.posicion || 'UTIL';
                            const fldPct = parseFloat(l.fielding_percentage) || 0;
                            if (!mejoresPorPosicion[pos] || fldPct > parseFloat(mejoresPorPosicion[pos].fielding_percentage || 0)) {
                                mejoresPorPosicion[pos] = l;
                            }
                        });
                        const posicionesOrdenadas = Object.values(mejoresPorPosicion)
                            .sort((a, b) => (parseFloat(b.fielding_percentage) || 0) - (parseFloat(a.fielding_percentage) || 0))
                            .slice(0, 4);
                        grid.innerHTML = posicionesOrdenadas.map(l => {
                            const fldPct = parseFloat(l.fielding_percentage) || 0;
                            const po = parseInt(l.putouts) || 0;
                            const a = parseInt(l.assists) || 0;
                            const e = parseInt(l.errors) || 0;
                            return `
                                <div class="position-card" style="background:linear-gradient(145deg,#2a2a4a,#1a1a2e);border-radius:16px;padding:20px;border:2px solid rgba(255,215,0,0.2);">
                                    <div style="color:#ffd700;font-size:1.2rem;font-weight:bold;margin-bottom:15px;">🛡️ ${l.posicion || 'UTIL'}</div>
                                    <div style="display:flex;flex-direction:column;gap:8px;">
                                        <div style="font-weight:bold;color:#fff;">${l.jugador_nombre || 'N/A'}</div>
                                        <div style="color:rgba(255,255,255,0.7);font-size:0.85rem;">${l.equipo_nombre || ''}</div>
                                        <div style="color:#ffd700;font-size:1.1rem;font-weight:bold;">FLD% ${fldPct.toFixed(3)}</div>
                                        <div style="color:rgba(255,255,255,0.6);font-size:0.8rem;">PO:${po} A:${a} E:${e}</div>
                                    </div>
                                </div>`;
                        }).join('');
                    }
                } catch (e) { console.warn('Position leaders render:', e); }

            } catch (e) {
                console.error('Error cargando estadísticas completas:', e);
            }
        };
        console.log('[Modules] cargarEstadisticasCompletas wrapped with pagination');
    }
});

console.log('✅ index_modules.js cargado');
