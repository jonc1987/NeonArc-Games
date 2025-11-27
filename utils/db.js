const { Pool } = require('pg');

const pool = new Pool({
  host:
    process.env.PGHOST ||
    'dpg-d4ichdm3jp1c73a3hkt0-a.virginia-postgres.render.com',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'neonarccasinousers',
  user: process.env.PGUSER || 'admin',
  password: process.env.PGPASSWORD || '9VeBi5cj3jfxyKJoAneabu3JsYB7zmKd',
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
      paid_amount NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'pending',
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      last_updated TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT fk_cashouts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );

  await pool.query(
    `ALTER TABLE cashouts
      ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT NOW()`,
  );

  await pool.query(`UPDATE cashouts SET status = 'pending' WHERE status IS NULL`);
  await pool.query(`UPDATE cashouts SET paid_amount = COALESCE(paid_amount, 0)`);
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
  ensureDatabase,
};
