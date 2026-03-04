import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';
import '../config/env';

const MIGRATIONS_DIR = __dirname;

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

async function getExecutedMigrations(): Promise<Set<string>> {
  const result = await pool.query('SELECT name FROM _migrations ORDER BY name');
  return new Set(result.rows.map((row) => row.name));
}

async function run(): Promise<void> {
  try {
    await ensureMigrationsTable();
    const executed = await getExecutedMigrations();

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found');
      return;
    }

    let applied = 0;

    for (const file of files) {
      if (executed.has(file)) {
        console.log(`Skipping: ${file} (already executed)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Executed: ${file}`);
        applied++;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Failed: ${file}`, error);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`\nMigrations complete. Applied: ${applied}, Skipped: ${files.length - applied}`);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
