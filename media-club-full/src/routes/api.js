const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const sharp = require('sharp');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { issueCookie, requireAuth, requireActive, requireRole } = require('../middleware/auth');
const { sendMail, resetLink } = require('../mail');
const storage = require('../storage');

const r = express.Router();
const id = () => crypto.randomBytes(9).toString('hex');
const parse = (schema, body, res) => {
  const out = schema.safeParse(body);
  if (!out.success) { res.status(400).json({ error: out.error.issues[0].message }); return null; }
  return out.data;
};
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.env === 'test' ? 1000 : 30, standardHeaders: true, legacyHeaders: false });
const formLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: config.env === 'test' ? 1000 : 20 });

/* ---------------- auth ---------------- */
const creds = z.object({ email: z.string().email().max(200), password: z.string().min(8, 'Password must be at least 8 characters').max(200) });

r.post('/auth/register', authLimiter, (req, res) => {
  const d = parse(creds, req.body, res); if (!d) return;
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(d.email)) return res.status(409).json({ error: 'That email is already registered' });
  const uid = id();
  db.prepare(`INSERT INTO users(id,email,password_hash,role,status) VALUES(?,?,?,'member','pending')`).run(uid, d.email, bcrypt.hashSync(d.password, 10));
  const token = issueCookie(res, uid);
  res.status(201).json({ id: uid, email: d.email, role: 'member', status: 'pending', pending: true, message: 'Registered. Awaiting admin approval.', token });
});

r.post('/auth/login', authLimiter, (req, res) => {
  const d = parse(creds.pick({ email: true }).extend({ password: z.string().min(1) }), req.body, res); if (!d) return;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(d.email);
  if (!u || !bcrypt.compareSync(d.password, u.password_hash)) return res.status(401).json({ error: 'Wrong email or password' });
  const st = u.status || 'active';
  if (st === 'pending') { const token = issueCookie(res, u.id); return res.status(403).json({ error: 'Awaiting admin approval', status: 'pending', token }); }
  if (st === 'rejected') return res.status(403).json({ error: 'Registration was declined. Contact the club.', status: 'rejected' });
  const token = issueCookie(res, u.id);
  res.json({ id: u.id, email: u.email, role: u.role, status: st, token });
});

r.post('/auth/logout', (_req, res) => { res.clearCookie(config.cookieName); res.json({ ok: true }); });

r.get('/auth/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const p = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(req.user.id);
  const name = p ? (JSON.parse(p.data).name || '') : '';
  res.json({ user: { ...req.user, status: req.user.status || 'active', name } });
});

r.post('/auth/password', requireAuth, (req, res) => {
  const d = parse(z.object({ current: z.string(), next: z.string().min(8).max(200) }), req.body, res); if (!d) return;
  const u = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(d.current, u.password_hash)) return res.status(401).json({ error: 'Current password is wrong' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(d.next, 10), req.user.id);
  sendMail({ to: req.user.email, subject: 'Your MEDIA CLUB password was changed', text: `Hi,\n\nThe password for ${req.user.email} was just changed. If this wasn't you, reply to this email right away.\n\n— MEDIA CLUB` }).catch(() => {});
  res.json({ ok: true });
});

