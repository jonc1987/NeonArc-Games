const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');
const usersFile = path.join(dataDir, 'users.json');

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, '[]', 'utf8');
  }
}

function getUsers() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(usersFile, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to read users file', error);
    return [];
  }
}

function saveUsers(users) {
  ensureDataFile();
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
}

function findUser(username) {
  const normalized = username?.toString().trim().toLowerCase();
  if (!normalized) return null;
  return getUsers().find((user) => user.username.toLowerCase() === normalized) || null;
}

function createUser(username, passwordHash, balance = 1000) {
  const users = getUsers();
  const normalized = username?.toString().trim();
  if (!normalized) {
    throw new Error('Username is required');
  }
  const duplicate = users.find((user) => user.username.toLowerCase() === normalized.toLowerCase());
  if (duplicate) {
    throw new Error('Username already exists');
  }
  const newUser = {
    id: randomUUID(),
    username: normalized,
    password: passwordHash,
    balance: Number(balance) || 0,
    joinedAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveUsers(users);
  return newUser;
}

function updateUserBalance(username, delta, { allowNegative = false } = {}) {
  const normalized = username?.toString().trim().toLowerCase();
  if (!normalized || !Number.isFinite(Number(delta))) {
    return null;
  }

  const users = getUsers();
  let updatedUser = null;

  const updatedUsers = users.map((user) => {
    if (user.username.toLowerCase() === normalized) {
      const startingBalance = Number(user.balance || 0);
      const nextBalance = startingBalance + Number(delta);
      const balance = allowNegative ? nextBalance : Math.max(0, nextBalance);
      updatedUser = { ...user, balance };
      return updatedUser;
    }
    return user;
  });

  if (updatedUser) {
    saveUsers(updatedUsers);
  }

  return updatedUser;
}

module.exports = {
  getUsers,
  saveUsers,
  findUser,
  createUser,
  ensureDataFile,
  updateUserBalance,
};
