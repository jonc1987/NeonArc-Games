const nodemailer = require('nodemailer');

const envFallbacks = {
  host: ['SMTP_HOST', 'BREVO_SMTP_HOST', 'BREVO_SMTP_SERVER'],
  port: ['SMTP_PORT', 'BREVO_SMTP_PORT'],
  user: ['SMTP_USER', 'BREVO_SMTP_LOGIN'],
  pass: ['SMTP_PASS', 'BREVO_SMTP_KEY'],
  from: ['SMTP_FROM', 'BREVO_SMTP_FROM'],
};

function readEnvValue(keys = []) {
  for (const key of keys) {
    if (process.env[key]) {
      return { key, value: process.env[key].trim() };
    }
  }
  return { key: null, value: undefined };
}

function parseBoolean(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function getMailConfig() {
  const host = readEnvValue(envFallbacks.host);
  const port = readEnvValue(envFallbacks.port);
  const user = readEnvValue(envFallbacks.user);
  const pass = readEnvValue(envFallbacks.pass);
  const from = readEnvValue(envFallbacks.from);

  const missing = [
    { label: 'SMTP host (SMTP_HOST | BREVO_SMTP_HOST | BREVO_SMTP_SERVER)', found: host.value },
    { label: 'SMTP port (SMTP_PORT | BREVO_SMTP_PORT)', found: port.value },
    { label: 'SMTP user/login (SMTP_USER | BREVO_SMTP_LOGIN)', found: user.value },
    { label: 'SMTP password/key (SMTP_PASS | BREVO_SMTP_KEY)', found: pass.value },
  ]
    .filter((entry) => !entry.found)
    .map((entry) => entry.label);

  if (missing.length > 0) {
    throw new Error(`Missing required SMTP environment variables: ${missing.join(', ')}`);
  }

  const resolvedPort = Number(port.value);
  const envSecure = parseBoolean(process.env.SMTP_SECURE);
  let secure = envSecure ?? resolvedPort === 465;

  // Port 587 expects STARTTLS; force secure=false there even if misconfigured to true.
  if (resolvedPort === 587 && secure) {
    secure = false;
  }

  const requireTLS = !secure && resolvedPort === 587;

  return {
    host: host.value,
    port: resolvedPort,
    secure,
    requireTLS,
    user: user.value,
    pass: pass.value,
    from: from.value || user.value,
  };
}

function getMailConfigStatus() {
  const host = readEnvValue(envFallbacks.host).value;
  const port = readEnvValue(envFallbacks.port).value;
  const user = readEnvValue(envFallbacks.user).value;
  const pass = readEnvValue(envFallbacks.pass).value;
  const missing = [
    { label: 'SMTP host (SMTP_HOST | BREVO_SMTP_HOST | BREVO_SMTP_SERVER)', found: host },
    { label: 'SMTP port (SMTP_PORT | BREVO_SMTP_PORT)', found: port },
    { label: 'SMTP user/login (SMTP_USER | BREVO_SMTP_LOGIN)', found: user },
    { label: 'SMTP password/key (SMTP_PASS | BREVO_SMTP_KEY)', found: pass },
  ]
    .filter((entry) => !entry.found)
    .map((entry) => entry.label);

  return { ready: missing.length === 0, missing };
}

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const { host, port, secure, requireTLS, user, pass } = getMailConfig();
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    auth: {
      user,
      pass,
    },
  });
  return transporter;
}

function isEmailConfigured() {
  return getMailConfigStatus().ready;
}

function normalizeEmail(email) {
  return email?.toString().trim().toLowerCase();
}

async function sendEmail({ to, subject, html }) {
  const recipient = normalizeEmail(to);
  if (!recipient) {
    throw new Error('A valid recipient email is required.');
  }

  console.log(`[EMAIL] Queued: ${subject} → ${recipient}`);

  try {
    const { from } = getMailConfig();
    const mailer = getTransporter();

    console.log(`[EMAIL] Sending: ${subject} → ${recipient}`);
    
    const info = await mailer.sendMail({
      from: `NeonArc Casino <${from}>`,
      to: recipient,
      subject,
      html,
    });

    console.log(`[EMAIL] ✓ Sent: ${subject} → ${recipient} (Message ID: ${info.messageId})`);
    return info;
  } catch (error) {
    console.error(`[EMAIL] ✗ Failed: ${subject} → ${recipient} - ${error.message}`);
    throw error;
  }
}

