import { useEffect, useMemo, useState } from 'react';
import { useSite } from '../store';
import Lightbox, { GalleryTile, normGalleryItem } from '../components/Lightbox';

const GAL_CATS = ['All', 'Events', 'Concert', 'Sports', 'Nature', 'Portrait', 'Street', 'Product', 'Film', 'Other'];
const GAL_ICONS = { All: '◎', Events: '✦', Concert: '♪', Sports: '●', Nature: '❧', Portrait: '☺', Street: '▲', Product: '▦', Film: '▸', Other: 'ƒ' };
const GAL_SORTS = ['Latest', 'Featured', 'Random'];
const SEED_ASPECTS = ['3/4', '1/1', '4/5', '2/3', '5/4', '1/1', '3/4'];

function ownerRole(m) {
  return m.insta ? '@' + String(m.insta).replace('@', '') : (m.role || m.role_ || '');
}

export default function Gallery() {
  const { members } = useSite();
  const [cat, setCat] = useState('All');
  const [sort, setSort] = useState('Latest');
  const [dropOpen, setDropOpen] = useState(false);
  const [sel, setSel] = useState(null);

  const visible = useMemo(() => {
    const all = [];
    (members || []).forEach((m) => {
      (m.gallery || []).forEach((raw, gi) => {
        const it = normGalleryItem(raw, (m.id || m.name || '') + gi);
        all.push({ it, by: m.name || 'Member', role: ownerRole(m), cat: it.category || 'Other', owner: { id: m.id, name: m.name, role: m.role || m.role_ || '' } });
      });
    });
    let filtered = all.filter((x) => cat === 'All' || x.cat === cat);
    if (sort === 'Latest') filtered = filtered.slice().sort((a, b) => new Date(b.it.uploadedAt || 0) - new Date(a.it.uploadedAt || 0));
    else if (sort === 'Featured') filtered = filtered.filter((x) => x.it.featured).concat(filtered.filter((x) => !x.it.featured));
    else if (sort === 'Random') filtered = filtered.slice().sort(() => Math.random() - 0.5);
    return filtered;
  }, [members, cat, sort]);

  const pick = (c) => { setCat(c); setSel(null); };
  const pickSort = (s) => { setSort(s); setSel(null); };
  const label = cat + (sort && sort !== 'Latest' ? ' · ' + sort : '');
  const multi = visible.length > 1;

  /* Match the vanilla dropdown: close on outside click and on Escape. */
  useEffect(() => {
    if (!dropOpen) return;
    const onDocClick = (e) => {
      if (!e.target.closest('.gal-filter-wrap')) setDropOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setDropOpen(false); };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropOpen]);

  const step = (d) => setSel((s) => (s == null ? s : (s + d + visible.length) % visible.length));
  const current = sel == null ? null : visible[sel];

  return (
    <>
      <div className="section-head page-title">
        <div className="sec-head">
          <div className="kicker">LIVE GALLERY <span className="live-dot" aria-hidden="true"></span><span className="live-txt">LIVE</span></div>
          <span className="frame-tag">FRAME 04B/36</span>
        </div>
        <h2 className="sec">The archive.</h2>
        <div className="title-actions">
          <div className="gal-filter-wrap">
            <button
              type="button" id="galFilterBtn" aria-haspopup="true" aria-expanded={dropOpen}
              aria-label="Filter and sort the archive"
              onClick={(e) => { e.stopPropagation(); setDropOpen((o) => !o); }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.5 7.5V19l-3 2v-8.5z" /></svg>
              <span id="galFilterLabel">{label}</span>
            </button>
            {dropOpen ? (
              <div className="gal-drop" id="galDrop">
                <h5>Category</h5>
                <div className="filters g-filters" id="galFilters">
                  {GAL_CATS.map((c) => (
                    <button key={c} data-cat={c} className={c === cat ? 'active' : ''} onClick={() => pick(c)}>
                      <span className="ico">{GAL_ICONS[c]}</span>{c}
                    </button>
                  ))}
                </div>
                <h5>Sort</h5>
                <div className="filters g-sorts" id="galSorts">
                  {GAL_SORTS.map((s) => (
                    <button key={s} data-sort={s} className={s === sort ? 'active' : ''} onClick={() => pickSort(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {/* #galleryMount is itself the masonry grid (see .masonry,#galleryMount
          in CSS): seed archive tiles render only on All, then uploads in order,
          exactly like the vanilla renderGallery. No empty-state — the original
          renders nothing when a filter has no uploads. */}
      <div id="galleryMount">
        {cat === 'All' ? SEED_ASPECTS.map((r, i) => (
          <div className="g-tile" key={'seed-' + i} style={{ animationDelay: `${i * 0.04}s` }}>
            <div className="tex" style={{ aspectRatio: r }}></div>
            <div className="g-cap"><span className="g-by">MEDIA CLUB — ARCHIVE SHOT</span></div>
          </div>
        )) : null}
        {visible.map((x, i) => (
          <GalleryTile key={x.it.id || i} entry={x} index={i} onOpen={setSel} />
        ))}
      </div>
      {current ? (
        <Lightbox
          item={current.it} owner={current.owner}
          onClose={() => setSel(null)}
          onPrev={() => step(-1)} onNext={() => step(1)}
          hasPrev={multi} hasNext={multi}
        />
      ) : null}
    </>
  );
}
