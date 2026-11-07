// Email sending. Configure SMTP in a .env file (see .env.example).
// If SMTP is not configured, emails are printed in the terminal instead (handy for testing).
const nodemailer = require('nodemailer');

const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const PORT = Number(process.env.SMTP_PORT || 587);
const makeTransport = (port) => nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,                  // 465 = SSL from the start, 587 = STARTTLS
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000,
  pool: true, maxConnections: 2,         // reuse one connection instead of reconnecting for every email
});
// Main port from .env, plus the other common port as a backup (some networks/ISPs block one of them)
const transports = configured
  ? [{ port: PORT, t: makeTransport(PORT) }].concat(PORT === 587 || PORT === 465 ? [{ port: PORT === 587 ? 465 : 587, t: makeTransport(PORT === 587 ? 465 : 587) }] : [])
  : [];
let preferred = 0;                       // remembers which port last worked
const NETWORK_ERRORS = ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ESOCKET', 'ECONNECTION', 'EDNS', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FROM = process.env.MAIL_FROM || (configured ? `Remember Me <${process.env.SMTP_USER}>` : 'Remember Me <no-reply@localhost>');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Shared, email-client-safe layout (tables + inline styles)
function layout({ heading, body, button, footer }) {
  return `<!doctype html><html><body style="margin:0;background:#fbf6ec;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2a44">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf6ec;padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e6dccb;border-radius:16px;overflow:hidden">
      <tr><td style="background:#1f2a44;padding:20px 28px;color:#fff;font:700 20px Georgia,serif">
        <span style="display:inline-block;background:#f2b33d;color:#1f2a44;border-radius:8px;width:30px;height:30px;line-height:30px;text-align:center;margin-right:8px">R</span>Remember Me
      </td></tr>
      <tr><td style="padding:30px 28px 10px">
        <h1 style="font:700 24px Georgia,serif;margin:0 0 14px">${heading}</h1>
        <div style="font-size:15px;line-height:1.6">${body}</div>
        ${button ? `<p style="margin:26px 0 8px"><a href="${esc(button.url)}" style="background:#e2583e;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;display:inline-block">${esc(button.label)}</a></p>
        <p style="font-size:12px;color:#55607a;word-break:break-all">Or copy this link: ${esc(button.url)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:16px 28px 24px;border-top:1px dashed #e6dccb;font-size:12px;color:#55607a">${footer || ''}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

async function send({ to, subject, html, text }) {
  if (!configured) {
    console.log(`\n────────── 📧 EMAIL (SMTP not configured – not actually sent) ──────────
To:      ${to}
Subject: ${subject}

${text}
────────────────────────────────────────────────────────────────────────\n`);
    return true;
  }
  // Up to 3 rounds; each round tries the working port first, then the backup port
  let lastErr;
  for (let round = 0; round < 3; round++) {
    for (let k = 0; k < transports.length; k++) {
      const i = (preferred + k) % transports.length;
      try {
        await transports[i].t.sendMail({ from: FROM, to, subject, html, text });
        if (i !== preferred) console.log(`📧 Port ${transports[i].port} works better on this network – using it from now on.`);
        preferred = i;
        console.log(`📧 Sent "${subject}" → ${to}`);
        return true;
      } catch (err) {
        lastErr = err;
        const network = NETWORK_ERRORS.includes(err.code) || /timeout|timed out/i.test(err.message);
        if (!network) { round = 99; break; }   // e.g. wrong password – retrying won't help
      }
    }
    if (round < 2) await sleep(round === 0 ? 3000 : 10000);
  }
  console.error(`❌ Email "${subject}" → ${to} FAILED: ${lastErr.message}`);
  if (lastErr.code === 'EAUTH') console.error('   → Check SMTP_USER / SMTP_PASS in .env (Gmail needs an App Password, not your normal password).');
  else console.error('   → Could not reach the mail server. Check your internet, VPN, or antivirus/firewall "mail shield" blocking ports 587/465.');
  return false;
}

module.exports = { send, layout, esc, configured };
