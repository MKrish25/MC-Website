import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSite } from '../store';
import { FollowAPI } from '../api';
import Lightbox, { GalleryTile, normGalleryItem } from '../components/Lightbox';
import { seedRoster } from './Team';
import { portfolio as SEED_WORKS } from '../seed';

const LS_KEY = 'raw_sx_myfollows';
const tileAspects = ['3/4', '1/1', '4/5', '2/3', '5/4', '1/1', '3/4'];

function instaUrl(handle) {
  return handle.startsWith('http') ? handle : `https://instagram.com/${handle.replace('@', '')}`;
}

function instaLink(handle, igIcon) {
  if (!handle) return null;
  return (
    <a className="insta-link" href={instaUrl(handle)} target="_blank" rel="noopener">
      {igIcon}@{String(handle).replace('https://instagram.com/', '').replace('@', '')}
    </a>
  );
}

const bellIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
const igIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" /></svg>
);
const linkIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M10 14a5 5 0 0 1 0-7l2-2a5 5 0 0 1 7 7l-1 1" /><path d="M14 10a5 5 0 0 1 0 7l-2 2a5 5 0 0 1-7-7l1-1" /></svg>
);

function initials(n) {
  return String(n || '').split(' ').map((w) => w[0]).join('').slice(0, 2);
}

/* Matches vanilla renderMemberGallery: .mp > .mp-stage > aside.mp-info +
   .mp-work, mp-k/mp-name/mp-meta/mp-soc copy, fl-btn follow, galTileHTML
   tiles (shared GalleryTile) opening the lightbox, both empty states. */
export default function Member() {
  const { id } = useParams();
  const { members, me } = useSite();
  const [following, setFollowing] = useState(false);
  const [sel, setSel] = useState(null);

  const key = id ? decodeURIComponent(id) : '';
  const m = members.find((x) => x.id === key) || seedRoster().find((x) => x.id === key) || null;
  const seedWorks = m && m.seed ? SEED_WORKS.filter((p) => p.m === m.name) : [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let on = false;
      if (me && key) {
        try {
          const { follows } = await FollowAPI.list();
          on = (follows || []).some((f) => f.member_id === key);
        } catch (_) {}
      }
      if (!on) {
        try {
          const lf = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
          on = !!lf['profile:' + key];
        } catch (_) {}
      }
      if (!cancelled) setFollowing(on);
    })();
    return () => { cancelled = true; };
  }, [key, me]);

  useEffect(() => { setSel(null); }, [key]);

  const toggleFollow = async () => {
    if (me && key) {
      try {
        if (following) await FollowAPI.unfollow(key);
        else await FollowAPI.follow(key);
        setFollowing(!following);
        return;
      } catch (_) {}
    }
    try {
      const lf = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      const k = 'profile:' + key;
      if (lf[k]) delete lf[k];
      else lf[k] = { name: m ? m.name : 'member', seen: new Date().toISOString() };
      localStorage.setItem(LS_KEY, JSON.stringify(lf));
    } catch (_) {}
    setFollowing(!following);
  };

  const shareMember = async () => {
    const u = location.href.split('#')[0] + '#/member/' + encodeURIComponent(key);
    try {
      if (navigator.share) await navigator.share({ title: (m ? m.name + ' — Media Club' : 'Media Club'), text: (m && m.bio) || '', url: u });
      else { await navigator.clipboard.writeText(u); alert('Link copied'); }
    } catch (_) {}
  };

  if (!m) {
    return (
      <div className="wrap" style={{ paddingTop: 130 }}>
        <Link className="mg-back" to="/team">← Back</Link>
        <p className="mg-empty">Member not found.</p>
      </div>
    );
  }

  const role = m.role || m.role_ || '';
  const galItems = (m.gallery && m.gallery.length) ? m.gallery.map((it, i) => normGalleryItem(it, i)) : null;
  const first = String(m.name || '').trim().split(/\s+/);
  const nFrames = galItems ? galItems.length : 0;
  const current = sel == null || !galItems ? null : galItems[sel];

  let body;
  if (galItems && galItems.length) {
    body = (
      <div className="masonry">
        {galItems.map((it, i) => (
          <GalleryTile key={it.id || i} entry={{ it, by: m.name, role }} index={i} onOpen={setSel} />
        ))}
      </div>
    );
  } else if (seedWorks.length) {
    body = (
      <div className="masonry">
        {seedWorks.map((p, i) => (
          <div className="g-tile" key={i} style={{ animationDelay: `${(i % 8) * 0.04}s` }}>
            <div className="tex" style={{ aspectRatio: tileAspects[i % tileAspects.length] }}></div>
            <div className="g-cap"><span className="g-by">{p.t}</span></div>
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <p className="mg-empty">
        {m.gallery !== undefined
          ? 'No photos here yet — this member hasn’t added any to their gallery yet.'
          : 'No photos here yet — nothing on file for this person yet.'}
      </p>
    );
  }

  return (
    <>
      <div className={'mp hero left' + (m.photo ? ' has-photo' : ' nophoto')}>
        <div className="mp-stage">
          <aside className="mp-info" style={m.photo ? { backgroundImage: `url(${m.photo})` } : undefined}>
            {!m.photo ? <span className="mp-ini" aria-hidden="true">{initials(m.name)}</span> : null}
            <Link className="mg-back" to="/team">← Back</Link>
            <div className="mp-id">
              <div className="mp-photo" style={m.photo ? { backgroundImage: `url(${m.photo})` } : undefined}>
                {m.photo ? null : <i>{initials(m.name)}</i>}
              </div>
              <div className="mp-text">
                <span className="mp-k">MEDIA CLUB · {role || 'Member'}</span>
                <h1 className="mp-name">{first[0] || ''}{first.length > 1 ? <><br /><em>{first.slice(1).join(' ')}</em></> : null}</h1>
                {m.bio ? <p className="mp-bio">{m.bio}</p> : null}
                <div className="mp-meta">
                  {m.favCamera ? <span><small>Camera</small>{m.favCamera}</span> : null}
                  <span><small>Frames</small>{nFrames}</span>
                </div>
                <div className="mp-soc">
                  {instaLink(m.insta, igIcon)}
                  {m.links && m.links[0] ? (
                    <a className="insta-link" href={m.links[0]} target="_blank" rel="noopener">{linkIcon} Portfolio link</a>
                  ) : null}
                  <button type="button" className="sx-share" title="Share With Us" aria-label="Share With Us" onClick={shareMember}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
                  </button>
                  <button type="button" className={'fl-btn' + (following ? ' on' : '')}
                    aria-label={(following ? 'Unfollow ' : 'Follow ') + m.name}
                    aria-pressed={following}
                    title={following ? 'Following — tap to unfollow' : 'Follow'}
                    onClick={toggleFollow}>{bellIcon}<span>{following ? 'Following' : 'Follow'}</span></button>
                </div>
              </div>
            </div>
          </aside>
          <div className="mp-work">{body}</div>
        </div>
      </div>
      {current ? (
        <Lightbox
          item={current} owner={{ id: m.id, name: m.name, role }}
          onClose={() => setSel(null)}
          onPrev={() => setSel((s) => (s + galItems.length - 1) % galItems.length)}
          onNext={() => setSel((s) => (s + 1) % galItems.length)}
          hasPrev={galItems.length > 1} hasNext={galItems.length > 1}
        />
      ) : null}
    </>
  );
}
