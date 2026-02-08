// Espera a que todo el contenido de la página se cargue
document.addEventListener('DOMContentLoaded', () => {

    // Seleccionamos todos los botones de las pestañas y todos los paneles de contenido
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Añadimos un "escuchador" de clics a cada botón de pestaña
    tabLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            // Prevenimos el comportamiento por defecto del enlace (que no salte la página)
            event.preventDefault();

            // 1. Quitar la clase 'active' de todas las pestañas y paneles
            tabLinks.forEach(l => l.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            // 2. Añadir la clase 'active' solo al botón que se hizo clic
            link.classList.add('active');

            // 3. Mostrar el panel de contenido correspondiente
            // Obtenemos el target del href (ej: '#roster')
            const targetId = link.getAttribute('href'); 
            const targetPane = document.querySelector(targetId);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });
});
