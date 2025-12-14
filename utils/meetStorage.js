const { randomUUID } = require('crypto');

const meetSessions = new Map();

function createMeetSession(host) {
  const id = randomUUID();
  const session = {
    id,
    hostId: host.id,
    hostUsername: host.username,
    createdAt: new Date().toISOString(),
    clients: new Set(),
  };
  meetSessions.set(id, session);
  return session;
}

function getMeetSession(sessionId) {
  if (!sessionId) return null;
  return meetSessions.get(sessionId) || null;
}

function removeMeetSession(sessionId) {
  if (!sessionId) return;
  meetSessions.delete(sessionId);
}

module.exports = {
  createMeetSession,
  getMeetSession,
  removeMeetSession,
};
