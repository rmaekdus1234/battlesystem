(() => {
"use strict";
const $=id=>document.getElementById(id);
const clone=x=>JSON.parse(JSON.stringify(x));
const KEY="battleDesk.custom.v8";
const LEGACY_KEYS=["battleDesk.custom.v6","battleDesk.custom.v5","battleDesk.custom.v4","battleDesk.custom.v3"];
const DEFAULT_STATS=[
 {id:"hp",name:"체력(HP)",type:"number",role:"hp",defaults:[100,120,140,160,180],evasion:[100,100,100,100,100],escape:[100,100,100,100,100]},
 {id:"atk",name:"공격(ATK)",type:"dice",role:"attack",defaults:["1d4","1d6","1d8","1d10","2d6"],evasion:[0,0,0,0,0],escape:[0,0,0,0,0]},
 {id:"def",name:"방어(DEF)",type:"number",role:"defense",defaults:[10,20,30,40,50],evasion:[0,0,0,0,0],escape:[0,0,0,0,0]},
 {id:"agi",name:"민첩(AGI)",type:"number",role:"agility",defaults:[5,15,25,35,45],evasion:[5,15,25,35,45],escape:[5,15,25,35,45]},
 {id:"luck",name:"행운(LUK)",type:"number",role:"luck",defaults:[5,7,9,10,11],evasion:[0,0,0,0,0],escape:[0,0,0,0,0]},
 {id:"heal",name:"치유(HEAL)",type:"number",role:"heal",defaults:["10","1d6+2","2d6","2d8+2","3d8"],evasion:[0,0,0,0,0],escape:[0,0,0,0,0]}
];
let stats=clone(DEFAULT_STATS), library=[], roster=[], logs=[], history=[], currentId=null, pending=null, started=false, mode="speed", libraryFilter="all", factionNames={A:"A 진영",B:"B 진영"}, toastTimer;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const makeId=prefix=>prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const get=(arr,x)=>arr.find(c=>c.id===x);
const alive=c=>!!c&&!c.dead&&!c.escaped;
const stat=(c,role)=>stats.find(s=>s.role===role);
const rowCount=()=>Math.max(1,...stats.map(s=>s.defaults.length));

function snapshot(){return clone({stats,library,roster,logs,currentId,pending,started,mode,factionNames});}
function save(){
 try{
  const payload=JSON.stringify(snapshot());
  localStorage.setItem(KEY,payload);
  // 구버전 저장 키가 남아 있어도 현재 버전의 저장 상태를 우선합니다.
  const check=localStorage.getItem(KEY);
  if(check!==payload)throw new Error("localStorage 검증 실패");
  const el=$("save-indicator");if(el)el.textContent="저장됨";
  return true;
 }catch(e){console.error("캐릭터/전투 데이터 저장 실패",e);const el=$("save-indicator");if(el)el.textContent="저장 실패";return false;}
}
function load(){
 try{
  let raw=localStorage.getItem(KEY);
  if(!raw){for(const legacy of LEGACY_KEYS){const old=localStorage.getItem(legacy);if(old){raw=old;break;}}}
  if(!raw){stats=clone(DEFAULT_STATS);return;}
  const d=JSON.parse(raw);
  stats=normalizeStats(d.stats||clone(DEFAULT_STATS)); library=Array.isArray(d.library)?d.library:[]; roster=Array.isArray(d.roster)?d.roster:[];
  logs=Array.isArray(d.logs)?d.logs:[]; currentId=d.currentId||null; pending=d.pending||null; started=!!d.started; mode=d.mode||"speed"; factionNames={A:d.factionNames?.A||"A 진영",B:d.factionNames?.B||"B 진영"}; 
  migrateCharacters();
 }catch(e){console.warn("저장 데이터 불러오기 실패",e);}
}
function normalizeStats(source){
 const old=Array.isArray(source)?source:[];
 const result=clone(DEFAULT_STATS);
 // 기본 5개 능력치는 저장 데이터가 망가졌거나 비어 있어도 기본값을 복구합니다.
 result.forEach((target)=>{
  const saved=old.find(s=>s && (s.role===target.role || s.id===target.id));
  if(!saved)return;
  const vals=Array.isArray(saved.defaults)?saved.defaults.filter(v=>v!==undefined && v!==null):[];
  // 기본값은 항상 최소 5줄을 유지하고, 사용자가 추가한 단계는 뒤에 보존합니다.
  if(vals.length>=5)target.defaults=vals.slice(0,100);
  else if(vals.length>0)target.defaults=target.defaults.map((v,i)=>vals[i]!==undefined?vals[i]:v);
  target.evasion=Array.isArray(saved.evasion)?saved.evasion.slice(0,100):Array.from({length:target.defaults.length},(_,i)=>target.defaults[i]);
  target.escape=Array.isArray(saved.escape)?saved.escape.slice(0,100):Array.from({length:target.defaults.length},(_,i)=>target.defaults[i]);
  while(target.evasion.length<target.defaults.length)target.evasion.push(target.evasion[target.evasion.length-1]??target.defaults[target.evasion.length-1]??0);
  while(target.escape.length<target.defaults.length)target.escape.push(target.escape[target.escape.length-1]??target.defaults[target.escape.length-1]??0);
 });
 const n=Math.max(5,...result.map(s=>s.defaults.length));
 result.forEach(s=>{while(s.defaults.length<n)s.defaults.push(s.defaults[s.defaults.length-1]??"");});
 return result;
}
function migrateCharacters(){
 [...library,...roster].forEach(c=>{
  if(c.team!=="A"&&c.team!=="B")c.team="A";
  c.levels=c.levels||{}; c.values=c.values||{};
  stats.forEach(s=>{
   let value=c.values[s.id]; let idx=Number(c.levels[s.id]);
   if(!Number.isFinite(idx)||idx<1)idx=levelFromValue(s,value);
   idx=clamp(idx,1,s.defaults.length); c.levels[s.id]=idx;
   c.values[s.id]=getStatValue(s,idx);
  });
  syncHp(c,true);
 });
}
function levelFromValue(s,value){const i=s.defaults.findIndex(v=>String(v)===String(value));return i>=0?i+1:1;}
function getStatValue(s,level){return s?.defaults?.[clamp(Number(level)||1,1,s.defaults.length)-1]??"";}
function getCharacterStat(c,s){return clamp(Number(c.levels?.[s.id]??levelFromValue(s,c.values?.[s.id])),1,s.defaults.length);}
function parseExpression(expr){const raw=String(expr??"0").trim().replace(/\s+/g,"");const m=raw.match(/^(\d+)d(\d+)([+-]\d+(?:\.\d+)?)?$/i);if(m)return {kind:"dice",raw,n:+m[1],sides:+m[2],bonus:+(m[3]||0)};if(/^[-+]?\d+(?:\.\d+)?%$/.test(raw))return {kind:"percent",raw,value:parseFloat(raw)};const num=Number(raw);return {kind:"number",raw,value:Number.isFinite(num)?num:0};}
function getVal(c,role){const s=stat(c,role);return s?c.values?.[s.id]:0;}
function resolveStat(c,role,{percentBase=0,allowDice=true}={}){const expr=getVal(c,role),p=parseExpression(expr);if(p.kind==="dice"&&allowDice){const r=roll(p.raw);return {value:r.value,desc:r.desc,kind:p.kind};}if(p.kind==="percent")return {value:percentBase*p.value/100,percent:p.value,desc:`${p.raw} → ${percentBase*p.value/100}`,kind:p.kind};return {value:p.value,desc:`${p.raw} → ${p.value}`,kind:p.kind};}
function syncHp(c,preserve=true){const s=stat(c,"hp");c.maxHp=Math.max(1,Number(c.values?.[s?.id])||100);if(!preserve||c.curHp===undefined)c.curHp=c.maxHp;c.curHp=clamp(Number(c.curHp)||0,0,c.maxHp);}
function syncCharacter(c,preserveHp=true){c.levels=c.levels||{};c.values=c.values||{};stats.forEach(s=>{const lv=clamp(Number(c.levels[s.id])||1,1,s.defaults.length);c.levels[s.id]=lv;c.values[s.id]=getStatValue(s,lv);});syncHp(c,preserveHp);}
function snap(){history.push(snapshot());if(history.length>50)history.shift();}
function toast(t){const el=$("toast");el.textContent=t;el.classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("visible"),2200);}
function log(t,type="normal"){logs.push({time:new Date().toLocaleTimeString("ko-KR"),message:t,type});if(logs.length>1000)logs=logs.slice(-1000);renderLogs();}
function roll(expr){const s=String(expr??"0").trim().toLowerCase().replace(/\s/g,"");const m=s.match(/^(\d+)d(\d+)([+-]\d+(?:\.\d+)?)?$/);if(m){const n=clamp(+m[1],1,100),sides=clamp(+m[2],1,10000),r=Array.from({length:n},()=>1+Math.floor(Math.random()*sides)),bonus=+(m[3]||0),sum=r.reduce((a,b)=>a+b,0)+bonus;return{value:sum,desc:`${expr} → [${r.join(", ")}]${bonus?` ${bonus>0?"+":""}${bonus}`:""} = ${sum}`};}const n=Number(s);return{value:Number.isFinite(n)?n:0,desc:`${expr} → ${Number.isFinite(n)?n:0}`};}

function factionName(team){return factionNames[team]||team;}
function teamLabel(team){return esc(factionName(team));}
function renderFactionControls(){
 const a=$("faction-a"),b=$("faction-b");if(a)a.value=factionNames.A;if(b)b.value=factionNames.B;
 document.querySelectorAll("[data-filter=\"A\"]").forEach(b=>b.textContent=factionNames.A);document.querySelectorAll("[data-filter=\"B\"]").forEach(b=>b.textContent=factionNames.B);document.querySelectorAll("[data-library-filter=\"A\"]").forEach(b=>b.textContent=factionNames.A);document.querySelectorAll("[data-library-filter=\"B\"]").forEach(b=>b.textContent=factionNames.B);
 const sel=$("char-team");if(sel)Array.from(sel.options).forEach(o=>{if(o.value==="A")o.textContent=factionNames.A;if(o.value==="B")o.textContent=factionNames.B;});
}
function renderStats(){
 const n=rowCount();
 $("mapping-head").innerHTML=`<tr><th>스탯</th>${stats.map(s=>`<th>${esc(s.name)}${s.role!=="hp"?` <button title="이 능력치 열 삭제" data-remove-stat="${s.id}">×</button>`:""}</th>`).join("")}<th>회피</th><th>도주</th></tr>`;
 $("mapping-body").innerHTML=Array.from({length:n},(_,i)=>`<tr><th>${i+1}</th>${stats.map(s=>`<td><input aria-label="스탯 ${i+1} ${esc(s.name)}" data-stat="${s.id}" data-row="${i}" value="${esc(s.defaults[i]??"")}" type="text"></td>`).join("")}<td><input type="number" min="0" data-rule="evasion" data-row="${i}" value="${esc(stats.find(s=>s.role==="agility")?.evasion?.[i]??stats.find(s=>s.role==="agility")?.defaults?.[i]??0)}"></td><td><input type="number" min="0" data-rule="escape" data-row="${i}" value="${esc(stats.find(s=>s.role==="agility")?.escape?.[i]??stats.find(s=>s.role==="agility")?.defaults?.[i]??0)}"></td></tr>`).join("");
 $("custom-stat-fields").innerHTML=stats.map(s=>`<label>${esc(s.name)} <span>스탯 1~${n}</span><input class="wide-input" data-character-stat="${s.id}" type="number" min="1" max="${n}" step="1" value="1" required></label>`).join("");
}
function setFormFromCharacter(c){
 $("cancel-character-edit").hidden=false;$("char-name").value=c.name;$("char-team").value=c.team;stats.forEach(s=>{const el=$(`[data-character-stat="${s.id}"]`);if(el)el.value=getCharacterStat(c,s);});$("character-form").dataset.edit=c.id;$("character-form").querySelector('button[type="submit"]').textContent="✓ 캐릭터 수정 저장";toast("캐릭터 정보를 불러왔습니다.");
}
function resetCharacterForm(){
 $("character-form").reset();$("character-form").removeAttribute("data-edit");$("character-form").querySelector('button[type="submit"]').textContent="＋ 전체 캐릭터에 저장";$("cancel-character-edit").hidden=true;renderStats();
}
function renderLibrary(){
 const filteredLibrary=library.filter(c=>libraryFilter==="all"||c.team===libraryFilter);
 $("library-count").textContent=library.length;
 $("library-list").innerHTML=filteredLibrary.length?filteredLibrary.map(c=>{const inRoster=roster.some(r=>r.libraryId===c.id);return `<article class="library-card team-${c.team}"><label class="library-check"><input type="checkbox" data-library-check="${c.id}" ${inRoster?"disabled":""}><span></span></label><div class="library-card-main"><div class="card-top"><div class="avatar">${esc(c.name.slice(0,2))}</div><div class="card-title"><h4>${esc(c.name)}</h4><p>${teamLabel(c.team)}${inRoster?" · 전투 참가 중":""}</p></div></div><div class="library-stat-grid">${stats.map(s=>`<div class="library-stat"><small>${esc(s.name)}</small><b>${esc(getCharacterStat(c,s))}</b></div>`).join("")}</div></div><div class="library-card-actions"><button class="button button-secondary" data-lib-edit="${c.id}">수정</button><button class="button button-quiet" data-lib-delete="${c.id}">삭제</button></div></article>`;}).join(""):'<div class="empty-state"><h3>저장된 캐릭터가 없습니다</h3><p>위에서 캐릭터를 등록하세요.</p></div>';
}

function renderLogs(){$("log-count").textContent=logs.length;$("log-container").innerHTML=logs.length?logs.map(x=>`<div class="log-entry ${esc(x.type)}"><span class="log-time">${esc(x.time)}</span><span class="log-message">${esc(x.message)}</span></div>`).join(""):'<div class="log-empty">전투 기록이 여기에 쌓입니다.</div>';$(`log-container`).scrollTop=$(`log-container`).scrollHeight;}
function render(){
 renderFactionControls();
 renderLibrary();$("character-count").textContent=roster.length;$("battle-status").innerHTML=`<i></i> ${started?"전투 진행 중":"대기 중"}`;$("battle-status").classList.toggle("active",started);const cur=get(roster,currentId);
 $("turn-title").textContent=started?(cur?`${cur.name}의 차례`:"전투 종료"):"전투를 시작할 준비가 되었어요";$("turn-subtitle").textContent=started?(pending?`${get(roster,pending.targetId)?.name||"대상"}의 반응을 기다리는 중`:"행동을 선택하거나 차례를 넘기세요."):"전체 캐릭터를 만든 뒤 전투 인원으로 편성하세요.";
 $("next-turn").disabled=!started||!!pending||!cur;$("undo").disabled=!history.length;
 const list=roster;
 $("character-list").innerHTML=list.length?list.map(c=>{
  const current=started&&c.id===currentId&&!pending,target=pending?.targetId===c.id,inactive=!alive(c),pct=clamp(c.curHp/c.maxHp*100,0,100);let actions="";
  if(current&&alive(c)){actions+=roster.filter(t=>t.id!==c.id&&alive(t)&&canTarget(c,t)).map(t=>`<button class="button button-attack" data-act="attack" data-id="${c.id}" data-target="${t.id}">공격 · ${esc(t.name)}</button>`).join("");actions+=roster.filter(t=>alive(t)&&canTarget(c,t)).map(t=>`<button class="button button-heal" data-act="heal" data-id="${c.id}" data-target="${t.id}">회복 · ${esc(t.name)}</button>`).join("");actions+=`<button class="button button-secondary" data-act="skip" data-id="${c.id}">차례 넘김</button><button class="button button-escape" data-act="escape" data-id="${c.id}">도주</button>`;}
  const reactions=target?`<div class="reaction-box"><strong>⚑ 반응 선택</strong><p>${esc(get(roster,pending.attackerId)?.name||"상대")}의 공격입니다.</p><div class="reaction-actions"><button class="button button-secondary" data-act="react" data-reaction="defense" data-id="${c.id}">방어</button><button class="button button-secondary" data-act="react" data-reaction="counter" data-id="${c.id}">반격</button><button class="button button-secondary" data-act="react" data-reaction="evasion" data-id="${c.id}">회피</button><button class="button button-quiet" data-act="react" data-reaction="none" data-id="${c.id}">무대응</button></div></div>`:"";
  return `<article class="character-card team-${c.team} ${current?"current-turn":""} ${target?"targeting":""} ${inactive?"inactive":""} ${c.dead?"dead":""}"><button class="card-delete" title="전투 인원에서 제외" data-act="remove-roster" data-id="${c.id}">×</button><button class="card-edit" title="캐릭터 스탯 수정" data-act="edit-roster" data-id="${c.id}">✎</button><div class="card-top"><div class="avatar">${esc(c.name.slice(0,2))}</div><div class="card-title"><h4>${esc(c.name)}${c.dead?'<span class="card-status">사망</span>':c.escaped?'<span class="card-status">도주</span>':""}</h4><p>${current?"현재 차례":inactive?"행동 불가":teamLabel(c.team)}</p><span class="team-tag">${teamLabel(c.team)}</span></div></div><div class="hp-meta"><span>체력</span><strong>${c.curHp} / ${c.maxHp}</strong></div><div class="hp-track"><div class="hp-fill ${pct<25?"low":""}" style="width:${pct}%"></div></div><div class="stat-chips">${stats.filter(s=>s.role!=="hp").map(s=>`<span class="stat-chip">${esc(s.name)} <b>${getCharacterStat(c,s)}</b></span>`).join("")}</div>${actions?`<div class="card-actions">${actions}</div>`:""}${reactions}</article>`;
 }).join(""):'<div class="empty-state"><div class="empty-icon">✦</div><h3>전투 인원이 없습니다</h3><p>전체 캐릭터 목록에서 참가자를 추가하세요.</p></div>';
 renderLogs();save();
}
function canTarget(a,b){const A=roster.some(c=>c.team==="A"),B=roster.some(c=>c.team==="B");return !(A&&B)||a.team!==b.team;}
function createCharacter(e){
 e.preventDefault();
 const name=$("char-name").value.trim();if(!name){toast("이름을 입력하세요.");return;}
 const levels={},values={};const n=rowCount();
 for(const s of stats){const el=document.querySelector(`[data-character-stat="${s.id}"]`);const raw=el?.value?.trim();const parsed=Number.parseInt(raw,10);const lv=clamp(Number.isFinite(parsed)?parsed:1,1,n);levels[s.id]=lv;values[s.id]=getStatValue(s,lv);}
 const editId=$("character-form").dataset.edit;
 snap();
 if(editId){
  const c=get(library,editId);if(!c){history.pop();toast("수정할 캐릭터를 찾지 못했습니다.");return;}
  c.name=name;c.team=$("char-team").value;c.levels=clone(levels);c.values=clone(values);syncCharacter(c,true);
  roster.filter(r=>r.libraryId===editId).forEach(r=>{const oldHp=r.curHp;r.name=c.name;r.team=c.team;r.levels=clone(levels);r.values=clone(values);syncCharacter(r,true);r.curHp=clamp(oldHp,0,r.maxHp);if(r.curHp<=0)r.dead=true;});
  
 }else{
  const hp=stat(null,"hp");const maxHp=Math.max(1,Number(values[hp.id])||100);const c={id:makeId("c"),name,team:$("char-team").value,levels,values,maxHp,curHp:maxHp,dead:false,escaped:false};library.push(c);
 }
 resetCharacterForm();render();toast(editId?"캐릭터 수정이 저장되었습니다.":"캐릭터가 저장되었습니다.");
}
function editCharacter(cid){const c=get(library,cid);if(c)setFormFromCharacter(c);}
function editRoster(cid){const r=get(roster,cid);if(!r)return;const base=get(library,r.libraryId);if(base)setFormFromCharacter(base);}
function addRoster(){const ids=[...document.querySelectorAll("[data-library-check]:checked")].map(x=>x.dataset.libraryCheck);if(!ids.length){toast("전투에 추가할 캐릭터를 선택하세요.");return;}const selected=ids.map(id=>get(library,id)).filter(Boolean).filter(c=>!roster.some(r=>r.libraryId===c.id));if(!selected.length){toast("선택한 캐릭터가 이미 전투 인원에 있습니다.");return;}snap();selected.forEach(c=>{syncCharacter(c,true);roster.push({...clone(c),id:makeId("r"),libraryId:c.id,curHp:c.maxHp,dead:false,escaped:false});});render();toast(`${selected.length}명의 캐릭터를 전투 인원에 추가했습니다.`);}
function resolveRuleRoll(c,kind){
 const ag=agility(c);
 const s=stat(c,"agility");
 const table=kind==="evasion"?s?.evasion:s?.escape;
 const threshold=Math.max(0,Number(table?.[Math.max(0,agilityLevel(c)-1)])||0);
 const rollValue=1+Math.floor(Math.random()*100);
 return {roll:rollValue,max:100,threshold,success:rollValue<=threshold};
}
function agilityLevel(c){const s=stat(c,"agility");return getCharacterStat(c,s);}
function agility(c){const s=stat(c,"agility");const n=Number(c.values?.[s?.id]);return Number.isFinite(n)?n:0;}
// 민첩 대항: 양쪽이 자신의 AGI 범위에서 1회 굴림(1~AGI), 높은 값 승리. 동률은 재굴림.
function contest(a,b){let guard=0;while(guard++<100){const aa=Math.max(1,agility(a)),bb=Math.max(1,agility(b));const ra=1+Math.floor(Math.random()*aa),rb=1+Math.floor(Math.random()*bb);log(`민첩 대항: ${a.name} ${ra}/${aa} vs ${b.name} ${rb}/${bb}`);if(ra!==rb)return ra>rb?a.id:b.id;}return agility(a)>=agility(b)?a.id:b.id;}
function sortByAgility(){roster.sort((a,b)=>agility(b)-agility(a));}
function rollInitiative(){const act=roster.filter(alive);if(act.length===1)return act[0].id;let winner=act[0];for(let i=1;i<act.length;i++){const c=act[i];if(agility(c)===agility(winner))winner=get(roster,contest(winner,c));}return winner.id;}
function startBattle(){if(!roster.length){toast("전투 인원을 먼저 편성하세요.");return;}snap();started=true;pending=null;mode=$("initiative-mode").value;if(mode==="speed"){sortByAgility();let i=0;while(i<roster.length-1&&agility(roster[i])===agility(roster[i+1])){const w=contest(roster[i],roster[i+1]);if(w===roster[i+1].id){const tmp=roster[i];roster[i]=roster[i+1];roster[i+1]=tmp;}i++;}currentId=roster.find(alive)?.id;log("⚔ 전투 시작 · 민첩순. 민첩 동률만 대항 판정합니다.","system");}else{currentId=rollInitiative();log("⚔ 전투 시작 · 전체 생존자가 민첩 대항으로 선공을 결정합니다.","system");}log(`첫 차례: ${get(roster,currentId)?.name||"없음"}`);render();}
function startAttack(aid,tid){const a=get(roster,aid),t=get(roster,tid);if(!started||!a||!t||aid!==currentId||!alive(a)||!alive(t))return;snap();pending={attackerId:aid,targetId:tid};log(`${a.name} → ${t.name} 공격 선언`);render();}
function luck(c){const s=stat(c,"luck");const n=Number(c.values?.[s?.id]);return Number.isFinite(n)?Math.max(0,n):0;}
function criticalRoll(c){
 const rollValue=1+Math.floor(Math.random()*100);
 const chance=luck(c);
 if(rollValue<=3)return {roll:rollValue,chance,multiplier:2,label:"대성공"};
 if(rollValue>=98)return {roll:rollValue,chance,multiplier:0.5,label:"대실패"};
 if(rollValue<=chance)return {roll:rollValue,chance,multiplier:1.5,label:"크리티컬"};
 return {roll:rollValue,chance,multiplier:1,label:"일반"};
}
function applyCritical(value,c,kind){
 const cr=criticalRoll(c);
 const result=Math.round(value*cr.multiplier);
 log(`${c.name} ${kind} 크리티컬 판정: 1d100=${cr.roll} / 확률 ${cr.chance}% → ${cr.label} (${cr.multiplier}배)`,cr.multiplier===1?"normal":cr.multiplier>1?"important":"damage");
 return {value:result,critical:cr};
}
function applyDamage(c,amount,label){const before=c.curHp;c.curHp=clamp(c.curHp-Math.max(0,Math.round(amount)),0,c.maxHp);log(`${c.name} ${label}: ${before-c.curHp} 피해 (HP ${before} → ${c.curHp})`,"damage");if(c.curHp<=0){c.dead=true;log(`${c.name} 전투 불능`,"important");}}
function evasionCheck(c){return resolveRuleRoll(c,"evasion");}
function escapeCheck(c){return resolveRuleRoll(c,"escape");}
function react(defenderId,reaction){
 if(!pending||pending.targetId!==defenderId)return;
 const a=get(roster,pending.attackerId),d=get(roster,defenderId);if(!a||!d)return;
 const action=pending;pending=null;
 const atk=resolveStat(a,"attack");
 let attack=Math.max(0,atk.value);
 // 반격은 크리티컬을 적용하지 않습니다.
 if(reaction!=="counter"){
  const crit=applyCritical(attack,a,"공격");
  attack=crit.value;
 }
 log(`${a.name} 공격 굴림: ${atk.desc}${reaction==="counter"?" · 반격이므로 크리티컬 제외":""}`);
 if(reaction==="defense"){
  const basePct=clamp(Number(resolveStat(d,"defense").value)||0,0,100);
  const crit=applyCritical(basePct,d,"방어");
  const pct=clamp(crit.value,0,100),block=Math.round(attack*pct/100);
  log(`${d.name} 방어: ${basePct}% → 적용 ${pct}% → ${block} 피해 경감`);
  applyDamage(d,attack-block,"방어 후");
 }else if(reaction==="counter"){
  const pct=clamp(Number(resolveStat(d,"defense").value)||0,0,100),counter=Math.round(attack*pct/100);
  log(`${d.name} 반격: 방어 ${pct}% → ${counter} 피해 경감 및 반사 피해 ${counter}`);
  applyDamage(d,attack-counter,"반격 후");if(alive(a))applyDamage(a,counter,"반격 피해");
 }else if(reaction==="evasion"){
  const r=evasionCheck(d);log(`${d.name} 회피 판정: 1d100=${r.roll} ≤ ${r.threshold} → ${r.success?"성공":"실패"}`);if(r.success)log(`${d.name} 회피 성공`,"important");else applyDamage(d,attack,"회피 실패 후");
 }else applyDamage(d,attack,"피해");
 const winner=checkVictory();if(winner){started=false;currentId=null;render();return;}advanceTurn(action.attackerId);
}
function healAction(cid,tid){const c=get(roster,cid),t=get(roster,tid);if(!started||!c||!t||cid!==currentId||!alive(c)||!alive(t))return;snap();const r=resolveStat(c,"heal",{percentBase:t.maxHp});const before=t.curHp;const amount=Math.max(0,Math.round(r.value));t.curHp=clamp(t.curHp+amount,0,t.maxHp);const actual=t.curHp-before;log(`${c.name} → ${t.name} 치유: ${r.desc} / 실제 회복 ${actual} (HP ${before} → ${t.curHp})`,"heal");advanceTurn(cid);}
function escape(cid){const c=get(roster,cid);if(!c)return;snap();const r=escapeCheck(c);log(`${c.name} 도주 판정: 1d100=${r.roll} ≤ ${r.threshold} → ${r.success?"성공":"실패"}`);if(r.success){c.escaped=true;log(`${c.name} 도주 성공`,"important");}else log(`${c.name} 도주 실패`);log(`▶ 도주 판정으로 ${c.name}의 차례 소모`);const w=checkVictory();if(w){started=false;currentId=null;render();}else advanceTurn(cid);}
function advanceTurn(from){const active=roster.filter(alive);if(!active.length){started=false;currentId=null;render();return;}if(mode==="contest-each")currentId=rollInitiative();else{sortByAgility();const idx=roster.findIndex(c=>c.id===from);for(let i=1;i<=roster.length;i++){const c=roster[(Math.max(0,idx)+i)%roster.length];if(alive(c)){const prev=get(roster,from);currentId=(prev&&agility(c)===agility(prev))?contest(prev,c):c.id;break;}}}log(`▶ 다음 차례: ${get(roster,currentId)?.name||"없음"}`);render();}
function checkVictory(){const active=roster.filter(alive),A=roster.some(c=>c.team==="A"),B=roster.some(c=>c.team==="B");if(A&&B){const aa=active.some(c=>c.team==="A"),bb=active.some(c=>c.team==="B");if(!aa||!bb){const w=aa?"A 진영":bb?"B 진영":"무승부";log(`전투 종료: ${w}`,"system");toast(`전투 종료: ${w}`);return w;}}else if(roster.length>1&&active.length<=1){const w=active[0]?.name||"무승부";log(`전투 종료: ${w}`,"system");return w;}return null;}
function undo(){if(!history.length)return;const s=history.pop();({stats,library,roster,logs,currentId,pending,started,mode,factionNames,rules}=s);renderStats();render();toast("이전 상태로 되돌렸습니다.");}
function exportSave(){const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="battle-desk-backup.json";a.click();URL.revokeObjectURL(a.href);}
function importSave(file){const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);stats=normalizeStats(d.stats||clone(DEFAULT_STATS));library=d.library||[];roster=d.roster||[];logs=d.logs||[];currentId=d.currentId||null;pending=d.pending||null;started=!!d.started;mode=d.mode||"speed";factionNames={A:d.factionNames?.A||"A 진영",B:d.factionNames?.B||"B 진영"};migrateCharacters();renderStats();render();toast("백업을 불러왔습니다.");}catch(e){alert("백업 파일을 읽지 못했습니다.");}};r.readAsText(file);}
function addStatRow(){snap();stats.forEach(s=>{s.defaults.push(s.defaults[s.defaults.length-1]??"");s.evasion=s.evasion||[];s.escape=s.escape||[];s.evasion.push(s.evasion[s.evasion.length-1]??0);s.escape.push(s.escape[s.escape.length-1]??0);});renderStats();render();toast(`${rowCount()}번째 스탯 단계를 추가했습니다.`);}
function removeStatRow(){const n=rowCount();if(n<=1){toast("최소 1줄은 유지해야 합니다.");return;}snap();stats.forEach(s=>{s.defaults.pop();if(s.evasion?.length)s.evasion.pop();if(s.escape?.length)s.escape.pop();});library.forEach(c=>syncCharacter(c,true));roster.forEach(c=>syncCharacter(c,true));renderStats();render();toast("마지막 스탯 단계를 삭제했습니다.");}
function addStatColumn(){toast("능력치 열 추가는 현재 기본 전투 능력치 5종을 기준으로 합니다.");}
function clearBattle(){if(!confirm("전투 인원과 로그를 초기화할까요? 전체 캐릭터 목록은 유지됩니다."))return;snap();roster=[];logs=[];started=false;pending=null;currentId=null;render();toast("전투 상태를 초기화했습니다.");}
function clearAll(){if(!confirm("전체 캐릭터와 능력치 설정을 초기화할까요?"))return;snap();stats=clone(DEFAULT_STATS);library=[];roster=[];logs=[];started=false;pending=null;currentId=null;renderStats();resetCharacterForm();render();toast("전체 초기화 완료");}

