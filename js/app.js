(() => {
"use strict";
const $=id=>document.getElementById(id), clone=x=>JSON.parse(JSON.stringify(x));
const KEY="battleDesk.custom.v3";

// 캐릭터가 선택하는 값은 1~8등급이며, 실제 전투 값은 아래 상셋값(등급별 설정표)에서 결정됩니다.
const DEFAULT_STATS=[
 {id:"hp",name:"체력(HP)",type:"number",defaults:[100,120,140,160,180,200,220,250],role:"hp"},
 {id:"atk",name:"공격(ATK)",type:"dice",defaults:["1d4","1d6","1d8","1d10","2d6","2d8","3d6","3d8"],role:"attack"},
 {id:"def",name:"방어(DEF)",type:"number",defaults:[10,20,30,40,50,55,60,70],role:"defense"},
 {id:"agi",name:"민첩(AGI)",type:"number",defaults:[5,15,25,35,45,50,55,65],role:"agility"},
 {id:"luck",name:"행운(LUK)",type:"number",defaults:[0.5,0.7,0.9,1,1.1,1.3,1.5,2],role:"luck"}
];
let stats=clone(DEFAULT_STATS), library=[], roster=[], logs=[], history=[], currentId=null, pending=null, started=false, filter="all", mode="speed", toastTimer;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)), id=()=>"c"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const get=(arr,x)=>arr.find(c=>c.id===x), alive=c=>!c.dead&&!c.escaped, stat=(c,role)=>stats.find(s=>s.role===role);
function save(){try{localStorage.setItem(KEY,JSON.stringify({stats,library,roster,logs,currentId,pending,started,mode}));$("save-indicator").textContent="저장됨"}catch(e){$("save-indicator").textContent="저장 실패"}}
function load(){try{let d=JSON.parse(localStorage.getItem(KEY)||"null");if(!d)return; stats=normalizeStats(d.stats||clone(DEFAULT_STATS)); library=d.library||[]; roster=d.roster||[]; logs=d.logs||[]; currentId=d.currentId||null; pending=d.pending||null; started=!!d.started; mode=d.mode||"speed"; migrateCharacters();}catch(e){console.warn(e)}}
function normalizeStats(source){
  const byRole={}; (source||[]).forEach(s=>{if(s?.role)byRole[s.role]=s});
  const result=clone(DEFAULT_STATS);
  result.forEach(s=>{if(byRole[s.role]){s.id=byRole[s.role].id||s.id;s.name=s.name;s.type=byRole[s.role].type||s.type;s.defaults=Array.from({length:8},(_,i)=>byRole[s.role].defaults?.[i]??s.defaults[i])}});
  return result;
}
function migrateCharacters(){
  [...library,...roster].forEach(c=>{
    c.values=c.values||{};
    stats.forEach(s=>{
      if(c.values[s.id]===undefined){
        // 구버전 캐릭터의 기존 실제값을 등급으로 역산하지 않고 3등급으로 보정
        c.values[s.id]=s.defaults[2];
      }
    });
    const hp=stat(c,"hp"); c.maxHp=Math.max(1,Number(c.values[hp.id])||100); if(c.curHp===undefined)c.curHp=c.maxHp;
  });
}
function snap(){history.push(clone({stats,library,roster,logs,currentId,pending,started,mode}));if(history.length>50)history.shift()}
function toast(t){$("toast").textContent=t;$("toast").classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$(`toast`).classList.remove("visible"),2200)}
function log(t,type="normal"){logs.push({time:new Date().toLocaleTimeString("ko-KR"),message:t,type});if(logs.length>1000)logs=logs.slice(-1000);renderLogs();save()}
function roll(expr){let s=String(expr??"0").trim().toLowerCase().replace(/\s/g,"");let m=s.match(/^(\d+)d(\d+)([+-]\d+(?:\.\d+)?)?$/);if(m){let n=clamp(+m[1],1,100),sides=clamp(+m[2],1,10000),r=Array.from({length:n},()=>1+Math.floor(Math.random()*sides)),bonus=+(m[3]||0);return {value:r.reduce((a,b)=>a+b,0)+bonus,desc:`${expr} → [${r.join(", ")}]${bonus?` ${bonus>0?"+":""}${bonus}`:""} = ${r.reduce((a,b)=>a+b,0)+bonus}`}}let n=Number(s);return {value:Number.isFinite(n)?n:0,desc:`${expr} → ${Number.isFinite(n)?n:0}`}}
function getVal(c,role){let s=stat(c,role);return s?c.values?.[s.id]:0}
function getLevelValue(s,level){return s?.defaults?.[clamp(Number(level||1)-1,0,7)]}
function levelFromValue(s,value){let i=s?.defaults?.findIndex(v=>String(v)===String(value));return i>=0?i+1:3}
function getCharacterLevel(c,s){return c.levels?.[s.id]??levelFromValue(s,c.values?.[s.id])}
function syncCharacterValues(c){c.values=c.values||{};c.levels=c.levels||{};stats.forEach(s=>{let lv=clamp(Number(c.levels[s.id]??levelFromValue(s,c.values[s.id])),1,8);c.levels[s.id]=lv;c.values[s.id]=getLevelValue(s,lv)});let hp=stat(c,"hp");c.maxHp=Math.max(1,Number(c.values[hp.id])||100);c.curHp=clamp(Number(c.curHp??c.maxHp),0,c.maxHp)}
function renderStats(){
  $("mapping-head").innerHTML="<tr><th>등급</th>"+stats.map(s=>`<th>${esc(s.name)}${s.role==="hp"?"":`<button title="이 능력치 삭제" data-remove-stat="${s.id}" style="margin-left:4px">×</button>`}</th>`).join("")+"</tr>";
  $("mapping-body").innerHTML=Array.from({length:8},(_,i)=>`<tr><td>${i+1}</td>${stats.map(s=>`<td><input aria-label="${i+1}등급 ${esc(s.name)}" data-stat="${s.id}" data-level="${i}" value="${esc(s.defaults[i]??0)}" ${s.role==="hp"?'type="number" min="1"':'type="text"'}></td>`).join("")}</tr>`).join("");
  $("custom-stat-fields").innerHTML=stats.map(s=>`<label>${esc(s.name)} <span>등급 1~8</span><input class="wide-input" data-character-stat="${s.id}" type="number" min="1" max="8" step="1" value="1" required></label>`).join("");
}
function setFormFromCharacter(c){$("cancel-character-edit").hidden=false;stats.forEach(s=>{let el=$(`[data-character-stat="${s.id}"]`);if(el)el.value=getCharacterLevel(c,s)});$("char-name").value=c.name;$("char-team").value=c.team;$("character-form").dataset.edit=c.id;$("character-form").querySelector("button[type=submit]").textContent="✓ 캐릭터 수정 저장";toast("캐릭터 정보를 불러왔습니다.")}
function resetCharacterForm(){$("character-form").reset();$("character-form").removeAttribute("data-edit");$("character-form").querySelector("button[type=submit]").textContent="＋ 전체 캐릭터에 저장";$("cancel-character-edit").hidden=true;renderStats()}
function renderLibrary(){
  $("library-count").textContent=library.length;
  $("library-list").innerHTML=library.length?library.map(c=>`<div class="library-item"><div><strong>${esc(c.name)}</strong><small>${c.values?stats.map(s=>`${esc(s.name)} Lv.${getCharacterLevel(c,s)}`).join(" · "):""} · ${c.team} 진영${roster.some(r=>r.libraryId===c.id)?" · 전투 참가 중":""}</small></div><div><button class="button button-secondary" data-lib-edit="${c.id}">불러와 편집</button><button class="button button-quiet" data-lib-delete="${c.id}">삭제</button></div></div>`).join(""):'<p class="small-note">저장된 캐릭터가 없습니다.</p>';
  $("library-select").innerHTML='<option value="">전투에 추가할 캐릭터 선택</option>'+library.filter(c=>!roster.some(r=>r.libraryId===c.id)).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")
}
function renderLogs(){$("log-count").textContent=logs.length;$(`log-container`).innerHTML=logs.length?logs.map(x=>`<div class="log-entry ${esc(x.type)}"><span class="log-time">${esc(x.time)}</span><span class="log-message">${esc(x.message)}</span></div>`).join(""):'<div class="log-empty">전투 기록이 여기에 쌓입니다.</div>';$(`log-container`).scrollTop=$(`log-container`).scrollHeight}
function render(){
  renderLibrary();$("character-count").textContent=roster.length;$("battle-status").innerHTML=`<i></i> ${started?"전투 진행 중":"대기 중"}`;$("battle-status").classList.toggle("active",started);let cur=get(roster,currentId);
  $("turn-title").textContent=started?(cur?`${cur.name}의 차례`:"전투 종료"):"전투를 시작할 준비가 되었어요";
  $("turn-subtitle").textContent=started?(pending?`${get(roster,pending.targetId)?.name||"대상"}의 반응을 기다리는 중`:"행동을 선택하거나 차례를 넘기세요."):"전체 캐릭터를 만든 뒤 전투 인원으로 편성하세요.";
  $("next-turn").disabled=!started||!!pending||!cur;$("undo").disabled=!history.length;
  let list=roster.filter(c=>filter==="all"||c.team===filter);
  $("character-list").innerHTML=list.length?list.map(c=>{
    let current=started&&c.id===currentId&&!pending,target=pending?.targetId===c.id,inactive=!alive(c),pct=clamp(c.curHp/c.maxHp*100,0,100),actions="";
    if(current&&alive(c)){
      actions+=roster.filter(t=>t.id!==c.id&&alive(t)&&canTarget(c,t)).map(t=>`<button class="button button-attack" data-act="attack" data-id="${c.id}" data-target="${t.id}">공격 · ${esc(t.name)}</button>`).join("");
      actions+=`<button class="button button-secondary" data-act="skip" data-id="${c.id}">차례 넘김</button><button class="button button-escape" data-act="escape" data-id="${c.id}">도주</button>`
    }
    let reactions=target?`<div class="reaction-box"><strong>⚑ 반응 선택</strong><p>${esc(get(roster,pending.attackerId)?.name||"상대")}의 공격입니다.</p><div class="reaction-actions"><button class="button button-secondary" data-act="react" data-reaction="defense" data-id="${c.id}">방어</button><button class="button button-secondary" data-act="react" data-reaction="counter" data-id="${c.id}">반격</button><button class="button button-secondary" data-act="react" data-reaction="evasion" data-id="${c.id}">회피</button><button class="button button-quiet" data-act="react" data-reaction="none" data-id="${c.id}">무대응</button></div></div>`:"";
    let edit=`<button class="card-edit" title="캐릭터 스탯 수정" data-act="edit-roster" data-id="${c.id}">✎</button>`;
    return `<article class="character-card team-${c.team} ${current?"current-turn":""} ${target?"targeting":""} ${inactive?"inactive":""} ${c.dead?"dead":""}"><button class="card-delete" title="전투 인원에서 제외" data-act="remove-roster" data-id="${c.id}">×</button>${edit}<div class="card-top"><div class="avatar">${esc(c.name.slice(0,2))}</div><div class="card-title"><h4>${esc(c.name)}${c.dead?'<span class="card-status">사망</span>':c.escaped?'<span class="card-status">도주</span>':""}</h4><p>${current?"현재 차례":inactive?"행동 불가":c.team+" 진영"}</p><span class="team-tag">${c.team} 진영</span></div></div><div class="hp-meta"><span>체력</span><strong>${c.curHp} / ${c.maxHp}</strong></div><div class="hp-track"><div class="hp-fill ${pct<25?"low":""}" style="width:${pct}%"></div></div><div class="stat-chips">${stats.filter(s=>s.role!=="hp").map(s=>`<span class="stat-chip">${esc(s.name)} <b>Lv.${getCharacterLevel(c,s)}</b></span>`).join("")}</div>${actions?`<div class="card-actions">${actions}</div>`:""}${reactions}</article>`}).join(""):'<div class="empty-state"><div class="empty-icon">✦</div><h3>전투 인원이 없습니다</h3><p>전체 캐릭터 목록에서 참가자를 추가하세요.</p></div>';
  renderLogs();save()
}
function canTarget(a,b){let A=roster.some(c=>c.team==="A"),B=roster.some(c=>c.team==="B");return !(A&&B)||a.team==="N"||b.team==="N"||a.team!==b.team}
function createCharacter(e){
  e.preventDefault();let name=$("char-name").value.trim();if(!name)return;
  let values={},levels={};stats.forEach(s=>{let lv=clamp(Number($(`[data-character-stat="${s.id}"]`).value)||1,1,8);levels[s.id]=lv;values[s.id]=getLevelValue(s,lv)});
  let editId=$("character-form").dataset.edit;
  if(editId){
    snap();
    let c=get(library,editId);if(!c)return; c.name=name;c.team=$("char-team").value;c.levels=levels;c.values=values;syncCharacterValues(c);
    // 전투 중인 동일 캐릭터도 수정 내용을 반영하되 현재 HP는 유지합니다.
    roster.filter(r=>r.libraryId===editId).forEach(r=>{let oldHp=r.curHp;r.name=c.name;r.team=c.team;r.levels=clone(levels);r.values=clone(values);syncCharacterValues(r);r.curHp=clamp(oldHp,0,r.maxHp);if(r.curHp<=0)r.dead=true});
    log(`${name} 캐릭터 정보를 수정했습니다.` ,"system");resetCharacterForm();render();toast("캐릭터 수정이 저장되었습니다.");return;
  }
  snap();
  let hpS=stat({values},"hp"),maxHp=Math.max(1,Number(values[hpS.id])||100);let c={id:id(),libraryId:"l"+id(),name,team:$("char-team").value,values,levels,maxHp,curHp:maxHp,dead:false,escaped:false};
  snap();library.push(c);log(`${name}을(를) 전체 캐릭터 목록에 저장했습니다.` ,"system");resetCharacterForm();render();toast("전체 캐릭터 목록에 저장했습니다.")
}
function editCharacter(cid){let c=get(library,cid);if(c)setFormFromCharacter(c)}
function editRoster(cid){let r=get(roster,cid);if(!r)return;let base=get(library,r.libraryId);if(base){setFormFromCharacter(base);$("character-form").dataset.edit=base.id;toast(`${r.name}의 원본 캐릭터 정보를 수정하세요.`)}}
function addRoster(){let c=get(library,$("library-select").value);if(!c){toast("전투에 추가할 캐릭터를 선택하세요.");return}if(roster.some(r=>r.libraryId===c.id)){toast("이미 전투 인원에 있습니다.");return}snap();syncCharacterValues(c);let r={...clone(c),id:id(),libraryId:c.id,curHp:c.maxHp,dead:false,escaped:false};roster.push(r);log(`${r.name} 전투 인원 편성 · ${r.team} 진영`,"system");render();toast(`${r.name}을(를) 전투 인원에 추가했습니다.`)}
function startBattle(){if(!roster.length){toast("전투 인원을 먼저 편성하세요.");return}snap();started=true;pending=null;mode=$("initiative-mode").value;if(mode==="speed"){sortByAgility();currentId=roster.find(alive)?.id;log("⚔ 전투 시작 · 민첩순. 동률은 민첩 대항 판정으로 결정합니다.","system")}else{currentId=rollInitiative(null);log("⚔ 전투 시작 · 매 턴 민첩 대항 판정.","system")}log(`첫 차례: ${get(roster,currentId)?.name||"없음"}`);render()}
function agility(c){let s=stat(c,"agility");let n=Number(c.values[s?.id]);return Number.isFinite(n)?n:0}
function contest(a,b){while(true){let ra=1+Math.floor(Math.random()*Math.max(1,agility(a))),rb=1+Math.floor(Math.random()*Math.max(1,agility(b)));log(`민첩 대항: ${a.name} ${ra}/${agility(a)} vs ${b.name} ${rb}/${agility(b)}`);if(ra!==rb)return ra>rb?a.id:b.id;log("민첩 대항 동률, 재판정합니다.")}}
function sortByAgility(){roster.sort((a,b)=>agility(b)-agility(a))}
function rollInitiative(previousId){let act=roster.filter(alive);if(act.length===1)return act[0].id;let candidates=act.slice();let winner=candidates.shift();for(let c of candidates)winner=get(roster,contest(winner,c));return winner.id}
function startAttack(aid,tid){let a=get(roster,aid),t=get(roster,tid);if(!started||!a||!t||aid!==currentId||!alive(a)||!alive(t))return;snap();pending={attackerId:aid,targetId:tid};log(`${a.name} → ${t.name} 공격 선언`);render()}
function applyDamage(c,amount,label){let before=c.curHp;c.curHp=clamp(c.curHp-Math.max(0,Math.round(amount)),0,c.maxHp);log(`${c.name} ${label}: ${before-c.curHp} 피해 (HP ${before} → ${c.curHp})`,"damage");if(c.curHp<=0){c.dead=true;log(`${c.name} 전투 불능`,"important")}}
function react(defenderId,reaction){if(!pending||pending.targetId!==defenderId)return;let a=get(roster,pending.attackerId),d=get(roster,defenderId);if(!a||!d)return;let action=pending;pending=null;let atk=roll(getVal(a,"attack"));let attack=Math.max(0,atk.value);log(`${a.name} 공격 굴림: ${atk.desc}`);
  if(reaction==="defense"){let pct=clamp(Number(getVal(d,"defense"))||0,0,100),block=Math.round(attack*pct/100);log(`${d.name} 방어: ${pct}% → ${block} 피해 경감`);applyDamage(d,attack-block,"방어 후")}
  else if(reaction==="counter"){let pct=clamp(Number(getVal(d,"defense"))||0,0,100),counter=Math.round(attack*pct/100);log(`${d.name} 반격: 방어 ${pct}% → ${counter} 피해 경감 및 반사 피해 ${counter}`);applyDamage(d,attack-counter,"반격 후");if(alive(a))applyDamage(a,counter,"반격 피해")}
  else if(reaction==="evasion"){let ag=agility(d),r=1+Math.floor(Math.random()*Math.max(1,ag));log(`${d.name} 회피 판정: ${r}/${ag}`);if(r===ag)log(`${d.name} 회피 성공`,"important");else applyDamage(d,attack,"회피 실패 후")}
  else applyDamage(d,attack,"피해");
  let winner=checkVictory();if(winner){started=false;currentId=null;render();return}advanceTurn(action.attackerId)
}
function escape(cid){let c=get(roster,cid);if(!c)return;snap();let ag=agility(c),r=1+Math.floor(Math.random()*Math.max(1,ag));log(`${c.name} 도주 판정 ${r}/${ag}`);if(r>=ag){c.escaped=true;log(`${c.name} 도주 성공`,"important")}else log(`${c.name} 도주 실패`);let w=checkVictory();if(w){started=false;currentId=null;render()}else advanceTurn(cid)}
function advanceTurn(from){let active=roster.filter(alive);if(!active.length){started=false;currentId=null;render();return}if(mode==="contest-each"){currentId=rollInitiative(from)}else{sortByAgility();let idx=roster.findIndex(c=>c.id===from);for(let i=1;i<=roster.length;i++){let c=roster[(Math.max(0,idx)+i)%roster.length];if(alive(c)){let prev=get(roster,from);currentId=(prev&&agility(c)===agility(prev))?contest(prev,c):c.id;break}}}log(`▶ 다음 차례: ${get(roster,currentId)?.name||"없음"}`);render()}
function checkVictory(){let active=roster.filter(alive),A=roster.some(c=>c.team==="A"),B=roster.some(c=>c.team==="B");if(A&&B){let aa=active.some(c=>c.team==="A"),bb=active.some(c=>c.team==="B");if(!aa||!bb){let w=aa?"A 진영":bb?"B 진영":"무승부";log(`전투 종료: ${w}`,"system");toast(`전투 종료: ${w}`);return w}}else if(roster.length>1&&active.length<=1){let w=active[0]?.name||"무승부";log(`전투 종료: ${w}`,"system");return w}return null}
function undo(){if(!history.length)return;let s=history.pop();({stats,library,roster,logs,currentId,pending,started,mode}=s);renderStats();render();toast("이전 상태로 되돌렸습니다.")}
function exportSave(){let blob=new Blob([JSON.stringify({stats,library,roster,logs,currentId,pending,started,mode},null,2)],{type:"application/json"});let a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="battle-desk-backup.json";a.click();URL.revokeObjectURL(a.href)}
function importSave(file){let r=new FileReader();r.onload=()=>{try{let d=JSON.parse(r.result);stats=normalizeStats(d.stats||clone(DEFAULT_STATS));library=d.library||[];roster=d.roster||[];logs=d.logs||[];currentId=d.currentId||null;pending=d.pending||null;started=!!d.started;mode=d.mode||"speed";migrateCharacters();renderStats();render();toast("백업을 불러왔습니다")}catch(e){alert("백업 파일을 읽지 못했습니다.")}};r.readAsText(file)}
function clearBattle(){if(!confirm("전투 인원과 로그를 초기화할까요? 전체 캐릭터 목록은 유지됩니다."))return;roster=[];logs=[];started=false;pending=null;currentId=null;history=[];render();toast("전투 상태를 초기화했습니다")}
function clearAll(){if(!confirm("전체 캐릭터와 능력치 설정을 초기화할까요?"))return;stats=clone(DEFAULT_STATS);library=[];roster=[];logs=[];started=false;pending=null;currentId=null;history=[];renderStats();resetCharacterForm();render();toast("전체 초기화 완료")}
$("character-form").addEventListener("submit",createCharacter);$("cancel-character-edit").addEventListener("click",resetCharacterForm);
$("add-to-roster").addEventListener("click",addRoster);
$("library-list").addEventListener("click",e=>{let ed=e.target.closest("[data-lib-edit]"),del=e.target.closest("[data-lib-delete]");if(ed)editCharacter(ed.dataset.libEdit);if(del){if(confirm("전체 캐릭터 목록에서 삭제할까요?")){snap();library=library.filter(c=>c.id!==del.dataset.libDelete);roster=roster.filter(r=>r.libraryId!==del.dataset.libDelete);render()}}});
$("mapping-body").addEventListener("change",e=>{let el=e.target.closest("[data-stat]");if(!el)return;let s=stats.find(x=>x.id===el.dataset.stat),i=+el.dataset.level;if(s){s.defaults[i]=s.type==="number"?(s.role==="hp"?Math.max(1,+el.value||1):+el.value||0):el.value; // 기존 캐릭터의 실제 값도 같은 등급 기준으로 즉시 갱신
    library.forEach(c=>{if(c.levels?.[s.id]===i+1)c.values[s.id]=s.defaults[i];});roster.forEach(c=>{if(c.levels?.[s.id]===i+1){c.values[s.id]=s.defaults[i];if(s.role==="hp"){c.maxHp=Math.max(1,+s.defaults[i]||1);c.curHp=clamp(c.curHp,0,c.maxHp)}}});renderStats();render();}});
