const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ route: 'Shop API ready' });
});

module.exports = router;
