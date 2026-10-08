const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const { loadUser } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Allowed origins for CORS (Vercel frontend, local dev)
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim().replace(/\/$/, ''))
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const norm = origin.replace(/\/$/, '');
    const isAllowed = allowedOrigins.includes(norm) ||
      norm.endsWith('.vercel.app') ||
      process.env.NODE_ENV !== 'production';
    callback(null, isAllowed);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// CSP is off because the site uses inline scripts/styles, cdnjs and Google Fonts
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.json({ limit: '60mb' }));
app.use(cookieParser());
app.use(loadUser);

// state-changing requests guard (permits same-host and verified CORS origins like Vercel)
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const o = req.get('origin');
  if (o) {
    try {
      const originHost = new URL(o).host;
      const reqHost = req.get('host');
      const norm = o.replace(/\/$/, '');
      if (originHost !== reqHost && !allowedOrigins.includes(norm) && !originHost.endsWith('.vercel.app') && process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Cross-site request blocked' });
      }
    } catch (_) {}
  }
  next();
});

app.use('/api', require('./routes/api'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', fallthrough: false }));
// React client (client/dist) is served when built; otherwise fall back to the legacy static page.
const fs = require('fs');
const distDir = path.join(__dirname, '..', 'client', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
const frontDir = fs.existsSync(path.join(distDir, 'index.html')) ? distDir : publicDir;
app.use(express.static(frontDir));
app.get('/admin', (_req, res) => res.sendFile(path.join(frontDir, 'index.html')));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Upload too large' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
