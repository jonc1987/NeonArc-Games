const { query } = require('./db');

function mapChatMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    message: row.message,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

async function fetchChatHistory(limit = 50) {
  const { rows } = await query(
    `SELECT id, user_id, username, message, created_at
     FROM chat_messages
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(5, Number(limit) || 50)],
  );
  return rows.map(mapChatMessage).reverse();
}

async function addChatMessage({ userId, username, message }) {
  if (!username || !message) return null;
  const sanitized = message.toString().trim();
  if (!sanitized) return null;

  const { rows } = await query(
    `INSERT INTO chat_messages (user_id, username, message, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING *`,
    [userId || null, username, sanitized],
  );
  return mapChatMessage(rows[0]);
}

module.exports = {
  fetchChatHistory,
  addChatMessage,
};
