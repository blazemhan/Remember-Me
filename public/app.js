// Remember Me — front-end (vanilla JS, hash router)
const $app = document.getElementById('app');
const state = { user: null, pending: 0 };

// ---------- utils ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};
const toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2800);
};
const ago = (iso) => {
  const d = (Date.now() - new Date(iso.replace(' ', 'T') + 'Z')) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 2592000) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const years = (h) => h.year_from && h.year_to && h.year_from !== h.year_to ? `${h.year_from}–${h.year_to}` : (h.year_from || h.year_to || '');
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const showError = (form, msg) => { const e = form.querySelector('.form-error'); e.textContent = msg; e.classList.add('show'); };
const busy = (form, on) => { const b = form.querySelector('button[type=submit]'); if (b) { b.disabled = on; b.dataset.label ??= b.textContent; b.textContent = on ? 'Please wait…' : b.dataset.label; } };
const go = (hash) => { location.hash = hash; };

// ---------- nav ----------
function renderNav() {
  const r = location.hash || '#/';
  const a = (href, label, extra = '') => `<a href="${href}" class="${r === href ? 'active' : ''} ${extra}">${label}</a>`;
  document.getElementById('nav-links').innerHTML = state.user
    ? a('#/', 'Browse', 'nav-hide-sm') +
    a('#/dashboard', `My corner${state.pending ? `<span class="badge">${state.pending}</span>` : ''}`) +
    `<a href="#/post" class="btn btn-primary">+ Post a hint</a>` +
    a('#/settings', '⚙︎<span class="sr-only">Settings</span>', 'icon-link') +
    `<a href="#" id="logout">Log out</a>`
    : a('#/', 'Browse', 'nav-hide-sm') + a('#/login', 'Log in') + `<a href="#/signup" class="btn btn-primary">Join free</a>`;
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = async (e) => { e.preventDefault(); await api('/api/logout', { method: 'POST' }); state.user = null; toast('See you soon 👋'); go('#/'); render(); };
}
async function refreshMe() {
  state.user = (await api('/api/me')).user;
  if (state.user) {
    try { const d = await api('/api/dashboard'); state.pending = d.received.filter((r) => r.status === 'pending').length; } catch { state.pending = 0; }
  }
}

// ---------- components ----------
const hintCard = (h) => `
  <a class="hint-card fade-in" href="#/hint/${h.id}">
    ${h.status === 'reunited' ? '<span class="stamp">REUNITED</span>' : ''}
    <span class="school">${esc(h.school)}${h.city ? ' · ' + esc(h.city) : ''}</span>
    <h3>${esc(h.title)}</h3>
    <p class="memory">“${esc(h.memory)}”</p>
    <div class="meta">
      <span>${years(h) ? `<span class="chip">🎓 ${years(h)}</span>` : ''} ${h.looking_for ? `<span class="chip">🔎 ${esc(h.looking_for)}</span>` : ''}</span>
      <span>— ${esc(h.author_name)}, ${ago(h.created_at)}</span>
    </div>
  </a>`;

