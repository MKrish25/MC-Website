import { Link } from 'react-router-dom';
import { useSite } from '../store';

// Mirrors the original: admin-hidden pages disappear from the footer too
// (original hides every [data-nav] link, nav + footer alike).
export default function Footer({ className = '' }) {
  const { me, hiddenPages } = useSite();
  const hidden = (p) => hiddenPages.includes(p);
  const authLabel = me ? 'Dashboard' : 'Register';

  return (
    <footer className={className}>
      <div className="foot-grid">
        <div className="foot-intro">
          <h4>MEDIA CLUB</h4>
          <p>Student media collective.<br />Est. 2020.</p>
          <div className="foot-socials" aria-label="Media Club social links">
            <a href="https://instagram.com/" target="_blank" rel="noopener" aria-label="Media Club on Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" /></svg>
            </a>
            <a href="https://linkedin.com/" target="_blank" rel="noopener" aria-label="Media Club on LinkedIn">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5zM3.5 9.75h3v10.75h-3V9.75zm6 0h2.88v1.47h.04c.4-.76 1.38-1.56 2.84-1.56 3.04 0 3.6 2 3.6 4.6v6.24h-3v-5.53c0-1.32-.02-3.02-1.84-3.02-1.84 0-2.12 1.44-2.12 2.92v5.63h-3V9.75z" /></svg>
            </a>
          </div>
        </div>
        <div>
          <h4>Explore</h4>
          {!hidden('history') && <Link to="/history">History</Link>}
          {!hidden('portfolio') && <Link to="/portfolio">Portfolio</Link>}
          {!hidden('gallery') && <Link to="/gallery">Gallery</Link>}
          {!hidden('events') && <Link to="/events">Events</Link>}
        </div>
        <div>
          <h4>Connect</h4>
          {!hidden('connect') && <Link to="/connect">Connect</Link>}
          <Link to="/dashboard" className="nav-auth-link">{authLabel}</Link>
        </div>
      </div>
      <div className="foot-bottom">
        <span>© 2025–26 MEDIA CLUB Student Media Collective</span>
        <span>Made by members, for members</span>
      </div>
    </footer>
  );
}
