import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World } from './world.js';
import { Character } from './character.js';
import * as API from './api.js';

// --- State ---
let scene, camera, renderer, controls, clock;
let world;
let characters = [];
let websiteId = null;
let isDemo = false;
let currentRange = '7d';
let siteName = '';
let isBuilding = false; // lock to prevent double-loading

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

// OSRS-flavored visitor names
const NAMES = [
  'Zezima', 'W00x', 'Iron_Btw', 'GoblinSlyr', 'RuneCrftr',
  'PKer_420', 'Dharok', 'B0nk_Loot', 'AgilityCpe', 'Barrows99',
  'Mod_Mark', 'F2p_King', 'Whip_Only', 'Nex_Solo', 'T_Bow_Plz',
  'Lumby_n00b', 'Varrock1', 'Edge_Pker', 'GE_Flipper', 'Slayer_69',
  'Corp_Solo', 'Jad_Ez', 'No_Armor', 'SkillTotal', 'Quest_Cape',
  'Fire_Cape', 'Infernal', 'Dragon_Def', 'Abby_Whip', 'G_Maul_Pk',
  'Herb_Run', 'Bird_House', 'Sand_Crabs', 'Vorkath_1', 'Zulrah_Bt',
  'Rng_Based', 'Pray_Flck', 'Max_Cape', 'Bronze_Man', 'UIM_Pain',
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
  if (eventName.startsWith('click')) return { cls: 'event-click', verb: 'clicked', label: eventName.replace('click_', '').replace('_', ' ') };
  if (eventName.startsWith('form')) return { cls: 'event-form', verb: 'used form:', label: eventName.replace('form_', '') };
  if (eventName.startsWith('hover')) return { cls: 'event-hover', verb: 'hovered', label: eventName.replace('hover_', '') };
  if (eventName.startsWith('video')) return { cls: 'event-click', verb: 'video', label: eventName.replace('video_', '') };
  return { cls: 'event-name', verb: 'triggered', label: eventName };
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

// --- Three.js Setup ---
function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87CEEB, 60, 100);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(15, 25, 35);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('viewport'),
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x87CEEB);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.2;
  controls.minDistance = 8;
  controls.maxDistance = 80;
  controls.target.set(0, 0, -5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
  sun.position.set(30, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0x87CEEB, 0x3a7d30, 0.3));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('click', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (world) {
      const intersects = raycaster.intersectObjects(world.clickableObjects);
      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && (!obj.userData || obj.userData.type !== 'room')) {
          obj = obj.parent;
        }
        if (obj && obj.userData.room) {
          showRoomInfo(obj.userData.room);
        }
      }
    }
  });

  clock = new THREE.Clock();
}

// --- Character / Journey Management ---

function spawnVisitorWithJourney(session) {
  const spawnJitter = SPAWN_POS.clone().add(
    new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 2)
  );

  const char = new Character(scene, spawnJitter);
  const name = getNextName();
  char.visitorName = name;

  char.onJourneyStep = (c, step) => {
    const shortPage = step.page === '/' ? 'Home' : step.page;
    addChatMessage(name, 'entered', shortPage);
    c.showChatBubble(shortPage);

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

  addChatMessage(name, 'logged in', siteName || 'the world');
  return char;
}

function clearAllCharacters() {
  for (const char of characters) {
    char.dispose();
  }
  characters = [];
  if (world) {
    for (const room of world.rooms) {
      room.characters = [];
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

    let sessions = [];
    try {
      const rawSessions = await API.getSessions(websiteId, startAt, endAt, 50);
      sessions = API.filterBotSessions(rawSessions);
    } catch (e) {
      console.warn('Sessions API unavailable:', e.message);
    }

    if (pages && pages.length > 0) {
      setLoadingProgress(70, 'Building world...');

      if (sessions.length === 0) {
        sessions = API.generateDemoSessions(pages, Math.max(12, active || 5), startAt, endAt)
          .filter(s => !s.isBot);
        isDemo = true;
      }

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
  world = new World(scene);
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

  console.log(`Timeline: ${data.sessions.length} sessions queued, baseSpeed=${timeline.baseSpeed.toFixed(0)}`);
  console.log(`Rooms: ${world.rooms.length}, PathGraph nodes: ${world.pathGraph.nodes.size}`);
  console.log(`Room names:`, world.rooms.map(r => r.name));
  console.log(`Session pages:`, data.sessions.slice(0, 3).map(s => s.steps.map(st => st.page)));

  // Debug: dump path graph edges
  for (const [id, node] of world.pathGraph.nodes) {
    if (node.neighbors.length === 0) {
      console.warn(`PathGraph: orphan node "${id}" with no connections`);
    }
  }

  isBuilding = false;
  setLoadingProgress(100, 'Welcome!');
}

// --- Date Filter ---

function setupDateFilter() {
  const buttons = document.querySelectorAll('.filter-btn[data-range]');
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const range = btn.dataset.range;
      if (range === currentRange || isBuilding) return;

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
    addChatMessage('System', 'timeline', 'restarting...');
  }

  // Spawn sessions whose spawnAt <= current timeline position
  while (timeline.sessionQueue.length > 0 && timeline.sessionQueue[0].spawnAt <= timeline.current) {
    const session = timeline.sessionQueue.shift();
    try {
      spawnVisitorWithJourney(session);
    } catch (err) {
      console.warn('Failed to spawn visitor:', err.message);
    }
  }

  updateTimelineUI();
}

function updateSimulation(delta) {
  // Timeline drives spawning
  updateTimeline(delta);

  // Update all characters
  for (let i = characters.length - 1; i >= 0; i--) {
    const char = characters[i];
    char.update(delta);

    if (char.isDead) {
      addChatMessage(char.visitorName || 'Visitor', 'logged out', '');
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

  // Animate clouds
  scene.traverse(obj => {
    if (obj.userData.cloudSpeed) {
      obj.userData.cloudAngle += obj.userData.cloudSpeed * delta * 0.01;
      obj.position.x = Math.cos(obj.userData.cloudAngle) * obj.userData.cloudRadius;
      obj.position.z = Math.sin(obj.userData.cloudAngle) * obj.userData.cloudRadius;
    }
  });

  if (world && world.spawnSign) {
    world.spawnSign.lookAt(camera.position);
  }
}

// --- Main ---
async function main() {
  setLoadingProgress(10, 'Initializing...');
  initScene();
  setupDateFilter();
  setupTimeline();

  await buildWorld(currentRange);

  setTimeout(hideLoadingScreen, 500);

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    controls.update();
    updateSimulation(delta);

    const minimapCanvas = document.getElementById('minimap');
    if (minimapCanvas && world) {
      world.updateMinimap(minimapCanvas, camera, characters);
    }

    renderer.render(scene, camera);
  }

  animate();
}

main().catch(err => {
  console.error('Fatal error:', err);
  setLoadingProgress(100, `Error: ${err.message}`);
});
