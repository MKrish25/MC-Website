import { Link } from 'react-router-dom';
import { useSite } from '../store';

function eventStatus(ev) {
  const now = new Date(), start = new Date(ev.start), end = new Date(ev.end || ev.start);
  if (now < start) return 'upcoming';
  if (now > end) return 'past';
  return 'live';
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Events() {
  const { events } = useSite();
  const all = (events || []).filter((ev) => ev.start);
  const groups = { past: [], live: [], upcoming: [] };
  all.forEach((ev) => groups[eventStatus(ev)].push(ev));
  groups.past.sort((a, b) => new Date(a.start) - new Date(b.start));
  groups.live.sort((a, b) => new Date(a.start) - new Date(b.start));
  groups.upcoming.sort((a, b) => new Date(a.start) - new Date(b.start));

  const row = (ev, status) => (
    <Link key={ev.id} className="event-row" to={`/events/${encodeURIComponent(ev.id)}`}>
      <div className="date">{fmtDate(ev.start)}</div>
      <div>
        <h3>{ev.t}{status === 'live' ? <span className="live-badge-inline"><span className="live-dot"></span>Live</span> : null}</h3>
        <p>{ev.p}</p>
      </div>
      <div className="tag">{ev.tag}</div>
    </Link>
  );

  const section = (label, cls, list, status) => list.length ? (
    <div key={cls} className={'ev-group ' + cls}>
      <div className="ev-group-head">{label}</div>
      {list.map((ev) => row(ev, status))}
    </div>
  ) : null;

  const hasAny = groups.past.length + groups.live.length + groups.upcoming.length > 0;

  return (
    <>
      <div className="page-title">
        <div className="sec-head"><div className="kicker">Events</div><span className="frame-tag">FRAME 05/36</span></div>
        <h2 className="sec">Shoots, screenings, workshops.</h2>
      </div>
      <div className="wrap pad">
        <div id="eventsMount">
          {hasAny ? (
            <>
              {section('Past', 'ev-past', groups.past, 'past')}
              {section('Live', 'ev-live', groups.live, 'live')}
              {section('Upcoming', 'ev-upcoming', groups.upcoming, 'upcoming')}
            </>
          ) : (
            <p className="mg-empty" style={{ margin: '20px 0' }}>Nothing scheduled yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
