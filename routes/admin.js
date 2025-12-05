const express = require('express');

const {
  findUserById,
  updateUserWalletById,
  setUserDisplayPreferences,
  markUserActivity,
  applyCashoutPayment,
  resetUserBalanceById,
  deleteUserById,
} = require('../utils/userStorage');

const router = express.Router();

const normalizeKey = (value) => value?.toString().trim() || '';

function adminKeyValid(req) {
  const providedKey = normalizeKey(req.body?.key || req.query?.key || req.headers['x-admin-key']);
  const expectedKey = normalizeKey(process.env.ADMIN_KEY);
  return Boolean(expectedKey) && providedKey === expectedKey;
}

function sanitizeAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.floor(numeric * 100) / 100);
}

function resolveFundType(value, fallback = 'cash') {
  const normalized = value?.toString().trim().toLowerCase();
  if (normalized === 'cash' || normalized === 'credit') {
    return normalized;
  }
  return fallback;
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
  const fundType = resolveFundType(req.body?.fundType, 'credit');

  if (!userId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'A positive amount is required.' });
  }

  const user = await findUserById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const walletDelta = fundType === 'cash' ? { cashDelta: amount } : { creditDelta: amount };
  const updatedUser = await updateUserWalletById(userId, walletDelta, { allowNegative: false });
  const refreshed = (await markUserActivity(user.username)) || updatedUser;

  return res.json({ user: publicUser(refreshed) });
});

router.post('/debit', async (req, res) => {
  const { userId } = req.body || {};
  const amount = sanitizeAmount(req.body?.amount);
  const fundType = resolveFundType(req.body?.fundType, 'cash');

  if (!userId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'A positive amount is required.' });
  }

  const user = await findUserById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const walletDelta = fundType === 'credit' ? { creditDelta: -amount } : { cashDelta: -amount };
  const updatedUser = await updateUserWalletById(userId, walletDelta, { allowNegative: false });
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

router.post('/users/:id/reset-balance', async (req, res) => {
  const userId = req.params?.id;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const updatedUser = await resetUserBalanceById(userId);
  if (!updatedUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const refreshed = (await markUserActivity(updatedUser.username)) || updatedUser;
  return res.json({ user: publicUser(refreshed) });
});

router.delete('/users/:id', async (req, res) => {
  const userId = req.params?.id;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const deletedUser = await deleteUserById(userId);
  if (!deletedUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  return res.json({ user: publicUser(deletedUser) });
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
