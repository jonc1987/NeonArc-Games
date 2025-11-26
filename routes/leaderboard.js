const express = require('express');

const { getUsers } = require('../utils/userStorage');

const router = express.Router();

router.get('/', async (_req, res) => {
  const users = await getUsers();
  const leaderboard = users
    .map((user) => ({
      username: user.username,
      balance: Number(user.balance || 0),
      joinedAt: user.joinedAt,
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 15)
    .map((entry, index) => ({
      rank: index + 1,
      player: entry.username,
      balance: entry.balance,
      joinedAt: entry.joinedAt,
    }));

  return res.json({ leaderboard, totalPlayers: users.length });
});

module.exports = router;
