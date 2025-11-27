const express = require('express');

const {
  findUserById,
  updateUserBalanceById,
  setUserDisplayPreferences,
  markUserActivity,
  applyCashoutPayment,
} = require('../utils/userStorage');

const router = express.Router();

function adminKeyValid(req) {
  const providedKey = req.body?.key || req.query?.key || req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;
  return Boolean(expectedKey) && providedKey === expectedKey;
}

function sanitizeAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.floor(numeric * 100) / 100);
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

router.use((req, res, next) => {
  if (!adminKeyValid(req)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  return next();
});

router.post('/credit', async (req, res) => {
  const { userId } = req.body || {};
  const amount = sanitizeAmount(req.body?.amount);

  if (!userId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'A positive amount is required.' });
  }

  const user = await findUserById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const updatedUser = await updateUserBalanceById(userId, amount, { allowNegative: false });
  const refreshed = (await markUserActivity(user.username)) || updatedUser;

  return res.json({ user: publicUser(refreshed) });
});

router.post('/debit', async (req, res) => {
  const { userId } = req.body || {};
  const amount = sanitizeAmount(req.body?.amount);

  if (!userId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'A positive amount is required.' });
  }

  const user = await findUserById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const updatedUser = await updateUserBalanceById(userId, -amount, { allowNegative: false });
  const refreshed = (await markUserActivity(user.username)) || updatedUser;

  return res.json({ user: publicUser(refreshed) });
});

router.post('/display', async (req, res) => {
  const { userId, viewMode, dashboardNote } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const updatedUser = await setUserDisplayPreferences(userId, { viewMode, dashboardNote });
  if (!updatedUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  return res.json({ user: publicUser(updatedUser) });
});

router.post('/cashouts/:id/pay', async (req, res) => {
  const amount = sanitizeAmount(req.body?.amount);
  const cashoutId = req.params?.id;

  if (!cashoutId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'A positive payout amount is required.' });
  }

  try {
    const updatedCashout = await applyCashoutPayment(cashoutId, amount);
    if (!updatedCashout) {
      return res.status(404).json({ error: 'Cash out request not found.' });
    }
    return res.json({ cashout: updatedCashout });
  } catch (error) {
    console.error('Failed to update cashout payment', error);
    return res.status(500).json({ error: 'Unable to record payout.' });
  }
});

module.exports = router;
