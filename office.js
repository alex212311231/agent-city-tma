'use strict';

const telegram = window.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();
if (telegram?.isVersionAtLeast?.('7.7')) telegram.disableVerticalSwipes?.();

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
  hq: { name: 'Эмпайр-стейт-билдинг', label: 'Эмпайр-стейт', description: 'Штаб AI Hub и приём заданий на Таймс-сквер.', color: '#f7cf8d' },
  moex: { name: 'MOEX Tower', label: 'MOEX', description: 'Биржевые терминалы и табло котировок.', color: '#71d9ff' },
  grants: { name: 'Grant Radar', label: 'Радар', description: 'Мониторинг публикаций и работа со списками.', color: '#fc98c5' },
  dev: { name: 'Dev Lab', label: 'Dev Lab', description: 'Рабочие столы разработчиков и мониторы проверок.', color: '#8be8d4' },
  lounge: { name: 'Дома агентов', label: 'Дома', description: 'Пять таунхаусов у зимнего сквера. Когда начинается работа, агенты выходят к штабу.', color: '#a7dbc4' },
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
  { id: 'coder', title: 'Coder', color: '#427868' },
  { id: 'tester', title: 'QA', color: '#ad654f' },
  { id: 'reporter', title: 'Reporter', color: '#795f8b' },
  { id: 'lead', title: 'Тимлид', color: '#426898' },
  { id: 'scout', title: 'Scout', color: '#a77a39' },
  { id: 'job-moex', title: 'Сбор MOEX', color: '#72aaff', job: 'moex' },
  { id: 'job-grants', title: 'Радар грантов', color: '#67f5b0', job: 'grants' },
];

for (const profile of profiles.filter(profile => !profile.job)) {
  districts['home-'+profile.id] = {
    name: 'Дом · '+profile.title, label: 'Дома', color: profile.color,
    description: 'Когда агент получает задачу, он выходит из дома и направляется к штабу.',
  };
}

const empty = { action: 'idle', district: 'lounge', detail: '', files: [] };
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
const demoControl=document.getElementById('demo-activity');
const floorPicker=document.getElementById('floor-picker');
const floorControl=document.getElementById('office-floor');
const liftPanel=document.getElementById('lift-panel');
const liftStatus=document.getElementById('lift-status');
const liftCall=document.getElementById('lift-call');
const liftButtons=[...liftPanel.querySelectorAll('[data-floor]')];
floorControl.addEventListener('change',()=>city?.showFloor(floorControl.value));
liftCall.addEventListener('click',()=>city?.liftRequest(null));
for(const button of liftButtons)button.addEventListener('click',()=>city?.liftRequest(Number(button.dataset.floor)));
document.addEventListener('keydown',event=>{
  if(event.code==='KeyE'&&!liftPanel.hidden&&!liftCall.disabled)city?.liftRequest(null);
});
demoControl.addEventListener('change',()=>{ if(forcedDemo)showDemo(); });
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
  const legacyActivity={ folders:'read_files',coding:'write_code',testing:'run_tests',reporting:'deploy_report',idle:'idle' };
  const activity=row?.phase==='blocked'?'error':row?.activity??legacyActivity[action];
  const district = activity==='idle' ? (profile.job?'lounge':'home-'+profile.id) : profile.id === 'lead' ? 'hq' : (project ?? 'dev');
  const detail=typeof row?.detail==='string'?row.detail:'';
  return {
    action, district, activity,
    phase: row?.phase,
    detail: activity==='idle'&&detail==='Нужна помощь'?'':detail,
    files: Array.isArray(row?.files) ? row.files.filter(file => typeof file === 'string').slice(0, 8) : [],
  };
}

