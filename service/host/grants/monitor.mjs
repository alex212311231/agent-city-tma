import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const origin = 'https://xn--80aahfebmi6bfqjd0ai9k.xn--p1ai';
const targetYear = 2026;
const cutoff = '2026-11-23';
const lists = [
  { key: 'bak', path: '/reg/', label: 'Бакалавриат и специалитет' },
  { key: 'mag', path: '/reg/magistracy', label: 'Магистратура' },
];
const officeRoot = new URL('../../', import.meta.url);
const runtime = new URL('runtime/grants/', officeRoot);
const stateFile = new URL('state.json', runtime);
const defaultPlaceholder = '8f1fb1c8f5617aee6de861fa147f253ff0bdb3deda8153748605e4f70531e5ab';
const targetYearPattern = /\b2026\s*[/–—-]\s*(?:20)?27\b/u;
const candidatesPattern = /спис(?:ок|к\p{L}*)\s+(?:новых\s+)?претендент/iu;
const publicationPattern = /опубликов|опубликован|размещ|обновл|дополн|пополн|правк|изменения в спис|доступен|доступны|утвержд|открыта регистрация для заключения договоров/iu;

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function plain(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|#160);/g, ' ')
    .replace(/&(?:ndash|#8211);/g, '–').replace(/&(?:mdash|#8212);/g, '—')
    .replace(/&(?:quot|#34);/g, '"').replace(/\s+/g, ' ').trim();
}

function dateFromTitle(value) {
  const parts = value.match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/);
  if (!parts) return null;
  const iso = parts[3] + '-' + parts[2] + '-' + parts[1];
  const date = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(iso) ? iso : null;
}

function subjects(value) {
  const graduate = /магистратур/iu.test(value);
  const undergraduate = /бакалавриат|специалитет|средн\p{L}*\s+профессиональн/iu.test(value);
  if (graduate === undergraduate) return ['bak', 'mag'];
  return [graduate ? 'mag' : 'bak'];
}

export function extractNews(html) {
  const matches = [...html.matchAll(/<a\b[^>]*href\s*=\s*["'](\/news\/\d+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const news = matches.map(match => ({ path: match[1], title: plain(match[2]) })).filter(item => item.title);
  if (!news.length || !/<h([12])\b[^>]*>\s*Новости\s*<\/h\1>/iu.test(html)) {
    throw new Error('Раздел новостей получен в неизвестном формате');
  }
  return [...new Map(news.map(item => [item.path, item])).values()].map(item => ({
    ...item,
    date: dateFromTitle(item.title),
    sections: subjects(item.title),
    publication: targetYearPattern.test(item.title) &&
      publicationPattern.test(item.title) &&
      (candidatesPattern.test(item.title) || /открыта регистрация для заключения договоров/iu.test(item.title)),
  }));
}

export function extractListMetadata(html) {
  // The table is supplied separately by the site. Only inspect headings and the year picker.
  const beforeTable = html.split(/<div\b[^>]*\bid\s*=\s*["']allContent["']/i, 1)[0];
  const picker = beforeTable.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\byearSelector\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const heading = [...beforeTable.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
    .map(match => plain(match[1])).find(title => candidatesPattern.test(title) && /\b20\d{2}\b/.test(title));
  if (!picker || !heading) throw new Error('Страница списка получена в неизвестном формате');
  const years = [...new Set([...picker.matchAll(/<a\b[^>]*\bdata-year\s*=\s*["'](20\d{2})["']/gi)].map(m => Number(m[1])))];
  if (!years.length) throw new Error('На странице отсутствуют учебные годы');
  const notices = [...beforeTable.matchAll(/<(p|h[1-4]|time)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(match => plain(match[2]))
    .filter(line => line.length <= 300 && publicationPattern.test(line) && dateFromTitle(line) &&
      (candidatesPattern.test(line) || targetYearPattern.test(line)))
    .sort();
  return { heading, years, available: years.includes(targetYear), notices };
}

async function get(path) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
    headers: { accept: 'text/html,application/xhtml+xml', 'cache-control': 'no-cache' },
  });
  if (!response.ok || !/^text\/html\b/i.test(response.headers.get('content-type') ?? '')) {
    throw new Error('Ответ официального сайта HTTP ' + response.status);
  }
  return response;
}

async function opaqueTableHash(section) {
  // No person, organisation or category filters. Stream bytes to SHA-256 without decoding them.
  const params = new URLSearchParams({ name: '', year: String(targetYear), hs: '', direction: '', type: section.key });
  const response = await fetch(origin + '/reg/table?' + params, {
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
    headers: { 'x-requested-with': 'XMLHttpRequest', referer: origin + section.path },
  });
  if (!response.ok || !/^text\/html\b/i.test(response.headers.get('content-type') ?? '')) {
    throw new Error('Версия опубликованного списка недоступна: HTTP ' + response.status);
  }
  const hash = createHash('sha256');
  let total = 0;
  for await (const bytes of response.body) {
    total += bytes.byteLength;
    if (total > 24 * 1024 * 1024) throw new Error('Ответ списка превышает лимит');
    hash.update(bytes);
  }
  const value = hash.digest('hex');
  return total && value !== defaultPlaceholder ? value : null;
}

async function readList(section) {
  const page = await get(section.path);
  const metadata = extractListMetadata(await page.text());
  let contentHash = null;
  let revisionError = null;
  if (metadata.available) {
    try { contentHash = await opaqueTableHash(section); }
    catch (error) { revisionError = error.cause?.code ?? error.message; }
  }
  return { ...metadata, contentHash, revisionError, url: origin + section.path };
}

export function detect(previous, current, seen, now) {
  const known = new Set(seen);
  const events = [];
  for (const section of lists) {
    const key = section.key;
    const old = previous[key];
    const list = current[key];
    if (!list?.available) continue;
    const publishedKey = 'year:' + key;
    const earliestUpdate = list.notices.some(notice => (dateFromTitle(notice) ?? '') > cutoff);
    const last = previous.lastNotification?.[key];
    const recentlyReported = last && now - Date.parse(last) < 18 * 60 * 60 * 1000;
    if ((old || earliestUpdate) && !known.has(publishedKey) && !recentlyReported) {
      events.push({ id: publishedKey, sections: [key] });
    }
    known.add(publishedKey);
    if (list.contentHash) {
      const hashKey = 'body:' + key + ':' + list.contentHash;
      if (old?.contentHash && old.contentHash !== list.contentHash && !known.has(hashKey)) {
        events.push({ id: hashKey, sections: [key] });
      }
      known.add(hashKey);
    }
    for (const notice of list.notices) {
      const noticeKey = 'notice:' + key + ':' + digest(notice);
      if ((dateFromTitle(notice) ?? '') > cutoff && !known.has(noticeKey)) {
        events.push({ id: noticeKey, sections: [key] });
      }
      known.add(noticeKey);
    }
  }
  for (const item of current.news ?? []) {
    if (!item.publication) continue;
    const newsKey = 'news:' + item.path + ':' + digest(item.title);
    if (known.has(newsKey)) continue;
    known.add(newsKey);
    const fresh = (item.date ?? '') > cutoff || (item.date === cutoff && Boolean(previous.news));
    if (!fresh) continue;
    const sections = item.sections.filter(key => {
      const list = current[key];
      const last = previous.lastNotification?.[key];
      return !list?.available || !last || now - Date.parse(last) >= 18 * 60 * 60 * 1000;
    });
    if (sections.length) events.push({ id: newsKey, sections });
  }
  return { events, seen: [...known] };
}

function merge(previous, latest) {
  const clean = Object.fromEntries(Object.entries(latest).filter(([, record]) => record));
  for (const section of lists) {
    const list = clean[section.key];
    if (list?.available && !list.contentHash && previous[section.key]?.contentHash) {
      clean[section.key] = { ...list, contentHash: previous[section.key].contentHash };
    }
  }
  return { ...previous, ...clean };
}

async function atomicSave(state) {
  const draft = new URL('state.next.json', runtime);
  await writeFile(draft, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await rename(draft, stateFile);
}

async function readState() {
  try { return JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { snapshot: {}, seen: [], queue: [], lastNotification: {} };
  }
}

async function status(phase, detail) {
  if (!process.env.OFFICE_WRITE_TOKEN) return;
  try {
    const res = await fetch('http://127.0.0.1:8765/api/status', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OFFICE_WRITE_TOKEN },
      body: JSON.stringify({ job: 'grants', project: 'grants', action: phase === 'planning' ? 'folders' : 'idle', phase, detail }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) console.error('Статус офиса HTTP ' + res.status);
  } catch {
    console.error('Сервер статусов недоступен');
  }
}

async function sendAlert(sections) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || chat !== '6095969779') return { retry: true, error: 'Не задана личная конфигурация Telegram' };
  const links = lists.filter(section => sections.includes(section.key))
    .map(section => section.label + ': ' + origin + section.path);
  const text = '⚡ На сайте грантыпрезидента.рф опубликовали или обновили список претендентов на 2026/27 учебный год. Сохраняю интригу. Открывайте и проверяйте себя!\n\n' + links.join('\n');
  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(15_000),
    });
    const reply = await response.json();
    if (response.ok && reply.ok && reply.result?.message_id) return { id: reply.result.message_id };
    if (reply.ok === false && response.status < 500) return { retry: true, error: 'Telegram HTTP ' + response.status };
    return { error: 'Доставка Telegram не подтверждена' };
  } catch {
    return { error: 'Доставка Telegram не подтверждена' };
  }
}

async function run() {
  await mkdir(runtime, { recursive: true });
  const state = await readState();
  const now = new Date();
  await status('planning', 'Проверка публикаций грантов 2026/27');
  try {
    const jobs = [
      ...lists.map(section => [section.key, readList(section)]),
      ['news', get('/news/').then(res => res.text()).then(extractNews)],
    ];
    const sources = await Promise.allSettled(jobs.map(([, job]) => job));
    const entries = sources.map((result, index) => [jobs[index][0], result]);
    const snapshot = Object.fromEntries(entries.filter(([, result]) => result.status === 'fulfilled').map(([key, result]) => [key, result.value]));
    const errors = entries.filter(([, result]) => result.status === 'rejected').map(([key, result]) => [key, result.reason?.cause?.code ?? result.reason?.message ?? 'источник недоступен']);
    for (const list of lists) {
      if (snapshot[list.key]?.revisionError) errors.push([list.key + ':версия', snapshot[list.key].revisionError]);
    }
    const before = { ...state.snapshot, lastNotification: state.lastNotification };
    const { events, seen } = detect(before, snapshot, state.seen, now.valueOf());
    state.lastRunAt = now.toISOString();
    if (!errors.length) state.lastCompleteAt = state.lastRunAt;
    state.snapshot = merge(state.snapshot, snapshot);
    state.snapshotHash = digest(JSON.stringify(state.snapshot));
    state.errors = errors;
    state.seen = seen;
    for (const notice of state.queue) {
      if (notice.state === 'sending') notice.state = 'uncertain';
    }
    if (events.length) {
      const sections = [...new Set(events.flatMap(event => event.sections))];
      state.queue.push({ created: state.lastRunAt, sections, events: events.map(event => event.id), state: 'pending' });
    }
    await atomicSave(state);
    for (const notice of state.queue.filter(item => item.state === 'pending')) {
      notice.state = 'sending';
      await atomicSave(state);
      const delivery = await sendAlert(notice.sections);
      if (delivery.id) {
        notice.state = 'delivered';
        notice.messageId = delivery.id;
        for (const key of notice.sections) state.lastNotification[key] = new Date().toISOString();
      } else {
        notice.state = delivery.retry ? 'pending' : 'uncertain';
        notice.error = delivery.error;
      }
      await atomicSave(state);
    }
    const sections = lists.filter(list => state.snapshot[list.key]?.available).map(list => list.key);
    const deliveryProblem = state.queue.some(notice => notice.state !== 'delivered');
    console.log(JSON.stringify({ at: state.lastRunAt, available: sections, newEvents: events.length, errors, deliveryProblem }));
    const incomplete = errors.length > 0 || deliveryProblem;
    await status(incomplete ? 'blocked' : 'idle', incomplete ? 'Проверка грантов требует внимания' :
      events.length ? 'Проверка завершена: новая публикация' : 'Проверка завершена: новых публикаций нет');
    if (incomplete) process.exitCode = 1;
  } catch (error) {
    console.error('Радар грантов: ' + (error.code ?? error.name));
    await status('blocked', 'Не удалось завершить проверку грантов');
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { await run(); }
  finally {
    // The dashboard refreshes the same read-only mail source as the Radar card.
    await fetch('http://127.0.0.1:8765/api/dashboard?refresh=mail', {signal:AbortSignal.timeout(4000)})
      .then(res => res.body?.cancel()).catch(() => {});
  }
}
