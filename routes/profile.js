const express = require('express');

const {
  findUser,
  getFriendCount,
  getFriendIds,
  searchUsersByName,
  areFriends,
  getFriendList,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  findPendingFriendRequestBetween,
  findFriendRequestById,
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
} = require('../utils/userStorage');
const { getViewer } = require('../utils/sessionHelper');

const router = express.Router();

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
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
  let incomingRequests = [];
  let outgoingRequests = [];
  if (viewer) {
    viewerFriendIds = await getFriendIds(viewer.id);
    [incomingRequests, outgoingRequests] = await Promise.all([
      getIncomingFriendRequests(viewer.id),
      getOutgoingFriendRequests(viewer.id),
    ]);
  }

  try {
    const matches = await searchUsersByName(queryValue, limit);
    const incomingByRequester = new Map(incomingRequests.map((request) => [request.requesterId, request]));
    const outgoingByRecipient = new Map(outgoingRequests.map((request) => [request.recipientId, request]));
    const enriched = await Promise.all(
      matches.map(async (entry) => {
        const count = await getFriendCount(entry.id);
        const isFriend = Boolean(viewer && viewerFriendIds.includes(entry.id));
        const incoming = incomingByRequester.get(entry.id);
        const outgoing = outgoingByRecipient.get(entry.id);
        return {
          ...entry,
          friendCount: count,
          isFriend,
          isSelf: viewer?.id === entry.id,
          incomingRequestId: incoming?.id || null,
          outgoingRequestId: outgoing?.id || null,
        };
      }),
    );
    return res.json({ results: enriched });
  } catch (error) {
    console.error('Profile search failed', error);
    return res.status(500).json({ error: 'Unable to search profiles right now.' });
  }
});

router.get('/friends', async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const friends = await getFriendList(viewer.id);
  return res.json({ friends, friendCount: friends.length });
});

router.get('/friend-requests', async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const [incoming, outgoing] = await Promise.all([
    getIncomingFriendRequests(viewer.id),
    getOutgoingFriendRequests(viewer.id),
  ]);

  return res.json({ incoming, outgoing });
});

router.post('/friend-requests', async (req, res) => {
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
    return res.status(400).json({ error: 'You cannot send a friend request to yourself.' });
  }

  if (await areFriends(viewer.id, targetUser.id)) {
    return res.status(409).json({ error: 'You are already friends.' });
  }

  const pending = await findPendingFriendRequestBetween(viewer.id, targetUser.id);
  if (pending) {
    if (pending.requesterId === viewer.id) {
      return res.status(409).json({ error: 'Friend request already sent.' });
    }
    const accepted = await acceptFriendRequest(pending.id, viewer.id);
    if (!accepted) {
      return res.status(500).json({ error: 'Unable to accept pending request.' });
    }
    const friendCount = await getFriendCount(viewer.id);
    return res.json({ success: true, accepted: true, friendCount });
  }

  try {
    const request = await createFriendRequest(viewer.id, targetUser.id);
    if (!request) {
      return res.status(500).json({ error: 'Unable to submit friend request.' });
    }
    return res.json({ success: true, requestId: request.id });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'Friend request already pending.' });
    }
    console.error('Failed to send friend request', error);
    return res.status(500).json({ error: 'Unable to send friend request right now.' });
  }
});

router.post('/friend-requests/:id/respond', async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const requestId = req.params?.id;
  const action = req.body?.action?.toString().trim().toLowerCase();
  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required.' });
  }
  if (!['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'Action must be accept or decline.' });
  }

  const request = await findFriendRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: 'Friend request not found.' });
  }

  if (action === 'accept') {
    const accepted = await acceptFriendRequest(requestId, viewer.id);
    if (!accepted) {
      return res.status(404).json({ error: 'Friend request not found.' });
    }
    const friendCount = await getFriendCount(viewer.id);
    return res.json({ success: true, friendCount });
  }

  const declined = await declineFriendRequest(requestId, viewer.id);
  if (!declined) {
    return res.status(404).json({ error: 'Friend request not found.' });
  }
  const canceled = request.requesterId === viewer.id;
  return res.json({ success: true, canceled });
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
  let incomingRequestId = null;
  let outgoingRequestId = null;
  if (viewer && viewer.id !== targetUser.id) {
    const viewerFriendIds = await getFriendIds(viewer.id);
    isFriend = viewerFriendIds.includes(targetUser.id);
    const pending = await findPendingFriendRequestBetween(viewer.id, targetUser.id);
    if (pending) {
      if (pending.requesterId === viewer.id) {
        outgoingRequestId = pending.id;
      } else {
        incomingRequestId = pending.id;
      }
    }
  }

  return res.json({
    profile: {
      ...publicUser(targetUser),
      friendCount,
      isFriend,
      isSelf: viewer?.id === targetUser.id,
      incomingRequestId,
      outgoingRequestId,
    },
  });
});

module.exports = router;
