/* Connects media-club-minimal.html to the backend without rewriting the page.
   - provides window.claude.use('user'|'db') the page already expects
   - replaces the "sign in with Claude" screen with email/password login + register
   - syncs public members, events and journal posts from the server
   - sends the Join and Contact forms to the API */
(function () {
  const api = async (method, url, body) => {
    const res = await fetch('/api' + url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let data = {}; try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
    return data;
  };
  window.__api = api;
  let me = null;
  const loadMe = async () => { try { me = (await api('GET', '/auth/me')).user; } catch (_) { me = null; } return me; };

  window.claude = {
    use: async (ns) => {
      if (ns === 'user') return { id: async () => (await loadMe(), me ? me.id : null), me: async () => me };
      if (ns === 'db') return {
        doc: () => ({
          get: async () => {
            try { const { profile } = await api('GET', '/profile'); return { exists: !!profile, data: () => profile }; }
            catch (e) { if (String(e.message).includes('Awaiting')) return { exists: false, data: () => null, pending: true }; throw e; }
          },
          set: async (data) => { const out = await api('PUT', '/profile', data); window.__publicSync && window.__publicSync(); return out; }
        })
      };
      throw new Error('unknown namespace');
    }
  };

  /* ---- public data -> the localStorage keys the page already renders from ---- */
  async function publicSync() {
    try {
      const [{ members }, { events }, { posts }] = await Promise.all([api('GET', '/members'), api('GET', '/events'), api('GET', '/posts')]);
      // live club stats: registered active accounts, approved frames, years since 2020
      try {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
        let live = null;
        try { live = (await api('GET', '/stats')).stats || null; } catch (_) { live = null; }
        if (live) { set('dkM', live.members); set('dkF', live.frames); set('dkY', live.years); }
        else {
          set('dkM', members.length);
          set('dkF', members.reduce((a, m) => a + ((m.gallery || []).length), 0));
          set('dkY', Math.max(0, new Date().getFullYear() - 2020));
        }
      } catch (_) {}
      for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.indexOf('raw_profile_') === 0) localStorage.removeItem(k); }
      members.forEach(m => { try { localStorage.setItem('raw_profile_' + m.id, JSON.stringify(m)); } catch (_) {} });
      localStorage.setItem('raw_local_events', JSON.stringify(events));
      localStorage.setItem('raw_local_posts', JSON.stringify(posts));
      if (typeof __profileCache !== 'undefined') members.forEach(m => { if (!me || m.id !== me.id) __profileCache[m.id] = m; });
      ['renderTeam', 'renderEvents', 'renderBlog', 'renderHomeUpcoming'].forEach(f => { try { window[f] && window[f](); } catch (_) {} });
      try { renderPortfolio('All'); renderGallery(); } catch (_) {}
      // If the page was opened directly on an event/member link before the
      // sync finished, it rendered "not found" — re-render it with live data.
      try {
        if (location.hash === '#event' && window.__activeEventKey && window.renderEventDetail) window.renderEventDetail(window.__activeEventKey);
        if (location.hash.indexOf('#member') === 0 && window.__activeMemberKey && window.renderMemberGallery) window.renderMemberGallery(window.__activeMemberKey);
      } catch (_) {}
      try { window.__applyPages && window.__applyPages(); } catch (_) {}
    } catch (e) { console.warn('public sync failed', e); }
  }
  window.__publicSync = publicSync;

  /* ---- sign-in screen ---- */
  let mode = 'login';
  let pendingTimer = null;
  function stopPendingPoll() { if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; } }
  async function checkApproval(silent) {
    await loadMe();
    if (me && me.status !== 'pending') {
      stopPendingPoll();
      __loggedIn = true;
      try { await initAuth(); } catch (_) {}
      await publicSync();
      renderDash();
      return true;
    }
    if (!silent) {
      const err = document.getElementById('pendingMsg');
      if (err) { err.textContent = 'Still awaiting approval — hang tight.'; err.style.display = 'block'; }
    }
    return false;
  }
  function pendingNotice() {
    const mount = document.getElementById('dashArea');
    if (!mount) return;
    stopPendingPoll();
    mount.innerHTML = `
      <div class="sec-head"><div class="kicker">Account</div><span class="frame-tag">FRAME 00/36</span></div>
      <h2 class="sec">Request received.</h2>
      <div class="login-box"><p class="note">Your account <b>${me ? me.email : ''}</b> is <b>awaiting admin approval</b>. Once an admin approves you, you will get your member slot.</p>
      <p class="note" id="pendingMsg" style="display:none;color:#137333;"></p>
      <button class="submit-btn" id="pendingCheck" type="button">I’ve been approved — continue</button>
      <p class="note">This page also checks on its own — you can just leave it open.</p>
      <button class="submit-btn" id="pendingOut" type="button" style="margin-top:10px;">Log out</button></div>`;
    document.getElementById('pendingCheck').addEventListener('click', () => checkApproval(false));
    const b = document.getElementById('pendingOut');
    if (b) b.addEventListener('click', async () => { stopPendingPoll(); try { await api('POST', '/auth/logout'); } catch (_) {} me = null; await initAuth(); renderDash(); });
    pendingTimer = setInterval(() => {
      if (!document.getElementById('pendingCheck')) { stopPendingPoll(); return; }
      checkApproval(true);
    }, 15000);
  }
  function authForm(notice) {
    const mount = document.getElementById('dashArea');
    if (!mount) return;
    const title = mode === 'admin' ? 'Admin sign in.' : mode === 'login' ? 'Log in to your dashboard.' : 'Create your account.';
    const submitLabel = mode === 'admin' ? 'Open admin panel' : mode === 'login' ? 'Log in' : 'Request member slot';
    const foot = mode === 'register'
      ? 'Registration needs admin approval. Use at least 8 characters.'
      : mode === 'admin'
        ? 'OC and admin only. Members: use Log in. New here? Register to request a member slot.'
        : 'New here? Switch to Register above to request a member slot.';
    mount.innerHTML = `
      <div class="sec-head"><div class="kicker">Account</div><span class="frame-tag">FRAME 00/36</span></div>
      <h2 class="sec">${title}</h2>
      ${notice ? `<div class="login-box"><p class="note" style="display:block;color:#137333;">${notice}</p></div>` : ''}
      <div class="auth-tabs"><button type="button" data-m="login" class="${mode === 'login' ? 'on' : ''}">Log in</button><button type="button" data-m="register" class="${mode === 'register' ? 'on' : ''}">Register</button><button type="button" data-m="admin" class="${mode === 'admin' ? 'on' : ''}">Admin</button></div>
      <div class="login-box">
        <form id="authForm">
          <div class="field"><label>Email</label><input id="a-email" type="email" required autocomplete="email"></div>
          <div class="field"><label>Password</label><input id="a-pass" type="password" required minlength="8" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}"></div>
          <button class="submit-btn" type="submit">${submitLabel}</button>
          <p class="note" id="a-err" style="display:none;color:#e0342c;"></p>
          <p class="note">${foot} <a href="/admin" style="text-decoration:underline;">Open admin panel →</a></p>
        </form>
      </div>`;
    mount.querySelectorAll('.auth-tabs button').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; authForm(); }));
    document.getElementById('authForm').addEventListener('submit', async e => {
      e.preventDefault();
      const err = document.getElementById('a-err'); err.style.display = 'none';
      try {
        const endpoint = mode === 'admin' ? '/auth/login' : '/auth/' + mode;
        const out = await api('POST', endpoint, { email: document.getElementById('a-email').value.trim(), password: document.getElementById('a-pass').value });
        if (out && (out.pending || out.status === 'pending')) {
          me = { email: document.getElementById('a-email').value.trim(), status: 'pending' };
          pendingNotice();
          return;
        }
        __loggedIn = true;
        await initAuth();
        await loadMe();
        if (me && me.status === 'pending') { pendingNotice(); return; }
        if (mode === 'admin') {
          if (!me) { err.textContent = 'Login failed'; err.style.display = 'block'; return; }
          if (me.role !== 'admin') { err.textContent = 'Not an admin account. Use Log in instead.'; err.style.display = 'block'; return; }
          window.location.href = '/admin';
          return;
        }
        // members who are actually admin get a shortcut
        if (me && me.role === 'admin') { window.location.href = '/admin'; return; }
        await publicSync();
        renderDash();
      } catch (ex) {
        if (String(ex.message).includes('Awaiting')) {
          await loadMe();
          pendingNotice();
          return;
        }
        err.textContent = ex.message; err.style.display = 'block';
      }
    });
  }

  window.addEventListener('load', () => {
    const orig = window.renderDash;
    window.renderDash = async function () {
      await loadMe();
      if (me && me.status === 'pending') return pendingNotice();
      if (typeof __authState !== 'undefined' && __authState === 'no-identity' && !me) return authForm();
      if (!me) return authForm();
      return orig.apply(this, arguments);
    };
    // Hold the first sync until the loader/reveal finishes: writing the whole
    // gallery + roster mid-zoom janks the entrance animation.
    const kick = () => { publicSync(); if (location.hash === '#dashboard') window.renderDash(); };
    if (!document.getElementById('loader')) { kick(); return; }
    const iv = setInterval(() => {
      if (!document.getElementById('loader')) { clearInterval(iv); clearTimeout(safety); setTimeout(kick, 350); }
    }, 150);
    const safety = setTimeout(() => { clearInterval(iv); kick(); }, 6000);
  });

  /* full sign-out (the page's own handler only hides the dashboard) */
  document.addEventListener('click', async e => {
    if (!e.target.closest('#logoutBtn')) return;
    try { await api('POST', '/auth/logout'); } catch (_) {}
    me = null; await initAuth(); await publicSync(); renderDash(); renderCrewCard();
  });

  /* ---- Join + Contact forms (capture phase so the page's demo handler is skipped) ---- */
  function wire(formId, confirmId, url, pick) {
    const f = document.getElementById(formId); if (!f) return;
    f.addEventListener('submit', async e => {
      e.preventDefault(); e.stopImmediatePropagation();
      const ok = document.getElementById(confirmId), orig = ok.textContent;
      try { await api('POST', url, pick(f)); ok.textContent = orig; ok.classList.add('show'); f.reset(); }
      catch (ex) { ok.textContent = ex.message; ok.classList.add('show'); }
    }, true);
  }
  wire('joinForm', 'joinConfirm', '/applications', f => { const i = f.querySelectorAll('input,textarea,select'); return { name: i[0].value, email: i[1].value, interest: i[2].value, link: i[3].value, message: i[4].value }; });
  wire('contactForm', 'contactConfirm', '/messages', f => { const i = f.querySelectorAll('input,textarea'); return { name: i[0].value, email: i[1].value, message: i[2].value }; });
})();
