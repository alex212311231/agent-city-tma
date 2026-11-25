import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInbox } from '../agent-city-tma/service/thread-inbox.mjs';
import { createDashboard } from '../agent-city-tma/service/dashboard.mjs';
import { officeLog } from './office-log.mjs';
import { cityMarket } from './city-market.mjs';
import { safeCode, safeLog } from './city-telemetry.mjs';

if (process.connected) process.on('disconnect', () => process.exit(0));
process.on('uncaughtExceptionMonitor', error => officeLog('error', 'Сбой офиса: ' + (error.code ?? error.name)));

const require = createRequire(new URL('../runtime/package.json', import.meta.url));
const { WebSocket, WebSocketServer } = require('ws');
const root = new URL('../', import.meta.url);
const privateRuntime = fileURLToPath(new URL('runtime/', root));
const submitBuild = createInbox(privateRuntime);
const dashboard = createDashboard(privateRuntime);
const statePath = fileURLToPath(new URL('status.json', root));
const tempPath = statePath + '.tmp';
const port = 8765;
const host = '127.0.0.1';
const roles = ['lead', 'coder', 'tester', 'scout', 'reporter'];
const jobNames = ['moex', 'grants'];
const relayStages = new Set(['receiving', 'working', 'returning', 'sent', 'blocked', 'idle']);
const projects = new Set([...jobNames, 'dev']);
const phaseActions = new Map([
  ['idle', 'idle'], ['planning', 'folders'], ['coding', 'coding'], ['testing', 'testing'],
  ['reviewing', 'testing'], ['reporting', 'reporting'], ['blocked', 'idle'],
]);
const actionPhases = new Map([
  ['idle', 'idle'], ['folders', 'planning'], ['coding', 'coding'], ['testing', 'testing'], ['reporting', 'reporting'],
]);
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const owner = process.env.TELEGRAM_CHAT_ID;
const writeToken = process.env.OFFICE_WRITE_TOKEN;
if (!botToken || !/^\d+$/.test(owner ?? '') || !writeToken) {
  throw new Error('Office environment is incomplete');
}

const localOrigin = 'http://' + host + ':' + port;
const trustedOrigins = new Set([localOrigin, 'https://alex212311231.github.io']);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/office.css', ['office.css', 'text/css; charset=utf-8']],
  ['/office.js', ['office.js', 'text/javascript; charset=utf-8']],
  ['/config.js', ['config.js', 'text/javascript; charset=utf-8']],
]);

const activities = new Set(['read_files','write_code','run_tests','deploy_report','error','idle']);
const activityFor = { folders:'read_files', coding:'write_code', testing:'run_tests', reporting:'deploy_report', idle:'idle' };
const brief = value => typeof value === 'string' && value.length <= 128 &&
  !/^(?:[a-z]:[\\/]|[\\/])|(?:^|[\\/])(?:\.\.|\.env|credentials?|secrets?|private)(?:[\\/._-]|$)/iu.test(value)
  ? safeCode(value.split(/[\r\n]/u,1)[0]) : '';
const blank = (project = 'dev') => ({ project, action: 'idle', phase: 'idle', detail: 'Ожидает задачу', activity: 'idle', subject: '', test_result: '', test_count: null, files: [], code_snippet: '', current_log: '', updatedAt: null });
let state = {
  agents: Object.fromEntries(roles.map(role => [role, blank()])),
  jobs: Object.fromEntries(jobNames.map(project => [project, blank(project)])),
  relay: null,
  market: null,
};
const wsServer = new WebSocketServer({ noServer: true, maxPayload: 8192 });
const readers = new Set();
let pendingWrite = Promise.resolve();

function sameToken(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isOwner(initData) {
  if (typeof initData !== 'string' || initData.length > 7500) return false;
  const params = new URLSearchParams(initData);
  if (new Set(params.keys()).size !== [...params].length) return false;
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return false;
  params.delete('hash');
  const fields = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(fields.map(([key, value]) => key + '=' + value).join('\n')).digest('hex');
  if (!sameToken(hash, expected)) return false;
  const age = Math.floor(Date.now() / 1000) - Number(params.get('auth_date'));
  if (!Number.isFinite(age) || age < -30 || age > 43200) return false;
  try {
    return String(JSON.parse(params.get('user')).id) === owner;
  } catch {
    return false;
  }
}

function local(req) {
  return req.headers.host === host + ':' + port &&
    req.socket.remoteAddress === host &&
    !req.headers['cf-connecting-ip'] &&
    !req.headers['x-forwarded-for'] &&
    !req.headers.forwarded;
}

function json(res, code, value) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readBody(req, limit = 8192) {
  req.setEncoding('utf8');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) throw new Error('Too large');
  }
  return JSON.parse(body);
}

