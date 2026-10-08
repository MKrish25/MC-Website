process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.AUTO_APPROVE = 'false';
process.env.UPLOAD_DIR = require('os').tmpdir() + '/mc-test-uploads-' + process.pid;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
const test = require('node:test');
const assert = require('node:assert');
const sharp = require('sharp');
const app = require('../src/app');
const db = require('../src/db');
const bcrypt = require('bcryptjs');

let base, server;
test.before(async () => { server = app.listen(0); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + '/api' + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
}

test('full flow: register, profile, upload, moderation, events, forms', async () => {
  const alice = client(), admin = client(), anon = client();

  assert.equal((await alice('GET', '/auth/me')).body.user, null);
  assert.equal((await alice('POST', '/auth/register', { email: 'a@x.com', password: 'short' })).status, 400);
  const reg = await alice('POST', '/auth/register', { email: 'a@x.com', password: 'password123' });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.status, 'pending');
  assert.equal((await anon('POST', '/auth/register', { email: 'A@x.com', password: 'password123' })).status, 409);
  // pending users are logged in but flagged, and cannot create a profile yet
  assert.equal((await alice('GET', '/auth/me')).body.user.status, 'pending');
  assert.equal((await alice('PUT', '/profile', { name: 'Alice' })).status, 403);

  // admin approves the member
  db.prepare(`INSERT INTO users(id,email,password_hash,role,status) VALUES(?,?,?,?,'active')`).run('adm', 'adm@x.com', bcrypt.hashSync('adminpass1', 4), 'admin');
  await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' });
  assert.equal((await alice('GET', '/admin/overview')).status, 403);
  let ov0 = (await admin('GET', '/admin/overview')).body;
  assert.ok((ov0.pendingUsers || []).some(u => u.email === 'a@x.com'));
  const aliceId = reg.body.id;
  assert.equal((await admin('POST', `/admin/users/${aliceId}/approve`)).status, 200);
  assert.equal((await alice('GET', '/auth/me')).body.user.status, 'active');

  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#888' } }).png().toBuffer();
  const put = await alice('PUT', '/profile', { name: 'Alice', department: 'CS', phone: '999', gallery: [{ type: 'photo', src: 'data:image/png;base64,' + png.toString('base64'), category: 'Street', caption: 'hi' }] });
  assert.equal(put.status, 200);
  assert.equal(put.body.profile.gallery.length, 1);
  assert.equal(put.body.profile.gallery[0].status, 'pending');
  assert.ok(put.body.profile.gallery[0].src.startsWith('/uploads/'));

  // pending items are hidden publicly, private fields never leak
  let pub = (await anon('GET', '/members')).body.members;
  assert.equal(pub[0].gallery.length, 0);
  assert.equal(pub[0].phone, undefined);

  // admin approves gallery
  assert.equal((await alice('GET', '/admin/overview')).status, 403);
  const ov = (await admin('GET', '/admin/overview')).body;
  assert.equal(ov.pending.length, 1);
  await admin('POST', `/admin/gallery/${ov.pending[0].id}/approve`);
  pub = (await anon('GET', '/members')).body.members;
  assert.equal(pub[0].gallery.length, 1);

  // saving again with the existing src keeps it (and its approval)
  const mine = (await alice('GET', '/profile')).body.profile;
  const again = await alice('PUT', '/profile', { ...mine, name: 'Alice B' });
  assert.equal(again.body.profile.gallery[0].status, 'approved');

  // members can't create events; admin can. Only oc/admin can add events.
  assert.equal((await alice('POST', '/events', { title: 'T', start: '2026-11-01T10:00' })).status, 403);
  const evCreated = await admin('POST', '/events', { title: 'T', start: '2026-11-01T10:00', highlights: ['x'] });
  assert.equal(evCreated.status, 201);
  const allEvents = (await anon('GET', '/events')).body.events;
  assert.ok(allEvents.length >= 1);
  assert.ok(allEvents.some(e => e.id === evCreated.body.event.id));
  // admin can edit events, members cannot
  assert.equal((await alice('PUT', `/events/${evCreated.body.event.id}`, { title: 'T2', start: '2026-11-02T10:00' })).status, 403);
  assert.equal((await admin('PUT', `/events/${evCreated.body.event.id}`, { title: 'T2', start: '2026-11-02T10:00' })).status, 200);
  const postCreated = await admin('POST', '/posts', { title: 'P', body: 'B' });
  assert.equal(postCreated.status, 201);
  assert.equal((await admin('PUT', `/posts/${postCreated.body.post.id}`, { title: 'P2', body: 'B2' })).status, 200);

  // admin can add / edit / remove a member
  assert.equal((await alice('POST', '/admin/users', { email: 'b@x.com', password: 'password123' })).status, 403);
  const created = await admin('POST', '/admin/users', { email: 'b@x.com', password: 'password123', name: 'Bob' });
  assert.equal(created.status, 201);
  assert.equal((await admin('PUT', `/admin/users/${created.body.id}/profile`, { name: 'Bobby', department: 'Film' })).status, 200);
  const ovAfter = (await admin('GET', '/admin/overview')).body;
  assert.ok(ovAfter.users.some(u => u.email === 'b@x.com' && u.name === 'Bobby'));
  assert.equal((await admin('DELETE', `/admin/users/${created.body.id}`)).status, 200);

  // public forms
  assert.equal((await anon('POST', '/applications', { name: 'N', email: 'n@x.com', message: 'm' })).status, 201);
  assert.equal((await anon('POST', '/messages', { name: 'N', email: 'bad', message: 'm' })).status, 400);
  assert.equal((await anon('POST', '/messages', { name: 'N', email: 'n@x.com', message: 'm' })).status, 201);

  // login / logout / wrong password
  assert.equal((await anon('POST', '/auth/login', { email: 'a@x.com', password: 'nope' })).status, 401);
  assert.equal((await anon('POST', '/auth/login', { email: 'a@x.com', password: 'password123' })).status, 200);
});