// ---------- pages ----------
async function pageHome() {
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  $app.innerHTML = `
    <section class="hero fade-in">
      <div>
        <span class="eyebrow">Hey, remember me?</span>
        <h1>Somewhere out there, <em>someone still remembers you.</em></h1>
        <p class="lead">Leave a little hint about an old school mate — a nickname, a seat in class, a silly moment only the two of you would know. When they read it, they'll remember. And you'll reconnect.</p>
        <div class="hero-cta">
          ${state.user ? '<a class="btn btn-accent" href="#/post">Leave a hint ✏️</a>' : '<a class="btn btn-accent" href="#/signup">Start looking — it\'s free</a>'}
          <a class="btn btn-ghost" href="#board">Read the hint board</a>
        </div>
        <div class="stats" id="stats"></div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="polaroid p1"><div class="ph">🏫</div><div class="cap">Class of '04</div></div>
        <div class="polaroid p2"><div class="ph">⚽</div><div class="cap">Sports day!</div></div>
        <div class="note-sticky"><span class="tape"></span>"You lent me your blue pen in Form 2 & never asked for it back…"</div>
      </div>
    </section>

    <section class="steps">
      <div class="step"><div class="num">1.</div><h3>Write a hint</h3><p>Share a memory, a nickname or an inside joke. Enough for them to recognise — not enough for strangers.</p></div>
      <div class="step"><div class="num">2.</div><h3>They recognise it</h3><p>Your old classmate spots the hint and taps <b>“That's me!”</b>, answering your secret question to prove it.</p></div>
      <div class="step"><div class="num">3.</div><h3>Reconnect</h3><p>You review their reply. Accept it and you both see each other's contact details. Simple, private, safe.</p></div>
    </section>

    <section id="board">
      <div class="section-head">
        <div><span class="eyebrow">the hint board</span><h2>Is one of these about you?</h2></div>
      </div>
      <form class="filters" id="filters">
        <input class="q" name="q" placeholder="Search memories, nicknames, places…" value="${esc(params.get('q') || '')}" />
        <input name="school" placeholder="School name" value="${esc(params.get('school') || '')}" />
        <input name="year" type="number" placeholder="Year" min="1930" max="2100" value="${esc(params.get('year') || '')}" />
        <button class="btn btn-primary" type="submit">Search</button>
      </form>
      <div id="hints" class="grid"></div>
    </section>`;

  const load = async (p) => {
    const box = document.getElementById('hints');
    const { hints, stats } = await api('/api/hints?' + p.toString());
    document.getElementById('stats').innerHTML = `
      <div class="stat"><b>${stats.hints}</b><span>hints posted</span></div>
      <div class="stat"><b>${stats.reunited}</b><span>friends reunited</span></div>
      <div class="stat"><b>${stats.schools}</b><span>schools</span></div>`;
    box.innerHTML = hints.length ? hints.map(hintCard).join('') : `
      <div class="empty" style="grid-column:1/-1"><div class="big">📭</div>
        <h3>No hints here yet</h3><p class="muted">Be the first to leave one — someone from your class might be searching right now.</p>
        <a class="btn btn-primary" href="${state.user ? '#/post' : '#/signup'}">Post a hint</a></div>`;
  };
  document.getElementById('filters').onsubmit = (e) => {
    e.preventDefault();
    const p = new URLSearchParams(Object.entries(formData(e.target)).filter(([, v]) => v));
    history.replaceState(null, '', '#/' + (p.toString() ? '?' + p : ''));
    load(p);
  };
  await load(params);
  if (params.toString()) document.getElementById('board').scrollIntoView();
}

function authLayout(inner, title, quote) {
  return `<div class="auth fade-in">
    <div class="auth-side"><div><span class="brand"><span class="brand-mark">R</span>Remember Me</span></div>
      <div><h2>${title}</h2><p class="quote">${quote}</p></div>
      <p style="opacity:.7;font-size:.9rem;margin:0">Your email is never shown publicly — only to classmates you accept.</p></div>
    <div class="auth-form">${inner}</div></div>`;
}

function pageSignup() {
  $app.innerHTML = authLayout(`
    <h1>Create your account</h1><p class="muted">It takes 30 seconds. Then start leaving hints.</p>
    <form id="f" novalidate>
      <div class="form-error"></div>
      <div class="field"><label>Full name</label><input name="name" autocomplete="name" required placeholder="Ada Okafor" /></div>
      <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></div>
      <div class="field"><label>Password <span class="hint-text">(8+ characters)</span></label><input name="password" type="password" autocomplete="new-password" required /></div>
      <div class="row">
        <div class="field"><label>School <span class="hint-text">(optional)</span></label><input name="school" placeholder="King's College" /></div>
        <div class="field"><label>Grad year <span class="hint-text">(optional)</span></label><input name="grad_year" type="number" min="1930" max="2100" placeholder="2008" /></div>
      </div>
      <button class="btn btn-primary" style="width:100%" type="submit">Sign up</button>
      <p class="switch">Already have an account? <a href="#/login">Log in</a></p>
    </form>`, 'Old friends, new chapter.', '“The best mirror is an old friend.”');
  bindAuth('/api/signup', 'Welcome aboard! 🎉');
}

