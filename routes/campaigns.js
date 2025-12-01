const express = require('express');

const { getUsers } = require('../utils/userStorage');
const { query } = require('../utils/db');
const {
  getMailConfigStatus,
  isEmailConfigured,
  sendCreditPromoEmail,
  sendWelcomeEmail,
  sendCustomEmail,
} = require('../utils/emailCampaign');

const router = express.Router();

const normalizeKey = (value) => value?.toString().trim() || '';

function adminKeyValid(req) {
  const providedKey = normalizeKey(req.body?.key || req.query?.key || req.headers['x-admin-key']);
  const expectedKey = normalizeKey(process.env.ADMIN_KEY);
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

// CAMPAIGN CRUD OPERATIONS
router.get('/list', async (req, res) => {
  try {
    const result = await query('SELECT * FROM email_campaigns ORDER BY updated_at DESC');
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch campaigns', error);
    return res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

router.post('/create', async (req, res) => {
  const { name, subject, html_content } = req.body || {};
  if (!name || !subject || !html_content) {
    return res.status(400).json({ error: 'Name, subject, and HTML content are required.' });
  }

  try {
    const result = await query(
      'INSERT INTO email_campaigns (name, subject, html_content) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), subject.trim(), html_content],
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create campaign', error);
    if (error.message.includes('duplicate')) {
      return res.status(400).json({ error: 'Campaign name already exists.' });
    }
    return res.status(500).json({ error: 'Failed to create campaign' });
  }
});

router.post('/update/:id', async (req, res) => {
  const { id } = req.params;
  const { name, subject, html_content } = req.body || {};

  try {
    const result = await query(
      'UPDATE email_campaigns SET name = $1, subject = $2, html_content = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
      [name.trim(), subject.trim(), html_content, Number(id)],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update campaign', error);
    if (error.message.includes('duplicate')) {
      return res.status(400).json({ error: 'Campaign name already exists.' });
    }
    return res.status(500).json({ error: 'Failed to update campaign' });
  }
});

router.post('/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query('DELETE FROM email_campaigns WHERE id = $1 RETURNING *', [Number(id)]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    return res.json({ message: 'Campaign deleted successfully', campaign: result.rows[0] });
  } catch (error) {
    console.error('Failed to delete campaign', error);
    return res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// SEND CAMPAIGN TO ALL USERS
router.post('/send-campaign/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const campaignResult = await query('SELECT * FROM email_campaigns WHERE id = $1', [Number(id)]);
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const campaign = campaignResult.rows[0];
    const users = await getUsers();
    const userEmails = normalizeEmails(users.map((user) => user.email));

    const results = await Promise.all(
      userEmails.map(async (email) => {
        try {
          await sendCustomEmail(email, campaign.subject, campaign.html_content);
          return { email, status: 'sent' };
        } catch (error) {
          console.error(`Failed to send campaign to ${email}`, error);
          return { email, status: 'failed', message: error.message };
        }
      }),
    );

    const sent = results.filter((item) => item.status === 'sent').length;
    await query('UPDATE email_campaigns SET sent_count = sent_count + $1 WHERE id = $2', [sent, Number(id)]);

    return res.json({
      campaignId: id,
      campaignName: campaign.name,
      attempted: userEmails.length,
      sent,
      failed: results.filter((item) => item.status === 'failed').length,
    });
  } catch (error) {
    console.error('Failed to send campaign', error);
    return res.status(500).json({ error: 'Failed to send campaign' });
  }
});

// SEND INDIVIDUAL EMAIL TO USER
router.post('/send-email', async (req, res) => {
  const { email, subject, html_content } = req.body || {};
  if (!email || !subject || !html_content) {
    return res.status(400).json({ error: 'Email, subject, and HTML content are required.' });
  }

  try {
    await sendCustomEmail(email, subject, html_content);
    return res.json({ message: 'Email sent successfully', email });
  } catch (error) {
    console.error(`Failed to send email to ${email}`, error);
    return res.status(500).json({ error: `Failed to send email: ${error.message}` });
  }
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