function stateLabel(row) {
  return row.activity==='error' ? 'Нужна помощь' : actionNames[row.action];
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
    card.follow.textContent = row.activity==='idle' ? 'К дому' : 'К агенту';
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

const examples={
  read_files:{title:'Coder',subject:'daily/job.py',detail:'Ищет файлы в архиве'},
  write_code:{title:'Coder',subject:'parser.py',detail:'Пишет парсер',code_snippet:'def parse_batch(items):\n    return [item.strip() for item in items]'},
  run_tests:{title:'QA',subject:'tests',detail:'Тесты прошли',test_count:529,test_result:'success',current_log:'# tests 529\n# pass 529'},
  error:{title:'QA',subject:'tests/test_parser.py',detail:'Разбирает сбой теста',test_count:529,test_result:'failure',current_log:'# tests 529\n# fail 1'},
  deploy_report:{title:'Reporter',subject:'Отчёт в Telegram',detail:'Передаёт результат в штаб'},
  idle:{title:'Команда',detail:'Агент возвращается домой'},
};
function showDemo() {
  clearTimeout(demoInterval);
  const sequence=Object.keys(examples);
  const actionFor={read_files:'folders',write_code:'coding',run_tests:'testing',error:'testing',deploy_report:'reporting',idle:'idle'};
  const manual=forcedDemo&&demoControl.value!=='auto';
  function play(index) {
    const activity=manual?demoControl.value:sequence[index];
    const example=examples[activity];
    apply({
      demoActivity:activity,demoScene:example,
      agents:{coder:{...example,action:actionFor[activity],activity,project:'dev'}},
      relay:{stage:activity==='deploy_report'?'returning':activity==='error'?'blocked':'working',
        updatedAt:new Date().toISOString(),detail:'Демо · '+example.detail,project:'dev'},
    });
    if(!manual)demoInterval=setTimeout(()=>play((index+1)%sequence.length),11500);
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
    elements.panelMode.textContent = agentId ? 'Камера агента' : id === 'lounge' || id.startsWith('home-') ? 'Жилой квартал' : 'Интерьер';
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
  demoControl.hidden=!forcedDemo;
  elements.demoLabel.textContent = forcedDemo ? 'Рабочий режим' : 'Демо';
  clearTimeout(demoInterval);
  if (forcedDemo) {
    apply({ agents: {} }, true);
    showDemo();
    selectDistrict('dev');
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
const defaults = Object.freeze({ light: 'dusk', transport: 'mixed', snow: true, volume: 30 });
const storageKey = 'ai-hub-winter-v1';
let townOptions = { ...defaults };
let drag;
let swipePointer;
let musicEnabled = false;
let score;
let audioRevision = 0;
musicButton.disabled = field.music.disabled = true;
void import('city/music').then(module => {
  score = module.createScore();
  musicButton.disabled = field.music.disabled = false;
}).catch(() => {
  musicButton.title = 'Музыка недоступна';
});

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
  board.hidden = folded;
  city?.layout();
}

boardToggle.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  swipePointer = undefined;
  drag = { id: event.pointerId, start: event.clientY };
  boardToggle.setPointerCapture(event.pointerId);
});
boardToggle.addEventListener('pointerup', event => {
  if (drag?.id !== event.pointerId) return;
  const distance = event.clientY - drag.start;
  drag = undefined;
  if (Math.abs(distance) < 24) return;
  setFolded(distance > 0);
  swipePointer = event.pointerId;
});
boardToggle.addEventListener('pointercancel', () => { drag = undefined; });
boardToggle.addEventListener('click', event => {
  if (event.detail && swipePointer !== undefined &&
    (event.pointerId === undefined || event.pointerId === swipePointer)) {
    swipePointer = undefined;
    return;
  }
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
  document.querySelector('meta[name="theme-color"]').content = '#0b132b';
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
  refreshSettings();
  try {
    if (!score || document.hidden) return;
    score.setVolume(townOptions.volume / 100);
    await score.start();
    if (!musicEnabled || document.hidden) score.stop();
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
  import('city/world'), import('city/navigation'), import('city/displays'), import('city/offices'), import('city/traffic'),
])
  .then(async ([THREE, { OrbitControls }, world, navigation, displays, offices, traffic]) => {
    city = world.createCity(THREE, OrbitControls, navigation, displays, offices, traffic, {
      canvas: elements.canvas, markers: elements.markers, profiles, districts, board, reducedMotion,
      movePad: document.getElementById('walk-move'),
      lookPad: document.getElementById('walk-look'),
      walkPlace: document.getElementById('walk-place'),
      lightMode: applyLight,
      onLift(info) {
        liftPanel.hidden=!info;
        if(!info)return;
        liftCall.disabled=info.inside||info.moving||info.at===info.floor;
        liftStatus.textContent=info.moving?'Лифт в пути':'Лифт · этаж '+(info.at+1);
        for(const [index,button] of liftButtons.entries()){
          button.disabled=!info.inside||info.moving||index===info.at;
          button.setAttribute('aria-pressed',String(index===info.at));
        }
      },
      onOffice(visible,reset){
        floorPicker.hidden=!visible;
        if(reset)floorControl.value='auto';
      },
      onSelect: selectDistrict,
      onWalk(walking) {
        elements.app.toggleAttribute('data-walking', walking);
        orbitButton.setAttribute('aria-pressed', String(!walking));
        walkButton.setAttribute('aria-pressed', String(walking));
        document.getElementById('walk-hud').hidden = !walking;
        if(!walking)liftPanel.hidden=true;
      },
    });
    city.update(rows, relayStatus, Boolean(liveData), displaySnapshot);
    city.setOptions(townOptions);
    if (selected) selectDistrict(selected, selectedAgent);
    await city.ready;
    document.getElementById('city-loading').hidden = true;
    walkButton.disabled = false;
  })
  .catch(error => {
    document.getElementById('city-loading').hidden = true;
    console.error('Не удалось создать город', error);
    elements.world.dataset.fallback = 'true';
    elements.canvas.hidden = true;
    elements.help.textContent = '3D недоступно. Задачи и статусы доступны в панели.';
    elements.help.hidden = false;
  });
