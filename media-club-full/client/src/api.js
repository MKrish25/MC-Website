// API Client supporting both local development and Vercel -> Render cross-origin deployment.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export async function api(method, path, body) {
  const token = localStorage.getItem('mc_token');
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  
  // Persist token across sessions if returned by auth endpoints
  if (data && data.token) {
    localStorage.setItem('mc_token', data.token);
  }
  
  return data;
}

export const AuthAPI = {
  me: () => api('GET', '/auth/me'),
  login: async (email, password) => {
    const data = await api('POST', '/auth/login', { email, password });
    if (data.token) localStorage.setItem('mc_token', data.token);
    return data;
  },
  register: async (email, password) => {
    const data = await api('POST', '/auth/register', { email, password });
    if (data.token) localStorage.setItem('mc_token', data.token);
    return data;
  },
  logout: async () => {
    localStorage.removeItem('mc_token');
    return api('POST', '/auth/logout');
  },
  forgot: (email) => api('POST', '/auth/forgot', { email }),
  resetVerify: (token) => api('POST', '/auth/reset/verify', { token }),
  reset: (token, password) => api('POST', '/auth/reset', { token, password }),
};

export const SiteAPI = {
  members: () => api('GET', '/members'),
  events: () => api('GET', '/events'),
  posts: () => api('GET', '/posts'),
  stats: () => api('GET', '/stats'),
  site: () => api('GET', '/site'),
  activity: () => api('GET', '/activity'),
  profile: () => api('GET', '/profile'),
  saveProfile: (profile) => api('PUT', '/profile', profile),
  applications: (d) => api('POST', '/applications', d),
  messages: (d) => api('POST', '/messages', d),
};

export const SocialAPI = {
  get: (pid) => api('GET', `/social/${pid}`),
  like: (pid, extra) => api('POST', `/social/${pid}/like`, extra || {}),
  comment: (pid, text, extra) => api('POST', `/social/${pid}/comments`, { text, ...(extra || {}) }),
  reply: (pid, cid, text, extra) => api('POST', `/social/${pid}/comments/${cid}/replies`, { text, ...(extra || {}) }),
  delComment: (pid, cid) => api('DELETE', `/social/${pid}/comments/${cid}`),
  delReply: (pid, cid, rid) => api('DELETE', `/social/${pid}/comments/${cid}/replies/${rid}`),
};

export const FollowAPI = {
  list: () => api('GET', '/follows'),
  follow: (member_id) => api('POST', '/follows', { member_id }),
  unfollow: (memberId) => api('DELETE', `/follows/${memberId}`),
  notifications: () => api('GET', '/notifications'),
  markRead: (ids) => api('POST', '/notifications/read', ids ? { ids } : {}),
};

export const AdminAPI = {
  overview: () => api('GET', '/admin/overview'),
  galleryAction: (id, action) => api('POST', `/admin/gallery/${id}/${action}`),
  feature: (id) => api('POST', `/admin/gallery/${id}/feature`),
  setRole: (id, role) => api('POST', `/admin/users/${id}/role`, { role }),
  approveUser: (id) => api('POST', `/admin/users/${id}/approve`),
  rejectUser: (id) => api('POST', `/admin/users/${id}/reject`),
  setStatus: (id, status) => api('POST', `/admin/users/${id}/status`, { status }),
  deleteUser: (id) => api('DELETE', `/admin/users/${id}`),
  deleteGallery: (id) => api('DELETE', `/admin/gallery/${id}`),
  createUser: (d) => api('POST', '/admin/users', d),
  updateUserProfile: (id, profile) => api('PUT', `/admin/users/${id}/profile`, profile),
  saveSite: (pages) => api('PUT', '/admin/site', { pages }),
  createEvent: (ev) => api('POST', '/events', ev),
  updateEvent: (id, ev) => api('PUT', `/events/${id}`, ev),
  deleteEvent: (id) => api('DELETE', `/events/${id}`),
  createPost: (p) => api('POST', '/posts', p),
  updatePost: (id, p) => api('PUT', `/posts/${id}`, p),
  deletePost: (id) => api('DELETE', `/posts/${id}`),
};
