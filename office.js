'use strict';

const telegram = window.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();

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
  hq: { name: 'Таймс-сквер · Эмпайр-стейт-билдинг', label: 'Таймс-сквер', description: 'Главный штаб в небоскрёбе ар-деко', color: '#ffcc91', x: 0, z: -7, height: 20.8, width: 9.3, depth: 8.5 },
  moex: { name: 'MOEX · Биржевой терминал', label: 'MOEX', description: 'Архив данных, терминалы и серверы MOEX ISS', color: '#72aaff', x: -14, z: -13, height: 13.6, width: 9.4, depth: 8.5 },
  grants: { name: 'Центр Грантов', label: 'Радар', description: 'Автоматическая проверка публикаций', color: '#67f5b0', x: 13, z: -14, height: 8.1, width: 9, depth: 8.5 },
  dev: { name: 'Dev Lab', label: 'Dev Lab', description: 'Голографические терминалы и стенды для тестов', color: '#51eeff', x: -13.5, z: 10, height: 6.2, width: 9.4, depth: 8.5 },
  lounge: { name: 'Cyber Lounge', label: 'Cyber Lounge', description: 'Тихая набережная для агентов в ожидании', color: '#fc93ee', x: 12.4, z: 8.7, height: 3, width: 11, depth: 9.2 },
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
  { id: 'coder', title: 'Coder', color: '#56eddf' },
  { id: 'tester', title: 'Tester', color: '#ffce82' },
  { id: 'reporter', title: 'Reporter', color: '#edabff' },
  { id: 'job-moex', title: 'Сбор MOEX', color: '#72aaff', job: 'moex' },
  { id: 'job-grants', title: 'Радар грантов', color: '#67f5b0', job: 'grants' },
];

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
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const local = location.origin === 'http://127.0.0.1:8765';
const endpoint = local ? location.origin : window.OFFICE_CONFIG?.tunnel;
const initData = telegram?.initData ?? '';
const canConnect = Boolean(endpoint && (local || initData));
const cards = new Map();
const districtButtons = [...document.querySelectorAll('[data-district]')];
let city;
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

