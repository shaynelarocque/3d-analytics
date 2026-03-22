// Proxied through Cloudflare Functions — API key stays server-side
const BASE_URL = '/api';

async function umamiGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());

  if (!res.ok) throw new Error(`Umami API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getWebsites() {
  const data = await umamiGet('/websites');
  return data.data || data;
}

export async function getActiveVisitors(websiteId) {
  const data = await umamiGet(`/websites/${websiteId}/active`);
  return data.x ?? data;
}

export async function getStats(websiteId, startAt, endAt) {
  return umamiGet(`/websites/${websiteId}/stats`, {
    startAt: startAt.toString(),
    endAt: endAt.toString(),
  });
}

export async function getMetrics(websiteId, type, startAt, endAt, limit = 20) {
  const data = await umamiGet(`/websites/${websiteId}/metrics`, {
    startAt: startAt.toString(),
    endAt: endAt.toString(),
    type,
    limit: limit.toString(),
  });
  return data || [];
}

// Demo data for when API is unavailable (CORS, etc.)
export function getDemoData() {
  return {
    website: { id: 'demo', name: 'Demo Site', domain: 'example.com' },
    active: 7,
    stats: {
      pageviews: { value: 1842 },
      visitors: { value: 423 },
      bounces: { value: 187 },
      totaltime: { value: 98400 },
    },
    pages: [
      { x: '/', y: 312 },
      { x: '/about', y: 87 },
      { x: '/blog', y: 201 },
      { x: '/blog/hello-world', y: 145 },
      { x: '/contact', y: 56 },
      { x: '/projects', y: 98 },
      { x: '/docs', y: 167 },
      { x: '/pricing', y: 73 },
    ],
    referrers: [
      { x: 'google.com', y: 234 },
      { x: 'twitter.com', y: 89 },
      { x: 'github.com', y: 156 },
      { x: '(direct)', y: 312 },
    ],
  };
}
