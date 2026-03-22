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

const SPAWN_POS = new THREE.Vector3(0, 0, 8);
const REFRESH_INTERVAL = 30000;

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

  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

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

// Map event names to CSS classes and readable labels
function eventDisplayInfo(eventName) {
  if (eventName.startsWith('scroll')) return { cls: 'event-scroll', verb: 'scrolled', label: eventName.replace('scroll_', '') + '%' };
  if (eventName.startsWith('click')) return { cls: 'event-click', verb: 'clicked', label: eventName.replace('click_', '').replace('_', ' ') };
  if (eventName.startsWith('form')) return { cls: 'event-form', verb: 'used form:', label: eventName.replace('form_', '') };
  if (eventName.startsWith('hover')) return { cls: 'event-hover', verb: 'hovered', label: eventName.replace('hover_', '') };
  if (eventName.startsWith('video')) return { cls: 'event-click', verb: 'video', label: eventName.replace('video_', '') };
  return { cls: 'event-name', verb: 'triggered', label: eventName };
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

  // Lighting
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

  // Click handler for rooms
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

  // Set up event callbacks
  char.onJourneyStep = (c, step) => {
    const shortPage = step.page === '/' ? 'Home' : step.page;
    addChatMessage(name, 'entered', shortPage);
    c.showChatBubble(shortPage);

    // Schedule event log messages during the stay
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

  char.setJourney(session, world.pathGraph, world);

  // Track character in the first room
  if (session.steps.length > 0) {
    const firstRoom = world.findRoom(session.steps[0].page);
    if (firstRoom) firstRoom.characters.push(char);
  }

  characters.push(char);
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

    // Try fetching real sessions
    let sessions = [];
    try {
      const rawSessions = await API.getSessions(websiteId, startAt, endAt, 50);
      sessions = API.filterBotSessions(rawSessions);
    } catch (e) {
      console.warn('Sessions API unavailable:', e.message);
    }

    // If we have real pages, use them
    if (pages && pages.length > 0) {
      setLoadingProgress(70, 'Building world...');

      // If no real sessions, generate synthetic ones from page data
      if (sessions.length === 0) {
        const demoSessions = API.generateDemoSessions(pages, Math.max(8, active || 5));
        sessions = demoSessions.filter(s => !s.isBot);
        isDemo = true;
      }

      return { pages, active, stats, sessions };
    }

    // No page data at all — full demo mode
    throw new Error('No page data');
  } catch (err) {
    console.warn('Using demo data:', err.message);
    isDemo = true;

    const demo = API.getDemoData();
    siteName = demo.website.name + ' (Demo)';
    document.getElementById('site-name').textContent = siteName;
    updateActiveCount(demo.active);
    updateStats(demo.stats);

    const sessions = API.generateDemoSessions(demo.pages, 12).filter(s => !s.isBot);

    setLoadingProgress(70, 'Building demo world...');
    return { pages: demo.pages, active: demo.active, stats: demo.stats, sessions };
  }
}

// --- Build / Rebuild World ---

function clearWorld() {
  if (!world) return;
  // Remove all house groups and decorations
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
  clearAllCharacters();
  clearWorld();

  const data = await fetchData(range);

  setLoadingProgress(80, 'Placing buildings...');
  world = new World(scene);
  world.build(data.pages);

  setLoadingProgress(90, 'Spawning visitors...');

  // Stagger character spawns for visual effect
  data.sessions.forEach((session, i) => {
    setTimeout(() => spawnVisitorWithJourney(session), i * 600 + Math.random() * 400);
  });

  setLoadingProgress(100, 'Welcome!');
}

// --- Date Filter ---

function setupDateFilter() {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const range = btn.dataset.range;
      if (range === currentRange) return;

      currentRange = range;
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show loading state
      document.getElementById('chat-messages').innerHTML = '';
      addChatMessage('System', 'reloading', `${range} data...`);

      await buildWorld(range);
    });
  });
}

// --- Periodic Refresh ---

async function refreshData() {
  if (isDemo || !websiteId) return;

  try {
    const { startAt, endAt } = API.getDateRange(currentRange);

    const active = await API.getActiveVisitors(websiteId);
    updateActiveCount(active);

    // Try fetching new sessions
    const rawSessions = await API.getSessions(websiteId, startAt, endAt, 10);
    const sessions = API.filterBotSessions(rawSessions);

    sessions.forEach(session => {
      // Check if we already have this session spawned
      const alreadySpawned = characters.some(c => c.journey?.id === session.id);
      if (!alreadySpawned && session.id) {
        // Build a synthetic journey for this session
        // (real session activity would require another API call)
        const pages = world.rooms.map(r => ({ x: r.name, y: r.visitorCount }));
        const synth = API.generateDemoSessions(pages, 1)[0];
        if (synth && !synth.isBot) {
          spawnVisitorWithJourney(synth);
        }
      }
    });
  } catch (err) {
    console.warn('Refresh failed:', err.message);
  }
}

// --- Demo Spawner ---

let demoSpawnTimer = 0;
const DEMO_SPAWN_INTERVAL = 5;

// --- Simulation ---

function updateSimulation(delta) {
  // Update all characters
  for (let i = characters.length - 1; i >= 0; i--) {
    const char = characters[i];
    char.update(delta);

    if (char.isDead) {
      addChatMessage(char.visitorName || 'Visitor', 'logged out', '');
      // Remove from any room tracking
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

  // Demo mode: periodically spawn new visitors
  if (isDemo && world && world.rooms.length > 0) {
    demoSpawnTimer += delta;
    if (demoSpawnTimer > DEMO_SPAWN_INTERVAL) {
      demoSpawnTimer = 0;
      const pages = world.rooms.map(r => ({ x: r.name, y: r.visitorCount }));
      const sessions = API.generateDemoSessions(pages, 1).filter(s => !s.isBot);
      if (sessions.length > 0) {
        spawnVisitorWithJourney(sessions[0]);
      }
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

  // Billboard spawn sign
  if (world && world.spawnSign) {
    world.spawnSign.lookAt(camera.position);
  }
}

// --- Main ---
async function main() {
  setLoadingProgress(10, 'Initializing...');
  initScene();
  setupDateFilter();

  await buildWorld(currentRange);

  setTimeout(hideLoadingScreen, 500);

  // Periodic refresh
  setInterval(refreshData, REFRESH_INTERVAL);

  // Render loop
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
