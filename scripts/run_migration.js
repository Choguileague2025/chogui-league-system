require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no esta definida');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runFile(client, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  console.log(`\n==> Ejecutando ${fileName}`);
  await client.query(sql);
  console.log(`OK  ${fileName}`);
}

async function run() {
  const migrationsDir = path.join(process.cwd(), 'migrations');
  let files = fs.readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .filter(name => !name.toLowerCase().includes('rollback'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const singleMigration = process.env.MIGRATION_FILE;
  if (singleMigration) {
    files = files.filter((name) => name === singleMigration);
    if (!files.length) {
      throw new Error(`No se encontro la migracion solicitada: ${singleMigration}`);
    }
  }

  if (!files.length) {
    console.log('No hay migraciones para ejecutar.');
    return;
  }

  console.log(`Se ejecutaran ${files.length} migraciones en orden:`);
  files.forEach(file => console.log(`- ${file}`));

  const client = await pool.connect();
  try {
    for (const file of files) {
      await runFile(client, path.join(migrationsDir, file));
    }
  } finally {
    client.release();
  }

  console.log('\nMigraciones completadas.');
}

run()
  .catch(async (err) => {
    console.error('\nMigration failed:', err.message);
    try {
      await pool.end();
    } catch (_) {
      // noop
    }
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