/* ---------------- forgot password (email link) ---------------- */
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
// Always answers ok so the endpoint can't be used to probe which emails exist.
r.post('/auth/forgot', authLimiter, async (req, res) => {
  const d = parse(z.object({ email: z.string().email().max(200) }), req.body, res); if (!d) return;
  const u = db.prepare('SELECT id, email, status FROM users WHERE email=?').get(d.email);
  if (u && u.status !== 'rejected') {
    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?)').run(u.id, sha256(token), exp);
    db.prepare('DELETE FROM password_resets WHERE expires_at <= strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')').run();
    const link = resetLink(token);
    try {
      const sent = await sendMail({ to: u.email, subject: 'Reset your MEDIA CLUB password', text: `Hi,\n\nSomeone asked to reset the password for ${u.email}. Set a new one here (valid 1 hour):\n\n${link}\n\nDidn't ask for this? Ignore this email — nothing changes.\n\n— MEDIA CLUB` });
      // No SMTP in dev/test: hand the token back so the flow stays testable.
      if (sent.dev && config.env !== 'production') return res.json({ ok: true, devToken: token });
    } catch (e) { console.warn('[mail] forgot-password send failed:', e.message); }
  }
  res.json({ ok: true });
});
r.post('/auth/reset/verify', authLimiter, (req, res) => {
  const d = parse(z.object({ token: z.string().min(10).max(128) }), req.body, res); if (!d) return;
  const row = db.prepare('SELECT user_id, expires_at FROM password_resets WHERE token_hash=?').get(sha256(d.token));
  if (!row || row.expires_at <= new Date().toISOString()) return res.status(400).json({ error: 'This reset link is invalid or expired' });
  res.json({ ok: true });
});
r.post('/auth/reset', authLimiter, async (req, res) => {
  const d = parse(z.object({ token: z.string().min(10).max(128), password: z.string().min(8, 'Password must be at least 8 characters').max(200) }), req.body, res); if (!d) return;
  const row = db.prepare('SELECT user_id, expires_at FROM password_resets WHERE token_hash=?').get(sha256(d.token));
  if (!row || row.expires_at <= new Date().toISOString()) return res.status(400).json({ error: 'This reset link is invalid or expired' });
  const u = db.prepare('SELECT id, email FROM users WHERE id=?').get(row.user_id);
  if (!u) return res.status(400).json({ error: 'This reset link is invalid or expired' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(d.password, 10), u.id);
  db.prepare('DELETE FROM password_resets WHERE token_hash=? OR user_id=?').run(sha256(d.token), u.id);
  sendMail({ to: u.email, subject: 'Your MEDIA CLUB password was changed', text: `Hi,\n\nThe password for ${u.email} was just reset. If this wasn't you, reply to this email right away.\n\n— MEDIA CLUB` }).catch(() => {});
  res.json({ ok: true });
});

/* ---------------- gallery helpers ---------------- */
const RESERVED = new Set(['id', 'type', 'src', 'category', 'uploadedAt', 'featured', 'status']);
function rowToItem(row) {
  return { ...JSON.parse(row.meta), id: row.id, type: row.type, src: row.src, category: row.category,
    uploadedAt: row.uploaded_at, featured: !!row.featured, status: row.status };
}
function itemMeta(it) {
  const m = {};
  for (const [k, v] of Object.entries(it)) {
    if (typeof v === 'boolean') { m[k] = v; continue; }
    if (typeof v === 'string' && v.length < 2000 && !RESERVED.has(k)) m[k] = noTags(v);
  }
  return m;
}
fs.mkdirSync(config.uploadDir, { recursive: true });
const VIDEO_EXT = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };

async function saveDataUrl(src, type) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(src || '');
  if (!m) throw new Error('Bad upload data');
  const buf = Buffer.from(m[2], 'base64');
  if (type === 'video') {
    if (!VIDEO_EXT[m[1]]) throw new Error('Unsupported video type');
    if (buf.length > config.maxVideoBytes) throw new Error('Video is over 15MB');
    return storage.put(buf, { ext: VIDEO_EXT[m[1]], mime: m[1], prefix: 'media' });
  }
  // Same-quality uploads: validate the bytes decode as an image, then store
  // them untouched (no resize, no re-encode) under the matching extension.
  const ext = IMAGE_EXT[m[1]];
  if (!ext) throw new Error('Unsupported image type');
  if (buf.length > config.maxImageBytes) throw new Error(`Image is over ${Math.round(config.maxImageBytes / 1048576)}MB`);
  try { await sharp(buf).metadata(); } catch (_) { throw new Error('Bad upload data'); }
  return storage.put(buf, { ext, mime: m[1], prefix: 'media' });
}
async function unlinkUpload(src) {
  try { await storage.del(src); } catch (_) {}
}

/* ---------------- profile ---------------- */
// Profile/gallery text is rendered unescaped on the site, so strip angle
// brackets on save to block stored-XSS via display names, bios, captions, etc.
const noTags = s => String(s).replace(/[<>]/g, '');
function buildProfile(user) {
  const row = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(user.id);
  if (!row) return null;
  const gallery = db.prepare('SELECT * FROM gallery_items WHERE user_id=? ORDER BY position, uploaded_at').all(user.id).map(rowToItem);
  return { ...JSON.parse(row.data), gallery, accountType: user.role === 'member' ? 'member' : 'oc', role_: user.role };
}

r.get('/profile', requireActive, (req, res) => res.json({ profile: buildProfile(req.user) }));

