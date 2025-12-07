const express = require('express');

const { readJson, writeJson } = require('../utils/dataStorage');
const { findUser, updateUserWallet, getFriendCount } = require('../utils/userStorage');

const router = express.Router();

const QUEST_FILE = 'quests.json';

const QUEST_DEFINITIONS = [
  {
    id: 'neon-trainee',
    title: 'Neon Trainee',
    description: 'Place 3 wagers across any skill game.',
    goal: 3,
    reward: 30,
    rewardLabel: 'credits',
    event: 'wager',
    increment: () => 1,
  },
  {
    id: 'profit-surge',
    title: 'Profit Surge',
    description: 'Win a total of 120 credits from payouts in one day.',
    goal: 120,
    reward: 45,
    rewardLabel: 'credits',
    event: 'win',
    increment: ({ amount }) => Math.max(0, Number.isFinite(Number(amount)) ? Number(amount) : 0),
  },
  {
    id: 'prize-hunter',
    title: 'Prize Hunter',
    description: 'Spin the daily prize wheel.',
    goal: 1,
    reward: 25,
    rewardLabel: 'credits',
    event: 'daily_spin',
    increment: () => 1,
  },
  {
    id: 'gear-collector',
    title: 'Gear Collector',
    description: 'Purchase a cosmetic upgrade from the shop.',
    goal: 1,
    reward: 40,
    rewardLabel: 'credits',
    event: 'shop_purchase',
    increment: () => 1,
  },
];

const QUEST_MAP = QUEST_DEFINITIONS.reduce((map, quest) => {
  map[quest.id] = quest;
  return map;
}, {});

function readQuestState() {
  return readJson(QUEST_FILE, { users: {} });
}

function saveQuestState(state) {
  writeJson(QUEST_FILE, state);
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function createDefaultRecord() {
  return {
    value: 0,
    claimed: false,
    completedAt: null,
    claimedAt: null,
    updatedAt: null,
  };
}

function ensureUserState(state, username) {
  if (!state.users) {
    state.users = {};
  }
  if (!state.users[username]) {
    state.users[username] = { date: getTodayKey(), progress: {} };
  }
  const userState = state.users[username];
  const today = getTodayKey();
  if (userState.date !== today) {
    userState.date = today;
    userState.progress = {};
    userState.lastReset = new Date().toISOString();
  }
  return userState;
}

function getQuestRecord(userState, questId) {
  if (!userState.progress[questId]) {
    userState.progress[questId] = createDefaultRecord();
  }
  return userState.progress[questId];
}

function buildQuestResponse(userState) {
  const nextReset = new Date();
  nextReset.setHours(24, 0, 0, 0);
  return {
    nextReset: nextReset.toISOString(),
    quests: QUEST_DEFINITIONS.map((quest) => {
      const record = getQuestRecord(userState, quest.id);
      const progress = Math.min(quest.goal, Number(record.value) || 0);
      const percent = Math.min(100, Math.round((progress / quest.goal) * 100));
      const completed = progress >= quest.goal;
      const status = record.claimed ? 'claimed' : completed ? 'ready' : 'in-progress';
      return {
        id: quest.id,
        title: quest.title,
        description: quest.description,
        goal: quest.goal,
        reward: quest.reward,
        rewardLabel: quest.rewardLabel || 'credits',
        event: quest.event,
        progress: Number(progress.toFixed(2)),
        percent,
        completed,
        claimed: Boolean(record.claimed),
        status,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt,
        claimedAt: record.claimedAt,
      };
    }),
  };
}

function getIncrementValue(quest, payload = {}) {
  if (typeof quest.increment === 'function') {
    return Math.max(0, Number(quest.increment(payload)) || 0);
  }
  if (Number.isFinite(quest.increment)) {
    return Math.max(0, quest.increment);
  }
  return Math.max(0, Number(payload.amount) || 0);
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

router.get('/', async (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const state = readQuestState();
  const userState = ensureUserState(state, username);
  const response = buildQuestResponse(userState);
  return res.json(response);
});

router.post('/progress', async (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const state = readQuestState();
  const userState = ensureUserState(state, username);

  const eventName = req.body?.event?.toString().trim();
  if (!eventName) {
    const response = buildQuestResponse(userState);
    return res.status(400).json({ error: 'Quest event is required.', ...response });
  }

  const matchedQuests = QUEST_DEFINITIONS.filter((quest) => quest.event === eventName);
  if (!matchedQuests.length) {
    const response = buildQuestResponse(userState);
    return res.status(400).json({ error: 'Unknown quest event.', ...response });
  }

  const payloadAmount = Number.isFinite(Number(req.body?.amount)) ? Number(req.body.amount) : 0;
  let updated = false;

  matchedQuests.forEach((quest) => {
    const record = getQuestRecord(userState, quest.id);
    const increment = getIncrementValue(quest, { amount: payloadAmount });
    if (increment <= 0) {
      return;
    }
    const nextValue = Math.min(quest.goal, (Number(record.value) || 0) + increment);
    if (nextValue === Number(record.value || 0)) {
      return;
    }
    record.value = Number(nextValue.toFixed(2));
    record.updatedAt = new Date().toISOString();
    if (nextValue >= quest.goal && !record.completedAt) {
      record.completedAt = new Date().toISOString();
    }
    updated = true;
  });

  if (updated) {
    saveQuestState(state);
  }
  const response = buildQuestResponse(userState);
  return res.json({ message: updated ? 'Quest progress updated.' : 'No change to quest progress.', ...response });
});

router.post('/claim', async (req, res) => {
  const username = req.session?.user?.username;
  if (!username) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const questId = req.body?.questId?.toString().trim();
  if (!questId) {
    const state = readQuestState();
    const userState = ensureUserState(state, username);
    return res.status(400).json({ error: 'Quest ID is required.', ...buildQuestResponse(userState) });
  }

  const quest = QUEST_MAP[questId];
  if (!quest) {
    const state = readQuestState();
    const userState = ensureUserState(state, username);
    return res.status(404).json({ error: 'Quest not found.', ...buildQuestResponse(userState) });
  }

  const state = readQuestState();
  const userState = ensureUserState(state, username);
  const record = getQuestRecord(userState, questId);
  const progress = Number(record.value || 0);
  if (progress < quest.goal) {
    return res.status(400).json({ error: 'Quest has not been completed yet.', ...buildQuestResponse(userState) });
  }
  if (record.claimed) {
    return res.status(400).json({ error: 'Quest reward already claimed.', ...buildQuestResponse(userState) });
  }

  const user = await findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const updatedUser = await updateUserWallet(user.username, { creditDelta: quest.reward });
  if (!updatedUser) {
    return res.status(500).json({ error: 'Unable to award quest reward.' });
  }

  record.claimed = true;
  record.claimedAt = new Date().toISOString();
  saveQuestState(state);

  const response = buildQuestResponse(userState);
  const friendCount = await getFriendCount(updatedUser.id);
  return res.json({
    message: `Quest ${quest.title} claimed for ${quest.reward} ${quest.rewardLabel}.`,
    questId: quest.id,
    user: { ...publicUser(updatedUser), friendCount },
    ...response,
  });
});

module.exports = router;
