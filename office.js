'use strict';

const telegram = window.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();
telegram?.disableVerticalSwipes?.();

const elements = {
  app: document.querySelector('#app'),
  world: document.querySelector('#world'),
  canvas: document.querySelector('#city'),
  markers: document.querySelector('#markers'),
  status: document.querySelector('#connection'),
  note: document.querySelector('#note'),
  agents: document.querySelector('#agents'),
  jobs: document.querySelector('#job-status'),
  demo: document.querySelector('#demo'),
  demoLabel: document.querySelector('#demo-label'),
  panel: document.querySelector('#district'),
  panelMode: document.querySelector('#district-mode'),
  panelName: document.querySelector('#district-name'),
  panelText: document.querySelector('#district-description'),
  overview: document.querySelector('#overview'),
  help: document.querySelector('#world-help'),
  inspection: document.querySelector('#agent-inspection'),
  inspectionAgent: document.querySelector('#inspection-agent'),
  inspectionAction: document.querySelector('#inspection-action'),
  inspectionDetail: document.querySelector('#inspection-detail'),
  districtView: document.querySelector('#district-view'),
  newTask: document.querySelector('#new-task'),
  dialog: document.querySelector('#task-dialog'),
  taskForm: document.querySelector('#task-form'),
  orbital: document.querySelector('#orbital-status'),
  orbitalStage: document.querySelector('#orbital-stage'),
  orbitalDetail: document.querySelector('#orbital-detail'),
  taskProject: document.querySelector('#task-project'),
  sendFiles: document.querySelector('#send-files'),
  taskText: document.querySelector('#task-text'),
  taskMessage: document.querySelector('#task-message'),
  taskReceipt: document.querySelector('#task-receipt'),
  closeTask: document.querySelector('#close-task'),
  submitTask: document.querySelector('#submit-task'),
};

const districts = {
  hq: { name: 'Эмпайр-стейт-билдинг', label: 'Эмпайр-стейт', description: 'Кабинет тимлида и зал приёма сигналов.', color: 0xe4cda8, x: 0, z: -11, width: 10.7, depth: 9.2, height: 20.4 },
  moex: { name: 'MOEX Tower', label: 'MOEX', description: 'Биржевые терминалы, серверы и архив котировок.', color: 0xd4a387, x: -17, z: -12.8, width: 10, depth: 8, height: 8.2 },
  grants: { name: 'Центр грантов', label: 'Радар', description: 'Читальный зал и мониторинг публикаций.', color: 0xb6c4aa, x: 16.5, z: -12, width: 9, depth: 7.5, height: 6.8 },
  dev: { name: 'Dev Lab', label: 'Dev Lab', description: 'Столы разработчиков, тестовый стенд и серверная стойка.', color: 0xb38470, x: 16.3, z: 1.1, width: 10.8, depth: 7, height: 5.6 },
  lounge: { name: 'Зимний парк', label: 'Парк', description: 'Сквер с ёлкой у жилой улицы.', color: 0x69977b, x: -15, z: .8, width: 11, depth: 7, height: 3.6 },
};
const actionNames = {
  folders: 'Работает с файлами',
  coding: 'Пишет код',
  testing: 'Проверяет',
  reporting: 'Готовит отчёт',
  idle: 'Ожидает',
};
const legacyActions = {
  idle: 'idle', planning: 'folders', coding: 'coding',
  testing: 'testing', reviewing: 'folders', reporting: 'reporting', blocked: 'folders',
};

const profiles = [
  { id: 'coder', title: 'Coder', color: '#427868', home: { x: -11, color: 0xa9bbae, roof: 0x47665c } },
  { id: 'tester', title: 'QA', color: '#ad654f', home: { x: 11, color: 0xd29b83, roof: 0x83594c } },
  { id: 'reporter', title: 'Reporter', color: '#795f8b', home: { x: -22, color: 0xd8dbea, roof: 0x6d6280 } },
  { id: 'lead', title: 'Тимлид', color: '#426898', home: { x: 0, color: 0xe1c497, roof: 0x657e92 } },
  { id: 'scout', title: 'Scout', color: '#a77a39', home: { x: 22, color: 0xc3c09d, roof: 0x6a775f } },
  { id: 'job-moex', title: 'Сбор MOEX', color: '#72aaff', job: 'moex' },
  { id: 'job-grants', title: 'Радар грантов', color: '#67f5b0', job: 'grants' },
];

for (const profile of profiles.filter(item => item.home)) {
  districts[profile.id + '-home'] = {
    name: 'Дом · ' + profile.title, label: profile.title, description: 'Гостиная, рабочий стол и место для отдыха.',
    ...profile.home, z: 15.8, width: 6.1, depth: 5.3, height: 5, home: true,
  };
}

const empty = { action: 'idle', district: 'lounge', detail: '', files: [] };
const demoSnapshot = {
  agents: {
    coder: { project: 'dev', action: 'coding', detail: 'Собирает приложение' },
    tester: { project: 'grants', action: 'testing', detail: 'Проверяет радар' },
    reporter: { project: 'moex', action: 'folders', detail: 'Переносит архив на сервер' },
  },
};
const demoSignal = {
  agents: {
    ...demoSnapshot.agents,
    tester: { project: 'grants', action: 'testing', detail: 'Проверяет радар' },
    coder: { project: 'dev', action: 'reporting', detail: 'Передаёт результат сборки' },
  },
};
const orbitalLabels = {
  receiving: 'Космос → штаб',
  working: 'Штаб → агенты',
  returning: 'Штаб → космос',
  sent: 'Результат доставлен',
  blocked: 'Нужно внимание',
};
let relayStatus;
let relayTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const local = location.origin === 'http://127.0.0.1:8765';
const endpoint = local ? location.origin : window.OFFICE_CONFIG?.tunnel;
const initData = telegram?.initData ?? '';
const canConnect = Boolean(endpoint && (local || initData));
const cards = new Map();
const districtButtons = [...document.querySelectorAll('[data-district]')];
let city;
let displaySnapshot = {};
const orbitButton = document.getElementById('orbit-mode');
const walkButton = document.getElementById('walk-mode');
orbitButton.addEventListener('click', () => city?.walk(false));
walkButton.addEventListener('click', () => city?.walk(true));
let selected;
let selectedAgent;
let rows = new Map();
let socket;
let reconnect;
let liveData;
let forcedDemo = false;
let connecting = canConnect;
let demoInterval;
let liveFailure = false;
let taskRequest;
let submitting = false;

elements.newTask.hidden = !initData || !endpoint;

for (const profile of profiles.filter(profile => !profile.job)) {
  const card = document.createElement('article');
  card.className = 'agent';
  card.style.setProperty('--agent-color', profile.color);
  card.innerHTML = '<h3></h3><p></p><small></small><button class="agent-focus" type="button" aria-pressed="false">К агенту</button><details hidden><summary>Файлы</summary><div></div></details>';
  card.querySelector('h3').textContent = profile.title;
  elements.agents.append(card);
  const follow = card.querySelector('.agent-focus');
  follow.setAttribute('aria-label', 'К агенту ' + profile.title);
  follow.addEventListener('click', () => selectAgent(profile.id));
  cards.set(profile.id, {
    follow,
    action: card.querySelector('p'),
    detail: card.querySelector('small'),
    files: card.querySelector('details'),
    filesList: card.querySelector('details div'),
    filesKey: '',
  });
}

function normalize(row, profile) {
  const oldAction = Object.hasOwn(legacyActions, row?.phase) ? legacyActions[row.phase] : 'idle';
  const action = Object.hasOwn(actionNames, row?.action) ? row.action : oldAction;
  const project = ['moex', 'grants', 'dev'].includes(row?.project) ? row.project : profile.job;
  const district = action === 'idle' ? (profile.home ? profile.id + '-home' : 'lounge') : profile.id === 'lead' ? 'hq' : (project ?? 'dev');
  return {
    action, district,
    phase: row?.phase,
    detail: typeof row?.detail === 'string' ? row.detail : '',
    files: Array.isArray(row?.files) ? row.files.filter(file => typeof file === 'string').slice(0, 8) : [],
  };
}

function stateLabel(row) {
  return row.phase === 'blocked' ? 'Нужна помощь' : actionNames[row.action];
}