r.put('/profile', requireActive, async (req, res) => {
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Bad profile' });
  const { gallery, accountType, role_, photo, ...rest } = body;
  const safe = {};
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === 'string') safe[k] = noTags(v).slice(0, 3000);
    else if (Array.isArray(v) && v.length <= 50 && v.every(x => typeof x === 'string')) safe[k] = v.map(x => noTags(x).slice(0, 500));
  }
  let newPhotoFile = null, prevPhoto = null;
  try {
    try { const pr = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(req.user.id); prevPhoto = (pr && JSON.parse(pr.data).photo) || null; } catch (_) {}
    // Profile photos keep original bytes too: data: URLs are saved to
    // /uploads/ so the DB never holds multi-megabyte base64 blobs.
    if (typeof photo === 'string') {
      if (photo.startsWith('data:')) { safe.photo = await saveDataUrl(photo, 'photo'); newPhotoFile = safe.photo; }
      else if (storage.isStoredUrl(photo)) safe.photo = photo;
      else throw new Error('Bad photo');
    }
    if (Array.isArray(gallery)) {
      const existing = db.prepare('SELECT * FROM gallery_items WHERE user_id=?').all(req.user.id);
      const bySrc = new Map(existing.map(e => [e.src, e]));
      const keep = new Set();
      const status = (config.autoApprove || req.user.role !== 'member') ? 'approved' : 'pending';
      const plan = [];
      if (gallery.length > config.maxGallery) return res.status(400).json({ error: `Gallery is limited to ${config.maxGallery} items` });
      for (let i = 0; i < gallery.length; i++) {
        const it = gallery[i];
        if (!it || typeof it !== 'object') continue;
        const type = it.type === 'video' ? 'video' : 'photo';
        const category = config.categories.includes(it.category) ? it.category : 'Other';
        if (typeof it.src === 'string' && bySrc.has(it.src)) { keep.add(it.src); plan.push({ kind: 'update', row: bySrc.get(it.src), it, category, i }); }
        else if (typeof it.src === 'string' && it.src.startsWith('data:')) plan.push({ kind: 'new', it, type, category, i });
      }
      const created = [];
      for (const p of plan) if (p.kind === 'new') { p.src = await saveDataUrl(p.it.src, p.type); created.push(p.src); }
      const tx = db.transaction(() => {
        for (const e of existing) if (!keep.has(e.src)) { db.prepare('DELETE FROM gallery_items WHERE id=?').run(e.id); unlinkUpload(e.src); }
        for (const p of plan) {
          if (p.kind === 'update') db.prepare('UPDATE gallery_items SET category=?, meta=?, position=? WHERE id=?').run(p.category, JSON.stringify(itemMeta(p.it)), p.i, p.row.id);
          else db.prepare('INSERT INTO gallery_items(id,user_id,type,src,category,meta,status,position) VALUES(?,?,?,?,?,?,?,?)')
            .run(id(), req.user.id, p.type, p.src, p.category, JSON.stringify(itemMeta(p.it)), status, p.i);
        }
      });
      try { tx(); } catch (e) { created.forEach(unlinkUpload); throw e; }
      if (status === 'approved' && created.length) {
        let nm = safe.name;
        if (!nm) { try { const pr = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(req.user.id); nm = pr && JSON.parse(pr.data).name; } catch (_) {} }
        notifyFollowers(req.user.id, `${nm || 'A member'} added ${created.length} new photo${created.length === 1 ? '' : 's'}`, '/#member=' + encodeURIComponent('profile:' + req.user.id));
      }
    }
    const prev = db.prepare('SELECT 1 FROM profiles WHERE user_id=?').get(req.user.id);
    if (prev) db.prepare("UPDATE profiles SET data=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=?").run(JSON.stringify(safe), req.user.id);
    else db.prepare('INSERT INTO profiles(user_id,data) VALUES(?,?)').run(req.user.id, JSON.stringify(safe));
    if (newPhotoFile && prevPhoto && storage.isStoredUrl(prevPhoto) && prevPhoto !== '' && prevPhoto !== newPhotoFile) unlinkUpload(prevPhoto);
    res.json({ profile: buildProfile(req.user) });
  } catch (e) {
    if (newPhotoFile) unlinkUpload(newPhotoFile);
    res.status(400).json({ error: e.message || 'Could not save profile' });
  }
});

/* public roster: approved gallery items only, active members only, no private fields */
/* Live counters for the home deck: registered accounts, published frames, years since 2020. */
r.get('/stats', (_req, res) => {
  const members = db.prepare("SELECT COUNT(*) n FROM users WHERE status='active'").get().n;
  const frames = db.prepare("SELECT COUNT(*) n FROM gallery_items WHERE status='approved'").get().n;
  res.json({ stats: { members, frames, years: Math.max(0, new Date().getFullYear() - 2020) } });
});

/* ---------------- page visibility (admin can hide pages) ---------------- */
const TOGGLEABLE_PAGES = ['about', 'gallery', 'team', 'portfolio', 'events', 'history', 'connect'];
function getPageVisibility() {
  const vis = {};
  TOGGLEABLE_PAGES.forEach(p => { vis[p] = true; });
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='pages'").get();
    if (row) { const saved = JSON.parse(row.value); TOGGLEABLE_PAGES.forEach(p => { if (typeof saved[p] === 'boolean') vis[p] = saved[p]; }); }
  } catch (_) {}
  return vis;
}
r.get('/site', (_req, res) => {
  res.json({ pages: getPageVisibility() });
});

