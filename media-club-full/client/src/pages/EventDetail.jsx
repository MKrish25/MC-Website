import { Link, useParams } from 'react-router-dom';
import { useSite } from '../store';
import { SiteAPI } from '../api';

function eventStatus(ev) {
  const now = new Date(), start = new Date(ev.start), end = new Date(ev.end || ev.start);
  if (now < start) return 'upcoming';
  if (now > end) return 'past';
  return 'live';
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* Matches vanilla renderEventDetail: same back link, head, desc, highlights,
   photos and RSVP copy. Register-interest is stored on the member PROFILE via
   myEvents (same as the original getProfile/saveProfile semantics), so the
   dashboard "My events" list agrees. */
export default function EventDetail() {
  const { id } = useParams();
  const { events, me, myProfile, setMyProfile } = useSite();

  const key = id ? decodeURIComponent(id) : '';
  const ev = (events || []).find((e) => e.id === key) || null;

  if (!ev) {
    return (
      <div className="wrap" style={{ paddingTop: 130, paddingBottom: 60 }}>
        <Link className="mg-back" to="/events">← Back</Link>
        <p className="mg-empty">Event not found.</p>
      </div>
    );
  }

  const status = eventStatus(ev);
  const photos = ev.photos || [];
  const going = !!myProfile && ((myProfile.myEvents || []).includes(ev.id));

  const toggleInterest = async () => {
    if (!me || !myProfile) return;
    const list = myProfile.myEvents || [];
    const next = list.includes(ev.id) ? list.filter((x) => x !== ev.id) : [...list, ev.id];
    try {
      const { profile } = await SiteAPI.saveProfile({ ...myProfile, myEvents: next });
      setMyProfile(profile);
    } catch (_) {}
  };

  return (
    <div className="wrap" style={{ paddingTop: 130, paddingBottom: 60 }}>
      <Link className="mg-back" to="/events">← Back</Link>
      <div className="ev-detail-head">
        <span className="ev-detail-date">{fmtDate(ev.start)}</span>
        {status === 'live' ? <span className="live-badge-inline"><span className="live-dot"></span>Live</span> : null}
        <b className="ev-detail-title">{ev.t}</b>
        <span className="ev-detail-tag">{ev.tag}</span>
      </div>
      <p className="ev-detail-desc">{ev.desc || ev.p}</p>
      {ev.highlights && ev.highlights.length ? (
        <ul className="ev-highlights">{ev.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
      ) : null}
      <div id="evRsvp" style={{ marginBottom: 30 }}>
        {!me ? (
          <Link className="submit-btn" to="/dashboard" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Sign in to register interest
          </Link>
        ) : !myProfile ? null : (
          <button className="submit-btn" type="button" onClick={toggleInterest}>
            {going ? '✓ Registered — remove' : 'Register interest'}
          </button>
        )}
      </div>
      {photos.length ? (
        <div className="masonry">
          {photos.map((src, i) => (
            <div key={i} className="g-tile" style={{ animationDelay: `${(i % 8) * 0.04}s` }}>
              <img src={src} style={{ width: '100%', display: 'block', borderRadius: 8 }} alt="" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
