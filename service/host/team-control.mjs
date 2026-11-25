import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const stateDir = process.env.OPENCLAW_STATE_DIR;
const runtimeDir = process.env.OFFICE_TEAM_RUNTIME_DIR ?? (stateDir && dirname(resolve(stateDir)));
const runtime = runtimeDir ? pathToFileURL(resolve(runtimeDir) + sep) : new URL('../runtime/', import.meta.url);
const modeFile = new URL('team-mode.json', runtime);
export const modes = Object.freeze({ auto: 'Автопилот', confirm: 'С подтверждением', solo: 'Соло' });
export const agentNames = Object.freeze({ lead: 'Тимлид', coder: 'Coder', tester: 'QA', reporter: 'Reporter', scout: 'Scout' });
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const controlFile = (id, kind) => {
  if (!idPattern.test(id)) throw new Error('Invalid job id');
  return new URL('team-' + kind + '-' + id + '.json', runtime);
};

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(file, value) {
  const tmp = new URL(file.href + '.' + randomUUID() + '.tmp');
  await writeFile(tmp, JSON.stringify(value) + '\n', { flag: 'wx' });
  await rename(tmp, file);
}

export async function getMode() {
  const current = await readJson(modeFile);
  return Object.hasOwn(modes, current?.mode) ? current.mode : 'auto';
}
export async function setMode(mode) {
  if (!Object.hasOwn(modes, mode)) throw new Error('Unknown team mode');
  await writeJson(modeFile, { mode });
}
export async function activeJob() {
  const active = (await readJson(new URL('build-dispatch.json', runtime)))?.active;
  if (!active?.pid || !idPattern.test(active.id)) return null;
  try { process.kill(active.pid, 0); } catch { return null; }
  return active;
}
export function readJob(id) { return readJson(controlFile(id, 'state')); }
export function publishJob(id, state) { return writeJson(controlFile(id, 'state'), state); }
export function getDecision(id) { return readJson(controlFile(id, 'decision')); }
export function isStopped(id) { return readJson(controlFile(id, 'stop')); }

export async function decide(id, value) {
  const active = await activeJob();
  if (active?.id !== id || !['start', 'cancel'].includes(value) ||
      (await readJob(id))?.phase !== 'approval' || await isStopped(id)) return false;
  // One decision wins even when two callbacks are processed concurrently.
  try {
    await writeFile(controlFile(id, 'decision'), JSON.stringify(value), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

export async function requestStop() {
  const active = await activeJob();
  if (!active) return false;
  const job = await readJob(active.id);
  if (['done', 'blocked', 'stopped'].includes(job?.phase)) return false;
  await writeJson(controlFile(active.id, 'stop'), true);
  return true;
}

export function modeButtons(mode) {
  return Object.entries(modes).map(([key, label]) => [
    { text: (key === mode ? '✓ ' : '') + label, callback_data: 'hub:mode:' + key },
  ]);
}

export function decisionButtons(id) {
  return [[
    { text: 'Запустить команду', callback_data: 'hub:start:' + id },
    { text: 'Отмена', callback_data: 'hub:cancel:' + id },
  ]];
}

export async function telegram(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const owner = process.env.TELEGRAM_CHAT_ID;
  if (!token || !/^\d+$/.test(owner ?? '')) throw new Error('Telegram environment unavailable');
  try {
    const result = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: owner, ...body }),
      signal: AbortSignal.timeout(4500),
    }).then(response => response.json());
    if (result.ok) return result.result;
    if (method === 'editMessageText' && /message is not modified/i.test(result.description ?? '')) return true;
  } catch {}
  throw new Error('Telegram ' + method + ' unavailable');
}

export const officeFetch = (path, options = {}) => fetch('http://127.0.0.1:8765' + path, {
  ...options,
  headers: { authorization: 'Bearer ' + process.env.OFFICE_WRITE_TOKEN, 'content-type': 'application/json' },
  signal: AbortSignal.timeout(path === '/api/tasks' ? 32000 : 3000),
});

export async function sendMenu(prefix = '') {
  const mode = await getMode();
  return telegram('sendMessage', {
    text: [prefix, 'Пульт AI Hub · ' + modes[mode], '/status — задачи и фоновые сервисы', '/team — режим команды', '/stop — остановить активное задание', '/build — передать поручение'].filter(Boolean).join('\n'),
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: modeButtons(mode) },
  });
}

