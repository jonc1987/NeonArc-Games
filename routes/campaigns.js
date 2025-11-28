const express = require('express');

const { getUsers } = require('../utils/userStorage');
const {
  getMailConfigStatus,
  isEmailConfigured,
  sendCreditPromoEmail,
  sendWelcomeEmail,
} = require('../utils/emailCampaign');

const router = express.Router();

function adminKeyValid(req) {
  const providedKey = req.body?.key || req.query?.key || req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;
  return Boolean(expectedKey) && providedKey === expectedKey;
}

function normalizeEmails(list = []) {
  const pattern = /.+@.+\..+/;
  const unique = new Set();

  list.forEach((value) => {
    const email = value?.toString().trim().toLowerCase();
    if (email && pattern.test(email)) {
      unique.add(email);
    }
  });

  return [...unique];
}

async function resolveRecipients({ recipients, audience }) {
  const normalized = normalizeEmails(Array.isArray(recipients) ? recipients : []);

  if (audience === 'all-users') {
    const users = await getUsers();
    const userEmails = normalizeEmails(users.map((user) => user.email));
    userEmails.forEach((email) => normalized.push(email));
  }

  return normalizeEmails(normalized);
}

router.use((req, res, next) => {
  if (!adminKeyValid(req)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const status = getMailConfigStatus();
  if (!status.ready) {
    return res.status(503).json({ error: 'Email transport not configured.', missing: status.missing });
  }

  return next();
});

router.post('/send', async (req, res) => {
  const { campaign, recipients = [], audience } = req.body || {};

  if (!['welcome', 'promotion'].includes(campaign)) {
    return res.status(400).json({ error: 'Campaign must be "welcome" or "promotion".' });
  }

  const targets = await resolveRecipients({ recipients, audience });
  if (targets.length === 0) {
    return res.status(400).json({ error: 'No valid recipient emails were provided.' });
  }

  const sendEmail = campaign === 'welcome' ? sendWelcomeEmail : sendCreditPromoEmail;

  const results = await Promise.all(
    targets.map(async (email) => {
      try {
        await sendEmail(email);
        return { email, status: 'sent' };
      } catch (error) {
        console.error(`Failed to send ${campaign} email to ${email}`, error);
        return { email, status: 'failed', message: error.message };
      }
    }),
  );

  const sent = results.filter((item) => item.status === 'sent').length;
  const failures = results.filter((item) => item.status === 'failed');

  return res.json({
    campaign,
    attempted: targets.length,
    sent,
    failed: failures.length,
    failures,
  });
});

router.get('/status', (req, res) => {
  return res.json({ enabled: isEmailConfigured(), ...getMailConfigStatus() });
});

module.exports = router;
