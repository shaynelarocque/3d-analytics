import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World } from './world.js';
import { Character } from './character.js';
import * as API from './api.js';

// --- State ---
let scene, camera, renderer, controls, clock;
let renderTarget, pixelQuad, pixelScene, pixelCamera; // pixelation
let uiScene; // crisp overlay scene (signs, chat bubbles) rendered at full res
let world;
let characters = [];
let websiteId = null;
let isDemo = false;
let currentRange = '90d';
let siteName = '';
let isBuilding = false; // lock to prevent double-loading
let followTarget = null; // character to follow with camera
let keysDown = {};       // arrow key state
let activeCars = [];     // animated cars driving in/out
let explosions = [];     // active explosion particle groups

const SPAWN_POS = new THREE.Vector3(0, 0, 8);

// Timeline state
let timeline = {
  startAt: 0,
  endAt: 0,
  current: 0,
  speed: 1,        // multiplier on base speed
  baseSpeed: 1,    // computed: range / PLAYBACK_DURATION
  playing: true,
  sessionQueue: [], // sorted by spawnAt, shifted as spawned
};
const PLAYBACK_DURATION_S = 180; // full range plays in 3 minutes
const SPEED_OPTIONS = [1, 2, 4, 8];
let speedIndex = 0;

// RCT2-style guest names
const NAMES = [
  'Guest 1', 'Guest 2', 'Guest 3', 'Guest 4', 'Guest 5',
  'Guest 6', 'Guest 7', 'Guest 8', 'Guest 9', 'Guest 10',
  'Guest 11', 'Guest 12', 'Guest 13', 'Guest 14', 'Guest 15',
  'Guest 16', 'Guest 17', 'Guest 18', 'Guest 19', 'Guest 20',
  'Guest 21', 'Guest 22', 'Guest 23', 'Guest 24', 'Guest 25',
  'Guest 26', 'Guest 27', 'Guest 28', 'Guest 29', 'Guest 30',
  'Guest 31', 'Guest 32', 'Guest 33', 'Guest 34', 'Guest 35',
  'Guest 36', 'Guest 37', 'Guest 38', 'Guest 39', 'Guest 40',
];

let nameIndex = 0;
function getNextName() {
  const name = NAMES[nameIndex % NAMES.length];
  nameIndex++;
  return name;
}

// --- Loading ---
function setLoadingProgress(pct, text) {
  const bar = document.getElementById('loading-bar-inner');
  const sub = document.getElementById('loading-subtitle');
  if (bar) bar.style.width = `${pct}%`;
  if (sub && text) sub.textContent = text;
}

function hideLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (screen) {
    screen.classList.add('fade-out');
    setTimeout(() => screen.remove(), 1000);
  }
}

// --- Chat log ---
function addChatMessage(playerName, action, detail, eventClass = '') {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msg = document.createElement('div');
  msg.className = 'chat-msg';

  // Use timeline time for the timestamp display
  const ts = new Date(timeline.current || Date.now());
  const time = `${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}`;

  const detailClass = eventClass ? `event-name ${eventClass}` : 'page-name';
  msg.innerHTML = `<span class="timestamp">[${time}]</span> <span class="player-name">${playerName}</span> <span class="action">${action}</span> <span class="${detailClass}">${detail}</span>`;

  container.insertBefore(msg, container.firstChild);

  while (container.children.length > 80) {
    container.removeChild(container.lastChild);
  }
}

// --- UI ---
function updateStats(stats) {
  const el = (id) => document.getElementById(id);
  const val = (v) => typeof v === 'object' && v !== null ? v.value : v;
  if (stats.pageviews != null) el('stat-today').textContent = (val(stats.pageviews) ?? 0).toLocaleString();
  if (stats.visitors != null) el('stat-pages').textContent = (val(stats.visitors) ?? 0).toLocaleString();
  if (stats.bounces != null) el('stat-bounces').textContent = (val(stats.bounces) ?? 0).toLocaleString();
  if (stats.totaltime != null) {
    const visitors = val(stats.visitors) || 1;
    const avgTime = Math.round(val(stats.totaltime) / visitors);
    el('stat-time').textContent = avgTime > 60 ? `${Math.round(avgTime / 60)}m` : `${avgTime}s`;
  }
}

function updateActiveCount(count) {
  const el = document.getElementById('active-num');
  if (el) el.textContent = count;
}