/* ---------------- follows + notifications ---------------- */
const socialLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.env === 'test' ? 1000 : 120, standardHeaders: true, legacyHeaders: false });
function memberName(uid) {
  try { const p = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(uid); const n = p && JSON.parse(p.data).name; return n || 'A member'; } catch (_) { return 'A member'; }
}
function pushNotif(userId, text, link) {
  db.prepare('INSERT INTO notifications(id,user_id,text,link) VALUES(?,?,?,?)').run(id(), userId, String(text).slice(0, 200), String(link || '').slice(0, 300));
  db.prepare(`DELETE FROM notifications WHERE user_id=? AND id NOT IN (SELECT id FROM notifications WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50)`).run(userId, userId);
}
function notifyFollowers(memberId, text, link) {
  for (const f of db.prepare('SELECT user_id FROM follows WHERE member_id=?').all(memberId)) {
    if (f.user_id !== memberId) pushNotif(f.user_id, text, link);
  }
}
function notifyAll(text, link, except) {
  for (const u of db.prepare("SELECT id FROM users WHERE status='active'").all()) {
    if (u.id !== except) pushNotif(u.id, text, link);
  }
}
// Recent public activity: approved photos, events, posts. Powers follow alerts for signed-out subscribers.
r.get('/activity', (_req, res) => {
  const photos = db.prepare(`SELECT id,user_id,uploaded_at FROM gallery_items WHERE status='approved' ORDER BY uploaded_at DESC LIMIT 30`).all()
    .map(g => ({ id: g.id, user_id: g.user_id, name: memberName(g.user_id), uploaded_at: g.uploaded_at }));
  const events = db.prepare('SELECT id,title,start_at,created_at FROM events ORDER BY created_at DESC LIMIT 10').all();
  res.json({ activity: { photos, events } });
});
r.get('/follows', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT member_id FROM follows WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
  res.json({ follows: rows.map(f => ({ member_id: f.member_id, name: memberName(f.member_id) })) });
});
r.post('/follows', socialLimiter, requireAuth, (req, res) => {
  const d = parse(z.object({ member_id: z.string().min(1).max(64) }), req.body, res); if (!d) return;
  if (d.member_id === req.user.id) return res.status(400).json({ error: "You can't follow yourself" });
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(d.member_id)) return res.status(404).json({ error: 'Member not found' });
  db.prepare('INSERT OR IGNORE INTO follows(user_id,member_id) VALUES(?,?)').run(req.user.id, d.member_id);
  res.json({ following: true, name: memberName(d.member_id) });
});
r.delete('/follows/:memberId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM follows WHERE user_id=? AND member_id=?').run(req.user.id, req.params.memberId);
  res.json({ following: false });
});
r.get('/notifications', requireAuth, (req, res) => {
  const items = db.prepare('SELECT id,text,link,created_at,read FROM notifications WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 30').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0').get(req.user.id).n;
  res.json({ notifications: items.map(n => ({ ...n, read: !!n.read })), unread });
});
r.post('/notifications/read', socialLimiter, requireAuth, (req, res) => {
  const d = parse(z.object({ ids: z.array(z.string().max(64)).max(50).optional() }), req.body || {}, res); if (!d) return;
  if (d.ids && d.ids.length) db.prepare(`UPDATE notifications SET read=1 WHERE user_id=? AND id IN (${d.ids.map(() => '?').join(',')})`).run(req.user.id, ...d.ids);
  else db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});

