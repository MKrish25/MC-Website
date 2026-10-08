import { useEffect, useRef, useState, useCallback } from "react";
import "./styles.css";
import logo from "./logo";
import startStickman from "./stickman";
import { team, portfolio, events, recentEvents } from "./data";

const NAV_AUTH = ["dashboard", "Log in / Register"];
const NAV = [["about","About"],["gallery","Gallery"],["team","Committee"],["portfolio","Portfolio"],["events","Events"],["history","History"],["connect","Connect"]];
const aspects = ["3/4","1/1","4/5","2/3","5/4","1/1","3/4"];
const initials = n => n.split(" ").map(w => w[0]).join("").slice(0,2);
const guessCat = r => /photo/i.test(r) ? "Photography" : /film/i.test(r) ? "Film" : /design/i.test(r) ? "Design" : "Editorial";
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,"-");
const fmtDate = iso => new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
const status = ev => { const n = new Date(), s = new Date(ev.start), e = new Date(ev.end || ev.start); return n < s ? "upcoming" : n > e ? "past" : "live"; };
const members = Object.entries(team).flatMap(([tier, l]) => l.map(m => ({ key: slug(m.n), name: m.n, role: m.r, insta: m.insta, photo: m.photo || "", cat: guessCat(m.r), tier, bio: m.bio, cam: m.favCamera })));

const IG = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" /></svg>;
const BELL = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
const getF = () => { try { return JSON.parse(localStorage.getItem("raw_follows") || "[]"); } catch { return []; } };
function useFollow(key) {
  const [on, setOn] = useState(() => getF().includes(key));
  const toggle = e => { e.preventDefault(); e.stopPropagation(); const f = getF(), n = on ? f.filter(k => k !== key) : [...f, key]; try { localStorage.setItem("raw_follows", JSON.stringify(n)); } catch {} setOn(!on); };
  return [on, toggle];
}
const PageTitle = ({ kicker, frame, title, children }) => (
  <div className="page-title">
    <div className="sec-head"><div className="kicker">{kicker}</div><span className="frame-tag">{frame}</span></div>
    <h2 className="sec">{title}</h2>{children}
  </div>
);

function Tile({ m, i, onOpen }) {
  const sub = m.role, [fl, toggleFl] = useFollow(m.key);
  return (
    <div className={"mtile" + (m.bio || m.cam ? " has-extra" : "")} style={{ animationDelay: (i % 8) * 0.03 + "s" }} onClick={() => onOpen(m.key)}>
      {m.photo ? <img src={m.photo} alt="" /> : <div className="tex" style={{ aspectRatio: aspects[i % aspects.length] }} />}
      <div className="socials">{m.insta && <a className="tile-social" href={"https://instagram.com/" + m.insta} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}>{IG}</a>}<button type="button" className={"tile-social fl" + (fl ? " on" : "")} aria-label={"Follow " + m.name} title="Follow" onClick={toggleFl}>{BELL}</button></div>
      <div className="cap-blur"><b>{m.name}</b><span>{sub}</span>
        {(m.bio || m.cam) && <div className="cap-extra">{m.bio && <p>{m.bio}</p>}{m.cam && <span className="cap-cam">{m.cam}</span>}</div>}
      </div>
    </div>
  );
}