function normalize(value, fallbackProject = 'dev') {
  if (!value || typeof value !== 'object') return null;
  const project = value.project === undefined ? fallbackProject : value.project;
  const phase = value.phase === undefined ? actionPhases.get(value.action) : value.phase;
  const action = value.action === undefined ? phaseActions.get(phase) : value.action;
  if (!projects.has(project) || !phaseActions.has(phase) || !actionPhases.has(action)) return null;
  return {
    project,
    action,
    phase,
    activity: activities.has(value.activity) && (action !== 'idle' || value.activity === 'error' || value.activity === 'idle')
      ? value.activity : phase === 'blocked' ? 'error' : activityFor[action],
    subject: brief(value.subject),
    test_result: ['running','success','failure'].includes(value.test_result) ? value.test_result : '',
    test_count: Number.isSafeInteger(value.test_count) && value.test_count >= 0 && value.test_count <= 1000000 ? value.test_count : null,
    detail: typeof value.detail === 'string' ? value.detail.slice(0, 160) : '',
    files: Array.isArray(value.files) ? value.files
      .filter(path => typeof path === 'string' && /^[\p{L}\p{N}_.@() /\\-]{1,160}$/u.test(path) &&
        !/(?:^|[/\\])(?:\.env[^/\\]*|auth\.json|status\.json|[^/\\]*\.(?:pem|key)|credentials[^/\\]*)$/i.test(path))
      .slice(0, 8) : [],
    code_snippet: action === 'idle' ? '' : safeCode(value.code_snippet),
    current_log: action === 'idle' && value.activity !== 'error' ? '' : safeLog(value.current_log),
    updatedAt: new Date().toISOString(),
  };
}

async function save(change) {
  const operation = pendingWrite.then(async () => {
    const next = change(state);
    await writeFile(tempPath, JSON.stringify(next, null, 2) + '\n');
    await rename(tempPath, statePath);
    state = next;
    const message = JSON.stringify(state);
    for (const client of readers) {
      if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) client.send(message);
    }
  });
  pendingWrite = operation.catch(() => {});
  return operation;
}