test('authz: members and anon cannot touch admin or oc-only routes', async () => {
  const alice = client(), anon = client(), admin = client();
  await alice('POST', '/auth/login', { email: 'a@x.com', password: 'password123' });
  await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' });
  assert.equal((await anon('GET', '/admin/overview')).status, 401);
  assert.equal((await alice('GET', '/admin/overview')).status, 403);
  assert.equal((await alice('POST', '/admin/users/x/approve')).status, 403);
  assert.equal((await anon('POST', '/posts', { title: 'P', body: 'B' })).status, 401);
  assert.equal((await alice('DELETE', '/posts/nope')).status, 403);
  assert.equal((await anon('PUT', '/profile', { name: 'X' })).status, 401);
});

test('validation: bad inputs are rejected', async () => {
  const anon = client(), admin = client();
  await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' });
  assert.equal((await anon('POST', '/auth/register', { email: 'not-an-email', password: 'password123' })).status, 400);
  assert.equal((await anon('POST', '/events', { title: '', start: 'junk' })).status, 401); // unauth first
  assert.equal((await admin('POST', '/events', { title: 'T', start: 'not-a-date' })).status, 400);
  assert.equal((await admin('POST', '/posts', { title: '', body: '' })).status, 400);
  assert.equal((await admin('POST', '/admin/users', { email: 'bad', password: 'x' })).status, 400);
  assert.equal((await admin('POST', '/admin/users/nonexistent/approve')).status, 404);
  assert.equal((await admin('DELETE', '/events/nonexistent')).status, 404);
  assert.equal((await admin('DELETE', '/posts/nonexistent')).status, 404);
  assert.equal((await admin('POST', '/admin/gallery/nonexistent/approve')).status, 404);
});