function showRoomInfo(room) {
  const panel = document.getElementById('room-info');
  const title = document.getElementById('room-info-title');
  const content = document.getElementById('room-info-content');
  if (!panel) return;

  panel.classList.remove('hidden');
  title.textContent = room.name;
  content.innerHTML = `
    <div>Visitors: <span class="info-value">${room.visitorCount}</span></div>
    <div>In room: <span class="info-value">${room.characters.length}</span></div>
  `;
}

function eventDisplayInfo(eventName) {
  if (eventName.startsWith('scroll')) return { cls: 'event-scroll', verb: 'scrolled', label: eventName.replace('scroll_', '') + '%' };
  if (eventName.startsWith('click')) return { cls: 'event-click', verb: 'clicked', label: eventName.replace('click_', '').replace(/_/g, ' ') };
  if (eventName.startsWith('form')) return { cls: 'event-form', verb: 'used form:', label: eventName.replace('form_', '') };
  if (eventName.startsWith('hover')) return { cls: 'event-hover', verb: 'hovered', label: eventName.replace('hover_', '').replace(/_/g, ' ') };
  if (eventName.startsWith('video')) return { cls: 'event-click', verb: 'video', label: eventName.replace('video_', '') };
  if (eventName.startsWith('share')) return { cls: 'event-click', verb: 'shared', label: eventName.replace('share_', '').replace(/_/g, ' ') };
  if (eventName.startsWith('copy')) return { cls: 'event-click', verb: 'copied', label: eventName.replace('copy_', '').replace(/_/g, ' ') };
  if (eventName.startsWith('download')) return { cls: 'event-click', verb: 'downloaded', label: eventName.replace('download_', '').replace(/_/g, ' ') };
  if (eventName.startsWith('toggle')) return { cls: 'event-name', verb: 'toggled', label: eventName.replace('toggle_', '').replace(/_/g, ' ') };
  if (eventName.startsWith('open')) return { cls: 'event-name', verb: 'opened', label: eventName.replace('open_', '').replace(/_/g, ' ') };
  if (eventName.startsWith('close')) return { cls: 'event-name', verb: 'closed', label: eventName.replace('close_', '').replace(/_/g, ' ') };
  // Generic: use the event name as-is with underscores replaced
  return { cls: 'event-name', verb: 'triggered', label: eventName.replace(/_/g, ' ') };
}

// --- Timeline UI ---

function formatDate(ms) {
  const d = new Date(ms);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatDateTime(ms) {
  const d = new Date(ms);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function updateTimelineUI() {
  const progress = document.getElementById('timeline-progress');
  const scrubber = document.getElementById('timeline-scrubber');
  const currentLabel = document.getElementById('timeline-current-label');

  if (!progress) return;

  const range = timeline.endAt - timeline.startAt;
  const pct = range > 0 ? ((timeline.current - timeline.startAt) / range) * 100 : 0;
  const clampedPct = Math.max(0, Math.min(100, pct));

  progress.style.width = `${clampedPct}%`;
  scrubber.style.left = `${clampedPct}%`;
  currentLabel.textContent = formatDateTime(timeline.current);
}

function initTimelineUI() {
  document.getElementById('timeline-start-label').textContent = formatDate(timeline.startAt);
  document.getElementById('timeline-end-label').textContent = formatDate(timeline.endAt);
  updateTimelineUI();
}

function setupTimeline() {
  // Play/pause button
  const playBtn = document.getElementById('timeline-playpause');
  playBtn.addEventListener('click', () => {
    timeline.playing = !timeline.playing;
    playBtn.innerHTML = timeline.playing ? '&#9646;&#9646;' : '&#9654;';
  });

  // Speed button
  const speedBtn = document.getElementById('timeline-speed');
  speedBtn.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    timeline.speed = SPEED_OPTIONS[speedIndex];
    speedBtn.textContent = `${SPEED_OPTIONS[speedIndex]}x`;
  });

  // Click on track to scrub
  const track = document.getElementById('timeline-track');
  track.addEventListener('click', (e) => {
    const rect = track.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    timeline.current = timeline.startAt + pct * (timeline.endAt - timeline.startAt);
    // Re-queue sessions that haven't been spawned yet at the new position
    requeueSessions();
    updateTimelineUI();
  });
}

