import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSite } from '../store';
import { AuthAPI, FollowAPI, SiteAPI } from '../api';
import { LOGO_SRC } from '../logo';

const LINKS = [
  ['/about', 'About'],
  ['/gallery', 'Gallery'],
  ['/team', 'Committee'],
  ['/portfolio', 'Portfolio'],
  ['/events', 'Events'],
  ['/history', 'History'],
  ['/connect', 'Connect'],
];

const LS_FOLLOWS = 'raw_sx_myfollows';

export function applyTheme(t, save) {
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'dark' ? '#0f0f10' : '#ffffff';
  if (save) { try { localStorage.setItem('raw_theme', t); } catch (_) {} }
  if (window.__bgTheme) window.__bgTheme(t === 'dark');
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'JUST NOW';
  if (s < 3600) return Math.floor(s / 60) + ' MIN AGO';
  if (s < 86400) return Math.floor(s / 3600) + ' HOUR' + (Math.floor(s / 3600) === 1 ? '' : 'S') + ' AGO';
  if (s < 172800) return 'YESTERDAY';
  return d.toLocaleDateString();
}

const isProfileKey = (k) => typeof k === 'string' && k.indexOf('profile:') === 0;
const midOf = (k) => (isProfileKey(k) ? k.slice(8) : null);

function readLocalFollows() {
  try { return JSON.parse(localStorage.getItem(LS_FOLLOWS) || '{}'); }
  catch (_) { return {}; }
}

// Notifications bell + dropdown, ported from the original site
// (#ntBell + #ntBadge + #ntDrop, follow-based alerts with localStorage fallback).
function Notifications() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(0);
  const [items, setItems] = useState([]);
  const [toast, setToast] = useState('');
  const knownRef = useRef(new Set());
  const seededRef = useRef(false);
  const toastTimer = useRef(0);

  const showToast = useCallback((t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const fetchRemote = useCallback(async () => {
    let me = null;
    try { me = (await AuthAPI.me()).user; } catch (_) { return { items: [], unread: 0 }; }
    if (!me) return { items: [], unread: 0 };
    try {
      const d = await FollowAPI.notifications();
      return { items: d.notifications || [], unread: d.unread || 0 };
    } catch (_) { return { items: [], unread: 0 }; }
  }, []);

  const fetchLocal = useCallback(async () => {
    const lf = readLocalFollows();
    const keys = Object.keys(lf).filter(isProfileKey);
    if (!keys.length) return [];
    let act = null;
    try { act = (await SiteAPI.activity()).activity; } catch (_) { return []; }
    const out = [];
    keys.forEach((k) => {
      const mid = midOf(k);
      const seen = lf[k].seen || '';
      (act.photos || [])
        .filter((p) => p.user_id === mid && p.uploaded_at > seen)
        .slice(0, 5)
        .forEach((p) => {
          out.push({
            id: 'l' + p.id,
            text: (p.name || lf[k].name) + ' added new photos',
            link: '/member/' + encodeURIComponent(mid),
            created_at: p.uploaded_at,
            read: false,
            local: true,
          });
        });
    });
    return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10);
  }, []);

  const tick = useCallback(async (quiet) => {
    try {
      const [rem, loc] = await Promise.all([fetchRemote(), fetchLocal()]);
      setBadge((rem.unread || 0) + loc.length);
      const fresh = [...rem.items.filter((n) => !n.read), ...loc]
        .filter((n) => !knownRef.current.has(n.id));
      fresh.forEach((n) => knownRef.current.add(n.id));
      if (seededRef.current && fresh.length && !quiet) showToast(fresh[0].text);
      seededRef.current = true;
    } catch (_) {}
  }, [fetchRemote, fetchLocal, showToast]);

  useEffect(() => {
    tick(true);
    const iv = setInterval(() => tick(false), 60000);
    const onVis = () => { if (!document.hidden) tick(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [tick]);

  const openDrop = useCallback(async () => {
    setOpen(true);
    const [rem, loc] = await Promise.all([fetchRemote(), fetchLocal()]);
    setItems([...rem.items.map((n) => ({ ...n, local: false })), ...loc].slice(0, 25));
  }, [fetchRemote, fetchLocal]);

  const closeDrop = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (!e.target.closest('.nt-wrap')) closeDrop(); };
    const onKey = (e) => { if (e.key === 'Escape') closeDrop(); };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closeDrop]);

  const markAllRead = async () => {
    try { await FollowAPI.markRead(); } catch (_) {}
    try {
      const lf = readLocalFollows();
      Object.keys(lf).forEach((k) => { lf[k].seen = new Date().toISOString(); });
      localStorage.setItem(LS_FOLLOWS, JSON.stringify(lf));
    } catch (_) {}
    closeDrop();
    tick(true);
  };

  const goItem = (link) => {
    closeDrop();
    if (!link) return;
    if (link.startsWith('/')) navigate(link);
    else window.location.href = link;
  };

  return (
    <div className="nt-wrap">
      <button
        id="ntBell"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); open ? closeDrop() : openDrop(); }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        <span className="nt-badge" id="ntBadge" hidden={!badge}>{badge > 99 ? '99+' : badge || ''}</span>
      </button>
      <div className="nt-drop" id="ntDrop" hidden={!open}>
        <h4>Notifications</h4>
        {items.length ? items.map((n) => (
          <button
            key={n.id}
            type="button"
            className={'nt-item' + (n.read ? '' : ' unread')}
            onClick={() => goItem(n.link)}
          >
            <span>{n.text}</span>
            <small>{timeAgo(n.created_at)}</small>
          </button>
        )) : (
          <p className="nt-empty">Nothing yet. Follow a member to get notified of new uploads.</p>
        )}
        {badge ? <button type="button" className="nt-read" onClick={markAllRead}>Mark all read</button> : null}
      </div>
      {toast ? <div className="nt-toast on" role="status">{toast}</div> : null}
    </div>
  );
}