/* ---------------- shared photo comments + likes ---------------- */
function getSocial(pid) {
  const row = db.prepare('SELECT likes, comments FROM photo_social WHERE pid=?').get(pid);
  const j = s => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  return row ? { likes: j(row.likes), comments: j(row.comments) } : { likes: [], comments: [] };
}
function putSocial(pid, s) {
  db.prepare(`INSERT INTO photo_social(pid,likes,comments,updated_at) VALUES(?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(pid) DO UPDATE SET likes=excluded.likes, comments=excluded.comments, updated_at=excluded.updated_at`)
    .run(pid, JSON.stringify(s.likes), JSON.stringify(s.comments));
}
function commentName(user) {
  try { const p = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(user.id); const n = p && JSON.parse(p.data).name; if (n) return n; } catch (_) {}
  return String(user.email || 'member').split('@')[0];
}
const canModSocial = u => !!(u && (u.role === 'oc' || u.role === 'admin'));
function socialOut(s, user) {
  const mark = list => list.map(c => ({ ...c, mine: !!user && c.uid === user.id, replies: (c.replies || []).map(r => ({ ...r, mine: !!user && r.uid === user.id })) }));
  return { likeCount: s.likes.length, liked: !!user && s.likes.includes(user.id), canMod: canModSocial(user), comments: mark(s.comments) };
}
const commentSchema = z.object({ text: z.string().min(1).max(280) });
const ownerSchema = z.object({ owner: z.string().min(1).max(64).optional(), link: z.string().max(300).optional() });
// Tell the photo owner (and, for replies, the parent comment author) about new
// activity. Identical unread rows are not duplicated, which keeps a harasser
// from flooding anyone by hammering like/unlike.
function notifySocialOwner(ownerId, actor, text, link) {
  if (!ownerId || ownerId === actor.id) return;
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(ownerId)) return;
  const safeLink = (link && link.startsWith('/#')) ? String(link).slice(0, 200) : '';
  const dup = db.prepare('SELECT 1 FROM notifications WHERE user_id=? AND read=0 AND text=? AND link=?').get(ownerId, text, safeLink);
  if (dup) return;
  pushNotif(ownerId, text, safeLink);
}
r.get('/social/:pid', (req, res) => {
  res.json(socialOut(getSocial(req.params.pid), req.user));
});
r.post('/social/:pid/like', socialLimiter, requireAuth, (req, res) => {
  const o = parse(ownerSchema, req.body || {}, res); if (!o) return;
  const s = getSocial(req.params.pid);
  const i = s.likes.indexOf(req.user.id);
  if (i > -1) s.likes.splice(i, 1); else s.likes.push(req.user.id);
  putSocial(req.params.pid, s);
  if (i === -1) notifySocialOwner(o.owner, req.user, `${commentName(req.user)} liked your photo`, o.link);
  res.json({ liked: i === -1, likeCount: s.likes.length });
});
r.post('/social/:pid/comments', socialLimiter, requireAuth, (req, res) => {
  const d = parse(commentSchema, req.body, res); if (!d) return;
  const o = parse(ownerSchema, req.body || {}, res); if (!o) return;
  const s = getSocial(req.params.pid);
  if (s.comments.length >= 200) return res.status(400).json({ error: 'Comment thread is full' });
  const c = { id: id(), uid: req.user.id, u: commentName(req.user), text: noTags(d.text), t: Date.now(), replies: [] };
  s.comments.push(c);
  putSocial(req.params.pid, s);
  notifySocialOwner(o.owner, req.user, `${commentName(req.user)} commented on your photo`, o.link);
  res.status(201).json({ comment: { ...c, mine: true } });
});
r.post('/social/:pid/comments/:cid/replies', socialLimiter, requireAuth, (req, res) => {
  const d = parse(commentSchema, req.body, res); if (!d) return;
  const o = parse(ownerSchema, req.body || {}, res); if (!o) return;
  const s = getSocial(req.params.pid);
  const c = s.comments.find(x => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'Not found' });
  c.replies = c.replies || [];
  if (c.replies.length >= 100) return res.status(400).json({ error: 'Replies are full here' });
  const rpl = { id: id(), uid: req.user.id, u: commentName(req.user), text: noTags(d.text), t: Date.now() };
  c.replies.push(rpl);
  putSocial(req.params.pid, s);
  notifySocialOwner(o.owner, req.user, `${commentName(req.user)} replied on your photo`, o.link);
  if (c.uid && c.uid !== req.user.id) notifySocialOwner(c.uid, req.user, `${commentName(req.user)} replied to your comment`, o.link);
  res.status(201).json({ reply: { ...rpl, mine: true } });
});
function socialDelCheck(s, cid, rid, user) {
  const c = s.comments.find(x => x.id === cid);
  if (!c) return null;
  if (rid) {
    const r = (c.replies || []).find(x => x.id === rid);
    if (!r) return null;
    if (r.uid !== user.id && !canModSocial(user)) return 'denied';
    return { c, r };
  }
  if (c.uid !== user.id && !canModSocial(user)) return 'denied';
  return { c };
}
r.delete('/social/:pid/comments/:cid', requireAuth, (req, res) => {
  const s = getSocial(req.params.pid);
  const hit = socialDelCheck(s, req.params.cid, null, req.user);
  if (!hit) return res.status(404).json({ error: 'Not found' });
  if (hit === 'denied') return res.status(403).json({ error: 'Not allowed' });
  s.comments = s.comments.filter(x => x.id !== req.params.cid);
  putSocial(req.params.pid, s);
  res.json({ ok: true });
});
r.delete('/social/:pid/comments/:cid/replies/:rid', requireAuth, (req, res) => {
  const s = getSocial(req.params.pid);
  const hit = socialDelCheck(s, req.params.cid, req.params.rid, req.user);
  if (!hit) return res.status(404).json({ error: 'Not found' });
  if (hit === 'denied') return res.status(403).json({ error: 'Not allowed' });
  hit.c.replies = (hit.c.replies || []).filter(x => x.id !== req.params.rid);
  putSocial(req.params.pid, s);
  res.json({ ok: true });
});

r.get('/members', (_req, res) => {
  const rows = db.prepare(`SELECT u.id, u.role, u.status, p.data FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.status='active'`).all();
  const items = db.prepare("SELECT * FROM gallery_items WHERE status='approved' ORDER BY position, uploaded_at").all();
  const byUser = {};
  items.forEach(i => (byUser[i.user_id] = byUser[i.user_id] || []).push(rowToItem(i)));
  res.json({ members: rows.map(({ id: uid, role, data }) => {
    const { phone, memberId, ...pub } = JSON.parse(data);
    return { ...pub, id: uid, accountType: role === 'member' ? 'member' : 'oc', gallery: (byUser[uid] || []).map(({ status, ...x }) => x) };
  }) });
});

