const express = require('express');
const bcrypt = require('bcryptjs');

const { createUser, findUser, updateUserBalance, markUserActivity } = require('../utils/userStorage');
const { isEmailConfigured, sendWelcomeEmail } = require('../utils/emailCampaign');

const router = express.Router();

function sanitizeUsername(username) {
  return username?.toString().trim().replace(/[^\w-]/g, '');
}

function sanitizeEmail(email) {
  return email?.toString().trim().toLowerCase();
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

router.post('/register', async (req, res) => {
  const username = sanitizeUsername(req.body?.username);
  const email = sanitizeEmail(req.body?.email);
  const password = req.body?.password?.toString();

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  const emailPattern = /.+@.+\..+/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (await findUser(username)) {
    return res.status(409).json({ error: 'Username is already taken.' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await createUser(username, hash, email, 0);
    req.session.user = { username: user.username };

    if (isEmailConfigured()) {
      sendWelcomeEmail(user.email).catch((error) =>
        console.error('Failed to send welcome email', error),
      );
    }

    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    console.error('Failed to register user', error);
    return res.status(500).json({ error: 'Unable to register user.' });
  }
});

router.post('/login', async (req, res) => {
  const username = sanitizeUsername(req.body?.username);
  const password = req.body?.password?.toString();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = await findUser(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const refreshedUser = (await markUserActivity(user.username)) || user;
  req.session.user = { username: refreshedUser.username };
  return res.json({ user: publicUser(refreshedUser) });
});

router.post('/logout', (req, res) => {
  if (!req.session) {
    return res.json({ message: 'Logged out.' });
  }
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out.' });
  });
});

router.get('/account', async (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const user = await findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  return res.json({ user: publicUser(user) });
});

router.post('/update-balance', async (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const user = await findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const { delta } = req.body || {};
  const amount = Number(delta);

  if (!Number.isFinite(amount)) {
    return res.status(400).json({ error: 'A numeric delta value is required.' });
  }

  const updatedUser = await updateUserBalance(user.username, amount);
  if (!updatedUser) {
    return res.status(500).json({ error: 'Unable to update balance.' });
  }

  return res.json({ user: publicUser(updatedUser) });
});

module.exports = router;