function normalize(row, fallbackProject) {
  const oldAction = Object.hasOwn(legacyActions, row?.phase) ? legacyActions[row.phase] : 'idle';
  const action = Object.hasOwn(actionNames, row?.action) ? row.action : oldAction;
  const project = ['moex', 'grants', 'dev'].includes(row?.project) ? row.project : fallbackProject;
  const district = action === 'idle' ? 'lounge' : (project ?? (row?.phase === 'planning' ? 'hq' : 'dev'));
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

function apply(snapshot) {
  rows = new Map(profiles.map(profile => [
    profile.id,
    normalize(profile.job ? snapshot.jobs?.[profile.job] : snapshot.agents?.[profile.id], profile.job),
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
  relayStatus = nextRelay && Object.hasOwn(orbitalLabels, nextRelay.stage) ? nextRelay : null;
  elements.orbital.hidden = !relayStatus;
  if (relayStatus) {
    elements.orbital.dataset.stage = relayStatus.stage;
    elements.orbitalStage.textContent = orbitalLabels[relayStatus.stage];
    elements.orbitalDetail.textContent = typeof relayStatus.detail === 'string' ? relayStatus.detail : '';
  }
  city?.update(rows, relayStatus);
  if (selectedAgent && rows.get(selectedAgent)?.district !== selected) selectAgent(selectedAgent);
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
    ['receiving', 'Задание приходит в Эмпайр-стейт-билдинг', demoSnapshot, 4600],
    ['working', 'Агенты забрали задание в штабе', demoSnapshot, 10500],
    ['returning', 'Reporter вернул результат в штаб', demoSignal, 5500],
  ];
  function play(index) {
    const [stage, detail, snapshot, duration] = stages[index];
    apply({ ...snapshot, relay: { stage, detail, project: 'dev', updatedAt: new Date().toISOString() } });
    if (!reducedMotion.matches) demoInterval = setTimeout(() => play((index + 1) % stages.length), duration);
  }
  play(0);
}

function acceptLive(state) {
  if (!state?.agents || typeof state.agents !== 'object') return false;
  liveData = state;
  connecting = false;
  liveFailure = false;
  if (!forcedDemo) {
    clearTimeout(demoInterval);
    apply(state);
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

function selectDistrict(id, agentId) {
  selected = id;
  selectedAgent = agentId;
  if (id) elements.app.dataset.focused = '';
  else delete elements.app.dataset.focused;
  elements.panel.hidden = !id;
  for (const button of districtButtons) button.setAttribute('aria-pressed', String(button.dataset.district === id));
  if (id) {
    const district = districts[id];
    elements.panel.style.setProperty('--district-color', district.color);
    elements.panelMode.textContent = city ? 'РЕНТГЕН' : 'РАЙОН';
    elements.panelName.textContent = district.name;
    elements.panelText.textContent = district.description;
  }
  updateInspection();
  city?.select(id, agentId);
}

function toggleDemo() {
  forcedDemo = !forcedDemo;
  elements.demo.setAttribute('aria-pressed', String(forcedDemo));
  elements.demoLabel.textContent = forcedDemo ? 'Рабочий режим' : 'Демо-режим (Экшн)';
  clearTimeout(demoInterval);
  if (forcedDemo) {
    apply({ agents: {} });
    showDemo();
    selectDistrict(null);
  } else if (liveData) {
    apply(liveData);
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
    elements.taskReceipt.textContent = 'Задание запущено · ' + result.label + '. Отчёт появится в чате.';
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

updateConnectionLabel();
showDemo();
connect();

Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')])
  .then(([THREE, { OrbitControls }]) => {
    city = createCity(THREE, OrbitControls);
    city.update(rows, relayStatus);
    if (selected) selectDistrict(selected, selectedAgent);
  })
  .catch(() => {
    elements.world.dataset.fallback = 'true';
    elements.canvas.hidden = true;
    elements.help.textContent = '3D недоступно. Районы можно выбрать кнопками.';
  });

function createCity(THREE, OrbitControls) {
  const V = (...coordinates) => new THREE.Vector3(...coordinates);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1127, .012);
  const renderer = new THREE.WebGLRenderer({ canvas: elements.canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x090f23, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const camera = new THREE.OrthographicCamera(-30, 30, 30, -30, .1, 250);
  const controls = new OrbitControls(camera, elements.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .09;
  controls.enablePan = false;
  controls.minPolarAngle = .38;
  controls.maxPolarAngle = 1.24;
  controls.minZoom = .75;
  controls.maxZoom = 13;
  const widePosition = V(45, 42, 55);
  const wideCenter = V(0, 4, 0);
  camera.position.copy(widePosition);
  controls.target.copy(wideCenter);
  controls.update();

  scene.add(new THREE.HemisphereLight(0xb9d9ff, 0x24234b, 2.5));
  const moon = new THREE.DirectionalLight(0xc5daff, 3.2);
  moon.position.set(10, 25, 12);
  scene.add(moon);
  const rim = new THREE.DirectionalLight(0x9a73ff, 1.05);
  rim.position.set(-20, 15, -8);
  scene.add(rim);

  const materials = new Map();
  function paint(color, shine = false) {
    const key = String(color) + (shine ? ' lit' : '');
    if (!materials.has(key)) materials.set(key, shine
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshStandardMaterial({ color, roughness: .75, metalness: .26 }));
    return materials.get(key);
  }

  const unitBox = new THREE.BoxGeometry();
  function box(parent, material, x, y, z, w, h, d) {
    const object = new THREE.Mesh(unitBox, material);
    object.position.set(x, y, z);
    object.scale.set(w, h, d);
    parent.add(object);
    return object;
  }

  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  function cylinder(parent, material, x, y, z, radius, height) {
    const object = new THREE.Mesh(unitCylinder, material);
    object.position.set(x, y, z);
    object.scale.set(radius, height, radius);
    parent.add(object);
    return object;
  }

  function rod(parent, material, start, end, radius) {
    const axis = end.clone().sub(start);
    const middle = start.clone().lerp(end, .5);
    const object = cylinder(parent, material, middle.x, middle.y, middle.z, radius, axis.length());
    object.quaternion.setFromUnitVectors(V(0, 1, 0), axis.normalize());
    return object;
  }

  function ring(parent, material, x, y, z, radius, tube = .04) {
    const object = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 32), material);
    object.rotation.x = Math.PI / 2;
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }

  function path(parent, points, color, opacity = 1) {
    const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    parent.add(line);
    return line;
  }

  function art(width, height, draw) {
    const raster = document.createElement('canvas');
    raster.width = width;
    raster.height = height;
    const context = raster.getContext('2d');
    draw(context, raster);
    const texture = new THREE.CanvasTexture(raster);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { raster, context, texture };
  }

  function panel(parent, material, x, y, z, w, h, rotate = 0) {
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    surface.position.set(x, y, z);
    surface.rotation.y = rotate;
    parent.add(surface);
    return surface;
  }

  const ground = new THREE.Group();
  scene.add(ground);
  box(ground, paint(0x0c152d), 0, -.42, 0, 66, .8, 57);
  box(ground, paint(0x111a33), 0, -.09, -.8, 64, .2, 54);
  const grid = new THREE.GridHelper(62, 45, 0x43527f, 0x2d3c63);
  grid.position.set(0, .021, -1);
  grid.material.transparent = true;
  grid.material.opacity = .35;
  ground.add(grid);

  const road = paint(0x0a1228);
  const curb = paint(0x283e69);
  const lane = paint(0x496caa, true);
  for (const x of [-24, -6.8, 7, 23.7]) {
    box(ground, road, x, .035, -1.5, 2.7, .04, 52);
    for (const edge of [-1.34, 1.34]) box(ground, curb, x + edge, .073, -1.5, .10, .07, 52);
    for (let z = -26; z < 23; z += 3.7) box(ground, lane, x, .066, z, .066, .027, .88);
  }
  for (const z of [-22.8, -1, 19.5]) {
    box(ground, road, 0, .083, z, 60, .045, 2.6);
    for (const edge of [-1.29, 1.29]) box(ground, curb, 0, .116, z + edge, 60, .052, .07);
    for (let x = -28.5; x < 29; x += 4) box(ground, lane, x, .111, z, 1, .02, .07);
  }

  let randomState = 3301;
  function random() {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  const skylineTexture = art(64, 128, (context) => {
    context.fillStyle = '#142545';
    context.fillRect(0, 0, 64, 128);
    for (let y = 3; y < 128; y += 10) {
      for (let x = 4; x < 64; x += 12) {
        context.fillStyle = random() > .58 ? '#507dec' : '#253b6b';
        context.fillRect(x, y, 6, 3.5);
      }
    }
  }).texture;
  const towerBlock = new THREE.MeshStandardMaterial({ color: 0x7d91ce, map: skylineTexture, roughness: .8 });
  for (let i = 0; i < 30; i++) {
    const back = i < 17;
    const x = back ? -30 + i * 3.75 : i < 24 ? -28.5 : 28;
    const z = back ? -27.7 - random() * 2.8 : -23 + ((i - 17) % 7) * 5.6;
    const height = 1.15 + random() * (back ? 8.8 : 3.2);
    const width = 1.2 + random() * 1.35;
    box(ground, towerBlock, x, height / 2, z, width, height, 1.85);
    if (i % 3 === 0) box(ground, paint(i % 2 ? 0xb9a3ff : 0x6b96ea, true), x, height + .04, z, .33, .12, .33);
  }

  const streets = new THREE.InstancedMesh(unitBox, paint(0x6ca9ef, true), 60);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < streets.count; index++) {
    const laneIndex = index % 4;
    const x = [-26, -8.7, 9, 25.6][laneIndex];
    const z = -23.6 + Math.floor(index / 4) * 3.3;
    streets.setMatrixAt(index, matrix.makeScale(.11, .17, .34).setPosition(x, .13, z));
  }
  ground.add(streets);

  const staticBoxes = new Map();
  for (const object of ground.children) {
    if (object.geometry !== unitBox || object.isInstancedMesh) continue;
    const group = staticBoxes.get(object.material) ?? [];
    group.push(object);
    staticBoxes.set(object.material, group);
  }
  for (const [material, objects] of staticBoxes) {
    if (objects.length < 3) continue;
    const batch = new THREE.InstancedMesh(unitBox, material, objects.length);
    for (const [index, object] of objects.entries()) {
      object.updateMatrix();
      batch.setMatrixAt(index, object.matrix);
      ground.remove(object);
    }
    ground.add(batch);
  }

  function createFacade(color, ink) {
    return art(128, 256, (context) => {
      context.fillStyle = ink;
      context.fillRect(0, 0, 128, 256);
      for (let y = 5; y < 256; y += 21) {
        for (let x = 7; x < 128; x += 21) {
          const active = random() > .4;
          context.globalAlpha = active ? .74 : .13;
          context.fillStyle = color;
          context.fillRect(x, y, 12, 5);
          context.globalAlpha = .88;
          context.fillStyle = '#11213b';
          context.fillRect(x, y + 6, 12, 6);
        }
      }
      context.globalAlpha = .46;
      context.fillStyle = color;
      context.fillRect(3, 0, 1.6, 256);
      context.fillRect(124, 0, 1.6, 256);
    }).texture;
  }

  const pickMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const buildings = new Map();
  const hitboxes = [];
  let updateRadar = () => {};
  let updateTicker = () => {};
  let updateWater = () => {};

  function makeBuilding(id, district) {
    const group = new THREE.Group();
    group.position.set(district.x, 0, district.z);
    scene.add(group);
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'marker';
    marker.style.setProperty('--district-color', district.color);
    marker.innerHTML = '<b></b><em hidden></em>';
    marker.querySelector('b').textContent = district.label;
    marker.addEventListener('click', () => selectDistrict(id));
    elements.markers.append(marker);
    const hitbox = box(group, pickMaterial, 0, district.height / 2, 0, district.width, district.height, district.depth);
    hitbox.userData.id = id;
    hitboxes.push(hitbox);
    const exterior = new THREE.Group();
    group.add(exterior);
    const walls = [];
    function retractable(options) {
      const material = new THREE.MeshStandardMaterial({ roughness: .6, metalness: .24, ...options });
      material.userData.opacity = options.opacity ?? 1;
      walls.push(material);
      return material;
    }
    const accent = paint(district.color, true);
    const { width, depth } = district;
    box(group, paint(0x142440), 0, .205, 0, width + 1.35, .29, depth + 1.35);
    box(group, paint(0x243451), 0, .378, 0, width + 1.02, .065, depth + 1.02);
    box(group, paint(0x101a36), 0, .445, 0, width + .05, .08, depth + .05);
    for (const side of [-1, 1]) {
      box(group, accent, side * (width / 2 + .41), .414, 0, .055, .04, depth + .86);
      box(group, accent, 0, .414, side * (depth / 2 + .41), width + .86, .04, .055);
    }
    const info = { id, ...district, group, exterior, walls, marker, accent, retractable, fade: 1, visible: false, activity: '' };
    buildings.set(id, info);
    return info;
  }

  function shell(building, depth, width, wallHeight, base, ink) {
    const texture = createFacade(building.color, ink);
    const material = building.retractable({
      color: 0xa2b2d9, map: texture, emissive: 0xc2d3ff, emissiveMap: texture, emissiveIntensity: .4,
    });
    const roof = building.retractable({ color: 0x233b5f });
    const glow = building.retractable({ color: building.color, emissive: building.color, emissiveIntensity: .7 });
    const { exterior } = building;
    for (const side of [-1, 1]) {
      box(exterior, material, side * width / 2, base + wallHeight / 2, 0, .13, wallHeight, depth);
      box(exterior, material, 0, base + wallHeight / 2, side * depth / 2, width, wallHeight, .13);
      box(exterior, glow, side * (width / 2 + .021), base + wallHeight + .08, 0, .078, .084, depth);
      box(exterior, glow, 0, base + wallHeight + .08, side * (depth / 2 + .021), width, .084, .078);
    }
    box(exterior, roof, 0, base + wallHeight + .075, 0, width + .17, .24, depth + .17);
    return { roof, glow, material };
  }

  function timesSquare(building) {
    const exterior = building.exterior;
    const main = shell(building, 6.95, 7.9, 8.6, .48, '#2d314b');
    const second = shell(building, 5.8, 6.48, 5.1, 9.16, '#232a44');
    shell(building, 4.3, 4.9, 2.94, 14.35, '#33314a');
    const stone = building.retractable({ color: 0xbcc8d9, metalness: .49, emissive: 0x53413c, emissiveIntensity: .2 });
    const crown = building.retractable({ color: 0xffe5b0, emissive: 0xffb361, emissiveIntensity: .72 });
    for (const side of [-1, 1]) {
      for (const edge of [-1, 1]) {
        box(exterior, stone, edge * 3.91, 4.63, side * 3.45, .18, 8.31, .19);
        box(exterior, stone, edge * 3.21, 11.6, side * 2.87, .14, 4.82, .16);
      }
      for (const x of [-2.63, -1.32, 0, 1.32, 2.63]) {
        box(exterior, stone, x, 4.8, side * 3.56, .084, 6.95, .08);
      }
      box(exterior, main.glow, 0, 8.87, side * 3.54, 7.84, .16, .12);
      box(exterior, second.glow, 0, 14.08, side * 2.97, 6.41, .13, .1);
    }
    box(exterior, stone, 0, 17.72, 0, 3.14, .88, 2.69);
    box(exterior, crown, 0, 18.04, 0, 3.18, .17, 2.73);
    box(exterior, stone, 0, 18.59, 0, 1.92, 1.05, 1.65);
    box(exterior, crown, 0, 19.16, 0, 1.32, .14, 1.17);
    rod(exterior, stone, V(0, 19.14, 0), V(0, 20.6, 0), .077);
    rod(exterior, crown, V(0, 20.55, 0), V(0, 20.83, 0), .041);

    const boards = [
      { x: -2.53, y: 2.37, w: 2.25, h: 2.13, ink: '#fd57bf', accent: '#f2a7ff', title: 'TIMES', bottom: 'SQUARE' },
      { x: .05, y: 2.69, w: 2.53, h: 1.38, ink: '#267af7', accent: '#85faff', title: 'NEW YORK', bottom: 'CITY' },
      { x: 2.59, y: 2.4, w: 2.08, h: 2.32, ink: '#e84f36', accent: '#ffd489', title: 'BROADWAY', bottom: '42 ST' },
    ];
    for (const board of boards) {
      const texture = art(230, 140, ctx => {
        const color = ctx.createLinearGradient(0, 0, 230, 140);
        color.addColorStop(0, '#101633');
        color.addColorStop(1, board.ink);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 230, 140);
        ctx.strokeStyle = board.accent;
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, 222, 132);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(board.title, 115, 59, 202);
        ctx.fillStyle = board.accent;
        ctx.font = 'bold 25px sans-serif';
        ctx.fillText(board.bottom, 115, 103, 202);
      }).texture;
      const screen = building.retractable({ color: 0xffffff, map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1 });
      panel(exterior, screen, board.x, board.y, 3.61, board.w, board.h);
    }
    const marquee = art(360, 76, ctx => {
      ctx.fillStyle = '#122348';
      ctx.fillRect(0, 0, 360, 76);
      ctx.fillStyle = '#ffdf9b';
      ctx.font = 'bold 29px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EMPIRE STATE', 180, 47);
    }).texture;
    const sign = building.retractable({ color: 0xffffff, map: marquee, emissive: 0xffffff, emissiveMap: marquee, emissiveIntensity: .72 });
    panel(exterior, sign, 0, 6.62, 3.6, 5.47, 1.13);
    for (const x of [-3.8, 3.8]) {
      cylinder(building.group, paint(0x4e4862), x, .82, 3.84, .12, .71);
      sphereLamp(x);
    }

    function sphereLamp(x) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.15, 9, 6), building.accent);
      bulb.position.set(x, 1.19, 3.84);
      building.group.add(bulb);
    }
  }

  function stockExchange(building) {
    const first = shell(building, 8.45, 9.4, 7.15, .48, '#142648');
    const upper = shell(building, 7, 7.8, 4.25, 7.7, '#101e45');
    box(building.exterior, upper.roof, 0, 12.32, 0, 4.8, .62, 4.2);
    const gold = building.retractable({ color: 0xffc579, emissive: 0xe68332, emissiveIntensity: .68 });
    for (const sign of [-1, 1]) {
      box(building.exterior, gold, sign * 4.67, 4, 4.21, .098, 7.2, .09);
      box(building.exterior, gold, 0, 7.13, sign * 4.29, 9.32, .12, .09);
    }
    rod(building.exterior, gold, V(0, 12.4, 0), V(0, 13.54, 0), .055);
    const chart = art(360, 144, (context) => {
      context.fillStyle = '#122542';
      context.fillRect(0, 0, 360, 144);
      context.strokeStyle = '#2b4569';
      context.lineWidth = 1;
      for (let x = 10; x < 360; x += 28) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, 144);
        context.stroke();
      }
      for (let y = 17; y < 144; y += 24) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(360, y);
        context.stroke();
      }
      context.fillStyle = '#ffdb9b';
      context.font = 'bold 20px monospace';
      context.fillText('MOEX', 14, 24);
      const data = [109, 102, 111, 89, 81, 91, 78, 62, 76, 66, 70, 40, 49, 41, 31, 27];
      context.beginPath();
      for (const [index, y] of data.entries()) {
        const x = 14 + index * 22;
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
      }
      context.strokeStyle = '#ffca79';
      context.lineWidth = 4;
      context.stroke();
    }).texture;
    const chartMaterial = building.retractable({ color: 0xffffff, map: chart, emissive: 0xffffff, emissiveMap: chart, emissiveIntensity: .43 });
    panel(building.exterior, chartMaterial, 0, 4.97, 4.311, 7.72, 2.84);
    panel(building.exterior, chartMaterial, 4.783, 4.97, 0, 6.42, 2.84, Math.PI / 2);
    const quotes = art(600, 56, () => {});
    const tickerMaterial = building.retractable({ color: 0xffffff, map: quotes.texture, emissive: 0xffd596, emissiveMap: quotes.texture, emissiveIntensity: .75 });
    panel(building.exterior, tickerMaterial, 0, 2.8, 4.31, 8.62, .72);
    let lastTick = -1;
    updateTicker = (time) => {
      if (time - lastTick < .08) return;
      lastTick = time;
      const { raster, context, texture } = quotes;
      context.fillStyle = '#0e1d36';
      context.fillRect(0, 0, raster.width, raster.height);
      context.font = 'bold 26px monospace';
      context.fillStyle = '#ffd093';
      const symbols = 'MOEX  /  IMOEX  •  SBER  •  GAZP  •  LKOH  •  RGBI  /  ';
      const width = context.measureText(symbols).width;
      const offset = (time * 69) % width;
      context.fillText(symbols, -offset, 36);
      context.fillText(symbols, width - offset, 36);
      texture.needsUpdate = true;
    };
    box(building.exterior, first.glow, 0, 7.83, 3.41, 7.58, .12, .12);
  }

  function grantRadar(building) {
    const skin = shell(building, 8.3, 8.9, 4.35, .48, '#102f39');
    const lit = building.retractable({ color: 0x6bffb6, emissive: 0x40b68c, emissiveIntensity: .63 });
    const roof = building.exterior;
    box(roof, skin.roof, 0, 4.91, 0, 6.8, .4, 6.12);
    for (let i = -1; i <= 1; i++) {
      box(roof, lit, i * 2.59, 2.77, 4.2, .065, 3.2, .11);
    }
    const radarBase = new THREE.Group();
    radarBase.position.set(0, 5.17, 0);
    roof.add(radarBase);
    cylinder(radarBase, skin.roof, 0, .255, 0, .72, .46);
    cylinder(radarBase, lit, 0, .54, 0, .53, .12);
    const dishBase = new THREE.Group();
    dishBase.position.y = 1.02;
    dishBase.rotation.z = .55;
    radarBase.add(dishBase);
    const curve = Array.from({ length: 10 }, (_, index) => {
      const distance = index / 9 * 1.8;
      return new THREE.Vector2(distance, .25 * distance ** 2);
    });
    const ceramic = building.retractable({ color: 0x4aa997, side: THREE.DoubleSide, metalness: .63, emissive: 0x022717 });
    const dish = new THREE.Mesh(new THREE.LatheGeometry(curve, 26), ceramic);
    dishBase.add(dish);
    ring(dishBase, lit, 0, .83, 0, 1.8, .033);
    for (const sign of [-1, 1]) {
      rod(dishBase, skin.roof, V(sign * .88, .21, 0), V(0, 1.26, 0), .046);
      rod(dishBase, skin.roof, V(0, .21, sign * .88), V(0, 1.26, 0), .046);
    }
    cylinder(dishBase, lit, 0, 1.39, 0, .12, .27);
    updateRadar = time => { radarBase.rotation.y = time * .46; };
  }

  function developerLab(building) {
    const skin = shell(building, 8.35, 9.4, 3.5, .47, '#112b44');
    const upper = shell(building, 6.65, 7.0, 1.44, 3.99, '#0a3b53');
    box(building.exterior, skin.roof, -.9, 5.51, 0, 4.5, .54, 3.9);
    for (const offset of [-3.71, -2.8, 2.8, 3.71]) {
      box(building.exterior, upper.glow, offset, .99, 4.26, .107, .91, .09);
      box(building.exterior, upper.glow, offset * .85, 5.622, .63, .075, .025, 3.7);
    }
    const hologram = art(288, 68, context => {
      context.fillStyle = '#112d49';
      context.fillRect(0, 0, 288, 68);
      context.strokeStyle = '#4ce4f3';
      context.strokeRect(3, 4, 281, 59);
      context.fillStyle = '#8cfcff';
      context.font = 'bold 30px monospace';
      context.fillText('DEV / LAB', 59, 44);
    }).texture;
    const display = building.retractable({ map: hologram, emissiveMap: hologram, emissive: 0xa4d9ff, emissiveIntensity: .65 });
    panel(building.exterior, display, 0, 2.94, 4.29, 4.8, .91);
    rod(building.exterior, skin.glow, V(-1.2, 5.51, -.38), V(-1.2, 6.2, -.38), .045);
  }

  function lounge(building) {
    const deck = building.group;
    const water = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: [
        'varying vec2 uvSpace;',
        'void main() { uvSpace = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      ].join('\n'),
      fragmentShader: [
        'uniform float time; varying vec2 uvSpace;',
        'void main() {',
        '  float wave = sin(uvSpace.x*29.+uvSpace.y*47.+time*1.5)*sin(uvSpace.y*77.-time*1.8+uvSpace.x*10.);',
        '  float glow = smoothstep(.38,.93,wave);',
        '  vec3 color = mix(vec3(.027,.087,.235), vec3(.26,.32,.70), .26+glow*.43);',
        '  gl_FragColor = vec4(color,1.);',
        '}',
      ].join('\n'),
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 7.7), water);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(2.54, .518, 0);
    deck.add(pool);
    updateWater = time => { water.uniforms.time.value = time; };
    for (const side of [-1, 1]) {
      box(deck, building.accent, 2.54, .52, side * 3.89, 5.14, .037, .05);
      box(deck, building.accent, 2.54 + side * 2.58, .52, 0, .05, .037, 7.78);
    }
    const roof = building.retractable({ color: 0x664b88, metalness: .53 });
    const glow = building.retractable({ color: 0xf6a7fc, emissive: 0xba44a2, emissiveIntensity: .81 });
    for (const x of [-4.86, -.6]) {
      for (const z of [-3.1, .54]) cylinder(building.exterior, roof, x, 1.49, z, .08, 2);
    }
    const canopy = box(building.exterior, roof, -2.73, 2.52, -1.28, 4.48, .13, 3.85);
    canopy.rotation.z = -.087;
    box(building.exterior, glow, -2.73, 2.61, .65, 4.52, .07, .075);
    for (const z of [-2.3, 1.94, 3.1]) {
      box(deck, paint(0x755492), -2.77, .7, z, 2.28, .24, .46);
      box(deck, paint(0x9b70ac), -2.77, .86, z - .23, 2.28, .29, .104);
    }

    const leaf = paint(0x4990a0);
    for (const [x, z] of [[-.74, -3.74], [-4.65, 3.25], [4.6, 3.4]]) {
      cylinder(deck, paint(0x34354f), x, .72, z, .36, .36);
      cylinder(deck, paint(0x98627e), x, 1.59, z, .075, 1.6);
      for (let index = 0; index < 5; index++) {
        const angle = index / 5 * Math.PI * 2;
        const frond = box(deck, leaf, x + Math.sin(angle) * .33, 2.43 - (index % 2) * .07, z + Math.cos(angle) * .33, .13, .052, .83);
        frond.rotation.y = angle;
        frond.rotation.x = -.18;
      }
    }
    const pad = ring(deck, building.accent, .29, .55, -3.19, .36, .025);
    pad.scale.set(1, 1.4, 1);
  }

  const codeScreen = art(220, 116, context => {
    context.fillStyle = '#0e3b5a';
    context.fillRect(0, 0, 220, 116);
    context.strokeStyle = '#72e9ff';
    context.lineWidth = 4;
    context.strokeRect(4, 4, 212, 108);
    for (let index = 0; index < 7; index++) {
      context.fillStyle = index % 3 === 0 ? '#a3acd5' : '#46c2dc';
      context.fillRect(15 + index % 2 * 13, 16 + index * 12, 45 + (index * 13) % 133, 3);
    }
  }).texture;
  const terminalScreen = new THREE.MeshBasicMaterial({ map: codeScreen, color: 0xe3fcff, side: THREE.DoubleSide });
  const shelfCase = paint(0x5370a3);
  const furniture = paint(0x7188b5);
  const rackCase = paint(0x27384c);
  function interior(building) {
    const floor = new THREE.Group();
    floor.visible = false;
    building.group.add(floor);
    building.interior = floor;
    const accent = building.accent;
    const isLounge = building.id === 'lounge';
    const origin = isLounge ? -2.4 : 0;
    const workspaceWidth = isLounge ? 4.8 : 7.9;
    box(floor, paint(0x2b3c60), origin, .49, .03, workspaceWidth, .04, 7.13);
    const xOffice = origin - (isLounge ? .5 : 1.12);
    const xShelf = origin - (isLounge ? 1.77 : 3.14);
    const xMachines = origin + (isLounge ? 1.32 : 2.94);
    for (const z of [-1.76, -.97, 1.9]) {
      box(floor, shelfCase, xShelf, 1.1, z, .26, 1.22, .72);
      for (const y of [.67, .98, 1.29]) {
        box(floor, furniture, xShelf + .125, y, z, .46, .078, .70);
        box(floor, accent, xShelf + .29, y + .16, z - .12, .22, .26, .16);
        box(floor, paint(0x647ec1), xShelf + .27, y + .17, z + .105, .22, .26, .185);
      }
    }

    const desk = (x, z) => {
      box(floor, furniture, x, .91, z, 1.84, .115, .76);
      for (const off of [-.72, .72]) box(floor, rackCase, x + off, .70, z, .102, .43, .6);
      const screen = panel(floor, terminalScreen, x, 1.34, z - .213, 1.28, .54);
      screen.rotation.x = -.105;
      box(floor, rackCase, x, .89, z + .67, .49, .089, .49);
      box(floor, paint(0x7cbfdd), x, 1.02, z + .85, .48, .34, .08);
    };
    desk(xOffice, .78);
    if (!isLounge) desk(xOffice + 1.85, -2.41);

    const zReporter = -2.21;
    for (const z of [-1.22, .08]) {
      box(floor, rackCase, xMachines, 1.32, z, .85, 1.64, .74);
      for (let index = 0; index < 6; index++) {
        box(floor, furniture, xMachines, .66 + index * .225, z + .39, .62, .082, .027);
        box(floor, accent, xMachines - .214, .66 + index * .225, z + .41, .08, .058, .032);
      }
    }
    for (const x of [xMachines - .46, xMachines - 1.26]) {
      box(floor, paint(0x313b5b), x, .68, 1.77, .57, .34, .57);
      box(floor, accent, x, .866, 1.77, .47, .08, .47);
    }
    cylinder(floor, rackCase, xMachines, .87, zReporter, .32, .69);
    ring(floor, accent, xMachines, 1.28, zReporter, .27);
    cylinder(floor, accent, xMachines, 1.25, zReporter, .09, .24);
    building.spots = {
      shelf: [xShelf + .69, -1.05],
      desk: [xOffice, 1.54],
      rack: [xMachines - .57, .65],
      test: [xMachines - .85, 1.74],
      transmitter: [xMachines - .44, zReporter],
    };
  }

  const builders = { hq: timesSquare, moex: stockExchange, grants: grantRadar, dev: developerLab, lounge };
  for (const [id, district] of Object.entries(districts)) {
    const building = makeBuilding(id, district);
    builders[id](building);
    interior(building);
  }

  const sparks = art(48, 48, (context) => {
    context.textAlign = 'center';
    context.font = 'bold 27px monospace';
    context.fillStyle = '#91faff';
    context.shadowColor = '#72e6ff';
    context.shadowBlur = 8;
    context.fillText('{}', 24, 33);
  }).texture;
  const agents = [];
  function createDrone(profile, index) {
    const group = new THREE.Group();
    const { color } = profile;
    const skin = paint(0x5b6b8c);
    const bright = paint(color, true);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(.365, 1), skin);
    body.scale.y = .62;
    group.add(body);
    const visor = box(group, bright, 0, .075, .29, .45, .12, .08);
    visor.rotation.x = -.13;
    for (const side of [-1, 1]) {
      cylinder(group, skin, side * .43, -.01, 0, .14, .105);
      ring(group, bright, side * .43, -.025, 0, .15, .024);
      cylinder(group, bright, side * .43, -.13, 0, .082, .064);
    }
    const antenna = rod(group, skin, V(0, .13, -.21), V(0, .42, -.35), .024);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.065, 8, 5), bright);
    bulb.position.copy(antenna.position).add(V(0, .14, -.063));
    group.add(bulb);
    const folder = new THREE.Group();
    box(folder, paint(0xffc15b, true), 0, 0, 0, .34, .32, .11);
    box(folder, paint(0xff9e63, true), -.085, .177, 0, .15, .055, .10);
    box(folder, paint(0x5e3e68), 0, -.013, .06, .23, .048, .028);
    folder.position.set(.087, -.155, .39);
    group.add(folder);

    const laser = new THREE.Mesh(new THREE.ConeGeometry(.38, 1.32, 15, 1, true), new THREE.MeshBasicMaterial({
      color: 0x73ffd1, transparent: true, opacity: .19, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    laser.position.set(0, -.4, .65);
    laser.rotation.x = -.52;
    group.add(laser);

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xe470ff, transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.06, .16, 7.7, 12, 1, true), beamMaterial);
    scene.add(beam);
    const bits = Array.from({ length: 9 }, () => {
      const bit = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sparks, color: 0xc8f5ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      scene.add(bit);
      return bit;
    });
    const packets = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(27), 3)),
      new THREE.PointsMaterial({ color, size: .21, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    packets.frustumCulled = false;
    scene.add(packets);
    const route = path(scene, [V(0, 0, 0), V(0, 0, 0)], color, .30);
    route.frustumCulled = false;
    const home = buildings.get('hq');
    group.position.set(home.x + (index - 2) * .64, 4, home.z + 1.5);
    scene.add(group);
    return {
      profile, index, group, folder, laser, beam, bits, packets, route,
      row: { ...empty, district: 'hq' }, launch: group.position.clone(), started: performance.now() / 1000,
      lastPosition: group.position.clone(), workspacePosition: V(),
    };
  }

  function positionInside(agent, building, time) {
    const point = agent.workspacePosition;
    const { action } = agent.row;
    const offset = (agent.index % 3 - 1) * .34;
    const clock = reducedMotion.matches ? 0 : time;
    const { spots } = building;
    let x = 0;
    let z = 0;
    switch (action) {
      case 'folders': {
        const mix = .5 - .5 * Math.cos(clock * .99 + agent.index);
        x = THREE.MathUtils.lerp(spots.shelf[0], spots.rack[0], mix);
        z = THREE.MathUtils.lerp(spots.shelf[1], spots.rack[1], mix) + Math.sin(Math.PI * mix) * 1.22;
        break;
      }
      case 'coding':
        [x, z] = spots.desk;
        break;
      case 'testing':
        x = spots.test[0] + Math.cos(clock * 1.37 + agent.index) * .64;
        z = spots.test[1] + Math.sin(clock * 1.37 + agent.index) * .68;
        break;
      case 'reporting':
        x = spots.transmitter[0] - Math.max(0, 1 - (time - agent.started) / 3) * .63;
        z = spots.transmitter[1] + Math.max(0, 1 - (time - agent.started) / 3) * 1.51;
        break;
      default:
        x = -2.8 + Math.sin(clock * .42 + agent.index) * .46;
        z = (agent.index - 1) * 1.4 + Math.cos(clock * .43 + agent.index) * .42;
    }
    const bounce = Math.sin(clock * 5.2 + agent.index) * (action === 'idle' ? .08 : .11);
    return point.set(building.x + x + offset, 1.1 + bounce, building.z + z);
  }

  function flightPosition(agent, destination, elapsed, target) {
    const hq = buildings.get('hq');
    if (elapsed < .92) {
      const progress = elapsed / .92;
      target.copy(agent.launch).lerp(V(hq.x, hq.height + .5 + agent.index * .28, hq.z + 1.5), progress);
      target.y += Math.sin(progress * Math.PI) * 1.8;
    } else {
      const progress = Math.min((elapsed - .92) / 1.62, 1);
      const end = positionInside(agent, destination, agent.started + 2.54);
      target.set(hq.x, hq.height + .5 + agent.index * .28, hq.z + 1.5).lerp(end, progress);
      target.y += Math.sin(progress * Math.PI) * 2.7;
    }
  }

  function updatePackets(agent, destination, time, on) {
    const { packets, route } = agent;
    const showing = on && !reducedMotion.matches && destination.id !== 'hq' && agent.row.action !== 'idle';
    packets.visible = route.visible = showing;
    if (!showing) return;
    const hub = buildings.get('hq');
    const endY = destination.height + .65;
    const positions = packets.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const t = (time * .44 + index * .13 + agent.index * .19) % 1;
      positions.setXYZ(index,
        THREE.MathUtils.lerp(hub.x, destination.x, t),
        THREE.MathUtils.lerp(hub.height + .6, endY, t) + Math.sin(t * Math.PI) * 1.9 + .17 * agent.index,
        THREE.MathUtils.lerp(hub.z, destination.z, t),
      );
    }
    positions.needsUpdate = true;
    const wire = route.geometry.attributes.position;
    wire.setXYZ(0, hub.x, hub.height + .6 + .11 * agent.index, hub.z);
    wire.setXYZ(1, destination.x, endY + .11 * agent.index, destination.z);
    wire.needsUpdate = true;
  }

  function effects(agent, building, time, inside) {
    const { group, row, folder, laser, beam, bits } = agent;
    folder.visible = inside && row.action === 'folders';
    laser.visible = inside && row.action === 'testing';
    beam.visible = row.action === 'reporting' && (inside || !focusId) && group.visible;
    beam.position.set(building.x + building.spots.transmitter[0], 5.16, building.z + building.spots.transmitter[1]);
    beam.material.opacity = .24 + .14 * Math.sin(time * 4);
    beam.scale.setScalar(1 + .12 * Math.sin(time * 5));
    laser.material.opacity = .11 + .2 * Math.max(0, Math.sin(time * 5));
    for (const [index, bit] of bits.entries()) {
      bit.visible = inside && row.action === 'coding';
      if (!bit.visible) continue;
      const t = (time * .67 + index / bits.length) % 1;
      bit.position.set(group.position.x + .72 * Math.cos(index * 2 + t * 3), group.position.y + .25 + t * 2.08, group.position.z - .92 + t * .68 + Math.sin(index * 3) * .27);
      bit.material.opacity = (1 - t) * .87;
      bit.scale.setScalar(.23 + .17 * (1 - t));
    }
  }

  for (const [index, profile] of profiles.entries()) agents.push(createDrone(profile, index));

  const empire = buildings.get('hq');
  const rooftop = V(empire.x, empire.height + .38, empire.z);
  const orbit = V(empire.x + 3.15, empire.height + 10.6, empire.z - 1.95);
  const satellite = new THREE.Group();
  satellite.position.copy(orbit);
  satellite.scale.setScalar(1.38);
  scene.add(satellite);
  box(satellite, paint(0x8ca8d8), 0, 0, 0, 1.08, .45, .61);
  for (const side of [-1, 1]) {
    box(satellite, paint(0x5ca9ff, true), side * 1.23, 0, 0, 1.47, .06, .52);
    for (const line of [-.25, 0, .25]) box(satellite, paint(0x214271, true), side * 1.23 + line, .042, 0, .04, .025, .54);
  }
  ring(satellite, paint(0x68ddfc, true), 0, .34, 0, .5, .035);
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0x72dfff, depthWrite: false, transparent: true, opacity: .32 });
  const orbitalBeam = rod(scene, beamMaterial, rooftop, orbit, .165);
  const pulse = new THREE.Mesh(new THREE.IcosahedronGeometry(.46, 1), paint(0x83e9ff, true));
  const outputPulse = new THREE.Mesh(new THREE.IcosahedronGeometry(.38, 1), paint(0xe6a5ff, true));
  scene.add(pulse, outputPulse);
  let activeRelay;
  let relayKey;
  let relayStarted = 0;
  const reporter = agents.find(agent => agent.profile.id === 'reporter');
  const returnStart = V();

  function armRelay(next, clock) {
    const key = next ? next.stage + String(next.updatedAt ?? '') : '';
    if (key === relayKey) return;
    const alreadyReturning = activeRelay?.stage === 'returning' && next?.stage === 'sent';
    if (!alreadyReturning) {
      const age = next?.stage === 'sent' ? Math.max(0, (Date.now() - Date.parse(next.updatedAt)) / 1000) : 0;
      relayStarted = clock - (Number.isFinite(age) ? age : 0);
      if (next?.stage === 'returning' || next?.stage === 'sent') returnStart.copy(reporter.group.position);
    }
    activeRelay = next;
    relayKey = key;
  }

  function updateOrbital(time) {
    const visible = !focusId;
    const elapsed = Math.max(0, time - relayStarted);
    const receiving = activeRelay?.stage === 'receiving';
    const returning = (activeRelay?.stage === 'returning' || activeRelay?.stage === 'sent') && elapsed < 6.2;
    const outgoing = returning && (elapsed >= 1.7 || reducedMotion.matches);
    satellite.visible = visible;
    if (!reducedMotion.matches) satellite.rotation.y = Math.sin(time * .82) * .44;
    orbitalBeam.visible = visible && (receiving || outgoing);
    pulse.visible = visible && receiving;
    outputPulse.visible = visible && outgoing;
    if (orbitalBeam.visible) {
      beamMaterial.color.set(outgoing ? 0xe39aff : 0x72dfff);
      beamMaterial.opacity = reducedMotion.matches ? .44 : .30 + .18 * Math.sin(time * 8) ** 2;
    }
    if (pulse.visible) pulse.position.copy(orbit).lerp(rooftop, reducedMotion.matches ? .52 : (elapsed * .65) % 1);
    if (outputPulse.visible) outputPulse.position.copy(rooftop).lerp(orbit, reducedMotion.matches ? .52 : ((elapsed - 1.7) * .62) % 1);
    return returning && visible ? elapsed : null;
  }

  const ray = new THREE.Raycaster();
  const coordinates = new THREE.Vector2();
  const activePointers = new Set();
  let gesture;
  elements.canvas.addEventListener('pointerdown', event => {
    activePointers.add(event.pointerId);
    gesture = activePointers.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : undefined;
  });
  elements.canvas.addEventListener('pointermove', event => {
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 7) gesture = undefined;
  });
  elements.canvas.addEventListener('pointercancel', event => {
    activePointers.delete(event.pointerId);
    gesture = undefined;
  });
  elements.canvas.addEventListener('pointerup', event => {
    activePointers.delete(event.pointerId);
    if (activePointers.size || gesture?.id !== event.pointerId) return;
    gesture = undefined;
    const rect = elements.canvas.getBoundingClientRect();
    coordinates.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(coordinates, camera);
    if (focusId) {
      const onFloor = agents.filter(agent => agent.group.visible && agent.row.district === focusId && !agent.profile.job);
      const hit = ray.intersectObjects(onFloor.map(agent => agent.group), true)[0];
      if (hit) {
        let object = hit.object;
        while (object.parent && !onFloor.some(agent => agent.group === object)) object = object.parent;
        const agent = onFloor.find(candidate => candidate.group === object);
        if (agent) selectAgent(agent.profile.id);
      }
      return;
    }
    const picked = ray.intersectObjects(hitboxes, false)[0];
    if (picked) selectDistrict(picked.object.userData.id);
  });

  let focusId;
  let follower;
  let cameraMove;
  let view;
  const followStep = V();
  const facing = V(.64, .86, .75).normalize();
  const selectionRing = ring(scene, new THREE.MeshBasicMaterial({ color: 0xd2fef0, depthWrite: false, depthTest: false }), 0, -.1, 0, .77, .038);
  selectionRing.renderOrder = 100;
  selectionRing.visible = false;

  function measureView() {
    const bounds = elements.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const aspect = bounds.width / bounds.height;
    const horizontal = Math.min(95, Math.max(56, aspect * 49));
    const upper = (focusId ? elements.panel : document.querySelector('.topbar')).getBoundingClientRect().bottom;
    const lower = document.querySelector('.bottom').getBoundingClientRect().top;
    const room = Math.max(bounds.height * .2, lower - upper - 24);
    const center = THREE.MathUtils.clamp((lower + upper) / 2 - bounds.top, bounds.height * .25, bounds.height * .68);
    view = { horizontal, vertical: horizontal / aspect, center, room, height: bounds.height };
  }

  function updateProjection() {
    if (!view) return;
    const { horizontal, vertical, center, height } = view;
    const lift = (center / height - .5) * vertical / camera.zoom;
    if (camera.right === horizontal / 2 && camera.top === vertical / 2 + lift) return;
    camera.left = -horizontal / 2;
    camera.right = horizontal / 2;
    camera.bottom = -vertical / 2 + lift;
    camera.top = vertical / 2 + lift;
    camera.updateProjectionMatrix();
  }

  function framing(id) {
    if (!id) return { position: widePosition, target: wideCenter, zoom: 1 };
    const building = buildings.get(id);
    const target = follower ? follower.group.position.clone() : V(building.x, 1.05, building.z);
    const position = target.clone().addScaledVector(facing, 45);
    const heightVisible = view ? view.vertical * view.room / view.height : 32;
    const zoom = THREE.MathUtils.clamp(Math.min(
      (view?.horizontal ?? 58) / (follower ? 6.4 : 13.6),
      heightVisible / (follower ? 4.9 : 9.35),
    ), 1.65, 11);
    return { position, target, zoom };
  }

  function select(id, agentId) {
    focusId = id;
    follower = agents.find(agent => agent.profile.id === agentId);
    for (const building of buildings.values()) building.group.visible = !id || building.id === id;
    measureView();
    const goal = framing(id);
    cameraMove = {
      ...goal, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), fromZoom: camera.zoom,
      started: performance.now() / 1000,
    };
  }

  controls.addEventListener('start', () => { cameraMove = null; });

  function resize() {
    const width = elements.canvas.clientWidth;
    const height = elements.canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    measureView();
    updateProjection();
    if (focusId) select(focusId, follower?.profile.id);
  }
  new ResizeObserver(resize).observe(elements.world);
  const overlay = new ResizeObserver(measureView);
  overlay.observe(elements.panel);
  overlay.observe(document.querySelector('.bottom'));
  resize();

  function animateCamera(time, delta) {
    if (!cameraMove) {
      if (follower) {
        followStep.copy(follower.group.position).sub(controls.target)
          .multiplyScalar(reducedMotion.matches ? 1 : Math.min(delta * 8, 1));
        controls.target.add(followStep);
        camera.position.add(followStep);
      }
      return;
    }
    const progress = reducedMotion.matches ? 1 : Math.min((time - cameraMove.started) / .72, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    camera.position.copy(cameraMove.fromPosition).lerp(cameraMove.position, eased);
    controls.target.copy(cameraMove.fromTarget).lerp(cameraMove.target, eased);
    camera.zoom = THREE.MathUtils.lerp(cameraMove.fromZoom, cameraMove.zoom, eased);
    camera.updateProjectionMatrix();
    if (progress >= 1) cameraMove = null;
  }

  function setWallFade(building, delta) {
    const isFocused = focusId === building.id;
    building.interior.visible = isFocused;
    const next = isFocused ? 0 : 1;
    building.exterior.visible = !isFocused || building.fade > .018;
    if (Math.abs(building.fade - next) < .003) return;
    building.fade = reducedMotion.matches ? next : THREE.MathUtils.lerp(building.fade, next, Math.min(delta * 7.5, 1));
    if (Math.abs(building.fade - next) < .006) building.fade = next;
    const transparent = building.fade < .999;
    for (const material of building.walls) {
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.depthWrite = !transparent;
        material.needsUpdate = true;
      }
      material.opacity = material.userData.opacity * building.fade;
    }
  }

  const screenPoint = V();
  function placeMarkers() {
    const width = elements.canvas.clientWidth;
    const height = elements.canvas.clientHeight;
    for (const [id, building] of buildings) {
      const { marker, activity } = building;
      screenPoint.set(building.x, building.height + .68, building.z).project(camera);
      const narrow = width < 590;
      const x = (screenPoint.x + 1) * width / 2 - (narrow && id === 'moex' ? 25 : 0);
      const y = (1 - screenPoint.y) * height / 2 + (narrow && id === 'hq' ? 16 : 0);
      const coversRelay = id === 'hq' && orbitalBeam.visible;
      const visible = !focusId && !coversRelay && x > 32 && x < width - 32 && y > 57 && y < height * .78;
      if (building.visible !== visible) {
        building.visible = visible;
        marker.hidden = !visible;
      }
      if (!visible) {
        marker.hidden = true;
        continue;
      }
      marker.style.left = Math.round(x) + 'px';
      marker.style.top = Math.round(y) + 'px';
      marker.classList.toggle('has-activity', Boolean(activity));
    }
  }

  function update(data, relay) {
    const clock = performance.now() / 1000;
    armRelay(relay, clock);
    for (const agent of agents) {
      const next = data.get(agent.profile.id) ?? empty;
      if (agent.row.district !== next.district || agent.row.action !== next.action) {
        agent.launch.copy(agent.group.position);
        agent.started = clock;
        agent.inFlight = agent.row.district !== next.district;
      }
      agent.row = next;
    }
    for (const [id, building] of buildings) {
      const active = agents.filter(agent => agent.row.district === id && agent.row.action !== 'idle');
      const actions = [...new Set(active.map(agent => stateLabel(agent.row)))];
      const activity = actions.length > 1 ? actions[0] + ' · +' + (actions.length - 1) : (actions[0] ?? '');
      building.activity = activity;
      const track = building.marker.querySelector('em');
      track.textContent = activity;
      track.hidden = !activity;
    }
  }

  let then = performance.now() / 1000;
  const end = V();
  const direction = V();
  function render(ms) {
    const time = ms / 1000;
    const delta = Math.min(.065, Math.max(.001, time - then));
    then = time;
    const visualTime = reducedMotion.matches ? 0 : time;
    animateCamera(time, delta);
    controls.update();
    updateProjection();
    updateTicker(visualTime);
    updateRadar(visualTime);
    updateWater(visualTime);
    const returning = updateOrbital(time);
    for (const [, building] of buildings) setWallFade(building, delta);
    for (const agent of agents) {
      const building = buildings.get(agent.row.district);
      const elapsed = time - agent.started;
      const flying = !reducedMotion.matches && agent.inFlight && elapsed < 2.54;
      if (flying) flightPosition(agent, building, elapsed, end);
      else end.copy(positionInside(agent, building, time));
      direction.copy(end).sub(agent.lastPosition);
      if (Math.hypot(direction.x, direction.z) > .005) {
        const yaw = Math.atan2(direction.x, direction.z);
        const step = Math.atan2(Math.sin(yaw - agent.group.rotation.y), Math.cos(yaw - agent.group.rotation.y));
        agent.group.rotation.y += step * Math.min(delta * 9, 1);
      }
      agent.lastPosition.copy(end);
      agent.group.position.copy(end);
      const active = !agent.profile.job || agent.row.action !== 'idle';
      const enclosed = building.id !== 'lounge';
      const showExterior = flying || focusId !== building.id;
      agent.group.visible = active && (!focusId || focusId === building.id);
      agent.group.scale.setScalar(follower === agent ? 1.68 : focusId === building.id ? 1.29 : 1);
      if (active && showExterior && enclosed && !flying) {
        agent.group.position.set(building.x + (agent.index - 2) * .53, building.height + .64 + Math.sin(visualTime * 4 + agent.index) * .13, building.z + .68);
      }
      effects(agent, building, visualTime, active && !flying && focusId === building.id);
      updatePackets(agent, building, visualTime, active && !focusId);
      if (agent === reporter && returning !== null) {
        const progress = reducedMotion.matches ? 1 : Math.min(returning / 1.7, 1);
        agent.group.position.copy(returnStart).lerp(rooftop, progress);
        agent.group.position.y += Math.sin(progress * Math.PI) * 2.1;
        agent.group.visible = true;
        agent.folder.visible = true;
      }
    }
    selectionRing.visible = Boolean(follower?.group.visible);
    if (selectionRing.visible) {
      const { x, y, z } = follower.group.position;
      selectionRing.position.set(x, Math.max(.52, y - .53), z);
    }
    placeMarkers();
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(render);

  return { select, update };
}