function Home({ go, openEvent, active }) {
  const [cur, setCur] = useState(0), [dir, setDir] = useState(1);
  const curRef = useRef(0), lock = useRef(0), pass = useRef(null), home = useRef(null), touch = useRef(null);
  const names = ["Intro","About","Stories","People","Join"], N = names.length;
  const goTo = useCallback(i => {
    i = Math.max(0, Math.min(N - 1, i));
    if (i === curRef.current || performance.now() < lock.current) return;
    lock.current = performance.now() + 950;
    setDir(i > curRef.current ? 1 : -1); curRef.current = i; setCur(i);
    const inn = home.current && home.current.querySelectorAll(".slide-inner")[i]; if (inn) inn.scrollTop = 0;
  }, []);
  useEffect(() => {
    if (!active) return;
    curRef.current = 0; setCur(0); setDir(1);
    document.body.classList.add("home-deck");
    const inner = () => home.current.querySelectorAll(".slide-inner")[curRef.current];
    const canScroll = d => { const el = inner(); if (!el || el.scrollHeight <= el.clientHeight + 2) return false; return d > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2; };
    const wheel = e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const d = e.deltaY > 0 ? 1 : -1; if (canScroll(d)) return;
      e.preventDefault(); const now = performance.now();
      if (now < lock.current) { lock.current = Math.max(lock.current, now + 120); return; }
      if (Math.abs(e.deltaY) < 6) return; goTo(curRef.current + d);
    };
    const key = e => { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const c = curRef.current;
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); goTo(c + 1); }
      else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); goTo(c - 1); }
      else if (e.key === "Home") goTo(0); else if (e.key === "End") goTo(N - 1); };
    addEventListener("wheel", wheel, { passive: false }); addEventListener("keydown", key);
    return () => { document.body.classList.remove("home-deck"); removeEventListener("wheel", wheel); removeEventListener("keydown", key); };
  }, [goTo, active]);
  const onTouchStart = e => { touch.current = [e.touches[0].clientX, e.touches[0].clientY]; };
  const onTouchEnd = e => { const t = touch.current; if (!t) return; const dy = t[1] - e.changedTouches[0].clientY, dx = t[0] - e.changedTouches[0].clientX;
    if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    const d = dy > 0 ? 1 : -1, el = home.current.querySelectorAll(".slide-inner")[curRef.current];
    if (el && el.scrollHeight > el.clientHeight + 2 && (d > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2)) return;
    goTo(curRef.current + d); };
  const tilt = e => { const el = pass.current; if (!el) return; const r = el.getBoundingClientRect(), nx = (e.clientX - r.left - r.width / 2) / innerWidth, ny = (e.clientY - r.top - r.height / 2) / innerHeight;
    el.style.setProperty("--py", nx * 34 + "deg"); el.style.setProperty("--px", -ny * 30 + "deg"); el.style.setProperty("--gx", 50 + nx * 120 + "%"); el.style.setProperty("--gy", 30 + ny * 120 + "%"); };
  const r = d => ({ "data-r": true, style: { "--d": d + "s" } });
  const upcoming = events.slice(0, 6);
  const S = i => "slide" + (cur === i ? " active" : "");
  return (
    <section className={"route" + (active ? " visible" : "") + (cur === 0 ? " at-0" : "")} id="home" ref={home} onPointerMove={tilt} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="deck" id="deck" style={{ "--dir": dir }}>
        <div className={S(0)}><div className="slide-inner center">
          <h1 className="dk-brand" aria-label="MEDIA CLUB" {...r(.12)}>{[..."MEDIA CLUB"].map((c, i) => <span className="k" aria-hidden="true" key={i}>{c === " " ? "\u00a0" : c}</span>)}</h1>
          <p className="dk-tag" {...r(.22)}>Photography, film, stories.</p>
          <p className="dk-sub" {...r(.3)}>MEDIA CLUB — Student Media Collective</p>
          <div className="dk-actions" {...r(.32)}>
            <a href="#" className="btn ghost" onClick={e => { e.preventDefault(); goTo(2); }}>See our work</a>
            <a href="#connect" className="btn" onClick={e => { e.preventDefault(); go("connect"); }}>Join MEDIA CLUB</a>
          </div>
          <div className="dk-stats" {...r(.42)}><span><b>–</b> members</span><span><b>–</b> frames</span><span><b>–</b> years</span></div>
          <div className="dk-upcoming" {...r(.5)}>
            <div className="dk-upcoming-head"><span>What's next</span><a href="#events" className="dk-link" onClick={e => { e.preventDefault(); go("events"); }}>All →</a></div>
            <div className="up-list">{upcoming.map(ev => (
              <div className="up-item" key={ev.id} tabIndex={0} onClick={() => openEvent(ev.id)}>
                <div className={"up-date" + (status(ev) === "live" ? " up-live" : "")}>{status(ev) === "live" && <span className="live-dot" />}{fmtDate(ev.start)}</div>
                <div className="up-detail"><h3>{ev.t}</h3><p>{ev.p}</p><span className="up-tag">{ev.tag}</span><span className="up-view">View event →</span></div>
              </div>))}</div>
          </div>
        </div></div>
        <div className={S(1)}><div className="slide-inner center">
          <div className="kicker" {...r(.05)}>What we are</div>
          <h2 className="dk-h2" {...r(.12)}>We document what happens.<br />We create what comes next.</h2>
          <div className="dk-chips" {...r(.24)}><a className="dk-chip" href="#portfolio" onClick={e => { e.preventDefault(); go("portfolio"); }}>Photography</a><a className="dk-chip" href="#portfolio" onClick={e => { e.preventDefault(); go("portfolio"); }}>Film</a></div>
          <a href="#about" className="dk-link" {...r(.34)} onClick={e => { e.preventDefault(); go("about"); }}>About MEDIA CLUB →</a>
        </div></div>
        <div className={S(2)}><div className="slide-inner">
          <div className="kicker" {...r(.05)}>What we did</div>
          <h2 className="dk-h2" {...r(.12)}>Recent stories.</h2>
          <div className="stories-grid" {...r(.24)}>{recentEvents.slice(0, 3).map((ev, i) => (
            <div className="story-card" key={i}>
              <div className="story-photo"><div className="tex" style={{ aspectRatio: aspects[i], backgroundImage: `url('${ev.photos[0]}')`, backgroundSize: "cover", backgroundPosition: "center" }} /></div>
              <div className="story-date">{ev.d}</div><h3>{ev.t}</h3><p>{ev.desc}</p>
              <div className="story-meta"><span className="story-count">{ev.count}</span><button type="button" className="story-view">View photos →</button></div>
            </div>))}</div>
        </div></div>
        <div className={S(3)}><div className="slide-inner">
          <div className="kicker" {...r(.05)}>Behind the lens</div>
          <div className="dk-duo">
            <a href="#team" className="dk-tile" {...r(.14)} onClick={e => { e.preventDefault(); go("team"); }}><span className="dk-tile-k">The people</span><span className="dk-tile-t">Meet the committee →</span></a>
            <a href="#history" className="dk-tile" {...r(.24)} onClick={e => { e.preventDefault(); go("history"); }}><span className="dk-tile-k">2025–26</span><span className="dk-tile-t">Enter the archive →</span></a>
          </div>
        </div></div>
        <div className={S(4)}><div className="slide-inner center"><div className="dk-split">
          <div><h2 className="dk-h1" {...r(.08)}>Create<br />with us.</h2>
            <div className="dk-actions" {...r(.22)}>
              <a href="#connect" className="btn" onClick={e => { e.preventDefault(); go("connect"); }}>Join MEDIA CLUB →</a>
              <a href="#connect" className="btn ghost" onClick={e => { e.preventDefault(); go("connect"); }}>Contact →</a></div></div>
          <div className="pass-wrap" {...r(.2)}><div className="pass" ref={pass}><i className="glare" /><img className="pass-logo" src={logo} alt="" />
            <span className="pass-k">Crew card</span><b className="pass-b">MEDIA CLUB</b><span className="pass-m">Member</span><span className="pass-n">No. 087 · 2025–26</span></div></div>
          <div className="dk-foot" {...r(.34)}>© 2025–26 MEDIA CLUB</div>
        </div></div></div>
      </div>
      <div className="vf" aria-hidden="true"><i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
        <span className="vf-rec"><em /><span>{String(cur + 1).padStart(2, "0")} / 05</span></span><span className="vf-exif">ƒ/2.8 · 1/250 · ISO 200 · 35mm</span></div>
      <div className="deck-count"><b>{String(cur + 1).padStart(2, "0")}</b> / 05</div>
      <div className="deck-dots">{names.map((n, i) => <button key={n} className={cur === i ? "on" : ""} aria-label={"Go to " + n} onClick={() => goTo(i)}><em>{n}</em></button>)}</div>
      <button className={"deck-hint" + (cur ? " hide" : "")} onClick={() => goTo(cur + 1)}>Scroll<span /></button>
    </section>
  );
}

