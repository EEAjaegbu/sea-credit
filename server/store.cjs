const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

function createStore(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'database.json');
  function read() {
    if (!fs.existsSync(filename)) return { schemaVersion: 1, users: [], sessions: [], applications: [] };
    const db = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (db.schemaVersion !== 1 || !Array.isArray(db.users) || !Array.isArray(db.sessions) || !Array.isArray(db.applications)) throw new Error('Unsupported database format. Restore a valid development backup.');
    return db;
  }
  function write(db) {
    const temporary = `${filename}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, filename);
  }
  // Single-process development storage: no await inside mutation callbacks.
  function mutate(callback) {
    const db = read();
    const result = callback(db);
    write(db);
    return result;
  }
  return { read, mutate };
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return { salt, hash: hash.toString('hex') };
}
async function verifyPassword(password, stored) {
  const hash = await scrypt(password, stored.salt, 64);
  const expected = Buffer.from(stored.hash, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
module.exports = { createStore, hashPassword, verifyPassword, digest };
