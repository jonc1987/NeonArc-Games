const express = require('express');

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

module.exports = router;
