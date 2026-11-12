const path = require('node:path');
const crypto = require('node:crypto');
const { createStore, hashPassword } = require('../server/store.cjs');
async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Usage: npm run admin:create -- reviewer@example.test (stop the development server first)');
  const store = createStore(process.env.SEA_CREDIT_DATA_DIR || path.join(__dirname, '..', '.data'));
  if (store.read().users.some(u => u.email === email)) throw new Error('That account already exists. Choose a new reviewer email.');
  const password = crypto.randomBytes(18).toString('base64url');
  const passwordHash = await hashPassword(password);
  store.mutate(db => {
    if (db.users.some(u => u.email === email)) throw new Error('Account already exists.');
    db.users.push({ id: crypto.randomUUID(), name: 'Sea Credit Reviewer', email, role: 'admin', password: passwordHash, phone: '', address: '', createdAt: new Date().toISOString() });
  });
  console.log(`\nDevelopment reviewer created: ${email}\nPassword (shown once): ${password}\n\nKeep this password outside source control. Start the server and use Client login.\n`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