function Studio({ openMember }) {
  const [on, setOn] = useState(false), [open, setOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 120); return () => clearTimeout(t); }, []);
  const pr = (i, c, cm, rot, y, v, ar, pin) => (
    <div key={i} className={"pc print inert" + (pin ? " pin" : "")} style={{ "--c": c, "--cm": cm, "--r": rot + "deg", "--y": y + "px", "--tr": rot * 2 + "deg" }}>
      <span className={"ph " + v} style={{ "--ar": ar }} /><span className="cap"><span className="sub">{portfolio[i].t}</span><span className="who">{portfolio[i].m}</span></span></div>);
  const oc = members.filter(m => m.tier !== "Members");
  return (
    <section className="route visible" id="studioPage">
      <div className={"studio" + (on ? " on" : "")}>
        <svg className="cables" viewBox="0 0 1000 280" preserveAspectRatio="none" aria-hidden="true"><path d="M180 40 C 120 120, 70 150, 0 175" /><path d="M700 30 C 800 130, 900 120, 1000 190" /></svg>
        <div className="stand" style={{ "--l": "2.6%" }} /><div className="stand" style={{ "--l": "96%" }} />
        {[["9%","clamp(130px,25vw,300px)","clamp(56px,9vw,110px)","clamp(30px,6vw,80px)",".2s"],["58%","clamp(110px,20vw,240px)","clamp(48px,7vw,86px)","clamp(18px,3vw,40px)",".7s"]].map(([l, w, h, drop, d], i) => (
          <div className="sbx" key={i} style={{ "--l": l, "--w": w, "--h": h, "--drop": drop, "--d": d }} aria-hidden="true"><i className="cab" /><i className="hd" /><i className="fc" /><i className="cone" /></div>))}
        <div className="dim" /><div className="floor" />
        <div className="st-head wrap"><h2>The MEDIA CLUB Timeline</h2><p className="line">Every frame leaves something behind.</p><p className="hint">Pick a postcard to open its year.</p></div>
        <div className="board">
          <button className="pc main" style={{ "--c": "1/span 6", "--cm": "1/span 6", "--r": "-2.2deg", "--y": "0px", "--tr": "-4deg" }} onClick={() => setOpen(true)}>
            <span className="ph a" style={{ "--ar": "3/2" }} /><span className="cap"><span className="yr">2025–26</span><span className="sub">Organising Committee</span><span className="stamp">MEDIA CLUB</span></span></button>
          {pr(0, "7/span 3", "1/span 3", 2.6, 10, "b", "4/5", true)}{pr(1, "10/span 3", "4/span 3", -1.8, 36, "c", "4/3")}
          {pr(2, "8/span 3", "1/span 3", -2.4, 6, "a", "1/1")}{pr(4, "2/span 3", "4/span 3", 1.6, 26, "b", "4/5", true)}
          <div className="pc inert" style={{ "--c": "6/span 3", "--cm": "1/span 6", "--r": "-1.2deg", "--y": "14px" }}><span className="ph blankp" style={{ "--ar": "3/2" }} /><span className="cap"><span className="sub">Space left for what comes next.</span></span></div>
        </div>
      </div>
      <div className={"scrim" + (open ? " show" : "")} onClick={() => setOpen(false)} />
      {open && <div className="archive" onClick={e => e.target === e.currentTarget && setOpen(false)}><div className="ar-sheet">
        <button className="ar-close" onClick={() => setOpen(false)}>Close</button>
        <h2>MEDIA CLUB — 2025–26</h2><h3>Organising Committee</h3>
        <div className="ar-grid">{oc.map((m, i) => (
          <button key={m.key} className={"ar-m " + (m.tier === "Executive" ? "x" : "h")} style={{ "--rr": [-.7,.5,-.3,.8,-.5,.4][i % 6] + "deg" }} onClick={() => openMember(m.key)}>
            <span className={"ph " + (m.photo ? "" : "tex")} style={{ "--ar": "4/5" }}>{m.photo ? <img src={m.photo} alt={m.name} /> : <i>{initials(m.name)}</i>}</span><b>{m.name}</b><em>{m.role}</em></button>))}</div>
      </div></div>}
    </section>
  );
}

