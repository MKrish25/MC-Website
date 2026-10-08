import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useSite } from '../store';

// Ported from public/index.html: the `portfolio` array that feeds the studio wall.
// Only indices 0, 1, 2 and 4 are pinned to the board (same as buildWall's pr() calls).
const PORTFOLIO = [
  { t: 'Orientation Week, Day One', m: 'Sana Iyer', c: 'Photography', side: 'left' },
  { t: 'Night Bus — a short doc', m: 'Rohan Fernandes', c: 'Film', side: 'right' },
  { t: 'Jazz Society EP Artwork', m: 'Priya Nair', c: 'Design', side: 'left' },
  { t: 'The Last Print Shop on Campus', m: 'Kabir Sen', c: 'Editorial', side: 'right' },
  { t: 'Rooftop Portraits Series', m: 'Arjun Rao', c: 'Photography', side: 'left' },
  { t: "Founders' Day Recap Reel", m: 'Vikram Shah', c: 'Film', side: 'right' },
  { t: 'Zine: Between Classes', m: 'Naina Gupta', c: 'Design', side: 'left' },
  { t: 'Interviews with First-Years', m: 'Riya Chandra', c: 'Editorial', side: 'right' },
];

// Ported from ocHTML(): per-tile rotation cycle for the archive member grid.
const TILT = [-0.7, 0.5, -0.3, 0.8, -0.5, 0.4];

function initials(n) {
  return String(n || '').split(' ').map((w) => w[0]).join('').slice(0, 2);
}

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// A pinned print on the board. Mirrors buildWall's pr(): decorative (inert),
// gradient placeholder photo slot — the board is a designed studio wall, member
// uploads never go here (they live in Gallery / member pages).
function PrintCard({ i, c, cm, r, y, v, ar, pin }) {
  const p = PORTFOLIO[i];
  return (
    <div
      className={'pc print inert' + (pin ? ' pin' : '')}
      style={{ '--c': c, '--cm': cm, '--r': r + 'deg', '--y': y + 'px', '--tr': r * 2 + 'deg' }}
    >
      <span className={'ph ' + v} style={{ '--ar': ar }}></span>
      <span className="cap"><span className="sub">{p.t}</span><span className="who">{p.m}</span></span>
    </div>
  );
}

// One member tile in the archive sheet. Mirrors ocHTML's one(): Link replaces
// the original button (which pushed #member) since routing is react-router here.
function ArchiveMember({ m, cls, i }) {
  const mt = cls === 'x' ? (i % 2 ? 44 : 0) : (i % 3 === 1 ? 30 : 0);
  const ar = cls === 'x' ? (i % 2 ? '5/4' : '1/1') : '4/5';
  return (
    <Link
      to={'/member/' + m.id}
      className={'ar-m ' + cls}
      style={{ '--rr': TILT[i % TILT.length] + 'deg', marginTop: mt + 'px' }}
    >
      <span className={'ph' + (m.photo ? '' : ' tex')} style={{ '--ar': ar }}>
        {m.photo ? <img src={m.photo} alt={m.name} /> : <i>{initials(m.name)}</i>}
      </span>
      <b>{m.name}</b><em>{m.role || ''}</em>
    </Link>
  );
}