/* ---------------- events ---------------- */
const eventRow = e => ({ id: e.id, t: e.title, p: e.blurb, desc: e.description, tag: e.tag, start: e.start_at, end: e.end_at || e.start_at, highlights: JSON.parse(e.highlights || '[]'), photos: JSON.parse(e.photos || '[]') });
// Each event has its own photo set: data: URLs are stored as files,
// existing /uploads/ paths are kept, anything else is dropped.
async function storeEventPhotos(photos) {
  const out = [];
  for (const p of (photos || []).slice(0, 12)) {
    if (typeof p !== 'string') continue;
    if (storage.isStoredUrl(p) && p !== '') { out.push(p); continue; }
    if (p.startsWith('data:')) out.push(await saveDataUrl(p, 'photo'));
  }
  return out;
}
r.get('/events', (_req, res) => res.json({ events: db.prepare('SELECT * FROM events ORDER BY start_at').all().map(eventRow) }));
const evSchema = z.object({
  title: z.string().min(1).max(200), blurb: z.string().max(500).default(''), description: z.string().max(5000).default(''),
  tag: z.string().max(60).default('Open to all'), start: z.string().refine(s => !isNaN(Date.parse(s)), 'Bad start date'),
  end: z.string().refine(s => !isNaN(Date.parse(s)), 'Bad end date').optional(), highlights: z.array(z.string().max(300)).max(12).default([]),
  photos: z.array(z.string().max(20_000_000)).max(12).default([])
});
r.post('/events', requireRole('oc', 'admin'), async (req, res) => {
  const d = parse(evSchema, req.body, res); if (!d) return;
  try {
    const stored = await storeEventPhotos(d.photos);
    const eid = id();
    db.prepare('INSERT INTO events(id,title,blurb,description,tag,start_at,end_at,highlights,photos,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(eid, d.title, d.blurb, d.description, d.tag, d.start, d.end || null, JSON.stringify(d.highlights), JSON.stringify(stored), req.user.id);
    notifyAll(`New event: ${d.title}`, '/#events', req.user.id);
    res.status(201).json({ event: eventRow(db.prepare('SELECT * FROM events WHERE id=?').get(eid)) });
  } catch (e) { res.status(400).json({ error: e.message || 'Could not save event' }); }
});
r.delete('/events/:id', requireRole('oc', 'admin'), (req, res) => {
  const cur = db.prepare('SELECT photos FROM events WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  try { JSON.parse(cur.photos || '[]').forEach(unlinkUpload); } catch (_) {}
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
r.put('/events/:id', requireRole('oc', 'admin'), async (req, res) => {
  const d = parse(evSchema, req.body, res); if (!d) return;
  const cur = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  try {
    const stored = await storeEventPhotos(d.photos);
    const kept = new Set(stored);
    try { JSON.parse(cur.photos || '[]').forEach(s => { if (!kept.has(s)) unlinkUpload(s); }); } catch (_) {}
    db.prepare('UPDATE events SET title=?, blurb=?, description=?, tag=?, start_at=?, end_at=?, highlights=?, photos=? WHERE id=?')
      .run(d.title, d.blurb, d.description, d.tag, d.start, d.end || null, JSON.stringify(d.highlights), JSON.stringify(stored), req.params.id);
    res.json({ event: eventRow(db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id)) });
  } catch (e) { res.status(400).json({ error: e.message || 'Could not save event' }); }
});

/* ---------------- journal ---------------- */
const postRow = p => ({ id: p.id, t: p.title, body: p.body, a: p.author_name, d: new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase(), created_at: p.created_at });
r.get('/posts', (_req, res) => res.json({ posts: db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all().map(postRow) }));
r.post('/posts', requireRole('oc', 'admin'), (req, res) => {
  const d = parse(z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(20000) }), req.body, res); if (!d) return;
  const prof = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(req.user.id);
  const name = prof ? JSON.parse(prof.data).name || req.user.email : req.user.email;
  const pid = id();
  db.prepare('INSERT INTO posts(id,title,body,author_id,author_name) VALUES(?,?,?,?,?)').run(pid, d.title, d.body, req.user.id, name);
  res.status(201).json({ post: postRow(db.prepare('SELECT * FROM posts WHERE id=?').get(pid)) });
});
r.delete('/posts/:id', requireRole('oc', 'admin'), (req, res) => {
  const n = db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id).changes;
  n ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
});
r.put('/posts/:id', requireRole('oc', 'admin'), (req, res) => {
  const d = parse(z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(20000) }), req.body, res); if (!d) return;
  const cur = db.prepare('SELECT id FROM posts WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE posts SET title=?, body=? WHERE id=?').run(d.title, d.body, req.params.id);
  res.json({ post: postRow(db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id)) });
});

