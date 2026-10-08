import { useSyncExternalStore } from 'react';

// Subscriber identity: a lightweight, device-local account (username + email +
// password) for people who aren't Media Club members. Same localStorage keys
// as the original site so identities carry over. Likes/comments from
// subscribers are stored per-photo on this device (key raw_sx_ph_<pid>).
// Backend members always use the server social API instead (see Lightbox).

function lsGet(k, def) {
  try {
    const v = localStorage.getItem('raw_sx_' + k);
    return v ? JSON.parse(v) : def;
  } catch (_) { return def; }
}
function lsSet(k, v) {
  try { localStorage.setItem('raw_sx_' + k, JSON.stringify(v)); } catch (_) {}
}

let dev = lsGet('dev', null);
if (!dev) { dev = 'd' + Math.random().toString(36).slice(2, 10); lsSet('dev', dev); }

export const subUid = () => dev;
export const slugU = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const TE = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPass(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', TE.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return { s: b64(salt), i: 120000, h: b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256)) };
}
export async function verifyPass(pw, stored) {
  if (!stored || !stored.s || !stored.h) return false;
  try {
    const key = await crypto.subtle.importKey('raw', TE.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(stored.s), iterations: stored.i || 120000, hash: 'SHA-256' }, key, 256)) === stored.h;
  } catch (_) { return false; }
}

const acctKey = () => 'sub_' + subUid();
export const getAcct = () => lsGet(acctKey(), null);
export const setAcct = (a) => lsSet(acctKey(), a);

let session = lsGet('session', false);
export const hasSession = () => !!session;
export const setSession = (v) => { session = !!v; lsSet('session', session); bump(); };

// Username reservation so two browsers don't claim the same handle.
export async function claim(u) {
  const cur = lsGet('un_' + u, null);
  if (cur && cur.uid !== subUid()) return false;
  lsSet('un_' + u, { uid: subUid() });
  return true;
}

// The signed-in subscriber, if any (backend members are handled separately).
export function subMe() {
  const acct = getAcct();
  return acct && session ? { u: acct.username, name: acct.username, member: false } : null;
}

// Per-photo local social store: { likes: [uid], comments: [{id,uid,u,text,t,replies}] }.
export function loadPhoto(pid) {
  const d = lsGet('ph_' + pid, null);
  return { likes: (d && d.likes) || [], comments: (d && d.comments) || [] };
}
export function savePhoto(pid, d) {
  lsSet('ph_' + pid, { likes: d.likes || [], comments: d.comments || [] });
}
export const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

// React binding: re-render on sign in/out or account change.
let version = 0;
const listeners = new Set();
function bump() {
  version += 1;
  listeners.forEach((l) => { try { l(); } catch (_) {} });
}
export function touchSub() { bump(); }
export function useSubscriber() {
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => version
  );
  return subMe();
}