const welcomeHtml = `
     <html><head></head><body style="margin:0; padding:0; background:#000000; width:100%; font-family:Arial, sans-serif;">

    <!-- Wrapper -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#000000;">
      <tbody><tr>
        <td align="center">

          <!-- Container -->
          <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%; background:#0a0015; border-radius:10px; overflow:hidden;">

            <!-- HEADER -->
            <tbody><tr>
              <td style="padding:40px 20px; text-align:center;">

                <h1 style="
                  font-size:32px;
                  color:#00ffff;
                  font-weight:bold;
                  margin:0;
                  text-shadow:0 0 10px #00ffff;
                ">
                  WELCOME TO NEONARC CASINO
                </h1>

                <p style="
                  margin:12px 0 0 0;
                  font-size:15px;
                  color:#ff00ff;
                  text-shadow:0 0 8px #ff00ff;
                ">
                  Where every game lights up the night.
                </p>

              </td>
            </tr>

            <!-- SECTION TITLE -->
            <tr>
              <td style="padding:20px; text-align:center;">
                <h2 style="
                  margin:0;
                  font-size:22px;
                  color:#00ffff;
                  text-shadow:0 0 10px #00ffff;
                ">
                  Experience The Future
                </h2>
              </td>
            </tr>

            <!-- GAME CARD 1 -->
            <tr>
              <td style="padding:0 20px 20px 20px;">
                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #00ffff; border-radius:8px; background:#000000;">
                  <tbody><tr>
                    <td style="padding:20px;">

                      <div style="font-size:20px; font-weight:bold; color:#ff00ff; margin-bottom:8px;">
                        🚀 Rocket Rush
                      </div>

                      <div style="font-size:14px; color:#cccccc;">
                        Ride the multiplier skyward, but bail before it bursts!
                      </div>

                    </td>
                  </tr>
                </tbody></table>
              </td>
            </tr>

            <!-- GAME CARD 2 -->
            <tr>
              <td style="padding:0 20px 20px 20px;">
                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #00ffff; border-radius:8px; background:#000000;">
                  <tbody><tr>
                    <td style="padding:20px;">

                      <div style="font-size:20px; font-weight:bold; color:#ff00ff; margin-bottom:8px;">
                        💫 Pulse Cash
                      </div>

                      <div style="font-size:14px; color:#cccccc;">
                        Time your taps and follow the beat to win big.
                      </div>

                    </td>
                  </tr>
                </tbody></table>
              </td>
            </tr>

            <!-- GAME CARD 3 -->
            <tr>
              <td style="padding:0 20px 20px 20px;">
                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #00ffff; border-radius:8px; background:#000000;">
                  <tbody><tr>
                    <td style="padding:20px;">

                      <div style="font-size:20px; font-weight:bold; color:#ff00ff; margin-bottom:8px;">
                        🃏 StackJack
                      </div>

                      <div style="font-size:14px; color:#cccccc;">
                        A futuristic spin on blackjack with layered strategy.
                      </div>

                    </td>
                  </tr>
                </tbody></table>
              </td>
            </tr>

            <!-- BUTTON CTA -->
            <tr>
              <td style="padding:30px; text-align:center;">

                <a href="https://neonarc-casino.onrender.com/app" style="
                    display:inline-block;
                    padding:14px 32px;
                    background:#00ffff;
                    color:#000000;
                    font-weight:bold;
                    text-decoration:none;
                    border-radius:6px;
                    box-shadow:0 0 10px #00ffff;
                  ">
                  Explore Games
                </a>

              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="background:#0a0015; padding:25px; text-align:center;">

                <div style="color:#bbbbbb; font-size:12px; line-height:18px;">
                  NeonArc Casino — designed by innovators, powered by you.
                  <br><br>
                  <a href="mailto:neonarccasino@outlook.com" style="color:#00ffff; text-decoration:none;">
                    Support
                  </a>
                </div>

              </td>
            </tr>

          </tbody></table>

        </td>
      </tr>
    </tbody></table>

  

</body></html>`;