$("mapping-head").addEventListener("click",e=>{let b=e.target.closest("[data-remove-stat]");if(!b)return;toast("기본 전투 능력치는 삭제할 수 없습니다.")});
$("add-stat").addEventListener("click",()=>toast("현재 버전에서는 전투 핵심 5개 능력치만 사용합니다."));
$("character-list").addEventListener("click",e=>{let b=e.target.closest("[data-act]");if(!b)return;let {act,id:cid,target,reaction}=b.dataset;if(act==="attack")startAttack(cid,target);if(act==="react")react(cid,reaction);if(act==="escape")escape(cid);if(act==="skip")advanceTurn(cid);if(act==="edit-roster")editRoster(cid);if(act==="remove-roster"){roster=roster.filter(c=>c.id!==cid);if(currentId===cid)currentId=null;pending=null;render()}});
$("start-battle").addEventListener("click",startBattle);$("next-turn").addEventListener("click",()=>{if(started&&!pending)advanceTurn(currentId)});$("undo").addEventListener("click",undo);
document.querySelectorAll(".filter-button").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;document.querySelectorAll(".filter-button").forEach(x=>x.classList.toggle("active",x===b));render()}));
$("initiative-mode").addEventListener("change",e=>{mode=e.target.value;save()});
$("reset-config").addEventListener("click",()=>{if(confirm("기본 상셋값 테이블로 초기화할까요?")){stats=clone(DEFAULT_STATS);library.forEach(syncCharacterValues);roster.forEach(syncCharacterValues);renderStats();render()}});
$("export-save").addEventListener("click",exportSave);$("import-save").addEventListener("click",()=>$(`import-file`).click());$("import-file").addEventListener("change",e=>{if(e.target.files[0])importSave(e.target.files[0])});
$("clear-battle").addEventListener("click",clearBattle);$("clear-all").addEventListener("click",clearAll);
$("download-log").addEventListener("click",()=>{let a=document.createElement("a"),blob=new Blob([logs.map(x=>`[${x.time}] ${x.message}`).join("\n")],{type:"text/plain;charset=utf-8"});a.href=URL.createObjectURL(blob);a.download="battle-log.txt";a.click();URL.revokeObjectURL(a.href)});
$("copy-log").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(logs.map(x=>`[${x.time}] ${x.message}`).join("\n"));toast("로그 복사 완료")}catch(e){toast("복사할 수 없습니다")}});
$("clear-log").addEventListener("click",()=>{if(confirm("로그를 비울까요?")){logs=[];renderLogs();save()}});
$("close-modal").addEventListener("click",()=>$(`modal-backdrop`).hidden=true);
load();$("initiative-mode").value=mode;renderStats();render();
})();
