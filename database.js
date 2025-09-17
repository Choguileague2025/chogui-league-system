const { Pool } = require('pg');
require('dotenv').config();

// Usar solo la DATABASE_URL completa
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Probar la conexión
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error conectando a PostgreSQL:', err.stack);
    } else {
        console.log('✅ Conectado a PostgreSQL correctamente');
        release();
    }
});

module.exports = pool;
