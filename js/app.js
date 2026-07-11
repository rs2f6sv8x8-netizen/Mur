/* ===================== Murdoku PWA ===================== */
'use strict';

const SUSPECT_COLORS = ['#e63946','#457b9d','#2a9d8f','#e9a23b','#9b5de5','#00a7c4',
  '#f15bb5','#7cb342','#ff924c','#4895ef','#b5179e','#00b894','#c9184a','#5c6bc0'];
const VICTIM_COLOR = '#8a94a6';
const STORE = 'murdoku.v1';

/* ---------- storage ---------- */
function loadStore(){
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch(e){ return {}; }
}
function saveStore(s){ try { localStorage.setItem(STORE, JSON.stringify(s)); } catch(e){} }
let store = loadStore();
store.solved  = store.solved  || {};      // id -> {time, hints}
store.state   = store.state   || {};      // id -> {elapsed, cells, accused}
store.revealed= store.revealed|| {};      // id -> true  (envelope opened on home)
store.settings= store.settings|| { theme:'auto', unlockAll:false };
function persist(){ saveStore(store); }

/* ---------- difficulty tiers (1–5 → named tiers, like murdoku.com) ---------- */
const DIFF_TIERS = [
  null,
  { key:'very-easy', label:'Very Easy', short:'VERY EASY' },
  { key:'easy',      label:'Easy',      short:'EASY' },
  { key:'medium',    label:'Medium',    short:'MEDIUM' },
  { key:'hard',      label:'Hard',      short:'HARD' },
  { key:'expert',    label:'Expert',    short:'EXPERT' },
];
function tierOf(p){ return DIFF_TIERS[Math.max(1,Math.min(5,p.difficulty||1))]; }

/* ---------- helpers ---------- */
const $  = (s,r=document)=>r.querySelector(s);
const el = (t,cls,txt)=>{ const e=document.createElement(t); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };
function fmtTime(sec){ sec=Math.max(0,Math.floor(sec)); const m=Math.floor(sec/60), s=sec%60;
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s; }
function suspColor(letter, idx){ if(letter==='V') return VICTIM_COLOR; return SUSPECT_COLORS[idx % SUSPECT_COLORS.length]; }
function toast(msg){
  const t=el('div','toast',msg); document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); },1400);
}

