import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSite } from '../store';
import { FollowAPI } from '../api';
import { guessCat } from '../components/Lightbox';
import { team as SEED_TEAM } from '../seed';

const tileAspects = ['3/4', '1/1', '4/5', '2/3', '5/4', '1/1', '3/4'];
const TIER_ORDER = ['Executive', 'Department heads', 'Members'];
const LS_KEY = 'raw_sx_myfollows';

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Static seed committee first (exactly like the original allMembersForGrid),
// then live backend sign-ups on top.
export function seedRoster() {
  return Object.entries(SEED_TEAM).flatMap(([tier, list]) => list.map((m) => ({
    id: 'seed:' + slug(m.n), name: m.n, role: m.r, insta: m.insta, photo: m.photo || '',
    links: null, cat: guessCat(m.r), tier, bio: m.bio, favCamera: m.favCamera, side: m.side, seed: true,
  })));
}

function instaUrl(handle) {
  return handle.startsWith('http') ? handle : `https://instagram.com/${handle.replace('@', '')}`;
}

function tierOf(m) {
  if (m.tier) return m.tier;
  const r = m.role || '';
  if (/president|vice/i.test(r)) return 'Executive';
  if (m.accountType === 'oc' || /head/i.test(r)) return 'Department heads';
  return 'Members';
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (_) { return {}; }
}

const bellIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
const igIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" /></svg>
);
const linkIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 14a5 5 0 0 1 0-7l2-2a5 5 0 0 1 7 7l-1 1" /><path d="M14 10a5 5 0 0 1 0 7l-2 2a5 5 0 0 1-7-7l1-1" /></svg>
);

function MemberTile({ m, i, following, onToggleFollow }) {
  const navigate = useNavigate();
  const go = () => navigate(`/member/${encodeURIComponent(m.id)}`);
  const media = m.photo
    ? <img src={m.photo} alt="" />
    : <div className="tex" style={{ aspectRatio: tileAspects[i % tileAspects.length] }}></div>;
  const sub = [m.department || m.role || '', m.batch].filter(Boolean).join(' · ');
  const hasExtra = !!(m.bio || m.favCamera);
  const on = !!following;
  return (
    <div className={'mtile' + (hasExtra ? ' has-extra' : '')} data-key={m.id}
      style={{ animationDelay: `${(i % 8) * 0.03}s` }}
      tabIndex={0} role="link" aria-label={m.name}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter') go(); }}>
      {media}
      <div className="socials" onClick={(e) => e.stopPropagation()}>
        {m.insta ? <a className="tile-social" href={instaUrl(m.insta)} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>{igIcon}</a> : null}
        {m.links && m.links[0] ? <a className="tile-social" href={m.links[0]} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>{linkIcon}</a> : null}
        <button type="button" className={'tile-social fl' + (on ? ' on' : '')}
          aria-label={(on ? 'Unfollow ' : 'Follow ') + m.name}
          aria-pressed={on} title={on ? 'Following — tap to unfollow' : 'Follow'}
          onClick={(e) => { e.stopPropagation(); onToggleFollow(m); }}>{bellIcon}</button>
      </div>
      <div className="cap-blur"><b>{m.name}</b><span>{sub}</span>
        {hasExtra ? (
          <div className="cap-extra">
            {m.bio ? <p>{m.bio}</p> : null}
            {m.favCamera ? <span className="cap-cam">{m.favCamera}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Team() {
  const { members, me } = useSite();
  const [follows, setFollows] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = {};
      if (me) {
        try {
          const { follows: list } = await FollowAPI.list();
          (list || []).forEach((f) => { next[f.member_id] = true; });
        } catch (_) {}
      }
      Object.keys(readLocal()).forEach((k) => {
        if (k.indexOf('profile:') === 0) next[k.slice(8)] = true;
      });
      if (!cancelled) setFollows(next);
    })();
    return () => { cancelled = true; };
  }, [me, members.length]);

  const toggleFollow = async (m) => {
    const on = !!follows[m.id];
    if (me) {
      try {
        if (on) await FollowAPI.unfollow(m.id);
        else await FollowAPI.follow(m.id);
        setFollows((f) => ({ ...f, [m.id]: !on }));
        return;
      } catch (_) {}
    }
    try {
      const lf = readLocal();
      const key = 'profile:' + m.id;
      if (lf[key]) delete lf[key];
      else lf[key] = { name: m.name, seen: new Date().toISOString() };
      localStorage.setItem(LS_KEY, JSON.stringify(lf));
    } catch (_) {}
    setFollows((f) => ({ ...f, [m.id]: !on }));
  };

  const tiers = [];
  [...seedRoster(), ...(members || [])].forEach((m) => {
    const t = tierOf(m);
    let g = tiers.find((g) => g.tier === t);
    if (!g) { g = { tier: t, list: [] }; tiers.push(g); }
    g.list.push(m);
  });
  tiers.sort((a, b) => {
    const ai = TIER_ORDER.indexOf(a.tier), bi = TIER_ORDER.indexOf(b.tier);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  let n = 0;
  return (
    <>
      <div className="section-head page-title">
        <div className="sec-head"><div className="kicker">Committee</div><span className="frame-tag">FRAME 03/36</span></div>
        <h2 className="sec">The people behind the frames.</h2>
      </div>
      <div id="teamMount">
        {tiers.map((g) => (
          <div key={g.tier}>
            <div className="wrap"><p className="ar-tier">{g.tier}</p></div>
            <div className="masonry">
              {g.list.map((m) => {
                const idx = n++;
                return <MemberTile key={m.id} m={m} i={idx} following={follows[m.id]} onToggleFollow={toggleFollow} />;
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
