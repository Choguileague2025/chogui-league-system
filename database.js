const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:iCqDRgHKxniwqzglLutzglRFaYnNIcAq@switchback.proxy.rlwy.net:51496/railway',
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = pool;
