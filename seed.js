
// Seed demo users and hints.
// Run locally with: npm run seed

// Load local .env file (Node.js 22+)
try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

const base = (
  process.env.APP_URL ||
  `http://localhost:${process.env.PORT || 8080}`
).replace(/\/+$/, '');

const people = [
  ['Chioma Eze', 'chioma@demo.test', "Queen's College", 2004],
  ['Tunde Bakare', 'tunde@demo.test', "King's College", 2008],
  ['Amaka Obi', 'amaka@demo.test', 'Federal Govt. College Ijanikin', 1999],
];

const hints = [
  {
    school: "Queen's College",
    city: 'Lagos',
    year_from: 1998,
    year_to: 2004,
    looking_for: '"Bubbles" from JSS 2C',
    title: 'The girl who sang at every assembly',
    memory: 'You always started "Morning Has Broken" half a beat early and the whole hall followed you anyway. We shared chin-chin behind the Home Economics block every Friday. I still have the friendship band you made me.',
    question: 'What colour was the friendship band?',
    answer: 'green'
  },
  {
    school: "King's College",
    city: 'Lagos',
    year_from: 2002,
    year_to: 2008,
    looking_for: 'Skinny Femi, SS3 Science',
    title: 'You lent me your blue Bic and never asked for it back',
    memory: 'Further Maths, back row, by the broken window. You let me copy the matrices homework on the day Mr. Adeyemi caught half the class. I owe you a pen and probably my WAEC grade.',
    question: 'What did we call Mr. Adeyemi?',
    answer: 'Chalk Master'
  },
  {
    school: 'Federal Govt. College Ijanikin',
    city: 'Lagos',
    year_from: 1993,
    year_to: 1999,
    looking_for: 'My inter-house sports partner',
    title: 'Blue House relay, 1997 — we dropped the baton',
    memory: 'We were winning by miles until the last handover. Everyone laughed but you just picked it up and ran anyway. We came last but you said it was the best race ever. I think about that a lot.',
    question: '',
    answer: ''
  }
];

function getCookie(response) {
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);

  return cookies.map(cookie => cookie.split(';')[0]).join('; ');
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${body}`);
  }

  return { response, body };
}

(async () => {
  console.log(`Seeding database at: ${base}`);

  for (let i = 0; i < people.length; i++) {
    const [name, email, school, grad_year] = people[i];

    const payload = {
      name,
      email,
      password: process.env.SEED_PASSWORD || 'password123',
      school,
      grad_year
    };

    // Try signup first. If the account already exists, log in.
    let auth;

    try {
      auth = await request('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log(`Created account: ${email}`);
    } catch (signupError) {
      console.log(`Signup unavailable for ${email}; trying login...`);

      auth = await request('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: payload.password
        })
      });
    }

    const cookie = getCookie(auth.response);

    if (!cookie) {
      throw new Error(`No authentication cookie received for ${email}`);
    }

    const hintResult = await request('/api/hints', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie
      },
      body: JSON.stringify(hints[i])
    });

    console.log(`Created hint for ${email}`);
  }

  console.log('\nDemo data seeding completed successfully.');

})().catch(error => {
  console.error('\nSEED FAILED:', error.message);
  process.exitCode = 1;
});
