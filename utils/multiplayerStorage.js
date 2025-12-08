const { randomUUID } = require('crypto');
const { query } = require('./db');

const GAME_ALIASES = new Map([
  ['stack', 'stack'],
  ['stackjack', 'stack'],
  ['stack-jack', 'stack'],
  ['stack_jack', 'stack'],
  ['rocket', 'rocket'],
  ['rocketline', 'rocket'],
  ['multiplier', 'multiplier'],
  ['mult', 'multiplier'],
]);

function normalizeGame(name) {
  if (!name) return null;
  const key = name.toString().trim().toLowerCase();
  if (!key) return null;
  return GAME_ALIASES.get(key) || null;
}

async function createMultiplayerSession(hostId, guestId, game) {
  const normalizedGame = normalizeGame(game);
  if (!hostId || !guestId || !normalizedGame) return null;
  const id = randomUUID();
  const now = new Date().toISOString();
  const { rows } = await query(
    `INSERT INTO multiplayer_sessions (id, game, host_id, guest_id, status, created_at, updated_at, last_activity)
     VALUES ($1, $2, $3, $4, 'waiting', $5, $5, $5)
     RETURNING *`,
    [id, normalizedGame, hostId, guestId, now],
  );
  return rows[0] || null;
}

async function getMultiplayerSession(sessionId) {
  if (!sessionId) return null;
  const { rows } = await query(
    `SELECT * FROM multiplayer_sessions WHERE id = $1 LIMIT 1`,
    [sessionId],
  );
  return rows[0] || null;
}

async function touchMultiplayerSession(sessionId) {
  if (!sessionId) return null;
  const now = new Date().toISOString();
  const { rows } = await query(
    `UPDATE multiplayer_sessions
     SET last_activity = $1, updated_at = $1
     WHERE id = $2
     RETURNING *`,
    [now, sessionId],
  );
  return rows[0] || null;
}

async function setMultiplayerSessionStatus(sessionId, status) {
  if (!sessionId || !status) return null;
  const now = new Date().toISOString();
  const { rows } = await query(
    `UPDATE multiplayer_sessions
     SET status = $1, updated_at = $2
     WHERE id = $3
     RETURNING *`,
    [status, now, sessionId],
  );
  return rows[0] || null;
}

module.exports = {
  normalizeGame,
  createMultiplayerSession,
  getMultiplayerSession,
  touchMultiplayerSession,
  setMultiplayerSessionStatus,
};
