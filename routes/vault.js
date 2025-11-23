const express = require('express');

const { readJson, writeJson } = require('../utils/dataStorage');
const { findUser } = require('../utils/userStorage');

const router = express.Router();

const VAULT_FILE = 'vault.json';

function bootstrapVault(username) {
  const data = readJson(VAULT_FILE, { ledgers: {} });
  if (!data.ledgers[username]) {
    data.ledgers[username] = {
      credits: 12450,
      withdrawalQueue: 3,
      history: [
        { type: 'deposit', amount: 5000, description: 'Starter vault seed', timestamp: new Date().toISOString() },
        { type: 'transfer', amount: 2500, description: 'Game winnings moved to vault', timestamp: new Date().toISOString() },
        { type: 'withdrawal', amount: 750, description: 'Queued cash out to wallet', timestamp: new Date().toISOString() },
      ],
    };
    writeJson(VAULT_FILE, data);
  }
  return data.ledgers[username];
}

router.get('/', (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const user = findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const vault = bootstrapVault(user.username);
  return res.json({ vault });
});

module.exports = router;
