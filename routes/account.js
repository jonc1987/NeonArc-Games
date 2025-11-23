const express = require('express');
const { randomUUID } = require('crypto');

const router = express.Router();

const accounts = new Map();

function formatAccount(account) {
  return {
    id: account.id,
    username: account.username,
    balance: account.balance,
    joinedAt: account.joinedAt,
  };
}

function createAccount(username) {
  const id = randomUUID();
  const joinedAt = new Date().toISOString();
  const account = {
    id,
    username: username?.trim() || `NeonPilot-${id.slice(0, 8)}`,
    balance: 1000,
    joinedAt,
  };
  accounts.set(id, account);
  return account;
}

router.post('/register', (req, res) => {
  const { username } = req.body || {};
  const account = createAccount(username);
  res.status(201).json({ account: formatAccount(account) });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const account = accounts.get(id);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  return res.json({ account: formatAccount(account) });
});

router.post('/update-balance/:id', (req, res) => {
  const { id } = req.params;
  const account = accounts.get(id);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const { delta } = req.body || {};
  const amount = Number(delta);

  if (!Number.isFinite(amount)) {
    return res.status(400).json({ error: 'A numeric delta value is required' });
  }

  account.balance = Math.max(0, account.balance + amount);
  accounts.set(id, account);

  return res.json({ account: formatAccount(account) });
});

module.exports = router;
