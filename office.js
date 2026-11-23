'use strict';

const webApp = window.Telegram?.WebApp;
webApp?.ready();
webApp?.expand();

const canvas = document.querySelector('#map');
const ctx = canvas.getContext('2d');
const statusLabel = document.querySelector('#connection');
const note = document.querySelector('#note');
const retry = document.querySelector('#retry');
const agentsEl = document.querySelector('#agents');
const phases = {
  idle: 'Ожидает', planning: 'Планирует', coding: 'Пишет код',
  testing: 'Проверяет', reviewing: 'Разбирает результаты',
  reporting: 'Готовит отчёт', blocked: 'Нужна помощь',
};
const roles = [
  { id: 'coder', name: 'Coder', color: '#71edcf', desk: [65, 69], rest: [239, 144] },
  { id: 'tester', name: 'Tester', color: '#ffcf7b', desk: [135, 69], rest: [263, 144] },
  { id: 'reporter', name: 'Reporter', color: '#ef9bfc', desk: [100, 132], rest: [287, 144] },
];
const agents = roles.map((role, index) => {
  const card = document.createElement('article');
  card.innerHTML = '<span class="swatch" aria-hidden="true"></span><div><h2></h2><p></p><code hidden></code></div>';
  card.style.setProperty('--color', role.color);
  card.querySelector('h2').textContent = role.name;
  agentsEl.append(card);
  return { ...role, card, index, position: [...role.rest], target: [...role.rest] };
});

const local = location.origin === 'http://127.0.0.1:8765';
const endpoint = local ? location.origin : window.OFFICE_CONFIG?.tunnel;
const initData = webApp?.initData ?? '';
const canConnect = Boolean(endpoint && (local || initData));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const demos = [
  [{ phase: 'coding', detail: 'Правит модуль импорта', files: ['src/import.js'] }, { phase: 'idle' }, { phase: 'idle' }],
  [{ phase: 'planning', detail: 'Разбирает результаты проверки' }, { phase: 'testing', detail: 'Запускает тесты', files: ['tests/import.test.js'] }, { phase: 'idle' }],
  [{ phase: 'idle' }, { phase: 'reviewing', detail: 'Сверяет результаты' }, { phase: 'reporting', detail: 'Собирает итоговый отчёт' }],
  [{ phase: 'idle' }, { phase: 'idle' }, { phase: 'idle' }],
];
let socket;
let mode = 'demo';
let demoIndex = 0;
let nextConnection;

function setMode(value, message) {
  mode = value;
  statusLabel.dataset.mode = value;
  statusLabel.textContent = value === 'live' ? 'В эфире' : 'Демо';
  retry.hidden = value === 'live' || !canConnect;
  note.textContent = message;
}

function apply(rows) {
  for (const agent of agents) {
    const row = rows[agent.id] ?? {};
    const phase = Object.hasOwn(phases, row.phase) ? row.phase : 'idle';
    agent.target = phase === 'idle' ? agent.rest
      : ['testing', 'reviewing', 'blocked'].includes(phase) ? [229 + agent.index * 22, 74]
      : agent.desk;
    const description = agent.card.querySelector('p');
    description.textContent = phases[phase] + (row.detail ? ' · ' + row.detail : '');
    const lines = Array.isArray(row.files) ? row.files : [];
    const fileLabel = agent.card.querySelector('code');
    fileLabel.hidden = lines.length === 0;
    fileLabel.textContent = lines.join(' · ');
  }
}

function demo() {
  if (mode !== 'demo') return;
  const frame = demos[demoIndex++ % demos.length];
  apply(Object.fromEntries(roles.map(({ id }, index) => [id, frame[index]])));
}

function receive(value) {
  if (!value?.agents) return false;
  setMode('live', 'Статусы обновляются с рабочего ПК.');
  apply(value.agents);
  return true;
}

function connect() {
  if (!canConnect) return;
  clearTimeout(nextConnection);
  socket?.close();
  const url = new URL('/ws', endpoint);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const client = new WebSocket(url);
  socket = client;
  const timer = setTimeout(() => client.close(), 6500);
  client.addEventListener('open', () => client.send(initData));
  client.addEventListener('message', event => {
    if (client !== socket) return;
    try {
      if (receive(JSON.parse(event.data))) clearTimeout(timer);
    } catch {
      client.close();
    }
  });
  client.addEventListener('close', async () => {
    clearTimeout(timer);
    if (client !== socket) return;
    try {
      const response = await fetch(new URL('/api/status', endpoint), {
        headers: initData ? { authorization: 'tma ' + initData } : {},
        signal: AbortSignal.timeout(4500),
      });
      const state = response.ok ? await response.json() : null;
      if (client !== socket) return;
      if (receive(state)) {
        nextConnection = setTimeout(connect, 5000);
        return;
      }
    } catch {
      if (client !== socket) return;
    }
    setMode('demo', 'Связь с рабочим ПК прервана. Показываем демонстрацию.');
    demo();
    nextConnection = setTimeout(connect, 12000);
  });
}

