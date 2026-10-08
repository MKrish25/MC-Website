import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { SocialAPI } from '../api';
import { useSite } from '../store';

/* ---------- shared helpers, ported 1:1 from the vanilla site ---------- */
export function normGalleryItem(item, i) {
  const base = { id: 'g' + i, type: 'photo', src: '', camera: '', lens: '', aperture: '', shutter: '', iso: '', focal: '', editedIn: '', caption: '', location: '', date: '', allowDownload: false, category: 'Other', uploadedAt: null, featured: false };
  if (typeof item === 'string') return { ...base, src: item };
  return { ...base, ...item };
}

export function metaChips(it) {
  const chips = [];
  if (it.type === 'video') {
    if (it.editedIn) chips.push(it.editedIn);
    if (it.camera) chips.push(it.camera);
  } else {
    if (it.aperture) chips.push(it.aperture.startsWith('f') ? it.aperture : 'f/' + it.aperture);
    if (it.shutter) chips.push(it.shutter.includes('/') || it.shutter.endsWith('s') ? it.shutter : it.shutter + 's');
    if (it.iso) chips.push('ISO ' + it.iso);
    if (it.focal) chips.push(it.focal.includes('mm') ? it.focal : it.focal + 'mm');
  }
  return chips;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'JUST NOW';
  if (s < 3600) return Math.floor(s / 60) + ' MIN AGO';
  if (s < 86400) return Math.floor(s / 3600) + ' HOUR' + (Math.floor(s / 3600) === 1 ? '' : 'S') + ' AGO';
  if (s < 172800) return 'YESTERDAY';
  return Math.floor(s / 86400) + ' DAYS AGO';
}