function apply(snapshot, snap = false) {
  displaySnapshot = snapshot;
  rows = new Map(profiles.map(profile => [
    profile.id,
    normalize(profile.job ? snapshot.jobs?.[profile.job] : snapshot.agents?.[profile.id], profile),
  ]));
  for (const [id, card] of cards) {
    const row = rows.get(id);
    card.action.textContent = stateLabel(row);
    card.detail.textContent = row.detail || districts[row.district].label;
    const filesKey = JSON.stringify(row.files);
    if (card.filesKey !== filesKey) {
      card.filesKey = filesKey;
      card.files.hidden = row.files.length === 0;
      card.filesList.replaceChildren(...row.files.map(file => {
        const entry = document.createElement('code');
        entry.textContent = file;
        return entry;
      }));
    }
  }
  const jobs = profiles.filter(profile => profile.job && rows.get(profile.id).action !== 'idle');
  elements.jobs.replaceChildren(...jobs.map(profile => {
    const line = document.createElement('span');
    const row = rows.get(profile.id);
    line.textContent = profile.title + ' · ' + (row.detail || stateLabel(row));
    return line;
  }));
  elements.jobs.hidden = !jobs.length;
  const nextRelay = snapshot.relay;
  const showRelay = nextRelay && Object.hasOwn(orbitalLabels, nextRelay.stage);
  const terminal = ['sent', 'blocked'].includes(nextRelay?.stage);
  const expiresIn = 90000 - (Date.now() - Date.parse(nextRelay?.updatedAt));
  relayStatus = showRelay && (!terminal || expiresIn > 0) ? nextRelay : null;
  clearTimeout(relayTimer);
  if (relayStatus && terminal) {
    relayTimer = setTimeout(() => { elements.orbital.hidden = true; }, expiresIn);
  }
  elements.orbital.hidden = !relayStatus;
  if (relayStatus) {
    elements.orbital.dataset.stage = relayStatus.stage;
    elements.orbitalStage.textContent = orbitalLabels[relayStatus.stage];
    elements.orbitalDetail.textContent = typeof relayStatus.detail === 'string' ? relayStatus.detail : '';
  }
  city?.update(rows, relayStatus, snap, displaySnapshot);
  if (selectedAgent) showDistrict(rows.get(selectedAgent)?.district, selectedAgent);
  else updateInspection();
}

function updateConnectionLabel() {
  const mode = forcedDemo ? 'demo' : liveData ? 'live' : connecting ? 'connecting' : 'demo';
  elements.status.dataset.mode = mode;
  elements.status.textContent = mode === 'live' ? 'В эфире' : mode === 'connecting' ? 'Связь…' : 'Демо';
  elements.note.textContent = forcedDemo ? 'Сценарий с активными агентами'
    : mode === 'live' ? 'Статусы обновляются с рабочего ПК'
      : connecting ? 'Подключаемся к рабочему ПК…'
        : liveFailure ? 'Нет связи с рабочим ПК. Демонстрация'
          : 'Живые статусы доступны из меню Telegram';
}

function showDemo() {
  clearTimeout(demoInterval);
  const stages = [
    ['receiving', 'Задание приходит в Эмпайр-стейт-билдинг', { agents: { lead: { action: 'folders', detail: 'Получает поручение' } } }, 4300],
    ['working', 'Агенты забрали задание в штабе', demoSnapshot, 10500],
    ['returning', 'Reporter вернул результат в штаб', demoSignal, 5500],
  ];
  function play(index) {
    const [stage, detail, snapshot, duration] = stages[index];
    apply({ ...snapshot, relay: { stage, detail, project: 'dev', updatedAt: new Date().toISOString() } });
    demoInterval = setTimeout(() => play((index + 1) % stages.length), duration);
  }
  play(0);
}

function acceptLive(state) {
  if (!state?.agents || typeof state.agents !== 'object') return false;
  const firstSnapshot = !liveData;
  liveData = state;
  connecting = false;
  liveFailure = false;
  if (!forcedDemo) {
    clearTimeout(demoInterval);
    apply(state, firstSnapshot);
  }
  updateConnectionLabel();
  return true;
}

function connect() {
  if (!canConnect) return;
  clearTimeout(reconnect);
  socket?.close();
  const url = new URL('/ws', endpoint);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const client = new WebSocket(url);
  socket = client;
  const deadline = setTimeout(() => client.close(), 6500);
  client.addEventListener('open', () => client.send(initData));
  client.addEventListener('message', event => {
    if (client !== socket) return;
    try {
      if (acceptLive(JSON.parse(event.data))) clearTimeout(deadline);
    } catch {
      client.close();
    }
  });
  client.addEventListener('close', async () => {
    clearTimeout(deadline);
    if (client !== socket) return;
    let state;
    try {
      const response = await fetch(new URL('/api/status', endpoint), {
        headers: initData ? { authorization: 'tma ' + initData } : {},
        signal: AbortSignal.timeout(4500),
      });
      state = response.ok ? await response.json() : null;
    } catch {
      state = null;
    }
    if (client !== socket) return;
    if (acceptLive(state)) {
      reconnect = setTimeout(connect, 5000);
      return;
    }
    const wasLive = Boolean(liveData) || connecting;
    liveData = null;
    liveFailure = true;
    connecting = false;
    if (!forcedDemo && wasLive) showDemo();
    updateConnectionLabel();
    reconnect = setTimeout(connect, 12000);
  });
}

function updateInspection() {
  elements.inspection.hidden = !selectedAgent;
  for (const [id, card] of cards) card.follow.setAttribute('aria-pressed', String(selectedAgent === id));
  if (!selectedAgent) return;
  const row = rows.get(selectedAgent) ?? empty;
  elements.inspectionAgent.textContent = profiles.find(profile => profile.id === selectedAgent).title;
  elements.inspectionAction.textContent = '· ' + stateLabel(row);
  elements.inspectionDetail.textContent = row.detail;
  elements.inspectionDetail.hidden = !row.detail;
}

function selectAgent(id) {
  selectDistrict((rows.get(id) ?? empty).district, id);
}

function showDistrict(id, agentId) {
  selected = id;
  selectedAgent = agentId;
  if (id) elements.app.dataset.focused = '';
  else delete elements.app.dataset.focused;
  elements.panel.hidden = !id;
  for (const button of districtButtons) button.setAttribute('aria-pressed', String(button.dataset.district === id));
  if (id) {
    const district = districts[id];
    elements.panel.style.setProperty('--district-color', district.color);
    elements.panelMode.textContent = agentId ? 'Камера агента' : id === 'lounge' ? 'Сквер' : 'Интерьер';
    elements.panelName.textContent = district.name;
    elements.panelText.textContent = district.description;
  }
  updateInspection();
}

function selectDistrict(id, agentId) {
  showDistrict(id, agentId);
  city?.select(id, agentId);
}

function toggleDemo() {
  forcedDemo = !forcedDemo;
  elements.demo.setAttribute('aria-pressed', String(forcedDemo));
  elements.demoLabel.textContent = forcedDemo ? 'Рабочий режим' : 'Демо';
  clearTimeout(demoInterval);
  if (forcedDemo) {
    apply({ agents: {} }, true);
    showDemo();
    selectDistrict(null);
  } else if (liveData) {
    apply(liveData, true);
  } else {
    showDemo();
    connect();
  }
  updateConnectionLabel();
}

elements.newTask.addEventListener('click', () => {
  if (!elements.taskText.value && ['moex', 'grants', 'dev'].includes(selected)) elements.taskProject.value = selected;
  elements.dialog.showModal();
  elements.taskText.focus();
});
elements.closeTask.addEventListener('click', () => elements.dialog.close());
elements.taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  const task = elements.taskText.value.trim();
  const project = elements.taskProject.value;
  const sendFiles = elements.sendFiles.checked;
  elements.taskMessage.hidden = false;
  if (!task) {
    elements.taskMessage.textContent = 'Опишите задание.';
    elements.taskText.focus();
    return;
  }
  if (taskRequest?.task !== task || taskRequest?.project !== project || taskRequest?.sendFiles !== sendFiles) {
    taskRequest = { requestId: crypto.randomUUID(), project, task, sendFiles };
  }
  submitting = true;
  elements.submitTask.disabled = true;
  elements.taskForm.setAttribute('aria-busy', 'true');
  elements.taskMessage.textContent = 'Запускаем задание…';
  try {
    const response = await fetch(new URL('/api/tasks', endpoint), {
      method: 'POST',
      headers: { authorization: 'tma ' + initData, 'content-type': 'application/json' },
      body: JSON.stringify(taskRequest),
      signal: AbortSignal.timeout(16000),
    });
    const result = await response.json();
    if (!response.ok) {
      elements.taskMessage.textContent = result.error ?? 'Сервис заданий временно недоступен.';
      return;
    }
    elements.taskReceipt.textContent = 'Задание принято · ' + result.label + '. Отчёт появится в чате.';
    elements.taskReceipt.hidden = false;
    elements.taskText.value = '';
    elements.sendFiles.checked = false;
    elements.taskMessage.hidden = true;
    taskRequest = undefined;
    elements.dialog.close();
  } catch {
    elements.taskMessage.textContent = 'Связь прервалась. Повторите отправку с тем же текстом.';
  } finally {
    submitting = false;
    elements.submitTask.disabled = false;
    elements.taskForm.removeAttribute('aria-busy');
  }
});
for (const button of districtButtons) button.addEventListener('click', () => selectDistrict(button.dataset.district));
elements.overview.addEventListener('click', () => selectDistrict(null));
elements.districtView.addEventListener('click', () => selectDistrict(selected));
elements.demo.addEventListener('click', toggleDemo);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && socket?.readyState !== WebSocket.OPEN) connect();
});