const promoHtml = `<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background:#000000; font-family:Arial, sans-serif; color:#ffffff;">

    <!-- WRAPPER -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
      <tr>
        <td align="center">

          <!-- CONTAINER -->
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
            style="width:600px; max-width:100%; background:#0a0015; border-radius:10px;">

            <!-- HEADER -->
            <tr>
              <td style="padding:40px 20px; text-align:center;">

                <h1 style="margin:0; font-size:32px; font-weight:bold; color:#00ffff; text-shadow:0 0 10px #00ffff;">
                  UNLOCK UNLIMITED GAMING
                </h1>

                <p style="margin-top:12px; font-size:15px; color:#ff00ff; text-shadow:0 0 6px #ff00ff;">
                  Power up your experience with NeonArc Credits
                </p>

              </td>
            </tr>

            <!-- BIG COIN -->
            <tr>
              <td style="padding:10px 20px 20px 20px; text-align:center;">
                <div style="font-size:70px; text-shadow:0 0 15px rgba(255,215,0,0.8);">
                  💰
                </div>
              </td>
            </tr>

            <!-- SECTION TITLE -->
            <tr>
              <td style="padding:20px; text-align:center;">
                <h2 style="margin:0; font-size:24px; color:#00ffff; text-shadow:0 0 10px #00ffff;">
                  Why Credits Change Everything
                </h2>
              </td>
            </tr>

            <!-- BENEFIT CARD 1 -->
            <tr>
              <td style="padding:0 20px 20px 20px;">
                <table role="presentation" width="100%" style="border:1px solid #00ffff; border-radius:8px; background:#000000;">
                  <tr>
                    <td style="padding:20px;">

                      <div style="font-size:32px; margin-bottom:10px; text-shadow:0 0 12px #ff00ff;">🎮</div>

                      <div style="font-size:20px; font-weight:bold; color:#ff00ff; margin-bottom:6px;">
                        Play More Games
                      </div>

                      <div style="font-size:14px; color:#cccccc;">
                        Access all premium games and exclusive content
                      </div>

                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- BENEFIT CARD 2 -->
            <tr>
              <td style="padding:0 20px 20px 20px;">
                <table role="presentation" width="100%" style="border:1px solid #00ffff; border-radius:8px; background:#000000;">
                  <tr>
                    <td style="padding:20px;">

                      <div style="font-size:32px; margin-bottom:10px; text-shadow:0 0 12px #ff00ff;">💎</div>

                      <div style="font-size:20px; font-weight:bold; color:#ff00ff; margin-bottom:6px;">
                        Bigger Wins
                      </div>

                      <div style="font-size:14px; color:#cccccc;">
                        Higher stakes mean exponential rewards
                      </div>

                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- BENEFIT CARD 3 -->
            <tr>
              <td style="padding:0 20px 20px 20px;">
                <table role="presentation" width="100%" style="border:1px solid #00ffff; border-radius:8px; background:#000000;">
                  <tr>
                    <td style="padding:20px;">

                      <div style="font-size:32px; margin-bottom:10px; text-shadow:0 0 12px #ff00ff;">👑</div>

                      <div style="font-size:20px; font-weight:bold; color:#ff00ff; margin-bottom:6px;">
                        VIP Status
                      </div>

                      <div style="font-size:14px; color:#cccccc;">
                        Join elite players with priority support
                      </div>

                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- BENEFIT CARD 4 -->
            <tr>
              <td style="padding:0 20px 20px 20px;">
                <table role="presentation" width="100%" style="border:1px solid #00ffff; border-radius:8px; background:#000000;">
                  <tr>
                    <td style="padding:20px;">

                      <div style="font-size:32px; margin-bottom:10px; text-shadow:0 0 12px #ff00ff;">⚡</div>

                      <div style="font-size:20px; font-weight:bold; color:#ff00ff; margin-bottom:6px;">
                        Bonus Multipliers
                      </div>

                      <div style="font-size:14px; color:#cccccc;">
                        Stack bonuses and watch your winnings soar
                      </div>

                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- STATS SECTION -->
            <tr>
              <td style="padding:30px 20px; text-align:center;">

                <table role="presentation" width="100%" style="background:#000000; border:1px solid #00ffff; border-radius:10px;">
                  <tr>
                    <td style="padding:25px;">

                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>

                          <td style="width:33%; text-align:center; padding:10px;">
                            <div style="font-size:32px; color:#00ffff; text-shadow:0 0 10px #00ffff;">∞</div>
                            <div style="font-size:12px; color:#cccccc;">Endless Possibilities</div>
                          </td>

                          <td style="width:33%; text-align:center; padding:10px;">
                            <div style="font-size:32px;">💵</div>
                            <div style="font-size:12px; color:#cccccc;">Redeem For Cash</div>
                          </td>

                          <td style="width:33%; text-align:center; padding:10px;">
                            <div style="font-size:32px; color:#00ffff; text-shadow:0 0 10px #00ffff;">50%</div>
                            <div style="font-size:12px; color:#cccccc;">OFF Black Friday</div>
                          </td>

                        </tr>
                      </table>

                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- BUTTONS -->
            <tr>
              <td style="padding:30px; text-align:center;">

                <a href="https://neonarc-casino.onrender.com/app"
                  style="display:inline-block; padding:14px 32px; background:#ff00ff; color:#ffffff; text-decoration:none;
                         font-weight:bold; border-radius:6px; box-shadow:0 0 10px #ff00ff; margin-right:10px;">
                  Buy Credits Now
                </a>

                <a href="https://neonarc-casino.onrender.com/app"
                  style="display:inline-block; padding:14px 32px; background:#00ffff; color:#000000; text-decoration:none;
                         font-weight:bold; border-radius:6px; box-shadow:0 0 10px #00ffff;">
                  View Packages
                </a>

              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding:30px; text-align:center; background:#0a0015; color:#bbbbbb; font-size:12px;">

                NeonArc Casino — where credits turn into legends.
                <br><br>

                <a href="mailto:neonarccasino@outlook.com" style="color:#00ffff; text-decoration:none;">
                  Support
                </a>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </body>
</html>
`;

async function sendWelcomeEmail(to) {
  console.log(`[EMAIL] Welcome email queued for: ${to}`);
  return sendEmail({ to, subject: 'Welcome to NeonArc Casino', html: welcomeHtml });
}

async function sendCreditPromoEmail(to) {
  console.log(`[EMAIL] Promo email queued for: ${to}`);
  return sendEmail({ to, subject: 'Why NeonArc Credits Change Everything', html: promoHtml });
}

async function sendCustomEmail(to, subject, html) {
  console.log(`[EMAIL] Custom email queued for: ${to}`);
  return sendEmail({ to, subject, html });
}

module.exports = {
  getMailConfigStatus,
  isEmailConfigured,
  sendWelcomeEmail,
  sendCreditPromoEmail,
  sendCustomEmail,
};
