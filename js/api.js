// Proxied through Cloudflare Functions — API key stays server-side
const BASE_URL = '/api';

async function umamiGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const fullUrl = url.toString();
  console.log(`%c[API] GET ${path}`, 'color:#4fc3f7', params);
  const t0 = performance.now();

  const res = await fetch(fullUrl);
  const elapsed = (performance.now() - t0).toFixed(0);

  if (!res.ok) {
    console.error(`%c[API] ${res.status} ${res.statusText} (${elapsed}ms)`, 'color:#ff5252', fullUrl);
    throw new Error(`Umami API ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const size = JSON.stringify(data).length;
  console.log(`%c[API] 200 OK (${elapsed}ms, ${size}b)`, 'color:#69f0ae', path, data);
  return data;
}

// --- Date range helpers ---

// Always pull maximum data (365 days / all-time)
const ALL_TIME_MS = 365 * 24 * 60 * 60 * 1000;

export function getDateRange() {
  const now = Date.now();
  return { startAt: now - ALL_TIME_MS, endAt: now };
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

// Fetch event name metrics (top custom events by count)
export async function getEventMetrics(websiteId, startAt, endAt, limit = 50) {
  return getMetrics(websiteId, 'event', startAt, endAt, limit);
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
    website: { id: 'demo', name: 'PAT2', domain: 'shaynelarocque.com' },
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
      { x: '/works/play/portfolio-analytics-tycoon-2', y: 45 },
      { x: '/works/play/checkplease', y: 38 },
      { x: '/works/play/occasionaltranspo', y: 29 },
      { x: '/works/play/nasty-savings', y: 22 },
      { x: '/works/play/large-lithic-maker', y: 17 },
      { x: '/works/play/markdowntopdf', y: 12 },
      { x: '/works/play/3d-analytics', y: 45 },
      { x: '/works/play/ecosysteme-maif', y: 8 },
      { x: '/history', y: 93 },
      { x: '/connect', y: 54 },
    ],
  };
}

// Generate synthetic sessions with journeys + events
// Session count and page distribution are proportional to real pageview counts.
// startAt/endAt are ms timestamps for distributing sessions across the range
// realEventNames: optional array of real event name strings from Umami API
export function generateDemoSessions(pages, count = 15, startAt = null, endAt = null, realEventNames = null) {
  const sessions = [];
  const rangeStart = startAt || (Date.now() - 7 * 86400000);
  const rangeEnd = endAt || Date.now();
  const rangeMs = rangeEnd - rangeStart;
  const eventPool = (realEventNames && realEventNames.length > 0) ? realEventNames : DEMO_EVENTS;

  // Build a weighted page pool so more-visited pages appear more often as journey starts
  const totalViews = pages.reduce((sum, p) => sum + p.y, 0);
  const weightedPool = [];
  for (const page of pages) {
    // Each page gets at least 1 slot, plus proportional extras
    const slots = Math.max(1, Math.round((page.y / totalViews) * count));
    for (let i = 0; i < slots; i++) weightedPool.push(page);
  }

  const pickWeightedPage = () => weightedPool[Math.floor(Math.random() * weightedPool.length)];

  for (let i = 0; i < count; i++) {
    const numSteps = 1 + Math.floor(Math.random() * 4);
    const steps = [];
    const visited = new Set();

    for (let s = 0; s < numSteps; s++) {
      // First step uses weighted selection; subsequent steps pick randomly (simulating browsing)
      let page;
      if (s === 0) {
        page = pickWeightedPage();
      } else {
        // Prefer unvisited pages, fall back to any page
        const unvisited = pages.filter(p => !visited.has(p.x));
        const pool = unvisited.length > 0 ? unvisited : pages;
        page = pool[Math.floor(Math.random() * pool.length)];
      }
      visited.add(page.x);

      const duration = 5 + Math.random() * 25; // 5-30s visual time
      const numEvents = Math.floor(Math.random() * 4);
      const events = [];

      for (let e = 0; e < numEvents; e++) {
        events.push({
          name: eventPool[Math.floor(Math.random() * eventPool.length)],
          at: Math.random(),
        });
      }
      events.sort((a, b) => a.at - b.at);

      steps.push({ page: page.x, duration, events });
    }

    // First few sessions spawn near the start so characters appear immediately
    let spawnAt;
    if (i < 5) {
      // First 5 sessions within the first 0.5% of the range
      spawnAt = rangeStart + Math.random() * rangeMs * 0.005;
    } else {
      spawnAt = rangeStart + Math.random() * rangeMs;
    }

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
