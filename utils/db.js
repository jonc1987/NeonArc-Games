const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'neonarc',
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function ensureDatabase() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      balance NUMERIC DEFAULT 0,
      joined_at TIMESTAMPTZ NOT NULL,
      last_activity TIMESTAMPTZ NOT NULL,
      view_mode TEXT DEFAULT 'standard',
      dashboard_note TEXT DEFAULT ''
    )`,
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS cashouts (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT fk_cashouts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
  ensureDatabase,
};
