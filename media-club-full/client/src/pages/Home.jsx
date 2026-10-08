import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSite } from '../store';
import { LOGO_SRC } from '../logo';
import Footer from '../components/Footer';

const N = 5;
const NAMES = ['Intro', 'About', 'Stories', 'People', 'Join'];
const TILE_ASPECTS = ['3/4', '1/1', '4/5', '2/3', '5/4', '1/1', '3/4'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function eventStatus(ev) {
  const now = new Date();
  const start = new Date(ev.start);
  const end = new Date(ev.end || ev.start);
  if (now < start) return 'upcoming';
  if (now > end) return 'past';
  return 'live';
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function monYear(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return MON[d.getMonth()] + ' ' + d.getFullYear();
}

const pad = (n) => String(n).padStart(2, '0');

// Same hash as the original memberNumberFor(uid): stable per-user crew number
// used when the profile has no explicit memberId.
function memberNumberFor(uid) {
  let h = 0;
  const s = String(uid);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return String(100 + (h % 900));
}

export default function Home() {
  const { members, events, posts, stats, myProfile } = useSite();
  const navigate = useNavigate();
  const [cur, setCur] = useState(0);
  const [dir, setDir] = useState(1);
  const sectionRef = useRef(null);
  const deckRef = useRef(null);
  const passRef = useRef(null);
  const curRef = useRef(0);
  const busyRef = useRef(false);
  const lockUntilRef = useRef(0);
  const reducedRef = useRef(false);
  const touchRef = useRef({ y: 0, x: 0 });

  const goTo = useCallback((i, force) => {
    i = Math.max(0, Math.min(N - 1, i));
    if (i === curRef.current && !force) return;
    if (busyRef.current && !force) return;
    busyRef.current = true;
    lockUntilRef.current = performance.now() + 950;
    setDir(i > curRef.current ? 1 : -1);
    const inn = deckRef.current?.querySelectorAll('.slide')[i]?.querySelector('.slide-inner');
    if (inn) inn.scrollTop = 0;
    curRef.current = i;
    setCur(i);
    if (window.__bgSurge) { try { window.__bgSurge(); } catch (_) {} }
    setTimeout(() => { busyRef.current = false; }, reducedRef.current ? 30 : 950);
  }, []);

  const step = useCallback((d) => goTo(curRef.current + d), [goTo]);

  // mount: reduced-motion flag, body hook, deck reset hook for parity with original
  useEffect(() => {
    reducedRef.current = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.body.classList.add('home-deck');
    window.__deckReset = () => {
      curRef.current = 0;
      setDir(1);
      setCur(0);
    };
    return () => {
      document.body.classList.remove('home-deck');
      if (window.__deckReset) delete window.__deckReset;
    };
  }, []);

  // wheel navigation (passive:false so we can preventDefault)
  useEffect(() => {
    const inner = () => deckRef.current?.querySelectorAll('.slide')[curRef.current]?.querySelector('.slide-inner');
    const canScroll = (d) => {
      const el = inner();
      if (!el || el.scrollHeight <= el.clientHeight + 2) return false;
      return d > 0
        ? el.scrollTop + el.clientHeight < el.scrollHeight - 2
        : el.scrollTop > 2;
    };
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const d = e.deltaY > 0 ? 1 : -1;
      if (canScroll(d)) return;
      e.preventDefault();
      const now = performance.now();
      if (now < lockUntilRef.current) { lockUntilRef.current = Math.max(lockUntilRef.current, now + 120); return; }
      if (Math.abs(e.deltaY) < 6) return;
      step(d);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [step]);

  // keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      const t = document.activeElement;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); if (performance.now() > lockUntilRef.current) step(1); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); if (performance.now() > lockUntilRef.current) step(-1); }
      else if (e.key === 'Home') { goTo(0); }
      else if (e.key === 'End') { goTo(N - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, step]);

  // crew-card glare tilt, rAF-throttled like the original tick()
  useEffect(() => {
    let raf = 0;
    let pe = null;
    const tick = () => {
      raf = 0;
      if (!pe) return;
      const pass = passRef.current;
      if (pass && curRef.current === 4) {
        const r = pass.getBoundingClientRect();
        const nx = (pe.clientX - (r.left + r.width / 2)) / window.innerWidth;
        const ny = (pe.clientY - (r.top + r.height / 2)) / window.innerHeight;
        pass.style.setProperty('--py', (nx * 34).toFixed(1) + 'deg');
        pass.style.setProperty('--px', (-ny * 30).toFixed(1) + 'deg');
        pass.style.setProperty('--gx', (50 + nx * 120) + '%');
        pass.style.setProperty('--gy', (30 + ny * 120) + '%');
      }
    };
    const onMove = (e) => { pe = e; if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { y: t.clientY, x: t.clientX };
  };
  const onTouchEnd = (e) => {
    if (performance.now() < lockUntilRef.current) return;
    const t = e.changedTouches[0];
    const dy = touchRef.current.y - t.clientY;
    const dx = touchRef.current.x - t.clientX;
    if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    const el = deckRef.current?.querySelectorAll('.slide')[curRef.current]?.querySelector('.slide-inner');
    if (el && el.scrollHeight > el.clientHeight + 2) {
      const d = dy > 0 ? 1 : -1;
      if (d > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2) return;
    }
    step(dy > 0 ? 1 : -1);
  };

  // ---- data (same shapes/markup as renderHomeUpcoming / renderHomeStories) ----
  const upcoming = useMemo(() => (events || []).slice(0, 6), [events]);

  const stories = useMemo(() => {
    const withPhotos = (events || []).filter((ev) => ev.photos && ev.photos.length).slice(0, 3);
    if (withPhotos.length) {
      return withPhotos.map((ev) => ({
        key: ev.id || ev.t,
        d: ev.start ? monYear(ev.start) : (ev.d || ''),
        t: ev.t,
        desc: ev.desc || ev.p || '',
        count: ev.tag && ev.tag !== 'Open to all' ? ev.tag : 'Photo story',
        photo: (ev.photos && ev.photos[0]) || '',
      }));
    }
    return (posts || []).slice(0, 3).map((p) => ({
      key: p.id || p.t,
      d: p.d || '',
      t: p.t,
      desc: p.body || '',
      count: p.a ? 'By ' + p.a : 'Journal',
      photo: '',
    }));
  }, [events, posts]);

  const galleryCount = useMemo(
    () => (members || []).reduce((a, m) => a + ((m.gallery || []).length), 0),
    [members]
  );
  const dkM = stats ? stats.members : ((members || []).length || '–');
  const dkF = stats ? stats.frames : (galleryCount || '–');
  // Original shim sets dkY unconditionally (years since 2020), even with no members.
  const dkY = stats ? stats.years : Math.max(0, new Date().getFullYear() - 2020);

  const passName = ((myProfile && myProfile.name) || 'MEDIA CLUB').toUpperCase();
  const passRole = (myProfile && (myProfile.department || myProfile.role)) || 'Member';
  const passSub = myProfile
    ? 'No. ' + (myProfile.memberId || (myProfile.id ? memberNumberFor(myProfile.id) : '087')) + (myProfile.batch ? ' · ' + myProfile.batch : '')
    : 'No. 087 · 2025–26';

  const brand = 'MEDIA CLUB';
  const frame = pad(cur + 1) + ' / ' + pad(N);

  return (
    <section className={'route visible' + (cur === 0 ? ' at-0' : '')} id="home" ref={sectionRef}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="deck" id="deck" ref={deckRef} style={{ '--dir': dir }}>
        <div className={'slide' + (cur === 0 ? ' active' : '')} data-i="0">
          <div className="slide-inner center">
            <h1 className="dk-brand" data-r="" style={{ '--d': '.12s' }} aria-label={brand}>
              {[...brand].map((c, i) => (c === ' '
                ? <span key={i} className="k" aria-hidden="true">&nbsp;</span>
                : <span key={i} className="k" aria-hidden="true">{c}</span>))}
            </h1>
            <p className="dk-tag" data-r="" style={{ '--d': '.22s' }}>Photography, film, stories.</p>
            <p className="dk-sub" data-r="" style={{ '--d': '.3s' }}>MEDIA CLUB — Student Media Collective</p>
            <div className="dk-actions" data-r="" style={{ '--d': '.32s' }}>
              <a href="#" className="btn ghost" data-slide="2" onClick={(e) => { e.preventDefault(); goTo(2); }}>See our work</a>
              <Link to="/connect" data-nav="connect" className="btn">Join MEDIA CLUB</Link>
            </div>
            <div className="dk-stats" data-r="" style={{ '--d': '.42s' }}>
              <span><b id="dkM">{dkM}</b> members</span>
              <span><b id="dkF">{dkF}</b> frames</span>
              <span><b id="dkY">{dkY}</b> years</span>
            </div>
            <div className="dk-upcoming" data-r="" style={{ '--d': '.5s' }}>
              <div className="dk-upcoming-head">
                <span>What&apos;s next</span>
                <Link to="/events" data-nav="events" className="dk-link">All →</Link>
              </div>
              <div id="homeEventsMount" className="up-list">
                {!upcoming.length ? (
                  <p className="mg-empty" style={{ margin: '20px 0' }}>Nothing scheduled yet.<br />Something is probably being planned.</p>
                ) : upcoming.map((ev) => {
                  const live = ev.start ? eventStatus(ev) === 'live' : !!ev.live;
                  const dateLabel = ev.start ? fmtDate(ev.start) : ev.d;
                  // Original global [data-event] handler opens the event detail view.
                  const dest = ev.id ? '/events/' + ev.id : '/events';
                  return (
                    <div
                      key={ev.id || ev.t}
                      className="up-item"
                      data-event={ev.id}
                      tabIndex="0"
                      role="link"
                      onClick={() => navigate(dest)}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(dest); }}
                    >
                      <div className={'up-date' + (live ? ' up-live' : '')}>
                        {live ? <span className="live-dot"></span> : null}{dateLabel}
                      </div>
                      <div className="up-detail">
                        <h3>{ev.t}</h3>
                        <p>{ev.p}</p>
                        <span className="up-tag">{ev.tag}</span>
                        <span className="up-view">View event →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="live-ticker">
                <div className="live-ticker-mask">
                  <div id="homeEventsTicker" className="live-ticker-track">
                    {!upcoming.length ? (
                      <span className="tk-item">Nothing scheduled yet.</span>
                    ) : [...upcoming, ...upcoming].map((ev, i) => {
                      const live = ev.start ? eventStatus(ev) === 'live' : !!ev.live;
                      return [
                        <Link key={'t' + i} to={ev.id ? '/events/' + ev.id : '/events'} className={'tk-item' + (live ? ' tk-live' : '')}>
                          {live ? <span className="live-dot"></span> : null}{ev.t}
                        </Link>,
                        <span key={'d' + i} className="tk-dot" aria-hidden="true">•</span>,
                      ];
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={'slide' + (cur === 1 ? ' active' : '')} data-i="1">
          <div className="slide-inner center">
            <div className="kicker" data-r="" style={{ '--d': '.05s' }}>What we are</div>
            <h2 className="dk-h2" data-r="" style={{ '--d': '.12s' }}>We document what happens.<br />We create what comes next.</h2>
            <div className="dk-chips" data-r="" style={{ '--d': '.24s' }}>
              <Link className="dk-chip" to="/portfolio" data-nav="portfolio">Photography</Link>
              <Link className="dk-chip" to="/portfolio" data-nav="portfolio">Film</Link>
            </div>
            <Link to="/about" data-nav="about" className="dk-link" data-r="" style={{ '--d': '.34s' }}>About MEDIA CLUB →</Link>
          </div>
        </div>

        <div className={'slide' + (cur === 2 ? ' active' : '')} data-i="2">
          <div className="slide-inner">
            <div className="kicker" data-r="" style={{ '--d': '.05s' }}>What we did</div>
            <h2 className="dk-h2" data-r="" style={{ '--d': '.12s' }}>Recent stories.</h2>
            <div id="homeStoriesMount" className="stories-grid" data-r="" style={{ '--d': '.24s' }}>
              {stories.map((s, i) => (
                <div key={s.key || i} className="story-card" data-idx={i} onClick={() => navigate('/gallery')} role="link" tabIndex="0"
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate('/gallery'); }}>
                  <div className="story-photo">
                    <div className="tex" style={{
                      aspectRatio: TILE_ASPECTS[i % TILE_ASPECTS.length],
                      backgroundImage: 'url(' + (s.photo ? "'" + s.photo + "'" : "''") + ')',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}></div>
                  </div>
                  <div className="story-date">{s.d}</div>
                  <h3>{s.t}</h3>
                  <p>{s.desc}</p>
                  <div className="story-meta">
                    <span className="story-count">{s.count}</span>
                    <button type="button" className="story-view" data-idx={i}
                      onClick={(e) => { e.stopPropagation(); navigate('/gallery'); }}>View photos →</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={'slide' + (cur === 3 ? ' active' : '')} data-i="3">
          <div className="slide-inner">
            <div className="kicker" data-r="" style={{ '--d': '.05s' }}>Behind the lens</div>
            <div className="dk-duo">
              <Link to="/team" data-nav="team" className="dk-tile" data-r="" style={{ '--d': '.14s' }}>
                <span className="dk-tile-k">The people</span>
                <span className="dk-tile-t">Meet the committee →</span>
              </Link>
              <Link to="/history" data-nav="history" className="dk-tile" data-r="" style={{ '--d': '.24s' }}>
                <span className="dk-tile-k">2025–26</span>
                <span className="dk-tile-t">Enter the archive →</span>
              </Link>
            </div>
          </div>
        </div>

        <div className={'slide' + (cur === 4 ? ' active' : '')} data-i="4">
          <div className="slide-inner center wide join-slide">
            <div className="dk-split">
              <div>
                <h2 className="dk-h1" data-r="" style={{ '--d': '.08s' }}>Create<br />with us.</h2>
                <div className="dk-actions" data-r="" style={{ '--d': '.22s' }}>
                  <Link to="/connect" data-nav="connect" className="btn">Join MEDIA CLUB →</Link>
                  <Link to="/connect" data-nav="connect" className="btn ghost">Contact →</Link>
                </div>
              </div>
              <div className="pass-wrap" data-r="" style={{ '--d': '.2s' }}>
                <div className="pass" id="pass" ref={passRef}>
                  <i className="glare"></i>
                  <img className="pass-logo" src={LOGO_SRC} alt="" />
                  <span className="pass-k">Crew card</span>
                  <b className="pass-b" id="passName">{passName}</b>
                  <span className="pass-m" id="passRole">{passRole}</span>
                  <span className="pass-n" id="passSub">{passSub}</span>
                </div>
              </div>
            </div>
            <div className="dk-foot" data-r="" style={{ '--d': '.34s' }}>© 2025–26 MEDIA CLUB</div>
            <Footer className="home-footer" />
          </div>
        </div>
      </div>

      <div className="vf" id="vf" aria-hidden="true">
        <i className="c tl"></i><i className="c tr"></i><i className="c bl"></i><i className="c br"></i>
        <span className="vf-rec"><em></em><span id="vfRec">{frame}</span></span>
        <span className="vf-exif">ƒ/2.8 · 1/250 · ISO 200 · 35mm</span>
      </div>
      <div className="deck-count" id="deckCount" aria-hidden="true"><b>{pad(cur + 1)}</b> / {pad(N)}</div>
      <div className="deck-dots" id="deckDots" role="tablist" aria-label="Home sections">
        {NAMES.map((n, i) => (
          <button key={n} type="button" aria-label={'Go to ' + n} className={i === cur ? 'on' : ''} onClick={() => goTo(i)}>
            <em>{n}</em>
          </button>
        ))}
      </div>
      <button type="button" className={'deck-hint' + (cur !== 0 ? ' hide' : '')} id="deckHint"
        aria-label="Next section" onClick={() => step(1)}>
        Scroll<span></span>
      </button>
    </section>
  );
}
