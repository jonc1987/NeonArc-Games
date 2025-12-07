const { randomUUID } = require('crypto');
const { query } = require('./db');

const SKILL_POINTS_PER_LEVEL = 50;

function calculateSkillLevel(points = 0) {
  const numeric = Number(points) || 0;
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 1;
  }
  return Math.max(1, Math.floor(numeric / SKILL_POINTS_PER_LEVEL) + 1);
}

function normalizeAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 100) / 100);
}

function mapUser(row) {
  if (!row) return null;
  const cashBalance = normalizeAmount(row.cash_balance ?? row.balance ?? 0);
  const creditBalance = normalizeAmount(row.credit_balance ?? 0);
  const skillPoints = normalizeAmount(row.skill_points ?? 0);
  const bonusCredits = normalizeAmount(row.bonus_credits ?? 0);
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password,
    balance: normalizeAmount(cashBalance + creditBalance),
    cashBalance,
    creditBalance,
    skillPoints,
    bonusCredits,
    level: calculateSkillLevel(skillPoints),
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
    `INSERT INTO users (id, username, email, password, cash_balance, credit_balance, balance, joined_at, last_activity, view_mode, dashboard_note, skill_points, bonus_credits)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'standard', '', $10, $11)`,
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
      0,
      0,
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
  const skillDelta = Number(deltas?.skillDelta || 0);
  const bonusCreditDelta = Number(deltas?.bonusCreditDelta || 0);

  if (
    !normalized ||
    !Number.isFinite(cashDelta) ||
    !Number.isFinite(creditDelta) ||
    !Number.isFinite(skillDelta) ||
    !Number.isFinite(bonusCreditDelta)
  ) {
    return null;
  }

  const { rows } = await query(
    'SELECT cash_balance, credit_balance, skill_points, bonus_credits FROM users WHERE id = $1 LIMIT 1',
    [normalized],
  );
  if (!rows[0]) return null;

  const currentCash = normalizeAmount(rows[0].cash_balance);
  const currentCredit = normalizeAmount(rows[0].credit_balance);
  const currentSkill = normalizeAmount(rows[0].skill_points);
  const currentBonus = normalizeAmount(rows[0].bonus_credits);

  const nextCashRaw = currentCash + cashDelta;
  const nextCreditRaw = currentCredit + creditDelta;
  const nextSkillRaw = currentSkill + skillDelta;
  const nextBonusRaw = currentBonus + bonusCreditDelta;

  const nextCash = allowNegative ? nextCashRaw : Math.max(0, nextCashRaw);
  const nextCredit = allowNegative ? nextCreditRaw : Math.max(0, nextCreditRaw);
  const nextSkill = allowNegative ? nextSkillRaw : Math.max(0, nextSkillRaw);
  const nextBonus = allowNegative ? nextBonusRaw : Math.max(0, nextBonusRaw);
  const totalBalance = normalizeAmount(nextCash + nextCredit);

  const { rows: updated } = await query(
    `UPDATE users SET cash_balance = $1, credit_balance = $2, balance = $3, skill_points = $4, bonus_credits = $5, last_activity = $6 WHERE id = $7 RETURNING *`,
    [
      normalizeAmount(nextCash),
      normalizeAmount(nextCredit),
      totalBalance,
      normalizeAmount(nextSkill),
      normalizeAmount(nextBonus),
      new Date().toISOString(),
      normalized,
    ],
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

async function resetUserBalanceById(id) {
  const normalized = id?.toString().trim();
  if (!normalized) return null;

  const { rows } = await query(
    `UPDATE users
      SET cash_balance = 0,
          credit_balance = 0,
          balance = 0,
          last_activity = $1
      WHERE id = $2
      RETURNING *`,
    [new Date().toISOString(), normalized],
  );

  return mapUser(rows[0]);
}

async function deleteUserById(id) {
  const normalized = id?.toString().trim();
  if (!normalized) return null;

  const { rows } = await query('DELETE FROM users WHERE id = $1 RETURNING *', [normalized]);
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

async function getFriendIds(userId) {
  const normalized = userId?.toString().trim();
  if (!normalized) return [];
  const { rows } = await query(
    `SELECT user_id, friend_id FROM friendships WHERE user_id = $1 OR friend_id = $1`,
    [normalized],
  );
  const ids = new Set();
  rows.forEach((row) => {
    if (row.user_id && row.user_id !== normalized) ids.add(row.user_id);
    if (row.friend_id && row.friend_id !== normalized) ids.add(row.friend_id);
  });
  return Array.from(ids);
}

async function getFriendCount(userId) {
  const ids = await getFriendIds(userId);
  return ids.length;
}

async function areFriends(userAId, userBId) {
  const normalizedA = userAId?.toString().trim();
  const normalizedB = userBId?.toString().trim();
  if (!normalizedA || !normalizedB) return false;
  const [left, right] = normalizedA < normalizedB ? [normalizedA, normalizedB] : [normalizedB, normalizedA];
  const { rows } = await query(
    'SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2 LIMIT 1',
    [left, right],
  );
  return rows.length > 0;
}

async function addFriendship(userAId, userBId) {
  const normalizedA = userAId?.toString().trim();
  const normalizedB = userBId?.toString().trim();
  if (!normalizedA || !normalizedB || normalizedA === normalizedB) {
    return false;
  }
  const [left, right] = normalizedA < normalizedB ? [normalizedA, normalizedB] : [normalizedB, normalizedA];
  const existing = await query(
    'SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2 LIMIT 1',
    [left, right],
  );
  if (existing.rows.length) return false;
  await query('INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2)', [left, right]);
  return true;
}

async function searchUsersByName(input, limit = 12) {
  const queryTerm = input?.toString().trim();
  if (!queryTerm) return [];
  const pattern = `%${queryTerm.toLowerCase().replace(/%/g, '')}%`;
  const { rows } = await query(
    `SELECT id, username, joined_at, skill_points, bonus_credits FROM users
     WHERE LOWER(username) LIKE $1
     ORDER BY balance DESC
     LIMIT $2`,
    [pattern, Math.max(1, Number(limit) || 12)],
  );
  return rows.map((row) => {
    const skillPoints = normalizeAmount(row.skill_points ?? 0);
    const bonusCredits = normalizeAmount(row.bonus_credits ?? 0);
    return {
      id: row.id,
      username: row.username,
      joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : null,
      skillPoints,
      bonusCredits,
      level: calculateSkillLevel(skillPoints),
    };
  });
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
  resetUserBalanceById,
  deleteUserById,
  calculateSkillLevel,
  getFriendIds,
  getFriendCount,
  areFriends,
  addFriendship,
  searchUsersByName,
};
