const matchParams = new URLSearchParams(window.location.search);
const matchId = matchParams.get('id');

function matchNum(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function matchText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

function matchHtml(id, html) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = html;
}

function matchEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function shortDate(value) {
    if (!value) return 'Fecha por definir';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Fecha por definir';
    return date.toLocaleDateString('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function statusLabel(partido) {
    if (partido.estado === 'finalizado' || (partido.carreras_local != null && partido.carreras_visitante != null)) return 'Final';
    if (partido.estado === 'en_vivo') return 'En vivo';
    if (partido.estado === 'cancelado') return 'Cancelado';
    return 'Programado';
}

function initialsFromName(name, fallback = '--') {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return fallback;
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function renderHighlightList(containerId, items, emptyMessage) {
    if (!items?.length) {
        matchHtml(containerId, `<div class="highlight-empty">${emptyMessage}</div>`);
        return;
    }

    matchHtml(containerId, items.map((item) => `
        <article class="highlight-item">
            <strong>${matchEscape(item.jugador_nombre)}</strong>
            <small>${matchEscape(item.equipo_nombre || 'Sin equipo')}</small>
            <small>${matchEscape(item.summary || 'Sin resumen')}</small>
            <span class="highlight-score">${matchNum(item.score).toFixed(2)}</span>
        </article>
    `).join(''));
}

function renderOffenseTable(containerId, rows) {
    if (!rows?.length) {
        matchHtml(containerId, '<tr><td colspan="13" class="boxscore-empty">Sin bateo cargado todavía</td></tr>');
        return;
    }

    matchHtml(containerId, rows.map((row) => `
        <tr>
            <td class="boxscore-name-cell" data-label="Jugador"><a class="boxscore-player-link" href="jugador.html?id=${row.jugador_id}">${matchEscape(row.jugador_nombre)}</a></td>
            <td data-label="PA">${matchNum(row.plate_appearances)}</td>
            <td data-label="AB">${matchNum(row.at_bats)}</td>
            <td data-label="H">${matchNum(row.hits)}</td>
            <td data-label="2B">${matchNum(row.doubles)}</td>
            <td data-label="3B">${matchNum(row.triples)}</td>
            <td data-label="HR">${matchNum(row.home_runs)}</td>
            <td data-label="RBI">${matchNum(row.rbi)}</td>
            <td data-label="R">${matchNum(row.runs)}</td>
            <td data-label="BB">${matchNum(row.walks)}</td>
            <td data-label="SO">${matchNum(row.strikeouts)}</td>
            <td data-label="SB">${matchNum(row.stolen_bases)}</td>
            <td data-label="AVG">${Number(row.avg || 0).toFixed(3)}</td>
        </tr>
    `).join(''));
}

function renderPitchingTable(containerId, rows) {
    if (!rows?.length) {
        matchHtml(containerId, '<tr><td colspan="9" class="boxscore-empty">Sin pitcheo cargado todavía</td></tr>');
        return;
    }

    matchHtml(containerId, rows.map((row) => `
        <tr>
            <td class="boxscore-name-cell" data-label="Jugador"><a class="boxscore-player-link" href="jugador.html?id=${row.jugador_id}">${matchEscape(row.jugador_nombre)}</a></td>
            <td data-label="IP">${matchNum(row.innings_pitched).toFixed(1)}</td>
            <td data-label="H">${matchNum(row.hits_allowed)}</td>
            <td data-label="ER">${matchNum(row.earned_runs)}</td>
            <td data-label="BB">${matchNum(row.walks_allowed)}</td>
            <td data-label="SO">${matchNum(row.strikeouts)}</td>
            <td data-label="HR">${matchNum(row.home_runs_allowed)}</td>
            <td data-label="ERA">${Number(row.era || 0).toFixed(2)}</td>
            <td data-label="WHIP">${Number(row.whip || 0).toFixed(2)}</td>
        </tr>
    `).join(''));
}

function renderDefenseTable(containerId, rows) {
    if (!rows?.length) {
        matchHtml(containerId, '<tr><td colspan="8" class="boxscore-empty">Sin defensa cargada todavía</td></tr>');
        return;
    }

    matchHtml(containerId, rows.map((row) => `
        <tr>
            <td class="boxscore-name-cell" data-label="Jugador"><a class="boxscore-player-link" href="jugador.html?id=${row.jugador_id}">${matchEscape(row.jugador_nombre)}</a></td>
            <td data-label="Pos">${matchEscape(row.posicion || '--')}</td>
            <td data-label="PO">${matchNum(row.putouts)}</td>
            <td data-label="A">${matchNum(row.assists)}</td>
            <td data-label="E">${matchNum(row.errors)}</td>
            <td data-label="DP">${matchNum(row.double_plays)}</td>
            <td data-label="CH">${matchNum(row.chances)}</td>
            <td data-label="FPCT">${Number(row.fielding_percentage || 0).toFixed(3)}</td>
        </tr>
    `).join(''));
}

function renderTeamPanel(prefix, team) {
    matchText(`${prefix}PanelTitle`, team.team_name || (prefix === 'visitor' ? 'Visitante' : 'Local'));
    matchText(`${prefix}PanelMeta`, `${matchNum(team.score)} carreras • ${matchNum(team.totals?.offense?.hits)} hits • ${matchNum(team.totals?.defense?.errors)} errores`);
    matchText(`${prefix}OpsBadge`, `OPS ${Number(team.totals?.offense?.ops || 0).toFixed(3)}`);
    matchText(`${prefix}DefBadge`, `FPCT ${Number(team.totals?.defense?.fielding_percentage || 0).toFixed(3)}`);

    renderOffenseTable(`${prefix}OffenseBody`, team.offense);
    renderPitchingTable(`${prefix}PitchingBody`, team.pitching);
    renderDefenseTable(`${prefix}DefenseBody`, team.defense);
}

function renderDecisionCard(nameId, metaId, entry, emptyName, emptyMeta) {
    matchText(nameId, entry?.jugador_nombre || emptyName);
    const pieces = [];
    if (entry?.equipo_nombre) pieces.push(entry.equipo_nombre);
    if (entry?.summary) pieces.push(entry.summary);
    matchText(metaId, pieces.length ? pieces.join(' • ') : emptyMeta);
}

function registerMatchShareCard(partido = {}, resumen = {}) {
    if (!window.ChoguiShare) return;

    window.ChoguiShare.registerPage({
        getData: () => ({
            type: 'partido',
            kicker: document.getElementById('matchHeroKicker')?.textContent || 'Juego oficial',
            title: document.getElementById('matchHeroTitle')?.textContent || 'Detalle del partido',
            subtitle: document.getElementById('matchHeroSubtitle')?.textContent || '',
            badge: partido.torneo_nombre || 'Resultado oficial',
            meta: document.getElementById('matchBreadcrumb')?.textContent || '',
            badgeLabel: document.getElementById('matchBadgeLabel')?.textContent || 'Estado',
            badgeValue: document.getElementById('matchBadgeValue')?.textContent || '--',
            badgeMeta: document.getElementById('matchBadgeMeta')?.textContent || '',
            logo: '/images/logos/chogui-league.png',
            initials: 'CL',
            fileName: `partido-${partido.id || matchId || 'detalle'}`,
            linkLabel: 'Boxscore oficial',
            scoreline: `${partido.carreras_visitante ?? '-'} - ${partido.carreras_local ?? '-'}`,
            sideAName: partido.equipo_visitante_nombre || 'Visitante',
            sideBName: partido.equipo_local_nombre || 'Local',
            sideALogo: partido.equipo_visitante_id ? `/api/equipos/${partido.equipo_visitante_id}/logo` : '',
            sideBLogo: partido.equipo_local_id ? `/api/equipos/${partido.equipo_local_id}/logo` : '',
            sideAInitials: initialsFromName(partido.equipo_visitante_nombre, 'VI'),
            sideBInitials: initialsFromName(partido.equipo_local_nombre, 'LO'),
            metrics: [
                { label: 'Hits', value: document.getElementById('summaryHits')?.textContent || '--' },
                { label: 'Errores', value: document.getElementById('summaryErrors')?.textContent || '--' },
                { label: 'HR', value: document.getElementById('summaryHr')?.textContent || '--' },
                { label: 'MVP', value: document.getElementById('summaryMvp')?.textContent || (resumen.mvp_proyectado?.jugador_nombre || '--') }
            ]
        })
    });
}

async function loadBoxscore() {
    if (!matchId || Number.isNaN(Number(matchId))) {
        document.body.innerHTML = '<div class="container"><div class="match-highlights-card"><h2>Partido inválido</h2><p>Falta el ID del partido en la URL.</p></div></div>';
        return;
    }

    try {
        const response = await fetch(`/api/partidos/${matchId}/boxscore`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const partido = data.partido || {};
        const resumen = data.resumen || {};
        const visitante = data.equipos?.visitante || { totals: { offense: {}, defense: {} }, offense: [], pitching: [], defense: [] };
        const local = data.equipos?.local || { totals: { offense: {}, defense: {} }, offense: [], pitching: [], defense: [] };
        const label = statusLabel(partido);
        const title = `${partido.equipo_visitante_nombre || 'Visitante'} vs ${partido.equipo_local_nombre || 'Local'}`;
        const subtitle = `${partido.torneo_nombre || 'Sin torneo'} • ${shortDate(partido.fecha_partido)}${partido.hora ? ` • ${String(partido.hora).slice(0, 5)}` : ''}`;

        document.title = `${title} - Detalle del partido | Chogui League`;
        matchText('matchHeroTitle', title);
        matchText('matchHeroSubtitle', subtitle);
        matchText('matchHeroKicker', partido.torneo_nombre || 'Juego oficial');
        matchText('matchBadgeValue', label);
        matchText('matchBadgeMeta', resumen.boxscore_cargado ? 'Planilla cargada' : 'Carga parcial todavía');
        matchText('matchBreadcrumb', title);

        matchText('visitorName', partido.equipo_visitante_nombre || 'Visitante');
        matchText('localName', partido.equipo_local_nombre || 'Local');
        matchText('visitorScore', partido.carreras_visitante ?? '-');
        matchText('localScore', partido.carreras_local ?? '-');

        const visitorLink = document.getElementById('visitorTeamLink');
        const localLink = document.getElementById('localTeamLink');
        if (visitorLink) visitorLink.href = partido.equipo_visitante_id ? `equipo.html?id=${partido.equipo_visitante_id}` : '#';
        if (localLink) localLink.href = partido.equipo_local_id ? `equipo.html?id=${partido.equipo_local_id}` : '#';

        matchText('summaryHits', `${matchNum(resumen.total_hits_visitante)} - ${matchNum(resumen.total_hits_local)}`);
        matchText('summaryErrors', `${matchNum(resumen.total_errors_visitante)} - ${matchNum(resumen.total_errors_local)}`);
        matchText('summaryHr', `${matchNum(resumen.total_hr_visitante)} - ${matchNum(resumen.total_hr_local)}`);
        matchText('summaryMvp', resumen.mvp_proyectado?.jugador_nombre || 'Sin lectura');
        matchText('summaryMvpMeta', resumen.mvp_proyectado
            ? `${resumen.mvp_proyectado.equipo_nombre || 'Sin equipo'} • ${resumen.mvp_proyectado.summary || ''}`
            : 'Carga la planilla para detectar la figura del juego');
        renderDecisionCard(
            'gameMvpName',
            'gameMvpMeta',
            data.metadata?.jugador_del_partido || resumen.jugador_del_partido,
            'Por definir',
            'Sin leyenda oficial cargada todavía'
        );
        renderDecisionCard(
            'winningPitcherName',
            'winningPitcherMeta',
            data.metadata?.pitcher_ganador || resumen.pitcher_ganador,
            'Por definir',
            'Sin decisión oficial todavía'
        );
        renderDecisionCard(
            'losingPitcherName',
            'losingPitcherMeta',
            data.metadata?.pitcher_perdedor || resumen.pitcher_perdedor,
            'Por definir',
            'Sin decisión oficial todavía'
        );

        renderHighlightList('highlightOffense', data.destacados?.ofensiva, 'Todavía no hay figuras ofensivas cargadas.');
        renderHighlightList('highlightPitching', data.destacados?.pitcheo, 'Todavía no hay lectura de pitcheo para este juego.');
        renderHighlightList('highlightDefense', data.destacados?.defensa, 'Todavía no hay jugadas defensivas registradas.');

        renderTeamPanel('visitor', visitante);
        renderTeamPanel('local', local);
        registerMatchShareCard(partido, resumen);
    } catch (error) {
        console.error('Error cargando detalle del partido:', error);
        document.querySelector('.partido-page').innerHTML = `
            <section class="match-highlights-card">
                <div class="section-headline">
                    <h3>No se pudo cargar la planilla del juego</h3>
                    <p>Intenta recargar o verifica si el partido ya tiene carga oficial.</p>
                </div>
            </section>
        `;
    }
}

document.addEventListener('DOMContentLoaded', loadBoxscore);
