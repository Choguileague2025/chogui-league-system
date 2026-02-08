const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function setupDatabase() {
    try {
        console.log('🚀 Iniciando configuración de la base de datos...');
        
        // Leer el archivo SQL
        const sqlFile = fs.readFileSync(path.join(__dirname, 'init-db.sql'), 'utf8');
        
        // Ejecutar el SQL
        await pool.query(sqlFile);
        
        console.log('✅ Base de datos configurada correctamente');
        console.log('📊 Tablas creadas: equipos, partidos, jugadores');
        console.log('🎯 Datos de ejemplo insertados');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error configurando la base de datos:', error);
        process.exit(1);
    }
}

setupDatabase();