function pageLogin() {
  $app.innerHTML = authLayout(`
    <h1>Welcome back</h1><p class="muted">Log in to post hints and check who recognised you.</p>
    <form id="f" novalidate>
      <div class="form-error"></div>
      <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label style="display:flex;justify-content:space-between">Password <a href="#/forgot" class="hint-text">Forgot password?</a></label><input name="password" type="password" autocomplete="current-password" required /></div>
      <button class="btn btn-primary" style="width:100%" type="submit">Log in</button>
      <p class="switch">New here? <a href="#/signup">Create an account</a></p>
    </form>`, 'Someone might have replied.', '“Is that really you?! I\'ve been looking everywhere…”');
  bindAuth('/api/login', 'Welcome back!');
}

function bindAuth(url, msg) {
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault(); busy(f, true);
    try {
      await api(url, { method: 'POST', body: formData(f) });
      await refreshMe(); toast(msg);
      go(sessionStorage.getItem('next') || '#/dashboard'); sessionStorage.removeItem('next');
    } catch (err) { showError(f, err.message); busy(f, false); }
  };
}

function pageForgot() {
  $app.innerHTML = authLayout(`
    <h1>Forgot your password?</h1><p class="muted">No worries — it happens to the best of us. Enter your email and we'll send you a reset link.</p>
    <form id="f" novalidate>
      <div class="form-error"></div>
      <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>
      <button class="btn btn-primary" style="width:100%" type="submit">Send reset link</button>
      <p class="switch">Remembered it? <a href="#/login">Back to log in</a></p>
    </form>`, 'Locked out?', '“We’ll get you back in. Your classmates are waiting.”');
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault(); busy(f, true);
    try {
      const email = formData(f).email;
      await api('/api/forgot', { method: 'POST', body: { email } });
      f.innerHTML = `<div class="sent-box"><div class="big">📬</div><h3>Check your inbox</h3>
        <p class="muted">If an account exists for <b>${esc(email || 'that email')}</b>, a reset link is on its way. It expires in 60 minutes — check your spam folder too.</p>
        <a class="btn btn-ghost" href="#/login">Back to log in</a></div>`;
    } catch (err) { showError(f, err.message); busy(f, false); }
  };
}

function pageReset() {
  const token = new URLSearchParams(location.hash.split('?')[1] || '').get('token');
  if (!token) { go('#/forgot'); return; }
  $app.innerHTML = authLayout(`
    <h1>Choose a new password</h1><p class="muted">Make it at least 8 characters. You'll be logged in right after.</p>
    <form id="f" novalidate>
      <div class="form-error"></div>
      <div class="field"><label>New password</label><input name="password" type="password" autocomplete="new-password" required /></div>
      <div class="field"><label>Confirm new password</label><input name="confirm" type="password" autocomplete="new-password" required /></div>
      <button class="btn btn-primary" style="width:100%" type="submit">Save new password</button>
    </form>`, 'Fresh start.', '“New password, same old friends.”');
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f);
    if (d.password !== d.confirm) return showError(f, "The two passwords don't match.");
    busy(f, true);
    try {
      await api('/api/reset', { method: 'POST', body: { token, password: d.password } });
      history.replaceState(null, '', '#/dashboard'); // remove token from the address bar
      await refreshMe(); toast('Password updated — welcome back!'); render();
    } catch (err) { showError(f, err.message); busy(f, false); }
  };
}
async function pageVerify() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const token = params.get('token');

  if (!token) {
    $app.innerHTML = `
      <div class="empty">
        <h3>Invalid verification link</h3>
        <p>The verification token is missing.</p>
        <a class="btn btn-primary" href="#/">Go home</a>
      </div>
    `;
    return;
  }

  $app.innerHTML = `
    <div class="empty">
      <h3>Verifying your email...</h3>
      <p>Please wait.</p>
    </div>
  `;

  try {
    const response = await fetch('/api/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Email verification failed.');
    }

    await refreshMe();

    $app.innerHTML = `
      <div class="empty">
        <div class="big">✅</div>
        <h3>Email verified successfully!</h3>
        <p>Your account is now verified. You can access all features.</p>
        <a class="btn btn-primary" href="#/dashboard">Go to dashboard</a>
      </div>
    `;
  } catch (err) {
    $app.innerHTML = `
      <div class="empty">
        <div class="big">⚠️</div>
        <h3>${esc(err.message)}</h3>
        <a class="btn btn-primary" href="#/">Go home</a>
      </div>
    `;
  }
}