const server = createServer(async (req, res) => {
  const { url, method } = req;
  const origin = req.headers.origin;
  if (origin && !trustedOrigins.has(origin)) return json(res, 403, { error: 'Origin denied' });
  if (origin) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('x-content-type-options', 'nosniff');
  const dashboardURL = /^\/api\/dashboard(?:\?refresh=(radar|mail|moex))?$/.exec(url);
  const preview = /^\/api\/preview\/([a-zA-Z0-9_-]{1,70})$/.exec(url);
  if ((url === '/api/status' || dashboardURL || preview) && method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-methods': 'GET', 'access-control-allow-headers': 'authorization', 'access-control-max-age': '600' });
    return res.end();
  }
  if (url === '/api/tasks' && method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600' });
    return res.end();
  }
  if (url === '/api/tasks' && method === 'POST') {
    const auth = req.headers.authorization ?? '';
    const ownerFromTelegram = origin && auth.startsWith('tma ') && isOwner(auth.slice(4));
    const internal = !origin && local(req) && sameToken(auth, 'Bearer ' + writeToken);
    if (!ownerFromTelegram && !internal) return json(res, 401, { error: 'Откройте офис из личного чата с ботом.' });
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
      return json(res, 415, { error: 'Не удалось прочитать задание.' });
    }
    let request;
    try {
      request = await readBody(req, 32768);
    } catch {
      return json(res, 400, { error: 'Не удалось прочитать задание.' });
    }
    try {
      const result = await submitBuild(request);
      return json(res, result.status, result.info);
    } catch (error) {
      officeLog('error', 'Ошибка журнала заданий: ' + (error.code ?? error.name));
      return json(res, 503, { error: 'Сервис заданий временно недоступен.' });
    }
  }
  if (url === '/health' && method === 'GET') return json(res, 200, { ok: true });
  if ((url === '/api/status' || dashboardURL || preview) && method === 'GET') {
    const auth = req.headers.authorization ?? '';
    if (!(local(req) && (!origin || origin === localOrigin)) &&
        !(auth.startsWith('tma ') && isOwner(auth.slice(4)))) {
      return json(res, 401, { error: 'Telegram owner authentication required' });
    }
    if (preview) {
      const folder = join(privateRuntime,'content',preview[1]);
      let proof = await readFile(join(folder,'validation.json'),'utf8').then(JSON.parse).catch(() => null);
      const file = join(folder,proof ? 'output.mp4' : 'storyboard.mp4');
      if (!proof) proof = await readFile(join(folder,'storyboard-validation.json'),'utf8').then(JSON.parse).catch(() => null);
      const info = await stat(file).catch(() => null);
      if (!info?.isFile() || !proof || proof.bytes !== info.size) return json(res,404,{error:'Черновик ещё не проверен'});
      const video = createReadStream(file);
      video.on('error', () => res.destroy());
      res.on('close', () => video.destroy());
      res.writeHead(200,{'content-type':'video/mp4','content-length':info.size,'cache-control':'private, no-store'});
      return video.pipe(res);
    }
    if (dashboardURL) {
      try { return json(res,200,await dashboard(state,dashboardURL[1])); }
      catch { return json(res,503,{error:'Журнал временно недоступен'}); }
    }
    return json(res, 200, state);
  }
  if (url === '/api/status' && method === 'PUT') {
    if (origin || !local(req) || !sameToken(req.headers.authorization ?? '', 'Bearer ' + writeToken)) {
      return json(res, 403, { error: 'Write denied' });
    }
    let incoming;
    try {
      incoming = await readBody(req);
    } catch {
      return json(res, 400, { error: 'Invalid status' });
    }
    if (incoming?.relay === true) {
      if (incoming.role !== undefined || incoming.job !== undefined || !projects.has(incoming.project) ||
          !relayStages.has(incoming.stage) || typeof incoming.detail !== 'string') {
        return json(res, 400, { error: 'Invalid relay status' });
      }
      const relay = {
        project: incoming.project,
        stage: incoming.stage,
        detail: incoming.detail.slice(0, 160),
        updatedAt: new Date().toISOString(),
      };
      try {
        await save(current => ({ ...current, relay }));
        return json(res, 200, { ok: true });
      } catch (error) {
        officeLog('error', 'Ошибка сохранения передачи: ' + (error.code ?? error.name));
        return json(res, 500, { error: 'Relay status could not be saved' });
      }
    }
    const isRole = roles.includes(incoming?.role) && incoming.job === undefined;
    const isJob = jobNames.includes(incoming?.job) && incoming.role === undefined;
    const item = (isRole || isJob) && normalize(incoming, isJob ? incoming.job : state.agents[incoming.role].project);
    if (!item || (isJob && item.project !== incoming.job)) return json(res, 400, { error: 'Invalid status target, project or action' });
    const collection = isJob ? 'jobs' : 'agents';
    const key = isJob ? incoming.job : incoming.role;
    try {
      await save(current => ({ ...current, [collection]: { ...current[collection], [key]: item } }));
      return json(res, 200, { ok: true });
    } catch (error) {
      officeLog('error', 'Ошибка сохранения статуса: ' + (error.code ?? error.name));
      return json(res, 500, { error: 'Status could not be saved' });
    }
  }
  const assetPath = url?.split('?', 1)[0];
  if (local(req) && method === 'GET' && files.has(assetPath)) {
    const [name, type] = files.get(assetPath);
    const content = await readFile(new URL('agent-city-tma/' + name, root)).catch(() => null);
    if (content) {
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
      return res.end(content);
    }
  }
  return json(res, 404, { error: 'Not found' });
});
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws' || !trustedOrigins.has(req.headers.origin) || wsServer.clients.size >= 32) {
    return socket.destroy();
  }
  wsServer.handleUpgrade(req, socket, head, client => {
    client.on('error', () => {});
    const timeout = setTimeout(() => client.close(1008, 'Authentication required'), 5000);
    client.once('close', () => {
      clearTimeout(timeout);
      readers.delete(client);
    });
    client.once('message', message => {
      clearTimeout(timeout);
      if (!(local(req) && req.headers.origin === localOrigin) && !isOwner(message.toString())) {
        return client.close(1008, 'Authentication required');
      }
      readers.add(client);
      client.send(JSON.stringify(state));
    });
  });
});
const last = await readFile(statePath, 'utf8').then(JSON.parse).catch(() => null);
for (const [collection, keys] of [['agents', roles], ['jobs', jobNames]]) {
  for (const key of keys) {
    const original = last?.[collection]?.[key];
    const previous = normalize(original, collection === 'jobs' ? key : 'dev');
    if (!previous || (collection === 'jobs' && previous.project !== key)) continue;
    state[collection][key] = previous.action === 'idle' ? { ...previous, updatedAt: original.updatedAt ?? null }
      : { ...blank(previous.project), detail: 'Сервер статусов перезапущен', updatedAt: new Date().toISOString() };
  }
}
if (relayStages.has(last?.relay?.stage) && projects.has(last?.relay?.project)) state.relay = last.relay;
await save(current => current);
server.on('error', error => {
  officeLog('error', 'HTTP ' + localOrigin + ': ' + (error.code ?? error.name));
  process.exit(1);
});
server.listen(port, host, () => officeLog('info', 'HTTP ' + localOrigin + ' готов'));

async function refreshMarket() {
  try {
    const market = await cityMarket();
    if (market && JSON.stringify(market) !== JSON.stringify(state.market)) {
      await save(current => ({ ...current, market }));
    }
  } catch {
    // Status, task intake and visualization continue with the last successful quote.
  }
}
void refreshMarket();
setInterval(refreshMarket, 90000).unref();
