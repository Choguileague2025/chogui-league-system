document.addEventListener('DOMContentLoaded', () => {
    // Usar la función de utils.js
    const playerId = getIdFromUrl('id');

    if (!playerId || isNaN(playerId)) {
        // Usar la función de utils.js para mostrar el error
        showAppError('.container', "ID de jugador inválido o no encontrado en la URL.");
        return;
    }

    loadPlayerData(playerId);
});


async function loadPlayerData(id) {
    try {
        const [player, statsOfensivas, statsPitcheo, statsDefensivas] = await Promise.all([
            fetch(`/api/jugadores/${id}`).then(res => {
                if (!res.ok) throw new Error(`Jugador no encontrado (status: ${res.status})`);
                return res.json();
            }),
            fetch(`/api/estadisticas-ofensivas?jugador_id=${id}`).then(res => res.json()),
            fetch(`/api/estadisticas-pitcheo?jugador_id=${id}`).then(res => res.json()),
            fetch(`/api/estadisticas-defensivas?jugador_id=${id}`).then(res => res.json())
        ]);

        renderPlayerInfo(player);
        renderStats(statsOfensivas, 'statsBateoContainer', 'bateo');
        renderStats(statsPitcheo, 'statsPitcheoContainer', 'pitcheo');
        renderStats(statsDefensivas, 'statsDefensaContainer', 'defensa');

    } catch (error) {
        console.error("Error al cargar los datos del jugador:", error);
        showAppError('.container', `No se pudieron cargar los datos del jugador. ${error.message}`);
    }
}

function renderPlayerInfo(player) {
    if (!player) {
        showAppError('.container', "No se encontró la información principal del jugador.");
        return;
    }

    document.title = `${player.nombre} - Perfil - Chogui League`;
    document.getElementById('playerName').textContent = player.nombre;
    document.getElementById('playerNumber').textContent = player.numero || '#';
    document.getElementById('playerPosition').textContent = player.posicion || 'Utility';
    
    // Breadcrumbs
    const teamBreadcrumb = document.getElementById('teamBreadcrumbLink');
    if (player.equipo_nombre && player.equipo_id) {
        teamBreadcrumb.innerHTML = `<a href="equipo.html?id=${player.equipo_id}">${player.equipo_nombre}</a>`;
    } else {
        teamBreadcrumb.textContent = "Sin Equipo";
    }
    document.getElementById('playerBreadcrumb').textContent = player.nombre;

    // Botón de volver al equipo
    const backButton = document.getElementById('backToTeamButton');
    if (player.equipo_id) {
        backButton.href = `equipo.html?id=${player.equipo_id}`;
    } else {
        backButton.style.display = 'none';
    }

    // Logo del Equipo (usando utils.js)
    const logoUrl = getTeamLogo(player.equipo_nombre);
    displayTeamLogo('#teamLogo', logoUrl, player.equipo_nombre);
}

function renderStats(stats, containerId, type) {
    const container = document.getElementById(containerId);
    if (!stats || stats.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay estadísticas disponibles.</div>';
        return;
    }

    const stat = stats[0]; // Asumimos que la API devuelve un array con un solo objeto
    let html = '';

    const statMapping = {
        bateo: [
            { label: 'AVG', value: (stat.at_bats > 0 ? (stat.hits / stat.at_bats) : 0).toFixed(3) },
            { label: 'HR', value: stat.home_runs || 0 },
            { label: 'RBI', value: stat.rbi || 0 },
            { label: 'OPS', value: ((stat.at_bats > 0 ? (stat.hits / stat.at_bats) : 0) + (stat.at_bats > 0 ? ((stat.hits + (stat.home_runs || 0) * 3) / stat.at_bats) : 0)).toFixed(3) },
            { label: 'At-Bats (AB)', value: stat.at_bats || 0 },
            { label: 'Hits (H)', value: stat.hits || 0 },
            { label: 'Carreras (R)', value: stat.runs || 0 },
            { label: 'Bases Robadas (SB)', value: stat.stolen_bases || 0 },
            { label: 'Bases por Bolas (BB)', value: stat.walks || 0 },
        ],
        pitcheo: [
            { label: 'ERA', value: (stat.innings_pitched > 0 ? (stat.earned_runs * 9) / stat.innings_pitched : 0).toFixed(2) },
            { label: 'Victorias (W)', value: stat.wins || 0 },
            { label: 'Derrotas (L)', value: stat.losses || 0 },
            { label: 'Ponches (SO)', value: stat.strikeouts || 0 },
            { label: 'Innings (IP)', value: stat.innings_pitched || 0 },
            { label: 'Salvados (SV)', value: stat.saves || 0 },
            { label: 'Hits Permitidos (H)', value: stat.hits_allowed || 0 },
            { label: 'BB Permitidas (BB)', value: stat.walks_allowed || 0 },
        ],
        defensa: [
            { label: 'Fielding % (FLD)', value: ((stat.putouts + stat.assists) / (stat.putouts + stat.assists + stat.errors || 1)).toFixed(3) },
            { label: 'Putouts (PO)', value: stat.putouts || 0 },
            { label: 'Asistencias (A)', value: stat.assists || 0 },
            { label: 'Errores (E)', value: stat.errors || 0 },
            { label: 'Double Plays (DP)', value: stat.double_plays || 0 },
            { label: 'Passed Balls (PB)', value: stat.passed_balls || 0, note: 'Solo Catchers' },
        ]
    };
    
    html = statMapping[type].map(s => `
        <div class="stat-item-full">
            <span class="stat-label-full">${s.label} ${s.note ? `<small>(${s.note})</small>` : ''}</span>
            <span class="stat-value-full">${s.value}</span>
        </div>
    `).join('');

    container.innerHTML = html;
}
