const { randomUUID } = require('crypto');
const { query } = require('./db');

function normalizeAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 100) / 100);
}

function mapUser(row) {
  if (!row) return null;
  const cashBalance = normalizeAmount(row.cash_balance ?? row.balance ?? 0);
  const creditBalance = normalizeAmount(row.credit_balance ?? 0);
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password,
    balance: normalizeAmount(cashBalance + creditBalance),
    cashBalance,
    creditBalance,
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
  const startingCash = normalizeAmount(balance);
  const startingCredit = 0;
  const totalBalance = normalizeAmount(startingCash + startingCredit);

  await query(
    `INSERT INTO users (id, username, email, password, cash_balance, credit_balance, balance, joined_at, last_activity, view_mode, dashboard_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'standard', '')`,
    [
      id,
      normalizedUsername,
      normalizedEmail,
      passwordHash,
      startingCash,
      startingCredit,
      totalBalance,
      nowIso,
      nowIso,
    ],
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

async function updateUserWallet(username, deltas, { allowNegative = false } = {}) {
  const normalized = username?.toString().trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const { rows } = await query('SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1', [normalized]);
  if (!rows[0]) return null;
  return updateUserWalletById(rows[0].id, deltas, { allowNegative });
}

async function updateUserWalletById(id, deltas, { allowNegative = false } = {}) {
  const normalized = id?.toString().trim();
  const cashDelta = Number(deltas?.cashDelta || 0);
  const creditDelta = Number(deltas?.creditDelta || 0);

  if (!normalized || !Number.isFinite(cashDelta) || !Number.isFinite(creditDelta)) {
    return null;
  }

  const { rows } = await query('SELECT cash_balance, credit_balance FROM users WHERE id = $1 LIMIT 1', [normalized]);
  if (!rows[0]) return null;

  const currentCash = normalizeAmount(rows[0].cash_balance);
  const currentCredit = normalizeAmount(rows[0].credit_balance);

  const nextCashRaw = currentCash + cashDelta;
  const nextCreditRaw = currentCredit + creditDelta;

  const nextCash = allowNegative ? nextCashRaw : Math.max(0, nextCashRaw);
  const nextCredit = allowNegative ? nextCreditRaw : Math.max(0, nextCreditRaw);
  const totalBalance = normalizeAmount(nextCash + nextCredit);

  const { rows: updated } = await query(
    `UPDATE users SET cash_balance = $1, credit_balance = $2, balance = $3, last_activity = $4 WHERE id = $5 RETURNING *`,
    [normalizeAmount(nextCash), normalizeAmount(nextCredit), totalBalance, new Date().toISOString(), normalized],
  );
  return mapUser(updated[0]);
}

async function updateUserBalance(username, delta, { allowNegative = false } = {}) {
  return updateUserWallet(username, { cashDelta: delta }, { allowNegative });
}

async function updateUserBalanceById(id, delta, { allowNegative = false } = {}) {
  return updateUserWalletById(id, { cashDelta: delta }, { allowNegative });
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
  updateUserWallet,
  updateUserWalletById,
  getCashouts,
  addCashout,
  applyCashoutPayment,
  markUserActivity,
  setUserDisplayPreferences,
};