test('approval: rejected users cannot log in; pending cannot use profile', async () => {
  const bob = client(), admin = client();
  const reg = await bob('POST', '/auth/register', { email: 'rej@x.com', password: 'password123' });
  assert.equal(reg.status, 201);
  await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' });
  assert.equal((await admin('POST', `/admin/users/${reg.body.id}/reject`)).status, 200);
  assert.equal((await bob('POST', '/auth/login', { email: 'rej@x.com', password: 'password123' })).status, 403);
  assert.equal((await admin('POST', `/admin/users/${reg.body.id}/approve`)).status, 200);
  assert.equal((await bob('POST', '/auth/login', { email: 'rej@x.com', password: 'password123' })).status, 200);
});

test('xss: angle brackets stripped on profile and gallery save', async () => {
  const alice = client();
  await alice('POST', '/auth/login', { email: 'a@x.com', password: 'password123' });
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#888' } }).png().toBuffer();
  const out = await alice('PUT', '/profile', { name: '<img src=x onerror=alert(1)>Al', gallery: [{ type: 'photo', src: 'data:image/png;base64,' + png.toString('base64'), caption: '<b>hi</b>' }] });
  assert.equal(out.status, 200);
  assert.ok(!out.body.profile.name.includes('<'));
  assert.ok(!out.body.profile.gallery[0].caption.includes('<'));
});

