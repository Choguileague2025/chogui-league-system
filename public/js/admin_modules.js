// ============================================
// ADMIN MODULES - Phase 3.3
// SSE integration, tournament display,
// form validation, notifications for admin.html
// ============================================

// ============================================
// MODULE: ADMIN TOURNAMENT DISPLAY
// ============================================
const AdminTournamentModule = {
    async init() {
        const select = document.getElementById('adminTournamentDisplay');
        if (!select) return;
        try {
            const response = await fetch('/api/torneos');
            if (!response.ok) throw new Error('No se pudieron cargar torneos');
            const torneos = await response.json();
            const saved = sessionStorage.getItem('adminTorneoId');
            const current = torneos.find(t => String(t.id) === saved) || torneos.find(t => t.activo) || torneos[0];
            select.replaceChildren(new Option('Selecciona un torneo', ''));
            torneos.forEach(t => select.add(new Option(`${t.nombre} · ${t.estado || 'preparacion'}`, t.id)));
            if (current) { select.value = current.id; sessionStorage.setItem('adminTorneoId', current.id); }
            select.onchange = async () => {
                if (!select.value) return;
                sessionStorage.setItem('adminTorneoId', select.value);
                // Recargar descarta formularios de la edición previa y evita guardar su contenido en otra.
                window.location.reload();
            };
        } catch (err) { console.warn(err); }
    }
};

// ============================================
// MODULE: SSE FOR ADMIN
// ============================================
const AdminSSEModule = {
    connection: null,

    init() {
        if (typeof EventSource === 'undefined') return;

        const dot = document.getElementById('adminSseDot');

        try {
            this.connection = new EventSource('/api/sse/updates');

            this.connection.addEventListener('stats-update', (e) => {
                console.log('[SSE Admin] Stats update');
                try {
                    const data = JSON.parse(e.data);
                    AdminNotification.show(`Estadísticas actualizadas: ${data.tipo || 'general'}`, 'info');
                } catch {
                    AdminNotification.show('Estadísticas actualizadas', 'info');
                }
                // Reload relevant data
                if (typeof cargarEstadisticas === 'function') cargarEstadisticas();
                if (typeof actualizarLideres === 'function') actualizarLideres();
            });

            this.connection.addEventListener('tournament-change', (e) => {
                console.log('[SSE Admin] Tournament change');
                AdminNotification.show('Torneo actualizado', 'warning');
                if (typeof cargarTorneoActivo === 'function') cargarTorneoActivo();
                if (typeof cargarTorneos === 'function') cargarTorneos();
                AdminTournamentModule.init();
            });

            this.connection.addEventListener('general-update', (e) => {
                console.log('[SSE Admin] General update');
                if (typeof cargarTodosLosDatos === 'function') cargarTodosLosDatos();
            });

            this.connection.onopen = () => {
                if (dot) dot.classList.remove('disconnected');
            };

            this.connection.onerror = () => {
                if (dot) dot.classList.add('disconnected');
            };

            console.log('[SSE Admin] Conectado');
        } catch (e) {
            console.warn('[SSE Admin] Error:', e);
            if (dot) dot.classList.add('disconnected');
        }
    },

    destroy() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
    }
};

window.addEventListener('beforeunload', () => {
    AdminSSEModule.destroy();
});

// ============================================
// MODULE: NOTIFICATION (standalone for admin)
// ============================================
const AdminNotification = {
    show(message, type = 'info') {
        // Use existing toast if available
        if (typeof toast !== 'undefined' && toast.show) {
            toast.show(message, type);
            return;
        }

        // Fallback to custom notification
        const notification = document.createElement('div');
        notification.className = `notification-toast ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

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
// MODULE: FORM VALIDATION
// ============================================
const FormValidation = {
    validateStats(formData) {
        const errors = [];

        if (!formData.jugador_id) {
            errors.push('Debe seleccionar un jugador');
        }

        // Check for negative values in numeric fields
        const numericFields = ['at_bats', 'hits', 'doubles', 'triples', 'home_runs',
            'rbi', 'runs', 'walks', 'strikeouts', 'stolen_bases',
            'innings_pitched', 'earned_runs', 'hits_allowed',
            'putouts', 'assists', 'errors_field'];

        numericFields.forEach(field => {
            if (formData[field] !== undefined && formData[field] < 0) {
                errors.push(`${field.replace(/_/g, ' ')} no puede ser negativo`);
            }
        });

        // Hits can't exceed at bats
        if (formData.hits !== undefined && formData.at_bats !== undefined) {
            if (formData.hits > formData.at_bats) {
                errors.push('Los hits no pueden ser mayores que los turnos al bate');
            }
        }

        // Doubles + triples + HR can't exceed total hits
        if (formData.hits !== undefined) {
            const extraBaseHits = (formData.doubles || 0) + (formData.triples || 0) + (formData.home_runs || 0);
            if (extraBaseHits > formData.hits) {
                errors.push('Los extra-base hits no pueden exceder los hits totales');
            }
        }

        return errors;
    },

    showErrors(errors, containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            // Fallback: show as toast
            errors.forEach(err => AdminNotification.show(err, 'error'));
            return;
        }

        container.innerHTML = errors.map(e => `<div class="validation-error visible">${e}</div>`).join('');
    },

    clearErrors(containerId) {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
    }
};

// Make validation globally available
window.FormValidation = FormValidation;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Admin Modules] Inicializando...');

    // Init tournament display
    await AdminTournamentModule.init();

    // Init SSE
    AdminSSEModule.init();

    console.log('[Admin Modules] Inicializados correctamente');
});

console.log('✅ admin_modules.js cargado');
