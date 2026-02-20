require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const sql = fs.readFileSync('migrations/002_performance_indexes.sql', 'utf8');
  const lines = sql.split('\n');

  // Build individual statements
  let current = '';
  const statements = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || trimmed === '') continue;
    current += ' ' + trimmed;
    if (trimmed.endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }

  for (const stmt of statements) {
    try {
      const result = await pool.query(stmt);
      if (result.rows && result.rows.length > 0) {
        console.log('=== INDICES EXISTENTES ===');
        result.rows.forEach(r => console.log('  ' + r.tablename + ' -> ' + r.indexname));
      } else {
        const preview = stmt.substring(0, 70).replace(/\s+/g, ' ');
        console.log('OK: ' + preview + '...');
      }
    } catch (err) {
      console.log('WARN: ' + err.message.substring(0, 120));
    }
  }

  await pool.end();
  console.log('\nMigration complete!');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
