// Remember Me — reconnect with old school mates
// Run: npm install && npm start  (Node 22.5+ required for built-in SQLite)
// Load settings from .env if present (Node 21.7+ built-in, no extra package)
try { process.loadEnvFile(require('node:path').join(__dirname, '.env')); } catch { /* no .env file – fine */ }
const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { checkAnswer } = require('./answer-match');
const mailer = require('./mailer');

const PORT = process.env.PORT || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'data.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  school TEXT,
  grad_year INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school TEXT NOT NULL,
  city TEXT,
  year_from INTEGER,
  year_to INTEGER,
  looking_for TEXT,
  title TEXT NOT NULL,
  memory TEXT NOT NULL,
  question TEXT,
  answer_hash TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hint_id INTEGER NOT NULL REFERENCES hints(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  answer TEXT,
  answer_ok INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(hint_id, user_id)
);
`);
// migration: store the accepted answers privately so they can be matched flexibly (never sent to other users)
try { db.exec('ALTER TABLE hints ADD COLUMN answers TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN email_alerts INTEGER NOT NULL DEFAULT 1'); } catch { /* already exists */ }
db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
)`);

// ---------- helpers ----------
const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};
const verifyPassword = (pw, stored) => {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
};
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sha = (s) => crypto.createHash('sha256').update(norm(s)).digest('hex');
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const year = (v) => {
  const n = parseInt(v, 10);
  return n >= 1930 && n <= 2100 ? n : null;
};
const SESSION_DAYS = 30;

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
      const i = c.indexOf('=');
      return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
    })
  );
}
function setSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  res.setHeader('Set-Cookie',
    `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}` +
    (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
}
app.use((req, _res, next) => {
  const sid = parseCookies(req).sid;
  if (sid) {
    const row = db.prepare(`SELECT u.id, u.name, u.email, u.school, u.grad_year, u.email_alerts FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`).get(sid, Date.now());
    if (row) { req.user = row; req.sid = sid; }
  }
  next();
});
const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please log in first.' });

// simple in-memory rate limit for auth endpoints
const hits = new Map();
const limit = (req, res, next) => {
  const key = req.ip + req.path, now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 15 * 60e3);
  if (arr.length >= 20) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  arr.push(now); hits.set(key, arr); next();
};

// ---------- auth ----------
app.post('/api/signup', limit, (req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'An account with that email already exists.' });
  const r = db.prepare('INSERT INTO users (name, email, password_hash, school, grad_year) VALUES (?,?,?,?,?)')
    .run(name, email, hashPassword(password), clean(req.body.school, 120) || null, year(req.body.grad_year));
  setSession(res, Number(r.lastInsertRowid));
  res.json({ ok: true });
});

app.post('/api/login', limit, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(clean(req.body.email, 120).toLowerCase());
  if (!u || !verifyPassword(String(req.body.password || ''), u.password_hash))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  setSession(res, u.id);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  if (req.sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sid);
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ user: req.user || null }));

// ---------- password reset ----------
const RESET_MINUTES = 60;
app.post('/api/forgot', limit, (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const u = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(u.id); // only the newest link works
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)')
      .run(sha(token), u.id, Date.now() + RESET_MINUTES * 60e3);
    const url = `${APP_URL}/#/reset?token=${token}`;
    mailer.send({
      to: u.email,
      subject: 'Reset your Remember Me password',
      text: `Hi ${firstName(u.name)},\n\nClick this link to choose a new password (valid for ${RESET_MINUTES} minutes):\n${url}\n\nIf you didn't ask for this, just ignore this email.`,
      html: mailer.layout({
        heading: 'Reset your password',
        body: `<p>Hi ${mailer.esc(firstName(u.name))},</p><p>Someone (hopefully you) asked to reset the password for your Remember Me account. Click below to choose a new one. This link works once and expires in <b>${RESET_MINUTES} minutes</b>.</p>`,
        button: { label: 'Choose a new password', url },
        footer: "Didn't ask for this? You can safely ignore this email — your password won't change.",
      }),
    });
  }
  // Same reply whether or not the email exists, so nobody can probe which emails are registered
  res.json({ ok: true });
});

