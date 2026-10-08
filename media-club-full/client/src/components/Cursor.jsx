import { useEffect, useRef } from 'react';

// Spinning-aperture custom cursor, ported 1:1 from the original site.
export default function Cursor() {
  const ref = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    const cur = ref.current;
    const curLabel = labelRef.current;
    let curX = 0, curY = 0, curT = null, curRaf = 0, curLbl = '';
    function curFrame() {
      curRaf = 0;
      cur.style.transform = `translate3d(${curX}px,${curY}px,0) translate(-50%,-50%)`;
      const t = (curT && curT.nodeType === 1 && curT.isConnected) ? curT : null;
      const photo = t ? t.closest('.mtile,.g-tile,button.pc,.ar-m') : null;
      const generic = photo || (t ? t.closest('a,button,input,textarea,select') : null);
      document.body.classList.toggle('cursor-hover', !!generic);
      document.body.classList.toggle('cursor-label', !!photo);
      const lbl = photo ? (t.closest('button.pc') ? 'OPEN' : 'VIEW') : '';
      if (lbl !== curLbl) { curLbl = lbl; curLabel.textContent = lbl; }
    }
    function curKick() { if (!curRaf) curRaf = requestAnimationFrame(curFrame); }
    const onMove = (e) => { curX = e.clientX; curY = e.clientY; curT = e.target; curKick(); };
    const hideCur = () => document.body.classList.add('cur-out');
    const showCur = () => document.body.classList.remove('cur-out');
    const onOut = (e) => { if (!e.relatedTarget && !e.toElement) hideCur(); };
    const onOver = (e) => { if (!e.relatedTarget && !e.fromElement) showCur(); };
    const onVis = () => { document.hidden ? hideCur() : showCur(); };
    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', hideCur);
    document.documentElement.addEventListener('mouseenter', showCur);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mouseover', onOver);
    window.addEventListener('blur', hideCur);
    window.addEventListener('focus', showCur);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', hideCur);
      document.documentElement.removeEventListener('mouseenter', showCur);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mouseover', onOver);
      window.removeEventListener('blur', hideCur);
      window.removeEventListener('focus', showCur);
      document.removeEventListener('visibilitychange', onVis);
      cancelAnimationFrame(curRaf);
    };
  }, []);

  return (
    <div id="cursor" ref={ref}>
      <svg viewBox="0 0 22 22" width="22" height="22">
        <path className="bracket" d="M1 6 L1 1 L6 1" />
        <path className="bracket" d="M16 1 L21 1 L21 6" />
        <path className="bracket" d="M21 16 L21 21 L16 21" />
        <path className="bracket" d="M6 21 L1 21 L1 16" />
        <circle cx="11" cy="11" r="1.4" className="dot" />
      </svg>
      <span id="curLabel" ref={labelRef}></span>
    </div>
  );
}
