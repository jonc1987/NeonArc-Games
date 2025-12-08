const express = require('express');

const { findUser, areFriends, findUserById } = require('../utils/userStorage');
const {
  normalizeGame,
  createMultiplayerSession,
  getMultiplayerSession,
  touchMultiplayerSession,
  setMultiplayerSessionStatus,
} = require('../utils/multiplayerStorage');
const { getViewer } = require('../utils/sessionHelper');

const router = express.Router();

const FRIENDLY_GAME_LABELS = {
  stack: 'StackJack',
  rocket: 'Rocket Line',
  multiplier: 'Multiplier',
};

router.post('/session', async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const targetUsername = req.body?.username?.toString().trim();
  const requestedGame = req.body?.game?.toString().trim();
  const normalizedGame = normalizeGame(requestedGame);
  if (!targetUsername || !normalizedGame) {
    return res.status(400).json({ error: 'Friend username and game are required.' });
  }
  const targetUser = await findUser(targetUsername);
  if (!targetUser) {
    return res.status(404).json({ error: 'Pilot not found.' });
  }
  if (targetUser.id === viewer.id) {
    return res.status(400).json({ error: 'You cannot invite yourself.' });
  }
  if (!(await areFriends(viewer.id, targetUser.id))) {
    return res.status(403).json({ error: 'You can only invite friends.' });
  }
  try {
    const session = await createMultiplayerSession(viewer.id, targetUser.id, normalizedGame);
    if (!session) {
      throw new Error('Session failed to create.');
    }
    const baseUrl = `${req.protocol}://${req.get('host')}/app`;
    const params = new URLSearchParams({
      friend: targetUser.username,
      game: normalizedGame,
      session: session.id,
    });
    return res.json({
      sessionId: session.id,
      link: `${baseUrl}?${params.toString()}`,
      invited: {
        id: targetUser.id,
        username: targetUser.username,
      },
      label: FRIENDLY_GAME_LABELS[normalizedGame] || normalizedGame,
      game: normalizedGame,
    });
  } catch (error) {
    console.error('Failed to create multiplayer session', error);
    return res.status(500).json({ error: 'Unable to create multiplayer session.' });
  }
});

router.post('/session/:id/join', async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const sessionId = req.params?.id?.toString().trim();
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required.' });
  }
  const existingSession = await getMultiplayerSession(sessionId);
  if (!existingSession) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  if (viewer.id !== existingSession.host_id && viewer.id !== existingSession.guest_id) {
    return res.status(403).json({ error: 'You are not part of that session.' });
  }
  await touchMultiplayerSession(sessionId);
  const updatedSession = await setMultiplayerSessionStatus(
    sessionId,
    existingSession.status === 'waiting' ? 'active' : existingSession.status,
  );
  const role = viewer.id === existingSession.host_id ? 'host' : 'guest';
  const partnerId = role === 'host' ? existingSession.guest_id : existingSession.host_id;
  const partner = await findUserById(partnerId);
  return res.json({
    session: updatedSession,
    role,
    game: updatedSession?.game,
    partner: partner
      ? {
          id: partner.id,
          username: partner.username,
        }
      : null,
  });
});

router.get('/session/:id', async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const sessionId = req.params?.id?.toString().trim();
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required.' });
  }
  const session = await getMultiplayerSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  if (viewer.id !== session.host_id && viewer.id !== session.guest_id) {
    return res.status(403).json({ error: 'You are not part of that session.' });
  }
  return res.json({ session });
});

module.exports = router;