app.post('/api/reset', limit, (req, res) => {
  const token = String(req.body.token || ''), password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha(token));
  if (!row || row.used || row.expires_at < Date.now())
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(row.token_hash);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id); // log out everywhere else
  setSession(res, row.user_id);
  res.json({ ok: true });
});

// ---------- account settings ----------
app.post('/api/settings', auth, (req, res) => {
  db.prepare('UPDATE users SET email_alerts = ? WHERE id = ?').run(req.body.email_alerts ? 1 : 0, req.user.id);
  res.json({ ok: true });
});

app.post('/api/change-password', auth, limit, (req, res) => {
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(req.body.current || ''), u.password_hash))
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  if (String(req.body.password || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(req.body.password)), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.sid);
  res.json({ ok: true });
});

// ---------- hints ----------
const hintSelect = `SELECT h.id, h.school, h.city, h.year_from, h.year_to, h.looking_for, h.title, h.memory,
  h.question, h.status, h.created_at, h.user_id, u.name AS author_name,
  (SELECT COUNT(*) FROM responses r WHERE r.hint_id = h.id) AS response_count
  FROM hints h JOIN users u ON u.id = h.user_id`;

const firstName = (n) => (n || '').split(' ')[0];
const publicHint = (h, me) => ({
  ...h,
  author_name: firstName(h.author_name), // only first name shown publicly
  mine: !!me && me.id === h.user_id,
  user_id: undefined,
});

app.get('/api/hints', (req, res) => {
  const q = clean(req.query.q, 100), school = clean(req.query.school, 100), yr = year(req.query.year);
  const where = [], params = [];
  if (q) {
    where.push('(h.title LIKE ? OR h.memory LIKE ? OR h.looking_for LIKE ? OR h.school LIKE ? OR h.city LIKE ?)');
    params.push(...Array(5).fill(`%${q}%`));
  }
  if (school) { where.push('h.school LIKE ?'); params.push(`%${school}%`); }
  if (yr) { where.push('(COALESCE(h.year_from, h.year_to) <= ? AND COALESCE(h.year_to, h.year_from) >= ?)'); params.push(yr, yr); }
  const sql = `${hintSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (h.status = 'reunited') ASC, h.id DESC LIMIT 100`;
  const rows = db.prepare(sql).all(...params);
  const stats = db.prepare(`SELECT (SELECT COUNT(*) FROM hints) AS hints,
    (SELECT COUNT(*) FROM hints WHERE status='reunited') AS reunited,
    (SELECT COUNT(DISTINCT school) FROM hints) AS schools`).get();
  res.json({ hints: rows.map((h) => publicHint(h, req.user)), stats });
});

app.get('/api/hints/:id', (req, res) => {
  const h = db.prepare(`${hintSelect} WHERE h.id = ?`).get(Number(req.params.id));
  if (!h) return res.status(404).json({ error: 'Hint not found.' });
  let myResponse = null;
  if (req.user) myResponse = db.prepare('SELECT id, status, message, created_at FROM responses WHERE hint_id = ? AND user_id = ?').get(h.id, req.user.id) || null;
  res.json({ hint: publicHint(h, req.user), myResponse });
});

