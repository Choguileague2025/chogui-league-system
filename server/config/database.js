const { Pool } = require('pg');
const config = require('./environment');

const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: {
        rejectUnauthorized: false
    }
});

// Verificar conexion al iniciar
pool.query('SELECT NOW()')
    .then(() => console.log('✅ Conexion a PostgreSQL establecida'))
    .catch(err => console.error('❌ Error conectando a PostgreSQL:', err.message));

module.exports = pool;