function Events({ openEvent }) {
  const g = { past: [], live: [], upcoming: [] };
  [...events].sort((a, b) => new Date(a.start) - new Date(b.start)).forEach(e => g[status(e)].push(e));
  return (
    <section className="route visible" id="events">
      <PageTitle kicker="Events" frame="FRAME 05/36" title="Shoots, screenings, workshops." />
      <div className="wrap pad">
        {["past", "live", "upcoming"].filter(k => g[k].length).map(k => (
          <div key={k} className={"ev-group ev-" + k}><div className="ev-group-head">{k}</div>
            {g[k].map(ev => (
              <div className="event-row" key={ev.id} tabIndex={0} onClick={() => openEvent(ev.id)}>
                <div className="date">{fmtDate(ev.start)}</div>
                <div><h3>{ev.t}{k === "live" && <span className="live-badge-inline"><span className="live-dot" />Live</span>}</h3><p>{ev.p}</p></div>
                <div className="tag">{ev.tag}</div></div>))}
          </div>))}
      </div>
    </section>
  );
}

function EventDetail({ id, back }) {
  const ev = events.find(e => e.id === id);
  return (
    <section className="route visible" id="event"><div className="wrap" style={{ paddingTop: 130, paddingBottom: 60 }}>
      <a className="mg-back" href="#events" onClick={e => { e.preventDefault(); back(); }}>← Back</a>
      {!ev ? <p className="mg-empty">Event not found.</p> : <>
        <div className="ev-detail-head"><span className="ev-detail-date">{fmtDate(ev.start)}</span>
          {status(ev) === "live" && <span className="live-badge-inline"><span className="live-dot" />Live</span>}
          <b className="ev-detail-title">{ev.t}</b><span className="ev-detail-tag">{ev.tag}</span></div>
        <p className="ev-detail-desc">{ev.desc || ev.p}</p>
        {ev.highlights && <ul className="ev-highlights">{ev.highlights.map(h => <li key={h}>{h}</li>)}</ul>}
        {ev.photos && <div className="masonry">{ev.photos.map((s, i) => <div className="g-tile" key={i}><img src={s} alt="" style={{ width: "100%", display: "block", borderRadius: 8 }} /></div>)}</div>}
      </>}
    </div></section>
  );
}

