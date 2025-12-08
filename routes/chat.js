const express = require('express');

const { getSessionUser } = require('../utils/sessionHelper');
const { fetchChatHistory } = require('../utils/chatStorage');

const router = express.Router();

router.get('/history', async (req, res) => {
  try {
    const history = await fetchChatHistory(75);
    return res.json({ messages: history });
  } catch (error) {
    console.error('Failed to read chat history', error);
    return res.status(500).json({ error: 'Unable to load chat history.' });
  }
});

router.post('/send', async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const { message } = req.body || {};
  if (!message?.toString().trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }
  // delegate persistence to WebSocket for actual broadcasting; this endpoint serves as a fallback
  return res.status(200).json({ success: true });
});

module.exports = router;
