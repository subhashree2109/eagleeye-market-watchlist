import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'data.json');
const catalog = [
  { symbol: 'NVDA', name: 'NVIDIA', catalyst: 'AI demand and earnings setup' }, { symbol: 'AAPL', name: 'Apple', catalyst: 'Product and services momentum' },
  { symbol: 'MSFT', name: 'Microsoft', catalyst: 'Cloud and AI read-through' }, { symbol: 'TSLA', name: 'Tesla', catalyst: 'Delivery and margin sensitivity' },
  { symbol: 'AMZN', name: 'Amazon', catalyst: 'Consumer and cloud demand' }, { symbol: 'META', name: 'Meta', catalyst: 'Ads and AI monetization' },
  { symbol: 'GOOGL', name: 'Alphabet', catalyst: 'Search, cloud and AI momentum' }, { symbol: 'NFLX', name: 'Netflix', catalyst: 'Subscriber and advertising growth' },
  { symbol: 'AMD', name: 'AMD', catalyst: 'Data-center and AI chip demand' }, { symbol: 'AVGO', name: 'Broadcom', catalyst: 'Semiconductor and infrastructure software demand' },
  { symbol: 'ORCL', name: 'Oracle', catalyst: 'Cloud infrastructure growth' }, { symbol: 'CRM', name: 'Salesforce', catalyst: 'Enterprise software spending' },
  { symbol: 'INTC', name: 'Intel', catalyst: 'Foundry execution and PC demand' }, { symbol: 'PLTR', name: 'Palantir', catalyst: 'Government and commercial AI demand' },
  { symbol: 'JPM', name: 'JPMorgan Chase', catalyst: 'Rates, credit and capital-markets activity' }, { symbol: 'V', name: 'Visa', catalyst: 'Consumer spending and cross-border volume' },
  { symbol: 'WMT', name: 'Walmart', catalyst: 'Consumer health and e-commerce growth' }, { symbol: 'COST', name: 'Costco', catalyst: 'Membership and comparable-sales momentum' },
  { symbol: 'DIS', name: 'Disney', catalyst: 'Streaming, parks and advertising momentum' }, { symbol: 'UBER', name: 'Uber', catalyst: 'Mobility and delivery profitability' },
  { symbol: 'NKE', name: 'Nike', catalyst: 'Inventory, demand and turnaround execution' }, { symbol: 'KO', name: 'Coca-Cola', catalyst: 'Global consumer demand and pricing' },
  { symbol: 'PEP', name: 'PepsiCo', catalyst: 'Snacks, beverages and margin delivery' }, { symbol: 'LLY', name: 'Eli Lilly', catalyst: 'GLP-1 demand and pipeline developments' },
  { symbol: 'UNH', name: 'UnitedHealth', catalyst: 'Healthcare utilization and policy risk' }, { symbol: 'XOM', name: 'Exxon Mobil', catalyst: 'Oil prices and capital returns' },
  { symbol: 'CAT', name: 'Caterpillar', catalyst: 'Industrial demand and infrastructure cycle' }
];
const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { users: {} }; } };
const save = db => { const temp = `${file}.tmp`; fs.writeFileSync(temp, JSON.stringify(db, null, 2)); fs.renameSync(temp, file); };
const cleanId = raw => String(raw || 'demo').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'demo';
function visitor(raw, db) { const id = cleanId(raw); if (!db.users[id]) db.users[id] = { watchlist: catalog.slice(0, 4), lastSeen: 0, createdAt: Date.now() }; return db.users[id]; }
function marketSession() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const value = type => parts.find(x => x.type === type)?.value;
  const weekday = value('weekday'), minutes = Number(value('hour')) * 60 + Number(value('minute'));
  return !['Sat', 'Sun'].includes(weekday) && minutes >= 570 && minutes < 960;
}
async function liveQuote(item, force = false) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error('Live data is not configured. Add FINNHUB_API_KEY to .env.local.');
  const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(item.symbol)}&token=${encodeURIComponent(token)}`, force ? { cache: 'no-store' } : { next: { revalidate: 15 } });
  if (!response.ok) throw new Error(response.status === 403 ? 'Finnhub rejected the API key (403). Update .env.local with a valid token and restart the server.' : `Market-data provider returned ${response.status}.`);
  const q = await response.json();
  if (!Number.isFinite(q.c) || q.c <= 0) throw new Error(`No live quote is available for ${item.symbol}.`);
  const asOf = Number(q.t) * 1000 || Date.now(), age = Date.now() - asOf;
  const freshness = !marketSession() && age > 90000 ? 'closed' : age > 90000 ? 'delayed' : 'live';
  return { ...item, price: q.c, change: q.dp || 0, score: Math.min(99, Math.round(35 + Math.abs(q.dp || 0) * 12 + (freshness === 'delayed' ? 35 : 0))), asOf, freshness, range: q.h && q.l ? `${q.l.toFixed(2)} - ${q.h.toFixed(2)} today` : 'Session range unavailable', source: 'Finnhub' };
}
export async function getDashboard(raw, force = false, commitVisit = true) {
  const db = read(), user = visitor(raw, db), now = Date.now(), items = await Promise.all(user.watchlist.map(item => liveQuote(item, force))), previous = user.snapshot || {};
  const enriched = items.map(item => { const before = previous[item.symbol], sinceSeen = before ? +(((item.price - before.price) / before.price) * 100).toFixed(2) : item.change, reasons = []; if (Math.abs(sinceSeen) >= 1) reasons.push(`${sinceSeen > 0 ? '+' : ''}${sinceSeen}% since your last check`); if (item.freshness === 'delayed') reasons.push('data freshness needs verification'); if (item.freshness === 'closed') reasons.push('US regular market is closed; showing the last provider quote'); if (item.score >= 80) reasons.push(item.catalyst); const action = item.freshness === 'delayed' ? 'Verify feed' : item.freshness === 'closed' ? 'Market closed' : item.score >= 85 ? 'Investigate now' : Math.abs(sinceSeen) >= 1 ? 'Monitor closely' : 'No action'; return { ...item, sinceSeen, reasons, action, confidence: item.freshness === 'live' ? 96 : item.freshness === 'closed' ? 88 : 62 }; });
  const changed = enriched.filter(x => Math.abs(x.sinceSeen) >= 1 || x.score >= 80 || x.freshness === 'delayed'), since = user.lastSeen || now - 86400000;
  if (commitVisit) { user.lastSeen = now; user.snapshot = Object.fromEntries(enriched.map(x => [x.symbol, { price: x.price, asOf: now }])); save(db); }
  return { items: enriched, changed, since, updatedAt: now, summary: { attention: changed.length, delayed: enriched.filter(x => x.freshness === 'delayed').length }, ledger: changed.slice(0, 3) };
}
export async function searchAssets(query) {
  const token = process.env.FINNHUB_API_KEY, q = String(query || '').trim();
  if (!token) throw new Error('Live data is not configured. Add FINNHUB_API_KEY to .env.local.');
  if (q.length < 2) return [];
  const response = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(token)}`, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Symbol search provider returned ${response.status}.`);
  const data = await response.json();
  return (data.result || []).filter(x => x.type === 'Common Stock' && (x.displaySymbol || x.symbol)).slice(0, 8).map(x => ({ symbol: x.displaySymbol || x.symbol, name: x.description || x.displaySymbol || x.symbol, catalyst: 'Live provider discovery' }));
}
export async function addAsset(raw, input) { const db = read(), user = visitor(raw, db), symbol = String(input || '').toUpperCase().trim(); let item = catalog.find(x => x.symbol === symbol); if (!item) item = (await searchAssets(symbol)).find(x => x.symbol === symbol); if (!item) return { status: 422, body: { error: 'No supported US common-stock ticker was found.' } }; if (user.watchlist.some(x => x.symbol === symbol)) return { status: 409, body: { error: `${symbol} is already in your watchlist.` } }; user.watchlist.push(item); save(db); return { status: 201, body: { item } }; }
export function removeAsset(raw, symbol) { const db = read(), user = visitor(raw, db); user.watchlist = user.watchlist.filter(x => x.symbol !== String(symbol).toUpperCase()); save(db); }
