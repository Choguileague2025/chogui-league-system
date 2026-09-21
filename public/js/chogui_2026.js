(function () {
    'use strict';

    const state = {
        teams: [],
        players: [],
        standings: [],
        games: [],
        upcoming: [],
        batting: [],
        pitching: [],
        news: []
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

    const getTournamentConfig = () => {
        const id = selectedTournamentId();
        const source = typeof TournamentModule !== 'undefined' ? TournamentModule.allTorneos : [];
        const tournament = Array.isArray(source) ? source.find((item) => String(item.id) === String(id)) : null;
        if (!tournament) return null;
        const teamCount = state.standings.length || state.teams.length;
        let totalGames = Number(tournament.total_juegos) || 8;
        let slots = Number(tournament.cupos_playoffs) || 8;
        // Match the normalization already used by the playoff API for historic short tournaments.
        if (totalGames === 22 && slots === 6 && (teamCount === 9 || /(joey|otoño|otono|aprendiendo)/i.test(tournament.nombre))) {
            totalGames = 8;
            slots = 8;
        }
        return { ...tournament, totalGames, slots: Math.min(slots, teamCount || slots) };
    };

    const getAllGames = async () => {
        const first = await getJson(withTournament('/api/partidos?page=1'));
        const games = normalizeArray(first);
        const pages = Math.min(10, Number(first?.pagination?.pages || 1));
        if (pages > 1) {
            const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) =>
                getJson(withTournament(`/api/partidos?page=${index + 2}`)).catch(() => ({ partidos: [] }))));
            remaining.forEach((page) => games.push(...normalizeArray(page)));
        }
        return games;
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

    const recentFinals = () => [...state.games]
        .filter((game) => game.estado === 'finalizado')
        .sort((a, b) => {
            const date = (value) => Date.parse(value.fecha_partido || value.fecha || '') || 0;
            return (date(b) - date(a)) || (Number(b.id || 0) - Number(a.id || 0));
        });

    const teamRecord = (teamId) => {
        const standing = state.standings.find((item) => String(item.equipo_id) === String(teamId));
        return standing ? `${Number(standing.pg || 0)} - ${Number(standing.pp || 0)}` : '';
    };

    window.choguiPositionCutoff = () => selectedTournamentId() ? (getTournamentConfig()?.slots || 8) : 0;
    window.choguiPositionRecentForm = (teamId) => {
        const games = recentFinals().filter((game) => String(game.equipo_local_id) === String(teamId) || String(game.equipo_visitante_id) === String(teamId)).slice(0, 5);
        if (!games.length) return '<span class="positions-form-empty">—</span>';
        return `<span class="positions-form">${games.map((game) => {
            const local = String(game.equipo_local_id) === String(teamId);
            const scored = Number(local ? game.carreras_local : game.carreras_visitante);
            const conceded = Number(local ? game.carreras_visitante : game.carreras_local);
            const result = scored > conceded ? 'G' : scored < conceded ? 'P' : 'E';
            const label = result === 'G' ? 'Victoria' : result === 'P' ? 'Derrota' : 'Empate';
            return `<span class="positions-form-dot ${result === 'G' ? 'win' : result === 'P' ? 'loss' : 'draw'}" title="${label} ${scored}-${conceded}" aria-label="${label} ${scored}-${conceded}">${result}</span>`;
        }).join('')}</span>`;
    };

    window.choguiRenderPositionsRace = (payload, forcedMessage = null) => {
        const headline = document.getElementById('playoffRaceHeadline');
        const meta = document.getElementById('playoffRaceMeta');
        const summary = document.getElementById('playoffRaceSummary');
        const list = document.getElementById('playoffRaceList');
        if (!headline || !meta || !summary || !list) return;
        const config = getTournamentConfig();
        if (!selectedTournamentId()) {
            headline.textContent = 'Selecciona un torneo para ver su corte de playoffs.';
            meta.textContent = '';
            list.innerHTML = '<div class="directory-empty">La clasificación a playoffs se calcula por torneo.</div>';
            summary.innerHTML = '';
            return;
        }
        const standings = [...state.standings].sort((a, b) => Number(a.ranking || 999) - Number(b.ranking || 999));
        const source = standings.length ? standings.map((team, index) => ({
            ...team, posicion: Number(team.ranking || index + 1), porcentaje: Number(team.porcentaje || 0) > 1 ? Number(team.porcentaje) / 100 : Number(team.porcentaje || 0)
        })) : (Array.isArray(payload?.equipos) ? payload.equipos : []);
        if (!source.length) {
            headline.textContent = forcedMessage || 'La clasificación aparecerá cuando se registren resultados.';
            meta.textContent = '';
            list.innerHTML = '<div class="directory-empty">Sin posiciones oficiales todavía.</div>';
            summary.innerHTML = '';
            return;
        }
        const slots = Math.min(source.length, Number(payload?.configuracion?.cupos_playoffs || config?.slots || 8));
        const direct = Math.max(1, Math.ceil(slots / 2));
        const totalGames = Number(payload?.configuracion?.total_juegos || config?.totalGames || 0);
        const played = Math.round(source.reduce((sum, item) => sum + Number(item.pj || 0), 0) / 2);
        const planned = totalGames > 0 ? Math.round(source.length * totalGames / 2) : 0;
        const percent = planned ? Math.min(100, Math.round(played / planned * 100)) : 0;
        const leader = source[0];
        headline.textContent = 'Así va la lucha por un lugar en la postemporada.';
        meta.textContent = `${slots} cupos · ${totalGames || '—'} juegos por equipo`;
        const renderGroup = (name, className, teams, range) => {
            if (!teams.length) return '';
            const rows = teams.map((team) => {
                const pct = Number(team.porcentaje || 0);
                const gamesBack = (Number(leader.pg || 0) - Number(team.pg || 0) + Number(team.pp || 0) - Number(leader.pp || 0)) / 2;
                const gb = gamesBack ? gamesBack.toFixed(1) : '—';
                return `<a class="positions-race-row" href="equipo.html?id=${encodeURIComponent(team.equipo_id)}"><span>${Number(team.posicion || 0)}</span><span class="positions-race-team">${logoMarkup(team.equipo_id, team.equipo_nombre, 'positions-race-mark')}<b>${escapeHtml(team.equipo_nombre)}</b></span><span>${Number(team.pg || 0)}</span><span>${Number(team.pp || 0)}</span><span>${formatPct(pct)}</span><span>${gb}</span></a>`;
            }).join('');
            return `<section class="positions-race-group ${className}"><h5>${escapeHtml(name)} <small>${escapeHtml(range)}</small></h5><div class="positions-race-row positions-race-labels"><span>POS</span><span>EQUIPO</span><span>G</span><span>P</span><span>PCT</span><span>GB</span></div>${rows}</section>`;
        };
        list.innerHTML = renderGroup('Clasificación directa', 'direct', source.slice(0, direct), `Top ${direct}`)
            + renderGroup('Zona Wildcard', 'wildcard', source.slice(direct, slots), `${direct + 1}°–${slots}°`)
            + renderGroup('Fuera de clasificación', 'outside', source.slice(slots), `${slots + 1}° en adelante`);
        summary.innerHTML = `<div class="positions-progress-caption">Cada juego cuenta.</div><div class="positions-progress-ring" style="--progress:${percent}%"><strong>${planned ? `${percent}%` : '—'}</strong></div><span>${config?.estado === 'finalizado' ? 'Torneo finalizado' : 'Temporada en curso'}</span><b>${played} de ${planned || '—'} juegos</b><small>Según el calendario configurado</small>`;
    };

    const avatarForPosition = (position) => {
        const code = String(position || '').toUpperCase();
        return code === 'P' ? 'player-pitcher.svg'
            : /^(LF|CF|RF|SF|OF)$/.test(code) ? 'player-outfield.svg'
                : 'player-infield.svg';
    };

    const logoMarkup = (teamId, teamName, className) => {
        if (!teamId) return `<span class="${className}">${escapeHtml(initials(teamName))}</span>`;
        return `<img class="${className}" src="/api/equipos/${encodeURIComponent(teamId)}/logo" alt="" loading="lazy" data-team-initials="${escapeHtml(initials(teamName))}">`;
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
        if (playoff && positionsSide && playoff.parentElement !== positionsSide) positionsSide.prepend(playoff);

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
        const latestFinal = recentFinals()[0];
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
                    <div class="featured-match-team">${logoMarkup(game.equipo_local_id, localName, 'featured-match-mark')}<strong>${escapeHtml(localName)}</strong><small>${escapeHtml(teamRecord(game.equipo_local_id) || 'Local')}</small></div>
                    <div class="featured-match-vs">${escapeHtml(center)}</div>
                    <div class="featured-match-team">${logoMarkup(game.equipo_visitante_id, visitorName, 'featured-match-mark')}<strong>${escapeHtml(visitorName)}</strong><small>${escapeHtml(teamRecord(game.equipo_visitante_id) || 'Visitante')}</small></div>
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
        const upcoming = state.upcoming.length > 0;
        const games = upcoming ? state.upcoming.slice(0, 3) : recentFinals().slice(0, 3);
        const title = document.getElementById('homeUpcomingTitle');
        const note = document.getElementById('homeUpcomingNote');
        if (title) title.textContent = upcoming || !games.length ? 'Próximos partidos' : 'Últimos resultados';
        if (note) {
            note.hidden = upcoming || !games.length;
            note.textContent = upcoming || !games.length ? '' : 'No hay partidos futuros programados.';
        }
        container.innerHTML = games.length ? games.map((game) => {
            const dateValue = game.fecha_partido || game.fecha;
            const day = formatDate(dateValue, { day: '2-digit' });
            const month = formatDate(dateValue, { month: 'short' }).replace('.', '').toUpperCase();
            const local = game.equipo_local_nombre || 'Local';
            const visitor = game.equipo_visitante_nombre || 'Visitante';
            const time = String(game.hora || '').slice(0, 5);
            const field = game.campo || game.ubicacion;
            const meta = [time, field].filter(Boolean).join(' · ') || (upcoming ? 'Horario y campo por definir' : 'Finalizado');
            const score = upcoming ? 'vs' : `${Number(game.carreras_visitante || 0)} - ${Number(game.carreras_local || 0)}`;
            return `<a class="home-upcoming-game" href="partido.html?id=${encodeURIComponent(game.id)}"><span class="home-upcoming-date"><span>${escapeHtml(month)}</span><strong>${escapeHtml(day)}</strong></span><span class="home-upcoming-copy"><strong>${escapeHtml(meta)}</strong><small>${escapeHtml(upcoming ? 'Próximo' : 'Final')}</small></span><span class="home-upcoming-match">${logoMarkup(game.equipo_visitante_id, visitor, 'home-match-mark')}<span>${escapeHtml(visitor)}</span><b>${escapeHtml(score)}</b>${logoMarkup(game.equipo_local_id, local, 'home-match-mark')}<span>${escapeHtml(local)}</span></span></a>`;
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
            { label: 'Efectividad', key: 'ERA', item: [...pitching].filter((item) => Number(item.innings_pitched || item.ip || 0) > 0).sort((a, b) => Number(a.era ?? 999) - Number(b.era ?? 999))[0], value: (item) => Number(item?.era || 0).toFixed(2) }
        ];
        container.innerHTML = categories.map(({ label, key, item, value }) => {
            if (!item) return `<article class="home-leader-card"><span class="home-leader-label">${escapeHtml(label)} (${key})</span><div class="home-leader-main"><span class="home-leader-avatar home-leader-avatar-empty">--</span><span class="home-leader-info"><strong>Sin datos</strong><b class="home-leader-value">--</b></span></div></article>`;
            const playerId = item.jugador_id || item.id;
            const playerName = item.jugador_nombre || item.nombre || 'Jugador';
            const card = `<span class="home-leader-label">${escapeHtml(label)} (${key})</span><div class="home-leader-main"><img class="home-leader-avatar" src="/images/avatars/${avatarForPosition(item.posicion)}" alt="" loading="lazy"><span class="home-leader-info"><strong>${escapeHtml(playerName)}</strong><small>${escapeHtml(item.equipo_nombre || '')}</small><b class="home-leader-value">${escapeHtml(value(item))}</b></span></div>`;
            return playerId ? `<a class="home-leader-card" href="jugador.html?id=${encodeURIComponent(playerId)}">${card}</a>` : `<article class="home-leader-card">${card}</article>`;
        }).join('');
    }

    function renderHomeBrief() {
        const container = document.getElementById('homeNewsEntries');
        if (!container) return;
        const title = document.getElementById('homeBriefTitle');
        const action = document.getElementById('homeBriefAction');
        if (state.news.length) {
            if (title) title.textContent = 'Noticias / Avisos';
            if (action) { action.hidden = state.news.length <= 2; action.textContent = 'Ver todas →'; }
            container.innerHTML = state.news.map((article, index) => `<article class="home-brief-item" ${index > 1 ? 'hidden' : ''}><span class="home-brief-mark home-brief-category">${escapeHtml(article.categoria === 'aviso' ? 'AVISO' : 'LIGA')}</span><span><strong>${escapeHtml(article.titulo)}</strong><small>${escapeHtml(article.resumen)}</small><small class="home-brief-date">${escapeHtml(formatDate(article.fecha_publicacion, { day: 'numeric', month: 'long', year: 'numeric' }))}</small></span></article>`).join('');
            return;
        }
        if (title) title.textContent = 'Actualidad de la liga';
        if (action) action.hidden = true;
        const rows = [];
        const next = state.upcoming[0];
        if (next) {
            const date = formatDate(next.fecha_partido || next.fecha, { day: 'numeric', month: 'long' });
            rows.push({ title: 'Próximo encuentro', copy: `${next.equipo_visitante_nombre || 'Visitante'} vs ${next.equipo_local_nombre || 'Local'} · ${date}`, teamId: next.equipo_local_id, team: next.equipo_local_nombre, href: next.id ? `partido.html?id=${encodeURIComponent(next.id)}` : '#partidos' });
        } else {
            const last = recentFinals()[0];
            if (last) {
                rows.push({ title: 'Último resultado', copy: `${last.equipo_visitante_nombre || 'Visitante'} ${Number(last.carreras_visitante || 0)} - ${Number(last.carreras_local || 0)} ${last.equipo_local_nombre || 'Local'}`, teamId: last.equipo_local_id, team: last.equipo_local_nombre, href: `partido.html?id=${encodeURIComponent(last.id)}` });
            }
        }
        const leader = [...state.standings].sort((a, b) => Number(a.ranking || 999) - Number(b.ranking || 999))[0];
        if (leader) rows.push({ title: 'Líder de la tabla', copy: `${leader.equipo_nombre} · ${Number(leader.pg || 0)} G - ${Number(leader.pp || 0)} P · PCT ${formatPct(leader.porcentaje)}`, teamId: leader.equipo_id, team: leader.equipo_nombre, href: `equipo.html?id=${encodeURIComponent(leader.equipo_id)}` });
        container.innerHTML = rows.length ? rows.map((row) => `<a class="home-brief-item" href="${row.href}">${logoMarkup(row.teamId, row.team, 'home-brief-mark')}<span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.copy)}</small></span><span class="home-brief-arrow" aria-hidden="true">→</span></a>`).join('') : '<div class="directory-empty">La actualidad aparecerá cuando haya partidos o posiciones oficiales.</div>';
    }

    function renderPositionKpis() {
        const gamesPlayed = Math.round(state.standings.reduce((sum, team) => sum + Number(team.pj || 0), 0) / 2);
        const runsFromStandings = state.standings.reduce((sum, team) => sum + Number(team.cf || 0), 0);
        const runs = runsFromStandings || state.games.reduce((sum, game) => sum + Number(game.carreras_local || 0) + Number(game.carreras_visitante || 0), 0);
        const leader = [...state.standings].sort((a, b) => Number(a.ranking || 999) - Number(b.ranking || 999))[0];
        const values = {
            positionsTeamsKpi: state.standings.length || state.teams.length || '--',
            positionsGamesKpi: gamesPlayed || '--',
            positionsLeaderKpi: leader?.equipo_nombre || '--',
            positionsRunsKpi: runs || '--'
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
        const tournament = getTournamentConfig();
        const season = document.getElementById('positionsSeasonLabel');
        const tableTitle = document.getElementById('positionsTableTitle');
        const leaderRecord = document.getElementById('positionsLeaderRecord');
        const average = document.getElementById('positionsRunsAverage');
        const tournamentLabel = tournament?.nombre || document.getElementById('indexTournamentSelect')?.selectedOptions?.[0]?.textContent || 'Torneo seleccionado';
        if (season) season.textContent = tournamentLabel;
        if (tableTitle) tableTitle.textContent = `Tabla General – ${tournamentLabel}`;
        if (leaderRecord) leaderRecord.textContent = leader ? `${Number(leader.pg || 0)} G – ${Number(leader.pp || 0)} P` : 'Clasificación oficial';
        if (average) average.textContent = gamesPlayed ? `${(runs / gamesPlayed).toFixed(1)} por juego` : 'Producción del torneo';
    }

    window.choguiPositionStandingsReady = (standings) => {
        if (!Array.isArray(standings) || !standings.length) return;
        state.standings = standings;
        const card = document.getElementById('tablaPosiciones');
        card?.querySelectorAll('[data-empty], [data-loader]').forEach((element) => { element.style.display = 'none'; });
        renderPositionKpis();
        window.choguiRenderPositionsRace(null);
    };

    function renderPositionsNextGames() {
        const container = document.getElementById('positionsNextGames');
        const subtitle = document.getElementById('positionsNextSubtitle');
        if (!container) return;
        const upcoming = state.upcoming.length > 0;
        const games = upcoming ? state.upcoming.slice(0, 3) : recentFinals().slice(0, 3);
        if (subtitle) subtitle.textContent = upcoming ? 'Partidos que pueden mover la tabla.' : 'No hay partidos futuros programados; consulta los últimos cruces.';
        container.innerHTML = games.length ? games.map((game) => {
            const date = formatDate(game.fecha_partido || game.fecha, { day: '2-digit', month: 'short' });
            const local = game.equipo_local_nombre || 'Local';
            const visitor = game.equipo_visitante_nombre || 'Visitante';
            const score = upcoming ? 'vs' : `${Number(game.carreras_visitante || 0)}–${Number(game.carreras_local || 0)}`;
            const meta = [String(game.hora || '').slice(0, 5), game.campo || game.ubicacion].filter(Boolean).join(' · ') || (upcoming ? 'Horario por definir' : 'Finalizado');
            return `<a class="positions-next-game" href="partido.html?id=${encodeURIComponent(game.id)}"><span class="positions-next-date">${escapeHtml(date)}</span><span class="positions-next-meta">${escapeHtml(meta)}</span><span class="positions-next-match">${logoMarkup(game.equipo_visitante_id, visitor, 'positions-next-mark')}<b>${escapeHtml(visitor)}</b><i>${score}</i>${logoMarkup(game.equipo_local_id, local, 'positions-next-mark')}<b>${escapeHtml(local)}</b></span></a>`;
        }).join('') : '<div class="directory-empty">No hay cruces cargados para este torneo.</div>';
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
                document.querySelectorAll('[data-game-filter]').forEach((item) => { item.classList.remove('active'); item.setAttribute('aria-pressed', 'false'); });
                button.classList.add('active');
                button.setAttribute('aria-pressed', 'true');
                renderGamesScreen();
            });
        });
        ['gamesDateFrom', 'gamesDateTo', 'gamesDivisionSelect'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', renderGamesScreen);
        });
        document.getElementById('gamesTournamentSelect')?.addEventListener('change', (event) => {
            const global = document.getElementById('indexTournamentSelect');
            if (!global || global.value === event.target.value) return;
            global.value = event.target.value;
            global.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    const gameKind = (game) => game.estado === 'en_vivo' ? 'en_vivo'
        : game.estado === 'finalizado' ? 'finalizado' : 'proximo';

    function renderGamesScreen() {
        const list = document.getElementById('gamesByDate');
        const side = document.getElementById('gamesSideContent');
        if (!list || !side) return;
        const globalTournament = document.getElementById('indexTournamentSelect');
        const tournament = document.getElementById('gamesTournamentSelect');
        if (globalTournament && tournament) {
            tournament.innerHTML = globalTournament.innerHTML;
            tournament.value = globalTournament.value;
        }
        const divisionSelect = document.getElementById('gamesDivisionSelect');
        const divisionValues = [...new Set(state.games.map((game) => game.division_nombre || game.division).filter(Boolean))].sort();
        if (divisionSelect) {
            const previous = divisionSelect.value;
            divisionSelect.innerHTML = '<option value="">Todas las divisiones</option>' + divisionValues.map((division) => `<option value="${escapeHtml(division)}">${escapeHtml(division)}</option>`).join('');
            divisionSelect.hidden = !divisionValues.length;
            divisionSelect.value = divisionValues.includes(previous) ? previous : '';
        }
        const from = document.getElementById('gamesDateFrom')?.value || '';
        const to = document.getElementById('gamesDateTo')?.value || '';
        const kind = document.querySelector('[data-game-filter].active')?.dataset.gameFilter || 'all';
        const division = divisionSelect?.value || '';
        const dateKey = (game) => String(game.fecha_partido || game.fecha || '').slice(0, 10);
        const games = [...state.games].filter((game) => {
            const date = dateKey(game);
            return (kind === 'all' || gameKind(game) === kind)
                && (!division || (game.division_nombre || game.division) === division)
                && (!from || (date && date >= from)) && (!to || (date && date <= to));
        }).sort((a, b) => {
            const date = dateKey(b).localeCompare(dateKey(a));
            return date || String(b.hora || '').localeCompare(String(a.hora || '')) || Number(b.id || 0) - Number(a.id || 0);
        });
        const grouped = new Map();
        games.forEach((game) => {
            const key = dateKey(game) || 'sin-fecha';
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(game);
        });
        list.innerHTML = games.length ? [...grouped.entries()].map(([date, rows]) => {
            const title = date === 'sin-fecha' ? 'Fecha por definir' : formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            return `<section class="games-day"><div class="games-day-head"><h2>${escapeHtml(title)}</h2><span>${rows.length} partido${rows.length === 1 ? '' : 's'}</span></div><div class="games-day-list">${rows.map(renderGameRow).join('')}</div></section>`;
        }).join('') : '<div class="games-empty">No hay partidos para estos filtros. Cambia el estado o las fechas para consultar el calendario.</div>';
        renderGamesSidebar(side);
    }

    function renderGameRow(game) {
        const kind = gameKind(game);
        const live = kind === 'en_vivo';
        const final = kind === 'finalizado';
        const local = game.equipo_local_nombre || 'Local';
        const visitor = game.equipo_visitante_nombre || 'Visitante';
        const time = game.hora ? String(game.hora).slice(0, 5) : 'Hora por definir';
        const location = game.campo || game.ubicacion || 'Campo por definir';
        const division = game.division_nombre || game.division || '';
        const score = final || live ? `${Number(game.carreras_visitante ?? 0)} <span>–</span> ${Number(game.carreras_local ?? 0)}` : '<span class="games-vs">VS</span>';
        const status = live ? 'EN VIVO' : final ? 'FINAL' : 'PRÓXIMO';
        const inning = live && game.innings_jugados ? `<small>Entrada ${Number(game.innings_jugados)}</small>` : '';
        const href = `partido.html?id=${encodeURIComponent(game.id)}`;
        return `<article class="games-match ${live ? 'is-live' : ''}"><div class="games-match-meta"><strong>${escapeHtml(time)}</strong><span>${escapeHtml(location)}</span>${division ? `<span>${escapeHtml(division)}</span>` : ''}<b class="games-state ${kind}">${status}</b></div><div class="games-match-center"><div class="games-competitor">${logoMarkup(game.equipo_visitante_id, visitor, 'games-team-logo')}<strong>${escapeHtml(visitor)}</strong><small>${escapeHtml(teamRecord(game.equipo_visitante_id))}</small></div><div class="games-score"><strong>${score}</strong>${inning}</div><div class="games-competitor">${logoMarkup(game.equipo_local_id, local, 'games-team-logo')}<strong>${escapeHtml(local)}</strong><small>${escapeHtml(teamRecord(game.equipo_local_id))}</small></div></div><a class="games-detail ${live ? 'primary' : ''}" href="${href}">${live ? 'Ver en vivo' : final ? 'Ver detalle' : 'Ver previa'} <span aria-hidden="true">→</span></a></article>`;
    }

    function renderGamesSidebar(side) {
        const live = state.games.find((game) => gameKind(game) === 'en_vivo');
        const upcoming = [...state.games].filter((game) => gameKind(game) === 'proximo').sort((a, b) => String(a.fecha_partido).localeCompare(String(b.fecha_partido)))[0];
        const featured = live || upcoming || recentFinals()[0];
        const standings = [...state.standings].sort((a, b) => Number(a.ranking || 999) - Number(b.ranking || 999)).slice(0, 5);
        const upcomingWeek = [...state.games].filter((game) => {
            if (gameKind(game) !== 'proximo') return false;
            const diff = Date.parse(game.fecha_partido || game.fecha || '') - Date.now();
            return diff >= -86400000 && diff <= 7 * 86400000;
        }).sort((a, b) => String(a.fecha_partido).localeCompare(String(b.fecha_partido))).slice(0, 4);
        side.innerHTML = `<section class="games-side-panel"><div class="games-side-head"><h3>Partido destacado</h3>${featured ? `<span class="games-state ${gameKind(featured)}">${gameKind(featured) === 'en_vivo' ? 'EN VIVO' : gameKind(featured) === 'finalizado' ? 'FINAL' : 'PRÓXIMO'}</span>` : ''}</div>${featured ? `<div class="games-featured"><p>${escapeHtml(formatDate(featured.fecha_partido || featured.fecha, { day: 'numeric', month: 'long', year: 'numeric' }))}${featured.hora ? ` · ${escapeHtml(String(featured.hora).slice(0, 5))}` : ''}</p><div class="games-featured-match"><div>${logoMarkup(featured.equipo_visitante_id, featured.equipo_visitante_nombre, 'games-featured-logo')}<strong>${escapeHtml(featured.equipo_visitante_nombre || 'Visitante')}</strong></div><b>${gameKind(featured) === 'proximo' ? 'VS' : `${Number(featured.carreras_visitante ?? 0)} – ${Number(featured.carreras_local ?? 0)}`}</b><div>${logoMarkup(featured.equipo_local_id, featured.equipo_local_nombre, 'games-featured-logo')}<strong>${escapeHtml(featured.equipo_local_nombre || 'Local')}</strong></div></div><a class="games-detail primary" href="partido.html?id=${encodeURIComponent(featured.id)}">${gameKind(featured) === 'en_vivo' ? 'Ver en vivo' : gameKind(featured) === 'finalizado' ? 'Ver detalle' : 'Ver previa'} →</a></div>` : '<div class="games-empty">Aún no hay partidos cargados.</div>'}</section><section class="games-side-panel"><div class="games-side-head"><h3>Tabla de posiciones</h3><a href="#posiciones">Ver tabla completa →</a></div><div class="games-mini-table"><div class="games-mini-head"><span>#</span><span>Equipo</span><span>G</span><span>P</span><span>PCT</span></div>${standings.map((team, index) => `<a href="equipo.html?id=${encodeURIComponent(team.equipo_id)}"><span>${index + 1}</span><span>${logoMarkup(team.equipo_id, team.equipo_nombre, 'games-mini-logo')}${escapeHtml(team.equipo_nombre)}</span><span>${Number(team.pg || 0)}</span><span>${Number(team.pp || 0)}</span><span>${formatPct(team.porcentaje)}</span></a>`).join('') || '<div class="games-empty">Sin posiciones todavía.</div>'}</div></section><section class="games-side-panel"><div class="games-side-head"><h3>Próximos 7 días</h3><a href="#partidos" data-games-upcoming>Ver calendario →</a></div>${upcomingWeek.length ? upcomingWeek.map((game) => `<a class="games-week-item" href="partido.html?id=${encodeURIComponent(game.id)}"><time>${escapeHtml(formatDate(game.fecha_partido || game.fecha, { day: '2-digit', month: 'short' }))}</time><span>${escapeHtml(game.equipo_visitante_nombre || 'Visitante')} vs ${escapeHtml(game.equipo_local_nombre || 'Local')}</span></a>`).join('') : '<div class="games-empty">No hay partidos programados para los próximos 7 días.</div>'}</section>`;
        side.querySelector('[data-games-upcoming]')?.addEventListener('click', (event) => {
            event.preventDefault();
            document.querySelector('[data-game-filter="proximo"]')?.click();
            document.getElementById('gamesByDate')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                null,
                withTournament('/api/proximos-partidos'),
                withTournament('/api/estadisticas-ofensivas?min_at_bats=1'),
                withTournament('/api/estadisticas-pitcheo'),
                withTournament('/api/noticias')
            ];
            const responses = await Promise.all(paths.map((path) => (path ? getJson(path) : getAllGames()).catch(() => [])));
            if (requestToken !== dashboardRequestToken) return;
            [state.teams, state.players, state.standings, state.games, state.upcoming, state.batting, state.pitching, state.news] = responses.map(normalizeArray);
            loadedTournamentKey = tournamentKey;
            renderHomeKpis();
            renderHomeFeatured();
            renderHomeStandings();
            renderUpcoming();
            renderHomeLeaders();
            renderHomeBrief();
            renderPositionKpis();
            if (typeof renderTablaPosiciones === 'function') renderTablaPosiciones(state.standings, document.getElementById('tablaPosicionesBody'));
            window.choguiRenderPositionsRace(null);
            renderPositionsNextGames();
            renderGamesScreen();
            populatePositionFilter();
            renderTeamsDirectory(document.getElementById('teamsDirectorySearch')?.value || '');
            renderPlayersDirectory(document.getElementById('playersDirectorySearch')?.value || '', document.getElementById('playersPositionFilter')?.value || '');
        } catch (error) {
            console.warn('[Chogui 2026] No se pudo actualizar el dashboard público:', error);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('error', (event) => {
            const image = event.target;
            if (!(image instanceof HTMLImageElement) || !image.dataset.teamInitials) return;
            const fallback = document.createElement('span');
            fallback.className = image.closest('.standings-team-mark') ? 'standings-team-initials' : image.className;
            fallback.textContent = image.dataset.teamInitials;
            image.replaceWith(fallback);
        }, true);
        moveSharedControls();
        placeTournamentControl();
        window.addEventListener('resize', placeTournamentControl);
        cleanDecorativeEmoji();
        bindNavigation();
        bindDirectoryFilters();
        bindGameFilters();
        document.getElementById('positionsNextAction')?.addEventListener('click', () => document.querySelector('.brand-nav-link[data-section="partidos"]')?.click());
        document.getElementById('homeBriefAction')?.addEventListener('click', (event) => {
            const button = event.currentTarget;
            const expanded = button.getAttribute('aria-expanded') !== 'true';
            button.setAttribute('aria-expanded', String(expanded));
            button.textContent = expanded ? 'Ver menos ↑' : 'Ver todas →';
            document.querySelectorAll('#homeNewsEntries .home-brief-item').forEach((item, index) => { item.hidden = !expanded && index > 1; });
        });
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