function requeueSessions() {
  // Reset the queue: only include sessions that haven't been spawned yet (spawnAt > current)
  timeline.sessionQueue = timeline.allSessions.filter(s => s.spawnAt > timeline.current);
  // Clear existing characters
  clearAllCharacters();
  // Spawn any sessions that should already exist at this timeline position
  const pastSessions = timeline.allSessions.filter(s => s.spawnAt <= timeline.current);
  // Only spawn the most recent few to avoid flooding
  const recent = pastSessions.slice(-8);
  recent.forEach(s => spawnVisitorWithJourney(s));
}

// --- Pixelation config ---
const PIXEL_SCALE = 3; // render at 1/3 resolution then upscale — chunky RCT2 pixels

function setupPixelation() {
  const w = Math.floor(window.innerWidth / PIXEL_SCALE);
  const h = Math.floor(window.innerHeight / PIXEL_SCALE);

  if (renderTarget) renderTarget.dispose();
  renderTarget = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
  });

  if (!pixelScene) {
    pixelScene = new THREE.Scene();
    pixelCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    pixelQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: renderTarget.texture })
    );
    pixelScene.add(pixelQuad);
  } else {
    pixelQuad.material.map = renderTarget.texture;
  }
}

// --- Three.js Setup ---
function initScene() {
  scene = new THREE.Scene();
  uiScene = new THREE.Scene(); // crisp overlay for text
  // No fog — RCT2 is crisp edge-to-edge

  // Isometric orthographic camera (RCT2-style dimetric)
  const aspect = window.innerWidth / window.innerHeight;
  const frustum = 18; // tighter zoom to see buildings clearly
  camera = new THREE.OrthographicCamera(
    -frustum * aspect, frustum * aspect,
    frustum, -frustum,
    0.1, 400
  );
  // Classic isometric angle: ~35.264° elevation, 45° azimuth
  const isoDistance = 80;
  camera.position.set(isoDistance, isoDistance * 0.8, isoDistance);
  camera.lookAt(0, 0, -5);

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('viewport'),
    antialias: false, // no AA — we want crisp pixels
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1); // force 1:1 for pixel art
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x88c070); // RCT2 green sky

  // Set up pixelation render target
  setupPixelation();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = false; // locked isometric — no rotation
  controls.minZoom = 0.3;
  controls.maxZoom = 3;
  controls.target.set(0, 0, -5);
  controls.enablePan = true;
  controls.panSpeed = 1.5;
  // Left-click pans (since rotation is disabled)
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };

  // Arrow key panning
  window.addEventListener('keydown', (e) => {
    keysDown[e.key] = true;
    // Escape clears follow target
    if (e.key === 'Escape' && followTarget) {
      stopFollowing();
    }
  });
  window.addEventListener('keyup', (e) => { keysDown[e.key] = false; });

  // Brighter, flatter lighting for RCT2 look
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));

  const sun = new THREE.DirectionalLight(0xfffff0, 1.0);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0x88c070, 0x4a8030, 0.4));

  window.addEventListener('resize', () => {
    const a = window.innerWidth / window.innerHeight;
    const f = 18;
    camera.left = -f * a;
    camera.right = f * a;
    camera.top = f;
    camera.bottom = -f;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    setupPixelation();
  });

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('click', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Check characters first (click to follow)
    const charMeshes = [];
    for (const char of characters) {
      char.group.traverse(child => { if (child.isMesh) charMeshes.push(child); });
    }
    const charHits = raycaster.intersectObjects(charMeshes);
    if (charHits.length > 0) {
      // Find which character owns this mesh
      let hitObj = charHits[0].object;
      const hitChar = characters.find(c => {
        let found = false;
        c.group.traverse(child => { if (child === hitObj) found = true; });
        return found;
      });
      if (hitChar) {
        startFollowing(hitChar);
        return;
      }
    }

    // No character hit — stop following if we were
    if (followTarget) {
      stopFollowing();
      return;
    }
  });

  clock = new THREE.Clock();
}

// --- Character / Journey Management ---

function spawnVisitorWithJourney(session) {
  // Spawn a car that drives in — character appears when car arrives
  spawnArrivalCar(session);
  return null;
}

