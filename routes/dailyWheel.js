const express = require('express');

const { readJson, writeJson } = require('../utils/dataStorage');
const { findUser, updateUserWallet } = require('../utils/userStorage');

const router = express.Router();

const WHEEL_FILE = 'dailyWheel.json';

const rewards = [1, 5, 10, 15, 20, 30];

function getState() {
  return readJson(WHEEL_FILE, { spins: {} });
}

function saveState(state) {
  writeJson(WHEEL_FILE, state);
}

function getNextEligibleDate(lastSpin) {
  if (!lastSpin) return null;
  const next = new Date(lastSpin);
  next.setHours(24, 0, 0, 0);
  return next.toISOString();
}

router.get('/', (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const state = getState();
  const lastSpin = state.spins[username]?.lastSpin || null;
  return res.json({
    lastSpin,
    nextEligibleAt: getNextEligibleDate(lastSpin),
    lastReward: state.spins[username]?.lastReward ?? null,
  });
});

router.post('/', async (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const user = await findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const state = getState();
  const record = state.spins[username];
  const now = new Date();

  if (record?.lastSpin) {
    const nextEligible = new Date(getNextEligibleDate(record.lastSpin));
    if (now < nextEligible) {
      return res.status(429).json({
        error: 'Daily wheel already used for today.',
        nextEligibleAt: nextEligible.toISOString(),
        lastReward: record.lastReward,
      });
    }
  }

  const reward = rewards[Math.floor(Math.random() * rewards.length)];
  const updatedUser = await updateUserWallet(user.username, { cashDelta: reward });
  state.spins[username] = {
    lastSpin: now.toISOString(),
    lastReward: reward,
  };
  saveState(state);

  return res.json({
    reward,
    balance: updatedUser?.balance ?? user.balance,
    cashBalance: updatedUser?.cashBalance ?? reward,
    creditBalance: updatedUser?.creditBalance ?? 0,
    nextEligibleAt: getNextEligibleDate(now.toISOString()),
  });
});

module.exports = router;