/* ---------------- public forms ---------------- */
r.post('/applications', formLimiter, (req, res) => {
  const d = parse(z.object({ name: z.string().min(1).max(200), email: z.string().email().max(200), interest: z.string().max(100).optional(), link: z.string().max(500).optional(), message: z.string().max(3000).optional() }), req.body, res); if (!d) return;
  db.prepare('INSERT INTO applications(name,email,interest,link,message) VALUES(?,?,?,?,?)').run(d.name, d.email, d.interest || '', d.link || '', d.message || '');
  res.status(201).json({ ok: true });
});
r.post('/messages', formLimiter, (req, res) => {
  const d = parse(z.object({ name: z.string().min(1).max(200), email: z.string().email().max(200), message: z.string().min(1).max(5000) }), req.body, res); if (!d) return;
  db.prepare('INSERT INTO messages(name,email,message) VALUES(?,?,?)').run(d.name, d.email, d.message);
  res.status(201).json({ ok: true });
});

/* ---------------- admin ---------------- */
const admin = express.Router();
admin.use(requireRole('admin'));
admin.get('/overview', (_req, res) => {
  const pending = db.prepare("SELECT g.*, u.email, p.data pdata FROM gallery_items g JOIN users u ON u.id=g.user_id LEFT JOIN profiles p ON p.user_id=g.user_id WHERE g.status='pending' ORDER BY g.uploaded_at").all()
    .map(g => ({ ...rowToItem(g), user_id: g.user_id, email: g.email, by: g.pdata ? JSON.parse(g.pdata).name : '' }));
  const users = db.prepare('SELECT id,email,role,status,created_at FROM users ORDER BY created_at DESC').all();
  const profilesById = {};
  db.prepare('SELECT user_id, data FROM profiles').all().forEach(p => { try { profilesById[p.user_id] = JSON.parse(p.data); } catch (_) {} });
  const galleryCountByUser = {};
  db.prepare('SELECT user_id, COUNT(*) c FROM gallery_items GROUP BY user_id').all().forEach(x => galleryCountByUser[x.user_id] = x.c);
  const usersDetailed = users.map(u => ({ ...u, status: u.status || 'active', name: (profilesById[u.id] || {}).name || '', profile: profilesById[u.id] || null, galleryCount: galleryCountByUser[u.id] || 0 }));
  res.json({
    pending,
    pendingUsers: usersDetailed.filter(u => u.status === 'pending'),
    users: usersDetailed,
    allGallery: db.prepare('SELECT g.*, u.email FROM gallery_items g JOIN users u ON u.id=g.user_id ORDER BY g.uploaded_at DESC LIMIT 200').all()
      .map(g => ({ ...rowToItem(g), user_id: g.user_id, email: g.email })),
    events: db.prepare('SELECT * FROM events ORDER BY start_at').all().map(eventRow),
    posts: db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all().map(postRow),
    applications: db.prepare('SELECT * FROM applications ORDER BY created_at DESC LIMIT 200').all(),
    messages: db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 200').all()
  });
});
admin.post('/gallery/:id/:action(approve|reject)', (req, res) => {
  const status = req.params.action === 'approve' ? 'approved' : 'rejected';
  const g = db.prepare('SELECT user_id FROM gallery_items WHERE id=?').get(req.params.id);
  const n = db.prepare('UPDATE gallery_items SET status=? WHERE id=?').run(status, req.params.id).changes;
  if (n && status === 'approved' && g) notifyFollowers(g.user_id, `${memberName(g.user_id)} added new photos`, '/#member=' + encodeURIComponent('profile:' + g.user_id));
  n ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
});
admin.post('/gallery/:id/feature', (req, res) => {
  const n = db.prepare('UPDATE gallery_items SET featured = 1 - featured WHERE id=?').run(req.params.id).changes;
  n ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
});
admin.post('/users/:id/role', (req, res) => {
  const d = parse(z.object({ role: z.enum(['member', 'oc', 'admin']) }), req.body, res); if (!d) return;
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't change your own role" });
  db.prepare('UPDATE users SET role=? WHERE id=?').run(d.role, req.params.id); res.json({ ok: true });
});
admin.post('/users/:id/approve', (req, res) => {
  const u = db.prepare('SELECT id, email FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE users SET status='active' WHERE id=?`).run(req.params.id);
  sendMail({ to: u.email, subject: "You're in — MEDIA CLUB approved your account", text: `Hi,\n\nGood news: your MEDIA CLUB account (${u.email}) was approved. Log in and set up your Crew Profile here:\n\n${config.appUrl}/#dashboard\n\n— MEDIA CLUB` }).catch(() => {});
  res.json({ ok: true });
});
admin.post('/users/:id/reject', (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't reject yourself" });
  const n = db.prepare(`UPDATE users SET status='rejected' WHERE id=?`).run(req.params.id).changes;
  n ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
});
admin.post('/users/:id/status', (req, res) => {
  const d = parse(z.object({ status: z.enum(['pending', 'active', 'rejected']) }), req.body, res); if (!d) return;
  if (req.params.id === req.user.id && d.status !== 'active') return res.status(400).json({ error: "You can't suspend yourself" });
  db.prepare('UPDATE users SET status=? WHERE id=?').run(d.status, req.params.id); res.json({ ok: true });
});
// Admin hides/shows site pages. Home + dashboard stay always visible so login never locks out.
admin.put('/site', (req, res) => {
  const d = parse(z.object({ pages: z.record(z.string(), z.boolean()) }), req.body, res); if (!d) return;
  const vis = getPageVisibility();
  TOGGLEABLE_PAGES.forEach(p => { if (typeof d.pages[p] === 'boolean') vis[p] = d.pages[p]; });
  db.prepare("INSERT INTO settings(key,value) VALUES('pages',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(vis));
  res.json({ pages: vis });
});
// Admin creates a member directly (active immediately, no approval needed)
admin.post('/users', (req, res) => {
  const d = parse(z.object({
    email: z.string().email().max(200),
    password: z.string().min(8, 'Password must be at least 8 characters').max(200),
    role: z.enum(['member', 'oc', 'admin']).default('member'),
    name: z.string().max(200).optional(),
  }), req.body, res); if (!d) return;
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(d.email)) return res.status(409).json({ error: 'That email is already registered' });
  const uid = id();
  db.prepare(`INSERT INTO users(id,email,password_hash,role,status) VALUES(?,?,?,?, 'active')`).run(uid, d.email, bcrypt.hashSync(d.password, 10), d.role);
  if (d.name) db.prepare('INSERT INTO profiles(user_id,data) VALUES(?,?)').run(uid, JSON.stringify({ name: d.name }));
  res.status(201).json({ id: uid, email: d.email, role: d.role, status: 'active' });
});
// Admin edits a member's profile (display name, department, bio, etc.)
admin.put('/users/:id/profile', async (req, res) => {
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Bad profile' });
  const target = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  const { photo, ...rest } = body;
  const safe = {};
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === 'string') safe[k] = noTags(v).slice(0, 3000);
    else if (Array.isArray(v) && v.length <= 50 && v.every(x => typeof x === 'string')) safe[k] = v.map(x => noTags(x).slice(0, 500));
  }
  let newPhotoFile = null;
  try {
    const prev = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(req.params.id);
    const prevPhoto = prev ? (() => { try { return JSON.parse(prev.data).photo || null; } catch (_) { return null; } })() : null;
    if (typeof photo === 'string') {
      if (photo.startsWith('data:')) { safe.photo = await saveDataUrl(photo, 'photo'); newPhotoFile = safe.photo; }
      else if (storage.isStoredUrl(photo)) safe.photo = photo;
      else return res.status(400).json({ error: 'Bad photo' });
    }
    const merged = { ...(prev ? JSON.parse(prev.data) : {}), ...safe };
    if (prev) db.prepare("UPDATE profiles SET data=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=?").run(JSON.stringify(merged), req.params.id);
    else db.prepare('INSERT INTO profiles(user_id,data) VALUES(?,?)').run(req.params.id, JSON.stringify(merged));
    if (newPhotoFile && prevPhoto && storage.isStoredUrl(prevPhoto) && prevPhoto !== '' && prevPhoto !== newPhotoFile) unlinkUpload(prevPhoto);
    res.json({ ok: true, profile: merged });
  } catch (e) {
    if (newPhotoFile) unlinkUpload(newPhotoFile);
    res.status(400).json({ error: e.message || 'Could not save profile' });
  }
});
admin.delete('/gallery/:id', (req, res) => {
  const g = db.prepare('SELECT src FROM gallery_items WHERE id=?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM gallery_items WHERE id=?').run(req.params.id);
  unlinkUpload(g.src);
  res.json({ ok: true });
});
admin.delete('/users/:id', (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't delete yourself" });
  db.prepare('SELECT src FROM gallery_items WHERE user_id=?').all(req.params.id).forEach(g => unlinkUpload(g.src));
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id); res.json({ ok: true });
});
admin.post('/applications/:id/status', (req, res) => {
  const d = parse(z.object({ status: z.enum(['new', 'accepted', 'declined']) }), req.body, res); if (!d) return;
  db.prepare('UPDATE applications SET status=? WHERE id=?').run(d.status, req.params.id); res.json({ ok: true });
});
admin.post('/messages/:id/handled', (req, res) => { db.prepare('UPDATE messages SET handled=1 WHERE id=?').run(req.params.id); res.json({ ok: true }); });
r.use('/admin', admin);

module.exports = r;