function _spawnCharacterFromCar(session, spawnPos) {
  const char = new Character(scene, spawnPos);
  const name = getNextName();
  char.visitorName = name;

  // Events only fire AFTER the character physically arrives at the ride
  char.onArrivedAtRoom = (c, step) => {
    const shortPage = step.page === '/' ? 'Home' : step.page;
    const room = world.findRoom(step.page);
    const rideVerb = room?.ride ? 'is riding' : 'is looking at';
    addChatMessage(name, rideVerb, shortPage);
    c.showChatBubble(shortPage);

    // Schedule events during the idle/wander period (after arrival)
    if (step.events && step.events.length > 0) {
      step.events.forEach(evt => {
        const delayMs = evt.at * step.duration * 1000;
        setTimeout(() => {
          if (c.isDead) return;
          const info = eventDisplayInfo(evt.name);
          addChatMessage(name, info.verb, info.label, info.cls);
          c.showChatBubble(evt.name.replace('_', ' '));
        }, delayMs);
      });
    }
  };

  // Debug: check if rooms exist for this session's pages
  const missingRooms = session.steps.filter(s => !world.findRoom(s.page)).map(s => s.page);
  if (missingRooms.length > 0) {
    console.warn(`Visitor ${name}: missing rooms for`, missingRooms);
  }

  // Debug: check pathfinding before setting journey
  if (session.steps.length > 0) {
    const firstRoom = world.findRoom(session.steps[0].page);
    if (firstRoom) {
      const testPath = world.pathGraph.getPathFromPosition(char.group.position, firstRoom.nodeId);
      if (!testPath) {
        console.warn(`Visitor ${name}: no path from spawn to ${firstRoom.nodeId}`);
        // Debug: check what nodes exist near spawn
        const nearestNode = world.pathGraph.findNearestNode(char.group.position);
        console.warn(`  Nearest node to spawn: ${nearestNode}`);
        console.warn(`  Target node exists: ${world.pathGraph.nodes.has(firstRoom.nodeId)}`);
      }
    }
  }

  char.uiScene = uiScene;
  char.onExplode = (c, pos) => {
    spawnExplosion(pos);
    addChatMessage(c.visitorName || 'Guest', 'flew off a ride and', 'EXPLODED!', 'event-click');
  };
  char.setJourney(session, world.pathGraph, world);

  if (session.steps.length > 0) {
    const firstRoom = world.findRoom(session.steps[0].page);
    if (firstRoom) firstRoom.characters.push(char);
  }

  characters.push(char);

  // Debug: check if character is alive after journey setup
  if (char.isDead) {
    console.error(`Visitor ${name}: DEAD immediately after setJourney`);
  } else {
    console.log(`Visitor ${name}: spawned OK, waypoints=${char.waypoints.length}, walking=${char.isWalking}`);
  }

  addChatMessage(name, 'entered the park', '');
  return char;
}

function clearAllCharacters() {
  // Remove any active cars and explosions
  for (const car of activeCars) scene.remove(car.group);
  activeCars = [];
  for (const exp of explosions) scene.remove(exp.group);
  explosions = [];

  for (const char of characters) {
    // If character is riding, disembark first
    if (char.isRiding && char.currentRide) {
      char.currentRide.disembarkGuest(char);
      char.isRiding = false;
      char.currentRide = null;
    }
    char.dispose();
  }
  characters = [];
  if (world) {
    for (const room of world.rooms) {
      room.characters = [];
    }
    // Clear ride seat occupancy
    for (const ride of world.rides) {
      for (const seat of ride.seats) {
        seat.occupied = false;
        seat.character = null;
      }
    }
  }
}

// --- Data Fetching ---

