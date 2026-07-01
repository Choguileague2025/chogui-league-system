const pool = require('../config/database');

const columnCache = new Map();
const tableCache = new Map();

async function hasColumn(tableName, columnName) {
    const cacheKey = `${tableName}.${columnName}`;
    if (columnCache.has(cacheKey)) {
        return columnCache.get(cacheKey);
    }

    const result = await pool.query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
    `, [tableName, columnName]);

    const exists = result.rows.length > 0;
    columnCache.set(cacheKey, exists);
    return exists;
}

async function hasTable(tableName) {
    if (tableCache.has(tableName)) {
        return tableCache.get(tableName);
    }

    const result = await pool.query(`
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
        LIMIT 1
    `, [tableName]);

    const exists = result.rows.length > 0;
    tableCache.set(tableName, exists);
    return exists;
}

module.exports = {
    hasColumn,
    hasTable
};