function pageSettings() {
  if (!requireLogin()) return;
  const u = state.user;
  $app.innerHTML = `
    <div class="narrow fade-in">
      <span class="eyebrow">your account</span>
      <h1 class="page-title">Settings</h1>
      <div class="panel" style="margin-top:20px">
        <h3>Email alerts</h3>
        <label class="toggle">
          <input type="checkbox" id="alerts" ${u.email_alerts ? 'checked' : ''} />
          <span class="track"><span class="thumb"></span></span>
          <span><b>Email me when something happens</b><br><span class="hint-text">When someone replies to your hint, or accepts your reply. Sent to ${esc(u.email)}.</span></span>
        </label>
      </div>
      <form id="pw" class="panel" style="margin-top:20px" novalidate>
        <h3>Change password</h3>
        <div class="form-error"></div>
        <div class="field"><label>Current password</label><input name="current" type="password" autocomplete="current-password" required /></div>
        <div class="row">
          <div class="field"><label>New password</label><input name="password" type="password" autocomplete="new-password" required /></div>
          <div class="field"><label>Confirm new password</label><input name="confirm" type="password" autocomplete="new-password" required /></div>
        </div>
        <button class="btn btn-primary" type="submit">Update password</button>
      </form>
    </div>`;
  document.getElementById('alerts').onchange = async (e) => {
    await api('/api/settings', { method: 'POST', body: { email_alerts: e.target.checked } });
    state.user.email_alerts = e.target.checked ? 1 : 0;
    toast(e.target.checked ? 'Email alerts on 📬' : 'Email alerts off');
  };
  const f = document.getElementById('pw');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f);
    if (d.password !== d.confirm) return showError(f, "The two new passwords don't match.");
    busy(f, true);
    try { await api('/api/change-password', { method: 'POST', body: d }); f.reset(); f.querySelector('.form-error').classList.remove('show'); toast('Password updated 🔒'); }
    catch (err) { showError(f, err.message); }
    busy(f, false);
  };
}

function requireLogin() {
  if (state.user) return true;
  sessionStorage.setItem('next', location.hash);
  toast('Please log in first'); go('#/login'); return false;
}