async function fetchData(range) {
  const { startAt, endAt } = API.getDateRange(range);

  try {
    setLoadingProgress(20, 'Connecting to Umami...');

    const websites = await API.getWebsites();
    if (!websites || websites.length === 0) throw new Error('No websites found');

    const site = websites[0];
    websiteId = site.id;
    siteName = site.name || site.domain || 'Analytics';
    document.getElementById('site-name').textContent = siteName;

    setLoadingProgress(40, 'Fetching visitor data...');

    const [active, stats, pages] = await Promise.all([
      API.getActiveVisitors(websiteId),
      API.getStats(websiteId, startAt, endAt),
      API.getMetrics(websiteId, 'url', startAt, endAt, 20),
    ]);

    updateActiveCount(active);
    updateStats(stats);

    if (pages && pages.length > 0) {
      setLoadingProgress(70, 'Building world...');

      // Fetch real event names and session counts in parallel
      let realSessionCount = 0;
      let realEventNames = null;

      const [sessionsResult, eventsResult] = await Promise.allSettled([
        API.getSessions(websiteId, startAt, endAt, 50),
        API.getEventMetrics(websiteId, startAt, endAt, 50),
      ]);

      if (sessionsResult.status === 'fulfilled' && sessionsResult.value) {
        const rawSessions = sessionsResult.value;
        realSessionCount = API.filterBotSessions(rawSessions).length;
      }

      if (eventsResult.status === 'fulfilled' && eventsResult.value) {
        const eventMetrics = eventsResult.value;
        if (eventMetrics.length > 0) {
          realEventNames = eventMetrics.map(e => e.x);
          console.log(`%c[App] Discovered ${realEventNames.length} real events:`, 'color:#ffcc00', realEventNames);
        }
      }

      const count = Math.max(12, realSessionCount || active || 5);
      const sessions = API.generateDemoSessions(pages, count, startAt, endAt, realEventNames)
        .filter(s => !s.isBot);

      return { pages, active, stats, sessions, startAt, endAt };
    }

    throw new Error('No page data');
  } catch (err) {
    console.warn('Using demo data:', err.message);
    isDemo = true;

    const { startAt, endAt } = API.getDateRange(range);
    const demo = API.getDemoData();
    siteName = demo.website.name + ' (Demo)';
    document.getElementById('site-name').textContent = siteName;
    updateActiveCount(demo.active);
    updateStats(demo.stats);

    const sessions = API.generateDemoSessions(demo.pages, 15, startAt, endAt)
      .filter(s => !s.isBot);

    setLoadingProgress(70, 'Building demo world...');
    return { pages: demo.pages, active: demo.active, stats: demo.stats, sessions, startAt, endAt };
  }
}

// --- Build / Rebuild World ---

function clearWorld() {
  if (!world) return;
  const toRemove = [];
  scene.traverse(obj => {
    if (obj !== scene && obj.type !== 'AmbientLight' && obj.type !== 'DirectionalLight' && obj.type !== 'HemisphereLight') {
      if (obj.parent === scene) toRemove.push(obj);
    }
  });
  toRemove.forEach(obj => {
    scene.remove(obj);
    obj.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  });
  world = null;
}

async function buildWorld(range) {
  if (isBuilding) return;
  isBuilding = true;

  clearAllCharacters();
  clearWorld();

  const data = await fetchData(range);

  setLoadingProgress(80, 'Placing buildings...');
  world = new World(scene, uiScene);
  world.siteName = siteName || 'Portfolio';
  world.build(data.pages);

  setLoadingProgress(90, 'Starting timeline...');

  // Set up timeline
  timeline.startAt = data.startAt;
  timeline.endAt = data.endAt;
  timeline.current = data.startAt;
  timeline.baseSpeed = (data.endAt - data.startAt) / (PLAYBACK_DURATION_S * 1000);
  timeline.allSessions = data.sessions;
  timeline.sessionQueue = [...data.sessions];
  timeline.playing = true;

  // Update play button state
  const playBtn = document.getElementById('timeline-playpause');
  if (playBtn) playBtn.innerHTML = '&#9646;&#9646;';

  initTimelineUI();

  console.group(`%c[App] buildWorld("${range}") complete`, 'color:#ffcc00; font-weight:bold');
  console.log(`Timeline: ${data.sessions.length} sessions queued`);
  console.log(`  baseSpeed: ${timeline.baseSpeed.toFixed(0)}x (${PLAYBACK_DURATION_S}s playback)`);
  console.log(`  range: ${new Date(data.startAt).toISOString()} → ${new Date(data.endAt).toISOString()}`);
  console.log(`Rooms (${world.rooms.length}):`, world.rooms.map(r => `${r.name} [${r.nodeId}]`));
  console.log(`Rides (${world.rides.length}):`, world.rides.map(r => `${r.name} (${r.type})`));
  console.log(`First 3 sessions:`);
  data.sessions.slice(0, 3).forEach((s, i) => {
    const pages = s.steps?.map(st => st.page) || ['<no steps>'];
    console.log(`  #${i}: id=${s.id}, spawnAt=${new Date(s.spawnAt).toISOString()}, pages=[${pages.join(' → ')}]`);
  });
  console.groupEnd();

  isBuilding = false;
  setLoadingProgress(100, 'Welcome!');
}

