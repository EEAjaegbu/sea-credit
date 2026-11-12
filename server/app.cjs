const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createStore, hashPassword, verifyPassword, digest } = require('./store.cjs');

const SESSION_DURATION = 8 * 60 * 60 * 1000;
const TEST_TERMS = { minAmount: 50000, maxAmount: 1000000, months: [1, 3, 6], currency: 'NGN' };
const STATES = ['submitted', 'under_review', 'needs_information', 'approved', 'declined', 'cancelled'];
const TRANSITIONS = {
  submitted: ['under_review', 'needs_information', 'approved', 'declined'],
  under_review: ['needs_information', 'approved', 'declined'],
  needs_information: ['under_review', 'approved', 'declined'],
  approved: [], declined: [], cancelled: []
};
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireValue(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
function string(value, label, min, max) {
  requireValue(typeof value === 'string', `${label} is required.`);
  const clean = value.trim();
  requireValue(clean.length >= min && clean.length <= max, `${label} must contain ${min}–${max} characters.`);
  return clean;
}
function email(value) {
  const clean = string(value, 'Email', 3, 254).toLowerCase();
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean), 'Enter a valid email address.');
  return clean;
}
function password(value) {
  requireValue(typeof value === 'string' && value.length >= 12 && value.length <= 128, 'Use a password of 12–128 characters.');
  return value;
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone || '', address: user.address || '', createdAt: user.createdAt };
}
function applicationFields(body) {
  requireValue(['salary_advance', 'personal_credit'].includes(body.product), 'Choose a valid product.');
  requireValue(Number.isSafeInteger(body.amount) && body.amount >= TEST_TERMS.minAmount && body.amount <= TEST_TERMS.maxAmount, 'The test amount must be between ₦50,000 and ₦1,000,000 in whole naira.');
  requireValue(TEST_TERMS.months.includes(body.termMonths), 'Choose a test period of 1, 3, or 6 months.');
  requireValue(['salaried', 'self_employed', 'other'].includes(body.employmentType), 'Choose your employment status.');
  requireValue(Number.isSafeInteger(body.monthlyIncome) && body.monthlyIncome > 0 && body.monthlyIncome <= 100000000, 'Enter a monthly income between ₦1 and ₦100,000,000 in whole naira.');
  const phone = string(body.phone, 'Phone number', 7, 20);
  requireValue(/^[+\d ()-]+$/.test(phone), 'Enter a valid phone number.');
  requireValue(body.testConsent === true, 'Confirm that you are submitting fictional test information.');
  return {
    product: body.product, amount: body.amount, termMonths: body.termMonths,
    employmentType: body.employmentType, monthlyIncome: body.monthlyIncome,
    employer: string(body.employer, 'Employer or business name', 2, 120),
    jobTitle: string(body.jobTitle, 'Job title', 2, 100),
    phone, address: string(body.address, 'Residential address', 5, 300),
    purpose: string(body.purpose, 'Purpose', 10, 1000)
  };
}
async function readBody(req) {
  requireValue((req.headers['content-type'] || '').split(';')[0] === 'application/json', 'Send JSON data.', 415);
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    requireValue(length <= 65536, 'Request too large.', 413);
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    requireValue(data && typeof data === 'object' && !Array.isArray(data), 'Invalid JSON body.');
    return data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

function createApp(options = {}) {
  const store = createStore(options.dataDir || process.env.SEA_CREDIT_DATA_DIR || path.join(__dirname, '..', '.data'));
  const publicRoot = path.resolve(__dirname, '..', 'dist');
  const appOrigin = options.origin || process.env.APP_ORIGIN;
  const rateLimits = new Map();
  function rateLimit(key, limit = 15) {
    const now = Date.now();
    for (const [k, v] of rateLimits) if (v.until <= now) rateLimits.delete(k);
    const entry = rateLimits.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    entry.count++;
    rateLimits.set(key, entry);
    requireValue(entry.count <= limit, 'Too many attempts. Try again in 15 minutes.', 429);
  }
  function sessionFor(req) {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('sea_session='))?.slice(12);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const db = store.read();
    const session = db.sessions.find(s => s.tokenHash === digest(token) && s.expiresAt > Date.now());
    if (!session) return null;
    const user = db.users.find(u => u.id === session.userId);
    return user ? { user, session } : null;
  }
  function authenticate(req, role) {
    const auth = sessionFor(req);
    requireValue(auth, 'Please sign in to continue.', 401);
    requireValue(!role || auth.user.role === role, 'You do not have access to this action.', 403);
    if (!['GET', 'HEAD'].includes(req.method)) requireValue(req.headers['x-csrf-token'] === auth.session.csrfToken, 'Your session changed. Refresh and try again.', 403);
    return auth;
  }
  function issueSession(req, res, user) {
    const token = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const prior = sessionFor(req);
    store.mutate(db => {
      db.sessions = db.sessions.filter(s => s.expiresAt > Date.now() && s.tokenHash !== prior?.session.tokenHash);
      db.sessions.push({ tokenHash: digest(token), userId: user.id, csrfToken, expiresAt: Date.now() + SESSION_DURATION });
    });
    const secure = req.socket.encrypted || req.headers.origin?.startsWith('https://');
    res.setHeader('Set-Cookie', `sea_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION / 1000}${secure ? '; Secure' : ''}`);
    return { user: publicUser(user), csrfToken };
  }
  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  function checkOrigin(req) {
    if (['GET', 'HEAD'].includes(req.method)) return;
    let allowed = false;
    try {
      const parsed = new URL(req.headers.origin);
      allowed = ['http:', 'https:'].includes(parsed.protocol) && (appOrigin ? parsed.origin === new URL(appOrigin).origin : parsed.host === req.headers.host);
    } catch { /* Missing or malformed origins must not authorize mutations. */ }
    requireValue(allowed, 'This request origin is not allowed.', 403);
  }
  const recordEvent = (application, user, note) => application.history.push({ id: crypto.randomUUID(), status: application.status, actorRole: user.role, actorId: user.id, note, at: new Date().toISOString() });
  function accessibleApplication(db, id, user) {
    const entry = db.applications.find(a => a.id === id && (user.role === 'admin' || a.userId === user.id));
    requireValue(entry, 'Application not found.', 404);
    return entry;
  }
  async function api(req, res, url) {
    checkOrigin(req);
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /api/health') return json(res, 200, { status: 'ok', environment: 'development', storage: 'local-json' });
    if (route === 'GET /api/auth/me') {
      const auth = sessionFor(req);
      return json(res, 200, { user: auth ? publicUser(auth.user) : null, csrfToken: auth?.session.csrfToken || null });
    }
    if (route === 'POST /api/auth/register') {
      rateLimit(`register:${req.socket.remoteAddress}`);
      const body = await readBody(req);
      const mail = email(body.email);
      const name = string(body.name, 'Full name', 2, 100);
      requireValue(body.testConsent === true, 'Confirm this is a test account.');
      const passwordHash = await hashPassword(password(body.password));
      const user = store.mutate(db => {
        requireValue(!db.users.some(u => u.email === mail), 'An account already exists for this email. Please sign in.', 409);
        const newUser = { id: crypto.randomUUID(), name, email: mail, role: 'customer', password: passwordHash, createdAt: new Date().toISOString(), phone: '', address: '' };
        db.users.push(newUser);
        return newUser;
      });
      return json(res, 201, issueSession(req, res, user));
    }
    if (route === 'POST /api/auth/login') {
      rateLimit(`login:${req.socket.remoteAddress}`, 30);
      const body = await readBody(req);
      const mail = email(body.email);
      rateLimit(`account:${mail}`, 12);
      const value = password(body.password);
      const user = store.read().users.find(u => u.email === mail);
      const fallback = { salt: '00000000000000000000000000000000', hash: '00'.repeat(64) };
      const valid = await verifyPassword(value, user?.password || fallback);
      requireValue(user && valid, 'Email or password is incorrect.', 401);
      return json(res, 200, issueSession(req, res, user));
    }
    if (route === 'POST /api/auth/logout') {
      const auth = authenticate(req);
      store.mutate(db => { db.sessions = db.sessions.filter(s => s.tokenHash !== auth.session.tokenHash); });
      res.setHeader('Set-Cookie', 'sea_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      return json(res, 200, { ok: true });
    }
    if (route === 'PATCH /api/profile') {
      const { user } = authenticate(req);
      const body = await readBody(req);
      const name = string(body.name, 'Full name', 2, 100);
      const phone = string(body.phone, 'Phone number', 7, 20);
      requireValue(/^[+\d ()-]+$/.test(phone), 'Enter a valid phone number.');
      const address = string(body.address, 'Address', 5, 300);
      const updated = store.mutate(db => {
        const target = db.users.find(u => u.id === user.id);
        Object.assign(target, { name, phone, address });
        return publicUser(target);
      });
      return json(res, 200, { user: updated });
    }
    if (route === 'GET /api/applications') {
      const { user } = authenticate(req);
      const status = url.searchParams.get('status');
      requireValue(!status || STATES.includes(status), 'Unknown application status.');
      const applications = store.read().applications.filter(a => (user.role === 'admin' || a.userId === user.id) && (!status || a.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json(res, 200, { applications, testTerms: TEST_TERMS });
    }
    if (route === 'POST /api/applications') {
      const { user } = authenticate(req, 'customer');
      const body = await readBody(req);
      const fields = applicationFields(body);
      const key = string(body.requestId, 'Request identifier', 8, 80);
      const entry = store.mutate(db => {
        const existing = db.applications.find(a => a.userId === user.id && a.requestId === key);
        if (existing) return existing;
        requireValue(db.applications.filter(a => a.userId === user.id && !['approved', 'declined', 'cancelled'].includes(a.status)).length < 5, 'You already have five open applications. Finish one before applying again.', 409);
        const now = new Date().toISOString();
        const application = { ...fields, id: crypto.randomUUID(), reference: `SC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`, requestId: key, userId: user.id, applicantName: user.name, applicantEmail: user.email, status: 'submitted', version: 1, createdAt: now, updatedAt: now, history: [] };
        recordEvent(application, user, 'Application submitted for test review.');
        db.applications.push(application);
        return application;
      });
      return json(res, 201, { application: entry });
    }
    const match = url.pathname.match(/^\/api\/applications\/([a-f0-9-]{36})(?:\/(review|resubmit|cancel))?$/);
    if (match) {
      const { user } = authenticate(req);
      const [, id, action] = match;
      if (req.method === 'GET' && !action) return json(res, 200, { application: accessibleApplication(store.read(), id, user) });
      if (req.method === 'PATCH' && action) {
        requireValue(action === 'review' ? user.role === 'admin' : user.role === 'customer', 'You do not have access to this action.', 403);
        const body = await readBody(req);
        const entry = store.mutate(db => {
          const application = accessibleApplication(db, id, user);
          requireValue(body.version === application.version, 'This application changed. Refresh it before making another update.', 409);
          if (action === 'review') {
            requireValue(TRANSITIONS[application.status].includes(body.status), 'This status change is not permitted.', 409);
            const note = string(body.note, 'Customer-facing review message', 5, 2000);
            application.status = body.status;
            recordEvent(application, user, note);
          } else if (action === 'resubmit') {
            requireValue(application.status === 'needs_information', 'Only applications requesting more information can be resubmitted.', 409);
            const note = string(body.note, 'Response to reviewer', 5, 2000);
            Object.assign(application, applicationFields(body), { status: 'submitted' });
            recordEvent(application, user, note);
          } else {
            requireValue(['submitted', 'under_review', 'needs_information'].includes(application.status), 'This application can no longer be cancelled.', 409);
            application.status = 'cancelled';
            recordEvent(application, user, 'Application withdrawn by the customer.');
          }
          application.version++;
          application.updatedAt = new Date().toISOString();
          return application;
        });
        return json(res, 200, { application: entry });
      }
    }
    throw new HttpError(404, 'API route not found.');
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      requireValue(['GET', 'HEAD'].includes(req.method), 'Method not allowed.', 405);
      const pathname = decodeURIComponent(url.pathname);
      const file = path.resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      requireValue(file.startsWith(publicRoot + path.sep), 'Not found.', 404);
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
      requireValue(types[path.extname(file)], 'Not found.', 404);
      let content;
      try { content = await fs.promises.readFile(file); } catch { throw new HttpError(404, 'Not found.'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent) return res.end();
      if (!error.status) console.error('Request failed:', error.code || error.name);
      json(res, error.status || 500, { error: error.status ? error.message : 'Unable to save or load data. Check the server and try again.' });
    }
  });
  return { server, store };
}
module.exports = { createApp };