function on(id,event,handler){const el=$(id);if(el)el.addEventListener(event,handler);}

// 정적 버튼과 동적으로 다시 그려지는 버튼을 모두 안전하게 처리합니다.
on("character-form","submit",createCharacter);
on("cancel-character-edit","click",resetCharacterForm);
on("add-to-roster","click",addRoster);
on("library-list","click",e=>{const ed=e.target.closest("[data-lib-edit]"),del=e.target.closest("[data-lib-delete]");if(ed)editCharacter(ed.dataset.libEdit);if(del&&confirm("전체 캐릭터 목록에서 삭제할까요?")){snap();library=library.filter(c=>c.id!==del.dataset.libDelete);roster=roster.filter(r=>r.libraryId!==del.dataset.libDelete);render();}});
on("mapping-body","change",e=>{
 const el=e.target;const i=Number(el.dataset.row);if(!Number.isInteger(i)||i<0)return;
 if(el.matches("[data-rule]")){snap();const s=stats.find(x=>x.role==="agility");if(!s)return;s.evasion=s.evasion||Array(s.defaults.length).fill(0);s.escape=s.escape||Array(s.defaults.length).fill(0);const v=Math.max(0,Number(el.value)||0);if(el.dataset.rule==="evasion")s.evasion[i]=v;else s.escape[i]=v;save();renderStats();return;}
 const key=el.dataset.stat;if(!key)return;const s=stats.find(x=>x.id===key);if(!s||i>=s.defaults.length)return;snap();s.defaults[i]=el.value.trim() || "0";library.forEach(c=>syncCharacter(c,true));roster.forEach(c=>syncCharacter(c,true));render();
});
on("mapping-head","click",e=>{const b=e.target.closest("[data-remove-stat]");if(b)toast("기본 전투 능력치는 현재 삭제할 수 없습니다.");});
on("add-stat-row","click",addStatRow);
on("remove-stat-row","click",removeStatRow);
on("character-list","click",e=>{const b=e.target.closest("[data-act]");if(!b)return;const {act,id:cid,target,reaction}=b.dataset;if(act==="attack")startAttack(cid,target);else if(act==="heal")healAction(cid,target);else if(act==="react")react(cid,reaction);else if(act==="escape")escape(cid);else if(act==="skip")advanceTurn(cid);else if(act==="edit-roster")editRoster(cid);else if(act==="remove-roster"){snap();roster=roster.filter(c=>c.id!==cid);if(currentId===cid)currentId=null;pending=null;render();}});
on("start-battle","click",startBattle);
on("next-turn","click",()=>{if(started&&!pending)advanceTurn(currentId);});
on("undo","click",undo);