const boardToggle = document.getElementById('board-toggle');
const board = document.getElementById('board');
const settings = document.getElementById('settings-dialog');
const musicButton = document.getElementById('music-toggle');
const field = Object.fromEntries(['light', 'transport', 'snow', 'music', 'volume'].map(id => [id, document.getElementById(id)]));
const defaults = Object.freeze({ light: 'day', transport: 'mixed', snow: true, volume: 30 });
const storageKey = 'ai-hub-winter-v1';
let townOptions = { ...defaults };
let drag;
let skipClick = false;
let musicEnabled = false;
let score;
let audioRevision = 0;
const musicReady = import('city/music').then(module => { score = module.createScore(); return score; });

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (['day', 'auto', 'dusk', 'night'].includes(saved?.light)) townOptions.light = saved.light;
  if (['mixed', 'walk', 'car'].includes(saved?.transport)) townOptions.transport = saved.transport;
  if (typeof saved?.snow === 'boolean') townOptions.snow = saved.snow;
  if (Number.isFinite(saved?.volume)) townOptions.volume = Math.min(100, Math.max(0, saved.volume));
} catch {
  // Browser privacy settings may disable persistent preferences.
}

function setFolded(folded) {
  elements.app.toggleAttribute('data-folded', folded);
  boardToggle.setAttribute('aria-expanded', String(!folded));
  document.getElementById('board-label').textContent = folded ? 'Показать панель' : 'Свернуть панель';
  board.inert = folded;
  city?.layout();
}

boardToggle.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  drag = { id: event.pointerId, start: event.clientY };
  boardToggle.setPointerCapture(event.pointerId);
});
boardToggle.addEventListener('pointerup', event => {
  if (drag?.id !== event.pointerId) return;
  const distance = event.clientY - drag.start;
  drag = undefined;
  if (Math.abs(distance) < 24) return;
  setFolded(distance > 0);
  skipClick = true;
  setTimeout(() => { skipClick = false; }, 350);
});
boardToggle.addEventListener('pointercancel', () => { drag = undefined; });
boardToggle.addEventListener('click', () => {
  if (skipClick) { skipClick = false; return; }
  setFolded(!elements.app.hasAttribute('data-folded'));
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || settings.open || elements.dialog.open) return;
  if (elements.app.hasAttribute('data-walking')) city?.walk(false);
  else if (elements.app.hasAttribute('data-folded')) setFolded(false);
  else if (selected) selectDistrict(null);
});

function refreshSettings() {
  field.light.value = townOptions.light;
  field.transport.value = townOptions.transport;
  field.snow.checked = townOptions.snow;
  field.music.checked = musicEnabled;
  field.volume.value = townOptions.volume;
  document.getElementById('volume-value').value = townOptions.volume + '%';
  musicButton.setAttribute('aria-pressed', String(musicEnabled));
  musicButton.setAttribute('aria-label', musicEnabled ? 'Выключить музыку' : 'Включить музыку');
}

function updateOptions() {
  try { localStorage.setItem(storageKey, JSON.stringify(townOptions)); } catch {}
  city?.setOptions(townOptions);
  score?.setVolume(townOptions.volume / 100);
  refreshSettings();
}

function applyLight() {
  const hour = new Date().getHours();
  const light = townOptions.light === 'auto' ? (hour >= 8 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'dusk' : 'night') : townOptions.light;
  elements.app.dataset.light = light;
  document.querySelector('meta[name="theme-color"]').content = { day: '#e8f0f5', dusk: '#ac9bbd', night: '#354660' }[light];
  return light;
}

async function toggleMusic(enabled) {
  musicEnabled = enabled;
  const revision = ++audioRevision;
  if (!enabled) {
    score?.stop();
    refreshSettings();
    return;
  }
  try {
    const player = score ?? await musicReady;
    if (revision !== audioRevision || document.hidden) return;
    player.setVolume(townOptions.volume / 100);
    await player.start();
    if (!musicEnabled || document.hidden) player.stop();
  } catch {
    if (revision === audioRevision) musicEnabled = false;
  } finally {
    refreshSettings();
  }
}

for (const name of ['light', 'transport', 'snow', 'volume']) {
  field[name].addEventListener(name === 'volume' ? 'input' : 'change', () => {
    townOptions[name] = name === 'snow' ? field[name].checked : name === 'volume' ? Number(field[name].value) : field[name].value;
    applyLight();
    updateOptions();
  });
}
field.music.addEventListener('change', () => toggleMusic(field.music.checked));
musicButton.addEventListener('click', () => toggleMusic(!musicEnabled));
document.getElementById('settings-toggle').addEventListener('click', () => settings.showModal());
document.getElementById('reset-settings').addEventListener('click', () => {
  townOptions = { ...defaults };
  void toggleMusic(false);
  applyLight();
  updateOptions();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { audioRevision++; score?.stop(); }
  else if (musicEnabled) void toggleMusic(true);
});
setInterval(() => { if (townOptions.light === 'auto') city?.setOptions(townOptions); }, 30000);
applyLight();
refreshSettings();


updateConnectionLabel();
if (canConnect) apply({ agents: {} }, true);
else showDemo();
connect();

Promise.all([
  import('three'), import('three/addons/controls/OrbitControls.js'),
  import('city/world'), import('city/navigation'), import('city/displays'),
])
  .then(([THREE, { OrbitControls }, world, navigation, displays]) => {
    city = createCity(THREE, OrbitControls, world, navigation, displays);
    walkButton.disabled = false;
    city.update(rows, relayStatus, Boolean(liveData), displaySnapshot);
    city.setOptions(townOptions);
    if (selected) selectDistrict(selected, selectedAgent);
  })
  .catch(error => {
    console.error('Не удалось создать город', error);
    elements.world.dataset.fallback = 'true';
    elements.canvas.hidden = true;
    elements.help.textContent = '3D недоступно. Задачи и статусы доступны в панели.';
    elements.help.hidden = false;
  });

