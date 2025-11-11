// ===================================
// UTILS.JS - Funciones Compartidas
// ===================================

/**
 * Obtiene un parámetro de la URL por su nombre.
 * @param {string} name - El nombre del parámetro (ej. 'id').
 * @returns {string|null} - El valor del parámetro o null si no se encuentra.
 */
function getIdFromUrl(name = 'id') {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

/**
 * Devuelve la ruta del logo de un equipo con un fallback a un logo por defecto.
 * @param {string} equipoNombre - El nombre del equipo.
 * @returns {string} - La ruta completa de la imagen del logo.
 */
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
        'dragones fc': 'dragones-fc.png'
    };
    
    const nombreNormalizado = equipoNombre.toLowerCase().trim();
    const logoFile = logoMap[nombreNormalizado];
    
    if (logoFile) {
        return `/public/images/logos/${logoFile}`;
    }
    
    // Fallback genérico si no está en el mapa
    const nombreArchivo = nombreNormalizado
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') + '.png';
    
    return `/public/images/logos/${nombreArchivo}`;
}


/**
 * Muestra un logo de equipo en un contenedor, con fallback a iniciales si la imagen falla.
 * @param {string} containerSelector - Selector CSS del contenedor del logo.
 * @param {string} logoUrl - La URL de la imagen del logo.
 * @param {string} teamName - El nombre del equipo para generar iniciales.
 */
function displayTeamLogo(containerSelector, logoUrl, teamName) {
    const logoContainer = document.querySelector(containerSelector);
    if (!logoContainer) return;

    const img = new Image();

    img.onload = function() {
        logoContainer.style.backgroundImage = `url('${logoUrl}')`;
        logoContainer.innerHTML = ''; // Limpiar iniciales si existían
    };

    img.onerror = function() {
        console.warn(`Logo no encontrado en ${logoUrl}, usando iniciales para ${teamName}`);
        
        const iniciales = generateInitials(teamName);

        logoContainer.style.backgroundImage = 'none';
        logoContainer.innerHTML = `<div class="logo-initials">${iniciales}</div>`;
    };

    img.src = logoUrl;
}

/**
 * Genera iniciales a partir de un nombre de equipo.
 * @param {string} teamName - El nombre del equipo.
 * @returns {string} - Las iniciales generadas.
 */
function generateInitials(teamName) {
    if (!teamName) return '?';
    
    const words = teamName.trim().split(/\s+/);
    
    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    } else {
        return words
            .slice(0, 3) // Max 3 iniciales
            .map(p => p.charAt(0).toUpperCase())
            .join('');
    }
}


/**
 * Muestra un mensaje de error en un contenedor principal de la página.
 * @param {string} mainContainerSelector - Selector CSS del contenedor principal a reemplazar.
 * @param {string} message - El mensaje de error a mostrar.
 */
function showAppError(mainContainerSelector, message) {
    const mainContainer = document.querySelector(mainContainerSelector);
    if (!mainContainer) {
        console.error(`Contenedor de error no encontrado: ${mainContainerSelector}`);
        alert(`Error: ${message}`); // Fallback
        return;
    }
    
    mainContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px 20px; background: var(--error-bg); border-color: var(--error);">
            <div style="font-size: 3rem; margin-bottom: 15px;">⚠️</div>
            <h2 style="color: var(--error); margin-bottom: 20px;">Error del Sistema</h2>
            <p style="color: var(--text-light); margin-bottom: 30px; max-width: 500px; margin-left: auto; margin-right: auto;">${message}</p>
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button onclick="location.reload()" class="btn-primary">🔄 Reintentar</button>
                <a href="index.html" class="btn-secondary">🏠 Volver al Inicio</a>
            </div>
        </div>
    `;
    
    // Ocultar otras secciones para que el error sea lo único visible
    document.querySelectorAll('.content-grid, .stats-grid, .recent-games, .action-buttons').forEach(el => {
        if(el) el.style.display = 'none';
    });
}
