const express = require('express');
const { getViewer } = require('../utils/sessionHelper');
const { createMeetSession, getMeetSession } = require('../utils/meetStorage');

const router = express.Router();

router.post('/session', async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const session = createMeetSession(viewer);
    const baseUrl = `${req.protocol}://${req.get('host')}/meet`;
    return res.json({
      sessionId: session.id,
      link: `${baseUrl}?room=${encodeURIComponent(session.id)}`,
    });
  } catch (error) {
    console.error('Failed to create meet session', error);
    return res.status(500).json({ error: 'Unable to create meeting.' });
  }
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
  const session = getMeetSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Meeting not found.' });
  }
  return res.json({
    sessionId: session.id,
    host: {
      id: session.hostId,
      username: session.hostUsername,
    },
    youAreHost: viewer.id === session.hostId,
  });
});

module.exports = router;