/* ---------- theme ---------- */
function applyTheme(){
  const t=store.settings.theme;
  if(t==='auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
applyTheme();
function cycleTheme(){
  const effectiveDark = document.documentElement.getAttribute('data-theme')==='dark'
    || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme:dark)').matches);
  store.settings.theme = effectiveDark ? 'light' : 'dark';
  persist(); applyTheme();
}

/* ---------- data ---------- */
let PUZZLES=[]; let BY_ID={};
async function loadPuzzles(){
  const res = await fetch('data/puzzles.json');
  PUZZLES = await res.json();
  PUZZLES.forEach(p=>{ BY_ID[p.id]=p; });
}


/* ===================== ROUTER ===================== */
function router(){
  const h = location.hash.replace(/^#\/?/,'');
  const m = h.match(/^play\/(\d+)/);
  if(m) renderPlay(parseInt(m[1],10));
  else renderHome();
}
window.addEventListener('hashchange', router);

/* ===================== HOME ===================== */
let homeFilter = 0;          // 0 = all, 1..5 = difficulty tier
let homeSort   = 'difficulty'; // difficulty | number
let hideDone   = false;
function renderHome(){
  stopTimer();
  const app = $('#app'); app.innerHTML='';
  const total = PUZZLES.length;
  const solvedCount = Object.keys(store.solved).filter(id=>BY_ID[id]).length;

  const page = el('div','home');

  /* ---- site header ---- */
  const head = el('header','site-head');
  const brand = el('div','brand');
  brand.innerHTML = `<span class="logo">MUR<b>DOKU</b></span><span class="byline">by Manuel Garand</span>`;
  brand.onclick = ()=>{ window.scrollTo({top:0,behavior:'smooth'}); };
  const acts = el('div','head-actions');
  const themeBtn = el('button','round-btn'); themeBtn.innerHTML = document.documentElement.getAttribute('data-theme')==='dark'||(!document.documentElement.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme:dark)').matches) ? '☀' : '🌙';
  themeBtn.title='Thema'; themeBtn.onclick=()=>{ cycleTheme(); renderHome(); };
  const setBtn = el('button','round-btn'); setBtn.innerHTML='⚙'; setBtn.title='Instellingen'; setBtn.onclick=openSettings;
  const helpBtn = el('button','round-btn'); helpBtn.innerHTML='?'; helpBtn.title='Hoe te spelen'; helpBtn.onclick=openHowTo;
  acts.append(helpBtn,setBtn,themeBtn);
  head.append(brand,acts);
  page.appendChild(head);

  const main = el('div','home-main');

  main.appendChild(Object.assign(el('h1','home-title'),{textContent:'Select a puzzle to play'}));

  const alpha = el('div','alpha-note');
  alpha.innerHTML = `<span class="alpha-badge">ALPHA</span>
    <span>Een speelbare companion voor de Murdoku-boeken. Kies een zaak, lees de aanwijzingen en ontmasker de moordenaar.</span>`;
  main.appendChild(alpha);

  const counts = el('div','counts');
  counts.innerHTML = `<b>${total}</b> puzzels &nbsp;·&nbsp; <span>${solvedCount} opgelost</span>`;
  main.appendChild(counts);

  /* ---- difficulty tier tabs ---- */
  const tabs = el('div','difftabs');
  const mk = (key,label)=>{ const b=el('button','difftab'+(homeFilter===key?' on':'')+(typeof key==='number'&&key?' t'+key:''),label);
    b.onclick=()=>{ homeFilter=key; renderHome(); }; return b; };
  tabs.appendChild(mk(0,'All'));
  for(let d=1; d<=5; d++) tabs.appendChild(mk(d, DIFF_TIERS[d].label));
  main.appendChild(tabs);

  /* ---- sort row ---- */
  const sortRow = el('div','sortrow');
  const lbl = el('span','sort-lbl','Sorteer op:');
  const sel = el('select','sort-sel');
  [['difficulty','Moeilijkheid'],['number','Zaaknummer']].forEach(([v,t])=>{
    const o=el('option',null,t); o.value=v; if(homeSort===v) o.selected=true; sel.appendChild(o);
  });
  sel.onchange=()=>{ homeSort=sel.value; renderHome(); };
  const hideBtn = el('button','pill-btn'+(hideDone?' on':''), hideDone?'✓ Opgeloste verborgen':'Verberg opgeloste');
  hideBtn.onclick=()=>{ hideDone=!hideDone; renderHome(); };
  sortRow.append(lbl,sel,el('div','spacer'),hideBtn);
  main.appendChild(sortRow);

  /* ---- case grid ---- */
  const grid = el('div','case-grid');
  let list = PUZZLES.slice();
  if(homeFilter) list = list.filter(p=>Math.max(1,Math.min(5,p.difficulty))===homeFilter);
  if(hideDone)   list = list.filter(p=>!store.solved[p.id]);
  if(homeSort==='difficulty') list.sort((a,b)=> (a.difficulty-b.difficulty) || (a.id-b.id));
  else list.sort((a,b)=>a.id-b.id);
  list.forEach(p=> grid.appendChild(caseCard(p)));
  if(!list.length) grid.appendChild(Object.assign(el('div','empty-note'),{textContent:'Geen zaken in deze selectie.'}));
  main.appendChild(grid);

  page.appendChild(main);
  app.appendChild(page);
  window.scrollTo(0,0);
}

function caseCard(p){
  const solved = !!store.solved[p.id];
  const revealed = !!store.revealed[p.id] || solved;
  const tier = tierOf(p);
  const card = el('div','case-card'+(revealed?' open':' sealed')+(solved?' done':'')+' '+tier.key);

  // the crime-scene peek (top of the card / behind the flap)
  const peek = el('div','peek');
  const img = el('img'); img.loading='lazy'; img.alt=''; img.src='assets/scenes/'+(p.scene||'');
  peek.appendChild(img);
  card.appendChild(peek);

  if(!revealed){
    const flap = el('div','flap');
    flap.innerHTML = `<div class="flap-text"><span class="ca">CASE AVAILABLE!</span><span class="ctr">KLIK OM TE ONTHULLEN</span></div>`;
    card.appendChild(flap);
    card.onclick=()=>{ store.revealed[p.id]=true; persist(); renderHome(); };
  } else {
    const info = el('div','case-info');
    const clueCount = (p.suspects||[]).filter(s=>s.clue).length;
    info.innerHTML = `
      <div class="ci-badge"><span class="mag">🔎</span> ${clueCount||p.n}</div>
      <div class="ci-title">${escapeHtml(p.title||'Onbekende zaak')}</div>
      <div class="ci-meta">
        <span class="tier-badge ${tier.key}">${tier.short}</span>
        <span class="ci-dim">${p.n}×${p.n}</span>
        <span class="ci-susp">${(p.suspects||[]).length} verdachten</span>
      </div>`;
    card.appendChild(info);
    if(solved){
      const s = store.solved[p.id];
      const done = el('div','done-ribbon');
      done.innerHTML = `✓ Opgelost${s&&s.time?` · ${fmtTime(s.time)}`:''}`;
      card.appendChild(done);
    }
    card.onclick=()=>{ location.hash='#/play/'+p.id; };
  }
  return card;
}
function escapeHtml(s){ return (s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

/* ===================== PLAY ===================== */
let T = null;        // play transient state
let timerHandle=null;

function stopTimer(){ if(timerHandle){ clearInterval(timerHandle); timerHandle=null; } }
function startTimer(){
  stopTimer();
  T.tickBase = Date.now();
  timerHandle = setInterval(()=>{
    const now = T.elapsed + (Date.now()-T.tickBase)/1000;
    const tEl = $('#timer'); if(tEl) tEl.textContent = fmtTime(now);
  }, 500);
}
function currentElapsed(){ return T.elapsed + (T.tickBase? (Date.now()-T.tickBase)/1000 : 0); }
function saveState(){
  if(!T) return;
  store.state[T.id] = { elapsed: currentElapsed(), cells: T.cells, notes: T.notes,
    manualMarks: T.manualMarks, accused: T.accused, hints: T.hintsShown };
  persist();
}
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function pushHistory(){
  T.history.push({ cells: clone(T.cells), notes: clone(T.notes), manualMarks: clone(T.manualMarks) });
  if(T.history.length>60) T.history.shift();
}

function renderPlay(id){
  const p = BY_ID[id];
  if(!p){ location.hash='#/'; return; }
  const saved = store.state[id] || {};
  T = {
    id, p,
    elapsed: store.solved[id]? 0 : (saved.elapsed||0),
    tickBase:null,
    cells: saved.cells || {},              // "r,c" -> letter (committed)
    notes: saved.notes || {},              // "r,c" -> {letter:true,...} (pencil marks)
    manualMarks: saved.manualMarks || {},  // "r,c" -> true (manual X)
    history: [],
    accused: saved.accused || null,
    hintsShown: store.solved[id]? (p.hintSteps||[]).length : (saved.hints||0),
    hintIndex: 0,
    selToken: null,
    xMode: false,
    eraseMode: false,
  };
  const app=$('#app'); app.innerHTML='';
  const view = el('div','play');

  /* top bar */
  const bar = el('div','pbar');
  const back = el('button','round-btn'); back.innerHTML='‹'; back.title='Terug'; back.onclick=()=>{ saveState(); location.hash='#/'; };
  const title = el('div','ptitle');
  const tier = tierOf(p);
  title.innerHTML = `<div class="no">Zaak ${p.id} · Boek ${p.book}</div>
    <div class="ttl">${escapeHtml(p.title)}</div>`;
  const badge = el('span','tier-badge '+tier.key, tier.short);
  const timer = el('div','timer run'); timer.id='timer'; timer.textContent=fmtTime(T.elapsed);
  bar.append(back,title,badge,timer);
  view.appendChild(bar);

  /* stage: suspects (left) + scene (right) */
  const stage = el('div','play-stage');

  /* LEFT: suspect parchment cards (doubles as placement selector) */
  const left = el('div','suspect-panel');
  if(p.rules && p.rules.length){
    p.rules.forEach(r=>{ const rr=el('div','rules'); rr.innerHTML='<b>!</b> '+escapeHtml(r); left.appendChild(rr); });
  }
  if(p.clueBlock){
    left.appendChild(Object.assign(el('div','clueblock'),{textContent:p.clueBlock}));
  }
  const susp = el('div','suspects'); susp.id='suspectlist';
  left.appendChild(susp);
  left.appendChild(Object.assign(el('div','lang-note'),{textContent:'Aanwijzingen in het Nederlands, zoals in het boek.'}));

  /* RIGHT: crime scene with the interactive grid, + tools rail */
  const right = el('div','scene-col');

  const tools = el('div','tools-rail');
  const tlabel = el('div','tools-label','Gereedschap');
  const xBtn=el('button','tool-btn'); xBtn.id='xtoolbtn'; xBtn.textContent='✕'; xBtn.title='Markeer onmogelijk';
  xBtn.onclick=()=>{ T.xMode=!T.xMode; T.eraseMode=false; refreshToolbar(); };
  const eraseBtn=el('button','tool-btn'); eraseBtn.id='erasebtn'; eraseBtn.innerHTML='⌫';
  eraseBtn.title='Wissen (ingedrukt = alles wissen)';
  attachHold(eraseBtn, ()=>{ if(confirm('Het hele raster wissen?')){ pushHistory(); T.cells={}; T.notes={}; T.manualMarks={}; updateBoards(); saveState(); } },
    ()=>{ T.eraseMode=!T.eraseMode; T.xMode=false; refreshToolbar(); }, 550);
  const undoBtn=el('button','tool-btn'); undoBtn.id='undobtn'; undoBtn.textContent='↺'; undoBtn.title='Ongedaan maken';
  undoBtn.onclick=doUndo;
  tools.append(tlabel,xBtn,eraseBtn,undoBtn);
  right.appendChild(tools);

  if(p.scene){
    const sw=el('div','scene-wrap'); sw.id='sceneboard';
    const clip=el('div','imgclip');
    const img=el('img'); img.src='assets/scenes/'+p.scene; img.alt='Plaats delict '+p.title; img.loading='lazy';
    clip.appendChild(img); sw.appendChild(clip);
    if(p.grid){
      const g=p.grid;
      const colLbl=el('div','axis-labels cols');
      colLbl.style.left=(g.left*100)+'%'; colLbl.style.width=(g.width*100)+'%';
      colLbl.style.top='2px'; colLbl.style.height=(g.top*100)+'%';
      colLbl.style.alignItems='flex-end';
      for(let c=1;c<=g.cols;c++){ const sp=el('span'); sp.dataset.n=c; colLbl.appendChild(sp); }
      sw.appendChild(colLbl);
      const rowLbl=el('div','axis-labels rows');
      rowLbl.style.top=(g.top*100)+'%'; rowLbl.style.height=(g.height*100)+'%';
      rowLbl.style.left='2px'; rowLbl.style.width=(g.left*100)+'%';
      for(let r=1;r<=g.rows;r++){ const sp=el('span'); sp.dataset.n=r; rowLbl.appendChild(sp); }
      sw.appendChild(rowLbl);
      const ov=el('div','grid-overlay'); ov.id='gridoverlay'; sw.appendChild(ov);
      const zb=el('button','scene-zoom'); zb.textContent='⤢';
      zb.onclick=(e)=>{ e.stopPropagation(); openZoom('assets/scenes/'+p.scene); };
      sw.appendChild(zb);
      img.addEventListener('load', renderSceneOverlay);
    } else {
      img.style.cursor='zoom-in';
      img.onclick=()=>openZoom('assets/scenes/'+p.scene);
      sw.appendChild(Object.assign(el('div','scene-hint'),{textContent:'Tik om te vergroten'}));
    }
    right.appendChild(sw);
  }

  /* scratch grid fallback (only when the scene itself isn't the interactive board) */
  if(!p.grid){
    const gcard = el('div','scratch-card');
    gcard.appendChild(Object.assign(el('div','grid-tools'),{innerHTML:
      '<span class="mini">Tik op een verdachte, kies dan een vak: tik = notitie, ingedrukt houden = plaatsen.</span>'}));
    const board=el('div','board'); board.id='board';
    gcard.appendChild(board);
    right.appendChild(gcard);
  }

  stage.append(left,right);
  view.appendChild(stage);

  /* bottom action bar: Hint / Submit / How to play */
  const ab=el('div','actionbar');
  const abw=el('div','wrapb');
  const hintBtn=el('button','hint-btn'); hintBtn.innerHTML='💡 Hint'; hintBtn.title='Hint';
  hintBtn.onclick=openHints;
  const submitBtn=el('button','submit-btn'); submitBtn.id='submitbtn';
  submitBtn.innerHTML='<b>INDIENEN</b><small>plaats eerst iedereen</small>';
  submitBtn.onclick=onSubmit;
  const howBtn=el('button','how-btn','HOE TE SPELEN'); howBtn.onclick=openHowTo;
  abw.append(hintBtn,submitBtn,howBtn);
  ab.appendChild(abw);
  view.appendChild(ab);

  app.appendChild(view);
  updateBoards();
  if(!store.solved[id]) startTimer();
  window.scrollTo(0,0);
  if(!store.settings.tutorialDone) openTutorial(0);
}

function peopleOf(p){
  const arr = (p.suspects||[]).slice();
  if(p.victim) arr.push(p.victim);
  return arr;
}
function gridDims(p){ return p.grid ? {rows:p.grid.rows, cols:p.grid.cols} : {rows:gridSize(p), cols:gridSize(p)}; }
function allSuspectsPlaced(){
  const placed = new Set(Object.values(T.cells));
  return (T.p.suspects||[]).every(s=>placed.has(s.letter));
}
function autoXSet(){
  const s = new Set();
  const {rows,cols} = gridDims(T.p);
  for(const key in T.cells){
    const [r,c] = key.split(',').map(Number);
    for(let cc=1; cc<=cols; cc++){ if(cc!==c) s.add(r+','+cc); }
    for(let rr=1; rr<=rows; rr++){ if(rr!==r) s.add(rr+','+c); }
  }
  return s;
}
function isMarked(key, auto){ return !!T.manualMarks[key] || auto.has(key); }

/* ----- shared tap-vs-hold gesture: tap = pencil note, hold = commit ----- */
function attachHold(elm, onHold, onTap, ms){
  ms = ms || 480;
  let timer=null, longPressed=false, startX=0, startY=0, active=false;
  const start = (e)=>{
    if(active) return; active=true; longPressed=false;
    const pt = e.touches? e.touches[0] : e;
    startX=pt.clientX; startY=pt.clientY;
    elm.classList.add('pressing');
    timer=setTimeout(()=>{ longPressed=true; elm.classList.remove('pressing'); onHold(); }, ms);
  };
  const cancel = ()=>{ active=false; clearTimeout(timer); elm.classList.remove('pressing'); };
  const end = (e)=>{
    if(!active) return; active=false;
    clearTimeout(timer); elm.classList.remove('pressing');
    if(!longPressed && onTap) onTap();
  };
  const move = (e)=>{
    if(!active) return;
    const pt = e.touches? e.touches[0] : e;
    if(Math.abs(pt.clientX-startX)>10 || Math.abs(pt.clientY-startY)>10) cancel();
  };
  elm.addEventListener('pointerdown', start);
  elm.addEventListener('pointerup', end);
  elm.addEventListener('pointerleave', cancel);
  elm.addEventListener('pointercancel', cancel);
  elm.addEventListener('pointermove', move);
  elm.addEventListener('contextmenu', e=>e.preventDefault());
}

function onCellTap(key){
  if(T.xMode){
    if(T.cells[key]) return;
    pushHistory();
    if(T.manualMarks[key]) delete T.manualMarks[key]; else T.manualMarks[key]=true;
    updateBoards(); saveState(); return;
  }
  if(T.eraseMode){
    if(!T.cells[key] && !T.notes[key] && !T.manualMarks[key]) return;
    pushHistory();
    delete T.cells[key]; delete T.notes[key]; delete T.manualMarks[key];
    updateBoards(); saveState(); return;
  }
  if(!T.selToken){ toast('Kies eerst een verdachte'); return; }
  const auto = autoXSet();
  if(isMarked(key, auto)) return;               // can't note an eliminated cell
  if(T.cells[key]) return;                       // occupied by a commitment
  pushHistory();
  T.notes[key] = T.notes[key] || {};
  if(T.notes[key][T.selToken]) delete T.notes[key][T.selToken];
  else T.notes[key][T.selToken] = true;
  if(!Object.keys(T.notes[key]).length) delete T.notes[key];
  updateBoards(); saveState();
}
function onCellHold(key){
  if(T.xMode || T.eraseMode) return;              // hold only commits in placement mode
  if(!T.selToken){ toast('Kies eerst een verdachte'); return; }
  const auto = autoXSet();
  if(isMarked(key, auto)){ toast('Dit vak is al uitgesloten'); return; }
  if(T.cells[key] && T.cells[key]===T.selToken){
    pushHistory(); delete T.cells[key]; updateBoards(); saveState(); return;
  }
  if(T.cells[key]) return;                        // occupied by someone else
  pushHistory();
  for(const k of Object.keys(T.cells)) if(T.cells[k]===T.selToken) delete T.cells[k];
  T.cells[key]=T.selToken;
  delete T.notes[key];
  updateBoards(); saveState();
  if(allSuspectsPlaced()) toast('Iedereen geplaatst — klaar om in te dienen');
}
function doUndo(){
  if(!T.history.length){ toast('Niets om ongedaan te maken'); return; }
  const last = T.history.pop();
  T.cells=last.cells; T.notes=last.notes; T.manualMarks=last.manualMarks;
  updateBoards(); saveState();
}

function updateBoards(){
  if(T.p.grid) renderSceneOverlay(); else renderBoard();
  renderSuspectList();
  refreshToolbar();
}
function refreshToolbar(){
  const x=$('#xtoolbtn'), e=$('#erasebtn'), u=$('#undobtn'), s=$('#submitbtn');
  if(x) x.classList.toggle('on', T.xMode);
  if(e) e.classList.toggle('on', T.eraseMode);
  if(u) u.disabled = !T.history.length;
  if(s){
    const ready = allSuspectsPlaced();
    s.disabled = !ready;
    const small = s.querySelector('small');
    if(small) small.textContent = ready ? 'klaar — controleer je oplossing' : 'plaats eerst iedereen';
  }
}
/* simple silhouette avatar (no reliable name↔photo mapping exists in the books) */
function avatarSVG(color){
  return `<svg viewBox="0 0 40 40" class="av-svg" aria-hidden="true">
    <rect width="40" height="40" rx="8" fill="${color}"/>
    <circle cx="20" cy="15.5" r="7.2" fill="rgba(255,255,255,.92)"/>
    <path d="M6 39c1.6-9.4 8-14 14-14s12.4 4.6 14 14z" fill="rgba(255,255,255,.92)"/>
  </svg>`;
}
function renderSuspectList(){
  const susp=$('#suspectlist'); if(!susp) return;
  susp.innerHTML='';
  const placedLetters = new Set(Object.values(T.cells));
  peopleOf(T.p).forEach((s,i)=>{
    const isVictim = s.letter==='V';
    const isPlaced = placedLetters.has(s.letter);
    const color = suspColor(s.letter,i);
    const row=el('div','susp'
      +(isVictim?' victim':' pickable')
      +(T.selToken===s.letter?' selected':'')
      +(isPlaced?' placed':'')
      +(T.accused===s.name?' accused':''));
    row.dataset.name=s.name;
    const av=el('div','avatar'); av.innerHTML=avatarSVG(color);
    const badge=el('span','av-letter'); badge.style.background=color; badge.textContent=s.letter;
    av.appendChild(badge);
    // the victim's clue in the books starts with "Het slachtoffer" — shown here
    // as a separate role line, so strip it (and repair the missing space) to
    // avoid duplication.
    let clue = s.clue || '';
    if(isVictim) clue = clue.replace(/^\s*Het slachtoffer\.?\s*/i, '').trim();
    const who=el('div','who');
    who.innerHTML=`<div class="nm">${escapeHtml(s.name)}</div>`
      +(isVictim?`<div class="role">Het slachtoffer</div>`:'')
      +(clue?`<div class="cl">${escapeHtml(clue)}</div>`:'');
    row.append(av,who);
    if(!isVictim){
      row.onclick=()=>{
        T.selToken = T.selToken===s.letter ? null : s.letter;
        T.xMode=false; T.eraseMode=false;
        renderSuspectList(); refreshToolbar();
      };
    }
    susp.appendChild(row);
  });
}

/* ----- scratch board (table, used when no on-scene grid box was detected) ----- */
function gridSize(p){ return Math.max(2, Math.min(24, p.n||peopleOf(p).length)); }
function cellView(key){
  // returns {kind:'tok'|'x'|'notes'|'empty', letter, letters}
  if(T.cells[key]) return {kind:'tok', letter:T.cells[key]};
  const auto = T._auto || (T._auto = autoXSet());
  if(isMarked(key, auto)) return {kind:'x'};
  const n = T.notes[key];
  if(n && Object.keys(n).length) return {kind:'notes', letters:Object.keys(n).sort()};
  return {kind:'empty'};
}
function renderBoard(){
  const p=T.p, {rows,cols}=gridDims(p);
  const board=$('#board'); if(!board) return;
  T._auto = autoXSet();
  const avail = Math.min(board.clientWidth||360, 460) - 26;
  const cell = Math.max(28, Math.min(50, Math.floor(avail/Math.max(rows,cols))));
  const tbl=el('table'); tbl.style.setProperty('--cell', cell+'px');
  const head=el('tr'); head.appendChild(el('th',''));
  for(let c=1;c<=cols;c++) head.appendChild(el('th','', String(c)));
  tbl.appendChild(head);
  const people=peopleOf(p);
  for(let r=1;r<=rows;r++){
    const tr=el('tr'); tr.appendChild(el('th','', String(r)));
    for(let c=1;c<=cols;c++){
      const key=r+','+c; const td=el('td');
      td.dataset.key=key;
      td.style.setProperty('--cell',cell+'px');
      const v=cellView(key);
      if(v.kind==='tok'){
        const idx=people.findIndex(x=>x.letter===v.letter);
        td.classList.add('filled'); td.textContent=v.letter;
        td.style.background=suspColor(v.letter, idx<0?0:idx);
      } else if(v.kind==='x'){
        td.classList.add('marked');
        td.appendChild(Object.assign(el('span','txmark'),{textContent:'✕'}));
      } else if(v.kind==='notes'){
        const wrap=el('div','tnotes');
        v.letters.forEach(L=>wrap.appendChild(Object.assign(el('span'),{textContent:L})));
        td.appendChild(wrap);
      }
      attachHold(td, ()=>onCellHold(key), ()=>onCellTap(key));
      tr.appendChild(td);
    }
    tbl.appendChild(tr);
  }
  board.innerHTML=''; board.appendChild(tbl);
}

/* ----- on-scene interactive grid (overlaid directly on the illustration) ----- */
function renderSceneOverlay(){
  const p=T.p, g=p.grid; const ov=$('#gridoverlay'); if(!ov||!g) return;
  T._auto = autoXSet();
  ov.style.left=(g.left*100)+'%'; ov.style.top=(g.top*100)+'%';
  ov.style.width=(g.width*100)+'%'; ov.style.height=(g.height*100)+'%';
  ov.style.gridTemplateColumns=`repeat(${g.cols}, 1fr)`;
  ov.style.gridTemplateRows=`repeat(${g.rows}, 1fr)`;
  ov.innerHTML='';
  const people=peopleOf(p);
  for(let r=1;r<=g.rows;r++){
    for(let c=1;c<=g.cols;c++){
      const key=r+','+c; const cell=el('div','gcell'); cell.dataset.key=key;
      const v=cellView(key);
      if(v.kind==='tok'){
        const idx=people.findIndex(x=>x.letter===v.letter);
        const tok=el('div','gtok'); tok.textContent=v.letter;
        tok.style.background=suspColor(v.letter, idx<0?0:idx);
        cell.appendChild(tok);
      } else if(v.kind==='x'){
        cell.classList.add('marked');
        cell.appendChild(Object.assign(el('div','gxmark'),{textContent:'✕'}));
      } else if(v.kind==='notes'){
        const wrap=el('div','gnotes');
        v.letters.forEach(L=>wrap.appendChild(Object.assign(el('span'),{textContent:L})));
        cell.appendChild(wrap);
      }
      attachHold(cell, ()=>onCellHold(key), ()=>onCellTap(key));
      ov.appendChild(cell);
    }
  }
}
function placementStatus(){
  // compare T.cells to solution; returns {placed,total,correct,allCorrect}
  const sol=T.p.solution; if(!sol) return null;
  const letters=Object.keys(sol);
  let placed=0, correct=0;
  const pos={};                          // letter -> "r,c" from player's board
  for(const k of Object.keys(T.cells)) pos[T.cells[k]]=k;
  for(const L of letters){
    if(pos[L]!==undefined){ placed++;
      const [r,c]=sol[L];
      if(pos[L]===r+','+c) correct++;
    }
  }
  return {placed, total:letters.length, correct, allCorrect: correct===letters.length};
}
function markCellResult(key, cls){
  const ce = T.p.grid ? document.querySelector(`#gridoverlay .gcell[data-key="${key}"]`)
                       : document.querySelector(`#board td[data-key="${key}"]`);
  if(ce) ce.classList.add(cls);
}
function revealSolution(){
  const sol=T.p.solution; if(!sol) return;
  pushHistory();
  T.cells={}; T.notes={}; T.manualMarks={};
  for(const L in sol){ T.cells[sol[L][0]+','+sol[L][1]]=L; }
  updateBoards(); saveState();
}
window.addEventListener('resize', ()=>{ if(T && ($('#board')||$('#gridoverlay'))) updateBoards(); });

/* ----- submit ----- */
function onSubmit(){
  const p=T.p;
  if(!allSuspectsPlaced()){ toast('Plaats eerst alle verdachten'); return; }
  if(p.solution){
    // only the suspects the player can actually place are checked — the
    // victim's cell is fully determined once every suspect is correctly
    // placed (a puzzle has exactly one valid solution), so it's implied
    // rather than requiring separate placement.
    const sol=p.solution; const solPos={}; for(const L in sol) solPos[L]=sol[L][0]+','+sol[L][1];
    const checkLetters = (p.suspects||[]).map(s=>s.letter).filter(L=>L in sol);
    document.querySelectorAll('.gcell.ok,.gcell.bad,#board td.ok,#board td.bad').forEach(e=>e.classList.remove('ok','bad'));
    let correct=0; const total=checkLetters.length;
    for(const L of checkLetters){
      const key = Object.keys(T.cells).find(k=>T.cells[k]===L);
      if(key && key===solPos[L]){ correct++; markCellResult(key,'ok'); }
      else if(key){ markCellResult(key,'bad'); }
    }
    if(correct===total){ finishPuzzle(p.murderer || '—', true); }
    else toast(correct+' van '+total+' juist — pas je raster aan');
    return;
  }
  openAccuse();
}
function finishPuzzle(murdererName, gridVerified){
  const p=T.p;
  const time = Math.round(currentElapsed());
  stopTimer();
  const prev = store.solved[p.id];
  const best = prev && prev.time ? Math.min(prev.time, time) : time;
  store.solved[p.id] = { time: best, hints: T.hintsShown };
  delete store.state[p.id];
  persist();
  showResult(true, p.murderer || murdererName, time, !!p.murderer, gridVerified);
}

/* ===================== MODALS ===================== */
function modal(node, cls){
  const root=$('#modal-root'); root.innerHTML='';
  const ov=el('div','overlay'); const sheet=el('div','sheet'+(cls?' '+cls:''));
  sheet.appendChild(node); ov.appendChild(sheet);
  ov.onclick=(e)=>{ if(e.target===ov) closeModal(); };
  root.appendChild(ov);
  return sheet;
}
function closeModal(){ $('#modal-root').innerHTML=''; }

function openZoom(src){
  const img=el('img'); img.src=src; const s=modal(img,'zoom');
  s.onclick=closeModal;
}

/* ---------- mini illustration grids ---------- */
function miniGrid(rows){
  const t=el('table','mini-grid');
  rows.forEach(r=>{
    const tr=el('tr');
    r.forEach(c=>{
      const td=el('td', c&&c.cls||''); td.textContent = c&&c.t||'';
      tr.appendChild(td);
    });
    t.appendChild(tr);
  });
  const w=el('div','tut-fig'); w.appendChild(t); return w;
}
const _X={t:'✕',cls:'x'}, _E={t:''}, _A={t:'A',cls:'a'}, _O={t:'●',cls:'dot'},
      _OK={t:'✓',cls:'ok'}, _V={t:'●',cls:'dot'}, _B={cls:'blk'}, _G={cls:'grn'};

/* ---------- first-run tutorial ---------- */
const TUTORIAL=[
  {emoji:'🔍', title:'Welkom, detective',
   body:'Er is een moord gepleegd. Eén van deze verdachten is de dader. De aanwijzingen vertellen je wie het was — en waar iedereen zich bevond.'},
  {emoji:'🧩', title:'Zo los je de zaak op',
   body:'Het slachtoffer was alleen met de moordenaar. Zoek precies uit waar elk personage stond. Elke kaart toont de aanwijzing van dat personage.'},
  {emoji:'⚠️', title:'Eén per rij en kolom',
   body:'Elke rij en elke kolom bevat precies één personage. Zodra je iemand plaatst, worden de rest van hun rij en kolom automatisch onmogelijk (✕).',
   fig:()=>miniGrid([[_E,_E,_X,_E],[_X,_X,_A,_X],[_E,_E,_X,_E],[_E,_E,_X,_E]])},
  {emoji:'🧭', title:"Wat 'naast' betekent",
   body:'Naast betekent direct links, rechts, boven of onder — én in dezelfde ruimte. Niet diagonaal.',
   fig:()=>miniGrid([[_E,_OK,_E],[_OK,_O,_X],[_E,_OK,_E]])},
  {emoji:'👆', title:'Plaatsen: tik of houd ingedrukt',
   body:'Tik op een verdachte om die te kiezen. Een korte tik op een vak zet een klein potloodnotitie neer. Houd een vak ingedrukt om die verdachte er echt te plaatsen.'},
  {emoji:'🛠️', title:'Gereedschap',
   body:'✕ markeert een vak als onmogelijk. ⌫ wist een vak (ingedrukt houden wist alles). ↺ maakt je laatste actie ongedaan.'},
  {emoji:'🕵️', title:'Kraak de zaak',
   body:'Heb je iedereen geplaatst? Dan wordt ✓ Indienen actief. Vast? Gebruik 💡 Hint voor de redenering uit het boek, stap voor stap. Succes!'},
];
function openTutorial(step){
  step = step||0;
  const s=TUTORIAL[step];
  const wrap=el('div');
  wrap.appendChild(Object.assign(el('div','tut-emoji'),{textContent:s.emoji}));
  wrap.appendChild(Object.assign(el('div','tut-title'),{textContent:s.title}));
  wrap.appendChild(Object.assign(el('div','tut-body'),{textContent:s.body}));
  if(s.fig) wrap.appendChild(s.fig());
  const dots=el('div','tut-dots');
  TUTORIAL.forEach((_,i)=>{ const d=el('i',i===step?'on':''); dots.appendChild(d); });
  wrap.appendChild(dots);
  const nav=el('div','tut-nav');
  const skip=el('button','skip','Overslaan'); skip.onclick=finishTutorial;
  nav.appendChild(skip); nav.appendChild(el('div','spacer'));
  if(step>0){ const b=el('button','btn','Terug'); b.onclick=()=>openTutorial(step-1); nav.appendChild(b); }
  const next=el('button','btn primary', step===TUTORIAL.length-1?'Spelen!':'Volgende');
  next.onclick=()=> step===TUTORIAL.length-1 ? finishTutorial() : openTutorial(step+1);
  nav.appendChild(next);
  wrap.appendChild(nav);
  modal(wrap);
}
function finishTutorial(){ store.settings.tutorialDone=true; persist(); closeModal(); }

/* ---------- how to play reference ---------- */
function openHowTo(){
  const w=el('div','htp');
  w.appendChild(Object.assign(el('h2'),{textContent:'Hoe te spelen'}));
  w.appendChild(Object.assign(el('h4'),{textContent:'Doel'}));
  w.appendChild(Object.assign(el('p'),{textContent:'De moordenaar was alleen met het slachtoffer, in dezelfde ruimte. Gebruik de aanwijzingen om uit te zoeken wie waar was.'}));
  w.appendChild(Object.assign(el('h4'),{textContent:'Regels'}));
  const ul1=el('ul');
  ['Eén persoon per rij en per kolom.',
   'Verdachten staan alleen op vrije vakken (niet op tafels, planten, enz.).',
   'Het slachtoffer ligt in het laatst overgebleven vak.'].forEach(t=>ul1.appendChild(Object.assign(el('li'),{textContent:t})));
  w.appendChild(ul1);
  w.appendChild(Object.assign(el('h4'),{textContent:'Bediening'}));
  const ul2=el('ul');
  ['Tik op een verdachte om die te selecteren.',
   'Tik op een vak: potloodnotitie (klein). Houd ingedrukt: plaatsen (groot).',
   'Sleep over meerdere vakken om notities in één keer te schilderen.',
   '✕ markeert een vak zelf als onmogelijk.',
   '⌫ wist één vak; houd ingedrukt om het hele raster te wissen.',
   '↺ maakt je laatste actie ongedaan.',
   '✓ Indienen wordt actief zodra iedereen geplaatst is.'].forEach(t=>ul2.appendChild(Object.assign(el('li'),{textContent:t})));
  w.appendChild(ul2);
  w.appendChild(Object.assign(el('h4'),{textContent:'Trefwoorden'}));
  const kw=el('div','kw');
  const K=[
    ['naast','Links, rechts, boven of onder, én in dezelfde ruimte.', [[_E,_OK,_E],[_OK,_O,_X],[_E,_OK,_E]]],
    ['alleen','Niemand anders in de ruimte (ook het slachtoffer niet).', [[_X,_X,_G],[_X,_A,_G],[_X,_G,_G]]],
    ['alleen met','Alleen deze twee personen waren in de ruimte.', [[_X,_X,_G],[_X,_A,_G],[{t:'B',cls:'a'},_G,_G]]],
    ['hoek','Waar twee muren van een kamer samenkomen.', [[_O,_E,_O],[_E,_E,_E],[_E,_O,_E]]],
    ['rij','Een horizontale lijn van vakken.', [[_E,_E,_E],[_O,_O,_O],[_E,_E,_E]]],
    ['kolom','Een verticale lijn van vakken.', [[_E,_O,_E],[_E,_O,_E],[_E,_O,_E]]],
    ['links van (a)','Elk vak links van (a).', [[_O,_O,_E],[_O,_A,_E],[_O,_O,_E]]],
    ['rechts van (a)','Elk vak rechts van (a).', [[_E,_O,_O],[_E,_A,_O],[_E,_O,_O]]],
  ];
  K.forEach(([name,desc,g])=>{
    const box=el('div','box');
    box.appendChild(Object.assign(el('b'),{textContent:name}));
    box.appendChild(Object.assign(el('small'),{textContent:desc}));
    box.appendChild(miniGrid(g));
    kw.appendChild(box);
  });
  w.appendChild(kw);
  const row=el('div','row');
  const c=el('button','btn primary','Sluiten'); c.onclick=closeModal; row.appendChild(c);
  w.appendChild(row);
  modal(w);
}

function hintify(text, p){
  // wrap standalone suspect letters (e.g. " C " or "(C)") in colored badges
  const people = peopleOf(p);
  const idx = {}; people.forEach((s,i)=>idx[s.letter]=i);
  return escapeHtml(text).replace(/\b([A-Z])\b/g, (m,L)=>{
    if(!(L in idx)) return m;
    return `<span class="hbadge" style="background:${suspColor(L, idx[L])}">${L}</span>`;
  });
}
function openHints(){
  const p=T.p;
  const steps = (p.hintSteps&&p.hintSteps.length)? p.hintSteps : genericHints(p);
  let idx = Math.max(0, Math.min(T.hintIndex||0, steps.length-1));
  const wrap=el('div');
  wrap.appendChild(Object.assign(el('h2'),{textContent:'Hint'}));
  const pager=el('div','hint-pager');
  const pn=el('div','hp-n'); pager.appendChild(pn);
  wrap.appendChild(pager);
  const body=el('div','hint-body');
  wrap.appendChild(body);
  const nav=el('div','hint-nav');
  const prev=el('button','btn','‹ Vorige');
  const next=el('button','btn','Volgende ›');
  nav.append(prev,next);
  wrap.appendChild(nav);
  let solveBtn=null;
  if(p.solution){
    solveBtn = el('button','btn','Toon volledige oplossing');
    solveBtn.onclick=()=>{ if(confirm('De volledige oplossing tonen in het raster?')){ closeModal(); revealSolution(); } };
  }
  const row=el('div','row');
  const close=el('button','btn primary','Sluiten'); close.onclick=closeModal;
  row.appendChild(close);
  wrap.appendChild(row);
  if(solveBtn) wrap.appendChild(solveBtn);
  function draw(){
    T.hintIndex = idx;
    T.hintsShown = Math.max(T.hintsShown, idx+1);
    saveState();
    pn.textContent = 'HINT '+(idx+1)+' / '+steps.length;
    body.innerHTML = hintify(steps[idx], p);
    prev.disabled = idx===0;
    next.disabled = idx===steps.length-1;
    if(solveBtn) solveBtn.style.display = idx===steps.length-1 ? 'flex' : 'none';
  }
  prev.onclick=()=>{ idx=Math.max(0,idx-1); draw(); };
  next.onclick=()=>{ idx=Math.min(steps.length-1,idx+1); draw(); };
  draw();
  modal(wrap);
}
function genericHints(p){
  const h=[];
  h.push('Iedere verdachte staat in een eigen rij én kolom. Begin met de aanwijzing die maar één plek toelaat.');
  h.push('Zoek naar een rij, kolom of ruimte met precies één open vak — daar moet dan iemand staan.');
  h.push('Het slachtoffer ligt in het laatste overgebleven vak. De persoon die er direct naast of samen mee in de ruimte staat, is de moordenaar.');
  if(p.murderer) h.push('De moordenaar is '+p.murderer+'.');
  return h;
}

function openAccuse(){
  const p=T.p;
  const wrap=el('div');
  wrap.appendChild(Object.assign(el('h2'),{textContent:'Wie is de moordenaar?'}));
  wrap.appendChild(Object.assign(el('p'),{textContent:'Kies de verdachte die je beschuldigt.'}));
  const list=el('div','pick-list');
  (p.suspects||[]).forEach((s,i)=>{
    const color=suspColor(s.letter,i);
    const b=el('button','susp pickable');
    const av=el('div','avatar'); av.innerHTML=avatarSVG(color);
    const badge=el('span','av-letter'); badge.style.background=color; badge.textContent=s.letter; av.appendChild(badge);
    const who=el('div','who'); who.innerHTML=`<div class="nm">${escapeHtml(s.name)}</div>`;
    b.append(av,who);
    b.onclick=()=>{ closeModal(); resolveAccusation(s.name); };
    list.appendChild(b);
  });
  wrap.appendChild(list);
  const row=el('div','row');
  const cancel=el('button','btn','Annuleer'); cancel.onclick=closeModal;
  row.appendChild(cancel);
  wrap.appendChild(row);
  modal(wrap);
}

function resolveAccusation(name){
  const p=T.p; T.accused=name;
  const known = !!p.murderer;
  const correct = known ? (name===p.murderer) : true;
  if(correct){
    const time = Math.round(currentElapsed());
    stopTimer();
    const prev = store.solved[p.id];
    const best = prev && prev.time ? Math.min(prev.time, time) : time;
    store.solved[p.id] = { time: best, hints: T.hintsShown };
    delete store.state[p.id];
    persist();
    showResult(true, name, time, known);
  } else {
    saveState();
    showResult(false, name, Math.round(currentElapsed()), known);
  }
}

function showResult(correct, name, time, known, gridVerified){
  const p=T.p;
  const wrap=el('div');
  const emo = el('div','result-emoji'); emo.textContent = correct? (known?'🕵️':'📝') : '❌';
  wrap.appendChild(emo);
  if(correct && known){
    wrap.appendChild(Object.assign(el('h2'),{textContent:'Zaak opgelost!'}));
    let extra='';
    if(gridVerified){
      extra = `<br><span class="solved-pill">★ Volledig raster geverifieerd</span>`;
    } else {
      const ps = placementStatus();
      if(ps){
        extra = ps.allCorrect
          ? `<br><span class="solved-pill">★ Perfect raster — iedereen juist geplaatst</span>`
          : `<br><span style="color:var(--muted);font-size:13px">Raster: ${ps.correct}/${ps.total} juist geplaatst</span>`;
      }
    }
    wrap.appendChild(Object.assign(el('p'),{innerHTML:`De moordenaar was <b style="color:var(--ink)">${escapeHtml(name)}</b>.<br>Tijd: <b style="color:var(--ink)">${fmtTime(time)}</b> · Hints: ${T.hintsShown}${extra}`}));
  } else if(correct && !known){
    wrap.appendChild(Object.assign(el('h2'),{textContent:'Genoteerd'}));
    wrap.appendChild(Object.assign(el('p'),{innerHTML:`Je beschuldigt <b style="color:var(--ink)">${escapeHtml(name)}</b>. De oplossing van deze zaak staat niet in de digitale gegevens — vergelijk met het boek. De zaak is gemarkeerd als voltooid.`}));
  } else {
    wrap.appendChild(Object.assign(el('h2'),{textContent:'Niet juist'}));
    wrap.appendChild(Object.assign(el('p'),{innerHTML:`<b style="color:var(--ink)">${escapeHtml(name)}</b> is niet de moordenaar. Bekijk de aanwijzingen nog eens.`}));
  }
  const row=el('div','row');
  if(correct){
    const next = nextId(p.id);
    if(next){ const nb=el('button','btn primary','Volgende zaak ▸'); nb.onclick=()=>{ closeModal(); location.hash='#/play/'+next; }; row.appendChild(nb); }
    const home=el('button','btn','Naar overzicht'); home.onclick=()=>{ closeModal(); location.hash='#/'; };
    row.appendChild(home);
  } else {
    const retry=el('button','btn primary','Verder puzzelen'); retry.onclick=closeModal; row.appendChild(retry);
    const reveal=el('button','btn','Toon oplossing'); reveal.onclick=()=>{ closeModal(); if(known){ toast('De moordenaar is '+p.murderer); } openHints(); };
    row.appendChild(reveal);
  }
  wrap.appendChild(row);
  modal(wrap);
  // reflect accusation highlight in the suspect list
  document.querySelectorAll('.susp[data-name]').forEach(r=>{
    r.classList.toggle('accused', r.dataset.name===name);
  });
}
function nextId(id){ const i=PUZZLES.findIndex(p=>p.id===id); return (i>=0 && i<PUZZLES.length-1)? PUZZLES[i+1].id : null; }

/* ---------- settings ---------- */
function openSettings(){
  const wrap=el('div');
  wrap.appendChild(Object.assign(el('h2'),{textContent:'Instellingen'}));
  // theme
  const tr=el('div','settings-row');
  tr.appendChild(Object.assign(el('div'),{textContent:'Thema'}));
  const seg=el('div','seg');
  [['auto','Auto'],['light','Licht'],['dark','Donker']].forEach(([k,l])=>{
    const b=el('button',store.settings.theme===k?'on':'',l);
    b.onclick=()=>{ store.settings.theme=k; persist(); applyTheme(); openSettings(); };
    seg.appendChild(b);
  });
  tr.appendChild(seg); wrap.appendChild(tr);
  // reset
  const rr=el('div','settings-row');
  rr.appendChild(Object.assign(el('div'),{textContent:'Voortgang wissen'}));
  const rb=el('button','btn small','Wissen');
  rb.onclick=()=>{ if(confirm('Alle voortgang, tijden en onthulde zaken wissen?')){ store.solved={}; store.state={}; store.revealed={}; persist(); closeModal(); renderHome(); } };
  rr.appendChild(rb); wrap.appendChild(rr);
  // about
  wrap.appendChild(Object.assign(el('p'),{style:'margin-top:14px;font-size:13px',
    innerHTML:`${PUZZLES.length} zaken uit <i>Murdoku</i> en <i>Murdoku — Terug in de tijd</i> van Manuel Garand.`}));
  const row=el('div','row');
  const c=el('button','btn primary','Klaar'); c.onclick=closeModal; row.appendChild(c);
  wrap.appendChild(row);
  modal(wrap);
}

/* ===================== BOOT ===================== */
(async function(){
  try{
    await loadPuzzles();
  }catch(e){
    $('#app').innerHTML='<div class="wrap" style="padding-top:40px"><p>Kon puzzels niet laden.</p></div>';
    return;
  }
  router();
  if('serviceWorker' in navigator){
    // updateViaCache:'none' makes the browser always re-fetch sw.js itself
    // over the network (bypassing HTTP cache) so a new deploy is detected
    // promptly instead of silently serving the old cached app indefinitely.
    navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).then(reg=>{
      reg.update().catch(()=>{});
    }).catch(()=>{});
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(refreshed) return; refreshed = true;
      location.reload();
    });
  }
})();