// --- Date Filter ---

function setupPanelCollapse() {
  document.querySelectorAll('.close-btn[data-collapse]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panelId = btn.dataset.collapse;
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.toggle('panel-collapsed');
    });
  });
}

function setupDateFilter() {
  const buttons = document.querySelectorAll('.filter-btn[data-range]');
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const range = btn.dataset.range;
      if (range === currentRange || isBuilding) {
        console.log(`%c[Filter] Ignored click: range=${range}, current=${currentRange}, building=${isBuilding}`, 'color:#888');
        return;
      }

      console.log(`%c[Filter] Switching range: ${currentRange} → ${range}`, 'color:#ffcc00');
      currentRange = range;
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.getElementById('chat-messages').innerHTML = '';
      addChatMessage('System', 'reloading', `${range} data...`);

      await buildWorld(range);
    });
  });
}

// --- Simulation ---

function updateTimeline(delta) {
  if (!timeline.playing) return;

  // Advance timeline
  const advance = delta * 1000 * timeline.baseSpeed * timeline.speed;
  timeline.current += advance;

  // Loop when reaching the end
  if (timeline.current >= timeline.endAt) {
    timeline.current = timeline.startAt;
    timeline.sessionQueue = [...(timeline.allSessions || [])];
    clearAllCharacters();
    document.getElementById('chat-messages').innerHTML = '';
    addChatMessage('Park', 'new day', 'starting...');
  }

  // Spawn sessions whose spawnAt <= current timeline position
  let spawned = 0;
  while (timeline.sessionQueue.length > 0 && timeline.sessionQueue[0].spawnAt <= timeline.current) {
    const session = timeline.sessionQueue.shift();
    try {
      console.log(`%c[Timeline] Spawning session ${session.id} at ${new Date(session.spawnAt).toISOString()} (queue: ${timeline.sessionQueue.length} left)`, 'color:#fff176');
      spawnVisitorWithJourney(session);
      spawned++;
    } catch (err) {
      console.error(`%c[Timeline] ✗ Failed to spawn:`, 'color:#ff5252', err);
    }
  }
  if (spawned > 0) {
    console.log(`%c[Timeline] Spawned ${spawned} visitors, ${characters.length} total alive`, 'color:#69f0ae');
  }

  updateTimelineUI();
}

function updateSimulation(delta) {
  // Timeline drives spawning
  updateTimeline(delta);
  updateCars(delta);
  updateExplosions(delta);

  // Update all characters
  for (let i = characters.length - 1; i >= 0; i--) {
    const char = characters[i];
    char.update(delta);

    if (char.isDead) {
      // Disembark if still on a ride
      if (char.isRiding && char.currentRide) {
        char.currentRide.disembarkGuest(char);
        char.isRiding = false;
        char.currentRide = null;
      }
      // Spawn departure car if character walked out normally (not launched)
      if (char.isLeaving && !char.wasLaunched) {
        spawnDepartureCar(char.group.position);
      }
      console.log(`%c[Sim] ${char.visitorName || 'Visitor'} removed`, 'color:#ef9a9a');
      addChatMessage(char.visitorName || 'Guest', 'left the park', '');
      if (world) {
        for (const room of world.rooms) {
          const idx = room.characters.indexOf(char);
          if (idx !== -1) room.characters.splice(idx, 1);
        }
      }
      char.dispose();
      characters.splice(i, 1);
    }
  }

  // Update rides animation + decorations
  if (world) {
    for (const ride of world.rides) {
      ride.update(delta);
    }
    world.updateDecorations(delta);
    // Face all billboard signs toward camera
    if (world.billboards) {
      for (const sign of world.billboards) {
        sign.lookAt(camera.position);
      }
    }
  }
}

// --- Explosion system (cartoonish nuclear poof) ---

