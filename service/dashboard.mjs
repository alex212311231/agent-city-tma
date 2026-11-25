import { readdir, readFile, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import sources from './sources.cjs';

const titles = { radar: 'Радар', mail: 'Почта', moex: 'MOEX' };
const providers = { radar: 'Агент «Радар»', mail: 'IMAP', moex: 'MOEX ISS' };
const names = {
  lead: 'ChatGPT Lead', research: 'Ресерчер', writer: 'Сценарист',
  production: 'Продакшн', distribution: 'Дистрибьютор',
};
const statuses = new Set(['IDLE', 'WORKING', 'DONE', 'ERROR']);
const text = (v, limit = 240) => typeof v === 'string' ? v.slice(0, limit) : '';
const clock = () => new Date().toISOString();
const baseAgent = (id) => ({
  id, name: names[id], status: 'IDLE', task: 'Ожидает задачи', file: '', api: '',
  tokens: null, resources: null, events: [],
});

// Run directories contain private media too. Only the bounded, structured event journal is read.
async function latestJournal(runtime) {
  const directory = join(runtime, 'content');
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const journals = await Promise.all(entries.filter(item => item.isDirectory()).map(async item => {
    const path = join(directory, item.name, 'events.jsonl');
    const info = await stat(path).catch(() => null);
    return info?.isFile() ? { path, time: info.mtimeMs, id: item.name } : null;
  }));
  return journals.filter(Boolean).sort((a,b) => b.time - a.time)[0];
}

async function recentEvents(path) {
  const fd = await open(path);
  try {
    const { size } = await fd.stat();
    const start = Math.max(0, size - 262144);
    const buf = Buffer.alloc(size - start);
    const { bytesRead } = await fd.read(buf, 0, buf.length, start);
    const lines = buf.subarray(0,bytesRead).toString('utf8').split('\n');
    if (start) lines.shift();
    return lines.flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } finally { await fd.close(); }
}

async function agents(runtime) {
  const team = Object.fromEntries(Object.keys(names).map(id => [id, baseAgent(id)]));
  const run = await latestJournal(runtime);
  let goal = '';
  if (run) {
    for (const event of await recentEvents(run.path)) {
      if (!event || !Object.hasOwn(team,event.agent) || !statuses.has(event.status)) continue;
      const row = team[event.agent];
      const task = text(event.task);
      if (!goal && event.agent === 'lead' && event.status === 'WORKING') goal = task;
      const file = text(event.file);
      const api = text(event.api);
      Object.assign(row, { status: event.status, task, file, api, updatedAt: text(event.at),
        tokens: Number.isSafeInteger(event.tokens) && event.tokens >= 0 ? event.tokens : null,
        resources: typeof event.resources === 'object' && event.resources ?
          Object.fromEntries(Object.entries(event.resources).slice(0,10).filter(([,v]) => typeof v === 'number' || typeof v === 'string')) :
          text(event.resources) || null });
      row.events.unshift({ at: text(event.at), text: [task, file, api].filter(Boolean).join(' · ') });
      row.events.length = Math.min(16, row.events.length);
    }
  }
  const { lead, ...workers } = team;
  lead.detail = goal || (run ? 'Запуск ' + run.id : 'Ожидает первого запуска');
  const roughCut = lead.status === 'IDLE' && lead.file === 'storyboard.mp4';
  const preview = run && (lead.status === 'DONE' || roughCut) ? run.id : null;
  return { lead, agents: Object.values(workers), preview, previewKind: roughCut ? 'storyboard' : 'final' };
}

export function createDashboard(runtime) {
  const cards = new Map();
  const pending = new Set();
  function update(id, force) {
    if (pending.has(id)) return;
    pending.add(id);
    Promise.resolve(sources.getCard(id, force)).then(value => cards.set(id, value))
      .catch(() => {}).finally(() => pending.delete(id));
  }
  return async (state, refresh) => {
    const list = ['mail','moex'].map(id => {
      update(id, id === refresh || (id === 'mail' && refresh === 'radar'));
      const value = cards.get(id);
      const card = { id, title: titles[id], source: providers[id], status: value?.status ?? 'loading',
        message: value?.message ?? 'Запрашиваем данные', updatedAt: value?.updatedAt ?? null,
        items: (value?.rows ?? []).map(r => ({ label: r.title, value: r.value, detail: r.detail })) };
      if (id === 'moex' && !card.items.length && state.market?.quotes?.length) {
        const { quotes, source } = state.market;
        const isClose = source === 'close';
        Object.assign(card, { source: isClose ? 'Архив MOEX' : 'MOEX ISS',
          status: isClose ? 'cached' : 'ok',
          message: isClose ? 'Последние доступные цены закрытия' : 'Последняя сводка биржи',
          updatedAt: quotes.map(q => q.stamp).sort().at(-1),
          items: quotes.map(q => ({ label: q.symbol, value: q.price.toLocaleString('ru-RU') + ' ₽',
            detail: Number.isFinite(q.change) ? (q.change > 0 ? '+' : '') + q.change.toFixed(2) + '%' : 'Изменение недоступно' })) });
      }
      return card;
    });
    const grants = await readFile(join(runtime,'grants','state.json'),'utf8').then(JSON.parse).catch(() => null);
    const job = state.jobs?.grants;
    const mail = list[0];
    const working = job && job.phase !== 'idle' && job.phase !== 'blocked';
    const grantsError = (grants?.errors?.length ?? 0) > 0 || job?.phase === 'blocked';
    const mailReady = ['ok','empty'].includes(mail.status);
    const summary = mailReady ? `В подборке: ${mail.items.length}` : mail.message;
    const stamp = grants?.lastRunAt ?? null;
    const rows = [{ label:'Почта', value:summary, detail:mail.updatedAt || '' }];
    for (const [key,label] of [['bak','Бакалавриат и специалитет'],['mag','Магистратура']]) {
      const record = grants?.snapshot?.[key];
      rows.push({label, value:record?.available === true ? 'Список опубликован' :
        record?.available === false ? 'Публикации пока нет' : 'Ожидает проверки',
        detail:'Гранты Президента РФ · 2026/27'});
    }
    const task = working ? 'Проверяет публикации президентских грантов' :
      grantsError ? 'Проверка грантов требует внимания' :
      mail.status === 'unconfigured' ? 'Гранты проверены · ожидает подключения почты' :
      mail.status === 'error' ? 'Не удалось проверить почту' : 'Почта и президентские гранты';
    const radar = {id:'radar',name:'Радар',task,status:working ? 'WORKING' :
      grantsError || mail.status === 'error' ? 'ERROR' : 'IDLE',
      file:'grants/state.json',api:'Гранты Президента РФ' + (mailReady ? ' · IMAP' : ''),
      tokens:0,resources:{'Проверки грантов':'09:00 / 21:00 ЕКБ'},events:[]};
    if (stamp) radar.events.push({at:stamp,text:grantsError ? 'Часть источников грантов недоступна' : 'Проверены публикации по двум направлениям'});
    if (mail.updatedAt) radar.events.push({at:mail.updatedAt,text:mail.message});
    radar.events.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    list.unshift({id:'radar',title:titles.radar,source:providers.radar,
      status:grantsError ? 'error' : !stamp ? 'loading' : mailReady ? 'ok' : 'partial',
      message:task,updatedAt:stamp,items:rows});
    const team = await agents(runtime);
    team.agents.push(radar);
    return { updatedAt: clock(), cards: list, ...team };
  };
}

