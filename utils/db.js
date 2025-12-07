const { Pool } = require('pg');

const host = process.env.PGHOST?.toString().trim() || 'localhost';
const port = Number(process.env.PGPORT) || 5432;
const database = process.env.PGDATABASE || 'neonarcgamesusers';
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || '';

const localHosts = ['localhost', '127.0.0.1'];
const ssl =
  process.env.PGSSLMODE === 'disable' || localHosts.includes(host)
    ? false
    : { rejectUnauthorized: false };

const pool = new Pool({
  host,
  port,
  database,
  user,
  password,
  ssl,
});

async function ensureDatabase() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      cash_balance NUMERIC DEFAULT 0,
      credit_balance NUMERIC DEFAULT 0,
      balance NUMERIC DEFAULT 0,
      joined_at TIMESTAMPTZ NOT NULL,
      last_activity TIMESTAMPTZ NOT NULL,
      view_mode TEXT DEFAULT 'standard',
      dashboard_note TEXT DEFAULT '',
      skill_points NUMERIC DEFAULT 0,
      bonus_credits NUMERIC DEFAULT 0
    )`,
  );

  await pool.query(
    `ALTER TABLE users
      ADD COLUMN IF NOT EXISTS cash_balance NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS credit_balance NUMERIC DEFAULT 0`,
  );

  await pool.query(
    `ALTER TABLE users
      ADD COLUMN IF NOT EXISTS skill_points NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS bonus_credits NUMERIC DEFAULT 0`,
  );

  await pool.query(
    `UPDATE users
      SET cash_balance = COALESCE(cash_balance, balance, 0),
          credit_balance = COALESCE(credit_balance, 0)
      WHERE cash_balance IS NULL OR credit_balance IS NULL`,
  );

  await pool.query(
    `UPDATE users
      SET balance = COALESCE(cash_balance, 0) + COALESCE(credit_balance, 0)
      WHERE balance IS NULL OR balance <> COALESCE(cash_balance, 0) + COALESCE(credit_balance, 0)`,
  );
  await pool.query(
    `UPDATE users
      SET skill_points = COALESCE(skill_points, 0),
          bonus_credits = COALESCE(bonus_credits, 0)
      WHERE skill_points IS NULL OR bonus_credits IS NULL`,
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

  await pool.query(
    `CREATE TABLE IF NOT EXISTS email_campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      subject TEXT NOT NULL,
      html_content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      sent_count INT DEFAULT 0,
      is_active BOOLEAN DEFAULT true
    )`,
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT fk_friend_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_friend_target FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT unique_friend_pair UNIQUE (user_id, friend_id)
    )`,
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
