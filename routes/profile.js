const express = require('express');

const {
  findUser,
  getFriendCount,
  getFriendIds,
  searchUsersByName,
  addFriendship,
  areFriends,
} = require('../utils/userStorage');

const router = express.Router();

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

async function getViewer(req) {
  const username = req.session?.user?.username;
  if (!username) return null;
  return findUser(username);
}

router.get('/', async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const friendCount = await getFriendCount(viewer.id);
  const payload = publicUser(viewer);
  return res.json({ user: { ...payload, friendCount, isSelf: true } });
});

router.get('/search', async (req, res) => {
  const queryValue = req.query?.q?.toString().trim();
  if (!queryValue) {
    return res.status(400).json({ error: 'Query parameter q is required.' });
  }
  const limit = Math.min(25, Math.max(3, Number(req.query?.limit) || 12));
  const viewer = await getViewer(req);
  let viewerFriendIds = [];
  if (viewer) {
    viewerFriendIds = await getFriendIds(viewer.id);
  }

  try {
    const matches = await searchUsersByName(queryValue, limit);
    const enriched = await Promise.all(
      matches.map(async (entry) => {
        const count = await getFriendCount(entry.id);
        return {
          ...entry,
          friendCount: count,
          isFriend: Boolean(viewer && viewerFriendIds.includes(entry.id)),
        };
      }),
    );
    return res.json({ results: enriched });
  } catch (error) {
    console.error('Profile search failed', error);
    return res.status(500).json({ error: 'Unable to search profiles right now.' });
  }
});

router.get('/:username', async (req, res) => {
  const targetUsername = req.params?.username?.toString().trim();
  if (!targetUsername) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const targetUser = await findUser(targetUsername);
  if (!targetUser) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  const friendCount = await getFriendCount(targetUser.id);
  const viewer = await getViewer(req);
  let isFriend = false;
  if (viewer && viewer.id !== targetUser.id) {
    const viewerFriendIds = await getFriendIds(viewer.id);
    isFriend = viewerFriendIds.includes(targetUser.id);
  }

  return res.json({
    profile: {
      ...publicUser(targetUser),
      friendCount,
      isFriend,
      isSelf: viewer?.id === targetUser.id,
    },
  });
});

router.post('/friend', async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const targetUsername = req.body?.username?.toString().trim();
  if (!targetUsername) {
    return res.status(400).json({ error: 'Target username is required.' });
  }

  const targetUser = await findUser(targetUsername);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  if (targetUser.id === viewer.id) {
    return res.status(400).json({ error: 'You cannot friend yourself.' });
  }

  if (await areFriends(viewer.id, targetUser.id)) {
    return res.status(409).json({ error: 'You are already friends.' });
  }

  const added = await addFriendship(viewer.id, targetUser.id);
  if (!added) {
    return res.status(500).json({ error: 'Unable to add friend right now.' });
  }

  const friendCount = await getFriendCount(targetUser.id);
  return res.json({ success: true, friendCount });
});

module.exports = router;
