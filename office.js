'use strict';

const $ = (id) => document.getElementById(id);
const botUrl = 'https://t.me/ClaudeNFications_bot';
const local = location.origin === 'http://127.0.0.1:8765';
const endpoint = local ? location.origin : window.OFFICE_CONFIG?.tunnel;
const launchData = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData');
let initData = window.Telegram?.WebApp?.initData || launchData || '';
let selected = 0;
let latest;
let busy = false;
let lastAgents = '';
let accessState = '';
let forceNext;
let drag;
const names = ['Радар', 'Почта', 'MOEX'];
const defaultCards = names.map((title, i) => ({id: ['radar','mail','moex'][i], title, items: []}));
let cards = defaultCards;
const pinKey = 'ai-hub.pinned-sources.v1';
let pins;
try { pins = new Set(JSON.parse(localStorage.getItem(pinKey) || '[]')); } catch { pins = new Set(); }
const dateFmt = new Intl.DateTimeFormat('ru-RU', {day:'numeric',month:'long',weekday:'long'});
const timeFmt = new Intl.DateTimeFormat('ru-RU', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
const stampFmt = new Intl.DateTimeFormat('ru-RU', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const formatTime = (value, fmt) => value && Number.isFinite(new Date(value).getTime()) ? fmt.format(new Date(value)) : '';
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const icons = {
  left:'<path d="m14 5-7 7 7 7"/>', pin:'<path d="m15 3 6 6-4 1-4 5-1 4-7-7 4-1 5-4zM9 15l-6 6"/>',
  sync:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 4M4 14l2 4a7 7 0 0 0 12-1"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>', send:'<path d="m3 10 18-7-6 18-4-7-8-4zm8 4L21 3"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  team:'<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 5 5v1"/>'
};
function graphic(shape, box, cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox',box); svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.7');
  svg.setAttribute('stroke-linejoin','round'); svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('aria-hidden','true');
  if (cls) svg.setAttribute('class', cls);
  svg.innerHTML = shape; // All artwork is static. Server data is written through textContent.
  return svg;
}
function icon(id) { return graphic(icons[id], '0 0 24 24'); }
const arts = [
  '<g opacity=".7"><circle cx="105" cy="100" r="75"/><circle cx="105" cy="100" r="53"/><circle cx="105" cy="100" r="28"/><path d="M105 12v176M17 100h176M43 38l124 124m0-124L43 162" stroke-dasharray="2 5"/></g><path d="M105 100V25a75 75 0 0 1 61 31z" fill="currentColor" opacity=".16"/><path d="m105 100 61-44"/><circle cx="128" cy="76" r="4" fill="currentColor"/><circle cx="67" cy="111" r="3" fill="currentColor"/>',
  '<g transform="translate(25 62) rotate(-11 80 45)"><rect x="17" y="-14" width="137" height="84" rx="6" opacity=".35"/><rect x="8" y="-7" width="137" height="84" rx="6" opacity=".65"/><rect x="0" y="0" width="137" height="84" rx="6" fill="#2c354a"/><path d="m2 5 65 49 68-49M3 79l43-39m88 39L91 39"/></g>',
  '<g opacity=".35"><path d="M12 54h167M12 79h167M12 104h167M12 129h167M12 154h167" stroke-dasharray="2 4"/></g><path d="M37 64v70m24-34v45m24-77v66m24-88v60m24-71v60m23-66v62"/><g fill="currentColor" stroke="none"><rect x="32" y="78" width="10" height="36"/><rect x="56" y="108" width="10" height="22"/><rect x="80" y="88" width="10" height="33"/><rect x="104" y="57" width="10" height="29"/><rect x="128" y="46" width="10" height="30"/><rect x="151" y="45" width="10" height="19"/></g>'
];
document.querySelectorAll('[data-icon]').forEach(node => node.append(icon(node.dataset.icon)));
$('sync').append(icon('sync'));
$('today').textContent = dateFmt.format(new Date());
const statuses = new Set(['IDLE','WORKING','DONE','ERROR']);
const sourceStatuses = {loading:'Загрузка',cached:'Архивная сводка',ok:'Обновлено',ready:'Готово',live:'В эфире',active:'Активен',idle:'Ожидание',error:'Ошибка источника',stale:'Последняя сводка',offline:'Недоступен',unavailable:'Недоступен',empty:'Нет записей',not_configured:'Источник не подключён',unconfigured:'Источник не подключён',disconnected:'Источник не подключён'};
function statusChip(value) {
  const raw = String(value || '').toUpperCase();
  const chip = el('span','status',statuses.has(raw) ? raw : 'Нет статуса');
  chip.dataset.status = raw;
  return chip;
}
function renderCard() {
  const data = cards[selected], type = defaultCards.findIndex(c => c.id === data.id);
  const style = type < 0 ? selected : type;
  const box = $('card');
  const hero = el('div','hero ' + ['radar','mail','moex'][style]);
  hero.append(graphic(arts[style], '0 0 200 200', 'hero-art'));
  const top = el('div','hero-top');
  top.append(el('span','hero-source',['Мониторинг','Входящие','Рынок'][style]),el('span','position',String(selected+1).padStart(2,'0')+' / '+String(cards.length).padStart(2,'0')));
  hero.append(top,el('h2','',data.title || names[style]));
  const body = el('div','sheet-body'), meta = el('div','source-line');
  const sourceState = sourceStatuses[String(data.status || '').toLowerCase()] || data.status || 'Сводка источника';
  meta.append(el('strong','',sourceState));
  const updated = formatTime(data.updatedAt,stampFmt);
  if (updated) meta.append(el('span','age',updated));
  const rows = el('div','rows');
  for (const item of Array.isArray(data.items) ? data.items : []) {
    const row = el('div','row');
    row.append(el('span','',item.label ?? ''),el('b','',item.value ?? ''));
    if (item.detail) row.append(el('small','',item.detail));
    rows.append(row);
  }
  if (!rows.childElementCount) {
    const message = latest ? data.message || data.detail || data.source || 'У источника пока нет записей.' :
      accessState === 'loading' ? 'Загружаем сводку…' : accessState === 'private' ? 'Личная сводка доступна в Telegram.' : 'Сводка пока недоступна.';
    rows.append(el('p','empty',message));
  } else if (data.source) {
    rows.append(el('p','detail',[data.source,data.message].filter(Boolean).join(' · ')));
  }
  body.append(meta, rows); box.replaceChildren(hero,body);
  box.setAttribute('aria-label',(data.title || names[style])+', карточка '+(selected+1)+' из '+cards.length);
  $('pin-text').textContent = pins.has(data.id) ? 'Обновить' : 'Закрепить';
  const nav = cards.map((c,i) => {
    const b = el('button'); b.type = 'button'; b.setAttribute('aria-label',c.title || names[i]); b.setAttribute('aria-current',String(i===selected)); b.append(el('i'));
    b.addEventListener('click',() => select(i)); return b;
  });
  $('deck-nav').replaceChildren(...nav); renderPins();
}
function select(index) { selected = (index + cards.length) % cards.length; renderCard(); }
function savePins() { try { localStorage.setItem(pinKey,JSON.stringify([...pins])); } catch { /* restricted WebViews still support in-memory pins */ } }
function renderPins() {
  const rows = cards.filter(c => pins.has(c.id)).map(c => {
    const wrap = el('div','pin-item'), show = el('button','',c.title), drop = el('button');
    show.type = drop.type = 'button';
    show.prepend(icon('pin')); drop.append(icon('close'));
    drop.setAttribute('aria-label','Открепить '+c.title);
    show.onclick = () => { select(cards.indexOf(c)); $('card').scrollIntoView({block:'nearest'}); };
    drop.onclick = () => { pins.delete(c.id); savePins(); renderCard(); };
    wrap.append(show,drop); return wrap;
  });
  $('pins').replaceChildren(...rows); $('saved').hidden = !rows.length;
}
function pin() {
  const c = cards[selected]; pins.add(c.id); savePins();
  $('feedback').textContent = c.title+' в закреплённых';
  select(selected+1); refresh(c.id);
}
function displayResource(value) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  return Object.entries(value).map(([key,v]) => key+' '+displayResource(v)).join(' · ');
}
function facts(entry, parent) {
  const list = el('div','facts');
  for (const [label,value] of [['Файл',entry.file],['API',entry.api],['Токены',entry.tokens == null ? 'нет замера' : new Intl.NumberFormat('ru-RU').format(entry.tokens)],['Ресурсы',displayResource(entry.resources)]]) {
    if (!value) continue;
    const fact = el('span');fact.append(document.createTextNode(label+' '),el('strong','',value)); list.append(fact);
  }
  parent.append(list);
}
function journalView(agent, open) {
  const events = Array.isArray(agent.events) ? agent.events : [];
  const journal = el('details'), summary = el('summary','','Журнал'+(events.length ? ' · '+events.length : ''));
  journal.dataset.id = agent.id || 'lead';
  journal.open = open;
  journal.append(summary);
  const list = el('ol','events');
  for (const ev of events) {
    const row = el('li');
    row.append(el('span','time',formatTime(ev.at,timeFmt) || '—'),el('span','',ev.text));
    list.append(row);
  }
  journal.append(events.length ? list : el('p','detail','Событий пока нет.'));
  return journal;
}
function renderTeam() {
  updatePreview(latest?.preview);
  const lead = latest?.lead, agents = Array.isArray(latest?.agents) ? latest.agents : [];
  const viewKey = JSON.stringify([lead,agents,accessState]);
  if (lastAgents === viewKey) return;
  lastAgents = viewKey;
  const heading = el('div','agent-top');
  heading.append(el('h2','',lead?.name || 'ChatGPT Lead'),statusChip(lead?.status));
  const parts = [el('p','lead-kicker','Главный оркестратор'),heading];
  if (lead?.task) parts.push(el('p','task',lead.task));
  if (lead?.detail && lead.detail !== lead.task) parts.push(el('p','detail',lead.detail));
  const leadOpen = $('lead').querySelector('details')?.open ?? false;
  const leadFocused = document.activeElement?.closest('#lead details');
  $('lead').replaceChildren(...parts);
  if (lead) {
    facts(lead,$('lead'));
    $('lead').append(journalView(lead,leadOpen));
    if (leadFocused) $('lead').querySelector('summary')?.focus({preventScroll:true});
  }
  const expanded = new Set([...$('agents').querySelectorAll('details[open]')].map(node => node.dataset.id));
  const oldIds = new Set([...$('agents').querySelectorAll('details')].map(node => node.dataset.id));
  const focusId = document.activeElement?.closest('#agents details')?.dataset.id;
  const rows = agents.map(agent => {
    const card = el('article','agent'), head = el('div','agent-top');
    head.append(el('h3','',agent.name || agent.id),statusChip(agent.status)); card.append(head);
    if (agent.task) card.append(el('p','task',agent.task));
    facts(agent,card);
    const open = expanded.has(agent.id) || (!oldIds.has(agent.id) && ['WORKING','ERROR'].includes(agent.status));
    card.append(journalView(agent,open)); return card;
  });
  if (!rows.length) rows.push(el('p','empty',latest ? 'Агенты ещё не зарегистрировали события.' : 'Журнал появится при подключении к серверу.'));
  $('agents').replaceChildren(...rows);
  if (focusId) [...$('agents').querySelectorAll('details')].find(node => node.dataset.id === focusId)?.querySelector('summary')?.focus({preventScroll:true});
  $('count').textContent = agents.length ? agents.filter(a => a.status==='WORKING').length+' в работе' : '';
}
let previewId, videoUrl;
function updatePreview(id) {
  if (id === previewId) return;
  previewId = id;
  const video = $('clip');
  video.removeAttribute('src'); video.load(); video.hidden = true;
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = null;
  $('preview').hidden = !id; $('view-video').hidden = false; $('view-video').disabled = false;
  $('video-status').textContent = '';
}
$('view-video').onclick = async () => {
  const id = previewId, button = $('view-video');
  if (!id || button.disabled) return;
  button.disabled = true;
  $('video-status').textContent = 'Загружаем ролик…';
  try {
    const response = await fetch(new URL('/api/preview/'+encodeURIComponent(id),endpoint),{
      headers:initData ? {authorization:'tma '+initData} : {},credentials:'omit',signal:AbortSignal.timeout(45000)
    });
    if (!response.ok) throw Error('preview');
    const media = await response.blob();
    if (id !== previewId) return;
    videoUrl = URL.createObjectURL(media);
    $('clip').src = videoUrl; $('clip').hidden = false; button.hidden = true;
    $('video-status').textContent = '';
    await $('clip').play().catch(() => {});
  } catch {
    if (id === previewId) $('video-status').textContent = 'Не удалось загрузить ролик. Попробуйте ещё раз.';
  } finally { if (id === previewId) button.disabled = false; }
};
function connection(state) {
  accessState = state;
  const labels = {loading:'Подключение',online:'На связи',offline:'Нет связи',private:'Личный доступ'};
  const badge = $('connection'); badge.dataset.state = state; badge.lastElementChild.textContent = labels[state];
  const notice = $('access');
  notice.hidden = !['offline','private'].includes(state);
  if (state==='private') {
    const a=el('a','','Открыть Telegram');a.href=botUrl;
    notice.replaceChildren(document.createTextNode('Откройте Mini App через кнопку меню бота. '),a);
  } else if (state==='offline') {
    notice.textContent = latest ? 'Связь прервалась. Показана последняя полученная сводка.' : 'Сервер недоступен. Подключение повторится автоматически.';
  }
}
async function refresh(source) {
  if (!endpoint || (!local && !initData)) { connection('private'); renderCard();renderTeam();return; }
  if (busy) { if (source) forceNext = source; return; }
  busy = true; $('sync').disabled = true;
  const ctl = new AbortController(), timeout = setTimeout(() => ctl.abort(),11000);
  try {
    const url = new URL('/api/dashboard',endpoint);
    if (source) url.searchParams.set('refresh',source);
    const response = await fetch(url,{headers:initData ? {authorization:'tma '+initData} : {},signal:ctl.signal,cache:'no-store',credentials:'omit'});
    if ([401,403].includes(response.status)) { latest = undefined;cards=defaultCards;connection('private'); }
    else {
      if (!response.ok) throw Error('HTTP '+response.status);
      const next = await response.json();
      if (!Array.isArray(next.cards) || !Array.isArray(next.agents)) throw Error('Invalid dashboard');
      latest = next;
      cards = defaultCards.map((card,i) => next.cards.find(entry => entry.id===card.id) || next.cards[i] || card);
      connection('online');
    }
  } catch { connection('offline'); }
  finally {
    clearTimeout(timeout);busy=false; $('sync').disabled=false;
    if (!drag) renderCard();renderTeam();
    if (forceNext) {const next=forceNext;forceNext=undefined;void refresh(next);}
  }
}
$('pin').onclick = pin; $('skip').onclick = () => select(selected+1); $('sync').onclick = () => refresh(cards[selected].id);
const box = $('card');
box.addEventListener('pointerdown',e => {
  if (!e.isPrimary || e.button!==0) return;
  drag = {id:e.pointerId,x:e.clientX,y:e.clientY}; box.setPointerCapture(e.pointerId);
});
box.addEventListener('pointermove',e => {
  if (!drag || drag.id!==e.pointerId) return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if (Math.abs(dx)<8 || Math.abs(dx)<Math.abs(dy)) return;
  box.classList.add('dragging'); box.style.transform='translateX('+Math.max(-70,Math.min(70,dx*.32))+'px) rotate('+Math.max(-4,Math.min(4,dx*.016))+'deg)';
});
function endDrag(e) {
  if (!drag || drag.id!==e.pointerId) return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  drag=null;box.classList.remove('dragging');box.style.transform='';
  if (e.type==='pointerup' && Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.3) {
    if (dx>0) pin(); else select(selected+1);
  } else renderCard();
}
for (const action of ['pointerup','pointercancel','lostpointercapture']) box.addEventListener(action,endDrag);
box.addEventListener('keydown',e => {
  if (!['ArrowLeft','ArrowRight'].includes(e.key)) return;
  e.preventDefault();if(e.key==='ArrowRight') pin();else select(selected+1);
});
const tabs = [$('data-tab'),$('team-tab')];
function showTab(active) {
  tabs.forEach((tab,i) => {tab.setAttribute('aria-selected',String(i===active));tab.tabIndex=i===active?0:-1;$(tab.getAttribute('aria-controls')).hidden=i!==active;});
  scrollTo(0,0);
}
tabs.forEach((tab,i) => {
  tab.onclick = () => showTab(i);
  tab.addEventListener('keydown',e => {if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-i;showTab(next);tabs[next].focus();}});
});
function enableTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  tg.ready();tg.expand();
  if (tg.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes?.();
  if (tg.initData && !initData) { initData=tg.initData;void refresh(); }
}
if (window.Telegram?.WebApp) enableTelegram();
else if (launchData || /tgWebApp(?:Platform|Version)=/.test(location.hash)) {
  const sdk = document.createElement('script');sdk.src='https://telegram.org/js/telegram-web-app.js';sdk.onload=enableTelegram;document.head.append(sdk);
}
connection('loading');renderCard();renderTeam();void refresh();
setInterval(() => {if(!document.hidden && (initData || local)) void refresh();},4000);
document.addEventListener('visibilitychange',() => {if(!document.hidden) void refresh();});
