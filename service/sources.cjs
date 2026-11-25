'use strict';



const rubles = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });
const percent = new Intl.NumberFormat('ru-RU', {
  style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero',
});
const mailDate = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Yekaterinburg',
});

class SourceError extends Error {}

async function json(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(11000),
  });
  if (response.status === 429) throw new SourceError('Источник ограничил частоту запросов.');
  if (!response.ok) throw new Error('Source request failed.');
  return response.json();
}

function blockRows(block) {
  if (!Array.isArray(block?.columns) || !Array.isArray(block.data)) throw new Error('Invalid ISS response.');
  return block.data.map((row) => Object.fromEntries(block.columns.map((column, index) => [column, row[index]])));
}

async function moex() {
  const tickers = Array.from(new Set((process.env.AI_HUB_MOEX_TICKERS || 'SBER,GAZP,LKOH,YDEX')
    .toUpperCase().split(',').map((ticker) => ticker.trim()).filter((ticker) => /^[A-Z0-9]{1,12}$/.test(ticker)))).slice(0, 12);
  if (!tickers.length) throw new SourceError('Добавьте тикеры в настройки MOEX.');
  const url = new URL('https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json');
  url.search = new URLSearchParams({
    'iss.meta': 'off',
    'iss.only': 'securities,marketdata',
    securities: tickers.join(','),
    'securities.columns': 'SECID,SHORTNAME,PREVPRICE',
    'marketdata.columns': 'SECID,LAST',
  });
  const payload = await json(url);
  const securities = new Map(blockRows(payload.securities).map((row) => [row.SECID, row]));
  const market = new Map(blockRows(payload.marketdata).map((row) => [row.SECID, row]));
  const rows = tickers.map((ticker) => {
    const security = securities.get(ticker);
    const quote = market.get(ticker);
    const latest = quote?.LAST;
    const previous = security?.PREVPRICE;
    const day = Number.isFinite(latest) && Number.isFinite(previous) && previous > 0
      ? (latest - previous) / previous : null;
    const change = Number.isFinite(day) ? ' · ' + percent.format(day) : '';
    const prior = Number.isFinite(previous) ? rubles.format(previous) + ' · пред. сессия' : '—';
    return {
      title: ticker,
      detail: security?.SHORTNAME || '',
      value: Number.isFinite(latest) ? rubles.format(latest) + change : prior,
      tone: day > 0 ? 'up' : day < 0 ? 'down' : undefined,
    };
  });
  return { status: 'ok', message: 'Котировки MOEX ISS поступают с задержкой.', rows };
}

async function mail() {
  const user = process.env.AI_HUB_IMAP_USER;
  const pass = process.env.AI_HUB_IMAP_PASSWORD;
  if (!user || !pass) return { status: 'unconfigured', message: 'Подключите входящую почту по IMAP.', rows: [] };

  let ImapFlow;
  try { ({ ImapFlow } = require('imapflow')); }
  catch { throw new SourceError('Установите модуль IMAP командой npm install.'); }
  const client = new ImapFlow({
    host: process.env.AI_HUB_IMAP_HOST || 'imap.mail.ru',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 9000,
  });
  client.on('error', () => { /* Connection errors are reported through the source status. */ });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const important = await client.search({ or: [{ flagged: true }, { seen: false }] }, { uid: true });
      if (!Array.isArray(important)) throw new Error('Mail search failed.');
      const uids = important.slice(-6);
      const data = uids.length
        ? await client.fetchAll(uids, { envelope: true, flags: true, internalDate: true }, { uid: true }) : [];
      data.sort((a, b) => b.uid - a.uid);
      const rows = data.map((item) => {
        const envelope = item.envelope || {};
        const sender = envelope.from?.[0]?.name || envelope.from?.[0]?.address || '';
        const date = item.internalDate;
        const detail = [sender, date instanceof Date && Number.isFinite(+date) ? mailDate.format(date) : '']
          .filter(Boolean).join(' · ').slice(0, 150);
        return {
          title: (envelope.subject || 'Без темы').slice(0, 180),
          detail,
          value: [item.flags.has('\\Flagged') ? 'Важное' : '', item.flags.has('\\Seen') ? 'Прочитано' : 'Новое']
            .filter(Boolean).join(' · '),
        };
      });
      return {
        status: rows.length ? 'ok' : 'empty',
        message: rows.length ? 'Последние непрочитанные и отмеченные письма.' : 'Непрочитанных и отмеченных писем нет.',
        rows,
      };
    } finally {
      lock.release();
    }
  } finally {
    client.close();
  }
}

const loaders = {
  mail: { load: mail, ttl: 90000, refreshAfter: 30000, unavailable: 'Не удалось прочитать входящие по IMAP.' },
  moex: { load: moex, ttl: 60000, refreshAfter: 20000, unavailable: 'MOEX ISS временно недоступен.' },
};
const cache = new Map();

function getCard(id, refresh) {
  const { load, ttl, refreshAfter, unavailable } = loaders[id];
  const entry = cache.get(id);
  if (entry?.pending) return entry.pending;
  const maxAge = refresh || entry?.value?.status === 'error' ? refreshAfter : ttl;
  if (entry && Date.now() - entry.checked < maxAge) return entry.value;

  const pending = (async () => {
    let value;
    try {
      value = await load();
      if (!value.updatedAt && value.status !== 'unconfigured') value.updatedAt = new Date().toISOString();
    } catch (error) {
      const message = error instanceof SourceError ? error.message : unavailable;
      value = {
        ...entry?.value,
        rows: entry?.value.rows || [],
        status: 'error',
        message: message + (entry?.value.rows?.length ? ' Показан последний снимок.' : ''),
      };
    }
    cache.set(id, { value, checked: Date.now() });
    return value;
  })();
  cache.set(id, { pending });
  return pending;
}

module.exports = { getCard, loaders };