test('admin self-protection and gallery limits', async () => {
  const admin = client();
  const me = (await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' })).body;
  assert.equal((await admin('POST', `/admin/users/${me.id}/role`, { role: 'member' })).status, 400);
  assert.equal((await admin('DELETE', `/admin/users/${me.id}`)).status, 400);
  const big = new Array(13).fill({ type: 'photo', src: '/uploads/x.jpg' });
  assert.equal((await admin('PUT', '/profile', { name: 'Adm', gallery: big })).status, 400);
});

test('stats, follows and notifications', async () => {
  const alice = client(), admin = client(), anon = client(), bob = client();
  await alice('POST', '/auth/login', { email: 'a@x.com', password: 'password123' });
  await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' });
  const adminId = (await admin('GET', '/auth/me')).body.user.id;
  const aliceId = (await alice('GET', '/auth/me')).body.user.id;

  // live stats are public
  const st = await anon('GET', '/stats');
  assert.equal(st.status, 200);
  assert.ok(st.body.stats.members >= 2);
  assert.equal(st.body.stats.years, Math.max(0, new Date().getFullYear() - 2020));

  // follows require a login; self-follows and unknown members are rejected
  assert.equal((await anon('GET', '/follows')).status, 401);
  assert.equal((await alice('POST', '/follows', { member_id: aliceId })).status, 400);
  assert.equal((await alice('POST', '/follows', { member_id: 'nope' })).status, 404);
  assert.equal((await alice('POST', '/follows', { member_id: adminId })).status, 200);
  assert.ok((await alice('GET', '/follows')).body.follows.some(f => f.member_id === adminId));

  // admin uploads are auto-approved -> follower gets notified
  const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#444' } }).png().toBuffer();
  const before = (await alice('GET', '/notifications')).body.unread;
  const put = await admin('PUT', '/profile', { name: 'Adm', gallery: [{ type: 'photo', src: 'data:image/png;base64,' + png.toString('base64'), category: 'Other' }] });
  assert.equal(put.status, 200);
  let nt = (await alice('GET', '/notifications')).body;
  assert.equal(nt.unread, before + 1);
  const photoNt = nt.notifications.find(n => !n.read && n.text.includes('Adm'));
  assert.ok(photoNt);
  assert.ok(photoNt.link.includes('member='));
  // recent activity is public
  const act = (await anon('GET', '/activity')).body.activity;
  assert.ok(act.photos.some(p => p.user_id === adminId));
  // mark-all-read clears the badge
  assert.equal((await alice('POST', '/notifications/read', {})).status, 200);
  assert.equal((await alice('GET', '/notifications')).body.unread, 0);
  // unfollow stops future notifications
  assert.equal((await alice('DELETE', `/follows/${adminId}`)).status, 200);
  assert.equal((await alice('GET', '/follows')).body.follows.length, 0);

  // pending member uploads notify followers only once an admin approves
  await bob('POST', '/auth/register', { email: 'f@x.com', password: 'password123' });
  assert.equal((await bob('POST', '/follows', { member_id: aliceId })).status, 200);
  const mine = (await alice('GET', '/profile')).body.profile;
  const up = await alice('PUT', '/profile', { ...mine, name: 'Alice', gallery: [...mine.gallery, { type: 'photo', src: 'data:image/png;base64,' + png.toString('base64'), category: 'Other' }] });
  assert.equal(up.status, 200);
  assert.equal((await bob('GET', '/notifications')).body.unread, 0);
  const ov = (await admin('GET', '/admin/overview')).body;
  const pend = ov.pending.filter(g => g.user_id === aliceId).slice(-1)[0];
  assert.ok(pend);
  assert.equal((await admin('POST', `/admin/gallery/${pend.id}/approve`)).status, 200);
  nt = (await bob('GET', '/notifications')).body;
  assert.equal(nt.unread, 1);
  assert.ok(nt.notifications[0].text.includes('Alice'));
});

test('uploads preserve original bytes', async () => {
  const alice = client();
  await alice('POST', '/auth/login', { email: 'a@x.com', password: 'password123' });
  const fs = require('fs');
  const updir = require('os').tmpdir() + '/mc-test-uploads-' + process.pid + '/';
  const fileOf = src => updir + src.replace('/uploads/', '');

  // PNG gallery upload: stored byte-identical, keeps .png (transparency intact)
  const png = await sharp({ create: { width: 24, height: 18, channels: 4, background: { r: 9, g: 9, b: 9, alpha: 0.4 } } }).png().toBuffer();
  const mine = (await alice('GET', '/profile')).body.profile;
  const up = await alice('PUT', '/profile', { ...mine, name: 'Alice', gallery: [...mine.gallery.slice(-9), { type: 'photo', src: 'data:image/png;base64,' + png.toString('base64'), category: 'Other' }] });
  assert.equal(up.status, 200);
  const item = up.body.profile.gallery[up.body.profile.gallery.length - 1];
  assert.ok(item.src.endsWith('.png'));
  assert.deepEqual(fs.readFileSync(fileOf(item.src)), png);

  // GIF round-trips untouched (animation + transparency preserved)
  const gif = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).gif().toBuffer();
  const up2 = await alice('PUT', '/profile', { ...mine, name: 'Alice', gallery: [...mine.gallery.slice(-9), { type: 'photo', src: 'data:image/gif;base64,' + gif.toString('base64'), category: 'Other' }] });
  assert.equal(up2.status, 200);
  const gitem = up2.body.profile.gallery[up2.body.profile.gallery.length - 1];
  assert.ok(gitem.src.endsWith('.gif'));
  assert.deepEqual(fs.readFileSync(fileOf(gitem.src)), gif);

  // profile photo data URLs become files, never giant base64 in the DB
  const photo = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#abc' } }).jpeg().toBuffer();
  const pp = await alice('PUT', '/profile', { name: 'Alice', photo: 'data:image/jpeg;base64,' + photo.toString('base64') });
  assert.equal(pp.status, 200);
  assert.ok(pp.body.profile.photo.startsWith('/uploads/'));
  assert.deepEqual(fs.readFileSync(fileOf(pp.body.profile.photo)), photo);

  // unsupported types and oversized images are rejected, not silently mangled
  assert.equal((await alice('PUT', '/profile', { name: 'Alice', photo: 'data:text/plain;base64,aGk=' })).status, 400);
  const huge = Buffer.alloc(26 * 1024 * 1024, 0);
  assert.equal((await alice('PUT', '/profile', { name: 'Alice', gallery: [{ type: 'photo', src: 'data:image/png;base64,' + huge.toString('base64'), category: 'Other' }] })).status, 400);
});

