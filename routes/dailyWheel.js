const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ route: 'Daily Wheel API ready' });
});

module.exports = router;