async function pagePost() {
  if (!requireLogin()) return;
  await refreshMe();

  const u = state.user;

  // Block unverified users from accessing the posting form.
  if (!Number(u.email_verified)) {
    $app.innerHTML = `
      <div class="narrow fade-in">
        <div class="empty">
          <div class="big">📧</div>
          <h2>One quick step before posting</h2>
          <p class="muted">
            Please verify your email address before posting a memory.
            You can still browse the board and look for old classmates.
          </p>
          <button class="btn btn-primary" id="resend-verification">
            Resend verification email
          </button>
          <p style="margin-top:16px">
            <a href="#/">Back to the board</a>
          </p>
        </div>
      </div>
    `;

    document.getElementById('resend-verification').onclick = async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      button.textContent = 'Sending...';

      try {
        const result = await api('/api/resend-verification', {
          method: 'POST'
        });

        toast(
          result.already_verified
            ? 'Your email is already verified.'
            : 'Verification email sent. Check your inbox!'
        );
      } catch (err) {
        toast(err.message || 'Could not send verification email.');
      } finally {
        button.disabled = false;
        button.textContent = 'Resend verification email';
      }
    };

    return;
  }

  // Verified users see the normal posting form.
  $app.innerHTML = `
    <div class="narrow fade-in">
      <span class="eyebrow">dear old friend…</span>
      <h1 class="page-title">Leave a hint</h1>
      <p class="muted" style="margin-top:-4px">Write something only <i>they</i> would recognise. Avoid full names, phone numbers or addresses — keep it a little mysterious.</p>
      <div class="notice" style="margin-top:14px">
  🔒 <b>A note about privacy:</b>
  When someone responds to your hint and you accept their identity,
  both of you will receive each other's registered email addresses
  so you can reconnect.
</div>
      <form id="f" class="panel" novalidate style="margin-top:22px">
        <div class="form-error"></div>
        <fieldset><legend>Where & when</legend>
          <div class="row">
            <div class="field"><label>School</label><input name="school" required value="${esc(u.school || '')}" placeholder="e.g. Queen's College" /></div>
            <div class="field"><label>City / Town <span class="hint-text">(optional)</span></label><input name="city" placeholder="e.g. Lagos" /></div>
          </div>
          <div class="row">
            <div class="field"><label>From year</label><input name="year_from" type="number" min="1930" max="2100" placeholder="1998" /></div>
            <div class="field"><label>To year</label><input name="year_to" type="number" min="1930" max="2100" value="${esc(u.grad_year || '')}" placeholder="2004" /></div>
          </div>
        </fieldset>
        <fieldset><legend>The hint</legend>
          <div class="field"><label>Who are you looking for? <span class="hint-text">(a nickname or first name is enough)</span></label><input name="looking_for" maxlength="80" placeholder="e.g. “Tall Tunde” from JSS 3B" /></div>
          <div class="field"><label>Headline</label><input name="title" maxlength="120" required placeholder="e.g. The girl who sang at every assembly" /></div>
          <div class="field"><label>The memory <span class="hint-text">— something they'll instantly remember</span></label>
            <textarea class="lined" name="memory" maxlength="1500" required placeholder="We used to share puff-puff behind the chemistry lab every Friday…"></textarea></div>
        </fieldset>
        <fieldset><legend>Secret question <span class="hint-text">(recommended)</span></legend>
          <p class="hint-text" style="margin-top:0">People who reply must answer this. You'll see whether they got it right — a great way to filter out guesses.</p>
          <div class="field"><label>Question</label><input name="question" maxlength="200" placeholder="e.g. What did we call Mr. Adeyemi?" /></div>
          <div class="field"><label>Answer <span class="hint-text">(kept private)</span></label><input name="answer" maxlength="100" placeholder="e.g. Chalk Master" /></div>
          <div class="field"><label>Other accepted answers <span class="hint-text">(optional, separate with commas)</span></label><input name="alt_answers" maxlength="400" placeholder="e.g. Chalky, Mr Chalk" />
            <p class="hint-text" style="margin:6px 0 0">Don't worry about exact wording — capitals, punctuation, small typos, word order and extra words like “I think it was…” are all accepted automatically.</p></div>
        </fieldset>
        <div style="display:flex;gap:10px;justify-content:flex-end"><a class="btn btn-ghost" href="#/">Cancel</a><button class="btn btn-accent" type="submit">Pin it to the board 📌</button></div>
      </form>
    </div>`;

  const f = document.getElementById('f');

  f.onsubmit = async (e) => {
    e.preventDefault();
    busy(f, true);

    try {
      const { id } = await api('/api/hints', {
        method: 'POST',
        body: formData(f)
      });

      toast('Your hint is live!');
      go('#/hint/' + id);
    } catch (err) {
      showError(f, err.message);
      busy(f, false);
      f.scrollIntoView({ behavior: 'smooth' });
    }
  };
}