// 전체 캐릭터 목록에만 진영 필터를 제공합니다. 전투 인원에는 필터를 두지 않습니다.
document.querySelectorAll("[data-library-filter]").forEach(b=>b.addEventListener("click",()=>{libraryFilter=b.dataset.libraryFilter||"all";document.querySelectorAll("[data-library-filter]").forEach(x=>x.classList.toggle("active",x===b));renderLibrary();}));

on("initiative-mode","change",e=>{mode=e.target.value;save();});
on("faction-a","change",e=>{factionNames.A=e.target.value.trim()||"A 진영";save();renderFactionControls();});
on("faction-b","change",e=>{factionNames.B=e.target.value.trim()||"B 진영";save();renderFactionControls();});
on("reset-config","click",()=>{if(confirm("기본 스탯 테이블로 초기화할까요?")){snap();stats=clone(DEFAULT_STATS);library.forEach(c=>syncCharacter(c,true));roster.forEach(c=>syncCharacter(c,true));renderStats();render();}});
on("export-save","click",exportSave);
on("import-save","click",()=>{const el=$("import-file");if(el)el.click();});
on("import-file","change",e=>{if(e.target.files[0])importSave(e.target.files[0]);e.target.value="";});
on("clear-battle","click",clearBattle);
on("clear-all","click",clearAll);
on("download-log","click",()=>{const a=document.createElement("a"),blob=new Blob([logs.map(x=>`[${x.time}] ${x.message}`).join("\n")],{type:"text/plain;charset=utf-8"});a.href=URL.createObjectURL(blob);a.download="battle-log.txt";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0);});
on("copy-log","click",async()=>{try{const text=logs.map(x=>`[${x.time}] ${x.message}`).join("\n");if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();}toast("로그 복사 완료");}catch(e){toast("복사할 수 없습니다");}});
on("clear-log","click",()=>{if(confirm("로그를 비울까요?")){logs=[];renderLogs();save();}});
on("close-modal","click",()=>{$("modal-backdrop").hidden=true;});

load();
const initMode=$("initiative-mode");if(initMode)initMode.value=mode;
renderStats();render();
})();