function spawnExplosion(pos) {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.position.y = 0.5;

  // Big fireball sphere (expands then fades)
  const fireball = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1 })
  );
  group.add(fireball);

  // Inner hot core
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
  );
  group.add(core);

  // Expanding shockwave ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.5, 16),
    new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);

  // Cartoon stars/sparkles radiating outward
  const stars = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const star = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffdd00 : 0xffffff, transparent: true, opacity: 1 })
    );
    star.rotation.set(Math.PI / 4, 0, Math.PI / 4); // diamond shape
    star.userData.angle = angle;
    star.userData.speed = 4 + Math.random() * 3;
    star.position.set(Math.cos(angle) * 0.5, 0.5 + Math.random() * 0.5, Math.sin(angle) * 0.5);
    group.add(star);
    stars.push(star);
  }

  // Rising mushroom puff (stack of spheres going up)
  const puffs = [];
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.4 - i * 0.06, 6, 6),
      new THREE.MeshLambertMaterial({
        color: i < 2 ? 0xff6600 : 0xcccccc,
        transparent: true, opacity: 0.9, flatShading: true
      })
    );
    puff.position.y = 0.5 + i * 0.3;
    puff.userData.riseSpeed = 2 + i * 0.8;
    puff.userData.baseScale = 1;
    group.add(puff);
    puffs.push(puff);
  }

  scene.add(group);
  explosions.push({ group, fireball, core, ring, stars, puffs, life: 2.5, maxLife: 2.5 });
}

function updateExplosions(delta) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const exp = explosions[i];
    exp.life -= delta;

    if (exp.life <= 0) {
      scene.remove(exp.group);
      explosions.splice(i, 1);
      continue;
    }

    const t = 1 - exp.life / exp.maxLife; // 0→1 over lifetime
    const fade = Math.max(0, exp.life / exp.maxLife);

    // Fireball: expand quickly then shrink
    const fbScale = t < 0.2 ? t / 0.2 * 4 : Math.max(0, 4 * (1 - t));
    exp.fireball.scale.setScalar(fbScale);
    exp.fireball.material.opacity = Math.max(0, 1 - t * 1.5);

    // Core: bright flash then gone
    exp.core.scale.setScalar(fbScale * 0.8);
    exp.core.material.opacity = Math.max(0, 1 - t * 2);

    // Shockwave ring: expand outward, flatten and fade
    const ringScale = 1 + t * 8;
    exp.ring.scale.setScalar(ringScale);
    exp.ring.material.opacity = Math.max(0, 0.8 - t * 1.2);

    // Stars: fly outward and shrink
    for (const star of exp.stars) {
      const r = t * star.userData.speed;
      star.position.x = Math.cos(star.userData.angle) * r;
      star.position.z = Math.sin(star.userData.angle) * r;
      star.position.y = 0.5 + Math.sin(t * Math.PI) * 2; // arc up then down
      star.rotation.y += delta * 8;
      const starScale = Math.max(0, 1 - t * 1.3);
      star.scale.setScalar(starScale);
      star.material.opacity = starScale;
    }

    // Mushroom puffs: rise and expand, then fade
    for (const puff of exp.puffs) {
      puff.position.y += puff.userData.riseSpeed * delta;
      const puffExpand = 1 + t * 2;
      puff.scale.setScalar(puffExpand);
      puff.material.opacity = Math.max(0, 0.9 - t * 1.2);
    }
  }
}

// --- Car system ---

const CAR_COLORS = [0xd03020, 0x2060c0, 0x40c840, 0xf0c020, 0xe07020, 0x808080, 0xf0f0f0, 0x1a1a1a];

function createCarMesh() {
  const car = new THREE.Group();
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const bodyMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, flatShading: true });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 2.8), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);

  // Roof/cabin
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.6), bodyMat);
  roof.position.set(0, 1.15, -0.2);
  roof.castShadow = true;
  car.add(roof);

  // Windshield
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.4, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6, flatShading: true })
  );
  glass.position.set(0, 1.1, 0.58);
  car.add(glass);

  // 4 wheels
  for (const [wx, wz] of [[-0.7, 0.8], [0.7, 0.8], [-0.7, -0.8], [0.7, -0.8]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 6), darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.22, wz);
    car.add(wheel);
  }

  // Headlights
  for (const hx of [-0.5, 0.5]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffcc }));
    light.position.set(hx, 0.55, 1.42);
    car.add(light);
  }

  return car;
}

function spawnArrivalCar(session) {
  const car = createCarMesh();
  const fromX = (Math.random() - 0.5) * 8;
  const from = new THREE.Vector3(fromX, 0, 55);
  const to = new THREE.Vector3(fromX * 0.3, 0, 20);
  car.position.copy(from);
  car.rotation.y = Math.PI; // face toward the park
  scene.add(car);

  activeCars.push({
    group: car,
    from, to,
    t: 0,
    speed: 0.6 + Math.random() * 0.2,
    onComplete: () => {
      scene.remove(car);
      // Now spawn the character at parking lot
      const spawnPos = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, -1));
      _spawnCharacterFromCar(session, spawnPos);
    },
  });
}