async function pageHint(id) {
  if (state.user) await refreshMe();
  let data;
  try { data = await api('/api/hints/' + id); }
  catch { $app.innerHTML = `<div class="empty"><div class="big">🔍</div><h3>Hint not found</h3><a class="btn btn-primary" href="#/">Back to the board</a></div>`; return; }
  const { hint: h, myResponse } = data;

  let side;
  if (h.mine) {
    side = `<h3>This is your hint</h3>
      <p class="muted">${h.response_count} ${h.response_count === 1 ? 'person has' : 'people have'} responded.</p>
      <a class="btn btn-primary" style="width:100%" href="#/dashboard">See responses</a>
     ${Number(state.user?.email_verified) ? `
  <button class="btn btn-danger btn-sm" id="del" style="width:100%;margin-top:10px">Delete hint</button>
` : `
  <p class="muted">Verify your email to manage your hints.</p>
`}`;
  } else if (h.status === 'reunited') {
    side = `<h3>🎉 Reunited!</h3><p class="muted">This hint has already found its person. Lovely.</p><a class="btn btn-ghost" href="#/">Browse more hints</a>`;
  } else if (!state.user) {
    side = `<h3>Is this about you?</h3><p class="muted">Log in or create a free account to let ${esc(h.author_name)} know it's you.</p>
      <a class="btn btn-accent" style="width:100%" href="#/signup" id="gate">That's me! — Sign up</a>
      <p style="text-align:center;font-size:.9rem;margin-bottom:0">or <a href="#/login" id="gate2">log in</a></p>`;
  } else if (myResponse) {
    const chip = { pending: '<span class="chip yellow">⏳ Waiting for reply</span>', accepted: '<span class="chip green">✅ Accepted</span>', declined: '<span class="chip red">Not a match</span>' }[myResponse.status];
    side = `<h3>You responded</h3>${chip}<p class="muted" style="margin-top:12px">Check <a href="#/dashboard">My corner</a> for updates.</p>`;
  }  else if (!Number(state.user.email_verified)) {
    side = `
      <h3>📧 One quick step before reconnecting</h3>
      <p class="muted">
        Please verify your email address before sending a reconnection request.
        You can still browse hints and memories.
      </p>
      <button class="btn btn-primary" id="resend-verification" style="width:100%">
        Resend verification email
      </button>
    `;}
  else {
    side = `<h3>Is this about you?</h3><p class="muted">Send ${esc(h.author_name)} a note. They'll see your name and message, and decide whether to share contacts.</p>
    <div class="notice" style="margin:12px 0">
  🔒 If ${esc(h.author_name)} accepts your response,
  both of you will receive each other's registered email addresses
  to continue your conversation.
</div> 
    <form id="rf" novalidate><div class="form-error"></div>
        ${h.question ? `<div class="secret">🔐 <b>Secret question:</b> ${esc(h.question)}</div>
        <div class="field"><label>Your answer</label><input name="answer" required maxlength="100" /></div>` : ''}
        <div class="field"><label>Your note</label><textarea name="message" required maxlength="1000" placeholder="It's me! I still remember…"></textarea></div>
        <button class="btn btn-accent" style="width:100%" type="submit">That's me! 🙋</button>
      </form>`;
  }

  $app.innerHTML = `
    <a href="#/" class="muted" style="text-decoration:none;display:inline-block;margin-bottom:18px">← Back to the board</a>
    <div class="detail fade-in">
      <article class="letter">
        ${h.status === 'reunited' ? '<span class="stamp">REUNITED</span>' : ''}
        <span class="chip">🏫 ${esc(h.school)}${h.city ? ', ' + esc(h.city) : ''}</span>
        <h1 style="font-size:clamp(1.7rem,3.4vw,2.4rem);margin-top:14px">${esc(h.title)}</h1>
        <div class="facts">
          ${years(h) ? `<span class="chip">🎓 ${years(h)}</span>` : ''}
          ${h.looking_for ? `<span class="chip">🔎 Looking for: ${esc(h.looking_for)}</span>` : ''}
          <span class="chip">🕒 ${ago(h.created_at)}</span>
        </div>
        <p class="memory">${esc(h.memory)}</p>
        <p class="sign">— ${esc(h.author_name)}</p>
      </article>
      <aside class="side-card">${side}</aside>
    </div>`;

  ['gate', 'gate2'].forEach((g) => { const el = document.getElementById(g); if (el) el.onclick = () => sessionStorage.setItem('next', '#/hint/' + h.id); });
    const resendButton = document.getElementById('resend-verification');

  if (resendButton) {
    resendButton.onclick = async () => {
      resendButton.disabled = true;
      resendButton.textContent = 'Sending...';

      try {
        const result = await api('/api/resend-verification', {
          method: 'POST'
        });

        toast(
          result.already_verified
            ? 'Your email is already verified.'
            : 'Verification email sent. Check your inbox!'
        );
      } catch (err) {
        toast(err.message || 'Could not send verification email.');
      } finally {
        resendButton.disabled = false;
        resendButton.textContent = 'Resend verification email';
      }
    };
  }
  const del = document.getElementById('del');
  if (del) del.onclick = async () => { if (!confirm('Delete this hint and all its responses?')) return; await api('/api/hints/' + h.id, { method: 'DELETE' }); toast('Hint deleted'); go('#/dashboard'); };
  const rf = document.getElementById('rf');
  if (rf) rf.onsubmit = async (e) => {
    e.preventDefault(); busy(rf, true);
    try { await api(`/api/hints/${h.id}/respond`, { method: 'POST', body: formData(rf) }); toast('Sent! Fingers crossed 🤞'); pageHint(id); }
    catch (err) { showError(rf, err.message); busy(rf, false); }
  };
}