export default function History() {
  const { members } = useSite();
  const studioRef = useRef(null);
  const boardRef = useRef(null);
  const sheetRef = useRef(null);
  const closeRef = useRef(null);
  const mainCardRef = useRef(null);
  const [on, setOn] = useState(false);
  const [openYear, setOpenYear] = useState(null);

  // Committee for the 2025-26 sheet: mirrors ocHTML()'s tier split —
  // non-Member tiers only, Executive vs Department heads. Falls back to
  // all members when no OC accounts exist yet so the sheet is never blank in dev.
  const { exec, heads } = useMemo(() => {
    const tierOf = (m) => {
      if (m.tier) return m.tier;
      const r = m.role || '';
      if (/president|vice/i.test(r)) return 'Executive';
      if (String(m.accountType || '').toLowerCase() === 'oc' || /head/i.test(r)) return 'Department heads';
      return 'Members';
    };
    const list = (members || []).filter((m) => tierOf(m) !== 'Members' && tierOf(m) !== 'Member');
    const base = list.length ? list : (members || []);
    return { exec: base.filter((m) => tierOf(m) === 'Executive'), heads: base.filter((m) => tierOf(m) !== 'Executive') };
  }, [members]);

  // initStudio's dim reveal: .studio.on fades the .dim overlay and lights the softboxes.
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 120);
    return () => clearTimeout(t);
  }, []);

  // initStudio's pointer parallax: board-level --tx/--ty tilt (inherited by
  // every .pc) plus --lx cone shift on the studio. Skipped for touch/reduced motion.
  useEffect(() => {
    const studio = studioRef.current;
    const board = boardRef.current;
    if (!studio || !board) return;
    const onMove = (e) => {
      if ((e.pointerType || '') === 'touch' || prefersReducedMotion()) return;
      const r = studio.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      board.style.setProperty('--tx', (-ny * 3).toFixed(2) + 'deg');
      board.style.setProperty('--ty', (nx * 4).toFixed(2) + 'deg');
      studio.style.setProperty('--lx', (nx * -14).toFixed(1));
    };
    studio.addEventListener('pointermove', onMove);
    return () => studio.removeEventListener('pointermove', onMove);
  }, []);

  const closeArchive = useCallback((instant) => {
    setOpenYear((cur) => {
      if (cur == null) return cur;
      const sheet = sheetRef.current;
      const done = () => {
        document.body.classList.remove('arch-open');
        if (mainCardRef.current) mainCardRef.current.focus({ preventScroll: true });
      };
      if (instant || prefersReducedMotion() || !sheet || !sheet.animate) {
        document.body.classList.remove('arch-open');
        return null;
      }
      try {
        const anim = sheet.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: 'rotateX(-12deg) scaleY(.7) translateY(-16px)', opacity: 0 },
          ],
          { duration: 320, easing: 'ease-in', fill: 'forwards' }
        );
        anim.onfinish = () => {
          setOpenYear(null);
          done();
        };
      } catch (_) {
        document.body.classList.remove('arch-open');
        return null;
      }
      return cur;
    });
  }, []);

  // openArchive side effects: body lock, sheet entrance (same keyframes as the
  // original), focus the close button, Escape to close.
  useEffect(() => {
    if (openYear == null) return undefined;
    document.body.classList.add('arch-open');
    const sheet = sheetRef.current;
    if (sheet && !prefersReducedMotion() && sheet.animate) {
      try {
        sheet.animate(
          [
            { transform: 'rotateX(-14deg) scaleY(.6) translateY(-24px)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
      } catch (_) {}
    }
    if (closeRef.current) closeRef.current.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') closeArchive(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('arch-open');
    };
  }, [openYear, closeArchive]);

  const open = openYear != null;

  return (
    <>
      <div className={'studio' + (on ? ' on' : '')} ref={studioRef}>
        <svg className="cables" viewBox="0 0 1000 280" preserveAspectRatio="none" aria-hidden="true"><path d="M180 40 C 120 120, 70 150, 0 175" /><path d="M700 30 C 800 130, 900 120, 1000 190" /></svg>
        <div className="stand" style={{ '--l': '2.6%' }} aria-hidden="true"></div><div className="stand" style={{ '--l': '96%' }} aria-hidden="true"></div>
        <div className="sbx" style={{ '--l': '9%', '--w': 'clamp(130px,25vw,300px)', '--h': 'clamp(56px,9vw,110px)', '--drop': 'clamp(30px,6vw,80px)', '--d': '.2s' }} aria-hidden="true"><i className="cab"></i><i className="hd"></i><i className="fc"></i><i className="cone"></i></div>
        <div className="sbx" style={{ '--l': '58%', '--w': 'clamp(110px,20vw,240px)', '--h': 'clamp(48px,7vw,86px)', '--drop': 'clamp(18px,3vw,40px)', '--d': '.7s' }} aria-hidden="true"><i className="cab"></i><i className="hd"></i><i className="fc"></i><i className="cone"></i></div>
        <div className="dim" aria-hidden="true"></div>
        <div className="floor" aria-hidden="true"></div>
        <div className="st-head wrap">
          <h2>The MEDIA CLUB Timeline</h2>
          <p className="line">Every frame leaves something behind.</p>
          <p className="hint">Pick a postcard to open its year.</p>
        </div>
        <div className="board" ref={boardRef}>
          <button
            type="button"
            ref={mainCardRef}
            className="pc main"
            style={{ '--c': '1/span 6', '--cm': '1/span 6', '--r': '-2.2deg', '--y': '0px', '--tr': '-4deg' }}
            aria-label="Open the 2025–26 Organising Committee archive"
            onClick={() => setOpenYear('2025')}
          >
            <span className="ph a" style={{ '--ar': '3/2' }}></span>
            <span className="cap"><span className="yr">2025–26</span><span className="sub">Organising Committee</span><span className="stamp">MEDIA CLUB</span></span>
          </button>
          <PrintCard i={0} c="7/span 3" cm="1/span 3" r={2.6} y={10} v="b" ar="4/5" pin />
          <PrintCard i={1} c="10/span 3" cm="4/span 3" r={-1.8} y={36} v="c" ar="4/3" pin={false} />
          <PrintCard i={2} c="8/span 3" cm="1/span 3" r={-2.4} y={6} v="a" ar="1/1" pin={false} />
          <PrintCard i={4} c="2/span 3" cm="4/span 3" r={1.6} y={26} v="b" ar="4/5" pin />
          <div className="pc inert" style={{ '--c': '6/span 3', '--cm': '1/span 6', '--r': '-1.2deg', '--y': '14px' }}>
            <span className="ph blankp" style={{ '--ar': '3/2' }}></span>
            <span className="cap"><span className="sub">Space left for what comes next.</span></span>
          </div>
        </div>
      </div>

      <div className={'scrim' + (open ? ' show' : '')} onClick={() => closeArchive(false)}></div>
      {open ? createPortal(
        <div
          className="archive"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arTitle"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeArchive(false);
          }}
        >
          <div className="ar-sheet" ref={sheetRef}>
            <button type="button" className="ar-close" ref={closeRef} aria-label="Close archive" onClick={() => closeArchive(false)}>Close</button>
            {openYear === '2025' ? (
              <div>
                <h2 id="arTitle">MEDIA CLUB — 2025–26</h2>
                <h3>Organising Committee</h3>
                <div className="ar-grid">
                  {exec.length ? <p className="ar-tier">Executive</p> : null}
                  {exec.map((m, i) => <ArchiveMember key={m.id || m.name} m={m} cls="x" i={i} />)}
                  {heads.length ? <p className="ar-tier">Department heads</p> : null}
                  {heads.map((m, i) => <ArchiveMember key={m.id || m.name} m={m} cls="h" i={i} />)}
                </div>
                <p className="ar-foot"><Link to="/team">See everyone on the Committee page</Link></p>
              </div>
            ) : (
              <div>
                <h2 id="arTitle">MEDIA CLUB — 2020</h2>
                <h3>Where it started</h3>
                <p className="ar-note">Three people, one camera and a shared Google Drive. Everything since began there.</p>
                <p className="ar-note">Names and photographs from this year haven&apos;t been added to the archive yet.</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
