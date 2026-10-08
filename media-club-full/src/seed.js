require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars) in .env');
    process.exit(1);
  }
  const u = await db.get('SELECT id FROM users WHERE email=?', [email]);
  if (u) {
    await db.run("UPDATE users SET role='admin', status='active', password_hash=? WHERE id=?", [bcrypt.hashSync(password, 10), u.id]);
    console.log('Updated existing user to admin:', email);
  } else {
    await db.run("INSERT INTO users(id,email,password_hash,role,status) VALUES(?,?,?,'admin','active')", [crypto.randomBytes(9).toString('hex'), email, bcrypt.hashSync(password, 10)]);
    console.log('Created admin:', email);
  }
}

seedAdmin().catch(console.error);