function spawnDepartureCar(position) {
  const car = createCarMesh();
  const from = new THREE.Vector3(position.x, 0, position.z);
  const to = new THREE.Vector3(position.x + (Math.random() - 0.5) * 4, 0, 55);
  car.position.copy(from);
  car.rotation.y = 0; // face away from park
  scene.add(car);

  activeCars.push({
    group: car,
    from, to,
    t: 0,
    speed: 0.5 + Math.random() * 0.3,
    onComplete: () => { scene.remove(car); },
  });
}

function updateCars(delta) {
  for (let i = activeCars.length - 1; i >= 0; i--) {
    const car = activeCars[i];
    car.t += delta * car.speed;
    if (car.t >= 1) {
      car.onComplete();
      activeCars.splice(i, 1);
    } else {
      // Ease in/out
      const ease = car.t < 0.5
        ? 2 * car.t * car.t
        : 1 - Math.pow(-2 * car.t + 2, 2) / 2;
      car.group.position.lerpVectors(car.from, car.to, ease);
    }
  }
}

// --- Camera follow + arrow keys ---

function startFollowing(char) {
  followTarget = char;
  addChatMessage('Camera', 'following', char.visitorName || 'Guest');
}

function stopFollowing() {
  if (followTarget) {
    addChatMessage('Camera', 'stopped following', followTarget.visitorName || 'Guest');
  }
  followTarget = null;
}

function updateCamera(delta) {
  // Arrow key panning (isometric-aware: arrows move in screen space)
  const panSpeed = 20 * delta;
  // In isometric view, screen-right is roughly +X-Z, screen-up is roughly -X-Z+Y
  // Simplified: map arrows to XZ movement
  let dx = 0, dz = 0;
  if (keysDown['ArrowLeft'])  dx -= panSpeed;
  if (keysDown['ArrowRight']) dx += panSpeed;
  if (keysDown['ArrowUp'])    dz -= panSpeed;
  if (keysDown['ArrowDown'])  dz += panSpeed;

  if (dx !== 0 || dz !== 0) {
    // Stop following if user manually pans
    if (followTarget) stopFollowing();
    controls.target.x += dx;
    controls.target.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
  }

  // Follow target character
  if (followTarget) {
    if (followTarget.isDead) {
      stopFollowing();
      return;
    }
    // Get world position (works even if reparented to a ride seat)
    const worldPos = new THREE.Vector3();
    followTarget.group.getWorldPosition(worldPos);

    // Smoothly move camera target toward character
    const lerpFactor = 1 - Math.pow(0.05, delta);
    controls.target.lerp(worldPos, lerpFactor);

    // Keep camera offset consistent
    const isoDistance = 80;
    camera.position.set(
      controls.target.x + isoDistance,
      controls.target.y + isoDistance * 0.8,
      controls.target.z + isoDistance
    );
  }
}

// --- Main ---
const LOAD_START = performance.now();
const MIN_LOAD_MS = 10000; // show box art for at least 10 seconds

async function main() {
  setLoadingProgress(10, 'Initializing...');
  initScene();
  setupDateFilter();
  setupTimeline();
  setupPanelCollapse();

  await buildWorld(currentRange);

  // Enforce minimum loading time so you can admire the box art
  const elapsed = performance.now() - LOAD_START;
  const remaining = Math.max(0, MIN_LOAD_MS - elapsed);
  setTimeout(hideLoadingScreen, remaining);

  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.1);

    updateCamera(delta);
    controls.update();
    updateSimulation(delta);

    const minimapCanvas = document.getElementById('minimap');
    if (minimapCanvas && world) {
      world.updateMinimap(minimapCanvas, camera, characters);
    }

    // Pass 1: pixelated scene at 1/3 resolution
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(pixelScene, pixelCamera);

    // Pass 2: crisp UI overlay (signs, chat bubbles) at full resolution
    renderer.autoClear = false;
    renderer.render(uiScene, camera);
    renderer.autoClear = true;
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  setLoadingProgress(100, `Error: ${err.message}`);
});
