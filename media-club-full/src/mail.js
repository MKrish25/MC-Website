const config = require('./config');

let transporter = null;
function getTransporter() {
  if (!config.smtpHost) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    });
  }
  return transporter;
}

function isMailConfigured() {
  return !!config.smtpHost;
}

// Sends an email. When no SMTP server is configured (local dev), the message
// is printed to the server log instead of being sent, so auth flows stay
// testable without credentials.
async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mail:dev] to=${to} subject=${subject}\n${text}`);
    return { dev: true };
  }
  await t.sendMail({ from: config.mailFrom, to, subject, text, html: html || text });
  return { dev: false };
}

function resetLink(token) {
  return `${config.appUrl}/#reset/${encodeURIComponent(token)}`;
}

module.exports = { sendMail, isMailConfigured, resetLink };