async function pageDashboard() {
  await refreshMe();
  if (!requireLogin()) return;
  const d = await api('/api/dashboard');
  state.pending = d.received.filter((r) => r.status === 'pending').length; renderNav();
  const tab = sessionStorage.getItem('tab') || (state.pending ? 'received' : 'hints');
  const needsVerification = !Number(state.user.email_verified);

const verificationNotice = needsVerification ? `
  <div class="item fade-in" style="margin: 1rem 0; border: 1px solid var(--accent);">
    <h3>📧 Verify your email address</h3>
    <p class="muted">
      You can browse memories, but you need to verify your email
      before posting hints or reconnecting with classmates.
    </p>
    <button class="btn btn-primary btn-sm" id="resend-verification">
      Resend verification email
    </button>
  </div>
` : '';
  const statusChip = (s, hintStatus) => {
  if (s === 'declined' && hintStatus === 'reunited') {
    return '<span class="chip yellow">🎉 Reunited with someone else</span>';
  }

  return {
    pending: '<span class="chip yellow">⏳ Pending</span>',
    accepted: '<span class="chip green">✅ Reconnected</span>',
    declined: '<span class="chip red">Not a match</span>'
  }[s];
};
  const views = {
    hints: () => d.myHints.length ? `<div class="grid">${d.myHints.map(hintCard).join('')}</div>`
      : `<div class="empty"><div class="big">✏️</div><h3>You haven't posted any hints</h3><p class="muted">Think of that one classmate you wish you'd kept in touch with.</p><a class="btn btn-accent" href="#/post">Post your first hint</a></div>`,
    received: () => d.received.length ? `<div class="list">${d.received.map((r) => `
      <div class="item fade-in">
        <div class="item-head"><div><h4>${esc(r.from_name)} ${r.from_school ? `<span class="muted" style="font:400 .85rem var(--sans)">· ${esc(r.from_school)}${r.from_year ? " '" + String(r.from_year).slice(-2) : ''}</span>` : ''}</h4>
          <span class="muted" style="font-size:.85rem">on <a href="#/hint/${r.hint_id}">${esc(r.hint_title)}</a> · ${ago(r.created_at)}</span></div>${statusChip(r.status, r.hint_status)}</div>
        ${r.answer_ok !== null ? `<div class="answer-check">${[
        `<span class="chip red">🔐 Didn't match your answer</span>`,
        `<span class="chip green">🔐 Secret answer correct</span>`,
        `<span class="chip yellow">🔐 Close match — you decide</span>`][r.answer_ok]}
          <span class="muted" style="font-size:.85rem">They wrote <b>“${esc(r.answer)}”</b>${r.my_answers ? ` · your answer: <b>“${esc(r.my_answers.join('” / “'))}”</b>` : ''}</span></div>` : ''}
        <p class="msg">${esc(r.message)}</p>
        ${r.status === 'pending' ? (
  Number(state.user.email_verified)
    ? `<div class="actions">
        <button class="btn btn-primary btn-sm" data-act="accept" data-id="${r.id}">Yes, it's them! Share contacts</button>
        <button class="btn btn-ghost btn-sm" data-act="decline" data-id="${r.id}">Not them</button>
      </div>`
    : `<p class="muted">📧 Verify your email before accepting or declining this reconnection request.</p>`
) : ''}
     ${r.status === 'accepted' ? `<div class="reveal">🎉 You're reconnected! Reach ${esc(r.from_name)} at <a href="mailto:${esc(r.from_email)}">${esc(r.from_email)}</a></div>` : ''}
      </div>`).join('')}</div>`
      : `<div class="empty"><div class="big">📬</div><h3>No responses yet</h3><p class="muted">When someone recognises your hint, their reply lands here.</p></div>`,
    sent: () => d.sent.length ? `<div class="list">${d.sent.map((s) => `
      <div class="item fade-in">
        <div class="item-head"><div><h4><a href="#/hint/${s.hint_id}">${esc(s.hint_title)}</a></h4><span class="muted" style="font-size:.85rem">${esc(s.school)} · posted by ${esc(s.to_name)} · you replied ${ago(s.created_at)}</span></div>${statusChip(s.status, s.hint_status)}</div>
        <p class="msg">${esc(s.message)}</p>
        ${s.status === 'accepted' ? `<div class="reveal">🎉 ${esc(s.to_name)} accepted! Say hello at <a href="mailto:${esc(s.to_email)}">${esc(s.to_email)}</a></div>` : ''}
      </div>`).join('')}</div>`
      : `<div class="empty"><div class="big">🙋</div><h3>You haven't replied to any hints</h3><p class="muted">Browse the board — maybe someone is looking for you.</p><a class="btn btn-primary" href="#/">Browse hints</a></div>`,
  };

  $app.innerHTML = `
    <div class="fade-in">
      <span class="eyebrow">hello, ${esc(state.user.name.split(' ')[0])}!</span>
      <h1 class="page-title">My corner</h1>
      ${verificationNotice}
      <div class="tabs">
        <button class="tab" data-tab="hints">My hints (${d.myHints.length})</button>
        <button class="tab" data-tab="received">Responses to me ${state.pending ? `<span class="badge">${state.pending}</span>` : `(${d.received.length})`}</button>
        <button class="tab" data-tab="sent">My replies (${d.sent.length})</button>
      </div>
      <div id="tabview"></div>
    </div>`;
    const resendButton = document.getElementById('resend-verification');

