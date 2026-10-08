import { useEffect } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SiteProvider, useSite } from './store';
import Header from './components/Header';
import Cursor from './components/Cursor';
import Loader from './components/Loader';
import Footer from './components/Footer';
import { initBg } from './fx/bg';
// import { initStickman } from './fx/stickman'; // Kept for a future re-enable.
import Home from './pages/Home';
import About from './pages/About';
import Gallery from './pages/Gallery';
import Team from './pages/Team';
import Member from './pages/Member';
import Portfolio from './pages/Portfolio';
import Events from './pages/Events';
import EventDetail from './pages/EventDetail';
import History from './pages/History';
import Connect from './pages/Connect';
import Dashboard from './pages/Dashboard';
import Reset from './pages/Reset';
import Admin from './pages/Admin';

// Old-style links (#gallery, #member=<key>, #reset/<token>, #event) keep working.
function LegacyRedirect() {
  const loc = useLocation();
  useEffect(() => {
    const h = window.location.hash;
    if (h && !h.startsWith('#/')) {
      const raw = h.slice(1) || 'home';
      let to = null;
      if (raw.startsWith('member=')) to = '/member/' + encodeURIComponent(decodeURIComponent(raw.slice(7)));
      else if (raw === 'reset' || raw.startsWith('reset/')) to = '/' + raw;
      else if (raw === 'event') to = '/events';
      else if (/^(home|about|gallery|team|portfolio|events|history|connect|dashboard|admin)$/.test(raw)) to = '/' + raw;
      if (to) window.location.hash = '#' + to;
    }
  }, [loc]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function RouteView({ id, children }) {
  const { hiddenPages } = useSite();
  // Server page keys use 'history'; this route's section id is 'studioPage' (original alias).
  const key = id === 'studioPage' ? 'history' : id;
  if (hiddenPages.includes(key)) return <Navigate to="/home" replace />;
  return <section className="route visible" id={id}>{children}</section>;
}

function Shell() {
  const { pathname } = useLocation();
  useEffect(() => { initBg(); }, []);
  // Stickman integration is intentionally disabled for now. The implementation
  // remains in ./fx/stickman so it can be restored later.
  // useEffect(() => {
  //   if (pathname !== '/home') return;
  //   const t = setTimeout(() => initStickman(), 80);
  //   return () => clearTimeout(t);
  // }, [pathname]);
  useEffect(() => {
    document.body.classList.toggle('on-member', pathname.startsWith('/member'));
  }, [pathname]);
  return (
    <>
      <Loader />
      <canvas id="bgCanvas" aria-hidden="true"></canvas>
      <div id="bgGrain" aria-hidden="true"></div>
      <div id="memberPopup" className="member-popup"></div>
      <Cursor />
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<RouteView id="home"><Home /></RouteView>} />
          <Route path="/about" element={<RouteView id="about"><About /></RouteView>} />
          <Route path="/gallery" element={<RouteView id="gallery"><Gallery /></RouteView>} />
          <Route path="/team" element={<RouteView id="team"><Team /></RouteView>} />
          <Route path="/member/:id" element={<RouteView id="member"><Member /></RouteView>} />
          <Route path="/portfolio" element={<RouteView id="portfolio"><Portfolio /></RouteView>} />
          <Route path="/events" element={<RouteView id="events"><Events /></RouteView>} />
          <Route path="/events/:id" element={<RouteView id="event"><EventDetail /></RouteView>} />
          <Route path="/history" element={<RouteView id="studioPage"><History /></RouteView>} />
          <Route path="/connect" element={<RouteView id="connect"><Connect /></RouteView>} />
          <Route path="/dashboard" element={<RouteView id="dashboard"><Dashboard /></RouteView>} />
          <Route path="/reset" element={<RouteView id="reset"><Reset /></RouteView>} />
          <Route path="/reset/:token" element={<RouteView id="reset"><Reset /></RouteView>} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <SiteProvider>
      <HashRouter>
        <LegacyRedirect />
        <ScrollToTop />
        <Shell />
      </HashRouter>
    </SiteProvider>
  );
}