app.post('/api/hints', auth, (req, res) => {
  const b = req.body;
  const school = clean(b.school, 120), title = clean(b.title, 120), memory = clean(b.memory, 1500);
  const question = clean(b.question, 200), answer = clean(b.answer, 100);
  if (!school) return res.status(400).json({ error: 'Which school was it?' });
  if (title.length < 4) return res.status(400).json({ error: 'Give your hint a short headline.' });
  if (memory.length < 20) return res.status(400).json({ error: 'Share a bit more of the memory (at least 20 characters).' });
  if (question && !answer) return res.status(400).json({ error: 'Add the answer to your secret question.' });
  const answers = question ? [answer, ...String(b.alt_answers || '').split(',').map((a) => clean(a, 100))]
    .filter(Boolean).slice(0, 10) : [];
  let yf = year(b.year_from), yt = year(b.year_to);
  if (yf && yt && yf > yt) [yf, yt] = [yt, yf];
  const r = db.prepare(`INSERT INTO hints (user_id, school, city, year_from, year_to, looking_for, title, memory, question, answer_hash, answers)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, school, clean(b.city, 80) || null, yf, yt,
    clean(b.looking_for, 80) || null, title, memory, question || null, question ? sha(answer) : null,
    answers.length ? JSON.stringify(answers) : null);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.delete('/api/hints/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM hints WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: r.changes > 0 });
});

// ---------- responses ("That's me!") ----------
app.post('/api/hints/:id/respond', auth, (req, res) => {
  const h = db.prepare('SELECT * FROM hints WHERE id = ?').get(Number(req.params.id));
  if (!h) return res.status(404).json({ error: 'Hint not found.' });
  if (h.user_id === req.user.id) return res.status(400).json({ error: "This is your own hint." });
  if (h.status === 'reunited') return res.status(400).json({ error: 'This hint has already found its person.' });
  const message = clean(req.body.message, 1000), answer = clean(req.body.answer, 100);
  if (message.length < 10) return res.status(400).json({ error: 'Write a short note so they know it’s really you.' });
  if (h.question && !answer) return res.status(400).json({ error: 'Please answer the secret question.' });
  // 1 = correct, 2 = close match (poster decides), 0 = wrong
  let answerOk = null;
  if (h.question) answerOk = h.answers ? checkAnswer(JSON.parse(h.answers), answer) : (sha(answer) === h.answer_hash ? 1 : 0);
  try {
    db.prepare('INSERT INTO responses (hint_id, user_id, message, answer, answer_ok) VALUES (?,?,?,?,?)')
      .run(h.id, req.user.id, message, answer || null, answerOk);
  } catch {
    return res.status(409).json({ error: 'You already responded to this hint.' });
  }
  // 📧 alert the person who posted the hint
  const owner = db.prepare('SELECT name, email, email_alerts FROM users WHERE id = ?').get(h.user_id);
  if (!owner.email_alerts) console.log(`📧 Skipped reply alert → ${owner.email} (they turned email alerts off)`);
  if (owner.email_alerts) {
    const verdict = answerOk === null ? '' : ['❌ Their secret answer didn’t match', '✅ They got your secret question right', '🟡 Their secret answer was a close match'][answerOk];
    mailer.send({
      to: owner.email,
      subject: `🙋 ${firstName(req.user.name)} thinks your hint is about them!`,
      text: `Hi ${firstName(owner.name)},\n\n${req.user.name} replied to your hint "${h.title}":\n\n"${message}"\n\n${verdict}\n\nReview it: ${APP_URL}/#/dashboard\n\nTurn off alerts: ${APP_URL}/#/settings`,
      html: mailer.layout({
        heading: 'Someone recognised your hint! 🙋',
        body: `<p>Hi ${mailer.esc(firstName(owner.name))},</p>
          <p><b>${mailer.esc(req.user.name)}</b> replied to your hint <b>“${mailer.esc(h.title)}”</b>:</p>
          <blockquote style="margin:14px 0;padding:12px 16px;background:#fbf6ec;border-left:4px solid #f2b33d;border-radius:6px;font-style:italic">${mailer.esc(message)}</blockquote>
          ${verdict ? `<p>${verdict}.</p>` : ''}
          <p>Is it really them? Log in to accept and swap contact details.</p>`,
        button: { label: 'Review the reply', url: `${APP_URL}/#/dashboard` },
        footer: `You get this because you posted a hint on Remember Me. <a href="${APP_URL}/#/settings" style="color:#55607a">Turn off email alerts</a>`,
      }),
    });
  }
  res.json({ ok: true });
});

