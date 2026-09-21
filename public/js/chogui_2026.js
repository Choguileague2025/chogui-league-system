(function () {
    'use strict';

    const state = {
        teams: [],
        players: [],
        standings: [],
        games: [],
        upcoming: [],
        batting: [],
        pitching: []
    };
    let dashboardRequestToken = 0;
    let loadedTournamentKey = null;

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const initials = (value) => String(value || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase() || '--';

    const normalizeArray = (payload) => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.jugadores)) return payload.jugadores;
        if (Array.isArray(payload?.equipos)) return payload.equipos;
        if (Array.isArray(payload?.partidos)) return payload.partidos;
        return [];
    };

    const selectedTournamentId = () => {
        const select = document.getElementById('indexTournamentSelect');
        return select && select.value && select.value !== 'todos' ? select.value : '';
    };

    const withTournament = (path) => {
        const tournamentId = selectedTournamentId();
        if (!tournamentId) return path;
        return `${path}${path.includes('?') ? '&' : '?'}torneo_id=${encodeURIComponent(tournamentId)}`;
    };

    const getJson = async (path) => {
        const response = await fetch(path, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    };

    const formatPct = (value) => {
        const number = Number(value) || 0;
        return (number > 1 ? number / 100 : number).toFixed(3).replace(/^0/, '');
    };

    const formatDate = (value, options = {}) => {
        if (!value) return 'Fecha por definir';
        const raw = String(value).slice(0, 10);
        const date = new Date(`${raw}T12:00:00`);
        if (Number.isNaN(date.getTime())) return 'Fecha por definir';
        return date.toLocaleDateString('es-ES', options);
    };

    const logoMarkup = (teamId, teamName, className) => {
        if (!teamId) return `<span class="${className}">${escapeHtml(initials(teamName))}</span>`;
        return `<img class="${className}" src="/api/equipos/${encodeURIComponent(teamId)}/logo" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;${className}&quot;>${escapeHtml(initials(teamName))}</span>'">`;
    };

    function moveSharedControls() {
        const search = document.getElementById('searchInput')?.closest('.search-container');
        const searchHost = document.getElementById('globalSearchHost');
        if (search && searchHost && search.parentElement !== searchHost) searchHost.appendChild(search);

        const tournament = document.getElementById('indexTournamentSelect')?.closest('.tournament-selector-index');
        const tournamentHost = document.getElementById('globalTournamentHost');
        if (tournament && tournamentHost && tournament.parentElement !== tournamentHost) tournamentHost.appendChild(tournament);

        const playoff = document.getElementById('playoffRaceHome');
        const positionsSide = document.getElementById('positionsSide');
        if (playoff && positionsSide && playoff.parentElement !== positionsSide) positionsSide.appendChild(playoff);

        const upcoming = document.getElementById('proximos-partidos');
        const gamesSide = document.getElementById('gamesSide');
        if (upcoming && gamesSide && upcoming.parentElement !== gamesSide) gamesSide.appendChild(upcoming);
    }

    function placeTournamentControl() {
        const selector = document.getElementById('indexTournamentSelect')?.closest('.tournament-selector-index');
        const host = window.matchMedia('(max-width: 430px)').matches
            ? document.querySelector('.mobile-menu')
            : document.getElementById('globalTournamentHost');
        if (selector && host && selector.parentElement !== host) {
            if (host.classList.contains('mobile-menu')) host.insertBefore(selector, host.querySelector('.mobile-menu-item'));
            else host.appendChild(selector);
        }
    }

    function cleanDecorativeEmoji() {
        const strip = (value) => String(value || '')
            .replace(/🥇/gu, '1')
            .replace(/🥈/gu, '2')
            .replace(/🥉/gu, '3')
            .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
            .replace(/^\s+/, '');
        const cleanNode = (root) => {
            if (!root) return;
            if (root.nodeType === Node.TEXT_NODE) {
                const cleaned = strip(root.textContent);
                if (cleaned !== root.textContent) root.textContent = cleaned;
                return;
            }
            if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
            if (root.matches?.('input[placeholder]')) root.placeholder = strip(root.placeholder);
            root.querySelectorAll?.('input[placeholder]').forEach((input) => { input.placeholder = strip(input.placeholder); });
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
                const cleaned = strip(node.textContent);
                if (cleaned !== node.textContent) node.textContent = cleaned;
                node = walker.nextNode();
            }
        };
        cleanNode(document.body);
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => mutation.addedNodes.forEach(cleanNode));
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function syncActiveNavigation(section) {
        const target = section || 'inicio';
        document.querySelectorAll('.brand-nav-link[data-section], #mobileNavigation .nav-tab').forEach((link) => {
            link.classList.toggle('active', link.dataset.section === target);
        });
        if (history.replaceState) history.replaceState(null, '', `#${target}`);
    }

    function bindNavigation() {
        document.querySelectorAll('.brand-nav-link[data-section], #mobileNavigation .nav-tab').forEach((link) => {
            link.addEventListener('click', () => syncActiveNavigation(link.dataset.section));
        });
        document.querySelectorAll('.mobile-menu-item[href^="#"]').forEach((link) => {
            link.addEventListener('click', () => syncActiveNavigation(link.getAttribute('href').slice(1)));
        });
        syncActiveNavigation(location.hash.slice(1) || 'inicio');
    }

    function renderHomeFeatured() {
        const container = document.getElementById('homeFeaturedGame');
        if (!container) return;
        const live = state.games.find((game) => game.estado === 'en_vivo');
        const next = state.upcoming[0];
        const latestFinal = [...state.games].reverse().find((game) => game.estado === 'finalizado');
        const game = live || next || latestFinal;
        if (!game) {
            container.innerHTML = '<div class="directory-empty">No hay partidos cargados para el torneo seleccionado.</div>';
            return;
        }

        const localName = game.equipo_local_nombre || 'Local';
        const visitorName = game.equipo_visitante_nombre || 'Visitante';
        const isFinal = game.estado === 'finalizado';
        const isLive = game.estado === 'en_vivo';
        const center = isLive || isFinal
            ? `${Number(game.carreras_local || 0)} - ${Number(game.carreras_visitante || 0)}`
            : 'VS';
        const date = formatDate(game.fecha_partido || game.fecha, { weekday: 'short', day: 'numeric', month: 'long' });
        const time = String(game.hora || '').slice(0, 5) || 'Hora por definir';
        const field = game.campo || game.ubicacion || 'Campo por definir';

        container.innerHTML = `
            <div class="featured-match-card">
                <div class="featured-match-meta">${escapeHtml(date)} · ${escapeHtml(time)} · ${escapeHtml(field)}</div>
                <div class="featured-match-versus">
                    <div class="featured-match-team">${logoMarkup(game.equipo_local_id, localName, 'featured-match-mark')}<strong>${escapeHtml(localName)}</strong><small>Local</small></div>
                    <div class="featured-match-vs">${escapeHtml(center)}</div>
                    <div class="featured-match-team">${logoMarkup(game.equipo_visitante_id, visitorName, 'featured-match-mark')}<strong>${escapeHtml(visitorName)}</strong><small>Visitante</small></div>
                </div>
                ${game.id ? `<a class="featured-match-link" href="partido.html?id=${encodeURIComponent(game.id)}">Ver detalles del partido →</a>` : ''}
            </div>`;
    }

    function renderHomeStandings() {
        const body = document.getElementById('homeStandingsBody');
        if (!body) return;
        const ordered = [...state.standings]
            .sort((a, b) => (Number(a.ranking || 999) - Number(b.ranking || 999)) || (Number(b.porcentaje || 0) - Number(a.porcentaje || 0)))
            .slice(0, 5);
        body.innerHTML = ordered.length ? ordered.map((team, index) => `
            <tr data-equipo-id="${escapeHtml(team.equipo_id)}">
                <td>${escapeHtml(team.ranking || index + 1)}</td>
                <td><a class="home-standings-team" href="equipo.html?id=${encodeURIComponent(team.equipo_id)}">${logoMarkup(team.equipo_id, team.equipo_nombre, 'home-team-mark')}<span>${escapeHtml(team.equipo_nombre)}</span></a></td>
                <td>${Number(team.pg || 0)}</td><td>${Number(team.pp || 0)}</td><td>${formatPct(team.porcentaje)}</td>
            </tr>`).join('') : '<tr><td colspan="5">Todavía no hay clasificación disponible.</td></tr>';
    }

    function renderUpcoming() {
        const container = document.getElementById('homeUpcomingGames');
        if (!container) return;
        container.innerHTML = state.upcoming.length ? state.upcoming.slice(0, 3).map((game) => {
            const dateValue = game.fecha_partido || game.fecha;
            const day = formatDate(dateValue, { day: '2-digit' });
            const month = formatDate(dateValue, { month: 'short' }).replace('.', '').toUpperCase();
            const names = `${game.equipo_visitante_nombre || 'Visitante'} vs ${game.equipo_local_nombre || 'Local'}`;
            return `<a class="home-upcoming-game" href="partido.html?id=${encodeURIComponent(game.id)}"><span class="home-upcoming-date"><span>${escapeHtml(month)}</span><strong>${escapeHtml(day)}</strong></span><span class="home-upcoming-copy"><strong>${escapeHtml(names)}</strong><small>${escapeHtml(String(game.hora || '').slice(0, 5) || 'Hora por definir')} · ${escapeHtml(game.campo || game.ubicacion || 'Campo por definir')}</small></span></a>`;
        }).join('') : '<div class="directory-empty">No hay próximos partidos programados.</div>';
    }

    function renderHomeLeaders() {
        const container = document.getElementById('homeLeadersGrid');
        if (!container) return;
        const batting = state.batting;
        const pitching = state.pitching;
        const categories = [
            { label: 'Promedio de bateo', key: 'AVG', item: [...batting].sort((a, b) => Number(b.avg || 0) - Number(a.avg || 0))[0], value: (item) => Number(item?.avg || 0).toFixed(3).replace(/^0/, '') },
            { label: 'Cuadrangulares', key: 'HR', item: [...batting].sort((a, b) => Number(b.home_runs || 0) - Number(a.home_runs || 0))[0], value: (item) => Number(item?.home_runs || 0) },
            { label: 'Impulsadas', key: 'RBI', item: [...batting].sort((a, b) => Number(b.rbi || 0) - Number(a.rbi || 0))[0], value: (item) => Number(item?.rbi || 0) },
            { label: 'Efectividad', key: 'ERA', item: [...pitching].filter((item) => Number(item.innings_pitched || item.ip || 0) > 0).sort((a, b) => Number(a.era || 999) - Number(b.era || 999))[0], value: (item) => Number(item?.era || 0).toFixed(2) }
        ];
        container.innerHTML = categories.map(({ label, key, item, value }) => {
            if (!item) return `<article class="home-leader-card"><span class="home-leader-avatar">${key}</span><div><span>${label}</span><strong>Sin datos</strong></div><div class="home-leader-value">--</div></article>`;
            const playerId = item.jugador_id || item.id;
            const playerName = item.jugador_nombre || item.nombre || 'Jugador';
            const card = `<span class="home-leader-avatar">${escapeHtml(initials(playerName))}</span><div><span>${escapeHtml(label)} (${key})</span><strong>${escapeHtml(playerName)}</strong><small>${escapeHtml(item.equipo_nombre || '')}</small></div><div class="home-leader-value">${escapeHtml(value(item))}</div>`;
            return playerId ? `<a class="home-leader-card" href="jugador.html?id=${encodeURIComponent(playerId)}">${card}</a>` : `<article class="home-leader-card">${card}</article>`;
        }).join('');
    }

    function renderPositionKpis() {
        const gamesPlayed = state.standings.reduce((sum, team) => sum + Number(team.pj || 0), 0) / 2;
        const runsFromStandings = state.standings.reduce((sum, team) => sum + Number(team.cf || 0), 0);
        const runs = runsFromStandings || state.games.reduce((sum, game) => sum + Number(game.carreras_local || 0) + Number(game.carreras_visitante || 0), 0);
        const leader = [...state.standings].sort((a, b) => Number(b.porcentaje || 0) - Number(a.porcentaje || 0))[0];
        const values = {
            positionsTeamsKpi: state.standings.length || state.teams.length || '--',
            positionsGamesKpi: Number.isFinite(gamesPlayed) ? Math.round(gamesPlayed) : '--',
            positionsLeaderKpi: leader?.equipo_nombre || '--',
            positionsRunsKpi: runs || '--'
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }

    function renderHomeKpis() {
        const runsFromStandings = state.standings.reduce((sum, team) => sum + Number(team.cf || 0), 0);
        const runs = runsFromStandings || state.games.reduce((sum, game) => sum + Number(game.carreras_local || 0) + Number(game.carreras_visitante || 0), 0);
        const values = {
            homeTeamsKpi: state.teams.length || state.standings.length || '--',
            homeGamesKpi: state.games.length || '--',
            homePlayersKpi: state.players.length || '--',
            homeRunsKpi: runs || '--'
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
        const season = document.getElementById('homeSeasonKpi');
        const select = document.getElementById('indexTournamentSelect');
        if (season && select?.selectedOptions?.[0]) season.textContent = select.selectedOptions[0].textContent.replace(/\s*\(Activo\)\s*/, '');
    }

    function renderTeamsDirectory(query = '') {
        const container = document.getElementById('teamsDirectoryGrid');
        const count = document.getElementById('teamsDirectoryCount');
        if (!container) return;
        const normalized = query.trim().toLowerCase();
        const standingById = new Map(state.standings.map((team) => [String(team.equipo_id), team]));
        const teams = state.teams.filter((team) => !normalized || String(team.nombre || team.equipo_nombre || '').toLowerCase().includes(normalized));
        if (count) count.textContent = `${teams.length} equipo${teams.length === 1 ? '' : 's'}`;
        container.innerHTML = teams.length ? teams.map((team) => {
            const teamId = team.id || team.equipo_id;
            const name = team.nombre || team.equipo_nombre || 'Equipo';
            const standing = standingById.get(String(teamId));
            const record = standing ? `${Number(standing.pg || 0)}-${Number(standing.pp || 0)}` : 'Sin récord';
            return `<a class="directory-card" href="equipo.html?id=${encodeURIComponent(teamId)}">${logoMarkup(teamId, name, 'directory-logo')}<div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(team.ciudad || team.ubicacion || 'Chogui League')}</p><small>${standing ? `Posición #${standing.ranking || '--'}` : 'Ver perfil y plantilla'}</small></div><span class="directory-stat">${escapeHtml(record)}</span></a>`;
        }).join('') : '<div class="directory-empty">No se encontraron equipos.</div>';
    }

    function renderPlayersDirectory(query = '', position = '') {
        const container = document.getElementById('playersDirectoryGrid');
        const count = document.getElementById('playersDirectoryCount');
        if (!container) return;
        const normalized = query.trim().toLowerCase();
        const statsById = new Map(state.batting.map((item) => [String(item.jugador_id || item.id), item]));
        const players = state.players.filter((player) => {
            const stat = statsById.get(String(player.id || player.jugador_id));
            const haystack = `${player.nombre || player.jugador_nombre || ''} ${player.equipo_nombre || stat?.equipo_nombre || ''}`.toLowerCase();
            const playerPosition = player.posicion || stat?.posicion || '';
            return (!normalized || haystack.includes(normalized)) && (!position || playerPosition === position);
        });
        if (count) count.textContent = `${players.length} jugador${players.length === 1 ? '' : 'es'}`;
        container.innerHTML = players.length ? players.map((player) => {
            const playerId = player.id || player.jugador_id;
            const stat = statsById.get(String(playerId));
            const name = player.nombre || player.jugador_nombre || stat?.jugador_nombre || 'Jugador';
            const team = player.equipo_nombre || stat?.equipo_nombre || 'Sin equipo';
            const positionName = player.posicion || stat?.posicion || 'UTIL';
            return `<a class="directory-card" href="jugador.html?id=${encodeURIComponent(playerId)}"><span class="directory-avatar">${escapeHtml(initials(name))}</span><div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(team)}</p><small>${escapeHtml(positionName)}</small></div><span class="directory-stat">${stat ? `AVG ${Number(stat.avg || 0).toFixed(3).replace(/^0/, '')}` : 'Perfil'}</span></a>`;
        }).join('') : '<div class="directory-empty">No se encontraron jugadores.</div>';
    }

    function populatePositionFilter() {
        const select = document.getElementById('playersPositionFilter');
        if (!select) return;
        const positions = [...new Set(state.players.map((player) => player.posicion).filter(Boolean))].sort();
        const current = select.value;
        select.innerHTML = '<option value="">Todas las posiciones</option>' + positions.map((position) => `<option value="${escapeHtml(position)}">${escapeHtml(position)}</option>`).join('');
        select.value = current;
    }

    function bindDirectoryFilters() {
        const teamsSearch = document.getElementById('teamsDirectorySearch');
        if (teamsSearch && !teamsSearch.dataset.bound) {
            teamsSearch.addEventListener('input', () => renderTeamsDirectory(teamsSearch.value));
            teamsSearch.dataset.bound = 'true';
        }
        const playersSearch = document.getElementById('playersDirectorySearch');
        const position = document.getElementById('playersPositionFilter');
        const refresh = () => renderPlayersDirectory(playersSearch?.value || '', position?.value || '');
        if (playersSearch && !playersSearch.dataset.bound) {
            playersSearch.addEventListener('input', refresh);
            playersSearch.dataset.bound = 'true';
        }
        if (position && !position.dataset.bound) {
            position.addEventListener('change', refresh);
            position.dataset.bound = 'true';
        }
    }

    function bindGameFilters() {
        document.querySelectorAll('[data-game-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                document.querySelectorAll('[data-game-filter]').forEach((item) => item.classList.remove('active'));
                button.classList.add('active');
                const filter = button.dataset.gameFilter;
                document.querySelectorAll('#gameCenterGrid .game-center-row, #ultimosPartidosGrid .scoreboard-card').forEach((card) => {
                    const text = card.textContent.toLowerCase();
                    const visible = filter === 'all'
                        || (filter === 'en_vivo' && text.includes('en vivo'))
                        || (filter === 'finalizado' && (text.includes('final') || card.classList.contains('results')))
                        || (filter === 'proximo' && (text.includes('programado') || text.includes('previa')));
                    card.hidden = !visible;
                });
            });
        });
    }

    async function loadPublicDashboard(force = false) {
        const tournamentKey = selectedTournamentId() || 'all';
        if (!force && loadedTournamentKey === tournamentKey) return;
        const requestToken = ++dashboardRequestToken;
        try {
            const paths = [
                withTournament('/api/equipos'),
                withTournament('/api/jugadores'),
                withTournament('/api/standings'),
                withTournament('/api/partidos?limit=1000'),
                withTournament('/api/proximos-partidos'),
                withTournament('/api/estadisticas-ofensivas?min_at_bats=1'),
                withTournament('/api/estadisticas-pitcheo')
            ];
            const responses = await Promise.all(paths.map((path) => getJson(path).catch(() => [])));
            if (requestToken !== dashboardRequestToken) return;
            [state.teams, state.players, state.standings, state.games, state.upcoming, state.batting, state.pitching] = responses.map(normalizeArray);
            loadedTournamentKey = tournamentKey;
            renderHomeKpis();
            renderHomeFeatured();
            renderHomeStandings();
            renderUpcoming();
            renderHomeLeaders();
            renderPositionKpis();
            populatePositionFilter();
            renderTeamsDirectory(document.getElementById('teamsDirectorySearch')?.value || '');
            renderPlayersDirectory(document.getElementById('playersDirectorySearch')?.value || '', document.getElementById('playersPositionFilter')?.value || '');
        } catch (error) {
            console.warn('[Chogui 2026] No se pudo actualizar el dashboard público:', error);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        moveSharedControls();
        placeTournamentControl();
        window.addEventListener('resize', placeTournamentControl);
        cleanDecorativeEmoji();
        bindNavigation();
        bindDirectoryFilters();
        bindGameFilters();
        if (selectedTournamentId()) loadPublicDashboard();

        const tournament = document.getElementById('indexTournamentSelect');
        if (tournament) tournament.addEventListener('change', () => window.setTimeout(() => loadPublicDashboard(true), 80));
        let observedTournament = selectedTournamentId();
        let checks = 0;
        const tournamentReadyTimer = window.setInterval(() => {
            checks += 1;
            const currentTournament = selectedTournamentId();
            if (currentTournament && currentTournament !== observedTournament) {
                observedTournament = currentTournament;
                loadPublicDashboard(true);
            }
            if (checks >= 16) window.clearInterval(tournamentReadyTimer);
        }, 250);
    });
})();
