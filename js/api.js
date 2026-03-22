// Proxied through Cloudflare Functions — API key stays server-side
const BASE_URL = '/api';

async function umamiGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());

  if (!res.ok) throw new Error(`Umami API ${res.status}: ${res.statusText}`);
  return res.json();
}

// --- Date range helpers ---

const RANGES = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

export function getDateRange(rangeKey) {
  const now = Date.now();
  const ms = RANGES[rangeKey] || RANGES['7d'];
  return { startAt: now - ms, endAt: now };
}

// --- API calls ---

export async function getWebsites() {
  const data = await umamiGet('/websites');
  return data.data || data;
}

export async function getActiveVisitors(websiteId) {
  const data = await umamiGet(`/websites/${websiteId}/active`);
  return data.visitors ?? data.x ?? 0;
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

export async function getSessions(websiteId, startAt, endAt, pageSize = 50) {
  const data = await umamiGet(`/websites/${websiteId}/sessions`, {
    startAt: startAt.toString(),
    endAt: endAt.toString(),
    pageSize: pageSize.toString(),
  });
  return data.data || data || [];
}

export async function getSessionActivity(websiteId, sessionId) {
  const data = await umamiGet(`/websites/${websiteId}/sessions/${sessionId}/activity`);
  return data.data || data || [];
}

export async function getEvents(websiteId, startAt, endAt) {
  const data = await umamiGet(`/websites/${websiteId}/events`, {
    startAt: startAt.toString(),
    endAt: endAt.toString(),
  });
  return data.data || data || [];
}

// Min session duration filter (ms)
export const MIN_SESSION_DURATION_MS = 5000;

export function filterBotSessions(sessions) {
  return sessions.filter(s => {
    // Filter by duration if available
    if (s.firstAt && s.lastAt) {
      const duration = new Date(s.lastAt) - new Date(s.firstAt);
      if (duration < MIN_SESSION_DURATION_MS) return false;
    }
    // Filter by views — single-view sessions under 5s are likely bots
    if (s.views === 1 && s.totaltime != null && s.totaltime < 5) return false;
    return true;
  });
}

// --- Demo data ---

const DEMO_EVENTS = [
  'scroll_50', 'scroll_75', 'scroll_100',
  'click_cta', 'click_nav', 'click_link',
  'form_focus', 'form_submit',
  'hover_card', 'hover_image',
  'video_play', 'video_pause',
  'copy_text', 'share_click',
  'dark_mode_toggle', 'accordion_open',
];

export function getDemoData() {
  return {
    website: { id: 'demo', name: 'Portfolio', domain: 'shaynelarocque.com' },
    active: 5,
    stats: {
      pageviews: 1284,
      visitors: 318,
      bounces: 142,
      totaltime: 74200,
    },
    pages: [
      { x: '/', y: 412 },
      { x: '/works', y: 187 },
      { x: '/works/district3-site', y: 134 },
      { x: '/works/district3-checkin', y: 89 },
      { x: '/works/district3-dibs', y: 67 },
      { x: '/works/briefbot', y: 102 },
      { x: '/works/play/3d-analytics', y: 45 },
      { x: '/works/play/checkplease', y: 38 },
      { x: '/works/play/occasionaltranspo', y: 29 },
      { x: '/works/play/nasty-savings', y: 22 },
      { x: '/works/play/large-lithic-maker', y: 17 },
      { x: '/works/play/markdowntopdf', y: 12 },
      { x: '/history', y: 93 },
      { x: '/connect', y: 54 },
    ],
  };
}

// Generate synthetic sessions with journeys + events for demo mode
// startAt/endAt are ms timestamps for distributing sessions across the range
export function generateDemoSessions(pages, count = 15, startAt = null, endAt = null) {
  const sessions = [];
  const rangeStart = startAt || (Date.now() - 7 * 86400000);
  const rangeEnd = endAt || Date.now();
  const rangeMs = rangeEnd - rangeStart;

  for (let i = 0; i < count; i++) {
    const numSteps = 1 + Math.floor(Math.random() * 4);
    const shuffled = [...pages].sort(() => Math.random() - 0.5);
    const steps = [];

    for (let s = 0; s < Math.min(numSteps, shuffled.length); s++) {
      const duration = 5 + Math.random() * 25; // 5-30s visual time
      const numEvents = Math.floor(Math.random() * 4);
      const events = [];

      for (let e = 0; e < numEvents; e++) {
        events.push({
          name: DEMO_EVENTS[Math.floor(Math.random() * DEMO_EVENTS.length)],
          at: Math.random(),
        });
      }
      events.sort((a, b) => a.at - b.at);

      steps.push({ page: shuffled[s].x, duration, events });
    }

    // Distribute spawn times across the date range
    const spawnAt = rangeStart + Math.random() * rangeMs;

    sessions.push({ id: `demo-${i}`, steps, spawnAt });
  }

  // Bot sessions
  for (let i = 0; i < 5; i++) {
    sessions.push({
      id: `bot-${i}`,
      isBot: true,
      spawnAt: rangeStart + Math.random() * rangeMs,
      steps: [{
        page: pages[Math.floor(Math.random() * pages.length)].x,
        duration: 1 + Math.random() * 3,
        events: [],
      }],
    });
  }

  // Sort by spawn time so timeline can process in order
  sessions.sort((a, b) => a.spawnAt - b.spawnAt);

  return sessions;
}
