# Remember Me — reconnect with old school mates

People sign up, log in and pin a **hint** (a memory, nickname, class, year) about an old classmate.
When that person reads it and recognises themselves, they tap **"That's me!"**, answer the poster's
optional **secret question**, and send a note. The poster accepts → both see each other's email.

## Run
Requires Node.js 22.5+ (uses the built-in `node:sqlite`, no database server needed).

    npm install
    npm start            # http://localhost:3000
    npm run seed         # optional: demo data (server must be running). Login: chioma@demo.test / password123

Env vars: `PORT`, `DB_PATH` (default ./data.db), `NODE_ENV=production` (adds Secure cookie – use HTTPS).

## Email alerts & password reset
Copy `.env.example` to `.env` and fill in your SMTP details (Gmail app password works) to send real emails.
Without `.env`, emails are printed in the terminal (reset links included), so you can still test.
- Emails: someone replies to your hint · your reply was accepted · password reset link
- Forgot password: link valid 60 min, single use, logs out other devices
- Settings page (⚙︎): email alerts on/off, change password

## Features
- Sign up / log in / log out (scrypt-hashed passwords, HttpOnly session cookies, rate-limited auth)
- Post hints: school, city, years, who you're looking for, headline, memory, secret question/answer (answer stored hashed)
- Public hint board with search by keyword, school and year
- "That's me!" replies with secret-answer check (poster sees ✅ correct / ❌ wrong)
- "My corner" dashboard: my hints, responses to me (accept / not them), my replies
- Contact details revealed only after acceptance; only first names shown publicly
- Hints marked REUNITED once matched; delete your own hints
- Responsive, nostalgic notebook / polaroid design

## Files
- `server.js` – Express API + SQLite
- `public/` – index.html, styles.css, app.js (vanilla JS single-page app)
- `seed.js` – demo data