export function slugU(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function pidOf(it, by) {
  const s = (it.src || '') + '';
  let h = s.length;
  for (let i = 0; i < s.length; i += Math.max(1, s.length >> 8)) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'p' + h.toString(36) + slugU(by || '');
}

export function guessCat(role) {
  if (/photo/i.test(role)) return 'Photography';
  if (/film/i.test(role)) return 'Film';
  if (/design/i.test(role)) return 'Design';
  if (/edit|writ|outreach|president/i.test(role)) return 'Editorial';
  return 'Photography';
}

/* ---------- gallery tile, same markup as galTileHTML ---------- */
export function GalleryTile({ entry, index, onOpen }) {
  const { it, by, role } = entry;
  const chips = metaChips(it);
  const isFilm = it.type === 'photo' && !it.aperture && !it.iso && !it.shutter;
  const ago = timeAgo(it.uploadedAt);
  const play = (e) => { const v = e.currentTarget.querySelector('video'); if (v) v.play().catch(() => {}); };
  const stop = (e) => { const v = e.currentTarget.querySelector('video'); if (v) { try { v.pause(); v.currentTime = 0; } catch (_) {} } };
  const open = () => { if (onOpen) onOpen(index); };
  return (
    <div
      className="g-tile" data-gidx={index} tabIndex="0"
      style={{ animationDelay: `${(index % 8) * 0.04}s` }}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
      onMouseEnter={play} onMouseLeave={stop}
    >
      {isFilm ? <span className="g-film-badge">Shot on film</span> : null}
      {ago ? <span className="g-time">{ago}</span> : null}
      {it.type === 'video' ? (
        <>
          <video src={it.src} muted loop playsInline preload="metadata"></video>
          <span className="g-badge"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
        </>
      ) : (
        <img src={it.src} alt={it.caption || ''} />
      )}
      <div className="g-cap">
        <span className="g-by">{(by || 'Member').toUpperCase()}{role ? ' · ' + role : ''}</span>
        <div className="g-meta"><span>{it.category || 'Other'}</span>{chips.map((c) => <span key={c}>{c}</span>)}</div>
        {it.caption ? <div className="g-caption">{it.caption}</div> : null}
      </div>
    </div>
  );
}

/* ---------- social box (likes + comments), ported from decorateLB ---------- */
const HEART = 'M12 20.5s-7.5-4.6-9.2-9.3C1.6 8 3.6 4.8 6.8 4.8c2 0 3.6 1.2 5.2 3 1.6-1.8 3.2-3 5.2-3 3.2 0 5.2 3.200 4 6.400-1.700 4.700-9.200 9.300-9.200 9.300z';

function commentAgo(t) {
  const s = Math.max(1, (Date.now() - (+t || Date.now())) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return Math.floor(s / 604800) + 'w';
}

/* Match vanilla cx(): linkify @mentions inside comment text. */
function commentRich(text) {
  const parts = String(text || '').split(/(@[A-Za-z0-9._]+)/g);
  return parts.map((p, i) => (
    /^@[A-Za-z0-9._]+$/.test(p)
      ? <a key={i} href="#" onClick={(e) => e.preventDefault()} style={{ color: 'inherit', fontWeight: 600 }}>{p}</a>
      : <span key={i}>{p}</span>
  ));
}

function SocialBox({ pid, ownerUid }) {
  const { me } = useSite();
  const [d, setD] = useState(null);
  const [openReplies, setOpenReplies] = useState(() => new Set());
  const [replyingTo, setReplyingTo] = useState(null);
  const [draft, setDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [pop, setPop] = useState(false);

  const photoLink = '/#' + String(window.location.hash || '').replace(/^#/, '');
  const meta = ownerUid ? { owner: ownerUid, link: photoLink } : {};

  const reload = useCallback(async () => {
    try {
      const s = await SocialAPI.get(pid);
      setD({ likeCount: s.likeCount || 0, liked: !!s.liked, canMod: !!s.canMod, comments: (s.comments || []).map((c) => ({ ...c, replies: c.replies || [] })) });
    } catch (_) { /* stays logged-out state */ }
  }, [pid]);

  useEffect(() => {
    setD(null);
    setOpenReplies(new Set());
    setReplyingTo(null);
    setDraft('');
    reload();
  }, [pid, reload]);

  const toggleLike = async () => {
    if (!me) return;
    try {
      const o = await SocialAPI.like(pid, meta);
      setD((prev) => (prev ? { ...prev, liked: o.liked, likeCount: o.likeCount } : prev));
      setPop(true);
      setTimeout(() => setPop(false), 450);
    } catch (_) {}
  };

  const submitComment = async (e) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t || !me) return;
    try {
      await SocialAPI.comment(pid, t, meta);
      setDraft('');
      await reload();
    } catch (_) {}
  };

  const submitReply = async (e, top) => {
    e.preventDefault();
    const t = replyDraft.trim();
    if (!t || !me || !replyingTo) return;
    const body = (replyingTo.rid ? '@' + replyingTo.handle + ' ' : '') + t;
    try {
      await SocialAPI.reply(pid, top.id, body, meta);
      setOpenReplies((prev) => new Set(prev).add(top.id));
      setReplyingTo(null);
      setReplyDraft('');
      await reload();
    } catch (_) {}
  };

  const removeComment = async (top, rid) => {
    if (!window.confirm(rid ? 'Delete this reply?' : 'Delete this comment and its replies?')) return;
    try {
      if (rid) await SocialAPI.delReply(pid, top.id, rid);
      else await SocialAPI.delComment(pid, top.id);
      if (!rid) {
        setOpenReplies((prev) => { const n = new Set(prev); n.delete(top.id); return n; });
        if (replyingTo && replyingTo.cid === top.id) { setReplyingTo(null); setReplyDraft(''); }
      }
      await reload();
    } catch (_) {}
  };

  if (!d) {
    return (
      <div className="sx-box sx" data-pid={pid}>
        <button className="sx-like" type="button" aria-pressed="false" aria-label="Like this photo">
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d={HEART} /></svg></span><b>0</b>
        </button>
        <div className="sx-form"><Link className="sx-btn" to="/dashboard">Log in to like &amp; comment</Link></div>
      </div>
    );
  }

  const liked = !!d.liked;
  const likeCount = d.likeCount || 0;
  const can = (c) => !!(c.mine || d.canMod);

  const renderComment = (c, isReply, top) => {
    const n = (c.replies || []).length;
    const open = openReplies.has(c.id);
    const isTarget = replyingTo && (replyingTo.rid ? replyingTo.rid : replyingTo.cid) === c.id;
    return (
      <li key={c.id} data-cid={c.id}{...(isReply ? { 'data-rid': c.id } : {})}>
        <div className="sx-row"><b>@{c.u}</b><span>{commentRich(c.text)}</span><i className="sx-ago">{commentAgo(c.t)}</i></div>
        <div className="sx-act">
          {me ? <button type="button" data-h={c.u} onClick={() => { setReplyingTo({ cid: top.id, rid: isReply ? c.id : null, handle: c.u || '' }); setReplyDraft(''); }}>Reply</button> : null}
          {!isReply && n > 0 ? (
            <button type="button" className="sx-toggle" onClick={() => setOpenReplies((prev) => { const next = new Set(prev); if (next.has(top.id)) next.delete(top.id); else next.add(top.id); return next; })}>
              {open ? 'Hide' : 'View'} {n} {n === 1 ? 'reply' : 'replies'}
            </button>
          ) : null}
          {can(isReply ? c : c) ? <button type="button" className="sx-del" aria-label={'Delete comment by ' + c.u} onClick={() => removeComment(top, isReply ? c.id : null)}>Delete</button> : null}
        </div>
        {isTarget ? (
          <form className="sx-replybox" onSubmit={(e) => submitReply(e, top)}>
            <input maxLength={280} placeholder={'Reply to @' + replyingTo.handle + '…'} aria-label="Write a reply" value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} autoFocus />
            <button type="submit">Reply</button>
            <button type="button" className="ghost" onClick={() => { setReplyingTo(null); setReplyDraft(''); }}>Cancel</button>
          </form>
        ) : null}
        {!isReply && n > 0 && open ? (
          <div className="sx-replies"><ul className="sx-cm sx-nested">{(c.replies || []).map((r) => renderComment(r, true, c))}</ul></div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="sx-box sx" data-pid={pid}>
      <button className={'sx-like' + (pop ? ' pop' : '')} type="button" aria-pressed={liked} aria-label={(liked ? 'Unlike' : 'Like') + ' this photo'} onClick={toggleLike}>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d={HEART} /></svg></span><b>{likeCount}</b>
      </button>
      <ul className="sx-cm" aria-label="Comments">
        {d.comments.length ? d.comments.map((c) => renderComment(c, false, c)) : <li><span>No comments yet.</span></li>}
      </ul>
      {me ? (
        <form className="sx-form" onSubmit={submitComment}>
          <input maxLength={280} placeholder="Add a comment…" aria-label="Add a comment" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button className="sx-btn">Post</button>
        </form>
      ) : (
        <div className="sx-form"><Link className="sx-btn" to="/dashboard">Log in to like &amp; comment</Link></div>
      )}
    </div>
  );
}

/* ---------- lightbox, same markup as renderLightbox + decorateLB ---------- */
export default function Lightbox({ item, owner, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const by = (owner && owner.name) || 'Member';
  const role = (owner && (owner.role || owner.role_)) || '';
  const showNav = !!(hasPrev || hasNext);

  useEffect(() => {
    document.body.classList.add('arch-open');
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
      if (e.key === 'ArrowLeft' && showNav && onPrev) onPrev();
      if (e.key === 'ArrowRight' && showNav && onNext) onNext();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('arch-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, onPrev, onNext, showNav]);

  if (!item) return null;
  const it = item;

  const metaRows = [];
  if (it.type === 'video') {
    if (it.camera) metaRows.push(['Camera', it.camera]);
    if (it.lens) metaRows.push(['Lens', it.lens]);
  } else {
    if (it.camera) metaRows.push(['Camera', it.camera]);
    if (it.lens) metaRows.push(['Lens', it.lens]);
    if (it.aperture) metaRows.push(['Aperture', it.aperture.startsWith('f') ? it.aperture : 'f/' + it.aperture]);
    if (it.shutter) metaRows.push(['Shutter', it.shutter]);
    if (it.iso) metaRows.push(['ISO', it.iso]);
    if (it.focal) metaRows.push(['Focal length', it.focal.includes('mm') ? it.focal : it.focal + 'mm']);
  }
  if (it.editedIn) metaRows.push(['Edited in', it.editedIn]);
  if (it.location) metaRows.push(['Location', it.location]);
  if (it.date) metaRows.push(['Date', it.date]);

  // Portaled to document.body like the original #lightbox: rendering inside
  // a section.route would trap position:fixed (the route's retained fadeUp
  // transform becomes the containing block) and cut the bottom off-screen.
  return createPortal(
    <div
      className="lightbox show" id="lightbox" role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <div className="lb-inner" id="lbInner">
        <button className="lb-close" aria-label="Close" onClick={onClose}>✕</button>
        {showNav ? <button className="lb-nav lb-prev" aria-label="Previous" onClick={onPrev}>‹</button> : null}
        {showNav ? <button className="lb-nav lb-next" aria-label="Next" onClick={onNext}>›</button> : null}
        <div className="lb-media">
          {it.type === 'video' ? (
            <video src={it.src} controls playsInline autoPlay></video>
          ) : (
            <img src={it.src} alt={it.caption || ''} />
          )}
        </div>
        <div className="lb-info">
          <div className="lb-by">{by}</div>
          {role ? <div className="lb-role">{role}</div> : null}
          {it.caption ? <p className="lb-caption">{it.caption}</p> : null}
          {it.allowDownload && it.src ? <a className="mg-back" style={{ marginTop: '16px' }} href={it.src} download>Download</a> : null}
          {metaRows.length ? (
            <div className="lb-meta">
              {metaRows.map(([k, v]) => <div key={k}><b>{k}</b><span>{v}</span></div>)}
            </div>
          ) : null}
          <SocialBox pid={pidOf(it, by)} ownerUid={owner && owner.id} />
        </div>
      </div>
    </div>,
    document.body
  );
}
