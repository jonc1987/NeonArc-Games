const express = require('express');

const { findUser, updateUserWallet } = require('../utils/userStorage');

const router = express.Router();

const inventory = [
  {
    id: 'aurora-deck',
    name: 'Aurora Deck Skin',
    price: 200,
    rarity: 'legendary',
    description: 'Shifting aurora accents that animate card edges.',
  },
  {
    id: 'neon-avatar',
    name: 'Neon Pilot Avatar',
    price: 120,
    rarity: 'rare',
    description: 'Animated avatar with soft neon pulses.',
  },
  {
    id: 'vault-badge',
    name: 'Vault Guardian Badge',
    price: 80,
    rarity: 'uncommon',
    description: 'Badge awarded for strong vault security practices.',
  },
  {
    id: 'sound-pack',
    name: 'Synth Sound Pack',
    price: 60,
    rarity: 'uncommon',
    description: 'Alternate UI beeps and hover tones inspired by 80s synths.',
  },
  {
    id: 'table-theme',
    name: 'Prismatic Table Theme',
    price: 150,
    rarity: 'epic',
    description: 'Reactive table theme with prismatic trails on wins.',
  },
];

router.get('/', (_req, res) => {
  res.json({ items: inventory });
});

const inventoryById = inventory.reduce((map, item) => {
  map[item.id] = item;
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

  const creditBalance = Number(user.creditBalance ?? 0);
  if (creditBalance < price) {
    return res.status(402).json({ error: 'Not enough credits for this purchase.' });
  }

  const updatedUser = await updateUserWallet(user.username, { creditDelta: -price });
  if (!updatedUser) {
    return res.status(500).json({ error: 'Unable to complete purchase.' });
  }

  return res.json({ user: publicUser(updatedUser), purchased: item.id });
});

module.exports = router;
