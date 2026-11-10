
// Email sending through Brevo's HTTPS API.
// If BREVO_API_KEY is not configured, emails are printed in the terminal
// for local development and testing.

const API_URL = 'https://api.brevo.com/v3/smtp/email';

const configured = !!process.env.BREVO_API_KEY;

// Supports both:
// Remember Me <noreply@example.com>
// noreply@example.com
const FROM = process.env.MAIL_FROM || 'Remember Me <no-reply@localhost>';

function parseSender(value) {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);

  if (match) {
    return {
      name: match[1].replace(/^["']|["']$/g, '').trim() || 'Remember Me',
      email: match[2].trim()
    };
  }

  return {
    name: 'Remember Me',
    email: value.trim()
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

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
    console.log(`\n────────── 📧 EMAIL (Brevo API not configured – not actually sent) ──────────
To:      ${to}
Subject: ${subject}

${text}
────────────────────────────────────────────────────────────────────────\n`);

    return true;
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: parseSender(FROM),
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = result.message || result.code || `HTTP ${response.status}`;
      throw new Error(message);
    }

    console.log(`📧 Sent "${subject}" → ${to}`);
    console.log(`   Brevo message ID: ${result.messageId || 'Not provided'}`);

    return true;

  } catch (err) {
    console.error(`❌ Email "${subject}" → ${to} FAILED: ${err.message}`);

    if (err.message.includes('unauthorized') || err.message.includes('Key not found')) {
      console.error('   → Check your BREVO_API_KEY in the environment variables.');
    } else {
      console.error('   → Check your Brevo API key, verified sender, and network connection.');
    }

    return false;
  }
}

module.exports = { send, layout, esc, configured };
