const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ route: 'Leaderboard API ready' });
});

module.exports = router;
