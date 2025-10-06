// ================= GESTIÓN DE TORNEOS =================

// Cargar torneos al hacer clic en la pestaña
document.querySelector('a[href="#gestion-torneos"]').addEventListener('click', cargarTorneos);

async function cargarTorneos() {
    try {
        const torneos = await fetchJSON('/api/torneos');
        const tbody = document.getElementById('torneosTbody');
        if (!tbody) return;

        tbody.innerHTML = torneos.map(t => `
            <tr>
                <td><strong>${t.nombre}</strong></td>
                <td>${t.total_juegos || 'N/A'}</td>
                <td>${t.cupos_playoffs || 'N/A'}</td>
                <td>
                    ${t.activo 
                        ? '<span style="color: var(--success-color); font-weight: bold;">● Activo</span>' 
                        : '<span style="opacity: 0.7;">○ Inactivo</span>'}
                </td>
                <td class="actions">
                    <button class="btn btn-secondary" onclick="abrirModalEditarTorneo(${t.id})">✏️ Editar</button>
                    ${!t.activo ? `<button class="btn btn-primary" onclick="activarTorneo(${t.id})">Activar</button>` : ''}
                    <button class="btn btn-danger" onclick="eliminarTorneo(${t.id})">🗑️</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error("Error cargando torneos:", error);
        document.getElementById('torneosTbody').innerHTML = '<tr><td colspan="5">Error al cargar los torneos.</td></tr>';
    }
}

function abrirModalCrearTorneo() {
    document.getElementById('torneoForm').reset();
    document.getElementById('torneoId').value = '';
    document.getElementById('torneoModalTitle').innerText = 'Crear Nuevo Torneo';
    document.getElementById('editTorneoModal').style.display = 'block';
}

async function abrirModalEditarTorneo(id) {
    try {
        const torneo = await fetchJSON(`/api/torneos/${id}`); // Necesitarás un endpoint GET /api/torneos/:id
        
        document.getElementById('torneoId').value = torneo.id;
        document.getElementById('torneoNombre').value = torneo.nombre;
        document.getElementById('totalJuegos').value = torneo.total_juegos || '';
        document.getElementById('cuposPlayoffs').value = torneo.cupos_playoffs || '';
        
        document.getElementById('torneoModalTitle').innerText = 'Editar Torneo';
        document.getElementById('editTorneoModal').style.display = 'block';
    } catch (error) {
        mostrarAlerta('No se pudieron cargar los datos del torneo.', 'danger');
    }
}

function cerrarModalTorneo() {
    document.getElementById('editTorneoModal').style.display = 'none';
}

document.getElementById('torneoForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const id = document.getElementById('torneoId').value;
    const data = {
        nombre: document.getElementById('torneoNombre').value,
        total_juegos: document.getElementById('totalJuegos').value,
        cupos_playoffs: document.getElementById('cuposPlayoffs').value
    };

    const endpoint = id ? `/api/torneos/${id}` : '/api/torneos';
    const method = id ? 'PUT' : 'POST';

    try {
        await fetchJSON(endpoint, { method, body: JSON.stringify(data) });
        mostrarAlerta(`Torneo ${id ? 'actualizado' : 'creado'} con éxito.`);
        cerrarModalTorneo();
        cargarTorneos();
    } catch (err) {
        // La alerta de error ya es manejada por fetchJSON
    }
});

async function activarTorneo(id) {
    if (!confirm('¿Activar este torneo? Todos los demás se desactivarán.')) return;
    try {
        await fetchJSON(`/api/torneos/${id}/activar`, { method: 'PUT' });
        mostrarAlerta('Torneo activado con éxito.');
        cargarTorneos();
    } catch (err) {}
}

async function eliminarTorneo(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este torneo? Esta acción no se puede deshacer.')) return;
    try {
        await fetchJSON(`/api/torneos/${id}`, { method: 'DELETE' });
        mostrarAlerta('Torneo eliminado con éxito.');
        cargarTorneos();
    } catch (err) {}
}