function createCity(THREE, OrbitControls, world, navigation, displays) {
  const vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc9dce8, .0055);
  const renderer = new THREE.WebGLRenderer({ canvas: elements.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const landscape = world.createWorld(THREE, renderer, scene);
  const { materials } = landscape;
  const screenViews = [];
  const boards = [];
  const camera = new THREE.OrthographicCamera(-36, 36, 23, -23, .1, 320);
  const controls = new OrbitControls(camera, elements.canvas);
  controls.enableDamping = true;
  controls.enablePan = true;
  controls.maxTargetRadius = 39;
  controls.minPolarAngle = .37;
  controls.maxPolarAngle = 1.37;
  controls.minZoom = .46;
  controls.maxZoom = 12;
  const angle = vec(43, 55, 73);
  const center = vec(0, 2.1, -.6);
  controls.target.copy(center);
  camera.position.copy(center).add(angle);
  controls.update();

  const sky = new THREE.HemisphereLight(0xe6f7ff, 0xa3ab9d, 1.5);
  const sun = new THREE.DirectionalLight(0xffeed2, 2.15);
  sun.position.set(-42, 21, 27);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(matchMedia('(pointer: coarse)').matches ? 768 : 1536);
  Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 42, bottom: -42, near: 1, far: 112 });
  sun.shadow.normalBias = .049;
  sun.shadow.bias = -.00013;
  const fill = new THREE.DirectionalLight(0xc5ddf9, .64);
  fill.position.set(13, 8, -10);
  scene.add(sky, sun, fill);

  const palette = new Map();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.SphereGeometry(1, 10, 7);
  const point = new THREE.ConeGeometry(1, 1, 8);
  function paint(color) {
    if (!palette.has(color)) palette.set(color, new THREE.MeshStandardMaterial({ color, roughness: .83 }));
    return palette.get(color);
  }
  const places = new Map();
  function group(parent, x = 0, y = 0, z = 0) {
    const object = new THREE.Group();
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }
  function solid(parent, geometry, color, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(geometry, typeof color === 'object' ? color : paint(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }
  function box(parent, color, x, y, z, w, h, d) {
    return solid(parent, unit, color, x, y, z, w, h, d);
  }

  const powder = 0xf8fbfa;
  const timber = 0x9e7655;
  const trim = 0xf6e9d4;
  const pane = materials.glass.clone();
  pane.emissive.setHex(0xe7ba7d);
  pane.emissiveIntensity = .07;
  const bulbs = [0xf1915f, 0x619975, 0xf5ce78, 0xffe3ac].map(color => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .38 }));
  const base = group(scene);
  box(base, materials.snow, 0, -.055, 0, 78, .13, 67).receiveShadow = true;

  function street(x, z, w, d) {
    box(base, 0xa8b5ba, x, .094, z, w + .38, .13, d + .38);
    const road = box(base, materials.asphalt, x, .132, z, w, .074, d);
    road.receiveShadow = true;
  }
  for (const x of navigation.roads.avenues) {
    street(x, 8.48, 2.76, 27.12);
    for (const side of [-1,1]) box(base, 0xd3dad8, x + side*1.55, .173, 8.38, .37, .07, 27.18);
  }
  const drain = new THREE.CylinderGeometry(.30, .30, .025, 18);
  const packed = new THREE.SphereGeometry(1, 8, 5);
  for (const [row,z] of navigation.roads.crossStreets.entries()) {
    const half = navigation.roads.halfWidths[row];
    street(0, z, 64, half*2);
    for (const sign of [-1,1]) box(base, 0xc1cfce, 0, .177, z + sign*(half+.37), 62, .06, .71);
    for (let x = -30; x < 31; x += 2.7) {
      if (navigation.roads.avenues.every(v => Math.abs(v-x) > 1.7)) box(base, 0xd8d6b9, x, .178, z, .93, .02, .058);
      for (const side of [-1,1]) {
        const n = Math.sin(x * 3.6 + row);
        solid(base, packed, row === 1 ? 0xc0cdcf : 0xdde8e9, x, .167, z + side * (half+.04+n*.07), .54 + Math.abs(n)*.37, .064 + Math.abs(n)*.065, .16+n*.05);
      }
    }
    for (const x of [-20.2,-8.1,11.73,22.43]) {
      solid(base, drain, 0x525c5c, x, .183, z+.84, 1,1,1);
      for (const delta of [-.15,0,.15]) box(base, 0x829291, x + delta,.197,z+.84,.032,.013,.42);
    }
    for (const x of navigation.roads.avenues) {
      for (let step=-2;step<=2;step++) {
        for (const side of [-1,1]) box(base, 0xebeee4, x+side*1.46,.192,z+step*.48,.76,.026,.24);
        box(base, 0xebeee4, x+step*.40,.195,z+1.45,.22,.025,.59);
      }
    }
  }
  function pine(parent, x, y, z, size = 1, holiday = false) {
    const tree = group(parent, x, y, z);
    tree.scale.setScalar(size);
    box(tree, 0x785b48, 0, .48, 0, .22, .95, .22);
    for (let level = 0; level < 3; level++) {
      const radius = 1.01 - level * .21;
      const height = 1.42 - level * .14;
      const bottom = .63 + level * .66;
      solid(tree, point, [0x3f6b5d, 0x49786b, 0x548270][level], 0, bottom + height / 2, 0, radius, height, radius);
      solid(tree, point, powder, 0, bottom + height * .64, 0, radius * .77, height * .77, radius * .77);
      if (holiday) {
        for (let n = 0; n < 6; n++) {
          const theta = n * Math.PI / 3 + level * .64;
          solid(tree, ball, bulbs[(level + n) % bulbs.length], Math.cos(theta) * radius * .79, bottom + .23, Math.sin(theta) * radius * .79, .073, .073, .073);
        }
      }
    }
    if (holiday) solid(tree, ball, bulbs[2], 0, 3.13, 0, .16, .16, .16);
    return tree;
  }
  function lamp(parent, x, z) {
    const post = 0x4b5e60;
    box(parent, post, x, 1.17, z, .088, 2.3, .088);
    box(parent, yellowGlass, x, 2.37, z, .21, .28, .21);
    box(parent, post, x, 2.53, z, .28, .07, .28);
    for (let n=0;n<7;n++) {
      const angle = n * 1.9;
      solid(parent, ball, bulbs[2], x + Math.sin(angle)*.073, .55+n*.22, z+Math.cos(angle)*.073,.043,.043,.043);
    }
  }
  const yellowGlass = new THREE.MeshStandardMaterial({ color: 0xffdb9e, emissive: 0xffba64, emissiveIntensity: .3 });
  for (const x of [-24, -16, -8, 8, 16, 24]) {
    lamp(base, x + .3, 5.13);
    if (x % 16 !== 0) pine(base, x + 2, .08, 10.6, .62);
  }
  for (const [x, z, size] of [[-29,-20,1.24],[-25,-19,.85],[-12,-20,1.15],[-8,-21,1.1],[7,-20,1],[12,-21,.88],[24,-18,1.22],[27,-16,1.04],[29,-2,1.05],[-29,13,.91],[29,16,1.2],[-29,21,.9]]) {
    pine(base, x, .06, z, size);
  }

  function batchStatic(parent) {
    const groups = new Map();
    for (const object of parent.children) {
      if (!object.isMesh || object.isInstancedMesh) continue;
      const key = [object.geometry.id,object.material.id,object.receiveShadow].join(':');
      const list = groups.get(key) ?? [];
      list.push(object);
      groups.set(key,list);
    }
    for (const objects of groups.values()) {
      if (objects.length < 4) continue;
      const [model] = objects;
      const batch = new THREE.InstancedMesh(model.geometry, model.material, objects.length);
      batch.receiveShadow = model.receiveShadow;
      objects.forEach((object,index) => {
        object.updateMatrix();
        batch.setMatrixAt(index,object.matrix);
        parent.remove(object);
      });
      parent.add(batch);
    }
  }

  function holidayMarket() {
    const square = group(base, -23.5, .08, 1.62);
    box(square, 0xc7d2ce, 0, .09, 0, 5.43, .14, 5.23);
    for (const x of [-1.35, 1.34]) {
      const booth = group(square, x, 0, -.73);
      const color = x < 0 ? 0xa36856 : 0x5f8573;
      box(booth, color, 0, .44, 0, 1.83, .68, 1.22);
      box(booth, timber, 0, .82, .12, 1.92, .12, 1.37);
      for (const side of [-.87, .87]) {
        box(booth, color, side, 1.29, .52, .11, .96, .11);
        box(booth, color, side, 1.29, -.54, .11, .96, .11);
      }
      roof(booth, color, 1.96, 1.46, 1.72, .55);
      roof(booth, powder, 2.02, 1.49, 1.8, .55);
      for (let light = 0; light < 5; light++) solid(booth, ball, bulbs[light % bulbs.length], (light - 2) * .38, 1.71, .77, .07, .07, .07);
      box(booth, 0xc68a65, -.36, .93, .37, .21, .16, .19);
      box(booth, 0x728a74, .12, .92, .41, .29, .13, .22);
    }
    for (const [x, z] of [[-1.80, 1.41], [1.75, 1.24]]) {
      const table = group(square, x, .16, z);
      box(table, 0x676f68, 0, .42, 0, .12, .77, .12);
      box(table, timber, 0, .83, 0, .71, .096, .70);
      solid(table, ball, yellowGlass, .18, .93, .1, .087, .076, .087);
    }
    pine(square, 0, .11, 1.74, .62, true);
  }
  holidayMarket();
  batchStatic(base);

  function windowSet(parent, coords, size, side = false) {
    const [w, h] = size;
    const layers = [[trim, w + .11, h + .12, 0, 0], [pane, w, h, .055, 0], [trim, .045, h, .082, 0], [trim, w, .047, .085, 0], [trim, w + .2, .07, .085, -h / 2 - .07]];
    const transform = new THREE.Object3D();
    transform.rotation.y = side ? Math.PI / 2 : 0;
    for (const [material, sx, sy, normal, dy] of layers) {
      const layer = new THREE.InstancedMesh(unit, typeof material === 'object' ? material : paint(material), coords.length);
      coords.forEach(([x, y, z], index) => {
        transform.position.set(x + (side ? normal : 0), y + dy, z + (side ? 0 : normal));
        transform.scale.set(sx, sy, .063);
        transform.updateMatrix();
        layer.setMatrixAt(index, transform.matrix);
      });
      parent.add(layer);
    }
  }

  function apartment(info, x, y, z, w, h, d, wall, columns, floors) {
    const surface = (info.id === 'dev' || info.id === 'moex') ? materials.brick : materials.limestone;
    const outer = surface.clone();
    outer.color.setHex(wall);
    if (y < .5) {
      const section = (w-1.96)/2;
      for (const side of [-1,1]) {
        box(info.exterior, outer, x+side*(w/2-.13), y+h/2,z,.26,h,d);
        box(info.exterior, outer, x+side*(1.96/2+section/2),y+h/2,z+d/2-.13,section,h,.26);
      }
      box(info.exterior, outer, x,y+h/2,z-d/2+.13,w,h,.26);
      box(info.exterior, outer, x,y+(h+2.26)/2,z+d/2-.13,1.96,h-2.26,.26);
      box(info.exterior, outer,x,y+h-.18,z,w,.33,d);
    } else box(info.exterior, outer,x,y+h/2,z,w,h,d);
    box(info.exterior, trim, x, y + h - .065, z, w + .16, .12, d + .16);
    box(info.exterior, powder, x, y + h + .05, z, w + .27, .12, d + .27);
    const face = [], side = [];
    for (let level = 0; level < floors; level++) {
      const wy = y + (.64 + level) * h / (floors + .18);
      for (let col = 0; col < columns; col++) {
        const fraction = (col + 1) / (columns + 1) - .5;
        if (y > .5 || level > 0 || Math.abs(fraction*w) > 1.22) face.push([x + fraction * w, wy, z + d / 2]);
        side.push([x + w / 2, wy, z + fraction * d]);
      }
    }
    windowSet(info.exterior, face, [Math.min(.85, w / columns * .59), Math.min(1.17, h / floors * .59)]);
    windowSet(info.exterior, side, [Math.min(.8, d / columns * .57), Math.min(1.17, h / floors * .59)], true);
  }

  function roof(parent, color, w, d, y, height) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(0, height);
    shape.lineTo(w / 2, 0);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { bevelEnabled: false, depth: d });
    solid(parent, geometry, color, 0, y, -d / 2, 1, 1, 1);
  }

  const wreathShape = new THREE.TorusGeometry(1,.25,8,22);
  function wreath(parent,x,y,z,scale) {
    solid(parent,wreathShape,0x2e6654,x,y,z,scale,scale,scale);
    for (let n=0;n<8;n++) {
      const angle = n*Math.PI/4;
      solid(parent,ball,bulbs[n % 3], x+Math.sin(angle)*scale, y+Math.cos(angle)*scale,z+scale*.22,scale*.17,scale*.17,scale*.17);
    }
    box(parent,0xbc5954,x,y-scale*.95,z+.055,scale*.9,scale*.30,scale*.18);
  }
  function frontDoor(info, y, z, doorColor) {
    const outside = info.exterior;
    box(outside, trim, 0, y + .77, z, 1.22, 1.58, .18);
    box(outside, doorColor, 0, y + .74, z + .11, .88, 1.44, .11);
    box(outside, pane, 0, y + .98, z + .174, .55, .57, .03);
    solid(outside, ball, bulbs[2], .30, y + .6, z + .19, .053, .053, .048);
    box(info.root, 0xb2aca0, 0, .23, z + .3, 1.52, .16, .64);
  }

  function homeExterior(info) {
    const { width: w, depth: d, color, roof: roofColor } = info.spec;
    const outside = info.exterior;
    const siding = materials.limestone.clone();
    siding.color.setHex(color);
    box(outside, siding, 0, 1.59, 0, w, 2.47, d);
    for (const x of [-w / 2, w / 2]) box(outside, trim, x, 1.59, d / 2, .125, 2.5, .116);
    box(outside, trim, 0, .53, 0, w + .035, .18, d + .045);
    roof(outside, roofColor, w + .58, d + .55, 2.81, 1.94);
    roof(outside, powder, w + .62, d + .59, 2.91, 1.97);
    box(outside, 0xa17868, -1.63, 4.01, -.86, .48, 1.42, .48);
    box(outside, powder, -1.63, 4.74, -.86, .55, .15, .55);
    windowSet(outside, [[-1.9,1.62,d/2],[1.9,1.62,d/2],[0,3.37,d/2+.34]], [.98,.91]);
    windowSet(outside, [[w/2,1.61,-1.28],[w/2,1.61,1.28]], [.97,.87], true);
    frontDoor(info, .35, d / 2 + .04, roofColor);
    wreath(outside,0,2.11,d/2+.21,.21);
    for (let n = 0; n < 12; n++) {
      const x = (n - 5.5) * .48;
      solid(outside, ball, bulbs[n % bulbs.length], x, 2.68 - Math.sin(n * Math.PI / 11) * .15, d / 2 + .15, .07, .07, .07);
    }
    pine(info.root, -2.63, .09, d / 2 + .58, .47, true);
    box(info.root, 0xc8d2d3, 0, .12, d / 2 + 1.1, 1.18, .06, 1.78);
  }

  function officeExterior(info) {
    const { id, spec: { width: w, depth: d, color } } = info;
    if (id === 'hq') {
      apartment(info, 0, .36, 0, w, 7.2, d, color, 6, 4);
      apartment(info, 0, 7.55, -.14, 8.5, 5.12, 7.1, 0xd6c2a2, 5, 3);
      apartment(info, 0, 12.65, -.26, 6.27, 3.93, 5.3, 0xd9c8aa, 4, 3);
      apartment(info, 0, 16.57, -.31, 3.15, 1.78, 2.94, 0xd8d1bc, 2, 1);
      box(info.exterior, 0xc1a98e, 0, 18.62, -.32, 1.63, .55, 1.55);
      box(info.exterior, 0x788a96, 0, 19.56, -.32, .15, 1.91, .15);
      solid(info.exterior, ball, bulbs[2], 0, 20.58, -.32, .115, .115, .115);
      for (const x of [-4.35,-2.62,2.62,4.35]) box(info.exterior, trim, x, 3.92, d / 2 + .095, .14, 6.87, .13);
    } else {
      apartment(info, 0, .36, 0, w, id === 'moex' ? 5.8 : 4.35, d, color, 5, 2);
      if (id === 'moex') {
        apartment(info, 0, 6.14, -.55, 5.7, 1.58, 5.3, 0xd8c5aa, 3, 1);
        for (const x of [-3.9,-2.65,2.65,3.9]) box(info.exterior, trim, x, 1.95, d / 2 + .22, .22, 3.0, .23);
      } else {
        box(info.exterior, 0x657d78, 0, 4.89, -.28, w - .22, .27, d - .25);
        box(info.exterior, powder, 0, 5.061, -.28, w - .1, .11, d - .12);
      }
    }
    const z = d/2 + .008;
    info.door = { fraction: 0, panels: [] };
    for (const sign of [-1,1]) {
      box(info.exterior, 0xd3b79a, sign*1.034, 1.49,z,.105,2.26,.19);
      const hinge = group(info.exterior, sign*.98,.355,z-.085);
      box(hinge, 0x405d58, -sign*.479,1.106,0,.958,2.21,.095);
      box(hinge, pane, -sign*.48,1.51,.061,.71,1.01,.03);
      box(hinge, trim, -sign*.82,.92,.077,.063,.22,.036);
      info.door.panels.push([hinge,sign]);
    }
    box(info.exterior, 0xcab090,0,2.667,z,2.18,.17,.2);
    box(info.root, 0xc0b4a6, 0,.22,z+.29,2.23,.24,.75);
    box(info.root, 0xd0c7ba, 0,.35,z+.12,2.1,.15,.46);
    wreath(info.exterior, 0, 2.87, z+.153, .28);
    if (id === 'hq') {
      const adSlots = [['market',-3.37,3.4,2.83,1.42],['grants',3.37,3.4,2.83,1.42],['holiday',0,5.62,6.8,2.45]];
      for (const [section,x,y,w,h] of adSlots) {
        const billboard = displays.billboard(THREE, section);
        box(info.exterior, 0x33454b,x,y,z+.15,w+.17,h+.16,.19);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(w,h),billboard.material);
        face.position.set(x,y,z+.265);
        info.exterior.add(face);
        boards.push(billboard);
      }
    }
    for (let n=0; n<Math.floor(w*3);n++) {
      const x = -.46*w + n*.92*w/(Math.floor(w*3)-1);
      solid(info.exterior, ball, bulbs[2], x,2.55 + Math.abs(Math.sin(n*.36))*.20,z+.205,.043,.043,.043);
    }
    for (const x of [-2.6, 2.6]) {
      box(info.root, 0xb8a08b, x, .22, d / 2 + .81, .65, .25, .63);
      pine(info.root, x, .21, d / 2 + .81, .43, true);
    }
  }

  function furniture(info) {
    const { width: w, depth: d, home, color } = info.spec;
    const room = info.room;
    box(room, home ? 0xd7ab7c : 0xdbbe9e, 0, .36, 0, w, .16, d);
    for (let x = -w / 2 + .33; x < w / 2; x += .37) box(room, 0xe9cba8, x, .445, 0, .03, .012, d - .035);
    box(room, color, 0, 1.31, -d / 2 + .08, w, 1.77, .16);
    box(room, color, -w / 2 + .08, 1.31, -.89, .16, 1.77, d - 1.76);
    windowSet(room, [[-1.1,1.53,-d/2+.19],[1.1,1.53,-d/2+.19]], [1.08,.86]);
    const rug = home ? 0xa77565 : 0x9aaf9d;
    box(room, 0xe8dccc, 0, .462, .75, w * .61, .026, d * .55);
    box(room, rug, 0, .482, .75, w * .57, .018, d * .49);
    const sofa = home ? 0x819d85 : 0x8d8179;
    box(room, sofa, -w * .25, .64, -.30, .83, .39, 1.6);
    box(room, sofa, -w * .25 - .31, .86, -.3, .19, .52, 1.66);
    for (const offset of [-.76, .76]) box(room, 0xc6cfb4, -w * .25, .78, -.3 + offset, .87, .24, .17);
    box(room, timber, -w * .12, .71, .25, .55, .13, .9);
    box(room, trim, -w * .12, .794, .39, .23, .05, .24);
    const desk = (x, z) => {
      box(room, timber, x, .94, z, 1.55, .12, .67);
      for (const offset of [-.64,.64]) box(room, 0x535e5c, x + offset, .69, z, .086, .49, .50);
      box(room, 0x48626a, x, 1.24, z -.18, .74, .47, .08);
      if (!home) {
        const screen = displays.monitor(THREE);
        const display = new THREE.Mesh(new THREE.PlaneGeometry(1.06,.596),screen.material);
        display.position.set(x,1.48,z-.106);
        box(room, 0x2d4043,x,1.48,z-.163,1.14,.66,.075);
        room.add(display);
        screenViews.push({ location: info.id, screen });
        info.obstacles.push([info.spec.x+x-.78,info.spec.x+x+.78,info.spec.z+z-.34,info.spec.z+z+.34]);
      } else box(room, 0xa7c8cc, x, 1.25, z -.128, .64, .37, .034);
      box(room, 0x5b696d, x + .06, 1.02, z + .15, .49, .04, .18);
      box(room, 0x8c765f, x, .71, z + .67, .47, .115, .44);
      box(room, 0x8c765f, x, .94, z + .86, .47, .4, .08);
    };
    desk(w * .22, -d * .28);
    if (home) {
      box(room, 0xcabaa3, w * .28, .68, d * .25, 1.11, .43, 1.61);
      box(room, color, w * .28, .91, d * .26, 1.11, .13, 1.45);
      box(room, powder, w * .28, .99, d * .42, .91, .12, .33);
    } else if (info.id === 'hq') {
      desk(-w * .25, -d * .26);
      box(room, 0x7d5d48, -w*.22, .91, .76, 1.78, .16, 1.15);
      solid(room, ball, yellowGlass, -w*.22, 1.12, .6, .15, .15, .15);
    } else {
      desk(w * .24, d * .19);
      for (let layer = 0; layer < 5; layer++) {
        box(room, 0x536a71, -w * .38, .64 + layer * .22, -d * .35, .62, .16, .59);
        box(room, bulbs[layer % bulbs.length], -w * .38 + .19, .64 + layer * .22, -d * .35 + .31, .05, .039, .027);
      }
    }
    pine(room, -w * .36, .45, d * .30, home ? .52 : .64, true);
    info.work = vec(info.spec.x + w * .22 + (home ? 0 : .53), .46, info.spec.z - d * .28 + .82);
  }

  function plaza(info) {
    const court = info.root;
    box(court, 0xdbe5e2, 0, .12, 0, 10.7, .13, 6.9);
    box(court, 0xc6d4d7, 0, .204, 0, 5.5, .06, 5.5);
    const tree = pine(court, 0, .23, -.12, 2.06, true);
    for (let n=0;n<69;n++) {
      const t = n/68;
      const angle = t*Math.PI*12.6;
      const radius = 1.01*(1-t*.83);
      solid(tree,ball,bulbs[2], Math.cos(angle)*radius,.68+t*2.3,Math.sin(angle)*radius,.049,.049,.049);
    }
    const star = new THREE.Shape();
    for (let n=0;n<10;n++) {
      const angle = n*Math.PI/5+Math.PI/2;
      const radius = n%2 ? .14 : .32;
      const x = Math.cos(angle)*radius;
      const y = Math.sin(angle)*radius;
      if (n===0) star.moveTo(x,y);
      else star.lineTo(x,y);
    }
    star.closePath();
    solid(tree,new THREE.ExtrudeGeometry(star,{ depth:.06,bevelEnabled:false }),bulbs[2],0,3.35,0,1,1,1);
    for (const x of [-2.0, 1.97]) {
      box(court, 0xb98168, x, .32, .78, .67, .26, .47);
      box(court, trim, x, .465, .78, .13, .036, .48);
      lamp(court, x * 2, .18);
    }
  }

  for (const [id, spec] of Object.entries(districts)) {
    const root = group(scene, spec.x, 0, spec.z);
    const info = { id, spec: { ...spec, id }, root, exterior: group(root), room: group(root), obstacles: [], work: vec(spec.x, .17, spec.z) };
    box(root, 0xb7c9cc, .21, .115, -.23, spec.width + .95, .16, spec.depth + .92);
    box(root, materials.snow, 0, .204, 0, spec.width + .36, .085, spec.depth + .37);
    if (id === 'lounge') plaza(info);
    else {
      if (spec.home) homeExterior(info);
      else officeExterior(info);
      furniture(info);
    }
    batchStatic(info.exterior);
    batchStatic(info.room);
    info.room.visible = false;
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'marker';
    marker.innerHTML = '<b></b><em hidden></em>';
    marker.querySelector('b').textContent = spec.label;
    marker.setAttribute('aria-label', spec.name);
    marker.toggleAttribute('data-home', Boolean(spec.home));
    marker.addEventListener('click', () => selectDistrict(id));
    elements.markers.append(marker);
    info.marker = marker;
    places.set(id, info);
  }

  const wheel = new THREE.CylinderGeometry(.20, .20, .135, 10);
  const makeCar = (parent, color) => {
    const car = group(parent);
    box(car, color, 0, .32, 0, .95, .39, 1.90);
    box(car, 0x78949d, 0, .57, -.10, .78, .31, .99);
    box(car, color, 0, .75, -.11, .77, .07, .81);
    for (const x of [-.47,.47]) {
      for (const z of [-.62,.62]) solid(car, wheel, 0x2e3839, x, .215, z, 1, 1, 1).rotation.z = Math.PI / 2;
      box(car, trim, x * .7, .42, .95, .165, .09, .024);
      box(car, 0xc45145, x * .71, .41, -.95, .165, .08, .024);
    }
    return car;
  };
  for (const [x,z,color] of [[-22,6.59,0xb87569],[13.4,9.06,0x657e90],[23,-6.55,0xf4e3c0],[-18,20.64,0x698976],[9,22.04,0x9a7777]]) {
    const parked = makeCar(scene, color);
    parked.position.set(x,.14,z);
    parked.rotation.y = Math.PI / 2;
  }

  function makeAgent(profile, index) {
    const rig = group(scene);
    const body = group(rig);
    const coat = parseInt(profile.color.slice(1), 16);
    box(body, coat, 0, .71, 0, .35, .44, .26);
    box(body, 0xf1d4a3, 0, .92, .025, .38, .105, .30);
    box(body, 0xf1d4a3, -.11, .78, .153, .105, .24, .055);
    solid(body, ball, [0xc89371,0xe4b792,0xa87557,0xe8c3a1,0xd9aa87][index % 5], 0, 1.13, 0, .154, .179, .149);
    solid(body, ball, coat, 0, 1.23, -.008, .17, .117, .162);
    solid(body, ball, trim, 0, 1.34, -.01, .067, .067, .067);
    const legs = [];
    const arms = [];
    for (const side of [-1, 1]) {
      const leg = group(body, side * .115, .52, 0);
      box(leg, 0x384d52, 0, -.184, 0, .13, .35, .132);
      box(leg, 0x35423b, 0, -.42, .038, .151, .113, .225);
      legs.push(leg);
      const arm = group(body, side * .230, .842, 0);
      box(arm, coat, 0, -.176, 0, .125, .33, .137);
      arms.push(arm);
    }
    const car = makeCar(rig, coat);
    car.visible = false;
    const id = profile.home ? profile.id + '-home' : 'lounge';
    rig.position.copy(places.get(id).work);
    return { profile, index, rig, body, car, legs, arms, row: { ...empty, district: id }, place: id, travel: null };
  }
  const agents = profiles.map(makeAgent);
  const traffic = Array.from({length:4}, (_, n) => {
    const car = makeCar(scene, n===3 ? 0xe4b738 : 0xf6c53b);
    box(car, 0xffe99a, 0,.82,-.12,.32,.134,.23);
    return car;
  });
  const [north,,south] = navigation.roads.crossStreets;
  const [west,,,east] = navigation.roads.avenues;
  const loop = [[west,north],[east,north],[east,south],[west,south],[west,north]];
  const lengths = loop.slice(1).map(([x,z], i) => Math.hypot(x-loop[i][0],z-loop[i][1]));
  const loopLength = lengths.reduce((sum, item) => sum+item,0);
  const walker = navigation.createWalker(THREE, {
    element: elements.canvas, places, obstacles: landscape.obstacles,
    left: document.getElementById('walk-move'), right: document.getElementById('walk-look'),
    hud: document.getElementById('walk-hud'), name: document.getElementById('walk-place'),
    modeChanged(walking) {
      elements.app.toggleAttribute('data-walking', walking);
      scene.fog.density = walking ? .0083 : .0055;
      orbitButton.setAttribute('aria-pressed', String(!walking));
      walkButton.setAttribute('aria-pressed', String(walking));
      controls.enabled = !walking;
      if (width > 1) layout();
    },
  });
  for (const place of places.values()) {
    place.exterior.traverse(child => {
      if (child.isMesh && child.scale.y >= .81 && !child.isInstancedMesh && child.geometry === unit) child.castShadow = true;
    });
    const floor = place.room.children.find(child => child.isMesh);
    if (floor) floor.receiveShadow = true;
  }

  const signalCount = 270;
  const flakes = new Float32Array(signalCount * 3);
  for (let n = 0; n < signalCount; n++) {
    flakes[n * 3] = -34 + ((n * 19.87) % 68);
    flakes[n * 3 + 1] = 1 + ((n * 9.37) % 24);
    flakes[n * 3 + 2] = -25 + ((n * 14.83) % 50);
  }
  const flakesGeometry = new THREE.BufferGeometry();
  flakesGeometry.setAttribute('position', new THREE.BufferAttribute(flakes, 3));
  const snowfall = new THREE.Points(flakesGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: .125, transparent: true, opacity: .77, depthWrite: false }));
  scene.add(snowfall);
  const mast = vec(0, 20.58, -11.32);
  const orbital = new THREE.Group();
  scene.add(orbital);
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0x76b5df, transparent: true, opacity: .21, depthWrite: false });
  box(orbital, beamMaterial, mast.x, mast.y + 6, mast.z, .21, 12, .21);
  const packet = solid(orbital, ball, bulbs[2], mast.x, mast.y + 6, mast.z, .34, .34, .34);
  orbital.visible = false;
  let relay = null;
  let relayAt = 0;
  let options = townOptions;

  function setOptions(next) {
    options = next;
    const light = applyLight();
    const state = {
      day: [0xe5f3ff, 0xa7b1a4, 1.52, 0xffeed1, 2.3, .62, 0xd2e3ee, .055],
      dusk: [0xddc9ef, 0x9e869a, 1.03, 0xffa06d, 1.78, .53, 0xb5a3be, .31],
      night: [0xabc4ed, 0x6d7790, .85, 0xc9d8ff, .86, .32, 0x687d9b, .55],
    }[light];
    sky.color.setHex(state[0]);
    sky.groundColor.setHex(state[1]);
    sky.intensity = state[2];
    sun.color.setHex(state[3]);
    sun.intensity = state[4];
    fill.intensity = state[5];
    scene.fog.color.setHex(state[6]);
    scene.backgroundIntensity = light === 'night' ? .31 : light === 'dusk' ? .74 : 1;
    scene.environmentIntensity = light === 'night' ? .37 : .68;
    sun.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
    pane.emissiveIntensity = state[7];
    snowfall.visible = options.snow;
  }

  function commute(agent, destination, time) {
    const target = places.get(destination);
    if (!agent.profile.home || reducedMotion.matches) {
      agent.rig.position.copy(target.work);
      agent.travel = null;
      agent.place = destination;
      return;
    }
    const origin = places.get(agent.place);
    const previous = agent.travel;
    const steps = [];
    let last = agent.rig.position.clone();
    function add(to, drive = false, pause = 0) {
      const span = last.distanceTo(to);
      if (span < .016 && !pause) return;
      steps.push({ from: last, to, drive, duration: pause || Math.max(.12, span / (drive ? 9.4 : 5.4)) });
      last = to;
    }
    if (previous) {
      const visited = [];
      let elapsed = time - previous.started;
      for (const step of previous.steps) {
        visited.push(step);
        if (elapsed < step.duration) break;
        elapsed -= step.duration;
      }
      for (const step of visited.reverse()) add(step.from.clone(),step.drive);
    }
    if (origin !== target) {
      const mode = options.transport === 'car' || (options.transport === 'mixed' && agent.index % 2 === 0);
      function leg(from, to) {
        for (const point of navigation.travelBetween(from,to,mode)) add(vec(point.x,point.y,point.z),point.drive);
      }
      if (origin.spec.home && !target.spec.home && target.id !== 'hq') {
        const headquarters = places.get('hq');
        leg(origin,headquarters);
        add(headquarters.work.clone(),false,.67);
        leg(headquarters,target);
      } else leg(origin,target);
    }
    agent.travel = { steps, started: time, destination };
  }

  const projected = vec();
  const displacement = vec();
  let focus = null;
  let follower = null;
  let cameraMove = null;
  let width = 1;
  let height = 1;
  const viewport = new ResizeObserver(layout);
  viewport.observe(elements.world);

  function layout() {
    const world = elements.world.getBoundingClientRect();
    width = Math.max(1, world.width);
    height = Math.max(1, world.height);
    const ratio = width / height;
    const halfW = Math.max(width < 660 ? 33 : 41, 25 * ratio);
    const halfH = halfW / ratio;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    const chrome = board.hidden || elements.app.hasAttribute('data-folded') ? 0 : board.offsetHeight;
    const offsetY = Math.round(chrome * .24);
    camera.setViewOffset(width, height, 0, offsetY, width, height);
    walker.camera.aspect = ratio;
    walker.camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function select(id, agentId) {
    focus = id;
    controls.enablePan = !id;
    follower = agents.find(agent => agent.profile.id === agentId);
    const info = places.get(focus);
    const target = follower ? follower.rig.position.clone().add(vec(0,.62,0)) :
      info ? vec(info.spec.x, .85, info.spec.z) : center.clone();
    const zoom = follower ? 5.2 : info ? (info.spec.home ? 5.2 : 3.73) : 1;
    const position = target.clone().add(info || follower ? vec(46, 58, 73) : angle);
    cameraMove = reducedMotion.matches ? null : { position, target, zoom };
    if (!cameraMove) {
      camera.position.copy(position);
      controls.target.copy(target);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
    layout();
  }
  controls.addEventListener('start', () => { cameraMove = null; });

  function update(data, nextRelay, snap = false, snapshot = {}) {
    for (const board of boards) board.show(snapshot);
    for (const location of new Set(screenViews.map(entry => entry.location))) {
      const active = profiles.filter(profile => !profile.job && data.get(profile.id)?.district === location &&
        data.get(profile.id)?.action !== 'idle').sort((a,b) => {
          const activity = profile => snapshot.agents?.[profile.id]?.code_snippet || snapshot.agents?.[profile.id]?.current_log;
          return Number(Boolean(activity(b)))-Number(Boolean(activity(a)));
        });
      const screens = screenViews.filter(entry => entry.location === location);
      for (const [index, { screen }] of screens.entries()) {
        const profile = active[index];
        const row = profile && snapshot.agents?.[profile.id];
        screen.show(profile?.title, profile ? stateLabel(data.get(profile.id)) : '',
          typeof row?.code_snippet === 'string' ? row.code_snippet : '',
          typeof row?.current_log === 'string' ? row.current_log : '');
      }
    }
    const time = performance.now() / 1000;
    if (relay?.updatedAt !== nextRelay?.updatedAt || relay?.stage !== nextRelay?.stage) relayAt = time;
    relay = nextRelay;
    for (const agent of agents) {
      const next = data.get(agent.profile.id);
      if (!next) continue;
      if (snap) {
        agent.travel = null;
        agent.rig.position.copy(places.get(next.district).work);
        agent.place = next.district;
      } else if (next.district !== agent.row.district) {
        commute(agent, next.district, time);
      }
      agent.row = next;
    }
    for (const [id, info] of places) {
      const active = agents.find(agent => agent.row.action !== 'idle' && agent.row.district === id);
      const flag = info.marker.querySelector('em');
      flag.textContent = active ? stateLabel(active.row) : '';
      flag.hidden = !active;
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let clickAnchor;
  elements.canvas.addEventListener('pointerdown', event => { clickAnchor = [event.clientX, event.clientY]; });
  elements.canvas.addEventListener('pointerup', event => {
    if (!clickAnchor || Math.hypot(event.clientX - clickAnchor[0], event.clientY - clickAnchor[1]) > 7) return;
    if (focus || follower || walker.active) return;
    const bounds = elements.canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / width * 2 - 1, -(event.clientY - bounds.top) / height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...places.values()].map(info => info.root));
    if (!hits.length) return;
    for (let parent = hits[0].object; parent; parent = parent.parent) {
      const target = [...places.values()].find(info => info.root === parent);
      if (target) { selectDistrict(target.id); break; }
    }
  });

  let last = performance.now() / 1000;
  let interior;
  let previousWidth = 0;
  let previousHeight = 0;
  const rotation = vec();
  let frame = 0;
  function render(ms) {
    const time = ms / 1000;
    const dt = Math.min(.16, Math.max(0, time - last));
    last = time;
    const motion = !reducedMotion.matches;
    for (const agent of agents) {
      let walking = false;
      let driving = false;
      if (agent.travel) {
        let elapsed = time - agent.travel.started;
        const segment = agent.travel.steps.find(step => {
          if (elapsed < step.duration) return true;
          elapsed -= step.duration;
          return false;
        });
        if (segment && motion) {
          agent.driving = segment.drive;
          agent.rig.position.copy(segment.from).lerp(segment.to, elapsed / segment.duration);
          rotation.copy(segment.to).sub(segment.from);
          if (Math.hypot(rotation.x, rotation.z) > .006) {
            agent.rig.rotation.y = Math.atan2(rotation.x, rotation.z);
            driving = segment.drive;
            walking = !driving;
          }
        } else {
          agent.rig.position.copy(places.get(agent.travel.destination).work);
          agent.place = agent.travel.destination;
          agent.travel = null;
        }
      }
      agent.driving = driving;
      agent.car.visible = driving;
      agent.body.visible = !driving;
      agent.rig.visible = !agent.profile.job || agent.row.action !== 'idle';
      agent.body.position.y = walking ? Math.abs(Math.sin(time * 13)) * .09 : 0;
      const swing = walking ? Math.sin(time * 13) * .68 : 0;
      agent.legs.forEach((leg, index) => { leg.rotation.x = swing * (index ? 1 : -1); });
      agent.arms.forEach((arm, index) => { arm.rotation.x = swing * (index ? -1 : 1) * .61; });
    }

    walker.update(dt);
    for (const place of places.values()) {
      if (!place.door) continue;
      const { x, z, depth } = place.spec;
      const front = z+depth/2;
      const near = position => Math.abs(position.x-x) < 1.83 && Math.abs(position.z-front) < 2.42;
      const approach = (walker.active && near(walker.position)) || agents.some(
        agent => agent.travel && !agent.driving && near(agent.rig.position));
      place.door.fraction += ((approach ? 1 : 0) - place.door.fraction)*Math.min(1,dt*12);
      for (const [hinge,sign] of place.door.panels) hinge.rotation.y = -sign*place.door.fraction*1.49;
    }
    if (motion) {
      for (const [n,bus] of traffic.entries()) {
        let distance = (time*6.0 + n*loopLength/traffic.length) % loopLength;
        const index = lengths.findIndex(span => {
          if (distance < span) return true;
          distance -= span;
          return false;
        });
        const [x,z] = loop[index];
        const [goalX,goalZ] = loop[index+1];
        const factor = distance/lengths[index];
        bus.position.set(x+(goalX-x)*factor,.158,z+(goalZ-z)*factor);
        bus.rotation.y = Math.atan2(goalX-x,goalZ-z);
      }
    } else traffic.forEach((vehicle, index) => {
      const [x,z] = loop[index];
      vehicle.position.set(x,.158,z);
    });
    const nextInterior = walker.active ? null : follower ? (follower.travel ? null : follower.place) : focus;
    if (interior !== nextInterior && !walker.active) {
      if (places.has(interior)) {
        places.get(interior).room.visible = false;
        places.get(interior).exterior.visible = true;
      }
      if (places.has(nextInterior)) {
        places.get(nextInterior).room.visible = true;
        places.get(nextInterior).exterior.visible = false;
      }
      interior = nextInterior;
    }
    if (follower && !walker.active) {
      const target = projected.copy(follower.rig.position).add(vec(0, .64, 0));
      if (cameraMove) {
        displacement.copy(target).sub(cameraMove.target);
        cameraMove.target.copy(target);
        cameraMove.position.add(displacement);
      } else {
        displacement.copy(target).sub(controls.target).multiplyScalar(motion ? Math.min(1, dt * 8) : 1);
        camera.position.add(displacement);
        controls.target.add(displacement);
      }
    }
    if (cameraMove && !walker.active) {
      const alpha = motion ? 1 - Math.exp(-dt * 7.1) : 1;
      camera.position.lerp(cameraMove.position, alpha);
      controls.target.lerp(cameraMove.target, alpha);
      camera.zoom += (cameraMove.zoom - camera.zoom) * alpha;
      camera.updateProjectionMatrix();
      if (camera.position.distanceToSquared(cameraMove.position) < .002 && Math.abs(camera.zoom - cameraMove.zoom) < .004) cameraMove = null;
    }
    controls.update();
    camera.updateMatrixWorld();
    const dockWidth = board.offsetWidth;
    const dockHeight = board.offsetHeight;
    if (previousWidth !== dockWidth || previousHeight !== dockHeight) {
      previousWidth = dockWidth;
      previousHeight = dockHeight;
      layout();
    }
    const covered = elements.app.hasAttribute('data-folded');
    for (const { marker, spec } of places.values()) {
      projected.set(spec.x, spec.height + .27, spec.z).project(camera);
      const x = (projected.x * .5 + .5) * width;
      const y = (-projected.y * .5 + .5) * height;
      marker.hidden = walker.active || covered || Boolean(focus || follower) || x < 0 || x > width || y < 61 || y > height - dockHeight - 45;
      if (!marker.hidden) {
        const edge = marker.offsetWidth * .5 + 4;
        const anchor = Math.max(edge, Math.min(width - edge, x));
        marker.style.transform = 'translate(' + anchor + 'px,' + y + 'px) translate(-50%,-100%)';
      }
    }
    const receiving = relay?.stage === 'receiving';
    const returning = relay?.stage === 'returning' || (relay?.stage === 'sent' && time - relayAt < 3.5);
    orbital.visible = Boolean(receiving || returning) && (walker.active || (!focus && !follower));
    if (orbital.visible) {
      const phase = motion ? ((time - relayAt) * .54) % 1 : .36;
      packet.position.y = mast.y + 12 * (receiving ? 1 - phase : phase);
    }
    snowfall.visible = options.snow && !(walker.active && walker.indoors);
    if (snowfall.visible && motion) {
      for (let n = 0; n < signalCount; n++) {
        const i = n * 3;
        flakes[i + 1] -= dt * (.52 + (n % 7) * .14);
        flakes[i] += dt * (.24 + Math.sin(time*.48+ n)*.72);
        flakes[i + 2] += dt * Math.cos(time*.56 + n)*.36;
        if (flakes[i + 2] < -25) flakes[i + 2] = 25;
        if (flakes[i + 2] > 25) flakes[i + 2] = -25;
        if (flakes[i] < -34) flakes[i] = 34;
        if (flakes[i + 1] <= .28) flakes[i + 1] = 23.7;
        if (flakes[i] > 34) flakes[i] = -34;
      }
      flakesGeometry.attributes.position.needsUpdate = true;
    }
    landscape.update(time,elements.app.dataset.light);
    if (frame++ % 10 === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, walker.active ? walker.camera : camera);
  }
  layout();
  renderer.setAnimationLoop(render);
  function walk(enabled) {
    if (enabled === walker.active) return;
    walker.setEnabled(enabled);
    for (const place of places.values()) {
      place.exterior.visible = enabled || place.id !== focus;
      place.room.visible = enabled ? Boolean(place.door) : place.id === focus;
    }
    interior = enabled ? null : focus;
  }
  return { select, update, setOptions, layout, walk };
}
