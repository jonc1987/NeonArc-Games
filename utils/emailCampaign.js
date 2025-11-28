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

  return {
    host: host.value,
    port: Number(port.value),
    secure:
      typeof process.env.SMTP_SECURE === 'string'
        ? process.env.SMTP_SECURE === 'true'
        : Number(port.value) === 465,
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
  const { host, port, secure, user, pass } = getMailConfig();
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
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

  const { from } = getMailConfig();
  const mailer = getTransporter();

  await mailer.sendMail({
    from,
    to: recipient,
    subject,
    html,
  });
}

const welcomeHtml = `<!doctype html>
<html lang="en">
 <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NeonArc Casino - Welcome</title>
  <script src="/_sdk/element_sdk.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    body {
      box-sizing: border-box;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Orbitron', sans-serif;
      background: #000000;
      color: #ffffff;
      overflow-x: hidden;
      width: 100%;
    }
    
    .email-wrapper {
      width: 100%;
      min-height: 100%;
      background: linear-gradient(180deg, #0a0015 0%, #000000 50%, #0a0015 100%);
      position: relative;
    }
    
    .neon-grid {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: 
        linear-gradient(rgba(0, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: 1;
    }
    
    .content-container {
      position: relative;
      z-index: 2;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    
    /* Header */
    .header {
      text-align: center;
      padding: 80px 20px 100px;
      margin-bottom: 60px;
      background: radial-gradient(ellipse at center, rgba(138, 43, 226, 0.15) 0%, transparent 70%);
      position: relative;
      overflow: hidden;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(0, 255, 255, 0.15) 0%, transparent 70%);
      transform: translate(-50%, -50%);
      animation: glow-pulse 4s ease-in-out infinite;
    }
    
    .header::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: 
        linear-gradient(90deg, transparent 0%, rgba(255, 0, 255, 0.1) 50%, transparent 100%),
        linear-gradient(0deg, transparent 0%, rgba(0, 255, 255, 0.1) 50%, transparent 100%);
      animation: cross-glow 3s ease-in-out infinite;
    }
    
    @keyframes glow-pulse {
      0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
    }
    
    @keyframes cross-glow {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.7; }
    }
    
    .main-title {
      font-size: 56px;
      font-weight: 900;
      letter-spacing: 6px;
      margin-bottom: 25px;
      background: linear-gradient(135deg, #00ffff 0%, #ff00ff 50%, #00ffff 100%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: 0 0 40px rgba(0, 255, 255, 0.6);
      animation: title-glow 3s ease-in-out infinite, gradient-shift 5s linear infinite;
      position: relative;
      z-index: 2;
    }
    
    @keyframes title-glow {
      0%, 100% { filter: brightness(1) drop-shadow(0 0 30px rgba(0, 255, 255, 0.5)); }
      50% { filter: brightness(1.4) drop-shadow(0 0 50px rgba(255, 0, 255, 0.8)); }
    }
    
    @keyframes gradient-shift {
      0% { background-position: 0% center; }
      100% { background-position: 200% center; }
    }
    
    .tagline {
      font-size: 20px;
      color: #00ffff;
      text-shadow: 0 0 15px rgba(0, 255, 255, 0.9), 0 0 30px rgba(0, 255, 255, 0.5);
      letter-spacing: 3px;
      position: relative;
      z-index: 2;
      animation: tagline-flicker 4s ease-in-out infinite;
    }
    
    @keyframes tagline-flicker {
      0%, 100% { opacity: 1; }
      45%, 55% { opacity: 0.95; }
      50% { opacity: 0.9; }
    }
    
    /* Welcome Bonus */
    .bonus-section {
      background: linear-gradient(135deg, rgba(255, 0, 255, 0.1) 0%, rgba(138, 43, 226, 0.1) 100%);
      border: 2px solid #ff00ff;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
      margin-bottom: 50px;
      box-shadow: 0 0 30px rgba(255, 0, 255, 0.3);
      position: relative;
    }
    
    .bonus-section::after {
      content: '★';
      position: absolute;
      top: -15px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 30px;
      color: #ff00ff;
      text-shadow: 0 0 20px #ff00ff;
      animation: star-spin 4s linear infinite;
    }
    
    @keyframes star-spin {
      from { transform: translateX(-50%) rotate(0deg); }
      to { transform: translateX(-50%) rotate(360deg); }
    }
    
    .bonus-label {
      font-size: 16px;
      color: #cccccc;
      margin-bottom: 15px;
      letter-spacing: 2px;
    }
    
    .bonus-amount {
      font-size: 56px;
      font-weight: 900;
      color: #ff00ff;
      text-shadow: 0 0 30px #ff00ff, 0 0 60px #ff00ff;
      margin-bottom: 10px;
      animation: bonus-pulse 2s ease-in-out infinite;
    }
    
    @keyframes bonus-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    .bonus-text {
      font-size: 14px;
      color: #cccccc;
      letter-spacing: 1px;
    }
    
    /* Games Grid */
    .games-section {
      margin-bottom: 50px;
    }
    
    .section-title {
      font-size: 32px;
      color: #00ffff;
      text-align: center;
      margin-bottom: 40px;
      text-shadow: 0 0 20px rgba(0, 255, 255, 0.8);
      letter-spacing: 3px;
    }
    
    .games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 25px;
      margin-bottom: 30px;
    }
    
    .game-card {
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(20, 0, 40, 0.6) 100%);
      border: 2px solid rgba(0, 255, 255, 0.4);
      border-radius: 16px;
      padding: 35px 30px;
      transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      cursor: pointer;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
      text-decoration: none;
      display: block;
    }
    
    .game-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 0, 255, 0.3), rgba(0, 255, 255, 0.3), transparent);
      transition: left 0.6s ease;
    }
    
    .game-card::after {
      content: '';
      position: absolute;
      top: -2px;
      left: -2px;
      right: -2px;
      bottom: -2px;
      background: linear-gradient(135deg, #ff00ff, #00ffff);
      opacity: 0;
      filter: blur(15px);
      z-index: -1;
      transition: opacity 0.4s ease;
    }
    
    .game-card:hover::before {
      left: 100%;
    }
    
    .game-card:hover::after {
      opacity: 0.6;
    }
    
    .game-card:hover {
      border-color: #ff00ff;
      box-shadow: 0 10px 40px rgba(255, 0, 255, 0.5), 0 0 60px rgba(0, 255, 255, 0.3);
      transform: translateY(-8px) scale(1.02);
    }
    
    .game-icon {
      font-size: 48px;
      margin-bottom: 18px;
      display: block;
      filter: drop-shadow(0 0 10px rgba(0, 255, 255, 0.6));
      transition: all 0.3s ease;
    }
    
    .game-card:hover .game-icon {
      filter: drop-shadow(0 0 20px rgba(255, 0, 255, 0.9));
      transform: scale(1.1);
    }
    
    .game-title {
      font-size: 24px;
      color: #ff00ff;
      margin-bottom: 15px;
      font-weight: 700;
      text-shadow: 0 0 15px rgba(255, 0, 255, 0.6);
      letter-spacing: 1px;
    }
    
    .game-description {
      font-size: 14px;
      color: #bbbbbb;
      line-height: 1.7;
      letter-spacing: 0.5px;
    }
    
    /* CTA Buttons */
    .cta-section {
      text-align: center;
      margin-bottom: 60px;
    }
    
    .cta-buttons {
      display: flex;
      gap: 20px;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .btn {
      padding: 20px 50px;
      font-size: 19px;
      font-weight: 700;
      font-family: 'Orbitron', sans-serif;
      border: 3px solid;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      letter-spacing: 3px;
      position: relative;
      overflow: hidden;
      text-transform: uppercase;
      text-decoration: none;
      display: inline-block;
    }
    
    .btn::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.4);
      transform: translate(-50%, -50%);
      transition: width 0.6s ease, height 0.6s ease;
    }
    
    .btn:hover::before {
      width: 400px;
      height: 400px;
    }
    
    .btn::after {
      content: '';
      position: absolute;
      inset: -3px;
      background: linear-gradient(135deg, #ff00ff, #00ffff);
      opacity: 0;
      z-index: -1;
      filter: blur(20px);
      transition: opacity 0.4s ease;
    }
    
    .btn:hover::after {
      opacity: 1;
    }
    
    .btn span {
      position: relative;
      z-index: 1;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #ff00ff, #8a2be2);
      border-color: #ff00ff;
      color: #ffffff;
      box-shadow: 0 0 30px rgba(255, 0, 255, 0.6), inset 0 0 20px rgba(255, 0, 255, 0.2);
    }
    
    .btn-primary:hover {
      box-shadow: 0 0 60px rgba(255, 0, 255, 1), 0 10px 40px rgba(255, 0, 255, 0.5), inset 0 0 30px rgba(255, 0, 255, 0.4);
      transform: translateY(-5px) scale(1.05);
      border-color: #ffffff;
    }
    
    .btn-secondary {
      background: linear-gradient(135deg, #00ffff, #0099cc);
      border-color: #00ffff;
      color: #000000;
      box-shadow: 0 0 30px rgba(0, 255, 255, 0.6), inset 0 0 20px rgba(0, 255, 255, 0.2);
    }
    
    .btn-secondary:hover {
      box-shadow: 0 0 60px rgba(0, 255, 255, 1), 0 10px 40px rgba(0, 255, 255, 0.5), inset 0 0 30px rgba(0, 255, 255, 0.4);
      transform: translateY(-5px) scale(1.05);
      border-color: #ffffff;
    }
    
    /* Footer */
    .footer {
      background: linear-gradient(180deg, rgba(138, 43, 226, 0.2) 0%, rgba(0, 0, 0, 0.5) 100%);
      border-top: 2px solid rgba(0, 255, 255, 0.3);
      padding: 40px 20px;
      text-align: center;
      position: relative;
    }
    
    .footer::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, #00ffff, #8a2be2, #ff00ff, transparent);
      animation: line-scan 3s linear infinite;
    }
    
    @keyframes line-scan {
      from { transform: translateX(-100%); }
      to { transform: translateX(100%); }
    }
    
    .footer-links {
      display: flex;
      gap: 30px;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 25px;
    }
    
    .footer-link {
      color: #00ffff;
      text-decoration: none;
      font-size: 14px;
      letter-spacing: 1px;
      transition: all 0.3s ease;
      position: relative;
    }
    
    .footer-link::after {
      content: '';
      position: absolute;
      bottom: -3px;
      left: 0;
      width: 0;
      height: 2px;
      background: #00ffff;
      transition: width 0.3s ease;
    }
    
    .footer-link:hover {
      color: #ff00ff;
      text-shadow: 0 0 10px #ff00ff;
    }
    
    .footer-link:hover::after {
      width: 100%;
      background: #ff00ff;
    }
    
    .footer-tagline {
      font-size: 13px;
      color: #888888;
      letter-spacing: 1px;
      line-height: 1.6;
    }
    
    /* Scroll reveal animations */
    .scroll-reveal {
      opacity: 0;
      transform: translateY(30px);
      transition: all 0.6s ease;
    }
    
    .scroll-reveal.revealed {
      opacity: 1;
      transform: translateY(0);
    }
    
    @media (max-width: 768px) {
      .main-title {
        font-size: 36px;
        letter-spacing: 3px;
      }
      
      .tagline {
        font-size: 16px;
      }
      
      .section-title {
        font-size: 26px;
      }
      
      .games-grid {
        grid-template-columns: 1fr;
      }
      
      .cta-buttons {
        flex-direction: column;
        align-items: center;
      }
      
      .btn {
        width: 100%;
        max-width: 320px;
        padding: 18px 40px;
        font-size: 16px;
      }
    }
  </style>
  <style>@view-transition { navigation: auto; }</style>
  <script src="/_sdk/data_sdk.js" type="text/javascript"></script>
  <script src="https://cdn.tailwindcss.com" type="text/javascript"></script>
 </head>
 <body>
  <div class="neon-grid"></div>
  <div class="email-wrapper">
   <div class="content-container"><!-- Header -->
    <header class="header">
     <h1 class="main-title" id="mainTitle">WELCOME TO NEONARC CASINO</h1>
     <p class="tagline" id="tagline">Where every game lights up the night.</p>
    </header><!-- Games Section -->
    <section class="games-section scroll-reveal">
     <h2 class="section-title">Experience The Future</h2>
     <div class="games-grid"><a href="https://neonarc-casino.onrender.com/app" target="_blank" rel="noopener noreferrer" class="game-card"> <span class="game-icon">🚀</span> <h3 class="game-title">Rocket Rush</h3><p class="game-description">Ride the multiplier skyward, but bail before it bursts!</p></a> <a href="https://neonarc-casino.onrender.com/app" target="_blank" rel="noopener noreferrer" class="game-card"> <span class="game-icon">💫</span> <h3 class="game-title">Pulse Cash</h3><p class="game-description">Time your taps and follow the beat to win big.</p></a> <a href="https://neonarc-casino.onrender.com/app" target="_blank" rel="noopener noreferrer" class="game-card"> <span class="game-icon">🃏</span> <h3 class="game-title">StackJack</h3><p class="game-description">A futuristic spin on blackjack with layered strategy.</p></a> <a href="https://neonarc-casino.onrender.com/app" target="_blank" rel="noopener noreferrer" class="game-card"> <span class="game-icon">🔢</span> <h3 class="game-title">Binary Poker</h3><p class="game-description">Think in code, bet in logic — match binary hands for rewards.</p></a> <a href="https://neonarc-casino.onrender.com/app" target="_blank" rel="noopener noreferrer" class="game-card"> <span class="game-icon">🧠</span> <h3 class="game-title">Mind Bet</h3><p class="game-description">Guess the system's "mood" — logic meets instinct.</p></a>
     </div>
    </section><!-- CTA Section -->
    <section class="cta-section scroll-reveal">
     <div class="cta-buttons"><a href="https://neonarc-casino.onrender.com/app" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" id="secondaryButton"> <span>Explore Games</span> </a>
     </div>
    </section><!-- Footer -->
    <footer class="footer">
     <nav class="footer-links"><a href="https://neonarc-casino.onrender.com/app" class="footer-link" target="_blank" rel="noopener noreferrer">Account Hub</a> <a href="mailto:neonarccasino@outlook.com" class="footer-link">Support</a>
     </nav>
     <p class="footer-tagline" id="footerTagline">NeonArc Casino — designed by innovators, powered by you.</p>
    </footer>
   </div>
  </div>
  </script>
 <script>(function(){function c(){var b=a.contentDocument||a.contentWindow.document;if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'9a54d41e60774b5c',t:'MTc2NDI4MDA5NC4wMDAwMDA='};var a=document.createElement('script');a.nonce='';a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script></body>
</html>`;

async function sendWelcomeEmail(to) {
  return sendEmail({ to, subject: 'Welcome to NeonArc Casino', html: welcomeHtml });
}

async function sendCreditPromoEmail(to) {
  return sendEmail({ to, subject: 'Why NeonArc Credits Change Everything', html: promoHtml });
}

module.exports = {
  getMailConfigStatus,
  isEmailConfigured,
  sendWelcomeEmail,
  sendCreditPromoEmail,
};
