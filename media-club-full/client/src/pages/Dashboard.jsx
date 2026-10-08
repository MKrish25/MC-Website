import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthAPI, SiteAPI, AdminAPI } from '../api';
import { useSite } from '../store';
import { claim, getAcct, hashPass, setAcct, setSession, slugU, subMe, useSubscriber, verifyPass } from '../subscriber';

const INTEREST_OPTIONS = ['Photography', 'Film & Video', 'Editing', 'Writing', 'Event Coverage', 'Social Media'];
const STASH_KEY = 'mc_pending_crew';
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

function initials(n) {
  return String(n || '').split(' ').map((w) => w[0]).join('').slice(0, 2);
}

function normGalleryItem(item, i) {
  const base = {
    id: 'g' + i, type: 'photo', src: '', camera: '', lens: '', aperture: '',
    shutter: '', iso: '', focal: '', editedIn: '', caption: '', location: '',
    date: '', allowDownload: false, category: 'Other', uploadedAt: null, featured: false,
  };
  if (typeof item === 'string') return { ...base, src: item };
  return { ...base, ...(item || {}) };
}

function eventStatus(ev) {
  const now = new Date(), start = new Date(ev.start), end = new Date(ev.end || ev.start);
  if (now < start) return 'upcoming';
  if (now > end) return 'past';
  return 'live';
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function readFileDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Canvas downscale: profile photos become max-1400px JPEG data URLs,
// gallery uploads max-2400px (matches originalOrPreview(f,1400,.9) / (f,2400,.92)).
function resizeImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else if (h >= w && h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blankProfile(fields) {
  return {
    name: fields.name || '',
    role: fields.department || 'Member',
    bio: '',
    links: ['', '', ''],
    photo: fields.photo || '',
    insta: fields.insta || '',
    favCamera: '',
    phone: fields.phone || '',
    batch: fields.batch || '',
    department: fields.department || '',
    memberId: fields.memberId || '',
    interests: fields.interests || [],
    accountType: 'member',
    gallery: [],
    myEvents: [],
    joinedAt: new Date().toISOString(),
  };
}

function readStash() {
  try { return JSON.parse(localStorage.getItem(STASH_KEY) || 'null'); } catch (_) { return null; }
}

// "OCT 04" style input -> ISO string the server accepts; null when unparseable.
function parseEventDate(d) {
  const raw = String(d || '').trim();
  if (!raw) return null;
  let t = Date.parse(raw);
  if (!isNaN(t)) return new Date(t).toISOString();
  t = Date.parse(raw + ' ' + new Date().getFullYear());
  if (!isNaN(t)) return new Date(t).toISOString();
  return null;
}

function AuthTabs({ active, onPick }) {
  return (
    <div className="auth-tabs" role="tablist">
      <button type="button" data-tab="register" className={active === 'register' ? 'on' : ''} onClick={() => onPick('register')}>Register</button>
      <button type="button" data-tab="login" className={active === 'login' ? 'on' : ''} onClick={() => onPick('login')}>Log in</button>
      <button type="button" data-tab="subscribe" className={active === 'subscribe' ? 'on' : ''} onClick={() => onPick('subscribe')}>Subscribe</button>
    </div>
  );
}

/* Subscriber sign-up / log-in (username + email + password, kept in this
   browser — not a Media Club member profile). Powers likes + comments for
   non-members. Mirrors the original subscribe panel copy and validation. */
function SubscribePanel({ onPick }) {
  useSubscriber();
  const [subTab, setSubTab] = useState('up');
  const [u, setU] = useState('');
  const [em, setEm] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const m = subMe();
  const legacy = subTab === 'in' && !!getAcct() && !getAcct().pass;

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (subTab === 'up') {
        const username = slugU(u);
        if (username.length < 3) { setErr('Username: 3+ letters or numbers.'); return; }
        if (!/^\S+@\S+\.\S+$/.test(em.trim())) { setErr('Enter a valid email.'); return; }
        if (pw.length < 8) { setErr('Password: 8+ characters.'); return; }
        if (!(await claim(username))) { setErr('That username is taken.'); return; }
        setAcct({ username, email: em.trim(), pass: await hashPass(pw), likes: [], comments: [], joined: Date.now() });
      } else {
        const a = getAcct();
        if (!a || (slugU(u) !== a.username && u.trim().toLowerCase() !== String(a.email || '').toLowerCase())) {
          setErr('No subscription found for this identity. Try signing up.'); return;
        }
        if (a.pass) {
          if (!(await verifyPass(pw, a.pass))) { setErr('Wrong password. Try again.'); return; }
        } else {
          if (pw.length < 8) { setErr('Choose a password (8+ characters).'); return; }
          a.pass = await hashPass(pw);
          setAcct(a);
        }
      }
      setSession(true);
      setU(''); setEm(''); setPw('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-title"><div className="sec-head"><div className="kicker">Subscribe</div><span className="frame-tag">FRAME 00/36</span></div>
        <h2 className="sec">Follow along as a subscriber.</h2></div>
      <AuthTabs active="subscribe" onPick={onPick} />
      <div className="login-box" style={{ textAlign: 'center' }}>
        <p className="note" style={{ margin: '0 0 22px' }}>Subscribers can like photos and join comment threads. A subscription is not a Media Club member profile.</p>
        {m ? (
          <>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 20, marginBottom: 6 }}>You’re subscribed.</p>
            <p className="note" style={{ margin: '0 0 22px' }}>Signed in as <b>@{m.u}</b>. Use this account to like and comment.</p>
            <button className="submit-btn" type="button" onClick={() => setSession(false)}>Log out of subscription</button>
          </>
        ) : (
          <>
            <div className="sx-tabs" role="tablist" style={{ justifyContent: 'center', display: 'flex', gap: 8, marginBottom: 18 }}>
              <button type="button" onClick={() => { setSubTab('up'); setErr(''); }} style={{ textDecoration: subTab === 'up' ? 'underline' : 'none' }}>Sign up</button>
              <button type="button" onClick={() => { setSubTab('in'); setErr(''); }} style={{ textDecoration: subTab === 'in' ? 'underline' : 'none' }}>Log in</button>
            </div>
            <form noValidate style={{ textAlign: 'left' }} onSubmit={onSubmit}>
              {subTab === 'up' ? (
                <>
                  <div className="field"><label>Username</label><input autoComplete="username" maxLength={24} required value={u} onChange={(e) => setU(e.target.value)} /></div>
                  <div className="field"><label>Email</label><input type="email" autoComplete="email" required value={em} onChange={(e) => setEm(e.target.value)} /></div>
                  <div className="field"><label>Password</label><input type="password" autoComplete="new-password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
                </>
              ) : (
                <>
                  <div className="field"><label>Username or email</label><input autoComplete="username" required value={u} onChange={(e) => setU(e.target.value)} /></div>
                  <div className="field"><label>{legacy ? 'Create a password (8+ characters)' : 'Password'}</label><input type="password" autoComplete={legacy ? 'new-password' : 'current-password'} minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
                </>
              )}
              <p className="note" role="alert" style={{ display: err ? 'block' : 'none', color: '#e0342c' }}>{err}</p>
              <button className="submit-btn" style={{ width: '100%', marginTop: 6 }} disabled={busy}>{busy ? 'One moment…' : (subTab === 'up' ? 'Create subscription' : (legacy ? 'Set password & log in' : 'Log in'))}</button>
            </form>
            <p className="note" style={{ marginTop: 14 }}>Subscriber passwords live only in this browser — forgotten yours? Just create a fresh subscription. Club members: <Link to="/reset">reset your password here</Link>.</p>
          </>
        )}
        <p className="note" style={{ marginTop: 14 }}>Member of the club? <button type="button" className="logout" onClick={() => onPick('login')}>Log in here</button> or <Link to="/gallery">browse the Gallery</Link>.</p>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { me, myProfile, setMyProfile, refreshMe, refreshPublic, events, authChecked } = useSite();
  const navigate = useNavigate();

  const [authTab, setAuthTab] = useState('register');
  const [dashTab, setDashTab] = useState(() => (typeof window !== 'undefined' && window.__dashTab) || 'profile');

  // Login form
  const [liEmail, setLiEmail] = useState('');
  const [liPass, setLiPass] = useState('');
  const [liErr, setLiErr] = useState('');
  const [liBusy, setLiBusy] = useState(false);

  // Register form (account + crew profile, one step like the original)
  const [reg, setReg] = useState(() => ({ ...(readStash() || {}), email: '', password: '' }));
  const [regErr, setRegErr] = useState('');
  const [regBusy, setRegBusy] = useState(false);

  // Logged-in profile edit fields
  const [edit, setEdit] = useState({ name: '', role: '', insta: '', favCamera: '', side: 'left', bio: '', links: ['', '', ''] });
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  // OC mini add-event form
  const [evForm, setEvForm] = useState({ date: '', tag: '', title: '', desc: '' });
  const [evMsg, setEvMsg] = useState({ ok: '', err: '' });

  const [galErr, setGalErr] = useState('');
  const galTimer = useRef(null);
  const profileRef = useRef(myProfile);
  profileRef.current = myProfile;

  useEffect(() => () => { if (galTimer.current) clearTimeout(galTimer.current); }, []);

  // Sync edit fields whenever the server profile loads/changes.
  useEffect(() => {
    if (!myProfile) return;
    setEdit({
      name: myProfile.name || '',
      role: myProfile.role || '',
      insta: myProfile.insta || '',
      favCamera: myProfile.favCamera || '',
      side: myProfile.side || 'left',
      bio: myProfile.bio || '',
      links: [0, 1, 2].map((i) => (myProfile.links || [])[i] || ''),
    });
    setPendingPhoto(null);
    setSaved(false);
  }, [myProfile && myProfile.id, myProfile && myProfile.updated_at, !!myProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill the crew form from stashed pending-registration data.
  useEffect(() => {
    if (me && me.status !== 'pending' && !myProfile) {
      const s = readStash();
      if (s) setReg((p) => ({ ...s, email: p.email || s.email || '', password: '' }));
    }
  }, [me && me.status, !!myProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickDashTab(t) {
    setDashTab(t);
    try { window.__dashTab = t; } catch (_) {}
    requestAnimationFrame(() => {
      const el = document.getElementById('dashArea');
      if (el) el.scrollIntoView({ block: 'start' });
    });
  }

  async function persistProfile(next) {
    const { profile } = await SiteAPI.saveProfile(next);
    setMyProfile(profile);
    profileRef.current = profile;
    refreshPublic();
    return profile;
  }

  /* ---------- auth ---------- */

  async function onLogin(e) {
    e.preventDefault();
    setLiErr('');
    if (!/^\S+@\S+\.\S+$/.test(liEmail.trim())) { setLiErr('Enter a valid email.'); return; }
    if (!liPass) { setLiErr('Enter your password.'); return; }
    setLiBusy(true);
    try {
      await AuthAPI.login(liEmail.trim(), liPass);
      await refreshMe();
    } catch (ex) {
      if (/awaiting admin approval/i.test(ex.message || '')) {
        try { await refreshMe(); } catch (_) {}
        return;
      }
      setLiErr(ex.message || 'Wrong email or password');
    } finally {
      setLiBusy(false);
    }
  }

  async function onRegister(e) {
    e.preventDefault();
    setRegErr('');
    const email = String(reg.email || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setRegErr('Enter a valid email.'); return; }
    if (String(reg.password || '').length < 8) { setRegErr('Password: 8+ characters.'); return; }
    if (!String(reg.name || '').trim()) { setRegErr('Please add your name to continue.'); return; }
    setRegBusy(true);
    try {
      await AuthAPI.register(email, reg.password);
      const crew = blankProfile({
        name: String(reg.name || '').trim(),
        phone: String(reg.phone || '').trim(),
        department: String(reg.department || '').trim(),
        batch: String(reg.batch || '').trim(),
        memberId: String(reg.memberId || '').trim(),
        interests: reg.interests || [],
        photo: reg.photo || '',
        insta: String(reg.link || '').trim(),
      });
      try {
        const savedProfile = await SiteAPI.saveProfile(crew);
        setMyProfile(savedProfile);
        try { localStorage.removeItem(STASH_KEY); } catch (_) {}
        refreshPublic();
      } catch (saveEx) {
        // Pending accounts cannot write a profile yet — stash it on this
        // device so the form is prefilled once the account is approved.
        try { localStorage.setItem(STASH_KEY, JSON.stringify({ ...crew, email })); } catch (_) {}
        if (!/awaiting admin approval/i.test(saveEx.message || '')) throw saveEx;
      }
      await refreshMe();
    } catch (ex) {
      setRegErr(ex.message || 'Could not register — try again.');
    } finally {
      setRegBusy(false);
    }
  }

  async function onLogout() {
    try { await AuthAPI.logout(); } catch (_) {}
    setPendingPhoto(null);
    setSaved(false);
    await refreshMe();
    navigate('/dashboard');
  }

  async function onRegPhoto(file) {
    if (!file) return;
    const url = await resizeImage(file, 1400, 0.9);
    setReg((p) => ({ ...p, photo: url }));
  }

  async function onProfilePhoto(file) {
    if (!file) return;
    const url = await resizeImage(file, 1400, 0.9);
    setPendingPhoto(url);
    setSaved(false);
  }

  /* ---------- logged-in mutations ---------- */

  async function onSaveProfile() {
    setSaveErr('');
    const current = profileRef.current || {};
    try {
      await persistProfile({
        ...current,
        name: edit.name,
        role: edit.role,
        insta: edit.insta,
        favCamera: edit.favCamera,
        side: edit.side,
        bio: edit.bio,
        links: [edit.links[0] || '', edit.links[1] || '', edit.links[2] || ''],
        photo: pendingPhoto || current.photo || '',
      });
      setPendingPhoto(null);
      setSaved(true);
    } catch (ex) {
      setSaveErr(ex.message || 'Could not save — try again.');
    }
  }

  async function onGalFiles(files) {
    setGalErr('');
    const list = [...files];
    if (!list.length) return;
    const current = profileRef.current || {};
    let gallery = (current.gallery || []).map((raw, i) => normGalleryItem(raw, i));
    for (const f of list) {
      if (gallery.length >= 12) break;
      const isVideo = f.type.startsWith('video/');
      let src;
      if (isVideo) {
        if (f.size > MAX_VIDEO_BYTES) { alert(f.name + ' is over 15MB — pick a shorter clip or compress it first.'); continue; }
        src = await readFileDataURL(f);
      } else {
        src = await resizeImage(f, 2400, 0.92);
      }
      gallery.push({
        type: isVideo ? 'video' : 'photo', src, camera: '', lens: '', aperture: '',
        shutter: '', iso: '', focal: '', editedIn: '', caption: '', location: '',
        date: '', allowDownload: false, category: 'Other',
        uploadedAt: new Date().toISOString(), featured: false,
      });
    }
    try {
      await persistProfile({ ...current, gallery });
    } catch (ex) {
      setGalErr(ex.message || 'Could not upload — try again.');
    }
  }

  function scheduleGalSave(next) {
    profileRef.current = next;
    setMyProfile(next);
    if (galTimer.current) clearTimeout(galTimer.current);
    galTimer.current = setTimeout(async () => {
      try {
        await persistProfile(profileRef.current);
      } catch (_) { /* keep local edits; next keystroke retries */ }
    }, 400);
  }

  function onGalField(i, f, value) {
    const current = profileRef.current || {};
    const gallery = (current.gallery || []).map((raw, k) => normGalleryItem(raw, k));
    if (!gallery[i]) return;
    gallery[i] = { ...gallery[i], [f]: value };
    scheduleGalSave({ ...current, gallery });
  }

  async function onGalRemove(i) {
    const current = profileRef.current || {};
    const gallery = (current.gallery || []).map((raw, k) => normGalleryItem(raw, k));
    gallery.splice(i, 1);
    if (galTimer.current) clearTimeout(galTimer.current);
    try {
      await persistProfile({ ...current, gallery });
    } catch (ex) {
      setGalErr(ex.message || 'Could not delete — try again.');
    }
  }

  async function onAddEvent() {
    setEvMsg({ ok: '', err: '' });
    const start = parseEventDate(evForm.date);
    if (!evForm.date.trim() || !evForm.title.trim()) return;
    if (!start) { setEvMsg({ ok: '', err: 'Enter a usable date — e.g. 2026-10-04 or OCT 04 2026.' }); return; }
    try {
      await AdminAPI.createEvent({
        title: evForm.title.trim(),
        blurb: evForm.desc.trim().slice(0, 500),
        description: evForm.desc.trim(),
        tag: evForm.tag.trim() || 'Open to all',
        start,
        highlights: [],
        photos: [],
      });
      setEvForm({ date: '', tag: '', title: '', desc: '' });
      setEvMsg({ ok: 'Event published — it is now live on the Events page.', err: '' });
      refreshPublic();
    } catch (ex) {
      setEvMsg({ ok: '', err: ex.message || 'Could not add the event.' });
    }
  }

  /* ---------- renders ---------- */

  if (!authChecked) {
    return (
      <div className="wrap pad" id="dashArea">
        <div className="page-title"><div className="sec-head"><div className="kicker">Dashboard</div><span className="frame-tag">FRAME 00/36</span></div>
          <h2 className="sec">Connecting your account…</h2></div>
        <p style={{ color: 'var(--gray)', maxWidth: '46ch' }}>One moment — checking your sign-in.</p>
      </div>
    );
  }

  if (authTab === 'subscribe' && !me) {
    return (
      <div className="wrap pad" id="dashArea">
        <SubscribePanel onPick={setAuthTab} />
      </div>
    );
  }

  // Signed in but awaiting approval.
  if (me && me.status === 'pending') {
    return (
      <div className="wrap pad" id="dashArea">
        <div className="page-title"><div className="sec-head"><div className="kicker">Register</div><span className="frame-tag">FRAME 00/36</span></div>
          <h2 className="sec">Request received.</h2></div>
        <div className="login-box" style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 20, marginBottom: 6 }}>Thanks — you are on the list.</p>
          <p className="note" style={{ margin: '0 0 22px' }}>Your account ({me.email}) is awaiting admin approval. Check again in a moment — your dashboard will open automatically once approved.</p>
          <button className="submit-btn" type="button" onClick={() => refreshMe()}>Check again</button>
          <p className="note" style={{ marginTop: 14 }}><button type="button" className="logout" onClick={onLogout}>Log out</button></p>
        </div>
      </div>
    );
  }

  if (me && me.status === 'rejected') {
    return (
      <div className="wrap pad" id="dashArea">
        <div className="page-title"><div className="sec-head"><div className="kicker">Register</div><span className="frame-tag">FRAME 00/36</span></div>
          <h2 className="sec">Request declined.</h2></div>
        <div className="login-box" style={{ textAlign: 'center' }}>
          <p className="note" style={{ margin: '0 0 22px' }}>Registration was declined. Contact the club.</p>
          <button className="submit-btn" type="button" onClick={onLogout}>Log out</button>
        </div>
      </div>
    );
  }

  // Not signed in: login / register prompts.
  if (!me) {
    if (authTab === 'login') {
      return (
        <div className="wrap pad" id="dashArea">
          <div className="page-title"><div className="sec-head"><div className="kicker">Login</div><span className="frame-tag">FRAME 00/36</span></div>
            <h2 className="sec">Welcome back.</h2></div>
          <AuthTabs active={authTab} onPick={setAuthTab} />
          <div className="login-box">
            <form noValidate onSubmit={onLogin}>
              <div className="field"><label>Email</label><input id="li-email" type="email" autoComplete="email" required value={liEmail} onChange={(e) => setLiEmail(e.target.value)} /></div>
              <div className="field"><label>Password</label><input id="li-pass" type="password" autoComplete="current-password" required value={liPass} onChange={(e) => setLiPass(e.target.value)} /></div>
              <p className="note" role="alert" id="li-err" style={{ display: liErr ? 'block' : 'none', color: '#e0342c' }}>{liErr}</p>
              <button className="submit-btn" id="li-btn" style={{ width: '100%', marginTop: 6 }} disabled={liBusy}>{liBusy ? 'Logging in…' : 'Log in'}</button>
            </form>
            <p className="note">You&apos;re verified — logging in just opens your dashboard for this visit.</p>
            <p className="note" style={{ marginTop: 10 }}><Link to="/reset">Forgot your account password?</Link></p>
            <p className="note" style={{ marginTop: 10 }}>New here? <button type="button" className="logout" data-switch="register" onClick={() => setAuthTab('register')}>Create my Crew Profile</button></p>
          </div>
        </div>
      );
    }
    // Register (default tab): account + Crew Profile in one step.
    const setR = (k) => (e) => setReg((p) => ({ ...p, [k]: e.target.value }));
    return (
      <div className="wrap pad" id="dashArea">
        <div className="page-title"><div className="sec-head"><div className="kicker">Register</div><span className="frame-tag">FRAME 00/36</span></div>
          <h2 className="sec">Set up your Crew Profile.</h2></div>
        <AuthTabs active="register" onPick={setAuthTab} />
        <div className="login-box reg-box">
          <form noValidate onSubmit={onRegister}>
            <div className="field"><label>Account email</label><input id="r-email" type="email" autoComplete="email" required value={reg.email || ''} onChange={setR('email')} placeholder="you@example.com" /></div>
            <div className="field"><label>Password (8+ characters)</label><input id="r-pass" type="password" autoComplete="new-password" minLength={8} required value={reg.password || ''} onChange={(e) => setReg((p) => ({ ...p, password: e.target.value }))} /></div>
            <p className="note" style={{ marginBottom: 22 }}>Fill in your club details once — this becomes your member profile.</p>
            <div className="photo-row">
              <div className="photo-preview" id="regPhotoPreview" style={reg.photo ? { backgroundImage: `url(${reg.photo})` } : undefined}></div>
              <div>
                <label className="upload-btn" htmlFor="regPhotoInput">Add a profile photo</label>
                <input type="file" id="regPhotoInput" accept="image/*" style={{ display: 'none' }} onChange={(e) => onRegPhoto(e.target.files[0])} />
              </div>
            </div>
            <div className="field"><label>Full name</label><input id="r-name" required placeholder="Your name" value={reg.name || ''} onChange={setR('name')} /></div>
            <div className="field"><label>Phone number</label><input id="r-phone" placeholder="Optional" value={reg.phone || ''} onChange={setR('phone')} /></div>
            <div className="dash-grid">
              <div className="field"><label>Department</label><input id="r-dept" placeholder="e.g. Computer Science" value={reg.department || ''} onChange={setR('department')} /></div>
              <div className="field"><label>Year / Batch</label><input id="r-batch" placeholder="e.g. 2027" value={reg.batch || ''} onChange={setR('batch')} /></div>
            </div>
            <div className="field"><label>Student / Member ID</label><input id="r-id" placeholder="Optional" value={reg.memberId || ''} onChange={setR('memberId')} /></div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--gray)', margin: '6px 0 10px' }}>Areas of interest</label>
            <div className="role-pick" id="r-interests">
              {INTEREST_OPTIONS.map((i) => (
                <label key={i} data-v={i} className={(reg.interests || []).includes(i) ? 'active' : ''}>
                  <input
                    type="checkbox"
                    value={i}
                    checked={(reg.interests || []).includes(i)}
                    onChange={() => setReg((p) => {
                      const cur = p.interests || [];
                      return { ...p, interests: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] };
                    })}
                  />{i}
                </label>
              ))}
            </div>
            <div className="field" style={{ marginTop: 16 }}><label>Portfolio / social link (optional)</label><input id="r-link" placeholder="https://…" value={reg.link || ''} onChange={setR('link')} /></div>
            <button className="submit-btn" id="r-submit" style={{ marginTop: 6 }} disabled={regBusy}>{regBusy ? 'Creating…' : 'Create my profile'}</button>
            <p className="note" id="r-err" style={{ display: regErr ? 'block' : 'none', color: '#e0342c' }}>{regErr || 'Please add your name to continue.'}</p>
          </form>
        </div>
      </div>
    );
  }

  // Signed in + approved, but no Crew Profile yet.
  if (!myProfile) {
    const setR = (k) => (e) => setReg((p) => ({ ...p, [k]: e.target.value }));
    return (
      <div className="wrap pad" id="dashArea">
        <div className="page-title"><div className="sec-head"><div className="kicker">Register</div><span className="frame-tag">FRAME 00/36</span></div>
          <h2 className="sec">Set up your Crew Profile.</h2></div>
        <div className="login-box reg-box">
          <p className="note" style={{ marginBottom: 22 }}>You&apos;re signed in as <b>{me.name || me.email || 'a club member'}</b>. Fill in your club details once — this becomes your member profile.</p>
          <div className="photo-row">
            <div className="photo-preview" id="regPhotoPreview" style={reg.photo ? { backgroundImage: `url(${reg.photo})` } : undefined}></div>
            <div>
              <label className="upload-btn" htmlFor="regPhotoInput">Add a profile photo</label>
              <input type="file" id="regPhotoInput" accept="image/*" style={{ display: 'none' }} onChange={(e) => onRegPhoto(e.target.files[0])} />
            </div>
          </div>
          <div className="field"><label>Full name</label><input id="r-name" required placeholder="Your name" value={reg.name || ''} onChange={setR('name')} /></div>
          <div className="field"><label>Phone number</label><input id="r-phone" placeholder="Optional" value={reg.phone || ''} onChange={setR('phone')} /></div>
          <div className="dash-grid">
            <div className="field"><label>Department</label><input id="r-dept" placeholder="e.g. Computer Science" value={reg.department || ''} onChange={setR('department')} /></div>
            <div className="field"><label>Year / Batch</label><input id="r-batch" placeholder="e.g. 2027" value={reg.batch || ''} onChange={setR('batch')} /></div>
          </div>
          <div className="field"><label>Student / Member ID</label><input id="r-id" placeholder="Optional" value={reg.memberId || ''} onChange={setR('memberId')} /></div>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--gray)', margin: '6px 0 10px' }}>Areas of interest</label>
          <div className="role-pick" id="r-interests">
            {INTEREST_OPTIONS.map((i) => (
              <label key={i} data-v={i} className={(reg.interests || []).includes(i) ? 'active' : ''}>
                <input
                  type="checkbox"
                  value={i}
                  checked={(reg.interests || []).includes(i)}
                  onChange={() => setReg((p) => {
                    const cur = p.interests || [];
                    return { ...p, interests: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] };
                  })}
                />{i}
              </label>
            ))}
          </div>
          <div className="field" style={{ marginTop: 16 }}><label>Portfolio / social link (optional)</label><input id="r-link" placeholder="https://…" value={reg.link || ''} onChange={setR('link')} /></div>
          <button
            className="submit-btn"
            id="r-submit"
            style={{ marginTop: 6 }}
            disabled={regBusy}
            onClick={async () => {
              setRegErr('');
              if (!String(reg.name || '').trim()) { setRegErr('Please add your name to continue.'); return; }
              setRegBusy(true);
              try {
                const crew = blankProfile({
                  name: String(reg.name || '').trim(),
                  phone: String(reg.phone || '').trim(),
                  department: String(reg.department || '').trim(),
                  batch: String(reg.batch || '').trim(),
                  memberId: String(reg.memberId || '').trim(),
                  interests: reg.interests || [],
                  photo: reg.photo || '',
                  insta: String(reg.link || '').trim(),
                });
                const savedProfile = await SiteAPI.saveProfile(crew);
                setMyProfile(savedProfile);
                try { localStorage.removeItem(STASH_KEY); } catch (_) {}
                refreshPublic();
              } catch (ex) {
                setRegErr(ex.message || 'Could not save — try again.');
              } finally {
                setRegBusy(false);
              }
            }}
          >{regBusy ? 'Creating…' : 'Create my profile'}</button>
          <p className="note" id="r-err" style={{ display: regErr ? 'block' : 'none', color: '#e0342c' }}>{regErr || 'Please add your name to continue.'}</p>
          <p className="note" style={{ marginTop: 10 }}><button type="button" className="logout" onClick={onLogout}>Log out</button></p>
        </div>
      </div>
    );
  }

  /* ---------- logged-in dashboard ---------- */

  const profile = myProfile;
  const isOC = profile.accountType === 'oc' || profile.role_ === 'oc' || profile.role_ === 'admin';
  const gallery = (profile.gallery || []).map((raw, i) => normGalleryItem(raw, i));
  const galCount = gallery.length;
  const myEvCount = (profile.myEvents || []).length;
  const allEvents = events || [];
  const myEventsList = (profile.myEvents || []).map((id) => allEvents.find((e) => e.id === id)).filter(Boolean);

  const notifs = [];
  if (profile.joinedAt) notifs.push(`Welcome to the club${profile.name ? ', ' + profile.name : ''} — your profile was created.`);
  allEvents.filter((ev) => eventStatus(ev) === 'live').forEach((ev) => notifs.push(`"${ev.t}" is live right now.`));
  allEvents.filter((ev) => eventStatus(ev) === 'upcoming').slice(0, 2).forEach((ev) => notifs.push(`Upcoming: "${ev.t}" on ${fmtDate(ev.start)}.`));
  if (gallery.length) notifs.push(`You have ${gallery.length} photo${gallery.length === 1 ? '' : 's'} in your gallery.`);

  const avatarSrc = pendingPhoto || profile.photo;
  const setE = (k) => (e) => { setEdit((p) => ({ ...p, [k]: e.target.value })); setSaved(false); };

  return (
    <div className="wrap pad" id="dashArea">
      <div className="dash-head">
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div
            className="dash-avatar"
            id="dashAvatar"
            style={avatarSrc ? { backgroundImage: `url(${avatarSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >{avatarSrc ? null : initials(profile.name || 'M')}</div>
          <div><b style={{ fontFamily: 'var(--serif)', fontSize: 20 }} id="dashName">{profile.name}</b><br /><span style={{ color: 'var(--gray)', fontSize: 13 }}>{profile.department || 'Member'}{profile.batch ? ' · ' + profile.batch : ''} · {isOC ? 'Organizing Committee' : 'Member'}</span>
            <div className="dash-quick">
              <button className={'dash-tab' + (dashTab === 'photos' ? ' on' : '')} data-dtab="photos" type="button" onClick={() => pickDashTab('photos')}>Add photos<span className="cnt">{galCount}</span></button>
            </div>
          </div>
        </div>
        <button className="logout" id="logoutBtn" type="button" onClick={onLogout}>Log out</button>
      </div>

      <div className="dash-tabs" role="tablist" aria-label="Dashboard sections">
        <button className={'dash-tab' + (dashTab === 'profile' ? ' on' : '')} data-dtab="profile" type="button" role="tab" onClick={() => pickDashTab('profile')}>Profile</button>
        <button className={'dash-tab' + (dashTab === 'photos' ? ' on' : '')} data-dtab="photos" type="button" role="tab" onClick={() => pickDashTab('photos')}>Photos<span className="cnt">{galCount}</span></button>
        <button className={'dash-tab' + (dashTab === 'events' ? ' on' : '')} data-dtab="events" type="button" role="tab" onClick={() => pickDashTab('events')}>Events<span className="cnt">{myEvCount}</span></button>
        <button className={'dash-tab' + (dashTab === 'activity' ? ' on' : '')} data-dtab="activity" type="button" role="tab" onClick={() => pickDashTab('activity')}>Activity</button>
      </div>

      <div className={'dash-pane' + (dashTab === 'profile' ? ' on' : '')} data-dpane="profile">
        <div className="photo-row">
          <div className="photo-preview" id="photoPreview" style={avatarSrc ? { backgroundImage: `url(${avatarSrc})` } : undefined}></div>
          <div>
            <label className="upload-btn" htmlFor="photoInput">Change profile photo</label>
            <input type="file" id="photoInput" accept="image/*" style={{ display: 'none' }} onChange={(e) => onProfilePhoto(e.target.files[0])} />
            <p style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8 }}>Shown on the Committee page. Saved to your member profile.</p>
          </div>
        </div>

        <div className="dash-grid">
          <div>
            <div className="field"><label>Display name</label><input id="d-name" value={edit.name} onChange={setE('name')} /></div>
            <div className="field"><label>Role / department</label><input id="d-role" value={edit.role} onChange={setE('role')} /></div>
            <div className="field"><label>Instagram handle or link</label><input id="d-insta" placeholder="yourname or full link" value={edit.insta} onChange={setE('insta')} /></div>
            <div className="field"><label>Favorite camera</label><input id="d-camera" placeholder="e.g. Canon AE-1" value={edit.favCamera} onChange={setE('favCamera')} /></div>
            <div className="field"><label>Portfolio page: my photo on the</label><select id="d-side" value={edit.side} onChange={setE('side')}><option value="left">Left (gallery on the right)</option><option value="right">Right (gallery on the left)</option></select></div>
            <div className="field"><label>Bio</label><textarea id="d-bio" value={edit.bio} onChange={setE('bio')}></textarea></div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--gray)', marginBottom: 14 }}>Portfolio links</label>
            <div className="link-row"><input id="d-link0" placeholder="Link to a project" value={edit.links[0] || ''} onChange={(e) => { setSaved(false); setEdit((p) => ({ ...p, links: [e.target.value, p.links[1] || '', p.links[2] || ''] })); }} /></div>
            <div className="link-row"><input id="d-link1" placeholder="Link to a project" value={edit.links[1] || ''} onChange={(e) => { setSaved(false); setEdit((p) => ({ ...p, links: [p.links[0] || '', e.target.value, p.links[2] || ''] })); }} /></div>
            <div className="link-row"><input id="d-link2" placeholder="Link to a project" value={edit.links[2] || ''} onChange={(e) => { setSaved(false); setEdit((p) => ({ ...p, links: [p.links[0] || '', p.links[1] || '', e.target.value] })); }} /></div>
            <button className="submit-btn" id="d-save" style={{ marginTop: 16 }} onClick={onSaveProfile}>Save changes</button>
            <p className="saved-msg" id="d-saved" style={{ display: saved ? 'block' : 'none' }}>Saved.</p>
            {saveErr ? <p className="note" role="alert" style={{ color: '#e0342c' }}>{saveErr}</p> : null}
          </div>
        </div>
      </div>

      <div className={'dash-pane' + (dashTab === 'events' ? ' on' : '')} data-dpane="events">
        <div className="oc-panel" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <h4>My events</h4>
          <div id="dashMyEvents">
            {myEventsList.length ? myEventsList.map((ev) => {
              const st = eventStatus(ev);
              return (
                <Link key={ev.id} className="event-row" to={`/events/${encodeURIComponent(ev.id)}`} style={{ gridTemplateColumns: '110px 1fr auto' }}>
                  <div className="date">{fmtDate(ev.start)}</div>
                  <div><h3 style={{ fontSize: 17 }}>{ev.t}{st === 'live' ? <span className="live-badge-inline"><span className="live-dot"></span>Live</span> : null}</h3></div>
                  <div className="tag" style={{ textTransform: 'capitalize' }}>{st}</div>
                </Link>
              );
            }) : <p className="mg-empty" style={{ margin: '12px 0' }}>No events yet — register your interest from any event&apos;s page.</p>}
          </div>
        </div>

        {isOC ? (
          <div className="oc-panel">
            <h4>Add an event</h4>
            <div className="mini-add">
              <div className="field"><label>Date</label><input id="ev-date" placeholder="OCT 04" value={evForm.date} onChange={(e) => setEvForm((p) => ({ ...p, date: e.target.value }))} /></div>
              <div className="field"><label>Tag</label><input id="ev-tag" placeholder="Open to all" value={evForm.tag} onChange={(e) => setEvForm((p) => ({ ...p, tag: e.target.value }))} /></div>
              <div className="field full"><label>Title</label><input id="ev-title" placeholder="Street Photography Walk" value={evForm.title} onChange={(e) => setEvForm((p) => ({ ...p, title: e.target.value }))} /></div>
              <div className="field full"><label>Description</label><textarea id="ev-desc" placeholder="Details for members..." value={evForm.desc} onChange={(e) => setEvForm((p) => ({ ...p, desc: e.target.value }))}></textarea></div>
            </div>
            <button className="submit-btn" id="ev-add" onClick={onAddEvent}>Add event</button>
            <p className="local-note" style={{ marginTop: 20 }}>OC changes are saved to your browser for this preview. Connect a backend to make them live site-wide for every visitor.</p>
            {evMsg.err ? <p className="note" role="alert" style={{ marginTop: 12, color: '#e0342c' }}>{evMsg.err}</p> : null}
            {evMsg.ok ? <p className="note" style={{ marginTop: 12 }}>{evMsg.ok}</p> : null}
          </div>
        ) : null}
      </div>

      <div className={'dash-pane' + (dashTab === 'photos' ? ' on' : '')} data-dpane="photos">
        <div className="oc-panel" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <h4>My photo &amp; video gallery</h4>
          <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 4 }}>Uploaded photos and clips appear on the public Gallery page, Pinterest-style. Add shot details below each one — camera, aperture, shutter speed, ISO, what you edited it in — and it&apos;ll show up on hover and in the full view.</p>
          <label className="upload-btn" htmlFor="galInput" style={{ marginTop: 14, display: 'inline-block' }}>Add photos or video</label>
          <input type="file" id="galInput" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={(e) => { onGalFiles(e.target.files); e.target.value = ''; }} />
          {galErr ? <p className="note" role="alert" style={{ color: '#e0342c' }}>{galErr}</p> : null}
          <div className="gal-manage" id="galManage">
            {gallery.length ? gallery.map((it, i) => (
              <div className="gal-card" data-i={i} key={it.id || i}>
                <div className="gthumb">
                  {it.type === 'video' ? <video src={it.src} muted></video> : <img src={it.src} alt="" />}
                  <button className="gremove" data-i={i} type="button" onClick={() => onGalRemove(i)}>✕</button>
                </div>
                <div className="gfields">
                  <span className="gtype-badge full" style={{ gridColumn: '1/-1' }}>{it.type === 'video' ? '▸ Video' : 'ƒ Photo'}</span>
                  {it.type === 'photo' ? (
                    <>
                      <div className="gf"><label>Camera</label><input data-f="camera" data-i={i} value={it.camera || ''} placeholder="Canon AE-1" onChange={(e) => onGalField(i, 'camera', e.target.value)} /></div>
                      <div className="gf"><label>Lens</label><input data-f="lens" data-i={i} value={it.lens || ''} placeholder="50mm f/1.8" onChange={(e) => onGalField(i, 'lens', e.target.value)} /></div>
                      <div className="gf"><label>Focal length</label><input data-f="focal" data-i={i} value={it.focal || ''} placeholder="35mm" onChange={(e) => onGalField(i, 'focal', e.target.value)} /></div>
                      <div className="gf"><label>Aperture</label><input data-f="aperture" data-i={i} value={it.aperture || ''} placeholder="f/2.8" onChange={(e) => onGalField(i, 'aperture', e.target.value)} /></div>
                      <div className="gf"><label>Shutter speed</label><input data-f="shutter" data-i={i} value={it.shutter || ''} placeholder="1/250" onChange={(e) => onGalField(i, 'shutter', e.target.value)} /></div>
                      <div className="gf"><label>ISO</label><input data-f="iso" data-i={i} value={it.iso || ''} placeholder="400" onChange={(e) => onGalField(i, 'iso', e.target.value)} /></div>
                    </>
                  ) : (
                    <>
                      <div className="gf"><label>Camera / gear</label><input data-f="camera" data-i={i} value={it.camera || ''} placeholder="Blackmagic Pocket 6K" onChange={(e) => onGalField(i, 'camera', e.target.value)} /></div>
                      <div className="gf"><label>Lens</label><input data-f="lens" data-i={i} value={it.lens || ''} placeholder="24-70mm" onChange={(e) => onGalField(i, 'lens', e.target.value)} /></div>
                    </>
                  )}
                  <div className="gf"><label>Edited in</label><input data-f="editedIn" data-i={i} value={it.editedIn || ''} placeholder="Lightroom / DaVinci Resolve" onChange={(e) => onGalField(i, 'editedIn', e.target.value)} /></div>
                  <div className="gf"><label>Location</label><input data-f="location" data-i={i} value={it.location || ''} placeholder="Campus quad" onChange={(e) => onGalField(i, 'location', e.target.value)} /></div>
                  <div className="gf"><label>Date</label><input data-f="date" data-i={i} value={it.date || ''} placeholder="OCT 2026" onChange={(e) => onGalField(i, 'date', e.target.value)} /></div>
                  <div className="gf full"><label>Caption / story</label><textarea data-f="caption" data-i={i} placeholder="What's happening in this shot?" value={it.caption || ''} onChange={(e) => onGalField(i, 'caption', e.target.value)}></textarea></div>
                  <label className="gf-download"><input type="checkbox" data-f="allowDownload" data-i={i} checked={!!it.allowDownload} onChange={(e) => onGalField(i, 'allowDownload', e.target.checked)} /> Allow visitors to download this file</label>
                </div>
              </div>
            )) : <p className="mg-empty">No photos or video yet — add your first from the button above.</p>}
          </div>
        </div>
      </div>

      <div className={'dash-pane' + (dashTab === 'activity' ? ' on' : '')} data-dpane="activity">
        <div className="oc-panel" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <h4>My contributions</h4>
          <div id="dashContrib">
            {gallery.length ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 12 }}>{gallery.length} item{gallery.length === 1 ? '' : 's'} contributed to the collective gallery.</p>
                <div className="masonry">{gallery.slice(0, 6).map((it, i) => <div className="g-tile" key={it.id || i} style={{ animationDelay: `${(i % 8) * 0.04}s` }}><img src={it.src} style={{ width: '100%', display: 'block', borderRadius: 8 }} alt="" /></div>)}</div>
              </>
            ) : <p className="mg-empty" style={{ margin: '12px 0' }}>Nothing uploaded yet — add photos below and they&apos;ll show here.</p>}
          </div>
        </div>

        <div className="oc-panel">
          <h4>Notifications</h4>
          <div id="dashNotif">
            {notifs.length ? <ul className="ev-highlights" style={{ maxWidth: 'none' }}>{notifs.map((n) => <li key={n}>{n}</li>)}</ul> : <p className="mg-empty" style={{ margin: '12px 0' }}>Nothing new.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
