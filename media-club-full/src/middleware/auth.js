const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

function issueCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '14d' });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: config.env === 'production' ? 'none' : 'lax',
    secure: config.env === 'production',
    maxAge: 14 * 24 * 3600 * 1000
  });
  return token;
}

async function loadUser(req, _res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies && req.cookies[config.cookieName]) {
    token = req.cookies[config.cookieName];
  }
  req.user = null;
  if (token) {
    try {
      const { sub } = jwt.verify(token, config.jwtSecret);
      req.user = await db.get('SELECT id,email,role,status FROM users WHERE id=?', [sub]);
      if (req.user && !req.user.status) req.user.status = 'active';
    } catch (_) { /* invalid/expired */ }
  }
  next();
}

const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Not signed in' });

// Only approved (active) members, plus oc/admin. Pending users must wait for admin approval.
const requireActive = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  if (req.user.role === 'admin') return next();
  if (req.user.status === 'pending') return res.status(403).json({ error: 'Awaiting admin approval' });
  if (req.user.status === 'rejected') return res.status(403).json({ error: 'Registration was declined' });
  return next();
};

const requireRole = (...roles) => (req, res, next) =>
  !req.user ? res.status(401).json({ error: 'Not signed in' })
  : roles.includes(req.user.role) ? next()
  : res.status(403).json({ error: 'Not allowed' });

module.exports = { issueCookie, loadUser, requireAuth, requireActive, requireRole };
