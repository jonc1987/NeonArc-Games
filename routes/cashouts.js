const express = require('express');

const {
  findUser,
  updateUserBalance,
  addCashout,
  getCashouts,
  markUserActivity,
} = require('../utils/userStorage');

const router = express.Router();

function sanitizeAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.floor(numeric * 100) / 100);
}

function adminKeyValid(providedKey) {
  const expected = process.env.ADMIN_KEY;
  return Boolean(expected) && providedKey === expected;
}

router.post('/cashout', async (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const user = await findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const requestedId = req.body?.id?.toString().trim();
  const amount = sanitizeAmount(req.body?.amount);
  const viewMode = user.viewMode || 'standard';
  const balance = Number(user.balance || 0);

  if (!requestedId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'A valid withdrawal amount is required.' });
  }

  if (requestedId !== user.id) {
    return res.status(403).json({ error: 'Account mismatch.' });
  }

  if (viewMode === 'limited' && balance < 500) {
    return res
      .status(400)
      .json({ error: 'Limited preview cash outs unlock at $500 balance. Keep playing to reach it.' });
  }

  const minimumWithdrawal = viewMode === 'standard' ? 400 : 0;

  if (minimumWithdrawal && amount < minimumWithdrawal) {
    return res.status(400).json({ error: `Cash out starts at $${minimumWithdrawal.toFixed(0)} for your account.` });
  }

  if (amount > balance) {
    return res.status(400).json({ error: 'Insufficient balance for cash out.' });
  }

  try {
    const updatedUser = await updateUserBalance(user.username, -amount);
    const activityUser = (await markUserActivity(user.username)) || updatedUser;
    const cashout = await addCashout({ id: user.id, username: user.username, amount });
    return res.status(201).json({ user: activityUser, cashout });
  } catch (error) {
    console.error('Failed to record cashout', error);
    return res.status(500).json({ error: 'Unable to process cash out.' });
  }
});

router.get('/cashouts', async (req, res) => {
  const providedKey = req.query?.key || req.headers['x-admin-key'];
  if (!adminKeyValid(providedKey)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const cashouts = await getCashouts();
  return res.json({ cashouts });
});

module.exports = router;