app.get('/api/dashboard', auth, (req, res) => {
  const myHints = db.prepare(`${hintSelect} WHERE h.user_id = ? ORDER BY h.id DESC`).all(req.user.id)
    .map((h) => publicHint(h, req.user));
  const received = db.prepare(`SELECT r.id, r.hint_id, r.message, r.answer, r.answer_ok, r.status, r.created_at,
      h.title AS hint_title, h.question, h.answers AS my_answers, u.name AS from_name, u.school AS from_school, u.grad_year AS from_year,
      CASE WHEN r.status = 'accepted' THEN u.email END AS from_email
    FROM responses r JOIN hints h ON h.id = r.hint_id JOIN users u ON u.id = r.user_id
    WHERE h.user_id = ? ORDER BY r.status = 'pending' DESC, r.id DESC`).all(req.user.id)
    .map((r) => ({ ...r, my_answers: r.my_answers ? JSON.parse(r.my_answers) : null }));
  const sent = db.prepare(`SELECT r.id, r.hint_id, r.message, r.status, r.created_at, h.title AS hint_title, h.school,
      u.name AS to_name, CASE WHEN r.status = 'accepted' THEN u.email END AS to_email
    FROM responses r JOIN hints h ON h.id = r.hint_id JOIN users u ON u.id = h.user_id
    WHERE r.user_id = ? ORDER BY r.id DESC`).all(req.user.id)
    .map((s) => ({ ...s, to_name: s.status === 'accepted' ? s.to_name : firstName(s.to_name) }));
  res.json({ myHints, received, sent });
});

app.post('/api/responses/:id/:action(accept|decline)', auth, (req, res) => {
  const r = db.prepare(`SELECT r.*, h.user_id AS owner FROM responses r JOIN hints h ON h.id = r.hint_id WHERE r.id = ?`)
    .get(Number(req.params.id));
  if (!r || r.owner !== req.user.id) return res.status(404).json({ error: 'Response not found.' });
  const status = req.params.action === 'accept' ? 'accepted' : 'declined';
  db.prepare('UPDATE responses SET status = ? WHERE id = ?').run(status, r.id);
  if (status === 'accepted') {
    db.prepare("UPDATE hints SET status = 'reunited' WHERE id = ?").run(r.hint_id);
    // 📧 tell the responder they've been accepted
    const responder = db.prepare('SELECT name, email, email_alerts FROM users WHERE id = ?').get(r.user_id);
    const hint = db.prepare('SELECT title FROM hints WHERE id = ?').get(r.hint_id);
    if (!responder.email_alerts) console.log(`📧 Skipped accepted alert → ${responder.email} (they turned email alerts off)`);
    if (responder.email_alerts) {
      mailer.send({
        to: responder.email,
        subject: `🎉 ${req.user.name} says it's really you!`,
        text: `Hi ${firstName(responder.name)},\n\n${req.user.name} accepted your reply to "${hint.title}". You're reconnected!\n\nSay hello: ${req.user.email}\n\n${APP_URL}/#/dashboard`,
        html: mailer.layout({
          heading: 'You’re reconnected! 🎉',
          body: `<p>Hi ${mailer.esc(firstName(responder.name))},</p>
            <p><b>${mailer.esc(req.user.name)}</b> confirmed that you're the one they were looking for in <b>“${mailer.esc(hint.title)}”</b>.</p>
            <p style="background:#e1f3ea;border:1px solid #b7e0cb;color:#1d5e45;border-radius:10px;padding:12px 14px">Say hello at <a href="mailto:${mailer.esc(req.user.email)}" style="color:#1d5e45;font-weight:600">${mailer.esc(req.user.email)}</a></p>`,
          button: { label: 'Open Remember Me', url: `${APP_URL}/#/dashboard` },
          footer: `<a href="${APP_URL}/#/settings" style="color:#55607a">Turn off email alerts</a>`,
        }),
      });
    }
  }
  res.json({ ok: true });
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// cleanup expired sessions & reset links periodically
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(Date.now());
}, 3600e3).unref();

app.listen(PORT, () => {
  console.log(`Remember Me running at http://localhost:${PORT}`);
  console.log(mailer.configured ? `📧 Emails ON (via ${process.env.SMTP_HOST})` : '📧 Emails OFF – no SMTP set up, emails will be printed here instead (see .env.example)');
});
