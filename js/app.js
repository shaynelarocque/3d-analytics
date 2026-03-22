import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World } from './world.js';
import { Character } from './character.js';
import * as API from './api.js';

// --- State ---
let scene, camera, renderer, controls;
let world;
let characters = [];
let websiteId = null;
let pageData = [];
let isDemo = false;
let clock;

const SPAWN_POS = new THREE.Vector3(0, 0, 6);
const EXIT_POS = new THREE.Vector3(0, 0, 40);
const REFRESH_INTERVAL = 30000;

// Random visitor names (OSRS-flavored)
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

function getRandomName() {
  return NAMES[Math.floor(Math.random() * NAMES.length)];
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
function addChatMessage(playerName, action, pageName) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msg = document.createElement('div');
  msg.className = 'chat-msg';

  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  msg.innerHTML = `<span class="timestamp">[${time}]</span> <span class="player-name">${playerName}</span> <span class="action">${action}</span> <span class="page-name">${pageName}</span>`;

  container.insertBefore(msg, container.firstChild);

  // Keep max 50 messages
  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

// --- UI Updates ---
function updateStats(stats) {
  const el = (id) => document.getElementById(id);
  const val = (v) => typeof v === 'object' && v !== null ? v.value : v;
  if (stats.pageviews != null) el('stat-today').textContent = val(stats.pageviews)?.toLocaleString() ?? '0';
  if (stats.visitors != null) el('stat-pages').textContent = val(stats.visitors)?.toLocaleString() ?? '0';
  if (stats.bounces != null) el('stat-bounces').textContent = val(stats.bounces)?.toLocaleString() ?? '0';
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
    <div>Characters: <span class="info-value">${room.characters.length}</span></div>
  `;
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

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.2;
  controls.minDistance = 8;
  controls.maxDistance = 80;
  controls.target.set(0, 0, -5);

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

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

  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x3a7d30, 0.3);
  scene.add(hemi);

  // Resize handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Click handler
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

// --- Character Management ---
function spawnVisitor(room) {
  // Jitter spawn position
  const spawnJitter = SPAWN_POS.clone().add(
    new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 2)
  );

  const char = new Character(scene, spawnJitter);
  const name = getRandomName();

  // Walk to room door, then inside
  const doorPos = room.doorWorldPos.clone();
  doorPos.x += (Math.random() - 0.5) * 1.5;
  doorPos.z += Math.random() * 0.5;
  char.setTarget(doorPos, room);

  room.characters.push(char);
  characters.push(char);

  // Chat bubble and log
  char.showChatBubble(room.name);
  addChatMessage(name, 'entered', room.name);

  return char;
}

function removeVisitor(char) {
  // Find which room this character belongs to
  for (const room of world.rooms) {
    const idx = room.characters.indexOf(char);
    if (idx !== -1) {
      room.characters.splice(idx, 1);
      addChatMessage(getRandomName(), 'left', room.name);
      break;
    }
  }
  char.setLeaving(EXIT_POS.clone().add(
    new THREE.Vector3((Math.random() - 0.5) * 8, 0, Math.random() * 4)
  ));
}

// --- Data Fetching ---
async function fetchData() {
  try {
    setLoadingProgress(20, 'Connecting to Umami...');

    const websites = await API.getWebsites();
    if (!websites || websites.length === 0) throw new Error('No websites found');

    const site = websites[0];
    websiteId = site.id;

    document.getElementById('site-name').textContent = site.name || site.domain || 'Analytics';

    setLoadingProgress(40, 'Fetching visitor data...');

    const now = Date.now();
    const monthAgo = now - 30 * 86400000;

    const [active, stats, pages] = await Promise.all([
      API.getActiveVisitors(websiteId),
      API.getStats(websiteId, monthAgo, now),
      API.getMetrics(websiteId, 'url', monthAgo, now, 20),
    ]);

    setLoadingProgress(70, 'Building world...');

    updateActiveCount(active);
    updateStats(stats);

    // If no page metrics yet, use demo pages with real site name
    if (!pages || pages.length === 0) {
      const demo = API.getDemoData();
      pageData = demo.pages;
      isDemo = true;
      document.getElementById('site-name').textContent =
        (site.name || site.domain) + ' (No data yet - demo rooms)';
      return { pages: demo.pages, active, stats };
    }

    pageData = pages;
    return { pages, active, stats };
  } catch (err) {
    console.warn('API unavailable, using demo data:', err.message);
    isDemo = true;

    const demo = API.getDemoData();
    document.getElementById('site-name').textContent = demo.website.name + ' (Demo)';
    updateActiveCount(demo.active);
    updateStats(demo.stats);
    pageData = demo.pages;

    setLoadingProgress(70, 'Building demo world...');
    return { pages: demo.pages, active: demo.active, stats: demo.stats };
  }
}

async function refreshData() {
  if (isDemo || !websiteId) return;

  try {
    const now = Date.now();
    const dayAgo = now - 86400000;

    const [active, pages] = await Promise.all([
      API.getActiveVisitors(websiteId),
      API.getMetrics(websiteId, 'url', dayAgo, now, 20),
    ]);

    updateActiveCount(active);

    // Spawn new visitors for pages that grew
    pages.forEach(page => {
      const room = world.rooms.find(r => r.name === page.x);
      if (room) {
        const oldCount = room.visitorCount;
        room.visitorCount = page.y;
        const diff = page.y - oldCount;
        if (diff > 0) {
          for (let i = 0; i < Math.min(diff, 3); i++) {
            spawnVisitor(room);
          }
        }
      }
    });
  } catch (err) {
    console.warn('Refresh failed:', err.message);
  }
}

// --- Simulation ---
let spawnTimer = 0;
const SPAWN_INTERVAL_DEMO = 3;

function updateSimulation(delta) {
  // Update all characters
  for (let i = characters.length - 1; i >= 0; i--) {
    const char = characters[i];
    char.update(delta);

    // Remove dead characters
    if (char.isDead) {
      char.dispose();
      characters.splice(i, 1);
      continue;
    }

    // Randomly remove some characters after a while (simulates session ending)
    if (!char.isLeaving && char.lifetime > char.maxLifetime) {
      removeVisitor(char);
    }
  }

  // In demo mode, periodically spawn visitors
  if (isDemo && world && world.rooms.length > 0) {
    spawnTimer += delta;
    if (spawnTimer > SPAWN_INTERVAL_DEMO) {
      spawnTimer = 0;
      const room = world.rooms[Math.floor(Math.random() * world.rooms.length)];
      spawnVisitor(room);
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

  const data = await fetchData();

  setLoadingProgress(80, 'Placing buildings...');
  world = new World(scene);
  world.build(data.pages);

  setLoadingProgress(90, 'Spawning visitors...');

  // Initial visitor spawn based on active count
  const totalActive = data.active || 5;
  const roomCount = world.rooms.length;
  if (roomCount > 0) {
    // Distribute visitors proportionally to page views
    const totalViews = data.pages.reduce((sum, p) => sum + p.y, 0) || 1;
    data.pages.forEach((page, i) => {
      const room = world.rooms[i];
      if (!room) return;
      const proportion = page.y / totalViews;
      const count = Math.max(1, Math.round(totalActive * proportion));
      for (let j = 0; j < Math.min(count, 5); j++) {
        setTimeout(() => spawnVisitor(room), j * 500 + Math.random() * 1000);
      }
    });
  }

  setLoadingProgress(100, 'Welcome!');
  setTimeout(hideLoadingScreen, 500);

  // Periodic refresh
  setInterval(refreshData, REFRESH_INTERVAL);

  // Render loop
  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    controls.update();
    updateSimulation(delta);

    // Update minimap
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
