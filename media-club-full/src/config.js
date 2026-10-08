require('dotenv').config();
const path = require('path');
const crypto = require('crypto');

const env = process.env.NODE_ENV || 'development';
let secret = process.env.JWT_SECRET;
if (!secret || secret === 'change-me') {
  if (env === 'production') throw new Error('Set JWT_SECRET in production');
  secret = crypto.randomBytes(32).toString('hex');
  // Persist it so logins survive server restarts (previously a fresh secret
  // was generated on every boot, logging everyone out).
  try {
    const fs = require('fs');
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const cur = fs.readFileSync(envPath, 'utf8');
      if (/^JWT_SECRET=/m.test(cur)) fs.writeFileSync(envPath, cur.replace(/^JWT_SECRET=.*/m, 'JWT_SECRET=' + secret));
      else fs.appendFileSync(envPath, '\nJWT_SECRET=' + secret + '\n');
    }
  } catch (e) { console.warn('[config] could not persist JWT_SECRET:', e.message); }
  if (env !== 'test') console.warn('[config] JWT_SECRET was missing — generated and saved one to .env');
}

module.exports = {
  env,
  port: Number(process.env.PORT) || 3000,
  jwtSecret: secret,
  dbPath: process.env.DB_PATH || './data/media-club.db',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './data/uploads'),
  autoApprove: process.env.AUTO_APPROVE === 'true',
  cookieName: 'mc_token',
  maxVideoBytes: 15 * 1024 * 1024,
  maxImageBytes: 25 * 1024 * 1024,
  // Outgoing email (forgot-password links, approval notices). Leave SMTP_HOST
  // empty for local dev: messages are printed to the server log instead.
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.SMTP_FROM || 'MEDIA CLUB <no-reply@localhost>',
  appUrl: (process.env.APP_URL || ('http://localhost:' + (Number(process.env.PORT) || 3000))).replace(/\/$/, ''),
  // Object storage for uploads (1TB+). Set S3_BUCKET to switch the app from
  // local ./data/uploads to a bucket — nothing is kept on local disk then.
  // Works with Cloudflare R2, Backblaze B2, AWS S3, Hetzner Object Storage.
  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.S3_REGION || 'auto',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3Key: process.env.S3_KEY || '',
  s3Secret: process.env.S3_SECRET || '',
  s3PublicUrl: process.env.S3_PUBLIC_URL || '',
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  maxGallery: 12,
  categories: ['Events','Concert','Sports','Nature','Portrait','Street','Product','Film','Other']
};
