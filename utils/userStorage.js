const { randomUUID } = require('crypto');
const { query } = require('./db');

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password,
    balance: Number(row.balance ?? 0),
    joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : null,
    lastActivity: row.last_activity ? new Date(row.last_activity).toISOString() : null,
    viewMode: row.view_mode || 'standard',
    dashboardNote: row.dashboard_note || '',
  };
}

function mapCashout(row) {
  if (!row) return null;
  const amount = Number(row.amount || 0);
  const paidAmount = Number(row.paid_amount || 0);
  const remaining = Math.max(0, amount - paidAmount);
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    amount,
    paidAmount,
    remaining,
    status: row.status || (remaining <= 0 ? 'completed' : 'pending'),
    requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : null,
    lastUpdated: row.last_updated ? new Date(row.last_updated).toISOString() : null,
  };
}

async function getUsers() {
  const { rows } = await query('SELECT * FROM users ORDER BY username ASC');
  return rows.map(mapUser);
}

async function findUser(username) {
  const normalized = username?.toString().trim().toLowerCase();
  if (!normalized) return null;
  const { rows } = await query('SELECT * FROM users WHERE LOWER(username) = $1 LIMIT 1', [normalized]);
  return mapUser(rows[0]);
}

async function findUserById(id) {
  const normalized = id?.toString().trim();
  if (!normalized) return null;
  const { rows } = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [normalized]);
  return mapUser(rows[0]);
}

async function createUser(username, passwordHash, email, balance = 0) {
  const normalizedUsername = username?.toString().trim();
  const normalizedEmail = email?.toString().trim();

  if (!normalizedUsername || !normalizedEmail) {
    throw new Error('Username and email are required');
  }

  const id = randomUUID();
  const nowIso = new Date().toISOString();

  await query(
    `INSERT INTO users (id, username, email, password, balance, joined_at, last_activity, view_mode, dashboard_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'standard', '')`,
    [id, normalizedUsername, normalizedEmail, passwordHash, Number(balance) || 0, nowIso, nowIso],
  );

  return findUserById(id);
}

async function markUserActivity(username) {
  const normalized = username?.toString().trim().toLowerCase();
  if (!normalized) return null;
  const { rows } = await query(
    `UPDATE users SET last_activity = $1 WHERE LOWER(username) = $2 RETURNING *`,
    [new Date().toISOString(), normalized],
  );
  return mapUser(rows[0]);
}

async function updateUserBalance(username, delta, { allowNegative = false } = {}) {
  const normalized = username?.toString().trim().toLowerCase();
  if (!normalized || !Number.isFinite(Number(delta))) {
    return null;
  }

  const { rows } = await query('SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1', [normalized]);
  if (!rows[0]) return null;
  return updateUserBalanceById(rows[0].id, delta, { allowNegative });
}

async function updateUserBalanceById(id, delta, { allowNegative = false } = {}) {
  const normalized = id?.toString().trim();
  if (!normalized || !Number.isFinite(Number(delta))) {
    return null;
  }

  const { rows } = await query('SELECT balance FROM users WHERE id = $1 LIMIT 1', [normalized]);
  if (!rows[0]) return null;

  const startingBalance = Number(rows[0].balance || 0);
  const nextBalance = startingBalance + Number(delta);
  const balance = allowNegative ? nextBalance : Math.max(0, nextBalance);

  const { rows: updated } = await query(
    `UPDATE users SET balance = $1, last_activity = $2 WHERE id = $3 RETURNING *`,
    [balance, new Date().toISOString(), normalized],
  );
  return mapUser(updated[0]);
}

async function setUserDisplayPreferences(id, { viewMode, dashboardNote }) {
  const normalizedId = id?.toString().trim();
  if (!normalizedId) return null;

  const allowedModes = new Set(['standard', 'vip', 'limited']);
  const safeMode = allowedModes.has(viewMode) ? viewMode : 'standard';
  const safeNote = dashboardNote?.toString().trim().slice(0, 240) || '';

  const { rows } = await query(
    `UPDATE users SET view_mode = $1, dashboard_note = $2, last_activity = $3 WHERE id = $4 RETURNING *`,
    [safeMode, safeNote, new Date().toISOString(), normalizedId],
  );

  return mapUser(rows[0]);
}

async function getCashouts() {
  const { rows } = await query('SELECT * FROM cashouts ORDER BY requested_at DESC');
  return rows.map(mapCashout);
}

async function addCashout({ id, username, amount }) {
  const sanitizedId = id?.toString().trim();
  const sanitizedUsername = username?.toString().trim();
  const numericAmount = Number(amount);

  if (!sanitizedId || !sanitizedUsername || !Number.isFinite(numericAmount)) {
    throw new Error('Invalid cashout details');
  }

  const { rows } = await query(
    `INSERT INTO cashouts (user_id, username, amount, requested_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [sanitizedId, sanitizedUsername, numericAmount, new Date().toISOString()],
  );

  return mapCashout(rows[0]);
}

async function applyCashoutPayment(cashoutId, paymentAmount) {
  const normalizedId = cashoutId?.toString().trim();
  const amount = Number(paymentAmount);

  if (!normalizedId || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const { rows: existingRows } = await query('SELECT * FROM cashouts WHERE id = $1 LIMIT 1', [normalizedId]);
  const existing = existingRows[0];
  if (!existing) return null;

  const totalRequested = Number(existing.amount || 0);
  const alreadyPaid = Number(existing.paid_amount || 0);
  const nextPaid = Math.min(totalRequested, alreadyPaid + amount);
  const status = nextPaid >= totalRequested ? 'completed' : 'pending';

  const { rows } = await query(
    `UPDATE cashouts
      SET paid_amount = $1, status = $2, last_updated = $3
      WHERE id = $4
      RETURNING *`,
    [nextPaid, status, new Date().toISOString(), normalizedId],
  );

  return mapCashout(rows[0]);
}

module.exports = {
  getUsers,
  findUser,
  findUserById,
  createUser,
  updateUserBalance,
  updateUserBalanceById,
  getCashouts,
  addCashout,
  applyCashoutPayment,
  markUserActivity,
  setUserDisplayPreferences,
};