test('shared photo comments and likes', async () => {
  const alice = client(), admin = client(), anon = client(), bob = client();
  await alice('POST', '/auth/login', { email: 'a@x.com', password: 'password123' });
  await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' });
  await bob('POST', '/auth/register', { email: 'c@x.com', password: 'password123' }); // pending but signed in
  const pid = 'testphoto1';
  // public read starts empty; anonymous writes are rejected
  assert.deepEqual((await anon('GET', '/social/' + pid)).body.comments, []);
  assert.equal((await anon('POST', `/social/${pid}/comments`, { text: 'hi' })).status, 401);
  assert.equal((await anon('POST', `/social/${pid}/like`)).status, 401);
  // any signed-in user can comment; validation + xss handling apply
  assert.equal((await bob('POST', `/social/${pid}/comments`, { text: 'hello @all' })).status, 201);
  assert.equal((await bob('POST', `/social/${pid}/comments`, { text: '' })).status, 400);
  assert.equal((await bob('POST', `/social/${pid}/comments`, { text: 'x'.repeat(281) })).status, 400);
  const cx = await bob('POST', `/social/${pid}/comments`, { text: '<img src=x>yo' });
  assert.ok(!cx.body.comment.text.includes('<'));
  // another user sees the shared thread; other people's comments are not marked mine
  let g = await alice('GET', '/social/' + pid);
  assert.equal(g.body.comments.length, 2);
  assert.equal(g.body.comments[0].mine, false);
  // replies, incl. 404 on unknown comment
  const cid = g.body.comments[0].id;
  const rp = await alice('POST', `/social/${pid}/comments/${cid}/replies`, { text: 'welcome' });
  assert.equal(rp.status, 201);
  assert.equal((await alice('POST', `/social/${pid}/comments/nonexistent/replies`, { text: 'x' })).status, 404);
  // likes toggle and stay shared across users
  let lk = await alice('POST', `/social/${pid}/like`);
  assert.deepEqual([lk.body.liked, lk.body.likeCount], [true, 1]);
  assert.equal((await bob('POST', `/social/${pid}/like`)).body.likeCount, 2);
  lk = await alice('POST', `/social/${pid}/like`);
  assert.deepEqual([lk.body.liked, lk.body.likeCount], [false, 1]);
  // delete: stranger denied, owner ok, admin can moderate
  const rid = rp.body.reply.id;
  assert.equal((await bob('DELETE', `/social/${pid}/comments/${cid}/replies/${rid}`)).status, 403);
  assert.equal((await alice('DELETE', `/social/${pid}/comments/${cid}/replies/${rid}`)).status, 200);
  const ac = await alice('POST', `/social/${pid}/comments`, { text: 'alice note' });
  assert.equal(ac.status, 201);
  assert.equal((await bob('DELETE', `/social/${pid}/comments/${ac.body.comment.id}`)).status, 403);
  assert.equal((await admin('DELETE', `/social/${pid}/comments/${ac.body.comment.id}`)).status, 200);
  assert.equal((await bob('DELETE', `/social/${pid}/comments/${cid}`)).status, 200);
  assert.equal((await anon('GET', '/social/' + pid)).body.comments.length, 1);
});

test('page visibility toggles', async () => {
  const admin = client(), anon = client();
  await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' });
  // public read, everything visible by default
  let s = await anon('GET', '/site');
  assert.equal(s.status, 200);
  for (const p of ['about', 'gallery', 'team', 'portfolio', 'events', 'history', 'connect']) assert.equal(s.body.pages[p], true);
  // anonymous writes rejected; unknown keys ignored
  assert.equal((await anon('PUT', '/admin/site', { pages: { gallery: false } })).status, 401);
  assert.equal((await admin('PUT', '/admin/site', { pages: { gallery: false, nope: true } })).status, 200);
  s = await anon('GET', '/site');
  assert.equal(s.body.pages.gallery, false);
  assert.equal(s.body.pages.nope, undefined);
  assert.equal(s.body.pages.events, true);
  // restore for other tests / the live site
  assert.equal((await admin('PUT', '/admin/site', { pages: { gallery: true } })).status, 200);
});

