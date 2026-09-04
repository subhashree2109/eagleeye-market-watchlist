import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'data.json');
const catalog = [
  ['NVDA','NVIDIA','AI demand and earnings setup'],['AAPL','Apple','Product and services momentum'],['MSFT','Microsoft','Cloud and AI read-through'],['TSLA','Tesla','Delivery and margin sensitivity'],['AMZN','Amazon','Consumer and cloud demand'],['META','Meta','Ads and AI monetization'],['GOOGL','Alphabet','Search, cloud and AI momentum'],['NFLX','Netflix','Subscriber and advertising growth'],['AMD','AMD','Data-center and AI chip demand'],['AVGO','Broadcom','Semiconductor and infrastructure software demand'],['ORCL','Oracle','Cloud infrastructure growth'],['CRM','Salesforce','Enterprise software spending'],['INTC','Intel','Foundry execution and PC demand'],['PLTR','Palantir','Government and commercial AI demand'],['JPM','JPMorgan Chase','Rates, credit and capital-markets activity'],['V','Visa','Consumer spending and cross-border volume'],['WMT','Walmart','Consumer health and e-commerce growth'],['COST','Costco','Membership and comparable-sales momentum'],['DIS','Disney','Streaming, parks and advertising momentum'],['UBER','Uber','Mobility and delivery profitability'],['NKE','Nike','Inventory, demand and turnaround execution'],['KO','Coca-Cola','Global consumer demand and pricing'],['PEP','PepsiCo','Snacks, beverages and margin delivery'],['LLY','Eli Lilly','GLP-1 demand and pipeline developments'],['UNH','UnitedHealth','Healthcare utilization and policy risk'],['XOM','Exxon Mobil','Oil prices and capital returns'],['CAT','Caterpillar','Industrial demand and infrastructure cycle']
].map(([symbol,name,catalyst])=>({symbol,name,catalyst}));
const cleanId = raw => String(raw || 'demo').replace(/[^a-zA-Z0-9_-]/g, '').slice(0,64) || 'demo';
const configured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
async function supabaseRequest(method, endpoint, body) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${await response.text()}`);
  return response.status === 204 ? [] : response.json();
}
const initialState = () => ({ watchlist: catalog.slice(0,4), snapshot: {}, lastSeen: null });
const localRead = () => { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return { users:{} }; } };
const localSave = db => { const tmp=`${file}.tmp`; fs.writeFileSync(tmp,JSON.stringify(db,null,2)); fs.renameSync(tmp,file); };
async function stateFor(raw) {
  const id=cleanId(raw);
  if (!configured()) {
    if (process.env.VERCEL) throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel, then redeploy.');
    const db=localRead(); if (!db.users[id]) db.users[id]=initialState(); return { id, state:db.users[id], db, mode:'local' };
  }
  const rows=await supabaseRequest('GET',`eagleeye_state?device_id=eq.${encodeURIComponent(id)}&select=watchlist,snapshot,last_seen`);
  if (rows[0]) return { id, state:{watchlist:rows[0].watchlist||[],snapshot:rows[0].snapshot||{},lastSeen:rows[0].last_seen}, mode:'supabase' };
  const state=initialState(); await supabaseRequest('POST','eagleeye_state',{device_id:id,watchlist:state.watchlist,snapshot:state.snapshot,last_seen:null});
  return {id,state,mode:'supabase'};
}
async function saveState(ctx) {
  if (ctx.mode==='local') return localSave(ctx.db);
  await supabaseRequest('PATCH',`eagleeye_state?device_id=eq.${encodeURIComponent(ctx.id)}`,{watchlist:ctx.state.watchlist,snapshot:ctx.state.snapshot,last_seen:ctx.state.lastSeen,updated_at:new Date().toISOString()});
}
function marketOpen(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),v=t=>p.find(x=>x.type===t)?.value,m=Number(v('hour'))*60+Number(v('minute'));return !['Sat','Sun'].includes(v('weekday'))&&m>=570&&m<960;}
async function quote(item,force=false){const token=process.env.FINNHUB_API_KEY;if(!token)throw new Error('Live data is not configured. Add FINNHUB_API_KEY in Vercel or .env.local.');const r=await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(item.symbol)}&token=${encodeURIComponent(token)}`,force?{cache:'no-store'}:{next:{revalidate:15}});if(!r.ok)throw new Error(r.status===403?'Finnhub rejected the API key (403). Update FINNHUB_API_KEY and redeploy.':`Market-data provider returned ${r.status}.`);const q=await r.json();if(!Number.isFinite(q.c)||q.c<=0)throw new Error(`No live quote is available for ${item.symbol}.`);const asOf=Number(q.t)*1000||Date.now(),age=Date.now()-asOf,freshness=!marketOpen()&&age>90000?'closed':age>90000?'delayed':'live';return {...item,price:q.c,change:q.dp||0,score:Math.min(99,Math.round(35+Math.abs(q.dp||0)*12+(freshness==='delayed'?35:0))),asOf,freshness,range:q.h&&q.l?`${q.l.toFixed(2)} - ${q.h.toFixed(2)} today`:'Session range unavailable'};}
export async function getDashboard(raw,force=false,commitVisit=true){const ctx=await stateFor(raw),now=Date.now(),items=await Promise.all(ctx.state.watchlist.map(x=>quote(x,force))),previous=ctx.state.snapshot||{};const enriched=items.map(item=>{const before=previous[item.symbol],sinceSeen=before?+(((item.price-before.price)/before.price)*100).toFixed(2):item.change,reasons=[];if(Math.abs(sinceSeen)>=1)reasons.push(`${sinceSeen>0?'+':''}${sinceSeen}% since your last check`);if(item.freshness==='delayed')reasons.push('data freshness needs verification');if(item.freshness==='closed')reasons.push('US regular market is closed; showing the last provider quote');if(item.score>=80)reasons.push(item.catalyst);const action=item.freshness==='delayed'?'Verify feed':item.freshness==='closed'?'Market closed':item.score>=85?'Investigate now':Math.abs(sinceSeen)>=1?'Monitor closely':'No action';return {...item,sinceSeen,reasons,action,confidence:item.freshness==='live'?96:item.freshness==='closed'?88:62};});const changed=enriched.filter(x=>Math.abs(x.sinceSeen)>=1||x.score>=80||x.freshness==='delayed');if(commitVisit){ctx.state.lastSeen=new Date(now).toISOString();ctx.state.snapshot=Object.fromEntries(enriched.map(x=>[x.symbol,{price:x.price,asOf:now}]));await saveState(ctx);}return {items:enriched,changed,since:ctx.state.lastSeen||now-86400000,updatedAt:now,persistence:ctx.mode,summary:{attention:changed.length,delayed:enriched.filter(x=>x.freshness==='delayed').length},ledger:changed.slice(0,3)};}
export async function searchAssets(query){const token=process.env.FINNHUB_API_KEY,q=String(query||'').trim();if(!token)throw new Error('Live data is not configured.');if(q.length<2)return[];const r=await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(token)}`,{next:{revalidate:60}});if(!r.ok)throw new Error(`Symbol search provider returned ${r.status}.`);const d=await r.json();return(d.result||[]).filter(x=>x.type==='Common Stock'&&(x.displaySymbol||x.symbol)).slice(0,8).map(x=>({symbol:x.displaySymbol||x.symbol,name:x.description||x.displaySymbol||x.symbol,catalyst:'Live provider discovery'}));}
export async function addAsset(raw,input){const ctx=await stateFor(raw),symbol=String(input||'').toUpperCase().trim();let item=catalog.find(x=>x.symbol===symbol);if(!item)item=(await searchAssets(symbol)).find(x=>x.symbol===symbol);if(!item)return{status:422,body:{error:'No supported US common-stock ticker was found.'}};if(ctx.state.watchlist.some(x=>x.symbol===symbol))return{status:409,body:{error:`${symbol} is already in your watchlist.`}};ctx.state.watchlist.push(item);await saveState(ctx);return{status:201,body:{item}};}
export async function removeAsset(raw,symbol){const ctx=await stateFor(raw);ctx.state.watchlist=ctx.state.watchlist.filter(x=>x.symbol!==String(symbol).toUpperCase());await saveState(ctx);}
