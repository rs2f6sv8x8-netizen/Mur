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
store.settings= store.settings|| { theme:'auto', unlockAll:false };
function persist(){ saveStore(store); }

/* ---------- helpers ---------- */
const $  = (s,r=document)=>r.querySelector(s);
const el = (t,cls,txt)=>{ const e=document.createElement(t); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };
function fmtTime(sec){ sec=Math.max(0,Math.floor(sec)); const m=Math.floor(sec/60), s=sec%60;
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s; }
function skulls(d){ let out=''; for(let i=1;i<=5;i++) out+= i<=d?'<span>☠</span>':'<span class="off">☠</span>'; return out; }
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

/* ---------- data ---------- */
let PUZZLES=[]; let BY_ID={};
async function loadPuzzles(){
  const res = await fetch('data/puzzles.json');
  PUZZLES = await res.json();
  PUZZLES.forEach(p=>{ BY_ID[p.id]=p; });
}

function isUnlocked(p){
  if(store.settings.unlockAll) return true;
  if(p.id===1) return true;
  return !!store.solved[p.id-1] || !!store.solved[p.id];
}
function firstUnsolved(){
  for(const p of PUZZLES){ if(!store.solved[p.id]) return p.id; }
  return PUZZLES.length ? PUZZLES[PUZZLES.length-1].id : 1;
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
let homeFilter = 'all';   // all | book1 | book2
function renderHome(){
  stopTimer();
  const app = $('#app'); app.innerHTML='';
  const total = PUZZLES.length;
  const solvedCount = Object.keys(store.solved).filter(id=>BY_ID[id]).length;
  const times = Object.values(store.solved).map(s=>s.time).filter(t=>t>0);
  const bestT = times.length ? Math.min(...times) : 0;

  const wrap = el('div','wrap');

  const hero = el('div','home-hero');
  hero.innerHTML = `<div class="tag">Moordmysterie-puzzels</div>
    <h1>Mur<span class="knife">☠</span>doku</h1>`;
  wrap.appendChild(hero);

  const pc = el('div','progress-card');
  pc.innerHTML = `
    <div class="pc-stat"><div class="pc-num">${solvedCount}<span style="color:var(--faint);font-size:16px">/${total}</span></div><div class="pc-lbl">Opgelost</div></div>
    <div class="pc-stat"><div class="pc-num">${Math.round(solvedCount/total*100)||0}%</div><div class="pc-lbl">Voortgang</div></div>
    <div class="pc-stat"><div class="pc-num">${bestT?fmtTime(bestT):'—'}</div><div class="pc-lbl">Beste tijd</div></div>
    <div class="bar"><i style="width:${(solvedCount/total*100)||0}%"></i></div>`;
  wrap.appendChild(pc);

  const tb = el('div','toolbar');
  const seg = el('div','seg');
  [['all','Alle'],['book1','Boek 1'],['book2','Boek 2']].forEach(([k,l])=>{
    const b=el('button',homeFilter===k?'on':'',l); b.onclick=()=>{ homeFilter=k; renderHome(); }; seg.appendChild(b);
  });
  tb.appendChild(seg);
  tb.appendChild(el('div','spacer'));
  const contBtn = el('button','btn primary','▸ Doorgaan');
  contBtn.onclick=()=>{ location.hash='#/play/'+firstUnsolved(); };
  tb.appendChild(contBtn);
  const setBtn = el('button','icon-btn'); setBtn.innerHTML='⚙'; setBtn.title='Instellingen';
  setBtn.onclick=openSettings; tb.appendChild(setBtn);
  wrap.appendChild(tb);

  const grid = el('div','grid-cases');
  let lastBook=null;
  PUZZLES.filter(p=> homeFilter==='all' || (homeFilter==='book1'&&p.book===1) || (homeFilter==='book2'&&p.book===2))
    .forEach(p=>{
      if(homeFilter==='all' && p.book!==lastBook){
        lastBook=p.book;
        const bh=el('div','book-head', p.book===1?'Boek 1 — Moordmysteries':'Boek 2 — Terug in de tijd');
        grid.appendChild(bh);
      }
      grid.appendChild(caseCard(p));
    });
  wrap.appendChild(grid);
  app.appendChild(wrap);
  window.scrollTo(0,0);
}

function caseCard(p){
  const unlocked = isUnlocked(p);
  const solved = store.solved[p.id];
  const c = el('button','case'+(solved?' solved':'')+(unlocked?'':' locked'));
  c.innerHTML = `<div class="no">Zaak ${p.id}</div>
    <div class="ttl">${escapeHtml(p.title||'Onbekende zaak')}</div>
    <div class="meta"><span class="skulls">${skulls(p.difficulty)}</span>
    ${solved&&solved.time?`<span class="best">${fmtTime(solved.time)}</span>`:''}</div>`;
  c.onclick=()=>{
    if(!unlocked){ toast('Los eerst zaak '+(p.id-1)+' op'); return; }
    location.hash='#/play/'+p.id;
  };
  return c;
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
  store.state[T.id] = { elapsed: currentElapsed(), cells: T.cells, accused: T.accused, hints: T.hintsShown };
  persist();
}

function renderPlay(id){
  const p = BY_ID[id];
  if(!p){ location.hash='#/'; return; }
  const saved = store.state[id] || {};
  T = {
    id, p,
    elapsed: store.solved[id]? 0 : (saved.elapsed||0),
    tickBase:null,
    cells: saved.cells || {},          // "r,c" -> letter
    accused: saved.accused || null,
    hintsShown: store.solved[id]? (p.hintSteps||[]).length : (saved.hints||0),
    selToken: null,
  };
  const app=$('#app'); app.innerHTML='';
  const view = el('div','play');

  /* top bar */
  const bar = el('div','pbar');
  const back = el('button','icon-btn'); back.innerHTML='‹'; back.onclick=()=>{ saveState(); location.hash='#/'; };
  const title = el('div','title');
  title.innerHTML = `<div class="no">Zaak ${p.id} · Boek ${p.book}</div><div class="ttl">${escapeHtml(p.title)}</div>`;
  const timer = el('div','timer run'); timer.id='timer'; timer.textContent=fmtTime(T.elapsed);
  const sk = el('div','skulls'); sk.style.fontSize='13px'; sk.innerHTML=skulls(p.difficulty);
  bar.append(back,title,sk,timer);
  view.appendChild(bar);

  /* body */
  const body = el('div','play-body');

  /* LEFT: scene + clues */
  const left = el('div');
  const sceneCard = el('div','card');
  sceneCard.appendChild(headEl('Plaats delict'));
  if(p.scene){
    const sw=el('div','scene-wrap');
    const img=el('img'); img.src='assets/scenes/'+p.scene; img.alt='Plaats delict '+p.title; img.loading='lazy';
    img.onclick=()=>openZoom('assets/scenes/'+p.scene);
    sw.appendChild(img); sw.appendChild(Object.assign(el('div','scene-hint'),{textContent:'Tik om te vergroten'}));
    sceneCard.appendChild(sw);
  }
  left.appendChild(sceneCard);

  const clueCard = el('div','card'); clueCard.style.marginTop='16px';
  clueCard.appendChild(headEl('Aanwijzingen'));
  if(p.rules && p.rules.length){
    p.rules.forEach(r=>{ const rr=el('div','rules'); rr.innerHTML='<b>!</b> '+escapeHtml(r); clueCard.appendChild(rr); });
  }
  if(p.clueBlock){
    clueCard.appendChild(Object.assign(el('div','clueblock'),{textContent:p.clueBlock}));
  }
  const susp = el('div','suspects');
  const allPeople = peopleOf(p);
  allPeople.forEach((s,i)=>{
    const row=el('div','susp'+(s.letter==='V'?' victim':'')+(T.accused===s.name?' accused':''));
    row.dataset.name=s.name;
    const b=el('div','badge'); b.style.background=suspColor(s.letter,i); b.textContent=s.letter;
    const who=el('div','who');
    who.innerHTML=`<div class="nm">${escapeHtml(s.name)}</div>`+(s.clue?`<div class="cl">${escapeHtml(s.clue)}</div>`:'');
    row.append(b,who);
    susp.appendChild(row);
  });
  clueCard.appendChild(susp);
  clueCard.appendChild(Object.assign(el('div','lang-note'),{textContent:'Aanwijzingen in het Nederlands, zoals in het boek.'}));
  left.appendChild(clueCard);
  body.appendChild(left);

  /* RIGHT: scratch grid */
  const right = el('div');
  const gcard = el('div','card');
  gcard.appendChild(headEl('Kladraster'));
  const tools=el('div','grid-tools');
  tools.innerHTML=`<span class="mini">Plaats verdachten in rij/kolom om te redeneren. Kies een letter en tik op een vak.</span>`;
  gcard.appendChild(tools);
  const board=el('div','board'); board.id='board';
  gcard.appendChild(board);
  const palette=el('div','palette'); palette.id='palette';
  gcard.appendChild(palette);
  if(p.solution){
    const cr=el('div','check-row');
    const chk=el('button','btn small','✓ Controleer raster');
    chk.onclick=checkGrid;
    const rev=el('button','btn small ghost','Toon oplossing');
    rev.onclick=()=>{ if(confirm('De volledige oplossing tonen in het raster?')){ revealSolution(); } };
    cr.append(chk,rev);
    gcard.appendChild(cr);
    gcard.appendChild(Object.assign(el('div','mini'),{style:'margin-top:8px',
      textContent:'Deze zaak heeft een gecontroleerde oplossing: plaats iedereen en controleer je raster.'}));
  }
  right.appendChild(gcard);
  body.appendChild(right);

  view.appendChild(body);

  /* action bar */
  const ab=el('div','actionbar');
  const abw=el('div','wrapb');
  const hintBtn=el('button','btn','💡 Hint');
  hintBtn.onclick=openHints;
  const clearBtn=el('button','btn','⌫ Wis raster');
  clearBtn.onclick=()=>{ T.cells={}; renderBoard(); saveState(); };
  const accuseBtn=el('button','btn primary','⚖ Beschuldig');
  accuseBtn.onclick=openAccuse;
  abw.append(hintBtn,clearBtn,accuseBtn);
  ab.appendChild(abw);
  view.appendChild(ab);

  app.appendChild(view);
  renderBoard(); renderPalette();
  if(!store.solved[id]) startTimer();
  window.scrollTo(0,0);
}

function headEl(t){ const h=el('h3'); h.textContent=t; return h; }
function peopleOf(p){
  const arr = (p.suspects||[]).slice();
  if(p.victim) arr.push(p.victim);
  return arr;
}

/* ----- scratch board ----- */
function gridSize(p){ return Math.max(2, Math.min(14, p.n||peopleOf(p).length)); }
function renderBoard(){
  const p=T.p, n=gridSize(p);
  const board=$('#board'); if(!board) return;
  // responsive cell size
  const avail = Math.min(board.clientWidth||360, 460) - 26;
  const cell = Math.max(30, Math.min(52, Math.floor(avail/n)));
  const tbl=el('table'); tbl.style.setProperty('--cell', cell+'px');
  const head=el('tr'); head.appendChild(el('th',''));
  for(let c=1;c<=n;c++) head.appendChild(el('th','', String(c)));
  tbl.appendChild(head);
  const people=peopleOf(p);
  for(let r=1;r<=n;r++){
    const tr=el('tr'); tr.appendChild(el('th','', String(r)));
    for(let c=1;c<=n;c++){
      const key=r+','+c; const td=el('td');
      td.style.setProperty('--cell',cell+'px');
      const letter=T.cells[key];
      if(letter){
        const idx=people.findIndex(x=>x.letter===letter);
        td.classList.add('filled'); td.textContent=letter;
        td.style.background=suspColor(letter, idx<0?0:idx);
      }
      td.onclick=()=>onCell(r,c);
      tr.appendChild(td);
    }
    tbl.appendChild(tr);
  }
  board.innerHTML=''; board.appendChild(tbl);
}
function onCell(r,c){
  const key=r+','+c;
  if(T.selToken===null){ toast('Kies eerst een verdachte hieronder'); return; }
  if(T.selToken==='ERASE'){ delete T.cells[key]; }
  else if(T.cells[key]===T.selToken){ delete T.cells[key]; }
  else {
    // remove this token elsewhere (one token appears once)
    for(const k of Object.keys(T.cells)) if(T.cells[k]===T.selToken) delete T.cells[k];
    T.cells[key]=T.selToken;
  }
  renderBoard(); saveState();
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
function checkGrid(){
  const sol=T.p.solution; if(!sol) return;
  const board=$('#board'); if(!board) return;
  // clear marks
  board.querySelectorAll('td').forEach(td=>td.classList.remove('ok','bad'));
  // map solution letter -> [r,c]; mark each filled cell
  const solPos={}; for(const L in sol) solPos[L]=sol[L][0]+','+sol[L][1];
  let correct=0, placed=0;
  board.querySelectorAll('td').forEach(td=>{});
  // iterate rows/cols
  const rows=board.querySelectorAll('tr');
  for(let r=1;r<rows.length;r++){
    const tds=rows[r].querySelectorAll('td');
    for(let c=1;c<=tds.length;c++){
      const td=tds[c-1]; const key=r+','+c; const L=T.cells[key];
      if(!L) continue; placed++;
      if(solPos[L]===key){ td.classList.add('ok'); correct++; }
      else td.classList.add('bad');
    }
  }
  const total=Object.keys(sol).length;
  if(placed===0) toast('Plaats eerst verdachten in het raster');
  else if(correct===total) toast('Perfect! Alle '+total+' juist geplaatst ✓');
  else toast(correct+' van '+total+' juist geplaatst');
}
function revealSolution(){
  const sol=T.p.solution; if(!sol) return;
  T.cells={};
  for(const L in sol){ T.cells[sol[L][0]+','+sol[L][1]]=L; }
  renderBoard(); saveState();
  setTimeout(checkGrid,30);
}
function renderPalette(){
  const pal=$('#palette'); if(!pal) return; pal.innerHTML='';
  const people=peopleOf(T.p);
  people.forEach((s,i)=>{
    const chip=el('button','pchip'+(T.selToken===s.letter?' on':''));
    chip.innerHTML=`<span class="dot" style="background:${suspColor(s.letter,i)}">${s.letter}</span>${escapeHtml(s.name)}`;
    chip.onclick=()=>{ T.selToken = T.selToken===s.letter?null:s.letter; renderPalette(); };
    pal.appendChild(chip);
  });
  const er=el('button','pchip erase'+(T.selToken==='ERASE'?' on':'')); er.textContent='⌫ Wissen';
  er.onclick=()=>{ T.selToken = T.selToken==='ERASE'?null:'ERASE'; renderPalette(); };
  pal.appendChild(er);
}
window.addEventListener('resize', ()=>{ if(T && $('#board')) renderBoard(); });

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

function openHints(){
  const p=T.p;
  const wrap=el('div');
  wrap.appendChild(Object.assign(el('h2'),{textContent:'Hints'}));
  wrap.appendChild(Object.assign(el('p'),{textContent:'Onthul stap voor stap de redenering uit het boek.'}));
  const list=el('div');
  const steps = (p.hintSteps&&p.hintSteps.length)? p.hintSteps : genericHints(p);
  function draw(){
    list.innerHTML='';
    const show=Math.min(T.hintsShown, steps.length);
    for(let i=0;i<show;i++){
      const d=el('div','hint-step'); d.innerHTML=`<span class="n">${i+1}.</span>${escapeHtml(steps[i])}`;
      list.appendChild(d);
    }
    if(show===0){ list.appendChild(Object.assign(el('p'),{textContent:'Nog geen hints onthuld.'})); }
  }
  draw();
  wrap.appendChild(list);
  const row=el('div','row');
  const more=el('button','btn primary', T.hintsShown>=steps.length?'Alles onthuld':'Onthul volgende hint');
  more.disabled = T.hintsShown>=steps.length;
  more.onclick=()=>{ T.hintsShown=Math.min(T.hintsShown+1,steps.length); saveState(); draw();
    more.disabled=T.hintsShown>=steps.length; if(more.disabled) more.textContent='Alles onthuld'; };
  const close=el('button','btn','Sluiten'); close.onclick=closeModal;
  row.append(close,more);
  wrap.appendChild(row);
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
    const b=el('button','susp'); b.style.cursor='pointer';
    const badge=el('div','badge'); badge.style.background=suspColor(s.letter,i); badge.textContent=s.letter;
    const who=el('div','who'); who.innerHTML=`<div class="nm">${escapeHtml(s.name)}</div>`;
    b.append(badge,who);
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

function showResult(correct, name, time, known){
  const p=T.p;
  const wrap=el('div');
  const emo = el('div','result-emoji'); emo.textContent = correct? (known?'🕵️':'📝') : '❌';
  wrap.appendChild(emo);
  if(correct && known){
    wrap.appendChild(Object.assign(el('h2'),{textContent:'Zaak opgelost!'}));
    let extra='';
    const ps = placementStatus();
    if(ps){
      extra = ps.allCorrect
        ? `<br><span class="solved-pill">★ Perfect raster — iedereen juist geplaatst</span>`
        : `<br><span style="color:var(--muted);font-size:13px">Raster: ${ps.correct}/${ps.total} juist geplaatst</span>`;
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
  // unlock all
  const ur=el('div','settings-row');
  ur.appendChild(Object.assign(el('div'),{innerHTML:'Alle zaken ontgrendelen<br><span style="color:var(--muted);font-size:13px">Speel in willekeurige volgorde</span>'}));
  const tgl=el('button','btn small', store.settings.unlockAll?'Aan':'Uit');
  tgl.onclick=()=>{ store.settings.unlockAll=!store.settings.unlockAll; persist(); openSettings(); };
  ur.appendChild(tgl); wrap.appendChild(ur);
  // reset
  const rr=el('div','settings-row');
  rr.appendChild(Object.assign(el('div'),{textContent:'Voortgang wissen'}));
  const rb=el('button','btn small','Wissen');
  rb.onclick=()=>{ if(confirm('Alle voortgang en tijden wissen?')){ store.solved={}; store.state={}; persist(); closeModal(); renderHome(); } };
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
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
})();