export default function Header() {
  const { me, hiddenPages } = useSite();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const loc = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  // Original toggles .active on data-nav match and scrolls the active link into view.
  useEffect(() => {
    const act = document.querySelector('.navlinks a.active');
    if (act && act.scrollIntoView) act.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [loc.pathname]);
  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e) => {
      try {
        if (!localStorage.getItem('raw_theme')) {
          const t = e.matches ? 'dark' : 'light';
          applyTheme(t, false);
          setTheme(t);
        }
      } catch (_) {}
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // Keep aria-label/pressed in sync when the theme changes from anywhere.
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(document.documentElement.dataset.theme || 'light'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const toggleTheme = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    setTheme(next);
  };

  const visible = (p) => !hiddenPages.includes(p.replace(/^\//, ''));
  const authLabel = me ? 'Dashboard' : 'Register';

  return (
    <>
      <header className={scrolled ? 'scrolled' : ''}>
        <Link to="/home" className="logo" aria-label="Media Club, Student Media Collective — home">
          <img className="logo-icon" src={LOGO_SRC} alt="" />
          <b className="logo-t">MEDIA CLUB<span>Student Media Collective</span></b>
        </Link>
        <nav className="navlinks" id="navlinks" aria-label="Primary">
          {LINKS.filter(([to]) => visible(to)).map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>
          ))}
        </nav>
        <Notifications />
        <button id="themeBtn" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={theme === 'dark'}
          onClick={toggleTheme}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" /></svg>
        </button>
        <NavLink to="/dashboard" className={({ isActive }) => 'header-auth' + (isActive ? ' active' : '')}>{authLabel}</NavLink>
        <button id="menuBtn" className={menuOpen ? 'open' : ''} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle className="core" cx="12" cy="12" r="3" /></svg>
          <span></span>
          <span></span>
        </button>
      </header>
      <div id="overlay" className={menuOpen ? 'open' : ''}>
        {LINKS.filter(([to]) => visible(to)).map(([to, label], i) => (
          <Link key={to} to={to} style={{ transitionDelay: menuOpen ? `${0.06 * i}s` : '0s' }}>{label}</Link>
        ))}
        <Link to="/dashboard" style={{ transitionDelay: menuOpen ? `${0.06 * LINKS.length}s` : '0s' }}>{authLabel}</Link>
      </div>
    </>
  );
}
