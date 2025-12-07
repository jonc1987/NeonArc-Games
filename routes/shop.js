const express = require('express');

const { findUser, updateUserWallet, getFriendCount } = require('../utils/userStorage');

const router = express.Router();

const inventory = [
  {
    id: 'aurora-deck',
    name: 'Aurora Deck Skin',
    price: 200,
    rarity: 'legendary',
    description: 'Shifting aurora accents that animate card edges.',
    skillBonus: 35,
  },
  {
    id: 'neon-avatar',
    name: 'Neon Pilot Avatar',
    price: 120,
    rarity: 'rare',
    description: 'Animated avatar with soft neon pulses.',
    skillBonus: 22,
  },
  {
    id: 'vault-badge',
    name: 'Vault Guardian Badge',
    price: 80,
    rarity: 'uncommon',
    description: 'Badge awarded for strong vault security practices.',
    creditBonus: 18,
  },
  {
    id: 'sound-pack',
    name: 'Synth Sound Pack',
    price: 60,
    rarity: 'uncommon',
    description: 'Alternate UI beeps and hover tones inspired by 80s synths.',
    creditBonus: 14,
  },
  {
    id: 'table-theme',
    name: 'Prismatic Table Theme',
    price: 150,
    rarity: 'epic',
    description: 'Reactive table theme with prismatic trails on wins.',
    skillBonus: 28,
  },
];

const creditPacks = [
  {
    id: 'spark-pack',
    title: 'Spark Pack',
    amount: 60,
    description: 'Fresh credits to kick off your session.',
    bonus: 0,
  },
  {
    id: 'neon-boost-pack',
    title: 'Neon Boost Pack',
    amount: 165,
    description: 'Includes a 15-credit bonus for steady players.',
    bonus: 15,
  },
  {
    id: 'arc-surge-pack',
    title: 'Arc Surge Pack',
    amount: 360,
    description: 'High-volume bundle with a 40-credit bonus.',
    bonus: 40,
  },
];

router.get('/', (_req, res) => {
  res.json({ items: inventory });
});

const inventoryById = inventory.reduce((map, item) => {
  map[item.id] = item;
  return map;
}, {});

const creditPackById = creditPacks.reduce((map, pack) => {
  map[pack.id] = pack;
  return map;
}, {});

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

function getSessionUsername(req) {
  return req.session?.user?.username?.toString().trim() || '';
}

router.post('/purchase', async (req, res) => {
  const username = getSessionUsername(req);
  if (!username) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const itemId = req.body?.itemId?.toString().trim();
  if (!itemId) {
    return res.status(400).json({ error: 'Item ID is required.' });
  }

  const item = inventoryById[itemId];
  if (!item) {
    return res.status(404).json({ error: 'Item not found.' });
  }

  const user = await findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const price = Number(item.price);
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'Invalid item price.' });
  }

  const cashBalance = Number(user.cashBalance ?? 0);
  if (cashBalance < price) {
    return res.status(402).json({ error: 'Not enough cash credits for this purchase.' });
  }

  const walletUpdate = { cashDelta: -price };
  if (item.skillBonus) {
    walletUpdate.skillDelta = Number(item.skillBonus);
  }
  if (item.creditBonus) {
    walletUpdate.bonusCreditDelta = Number(item.creditBonus);
  }
  const updatedUser = await updateUserWallet(user.username, walletUpdate);
  if (!updatedUser) {
    return res.status(500).json({ error: 'Unable to complete purchase.' });
  }

  const effect = item.skillBonus
    ? { type: 'skill', amount: Number(item.skillBonus) }
    : item.creditBonus
      ? { type: 'credit', amount: Number(item.creditBonus) }
      : null;
  const friendCount = await getFriendCount(updatedUser.id);

  return res.json({ user: { ...publicUser(updatedUser), friendCount }, purchased: item.id, effect });
});

router.get('/credit-packs', (_req, res) => {
  res.json({ packs: creditPacks });
});

router.post('/purchase-credits', async (req, res) => {
  const username = getSessionUsername(req);
  if (!username) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const packId = req.body?.packId?.toString().trim();
  if (!packId) {
    return res.status(400).json({ error: 'Pack ID is required.' });
  }

  const pack = creditPackById[packId];
  if (!pack) {
    return res.status(404).json({ error: 'Pack not found.' });
  }

  const user = await findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const amount = Number(pack.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Pack has no credits.' });
  }

  const updatedUser = await updateUserWallet(user.username, { creditDelta: amount });
  if (!updatedUser) {
    return res.status(500).json({ error: 'Unable to apply credits.' });
  }

  const friendCount = await getFriendCount(updatedUser.id);
  return res.json({ user: { ...publicUser(updatedUser), friendCount }, pack });
});

module.exports = router;
