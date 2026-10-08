import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, AuthAPI, AdminAPI, SiteAPI } from '../api';
import './Admin.css';

const PAGE_LABELS = {
  about: 'About',
  gallery: 'Gallery',
  team: 'Committee',
  portfolio: 'Portfolio',
  events: 'Events',
  history: 'History',
  connect: 'Connect',
};

const EMPTY_EVENT = { title: '', tag: '', start: '', end: '', blurb: '', desc: '', hl: '' };
const EMPTY_MEMBER = { email: '', pass: '', name: '', role: 'member' };

function toLocal(v) {
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch (_) {
    return '';
  }
}

function Badge({ s }) {
  return <span className={`badge b-${s || 'active'}`}>{s || 'active'}</span>;
}

export default function Admin() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [tab, setTabState] = useState(() => localStorage.getItem('mc_admin_tab') || 'requests');

  const [pendingUsers, setPendingUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [allGallery, setAllGallery] = useState([]);
  const [events, setEvents] = useState([]);
  const [posts, setPosts] = useState([]);
  const [applications, setApplications] = useState([]);
  const [messages, setMessages] = useState([]);

  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [userDraft, setUserDraft] = useState({ name: '', dept: '', insta: '', cam: '', bio: '' });

  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState(EMPTY_EVENT);
  const [evPhotos, setEvPhotos] = useState([]);

  const [editingPost, setEditingPost] = useState(null);
  const [postForm, setPostForm] = useState({ title: '', body: '' });

  const [member, setMember] = useState(EMPTY_MEMBER);
  const [pagesVis, setPagesVis] = useState(null);
  const [pagesErr, setPagesErr] = useState('');

  const setTab = (t) => {
    setTabState(t);
    localStorage.setItem('mc_admin_tab', t);
  };

  const load = useCallback(async () => {
    const o = await AdminAPI.overview();
    setPendingUsers(o.pendingUsers || []);
    setPending(o.pending || []);
    setUsers(o.users || []);
    setAllGallery(o.allGallery || []);
    setEvents(o.events || []);
    setPosts(o.posts || []);
    setApplications(o.applications || []);
    setMessages(o.messages || []);
  }, []);

  const loadPages = useCallback(async () => {
    setPagesErr('');
    try {
      const s = await SiteAPI.site();
      setPagesVis(s.pages || {});
    } catch (e) {
      setPagesVis(null);
      setPagesErr('Could not load page settings.');
    }
  }, []);

  const boot = useCallback(async () => {
    setChecking(true);
    try {
      const { user: u } = await AuthAPI.me();
      if (u && u.role === 'admin') {
        setUser(u);
        await load();
      } else {
        setUser(null);
      }
    } catch (_) {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, [load]);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (user && tab === 'pages') loadPages();
  }, [user, tab, loadPages]);

  async function mutate(fn) {
    try {
      await fn();
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    setErr('');
    try {
      await AuthAPI.login(email, passwordFallback());
      setPw('');
      await boot();
    } catch (ex) {
      setErr(ex.message);
    }
    function passwordFallback() {
      return pw;
    }
  }

  async function onLogout() {
    await AuthAPI.logout();
    setUser(null);
    setTab('requests');
  }

  // ---- users ----
  function openEditUser(u) {
    if (editingUser === u.id) {
      setEditingUser(null);
      return;
    }
    const p = u.profile || {};
    setEditingUser(u.id);
    setUserDraft({
      name: p.name || u.name || '',
      dept: p.department || p.role || '',
      insta: p.insta || '',
      cam: p.favCamera || '',
      bio: p.bio || '',
    });
  }

  async function saveUser(id) {
    try {
      await AdminAPI.updateUserProfile(id, {
        name: userDraft.name,
        department: userDraft.dept,
        insta: userDraft.insta,
        favCamera: userDraft.cam,
        bio: userDraft.bio,
      });
      setEditingUser(null);
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function addMember(e) {
    e.preventDefault();
    if (!member.email || member.pass.length < 8) {
      alert('Email and 8+ char password required');
      return;
    }
    try {
      await AdminAPI.createUser({
        email: member.email,
        password: member.pass,
        role: member.role,
        name: member.name || undefined,
      });
      setMember(EMPTY_MEMBER);
      await load();
    } catch (ex) {
      alert(ex.message);
    }
  }

  const filteredUsers = users.filter((u) =>
    (u.email + ' ' + (u.name || '')).toLowerCase().includes(search.toLowerCase())
  );

  // ---- events ----
  function editEvent(ev) {
    setEditingEvent(ev.id);
    setTab('events');
    setEventForm({
      title: ev.t || '',
      tag: ev.tag || '',
      start: toLocal(ev.start),
      end: toLocal(ev.end || ev.start),
      blurb: ev.p || '',
      desc: ev.desc || '',
      hl: (ev.highlights || []).join('\n'),
    });
    setEvPhotos([...(ev.photos || [])]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEvent() {
    setEditingEvent(null);
    setEvPhotos([]);
    setEventForm(EMPTY_EVENT);
  }

  function onPickPhotos(e) {
    const files = [...e.target.files].slice(0, 12 - evPhotos.length);
    files.forEach((f) => {
      const r = new FileReader();
      r.onload = () => {
        setEvPhotos((prev) => [...prev, r.result]);
      };
      r.readAsDataURL(f);
    });
    e.target.value = '';
  }

  async function submitEvent(e) {
    e.preventDefault();
    if (!eventForm.title || !eventForm.start) {
      alert('Title and start required');
      return;
    }
    const body = {
      title: eventForm.title,
      tag: eventForm.tag || 'Open to all',
      blurb: eventForm.blurb,
      description: eventForm.desc,
      start: eventForm.start,
      end: eventForm.end || undefined,
      highlights: eventForm.hl.split('\n').map((x) => x.trim()).filter(Boolean),
      photos: evPhotos,
    };
    try {
      if (editingEvent) {
        await AdminAPI.updateEvent(editingEvent, body);
        cancelEvent();
      } else {
        await AdminAPI.createEvent(body);
      }
      await load();
    } catch (ex) {
      alert(ex.message);
    }
  }

  // ---- posts ----
  function editPost(p) {
    setEditingPost(p.id);
    setTab('journal');
    setPostForm({ title: p.t || '', body: p.body || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelPost() {
    setEditingPost(null);
    setPostForm({ title: '', body: '' });
  }

  async function submitPost(e) {
    e.preventDefault();
    if (!postForm.title || !postForm.body) {
      alert('Title and body required');
      return;
    }
    try {
      if (editingPost) {
        await AdminAPI.updatePost(editingPost, { title: postForm.title, body: postForm.body });
        cancelPost();
      } else {
        await AdminAPI.createPost({ title: postForm.title, body: postForm.body });
      }
      await load();
    } catch (ex) {
      alert(ex.message);
    }
  }

  // ---- pages ----
  async function togglePage(key) {
    const next = {};
    Object.keys(PAGE_LABELS).forEach((k) => {
      next[k] = pagesVis ? pagesVis[k] !== false : true;
    });
    next[key] = !(pagesVis ? pagesVis[key] !== false : true);
    try {
      await AdminAPI.saveSite(next);
      await loadPages();
    } catch (e) {
      alert(e.message);
    }
  }

  const tabs = [
    ['requests', 'Requests', pendingUsers.length + pending.length],
    ['members', 'Members', users.length],
    ['events', 'Events', events.length],
    ['gallery', 'Gallery', allGallery.length],
    ['journal', 'Journal', posts.length],
    ['inbox', 'Inbox', applications.length + messages.filter((m) => !m.handled).length],
    ['pages', 'Pages', ''],
  ];

  if (checking) {
    return (
      <div className="mc-admin">
        <main>
          <p className="mut">Loading…</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mc-admin">
        <main>
          <div id="login">
            <h1>Admin</h1>
            <p className="mut">Sign in with an admin account.</p>
            <div className="card">
              <form onSubmit={onLogin}>
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <br />
                <br />
                <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
                <br />
                <br />
                <button className="pri" type="submit">
                  Log in
                </button>
              </form>
              <p>
                <a href="/#reset">Forgot password?</a>
              </p>
              <p id="err">{err}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const setEF = (k) => (e) => setEventForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="mc-admin">
      <main>
        <div className="row">
          <div className="grow">
            <h1>MEDIA CLUB admin</h1>
            <span className="mut">{user.email}</span>
          </div>
          <a href="/">View site</a>
          <button id="out" onClick={onLogout}>
            Log out
          </button>
        </div>

        <div className="tabs" role="tablist">
          {tabs.map(([k, label, c]) => (
            <button key={k} className={'tab' + (tab === k ? ' on' : '')} data-tab={k} onClick={() => setTab(k)}>
              {label}
              <span className="cnt">{c}</span>
            </button>
          ))}
        </div>

        <div className={'pane' + (tab === 'requests' ? ' on' : '')} data-pane="requests">
          <h2>
            Membership requests <span className="mut">({pendingUsers.length})</span>
          </h2>
          <div>
            {pendingUsers.map((u) => (
              <div key={u.id} className="card row">
                <div className="grow">
                  <b>{u.email}</b> <Badge s={u.status} />
                  <div className="mut">
                    {u.created_at} · {u.name || 'no profile yet'} · gallery: {u.galleryCount || 0}
                  </div>
                </div>
                <button className="ok" onClick={() => mutate(() => AdminAPI.approveUser(u.id))}>
                  Approve
                </button>
                <button onClick={() => mutate(() => AdminAPI.rejectUser(u.id))}>Reject</button>
                <button
                  className="bad"
                  onClick={() => {
                    if (confirm('Delete this request?')) mutate(() => AdminAPI.deleteUser(u.id));
                  }}
                >
                  Delete
                </button>
              </div>
            )) || null}
            {pendingUsers.length === 0 && <p className="mut">No pending requests.</p>}
          </div>
          <h2>
            Gallery awaiting approval <span className="mut">({pending.length})</span>
          </h2>
          <div>
            {pending.map((g) => (
              <div key={g.id} className="card row">
                {g.type === 'video' ? (
                  <video className="thumb" src={g.src} controls />
                ) : (
                  <img className="thumb" src={g.src} alt="" />
                )}
                <div className="grow">
                  <b>{g.by || g.email}</b>
                  <div className="mut">
                    {g.email} · {g.category} · {g.uploadedAt}
                  </div>
                  <div>{g.caption || ''}</div>
                </div>
                <button className="pri" onClick={() => mutate(() => AdminAPI.galleryAction(g.id, 'approve'))}>
                  Approve
                </button>
                <button className="bad" onClick={() => mutate(() => AdminAPI.galleryAction(g.id, 'reject'))}>
                  Reject
                </button>
                <button
                  className="bad"
                  onClick={() => {
                    if (confirm('Delete upload?')) mutate(() => AdminAPI.deleteGallery(g.id));
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
            {pending.length === 0 && <p className="mut">Nothing waiting.</p>}
          </div>
        </div>

        <div className={'pane' + (tab === 'members' ? ' on' : '')} data-pane="members">
          <h2>
            Members{' '}
            <span className="mut">
              ({users.length}
              {search ? ` · showing ${filteredUsers.length}` : ''})
            </span>
          </h2>
          <div className="card">
            <b>Add a member</b>
            <p className="mut">Created active immediately — no approval needed. They can log in right away.</p>
            <form onSubmit={addMember}>
              <div className="grid2">
                <input
                  type="email"
                  placeholder="Email"
                  value={member.email}
                  onChange={(e) => setMember((p) => ({ ...p, email: e.target.value }))}
                />
                <input
                  placeholder="Password (8+ chars)"
                  value={member.pass}
                  onChange={(e) => setMember((p) => ({ ...p, pass: e.target.value }))}
                />
              </div>
              <br />
              <div className="grid2">
                <input
                  placeholder="Display name (optional)"
                  value={member.name}
                  onChange={(e) => setMember((p) => ({ ...p, name: e.target.value }))}
                />
                <select value={member.role} onChange={(e) => setMember((p) => ({ ...p, role: e.target.value }))}>
                  <option value="member">member</option>
                  <option value="oc">oc</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <br />
              <button className="pri" type="submit">
                Add member
              </button>
            </form>
          </div>
          <input
            className="search"
            placeholder="Search members by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div>
            {filteredUsers.map((u) => {
              const p = u.profile || {};
              const ed = editingUser === u.id;
              return (
                <div key={u.id} className="card">
                  <div className="row">
                    <div className="grow">
                      <b>{u.name || u.email}</b> <Badge s={u.status} /> <span className="mut">{u.role}</span>
                      <div className="mut">
                        {u.email} · {u.created_at} · gallery: {u.galleryCount || 0}
                      </div>
                      {p && p.department ? (
                        <div className="mut">
                          {p.department}
                          {p.batch ? ' · ' + p.batch : ''}
                        </div>
                      ) : null}
                    </div>
                    {u.status === 'pending' ? (
                      <>
                        <button className="ok" onClick={() => mutate(() => AdminAPI.approveUser(u.id))}>
                          Approve
                        </button>
                        <button onClick={() => mutate(() => AdminAPI.rejectUser(u.id))}>Reject</button>
                      </>
                    ) : null}
                    {u.status === 'rejected' ? (
                      <button className="ok" onClick={() => mutate(() => AdminAPI.approveUser(u.id))}>
                        Re-approve
                      </button>
                    ) : null}
                    <button onClick={() => openEditUser(u)}>{ed ? 'Close' : 'Edit'}</button>
                    <select value={u.role} onChange={(e) => mutate(() => AdminAPI.setRole(u.id, e.target.value))}>
                      {['member', 'oc', 'admin'].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <select
                      value={u.status || 'active'}
                      onChange={(e) => mutate(() => AdminAPI.setStatus(u.id, e.target.value))}
                    >
                      {['pending', 'active', 'rejected'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      className="bad"
                      onClick={() => {
                        if (confirm('Delete this user and their uploads?'))
                          mutate(() => AdminAPI.deleteUser(u.id));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  {ed ? (
                    <div className="editbox">
                      <div className="grid2">
                        <input
                          placeholder="Display name"
                          value={userDraft.name}
                          onChange={(e) => setUserDraft((d) => ({ ...d, name: e.target.value }))}
                        />
                        <input
                          placeholder="Department / role text"
                          value={userDraft.dept}
                          onChange={(e) => setUserDraft((d) => ({ ...d, dept: e.target.value }))}
                        />
                        <input
                          placeholder="Instagram"
                          value={userDraft.insta}
                          onChange={(e) => setUserDraft((d) => ({ ...d, insta: e.target.value }))}
                        />
                        <input
                          placeholder="Favorite camera"
                          value={userDraft.cam}
                          onChange={(e) => setUserDraft((d) => ({ ...d, cam: e.target.value }))}
                        />
                      </div>
                      <textarea
                        rows="2"
                        placeholder="Bio"
                        value={userDraft.bio}
                        onChange={(e) => setUserDraft((d) => ({ ...d, bio: e.target.value }))}
                      />
                      <br />
                      <br />
                      <button className="pri" onClick={() => saveUser(u.id)}>
                        Save member
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {filteredUsers.length === 0 && <p className="mut">No members yet — add one above.</p>}
          </div>
        </div>

        <div className={'pane' + (tab === 'events' ? ' on' : '')} data-pane="events">
          <h2>{editingEvent ? 'Edit event' : 'Add event'}</h2>
          <div className="card">
            <form onSubmit={submitEvent}>
              <div className="grid2">
                <input placeholder="Title" value={eventForm.title} onChange={setEF('title')} />
                <input placeholder="Tag (Open to all)" value={eventForm.tag} onChange={setEF('tag')} />
                <div>
                  <span className="mut">Starts</span>
                  <input type="datetime-local" value={eventForm.start} onChange={setEF('start')} />
                </div>
                <div>
                  <span className="mut">Ends (optional)</span>
                  <input type="datetime-local" value={eventForm.end} onChange={setEF('end')} />
                </div>
              </div>
              <br />
              <input placeholder="One-line summary" value={eventForm.blurb} onChange={setEF('blurb')} />
              <br />
              <br />
              <textarea rows="3" placeholder="Description" value={eventForm.desc} onChange={setEF('desc')} />
              <br />
              <br />
              <textarea
                rows="2"
                placeholder="Highlights, one per line"
                value={eventForm.hl}
                onChange={setEF('hl')}
              />
              <br />
              <br />
              <label className="upload-btn" htmlFor="e-photos">
                Add event photos
              </label>
              <input
                type="file"
                id="e-photos"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={onPickPhotos}
              />
              <div className="row">
                {evPhotos.map((s, i) => (
                  <div key={i} className="ev-thumb-wrap">
                    <img className="thumb" src={s} alt="" />
                    <button
                      type="button"
                      className="bad ev-thumb-x"
                      onClick={() => setEvPhotos((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {evPhotos.length === 0 && <span className="mut">No photos yet.</span>}
              </div>
              <br />
              <button className="pri" type="submit">
                {editingEvent ? 'Save event' : 'Publish event'}
              </button>{' '}
              {editingEvent ? (
                <button type="button" onClick={cancelEvent}>
                  Cancel edit
                </button>
              ) : null}
            </form>
          </div>
          <h2>
            Events <span className="mut">({events.length})</span>
          </h2>
          <div>
            {events.map((e) => (
              <div key={e.id} className="card row">
                <div className="grow">
                  <b>{e.t}</b>
                  <div className="mut">
                    {e.start} · {e.tag}
                  </div>
                  <div className="mut">{e.p || ''}</div>
                </div>
                <button onClick={() => editEvent(e)}>Edit</button>
                <button
                  className="bad"
                  onClick={() => {
                    if (confirm('Delete?')) mutate(() => AdminAPI.deleteEvent(e.id));
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
            {events.length === 0 && <p className="mut">None.</p>}
          </div>
        </div>

        <div className={'pane' + (tab === 'gallery' ? ' on' : '')} data-pane="gallery">
          <h2>
            All gallery <span className="mut">({allGallery.length})</span>
          </h2>
          <div>
            {allGallery.map((g) => (
              <div key={g.id} className="card row">
                {g.type === 'video' ? (
                  <video className="thumb" src={g.src} controls />
                ) : (
                  <img className="thumb" src={g.src} alt="" />
                )}
                <div className="grow">
                  <b>{g.email}</b> <Badge s={g.status} />
                    <div className="mut">
                      {g.category} · {g.uploadedAt} {g.featured ? '· ★ featured' : ''}
                    </div>
                  <div>{g.caption || ''}</div>
                </div>
                {g.status === 'pending' ? (
                  <button className="pri" onClick={() => mutate(() => AdminAPI.galleryAction(g.id, 'approve'))}>
                    Approve
                  </button>
                ) : null}
                <button onClick={() => mutate(() => AdminAPI.feature(g.id))}>★ Feature</button>
                <button
                  className="bad"
                  onClick={() => {
                    if (confirm('Delete upload?')) mutate(() => AdminAPI.deleteGallery(g.id));
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
            {allGallery.length === 0 && <p className="mut">None.</p>}
          </div>
        </div>

        <div className={'pane' + (tab === 'journal' ? ' on' : '')} data-pane="journal">
          <h2>{editingPost ? 'Edit post' : 'Write journal post'}</h2>
          <div className="card">
            <form onSubmit={submitPost}>
              <input placeholder="Title" value={postForm.title} onChange={(e) => setPostForm((p) => ({ ...p, title: e.target.value }))} />
              <br />
              <br />
              <textarea
                rows="5"
                placeholder="Body"
                value={postForm.body}
                onChange={(e) => setPostForm((p) => ({ ...p, body: e.target.value }))}
              />
              <br />
              <br />
              <button className="pri" type="submit">
                {editingPost ? 'Save post' : 'Publish post'}
              </button>{' '}
              {editingPost ? (
                <button type="button" onClick={cancelPost}>
                  Cancel edit
                </button>
              ) : null}
            </form>
          </div>
          <h2>
            Posts <span className="mut">({posts.length})</span>
          </h2>
          <div>
            {posts.map((p) => (
              <div key={p.id} className="card row">
                <div className="grow">
                  <b>{p.t}</b>
                  <div className="mut">
                    {p.a} · {p.d}
                  </div>
                </div>
                <button onClick={() => editPost(p)}>Edit</button>
                <button
                  className="bad"
                  onClick={() => {
                    if (confirm('Delete?')) mutate(() => AdminAPI.deletePost(p.id));
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
            {posts.length === 0 && <p className="mut">None.</p>}
          </div>
        </div>

        <div className={'pane' + (tab === 'inbox' ? ' on' : '')} data-pane="inbox">
          <h2>
            Join applications <span className="mut">({applications.length})</span>
          </h2>
          <div>
            {applications.map((a) => (
              <div key={a.id} className="card">
                <div className="row">
                  <div className="grow">
                    <b>{a.name}</b> · {a.email}{' '}
                    <span className="mut">
                      {a.interest} · {a.status}
                    </span>
                  </div>
                  <button
                    onClick={() => mutate(() => api('POST', `/admin/applications/${a.id}/status`, { status: 'accepted' }))}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => mutate(() => api('POST', `/admin/applications/${a.id}/status`, { status: 'declined' }))}
                  >
                    Decline
                  </button>
                </div>
                <div className="mut">{a.link}</div>
                <div>{a.message}</div>
              </div>
            ))}
            {applications.length === 0 && <p className="mut">None.</p>}
          </div>
          <h2>
            Contact messages{' '}
            <span className="mut">({messages.filter((m) => !m.handled).length} new)</span>
          </h2>
          <div>
            {messages.map((m) => (
              <div key={m.id} className="card">
                <div className="row">
                  <div className="grow">
                    <b>{m.name}</b> · <a href={`mailto:${m.email}`}>{m.email}</a>{' '}
                    <span className="mut">{m.handled ? 'handled' : 'new'}</span>
                  </div>
                  {m.handled ? null : (
                    <button onClick={() => mutate(() => api('POST', `/admin/messages/${m.id}/handled`))}>
                      Mark handled
                    </button>
                  )}
                </div>
                <div>{m.message}</div>
              </div>
            ))}
            {messages.length === 0 && <p className="mut">None.</p>}
          </div>
        </div>

        <div className={'pane' + (tab === 'pages' ? ' on' : '')} data-pane="pages">
          <h2>Site pages</h2>
          <p className="mut">
            Hide a page and it disappears from the menu everywhere; direct links bounce back home. Home and
            the login page always stay on so nobody gets locked out.
          </p>
          <div>
            {pagesErr ? (
              <p className="mut">{pagesErr}</p>
            ) : pagesVis === null ? (
              <p className="mut">Loading…</p>
            ) : (
              Object.entries(PAGE_LABELS).map(([k, label]) => {
                const visible = pagesVis[k] !== false;
                return (
                  <div key={k} className="card row">
                    <div className="grow">
                      <b>{label}</b> <span className="mut">#{k}</span>
                    </div>
                    <button className={visible ? 'pri' : ''} onClick={() => togglePage(k)}>
                      {visible ? 'Visible — hide' : 'Hidden — show'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="row">
            <button onClick={() => navigate('/')}>Back to site</button>
          </div>
        </div>
      </main>
    </div>
  );
}