function Member({ m, back }) {
  const [fl, toggleFl] = useFollow(m ? m.key : "");
  if (!m) return <section className="route visible" id="member"><div className="wrap" style={{ paddingTop: 130 }}><a className="mg-back" href="#team" onClick={back}>← Back</a><p className="mg-empty">Member not found.</p></div></section>;
  const side = m.side || ([...m.name].reduce((a, c) => a + c.charCodeAt(0), 0) % 2 ? "right" : "left");
  const own = portfolio.filter(p => p.m === m.name), first = m.name.trim().split(/\s+/);
  const data = Object.values(team).flat().find(x => x.n === m.name);
  const sd = data && data.side || side;
  return (
    <section className="route visible" id="member"><div className={"mp hero " + sd + (m.photo ? " has-photo" : " no-photo")}><div className="mp-stage">
      <aside className="mp-info" role="img" aria-label={m.name + " — portrait"} style={m.photo ? { backgroundImage: `url(${m.photo})` } : {}}>
        {!m.photo && <i className="mp-ini" aria-hidden="true">{initials(m.name)}</i>}
        <a className="mg-back" href="#team" onClick={back}>← Back</a>
        <div className="mp-id"><div className="mp-photo">{!m.photo && <i>{initials(m.name)}</i>}</div><div className="mp-text">
          <span className="mp-k">MEDIA CLUB · {m.role}</span>
          <h1 className="mp-name">{first[0]}{first.length > 1 && <><br /><em>{first.slice(1).join(" ")}</em></>}</h1>
          {m.bio && <p className="mp-bio">{m.bio}</p>}
          <div className="mp-meta">{m.cam && <span><small>Camera</small>{m.cam}</span>}<span><small>Frames</small>{own.length}</span></div>
          <div className="mp-soc">{m.insta && <a className="insta-link" href={"https://instagram.com/" + m.insta} target="_blank" rel="noopener">{IG}@{m.insta}</a>}<button type="button" className="sx-share" title="Share With Us" aria-label="Share With Us" onClick={async () => { const u = location.href.split("#")[0] + "#member=" + encodeURIComponent("seed:" + m.key); try { if (navigator.share) await navigator.share({ title: m.name + " — Media Club", text: m.bio, url: u }); else { await navigator.clipboard.writeText(u); alert("Link copied"); } } catch {} }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg></button><button type="button" className={"fl-btn" + (fl ? " on" : "")} aria-label={"Follow " + m.name} onClick={toggleFl}>{BELL}<span>{fl ? "Following" : "Follow"}</span></button></div></div></div>
      </aside>
      <div className="mp-work">{own.length ? <div className="masonry">{own.map((p, i) => <div className="g-tile" key={i} style={{ animationDelay: (i % 8) * .04 + "s" }}><div className="tex" style={{ aspectRatio: aspects[i % 7] }} /><div className="g-cap"><span className="g-by">{p.t}</span></div></div>)}</div>
        : <p className="mg-empty">No photos here yet — nothing on file for this person yet.</p>}</div>
    </div></div></section>
  );
}

function Gallery() {
  const cats = ["All","Events","Concert","Sports","Nature","Portrait","Street","Product","Film","Other"], sorts = ["Latest","Featured","Random"];
  const icons = { All:"◎",Events:"✦",Concert:"♪",Sports:"●",Nature:"❧",Portrait:"☺",Street:"▲",Product:"▦",Film:"▸",Other:"ƒ" };
  const [cat, setCat] = useState("All"), [sort, setSort] = useState("Latest"), [drop, setDrop] = useState(false);
  useEffect(() => { const c = e => !e.target.closest(".gal-filter-wrap") && setDrop(false); document.addEventListener("click", c); return () => document.removeEventListener("click", c); }, []);
  return (
    <section className="route visible" id="gallery">
      <div className="section-head page-title">
        <div className="sec-head"><div className="kicker">LIVE GALLERY <span className="live-dot" /><span className="live-txt">LIVE</span></div><span className="frame-tag">FRAME 04B/36</span></div>
        <h2 className="sec">The archive.</h2>
        <div className="title-actions"><div className="gal-filter-wrap">
          <button type="button" id="galFilterBtn" aria-expanded={drop} onClick={() => setDrop(d => !d)}>
            <svg viewBox="0 0 24 24"><path d="M4 5h16l-6.5 7.5V19l-3 2v-8.5z" /></svg><span>{cat + (sort !== "Latest" ? " · " + sort : "")}</span></button>
          {drop && <div className="gal-drop"><h5>Category</h5><div className="filters g-filters">{cats.map(c => <button key={c} className={c === cat ? "active" : ""} onClick={() => setCat(c)}><span className="ico">{icons[c]}</span>{c}</button>)}</div>
            <h5>Sort</h5><div className="filters g-sorts">{sorts.map(s => <button key={s} className={s === sort ? "active" : ""} onClick={() => setSort(s)}>{s}</button>)}</div></div>}
        </div></div>
      </div>
      <div id="galleryMount">{cat === "All" && aspects.map((a, i) => (
        <div className="g-tile" key={i} style={{ animationDelay: i * 0.04 + "s" }}><div className="tex" style={{ aspectRatio: a }} /><div className="g-cap"><span className="g-by">MEDIA CLUB — ARCHIVE SHOT</span></div></div>))}</div>
    </section>
  );
}

function Form({ fields, button, done }) {
  const [sent, setSent] = useState(false);
  return (
    <form onSubmit={e => { e.preventDefault(); setSent(true); }}>
      {fields.map(([label, type, req, opts]) => (
        <div className="field" key={label}><label>{label}</label>
          {type === "textarea" ? <textarea required={req} /> : type === "select" ? <select>{opts.map(o => <option key={o}>{o}</option>)}</select> : <input required={req} type={type} placeholder={opts} />}</div>))}
      <button className="submit-btn" type="submit">{button}</button>
      <p className={"confirm" + (sent ? " show" : "")}>{done}</p>
    </form>
  );
}

export default function App() {
  const read = () => { const h = location.hash.slice(1) || "home"; return h.startsWith("member=") ? "member" : h; };
  const [route, setRoute] = useState(read), [ev, setEv] = useState(null), [member, setMember] = useState(() => { const h = decodeURIComponent(location.hash.slice(1)); return h.startsWith("member=seed:") ? h.slice(12) : null; }), [filter, setFilter] = useState("All");
  const [dark, setDark] = useState(() => { try { return (localStorage.getItem("raw_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark"; } catch { return false; } });
  const cur = useRef(null), lab = useRef(null), [bell, setBell] = useState(false);
  const go = r => { history.pushState(null, "", "#" + r); setRoute(r); scrollTo(0, 0); };
  const openEvent = id => { setEv(id); go("event"); };
  const openMember = k => { setMember(k); go("member"); };
  useEffect(() => { const p = () => setRoute(read()); addEventListener("popstate", p); return () => removeEventListener("popstate", p); }, []);
  useEffect(() => { const c = () => setBell(false); document.addEventListener("click", c); return () => document.removeEventListener("click", c); }, []);
  useEffect(() => { startStickman(); }, []);
  useEffect(() => { document.body.classList.toggle("on-member", route === "member"); }, [route]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; const mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.content = dark ? "#0f0f10" : "#ffffff"; try { localStorage.setItem("raw_theme", dark ? "dark" : "light"); } catch {} }, [dark]);
  useEffect(() => {
    let x = 0, y = 0, t = null, raf = 0;
    const frame = () => { raf = 0; if (!cur.current) return;
      cur.current.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      const el = t && t.nodeType === 1 && t.isConnected ? t : null;
      const photo = el ? el.closest(".mtile,.g-tile,button.pc,.ar-m") : null, gen = photo || (el ? el.closest("a,button,input,textarea,select") : null);
      document.body.classList.toggle("cursor-hover", !!gen); document.body.classList.toggle("cursor-label", !!photo);
      if (lab.current) lab.current.textContent = photo ? (el.closest("button.pc") ? "OPEN" : "VIEW") : ""; };
    const mv = e => { x = e.clientX; y = e.clientY; t = e.target; document.body.classList.remove("cur-out"); if (!raf) raf = requestAnimationFrame(frame); };
    const out = () => document.body.classList.add("cur-out"), show = () => document.body.classList.remove("cur-out");
    addEventListener("mousemove", mv, { passive: true }); document.documentElement.addEventListener("mouseleave", out); document.documentElement.addEventListener("mouseenter", show);
    addEventListener("blur", out); addEventListener("focus", show);
    return () => { removeEventListener("mousemove", mv); document.documentElement.removeEventListener("mouseleave", out); document.documentElement.removeEventListener("mouseenter", show); removeEventListener("blur", out); removeEventListener("focus", show); };
  }, []);
  const m = members.find(x => x.key === member);
  const nav = r => e => { e.preventDefault(); go(r); };
  return (
    <>
      <canvas id="bgCanvas" aria-hidden="true" /><div id="bgGrain" aria-hidden="true" />
      <div id="cursor" ref={cur}><svg width="22" height="22" viewBox="0 0 22 22">{["M1 6 L1 1 L6 1","M16 1 L21 1 L21 6","M21 16 L21 21 L16 21","M6 21 L1 21 L1 16"].map(d => <path key={d} className="bracket" d={d} />)}<circle className="dot" cx="11" cy="11" r="1.4" /></svg><span id="curLabel" ref={lab} /></div>
      <header>
        <a href="#home" className="logo" onClick={nav("home")} aria-label="Media Club — home"><img className="logo-icon" src={logo} alt="" /><b className="logo-t">MEDIA CLUB<span>Student Media Collective</span></b></a>
        <nav className="navlinks">{[...NAV, NAV_AUTH].map(([k, l]) => <a key={k} href={"#" + k} className={(route === k ? "active" : "") + (k === "dashboard" ? " nav-auth-link" : "")} onClick={nav(k)}>{l}</a>)}</nav>
        <div className="head-socials">
          <a href="https://instagram.com/" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" /></svg></a>
          <a href="https://linkedin.com/" target="_blank" rel="noopener" aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5zM3.5 9.75h3v10.75h-3V9.75zm6 0h2.88v1.47h.04c.4-.76 1.38-1.56 2.84-1.56 3.04 0 3.6 2 3.6 4.6v6.24h-3v-5.53c0-1.32-.02-3.02-1.84-3.02-1.84 0-2.12 1.44-2.12 2.92v5.63h-3V9.75z" /></svg></a>
        </div>
        <div className="nt-wrap">
          <button id="ntBell" aria-label="Notifications" aria-haspopup="true" aria-expanded={bell} onClick={e => { e.stopPropagation(); setBell(b => !b); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg><span className="nt-badge" hidden /></button>
          {bell && <div className="nt-drop"><h4>Notifications</h4><p className="nt-empty">Nothing new yet. Follow a member to get notified when they post.</p></div>}
        </div>
        <button id="themeBtn" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark} onClick={() => setDark(d => !d)}>
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" /></svg></button>
      </header>
      <main>
        <Home go={go} openEvent={openEvent} active={route === "home"} />
        {route === "about" && <section className="route visible" id="about"><PageTitle kicker="About" frame="FRAME 02/36" title="A collective." />
          <div className="wrap pad"><div className="about-grid"><div>
            <p>MEDIA CLUB began in 2020 with three people, one camera and a shared Google Drive. It has since become the campus's main source of event photography and short-form video, all of it made by members.</p>
            <p>Every piece is published with a byline. Your name stays on your work, in our archive, for as long as MEDIA CLUB exists.</p></div>
            <div className="pillars"><div className="pillar"><b>Photography</b><span>Event, portrait and street coverage</span></div><div className="pillar"><b>Film</b><span>Short docs, recap reels, after movies</span></div></div></div></div></section>}
        {route === "team" && <section className="route visible" id="team"><PageTitle kicker="Committee" frame="FRAME 03/36" title="The people behind the frames." />
          <div className="masonry">{members.map((x, i) => <Tile key={x.key} m={x} i={i} onOpen={openMember} />)}</div></section>}
        {route === "portfolio" && <section className="route visible" id="portfolio"><PageTitle kicker="Portfolio" frame="FRAME 04/36" title="Work by the members.">
          <div className="filters">{[["All","◎"],["Photography","ƒ"],["Film","▸"]].map(([c, ic]) => <button key={c} className={filter === c ? "active" : ""} onClick={() => setFilter(c)}><span className="ico">{ic}</span>{c}</button>)}</div></PageTitle>
          <div className="masonry">{members.filter(x => filter === "All" || x.cat === filter).map((x, i) => <Tile key={x.key} m={x} i={i} onOpen={openMember} />)}</div></section>}
        {route === "member" && <Member m={m} back={nav("team")} />}
        {route === "dashboard" && <section className="route visible" id="dashboard"><div className="wrap pad">
          <div className="page-title"><div className="sec-head"><div className="kicker">Dashboard</div><span className="frame-tag">FRAME 00/36</span></div><h2 className="sec">Sign in to open your dashboard.</h2></div>
          <div className="auth-tabs" role="tablist">{["Register", "Log in", "Subscribe"].map((t, i) => <button type="button" key={t} className={i === 0 ? "on" : ""}>{t}</button>)}</div>
          <div className="login-box"><p className="note">Member registration and login use single sign-on for identity — there's no separate password to manage. Open this page while signed in to set up your Crew Profile and access your dashboard. Subscribers can use the Subscribe tab on this page right away.</p></div></div></section>}
        {route === "gallery" && <Gallery />}
        {route === "events" && <Events openEvent={openEvent} />}
        {route === "event" && <EventDetail id={ev} back={() => go("events")} />}
        {route === "history" && <Studio openMember={openMember} />}
        {route === "connect" && <section className="route visible" id="connect"><PageTitle kicker="Connect" frame="FRAME 07/36" title="Join us, or just say hello." />
          <div className="wrap pad"><div className="connect-grid">
            <div className="connect-col"><h3 className="connect-h">Join</h3><p className="join-login">Already a member? <a href="#dashboard" onClick={nav("dashboard")}>Log in to your dashboard</a></p><div className="form-wrap">
              <Form button="Send application" done="Got it — applications are reviewed by the committee every Friday. We'll email you either way."
                fields={[["Full name","text",true],["Email","email",true],["Interested in","select",false,["Photography","Film","Not sure yet"]],["Link to your work (optional)","text",false,"Instagram, Drive folder, anything"],["Why do you want to join?","textarea",false]]} /></div></div>
            <div className="connect-col"><h3 className="connect-h">Contact</h3><div className="form-wrap">
              <p style={{ color: "var(--gray)", lineHeight: 1.7, marginBottom: 28 }}>Questions, collaborations or press: write to the committee directly. We reply within a few days during term.</p>
              <Form button="Send message" done="Message sent. Someone from the committee will get back to you."
                fields={[["Name","text",true],["Email","email",true],["Message","textarea",true]]} /></div></div>
          </div></div></section>}
      </main>
      {route !== "home" && <footer><div className="foot-grid">
        <div><h4>MEDIA CLUB</h4><p>Student media collective.<br />Est. 2020.</p></div>
        <div><h4>Explore</h4>{[["history","History"],["portfolio","Portfolio"],["gallery","Gallery"],["events","Events"]].map(([k, l]) => <a key={k} href={"#" + k} onClick={nav(k)}>{l}</a>)}</div>
        <div><h4>Connect</h4><a href="#connect" onClick={nav("connect")}>Connect</a><a href="#dashboard" className="nav-auth-link" onClick={nav("dashboard")}>Log in / Register</a></div></div>
        <div className="foot-bottom"><span>© 2025–26 MEDIA CLUB Student Media Collective</span><span>Made by members, for members</span></div></footer>}
    </>
  );
}