function box(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function desk(x, y) {
  box(x, y + 4, 35, 15, '#111625');
  box(x + 2, y, 31, 12, '#9a6b61');
  box(x + 2, y, 31, 3, '#ce9179');
  box(x + 11, y - 9, 15, 11, '#24253b');
  box(x + 13, y - 7, 11, 6, '#82d1da');
  box(x + 16, y - 1, 4, 4, '#3e4d60');
  box(x + 10, y + 5, 15, 3, '#e7c6a3');
}

function plant(x, y) {
  box(x, y, 8, 5, '#b36b70');
  box(x + 3, y - 9, 2, 10, '#54a685');
  box(x, y - 8, 4, 4, '#75cb9c');
  box(x + 5, y - 11, 5, 4, '#9fe0a9');
}

function furniture() {
  box(0, 0, 320, 184, '#131827');
  box(10, 10, 300, 164, '#30364c');
  box(15, 15, 290, 154, '#20273c');
  for (let y = 18; y < 160; y += 12) {
    for (let x = 18; x < 298; x += 12) {
      box(x, y, 11, 11, (x + y) % 24 === 0 ? '#29344d' : '#263149');
    }
  }
  box(189, 16, 5, 82, '#535976');
  box(194, 94, 110, 5, '#535976');
  box(196, 107, 104, 54, '#414369');
  box(199, 110, 98, 48, '#353859');
  box(31, 89, 129, 7, '#33405f');
  desk(48, 40);
  desk(117, 40);
  desk(83, 104);
  [211, 244, 277].forEach(x => {
    box(x, 29, 20, 33, '#141b2b');
    box(x + 2, 30, 16, 28, '#53647b');
    for (let y = 33; y <= 51; y += 6) {
      box(x + 4, y, 12, 4, '#273648');
      box(x + 5, y + 1, 2, 2, '#72e4ad');
      box(x + 11, y + 1, 3, 1, '#86a7d0');
    }
  });
  box(228, 119, 56, 15, '#242440');
  box(232, 115, 48, 14, '#8178ae');
  box(234, 120, 20, 9, '#aaa0d2');
  box(258, 120, 20, 9, '#aaa0d2');
  plant(29, 64);
  plant(160, 143);
  plant(287, 133);
}

let lastFrame = 0;
function frame(ms) {
  const elapsed = Math.min(ms - lastFrame, 40);
  lastFrame = ms;
  furniture();
  for (const agent of agents) {
    const dx = agent.target[0] - agent.position[0];
    const dy = agent.target[1] - agent.position[1];
    const distance = Math.hypot(dx, dy);
    if (reducedMotion.matches || distance < 1) agent.position = [...agent.target];
    else {
      const step = Math.min(distance, elapsed * .065);
      agent.position[0] += dx / distance * step;
      agent.position[1] += dy / distance * step;
    }
    const [x, y] = agent.position.map(Math.round);
    const stride = !reducedMotion.matches && distance > 1 ? Math.floor(ms / 130) % 2 : 0;
    box(x - 6, y + 2, 13, 4, '#111522');
    box(x - 4, y - 15, 9, 8, '#f1bf9a');
    box(x - 4, y - 15, 9, 3, '#35283f');
    box(x + 2, y - 11, 1, 1, '#35283f');
    box(x - 5, y - 7, 11, 7, agent.color);
    box(x - 4, y, 3, 3 + stride, '#d7e1f5');
    box(x + 2, y, 3, 4 - stride, '#d7e1f5');
  }
  requestAnimationFrame(frame);
}

setMode('demo', canConnect ? 'Подключаемся к рабочему ПК…' : 'Откройте Mini App из меню бота, чтобы видеть рабочие статусы.');
demo();
setInterval(demo, 4700);
retry.addEventListener('click', connect);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && mode !== 'live') connect();
});
requestAnimationFrame(frame);
connect();
