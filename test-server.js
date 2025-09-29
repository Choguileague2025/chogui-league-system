const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000; // Usamos el mismo puerto

// Esta es la ÚNICA línea importante. Le decimos que sirva la carpeta 'public'.
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log('✅ Servidor de PRUEBA corriendo en el puerto 3000.');
    console.log('   Visita: http://localhost:3000/equipo.html?id=15');
});