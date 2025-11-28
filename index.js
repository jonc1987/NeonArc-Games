const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
require('dotenv').config();
const { ensureDatabase } = require('./utils/db');
const { getUsers, getCashouts } = require('./utils/userStorage');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'neonarc-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
    },
  }),
);

app.use('/api/profile', require('./routes/profile'));
app.use('/api/vault', require('./routes/vault'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/daily-wheel', require('./routes/dailyWheel'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api', require('./routes/account'));
app.use('/api', require('./routes/cashouts'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/campaigns', require('./routes/campaigns'));

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

app.get('/management', async (req, res) => {
  const providedKey = req.query?.key;
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey || providedKey !== adminKey) {
    return res.status(403).send('Access Denied');
  }

  try {
    const users = await getUsers();
    const cashouts = await getCashouts();
    const recoverySql =
      'SELECT id, username, email, balance, joined_at, last_activity, view_mode, dashboard_note FROM users ORDER BY joined_at DESC;';

    return res.render('management', { users, cashouts, recoverySql });
  } catch (error) {
    console.error('Failed to load management data', error);
    return res.status(500).send('Unable to load management dashboard');
  }
});

const PORT = process.env.PORT || 3000;

ensureDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`NeonArc server running on http://localhost:${PORT}`));
  })
  .catch((error) => {
    console.error('Database initialization failed', error);
    process.exit(1);
  });
