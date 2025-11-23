const express = require('express');

const { findUser } = require('../utils/userStorage');

const router = express.Router();

router.get('/', (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const user = findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const { password, ...publicUser } = user;
  return res.json({ user: publicUser });
});

module.exports = router;