if (resendButton) {
  resendButton.onclick = async () => {
    resendButton.disabled = true;
    resendButton.textContent = 'Sending...';

    try {
      const result = await api('/api/resend-verification', {
        method: 'POST'
      });

      toast(
        result.already_verified
          ? 'Your email is already verified.'
          : 'Verification email sent. Check your inbox!'
      );

    } catch (err) {
      toast(err.message || 'Could not send verification email.');
    } finally {
      resendButton.disabled = false;
      resendButton.textContent = 'Resend verification email';
    }
  };
}
  const show = (t) => {
    sessionStorage.setItem('tab', t);
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    document.getElementById('tabview').innerHTML = views[t]();
  };
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  document.getElementById('tabview').onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (
  b.dataset.act === 'accept' &&
  !confirm(
    'Confirm this is the person you are looking for?\n\n' +
    'Your hint will be marked as reunited, and both of you will receive each other’s registered email addresses.'
  )
) return;
    await api(`/api/responses/${b.dataset.id}/${b.dataset.act}`, { method: 'POST' });
    toast(b.dataset.act === 'accept' ? 'Reunited! 🎉' : 'Marked as not a match');
    sessionStorage.setItem('tab', 'received'); pageDashboard();
  };
  show(tab);
}

// ---------- router ----------
async function render() {
  const hash = location.hash || '#/';
  const route = hash.split('?')[0];
  renderNav();
  window.scrollTo(0, 0);
  try {
    if (route === '#/' || route === '#' || route === '#board') return await pageHome();
    if (route === '#/signup') return state.user ? go('#/dashboard') : pageSignup();
    if (route === '#/login') return state.user ? go('#/dashboard') : pageLogin();
    if (route === '#/forgot') return state.user ? go('#/settings') : pageForgot();
    if (route === '#/reset') return pageReset();
    if (route === '#/verify') return await pageVerify();
    if (route === '#/settings') return pageSettings();
    if (route === '#/post') return pagePost();
    if (route === '#/dashboard') return await pageDashboard();
    const m = route.match(/^#\/hint\/(\d+)$/);
    if (m) return await pageHint(m[1]);
    $app.innerHTML = `<div class="empty"><div class="big">🧭</div><h3>Page not found</h3><a class="btn btn-primary" href="#/">Go home</a></div>`;
  } catch (err) {
    $app.innerHTML = `<div class="empty"><div class="big">⚠️</div><h3>${esc(err.message)}</h3><a class="btn btn-primary" href="#/">Go home</a></div>`;
  }
}
window.addEventListener('hashchange', () => { if (location.hash !== '#board') render(); else document.getElementById('board')?.scrollIntoView({ behavior: 'smooth' }); });
refreshMe().finally(render);