test('photo owners are notified of likes and comments', async () => {
  const alice = client(), admin = client(), bob = client();
  await alice('POST', '/auth/login', { email: 'a@x.com', password: 'password123' });
  await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' });
  await bob('POST', '/auth/register', { email: 'd@x.com', password: 'password123' });
  const aliceId = (await alice('GET', '/auth/me')).body.user.id;
  const pid = 'ownerphoto1', link = '/#gallery';
  const unreadOf = async c => (await c('GET', '/notifications')).body.unread;

  // someone comments on alice's photo -> she is notified with the link
  assert.equal((await bob('POST', `/social/${pid}/comments`, { text: 'nice shot!', owner: aliceId, link })).status, 201);
  let items = (await alice('GET', '/notifications')).body.notifications.filter(n => !n.read);
  let cm = items.find(n => n.text.includes('commented on your photo'));
  assert.ok(cm);
  assert.equal(cm.link, link);
  // own actions never notify self
  const base = await unreadOf(alice);
  assert.equal((await alice('POST', `/social/${pid}/comments`, { text: 'my own', owner: aliceId, link })).status, 201);
  assert.equal((await alice('POST', `/social/${pid}/like`, { owner: aliceId, link })).status, 200);
  assert.equal(await unreadOf(alice), base);
  // a like notifies once; hammering like/unlike does not stack duplicates
  assert.equal((await bob('POST', `/social/${pid}/like`, { owner: aliceId, link })).status, 200);
  assert.equal(await unreadOf(alice), base + 1);
  assert.equal((await bob('POST', `/social/${pid}/like`, { owner: aliceId, link })).status, 200); // unlike
  assert.equal((await bob('POST', `/social/${pid}/like`, { owner: aliceId, link })).status, 200); // like again
  assert.equal(await unreadOf(alice), base + 1);
  // a reply notifies the owner AND the parent comment author
  const list = (await alice('GET', '/social/' + pid)).body.comments;
  const parent = list.find(c => c.text.includes('nice shot'));
  assert.ok(parent);
  const bobBase = await unreadOf(bob);
  assert.equal((await admin('POST', `/social/${pid}/comments/${parent.id}/replies`, { text: 'thanks!', owner: aliceId, link })).status, 201);
  items = (await alice('GET', '/notifications')).body.notifications.filter(n => !n.read);
  assert.ok(items.some(n => n.text.includes('replied on your photo')));
  assert.equal(await unreadOf(bob), bobBase + 1);
  const bitems = (await bob('GET', '/notifications')).body.notifications.filter(n => !n.read);
  assert.ok(bitems.some(n => n.text.includes('replied to your comment')));
  // unknown owners and off-site links are ignored, never crash or notify
  const preEvil = await unreadOf(alice);
  assert.equal((await bob('POST', `/social/${pid}/comments`, { text: 'x', owner: 'nope', link: 'http://evil' })).status, 201);
  assert.equal(await unreadOf(alice), preEvil);
});

