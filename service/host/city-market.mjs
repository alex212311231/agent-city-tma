import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { projects } from './project-routes.mjs';

const symbols = ['SBER', 'GAZP', 'MOEX'];
const source = new URL('https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json');
source.search = new URLSearchParams({
  'iss.meta': 'off', 'iss.only': 'marketdata', 'marketdata.columns': 'SECID,LAST,SYSTIME,LASTTOPREVPRICE',
  securities: symbols.join(','),
});

async function iss() {
  const response = await fetch(source, { signal: AbortSignal.timeout(3500), redirect: 'error' });
  if (!response.ok) return null;
  const { marketdata } = await response.json();
  const fields = marketdata.columns;
  const quotes = marketdata.data.map(row => {
    const [symbol, price, stamp, change] = ['SECID', 'LAST', 'SYSTIME', 'LASTTOPREVPRICE'].map(field => row[fields.indexOf(field)]);
    return { symbol, price, stamp, change };
  }).filter(row => symbols.includes(row.symbol) && Number.isFinite(row.price) && typeof row.stamp === 'string');
  return quotes.length ? { source: 'iss', quotes } : null;
}

function cache() {
  let db;
  try {
    db = new DatabaseSync(join(projects.moex.cwd, 'data/cache/moex.sqlite'), { readOnly: true });
    const select = db.prepare("SELECT secid AS symbol, close AS price, date AS stamp FROM bars WHERE secid = ? AND board = 'TQBR' AND close > 0 ORDER BY date DESC LIMIT 2");
    const quotes = symbols.flatMap(symbol => {
      const [last, previous] = select.all(symbol);
      return last ? [{ ...last, change: previous ? 100 * (last.price / previous.price - 1) : null }] : [];
    });
    return quotes.length ? { source: 'close', quotes } : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function cityMarket() {
  return (await iss().catch(() => null)) ?? cache();
}

