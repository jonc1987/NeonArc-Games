const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const http = require('http');
const { URL } = require('url');
const WebSocket = require('ws');
require('dotenv').config();
const { ensureDatabase, query } = require('./utils/db');
const { getUsers, getCashouts } = require('./utils/userStorage');
const { addChatMessage } = require('./utils/chatStorage');
const {
  getMultiplayerSession,
  touchMultiplayerSession,
} = require('./utils/multiplayerStorage');
const { getMeetSession, removeMeetSession } = require('./utils/meetStorage');

const app = express();

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'neonarc-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
  },
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(sessionMiddleware);

app.use('/api/profile', require('./routes/profile'));
app.use('/api/vault', require('./routes/vault'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/daily-wheel', require('./routes/dailyWheel'));
app.use('/api/quests', require('./routes/quests'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api', require('./routes/account'));
app.use('/api', require('./routes/cashouts'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/multiplayer', require('./routes/multiplayer'));
app.use('/api/meet', require('./routes/meet'));

app.get('/', (req, res) => {
  res.render('home');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.get('/app', (req, res) => {
  res.render('index');
});

app.get('/confirm', (req, res) => {
  res.render('confirm');
});

app.get('/stackjack', (req, res) => {
  res.render('stackjack');
});

app.get('/meet', (req, res) => {
  res.render('meet');
});

const server = http.createServer(app);

const chatWss = new WebSocket.Server({ noServer: true });
const sessionWss = new WebSocket.Server({ noServer: true });
const meetWss = new WebSocket.Server({ noServer: true });

const chatClients = new Set();
const sessionClients = new Map();

function broadcastChatMessage(message) {
  if (!message) return;
  const payload = JSON.stringify({ type: 'chat.message', message });
  chatClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

chatWss.on('connection', (ws, request) => {
  const user = request.session?.user;
  if (!user) {
    ws.close();
    return;
  }
  chatClients.add(ws);

  ws.on('message', async (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch (error) {
      console.error('Malformed chat payload', error);
      return;
    }
    if (payload?.type !== 'chat.message') return;
    const saved = await addChatMessage({ userId: user.id, username: user.username, message: payload.message });
    if (saved) {
      broadcastChatMessage(saved);
    }
  });

  ws.on('close', () => {
    chatClients.delete(ws);
  });

  ws.send(JSON.stringify({ type: 'chat.ready' }));
});
function broadcastSessionParticipants(sessionId, room = {}) {
  const message = JSON.stringify({
    type: 'session.participants',
    participants: {
      host: room.host?.username || null,
      guest: room.guest?.username || null,
    },
    game: room.game || null,
    status: room.status || 'waiting',
  });
  [room.host, room.guest].forEach((entry) => {
    if (entry?.ws?.readyState === WebSocket.OPEN) {
      entry.ws.send(message);
    }
  });
}

function forwardSessionToPartner(sessionId, senderRole, payload) {
  const room = sessionClients.get(sessionId);
  if (!room) return;
  const partnerRole = senderRole === 'host' ? 'guest' : 'host';
  const partner = room[partnerRole];
  if (partner?.ws?.readyState === WebSocket.OPEN) {
    partner.ws.send(JSON.stringify(payload));
  }
}

sessionWss.on('connection', async (ws, request) => {
  const user = request.session?.user;
  const hostHeader = request.headers.host || 'localhost';
  let sessionId;
  try {
    const parsedUrl = new URL(request.url, `http://${hostHeader}`);
    sessionId = parsedUrl.searchParams.get('session');
  } catch (error) {
    sessionId = null;
  }
  if (!user || !sessionId) {
    ws.close();
    return;
  }
  const session = await getMultiplayerSession(sessionId);
  if (!session) {
    ws.close();
    return;
  }
  const role = user.id === session.host_id ? 'host' : user.id === session.guest_id ? 'guest' : null;
  if (!role) {
    ws.close();
    return;
  }
  await touchMultiplayerSession(sessionId);
  const room = sessionClients.get(sessionId) || {
    host: null,
    guest: null,
    game: session.game,
    status: session.status,
  };
  room.game = session.game;
  room.status = session.status;
  room[role] = { ws, userId: user.id, username: user.username };
  sessionClients.set(sessionId, room);

  ws.role = role;
  ws.sessionId = sessionId;
  ws.user = user;

  ws.on('message', (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch (error) {
      console.error('Session signaling error', error);
      return;
    }
    if (!payload?.type) return;
    payload.origin = user.username;
    if (payload.type.startsWith('signal.') || payload.type === 'game.event') {
      forwardSessionToPartner(sessionId, role, payload);
    }
  });

  ws.on('close', () => {
    const current = sessionClients.get(sessionId) || {
      host: null,
      guest: null,
      game: session.game,
      status: session.status,
    };
    if (current[role]?.ws === ws) {
      current[role] = null;
    }
    if (!current.host && !current.guest) {
      sessionClients.delete(sessionId);
    } else {
      sessionClients.set(sessionId, current);
      broadcastSessionParticipants(sessionId, current);
    }
  });

  broadcastSessionParticipants(sessionId, room);
  ws.send(
    JSON.stringify({
      type: 'session.ready',
      role,
      sessionId,
      game: session.game,
    }),
  );
});

function broadcastMeetParticipants(session) {
  if (!session) return;
  const payload = JSON.stringify({
    type: 'meet.participants',
    host: {
      id: session.hostId,
      username: session.hostUsername,
    },
    participants: Array.from(session.clients).map((entry) => ({
      id: entry.userId,
      username: entry.username,
    })),
  });
  session.clients.forEach((entry) => {
    if (entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(payload);
    }
  });
}

function broadcastMeetSignal(session, payload, originWs) {
  if (!session || !payload) return;
  const message = JSON.stringify(payload);
  session.clients.forEach((entry) => {
    if (entry.ws !== originWs && entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(message);
    }
  });
}

meetWss.on('connection', (ws, request) => {
  const user = request.session?.user;
  const hostHeader = request.headers.host || 'localhost';
  let sessionId;
  try {
    const parsedUrl = new URL(request.url, `http://${hostHeader}`);
    sessionId = parsedUrl.searchParams.get('room');
  } catch (error) {
    sessionId = null;
  }
  if (!user || !sessionId) {
    ws.close();
    return;
  }
  const session = getMeetSession(sessionId);
  if (!session) {
    ws.close();
    return;
  }
  const client = { ws, userId: user.id, username: user.username };
  session.clients.add(client);
  broadcastMeetParticipants(session);
  ws.send(
    JSON.stringify({
      type: 'meet.ready',
      sessionId,
      host: {
        id: session.hostId,
        username: session.hostUsername,
      },
    }),
  );

  ws.on('message', (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch (error) {
      console.error('Meet signaling error', error);
      return;
    }
    if (!payload?.type) return;
    if (payload.type.startsWith('signal.')) {
      broadcastMeetSignal(session, payload, ws);
    }
  });

  ws.on('close', () => {
    session.clients.delete(client);
    if (!session.clients.size) {
      removeMeetSession(sessionId);
      return;
    }
    broadcastMeetParticipants(session);
  });
});

server.on('upgrade', (request, socket, head) => {
  sessionMiddleware(request, {}, () => {
    const hostname = request.headers.host || 'localhost';
    let pathname;
    try {
      pathname = new URL(request.url, `http://${hostname}`).pathname;
    } catch (error) {
      socket.destroy();
      return;
    }
    if (pathname === '/ws/chat') {
      chatWss.handleUpgrade(request, socket, head, (ws) => chatWss.emit('connection', ws, request));
    } else if (pathname === '/ws/multiplayer') {
      sessionWss.handleUpgrade(request, socket, head, (ws) => sessionWss.emit('connection', ws, request));
    } else if (pathname === '/ws/meet') {
      meetWss.handleUpgrade(request, socket, head, (ws) => meetWss.emit('connection', ws, request));
    } else {
      socket.destroy();
    }
  });
});

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return `'${value.toString().replace(/'/g, "''")}'`;
}

function buildInsertStatement(table, columns, rows = []) {
  if (!rows.length) return '';
  const formattedRows = rows
    .map((row) => {
      const values = columns.map((column) => sqlLiteral(row[column]));
      return `(${values.join(', ')})`;
    })
    .join(',\n  ');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n  ${formattedRows};`;
}

function buildRecoverySql(users, cashouts, campaigns) {
  const statements = [];

  const createUsersTable = `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  cash_balance NUMERIC DEFAULT 0,
  credit_balance NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL,
  last_activity TIMESTAMPTZ NOT NULL,
  view_mode TEXT DEFAULT 'standard',
  dashboard_note TEXT DEFAULT ''
);`;

  const createCashoutsTable = `CREATE TABLE IF NOT EXISTS cashouts (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  paid_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_cashouts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);`;

  const createCampaignsTable = `CREATE TABLE IF NOT EXISTS email_campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);`;

  statements.push('BEGIN;');
  statements.push(createUsersTable);
  statements.push(createCashoutsTable);
  statements.push(createCampaignsTable);
  statements.push('-- Clear existing data before inserting backup records');
  statements.push('DELETE FROM cashouts;');
  statements.push('DELETE FROM email_campaigns;');
  statements.push('DELETE FROM users;');

  const userColumns = [
    'id',
    'username',
    'email',
    'password',
    'cash_balance',
    'credit_balance',
    'balance',
    'joined_at',
    'last_activity',
    'view_mode',
    'dashboard_note',
    'skill_points',
    'bonus_credits',
  ];
  const userRows = (users || []).map((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    password: user.password,
    cash_balance: user.cashBalance,
    credit_balance: user.creditBalance,
    balance: user.balance,
    joined_at: user.joinedAt,
    last_activity: user.lastActivity,
    view_mode: user.viewMode,
    dashboard_note: user.dashboardNote,
    skill_points: user.skillPoints,
    bonus_credits: user.bonusCredits,
  }));
  const usersStatement = buildInsertStatement('users', userColumns, userRows);
  if (usersStatement) {
    statements.push(usersStatement);
  } else {
    statements.push('-- No user records to restore.');
  }

  const cashoutColumns = [
    'id',
    'user_id',
    'username',
    'amount',
    'paid_amount',
    'status',
    'requested_at',
    'last_updated',
  ];
  const cashoutRows = (cashouts || []).map((entry) => ({
    id: entry.id,
    user_id: entry.userId,
    username: entry.username,
    amount: entry.amount,
    paid_amount: entry.paidAmount,
    status: entry.status,
    requested_at: entry.requestedAt,
    last_updated: entry.lastUpdated,
  }));
  const cashoutsStatement = buildInsertStatement('cashouts', cashoutColumns, cashoutRows);
  if (cashoutsStatement) {
    statements.push(cashoutsStatement);
  } else {
    statements.push('-- No cashout records to restore.');
  }

  const campaignColumns = [
    'id',
    'name',
    'subject',
    'html_content',
    'created_at',
    'updated_at',
    'sent_count',
    'is_active',
  ];
  const campaignRows = (campaigns || []).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    html_content: campaign.html_content,
    created_at: campaign.created_at,
    updated_at: campaign.updated_at,
    sent_count: campaign.sent_count,
    is_active: campaign.is_active,
  }));
  const campaignsStatement = buildInsertStatement('email_campaigns', campaignColumns, campaignRows);
  if (campaignsStatement) {
    statements.push(campaignsStatement);
  } else {
    statements.push('-- No campaign records to restore.');
  }

  statements.push('COMMIT;');
  return statements.join('\n\n');
}

app.get('/management', async (req, res) => {
  const providedKey = req.query?.key?.toString().trim();
  const adminKey = process.env.ADMIN_KEY?.toString().trim();

  if (!adminKey || providedKey !== adminKey) {
    return res.status(403).send('Access Denied');
  }

  try {
    const users = await getUsers();
    const cashouts = await getCashouts();
    const campaignsResult = await query('SELECT * FROM email_campaigns ORDER BY updated_at DESC');
    const campaigns = campaignsResult.rows || [];
    const recoverySql = buildRecoverySql(users, cashouts, campaigns);

    return res.render('management', { users, cashouts, recoverySql });
  } catch (error) {
    console.error('Failed to load management data', error);
    return res.status(500).send('Unable to load management dashboard');
  }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await ensureDatabase();
    const adminKey = process.env.ADMIN_KEY?.toString().trim() || '';
    const masked =
      adminKey.length > 4 ? `${adminKey.slice(0, 2)}***${adminKey.slice(-2)}` : adminKey || 'NOT SET';
    server.listen(PORT, () => {
      console.log(`NeonArc server running on http://localhost:${PORT}`);
      console.log(`Admin key loaded: ${masked}`);
      if (!adminKey) {
        console.warn(
          'ADMIN_KEY is not set. Management/admin routes will reject all requests. Add ADMIN_KEY to a .env file in project root and restart.',
        );
      }
    });
  } catch (error) {
    console.error('Database initialization failed', error);
    process.exit(1);
  }
}

startServer();