test('forgot password + reset via email link', async () => {
  const alice = client(), anon = client();
  await alice('POST', '/auth/login', { email: 'a@x.com', password: 'password123' });
  // unknown emails get the same ok (no account probing), and no token leaks
  const ghost = await anon('POST', '/auth/forgot', { email: 'nobody@x.com', password: undefined });
  assert.equal(ghost.status, 200);
  assert.equal(ghost.body.devToken, undefined);
  assert.equal((await anon('POST', '/auth/forgot', { email: 'not-an-email' })).status, 400);
  // known email: dev mode hands back a one-time token (no SMTP in tests)
  const fg = await anon('POST', '/auth/forgot', { email: 'a@x.com' });
  assert.equal(fg.status, 200);
  assert.ok(fg.body.devToken);
  const token = fg.body.devToken;
  // verify + validation
  assert.equal((await anon('POST', '/auth/reset/verify', { token: 'bogus-token-value' })).status, 400);
  assert.equal((await anon('POST', '/auth/reset/verify', { token })).status, 200);
  assert.equal((await anon('POST', '/auth/reset', { token, password: 'short' })).status, 400);
  // reset works once: old password dies, new one works
  assert.equal((await anon('POST', '/auth/reset', { token, password: 'brandnewpass1' })).status, 200);
  assert.equal((await anon('POST', '/auth/reset', { token, password: 'anotherpass1' })).status, 400);
  assert.equal((await anon('POST', '/auth/login', { email: 'a@x.com', password: 'password123' })).status, 401);
  assert.equal((await anon('POST', '/auth/login', { email: 'a@x.com', password: 'brandnewpass1' })).status, 200);
  // expired links are rejected (seeded straight into the DB)
  const crypto = require('crypto');
  const db = require('../src/db');
  const expired = crypto.randomBytes(32).toString('hex');
  const uid = (await alice('GET', '/auth/me')).body.user.id;
  db.prepare('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?)')
    .run(uid, crypto.createHash('sha256').update(expired).digest('hex'), '2000-01-01T00:00:00.000Z');
  assert.equal((await anon('POST', '/auth/reset', { token: expired, password: 'validpass99' })).status, 400);
  // restore alice's original password so later tests keep working
  const fg2 = await anon('POST', '/auth/forgot', { email: 'a@x.com' });
  assert.equal((await anon('POST', '/auth/reset', { token: fg2.body.devToken, password: 'password123' })).status, 200);
});

test('storage driver: local roundtrip + url recognition', async () => {
  const storage = require('../src/storage');
  assert.equal(storage.useS3(), false);
  assert.ok(storage.isStoredUrl('/uploads/abc.jpg'));
  assert.ok(storage.isStoredUrl(''));
  assert.ok(!storage.isStoredUrl('data:image/png;base64,xx'));
  assert.ok(!storage.isStoredUrl('http://evil/x.jpg'));
  assert.ok(!storage.isStoredUrl(null));
  const url = await storage.put(Buffer.from('hello-media'), { ext: '.jpg', mime: 'image/jpeg' });
  assert.ok(url.startsWith('/uploads/') && url.endsWith('.jpg'));
  const fs = require('fs');
  const f = require('os').tmpdir() + '/mc-test-uploads-' + process.pid + '/' + url.replace('/uploads/', '');
  assert.equal(fs.readFileSync(f, 'utf8'), 'hello-media');
  await storage.del(url);
  assert.ok(!fs.existsSync(f));
  await storage.del('/uploads/does-not-exist.jpg'); // never throws
  await storage.del(null);
});

test('events have their own photo sets', async () => {
  const admin = client(), anon = client();
  await admin('POST', '/auth/login', { email: 'adm@x.com', password: 'adminpass1' });
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#123' } }).png().toBuffer();
  const created = await admin('POST', '/events', { title: 'Photo Event', start: '2026-12-10T10:00', photos: ['data:image/png;base64,' + png.toString('base64')] });
  assert.equal(created.status, 201);
  assert.equal(created.body.event.photos.length, 1);
  assert.ok(created.body.event.photos[0].startsWith('/uploads/'));
  const listed = (await anon('GET', '/events')).body.events;
  assert.ok(listed.some(e => e.id === created.body.event.id && e.photos.length === 1));
  // member creates are rejected, photos included
  const alice = client();
  await alice('POST', '/auth/login', { email: 'a@x.com', password: 'password123' });
  assert.equal((await alice('POST', '/events', { title: 'X', start: '2026-12-10T10:00', photos: [] })).status, 403);
  // removing the photo unlinks the file
  const fs = require('fs');
  const file = created.body.event.photos[0].replace('/uploads/', require('os').tmpdir() + '/mc-test-uploads-' + process.pid + '/');
  assert.ok(fs.existsSync(file));
  const upd = await admin('PUT', `/events/${created.body.event.id}`, { title: 'Photo Event', start: '2026-12-10T10:00', photos: [] });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.event.photos.length, 0);
  assert.ok(!fs.existsSync(file));
  assert.equal((await admin('DELETE', `/events/${created.body.event.id}`)).status, 200);
});
