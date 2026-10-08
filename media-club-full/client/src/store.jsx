import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthAPI, SiteAPI } from './api';

const SiteContext = createContext(null);
export const useSite = () => useContext(SiteContext);

// Replaces the old shim.js publicSync + localStorage cache:
// single source of truth for public data + the signed-in user.
export function SiteProvider({ children }) {
  const [me, setMe] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState(null);
  const [hiddenPages, setHiddenPages] = useState([]);
  const [myProfile, setMyProfile] = useState(null);

  const refreshMe = useCallback(async () => {
    try {
      const { user } = await AuthAPI.me();
      setMe(user);
      if (user && user.status !== 'pending') {
        try {
          const { profile } = await SiteAPI.profile();
          setMyProfile(profile);
        } catch (_) { setMyProfile(null); }
      } else {
        setMyProfile(null);
      }
    } catch (_) { setMe(null); setMyProfile(null); }
    setAuthChecked(true);
  }, []);

  const refreshPublic = useCallback(async () => {
    let freshMembers = null;
    try {
      const [{ members: m }, { events: e }, { posts: p }] = await Promise.all([
        SiteAPI.members(), SiteAPI.events(), SiteAPI.posts(),
      ]);
      freshMembers = m || [];
      setMembers(freshMembers); setEvents(e || []); setPosts(p || []);
    } catch (_) {}
    const fallbackStats = (list) => ({
      members: list.length,
      frames: list.reduce((a, m) => a + ((m.gallery || []).length), 0),
      years: Math.max(0, new Date().getFullYear() - 2020),
    });
    try {
      const { stats: s } = await SiteAPI.stats();
      if (s) setStats(s);
      else if (freshMembers) setStats(fallbackStats(freshMembers));
    } catch (_) {
      setStats((prev) => prev || fallbackStats(freshMembers || []));
    }
    try {
      const { pages } = await SiteAPI.site();
      setHiddenPages(Object.entries(pages || {}).filter(([, v]) => !v).map(([k]) => k));
    } catch (_) {}
  }, []);

  useEffect(() => { refreshMe(); refreshPublic(); }, []);

  return (
    <SiteContext.Provider value={{
      me, setMe, authChecked, refreshMe,
      members, events, posts, stats, hiddenPages,
      myProfile, setMyProfile, refreshPublic,
    }}>
      {children}
    </SiteContext.Provider>
  );
}
