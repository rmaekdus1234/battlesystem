(() => {
  "use strict";
  const STORAGE_KEY = "battleDesk.custom.v1";
  const DEFAULT_MAPPING = {
    hp:  {1:100,2:120,3:140,4:160,5:180,6:200,7:220,8:250},
    atk: {1:"1d4",2:"1d6",3:"1d8",4:"1d10",5:"2d6",6:"2d8",7:"3d6",8:"3d8"},
    def: {1:10,2:20,3:30,4:40,5:50,6:55,7:60,8:70},
    agi: {1:5,2:15,3:25,4:35,5:45,6:50,7:55,8:65},
    int: {1:0.5,2:0.7,3:0.9,4:1,5:1.1,6:1.3,7:1.5,8:2}
  };
  const $ = id => document.getElementById(id);
  let mapping = clone(DEFAULT_MAPPING);
  let characters = [];
  let logs = [];
  let history = [];
  let currentId = null;
  let pendingAttack = null;
  let battleStarted = false;
  let filter = "all";
  let toastTimer = null;

  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function esc(value){ return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
  function getChar(id){ return characters.find(c => c.id === id); }
  function labelTeam(team){ return team === "A" ? "A 진영" : team === "B" ? "B 진영" : "중립"; }
  function now(){ return new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); }
  function snapshot(){
    history.push(clone({characters,logs,currentId,pendingAttack,battleStarted}));
    if(history.length > 50) history.shift();
  }
  function persist(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({mapping,characters,logs,currentId,pendingAttack,battleStarted}));
      $("save-indicator").textContent = "저장됨";
    } catch(e) { $("save-indicator").textContent = "저장 실패"; }
  }
  function load(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return;
      const data = JSON.parse(raw);
      if(data.mapping) mapping = mergeMapping(data.mapping);
      if(Array.isArray(data.characters)) characters = data.characters;
      if(Array.isArray(data.logs)) logs = data.logs;
      currentId = data.currentId ?? null;
      pendingAttack = data.pendingAttack ?? null;
      battleStarted = !!data.battleStarted;
    } catch(e) { console.warn("저장 데이터를 불러오지 못했습니다.", e); }
  }
  function mergeMapping(incoming){
    const out = clone(DEFAULT_MAPPING);
    ["hp","atk","def","agi","int"].forEach(k => { if(incoming[k]) for(let i=1;i<=8;i++) if(incoming[k][i] !== undefined) out[k][i] = incoming[k][i]; });
    return out;
  }
  function toast(message){
    $("toast").textContent = message;
    $("toast").classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 2300);
  }
  function log(message,type="normal"){
    logs.push({time:now(),message,type});
    if(logs.length > 1000) logs = logs.slice(-1000);
    renderLogs();
    persist();
  }
  function renderMapping(){
    $("mapping-body").innerHTML = Array.from({length:8},(_,n)=>{
      const i=n+1;
      return `<tr><td>${i}</td>
      <td><input aria-label="${i}등급 최대 HP" type="number" min="1" data-kind="hp" data-level="${i}" value="${esc(mapping.hp[i])}"></td>
      <td><input aria-label="${i}등급 공격 주사위" type="text" data-kind="atk" data-level="${i}" value="${esc(mapping.atk[i])}"></td>
      <td><input aria-label="${i}등급 방어율" type="number" min="0" max="100" data-kind="def" data-level="${i}" value="${esc(mapping.def[i])}"></td>
      <td><input aria-label="${i}등급 회피율" type="number" min="0" max="100" data-kind="agi" data-level="${i}" value="${esc(mapping.agi[i])}"></td>
      <td><input aria-label="${i}등급 지능 배율" type="number" min="0" step=".1" data-kind="int" data-level="${i}" value="${esc(mapping.int[i])}"></td></tr>`;
    }).join("");
    ["atk","hp","def","agi","int"].forEach(id=>{
      $( "char-"+id ).innerHTML = Array.from({length:8},(_,i)=>`<option value="${i+1}">${i+1}등급 · ${id==="atk"?mapping.atk[i+1]:id==="hp"?mapping.hp[i+1]+" HP":id==="def"?mapping.def[i+1]+"%":id==="agi"?mapping.agi[i+1]+"%":mapping.int[i+1]+"배"}</option>`).join("");
    });
  }
  function renderLogs(){
    $("log-count").textContent = logs.length;
    const box = $("log-container");
    if(!logs.length){box.innerHTML='<div class="log-empty">전투 기록이 여기에 쌓입니다.</div>';return;}
    box.innerHTML = logs.map(entry=>`<div class="log-entry ${esc(entry.type)}"><span class="log-time">${esc(entry.time)}</span><span class="log-message">${esc(entry.message)}</span></div>`).join("");
    box.scrollTop = box.scrollHeight;
  }
  function render(){
    const active = characters.filter(c=>!c.dead&&!c.escaped);
    $("character-count").textContent = characters.length;
    $("battle-status").classList.toggle("active",battleStarted);
    $("battle-status").innerHTML = `<i></i> ${battleStarted?"전투 진행 중":"대기 중"}`;
    const current = getChar(currentId);
    $("turn-title").textContent = battleStarted ? (current ? `${current.name}의 차례` : "전투 종료") : "전투를 시작할 준비가 되었어요";
    $("turn-subtitle").textContent = battleStarted ? (pendingAttack ? `${getChar(pendingAttack.targetId)?.name || "대상"}의 반응을 기다리고 있습니다.` : "행동을 선택하거나 차례를 넘기세요.") : "캐릭터를 등록한 뒤 민첩순 전투 시작을 눌러주세요.";
    $("next-turn").disabled = !battleStarted || !!pendingAttack || !current;
    $("undo").disabled = history.length===0;
    const visible = characters.filter(c=>filter==="all"||c.team===filter);
    if(!visible.length){
      $("character-list").innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><h3>${characters.length?"조건에 맞는 캐릭터가 없습니다":"전장이 비어 있습니다"}</h3><p>${characters.length?"다른 진영 필터를 선택해 주세요.":"왼쪽에서 첫 번째 캐릭터를 등록해 주세요."}</p></div>`;
      return;
    }
    $("character-list").innerHTML = visible.map(c=>{
      const isCurrent = battleStarted && c.id===currentId && !pendingAttack;
      const isTarget = pendingAttack && c.id===pendingAttack.targetId;
      const hpPercent = c.maxHp>0?clamp(c.curHp/c.maxHp*100,0,100):0;
      const inactive = c.dead||c.escaped;
      let actionHtml = "";
      if(isCurrent&&!inactive){
        const targets = characters.filter(t=>t.id!==c.id&&!t.dead&&!t.escaped&&canTarget(c,t));
        actionHtml += targets.map(t=>`<button class="button button-attack" data-action="attack" data-id="${c.id}" data-target="${t.id}">공격 · ${esc(t.name)}</button>`).join("");
        actionHtml += `<button class="button button-heal" data-action="heal" data-id="${c.id}">회복 +${Math.max(0,Number($("heal-amount").value)||0)}</button>`;
        actionHtml += `<button class="button button-escape" data-action="escape" data-id="${c.id}">도주 시도</button>`;
      }
      let reactionHtml = "";
      if(isTarget){
        const attacker=getChar(pendingAttack.attackerId);
        reactionHtml = `<div class="reaction-box"><strong>⚑ 공격 반응 선택</strong><p>${esc(attacker?.name||"공격자")}의 공격을 받았습니다. 방어 또는 회피로 피해를 막을 수 있습니다.</p><div class="reaction-actions"><button class="button button-secondary" data-action="react" data-reaction="def" data-id="${c.id}">방어 ${mapping.def[c.def]}%</button><button class="button button-secondary" data-action="react" data-reaction="agi" data-id="${c.id}">회피 ${mapping.agi[c.agi]}%</button><button class="button button-quiet" data-action="react" data-reaction="none" data-id="${c.id}">무대응</button></div></div>`;
      }
      return `<article class="character-card team-${c.team} ${isCurrent?"current-turn":""} ${isTarget?"targeting":""} ${inactive?"inactive":""} ${c.dead?"dead":""}">
        <button class="card-delete" title="캐릭터 삭제" aria-label="${esc(c.name)} 삭제" data-action="delete" data-id="${c.id}">×</button>
        <div class="card-top"><div class="avatar">${esc((c.name||"?").trim().slice(0,2))}</div><div class="card-title"><h4>${esc(c.name)}${c.dead?'<span class="card-status">사망</span>':c.escaped?'<span class="card-status">탈출</span>':""}</h4><p>${battleStarted&&isCurrent?"현재 행동 차례":inactive?"행동 불가":labelTeam(c.team)}</p><span class="team-tag">${labelTeam(c.team)}</span></div></div>
        <div class="hp-meta"><span>체력</span><strong>${c.curHp} <span style="color:var(--muted);font-weight:500">/ ${c.maxHp}</span></strong></div>
        <div class="hp-track"><div class="hp-fill ${hpPercent<25?"low":""}" style="width:${hpPercent}%"></div></div>
        <div class="stat-chips"><span class="stat-chip">ATK <b>${c.atk}</b></span><span class="stat-chip">DEF <b>${c.def}</b></span><span class="stat-chip">AGI <b>${c.agi}</b></span><span class="stat-chip">INT <b>${c.int}</b></span></div>
        ${actionHtml?`<div class="card-actions">${actionHtml}</div>`:""}
        ${reactionHtml}
      </article>`;
    }).join("");
  }
  function canTarget(attacker,target){
    const teamsPresent = characters.some(c=>c.team==="A") && characters.some(c=>c.team==="B");
    if(!teamsPresent) return true;
    if(attacker.team==="N"||target.team==="N") return true;
    return attacker.team!==target.team;
  }
  function addCharacter(event){
    event.preventDefault();
    const name=$("char-name").value.trim()||`참가자 ${characters.length+1}`;
    const stats={atk:Number($("char-atk").value),hp_s:Number($("char-hp").value),def:Number($("char-def").value),agi:Number($("char-agi").value),int:Number($("char-int").value),team:$("char-team").value};
    const maxHp=Math.max(1,Number(mapping.hp[stats.hp_s])||100);
    snapshot();
    characters.push({id:cryptoId(),name,...stats,maxHp,curHp:maxHp,dead:false,escaped:false});
    $("char-name").value="";
    log(`${name} 등록 · ${labelTeam(stats.team)} · HP ${maxHp}`,"system");
    render();persist();toast(`${name} 캐릭터를 등록했어요.`);
  }
  function cryptoId(){return "c"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
  function startBattle(){
    if(characters.length<1){toast("먼저 캐릭터를 등록해 주세요.");return;}
    snapshot();
    characters.sort((a,b)=>b.agi-a.agi);
    currentId=(characters.find(c=>!c.dead&&!c.escaped)||characters[0]).id;
    battleStarted=true;pendingAttack=null;
    log("⚔ 전투 시작! 민첩 등급 순으로 행동합니다.","system");
    log(`첫 번째 차례: ${getChar(currentId)?.name||"없음"}`);
    render();persist();
  }
  function startAttack(attackerId,targetId){
    const attacker=getChar(attackerId),target=getChar(targetId);
    if(!attacker||!target||!battleStarted||attackerId!==currentId||attacker.dead||attacker.escaped||target.dead||target.escaped)return;
    snapshot();
    pendingAttack={attackerId,targetId};
    log(`${attacker.name} → ${target.name} 공격 선언!`);
    render();persist();
  }
  function rollAttack(attacker){
    const expression=String(mapping.atk[attacker.atk]??"1d4").trim().toLowerCase();
    const match=expression.match(/^(\d+)\s*d\s*(\d+)$/);
    if(match){
      const count=clamp(Number(match[1]),1,100),sides=clamp(Number(match[2]),1,10000),rolls=[];
      for(let i=0;i<count;i++) rolls.push(1+Math.floor(Math.random()*sides));
      return {sum:rolls.reduce((a,b)=>a+b,0),description:`주사위 [${rolls.join(", ")}] = ${rolls.reduce((a,b)=>a+b,0)}`};
    }
    const fixed=Number(expression);
    if(Number.isFinite(fixed)&&fixed>=0)return {sum:fixed,description:`고정 공격력 = ${fixed}`};
    return {sum:0,description:`잘못된 주사위 식 "${expression}", 피해 0`};
  }
  function react(defenderId,reaction){
    if(!pendingAttack||pendingAttack.targetId!==defenderId)return;
    const attacker=getChar(pendingAttack.attackerId),defender=getChar(defenderId);
    if(!attacker||!defender){pendingAttack=null;render();return;}
    const action=pendingAttack;
    if(reaction!=="none"){
      const rate=clamp(Number(mapping[reaction][defender[reaction]])||0,0,100);
      const roll=1+Math.floor(Math.random()*100);
      log(`${defender.name} ${reaction==="def"?"방어":"회피"} 판정: ${roll}% (성공 기준 ${rate}%)`);
      if(roll<=rate){
        log(`${defender.name} ${reaction==="def"?"방어":"회피"} 성공! 피해를 무효화했습니다.`,"important");
        pendingAttack=null;advanceTurn(attacker.id);return;
      }
      log(`${defender.name} 판정 실패.`);
    } else log(`${defender.name} 무대응 선택.`);
    const result=rollAttack(attacker);
    log(result.description);
    const damage=Math.max(0,Math.round(result.sum*(Number(mapping.int[attacker.int])||0)));
    const before=defender.curHp;
    defender.curHp=clamp(defender.curHp-damage,0,defender.maxHp);
    log(`${defender.name}에게 ${damage} 피해! (HP ${before} → ${defender.curHp})`, "damage");
    if(defender.curHp<=0){defender.dead=true;log(`${defender.name} 전투 불능!`,"important");}
    pendingAttack=null;
    const winner=checkVictory();
    if(!winner)advanceTurn(action.attackerId);else{battleStarted=false;currentId=null;render();persist();}
  }
  function advanceTurn(fromId=currentId){
    if(!characters.length){currentId=null;render();persist();return;}
    const fromIndex=characters.findIndex(c=>c.id===fromId);
    for(let step=1;step<=characters.length;step++){
      const c=characters[(Math.max(0,fromIndex)+step)%characters.length];
      if(!c.dead&&!c.escaped){currentId=c.id;log(`▶ 다음 차례: ${c.name}`);render();persist();return;}
    }
    currentId=null;battleStarted=false;
    log("행동 가능한 캐릭터가 없습니다. 전투를 종료합니다.","system");
    render();persist();
  }
  function nextTurn(){
    if(!battleStarted||pendingAttack)return;
    const c=getChar(currentId);
    if(c)log(`${c.name} 차례 넘김.`);
    advanceTurn(currentId);
  }
  function heal(id){
    const c=getChar(id);if(!c)return;
    snapshot();
    const amount=Math.max(0,Number($("heal-amount").value)||0);
    const before=c.curHp;c.curHp=Math.min(c.maxHp,c.curHp+amount);
    if(c.curHp>0){c.dead=false;c.escaped=false;}
    log(`${c.name} 회복: +${c.curHp-before} HP (${c.curHp}/${c.maxHp})`,"heal");
    if(battleStarted&&currentId===id) advanceTurn(id); else {render();persist();}
  }
  function escape(id){
    const c=getChar(id);if(!c)return;
    snapshot();
    const rate=clamp((Number(mapping.agi[c.agi])||0)+(Number($("escape-bonus").value)||0),0,100);
    const roll=1+Math.floor(Math.random()*100);
    log(`${c.name} 도주 판정: ${roll}% (성공 기준 ${rate}%)`);
    if(roll<=rate){c.escaped=true;log(`${c.name} 도주 성공!`,"important");}
    else log(`${c.name} 도주 실패.`,"important");
    const winner=checkVictory();
    if(winner){battleStarted=false;currentId=null;render();persist();}
    else advanceTurn(id);
  }
  function checkVictory(){
    const alive=characters.filter(c=>!c.dead&&!c.escaped);
    const hasA=characters.some(c=>c.team==="A"),hasB=characters.some(c=>c.team==="B");
    if(hasA&&hasB){
      const aliveA=alive.filter(c=>c.team==="A"),aliveB=alive.filter(c=>c.team==="B");
      if(!aliveA.length||!aliveB.length){
        const winner=aliveA.length?"A 진영":aliveB.length?"B 진영":"무승부";
        log(`전투 종료! 결과: ${winner}${winner==="무승부"?"":" 승리"}`,"system");
        $("turn-subtitle").textContent=`전투 종료 · ${winner}`;
        toast(`전투 종료: ${winner}`);
        return winner;
      }
    } else if(characters.length>1&&alive.length<=1){
      const winner=alive[0]?.name||"무승부";
      log(`전투 종료! 최종 결과: ${winner}${winner==="무승부"?"":" 승리"}`,"system");
      toast(`전투 종료: ${winner}`);
      return winner;
    }
    return null;
  }
  function deleteCharacter(id){
    const c=getChar(id);if(!c)return;
    if(!confirm(`${c.name} 캐릭터를 삭제할까요?`))return;
    snapshot();characters=characters.filter(x=>x.id!==id);
    if(currentId===id)currentId=null;
    if(pendingAttack&&(pendingAttack.attackerId===id||pendingAttack.targetId===id))pendingAttack=null;
    log(`${c.name} 캐릭터 삭제.`);render();persist();
  }
  function undo(){
    if(!history.length){toast("되돌릴 행동이 없습니다.");return;}
    const state=history.pop();
    characters=state.characters;logs=state.logs;currentId=state.currentId;pendingAttack=state.pendingAttack;battleStarted=state.battleStarted;
    log("↶ 마지막 행동을 되돌렸습니다.","system");render();persist();toast("이전 상태로 복구했어요.");
  }
  function download(filename,content,type){
    const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  function exportSave(){
    const data={version:1,exportedAt:new Date().toISOString(),mapping,characters,logs,currentId,pendingAttack,battleStarted,settings:{healAmount:$("heal-amount").value,escapeBonus:$("escape-bonus").value}};
    download(`battle-desk-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),"application/json");
    toast("백업 파일을 내보냈어요.");
  }
  function importSave(file){
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(reader.result);
        if(!data||!Array.isArray(data.characters)||!data.mapping)throw new Error("형식이 올바르지 않습니다.");
        snapshot();mapping=mergeMapping(data.mapping);
        characters=data.characters.map(c=>({...c,id:c.id||cryptoId(),team:["A","B","N"].includes(c.team)?c.team:"N",maxHp:Math.max(1,Number(c.maxHp)||100),curHp:clamp(Number(c.curHp)||0,0,Math.max(1,Number(c.maxHp)||100))}));
        logs=Array.isArray(data.logs)?data.logs:[];
        currentId=data.currentId??null;pendingAttack=data.pendingAttack??null;battleStarted=!!data.battleStarted;
        if(data.settings?.healAmount!==undefined)$("heal-amount").value=data.settings.healAmount;
        if(data.settings?.escapeBonus!==undefined)$("escape-bonus").value=data.settings.escapeBonus;
        renderMapping();render();renderLogs();persist();toast("백업 데이터를 불러왔어요.");
      }catch(e){alert("백업 파일을 읽지 못했습니다: "+e.message);}
      $("import-file").value="";
    };
    reader.readAsText(file);
  }
  function clearBattle(){
    if(!confirm("캐릭터는 유지하고 전투 상태와 로그를 초기화할까요?"))return;
    snapshot();characters=characters.map(c=>({...c,curHp:c.maxHp,dead:false,escaped:false}));
    logs=[];currentId=null;pendingAttack=null;battleStarted=false;history=[];
    render();renderLogs();persist();toast("전투 상태를 초기화했어요.");
  }
  function clearAll(){
    if(!confirm("캐릭터, 로그, 능력치 설정을 모두 초기화할까요? 이 작업은 되돌릴 수 없습니다."))return;
    characters=[];logs=[];history=[];currentId=null;pendingAttack=null;battleStarted=false;mapping=clone(DEFAULT_MAPPING);
    $("heal-amount").value=20;$("escape-bonus").value=10;
    renderMapping();render();renderLogs();persist();toast("모든 데이터를 초기화했어요.");
  }
  function openReactionModal(targetId){
    const c=getChar(targetId);if(!c)return;
    $("modal-title").textContent="반응 행동";
    $("modal-description").textContent=`${c.name}이(가) 공격을 받았습니다. 카드 안의 방어·회피 버튼으로 반응을 선택할 수 있습니다.`;
    $("modal-actions").innerHTML='<button class="button button-secondary" id="modal-ok">확인</button>';
    $("modal-backdrop").hidden=false;
    $("modal-ok").onclick=()=>$("modal-backdrop").hidden=true;
  }
  $("character-form").addEventListener("submit",addCharacter);
  $("mapping-body").addEventListener("change",e=>{
    const input=e.target.closest("input[data-kind]");if(!input)return;
    const kind=input.dataset.kind,level=Number(input.dataset.level);
    let value=kind==="atk"?input.value.trim():Number(input.value);
    if(kind!=="atk"&&!Number.isFinite(value)){input.value=mapping[kind][level];return;}
    if(kind==="hp")value=Math.max(1,value);
    if(kind==="def"||kind==="agi")value=clamp(value,0,100);
    if(kind==="int")value=Math.max(0,value);
    if(kind==="atk"&&!value)value="1d4";
    mapping[kind][level]=value;
    renderMapping();render();persist();toast(`${level}등급 능력치를 저장했어요.`);
  });
  $("character-list").addEventListener("click",e=>{
    const btn=e.target.closest("[data-action]");if(!btn)return;
    const {action,id,target,reaction}=btn.dataset;
    if(action==="attack")startAttack(id,target);
    else if(action==="react")react(id,reaction);
    else if(action==="heal")heal(id);
    else if(action==="escape")escape(id);
    else if(action==="delete")deleteCharacter(id);
  });
  $("start-battle").addEventListener("click",startBattle);
  $("next-turn").addEventListener("click",nextTurn);
  $("undo").addEventListener("click",undo);
  $("sort-speed").addEventListener("click",()=>{snapshot();characters.sort((a,b)=>b.agi-a.agi);render();persist();toast("민첩 등급 순으로 정렬했어요.");});
  document.querySelectorAll(".filter-button").forEach(btn=>btn.addEventListener("click",()=>{
    filter=btn.dataset.filter;document.querySelectorAll(".filter-button").forEach(b=>b.classList.toggle("active",b===btn));render();
  }));
  $("reset-config").addEventListener("click",()=>{
    if(!confirm("능력치 테이블을 기본값으로 되돌릴까요?"))return;
    mapping=clone(DEFAULT_MAPPING);renderMapping();render();persist();toast("기본 능력치로 초기화했어요.");
  });
  $("export-save").addEventListener("click",exportSave);
  $("import-save").addEventListener("click",()=>$("import-file").click());
  $("import-file").addEventListener("change",e=>{if(e.target.files?.[0])importSave(e.target.files[0]);});
  $("clear-battle").addEventListener("click",clearBattle);
  $("clear-all").addEventListener("click",clearAll);
  $("download-log").addEventListener("click",()=>{
    const content=logs.map(x=>`[${x.time}] ${x.message}`).join("\n");
    download(`battle-log-${new Date().toISOString().replace(/[:.]/g,"-")}.txt`,content||"전투 로그가 없습니다.","text/plain;charset=utf-8");
  });
  $("copy-log").addEventListener("click",async()=>{
    const content=logs.map(x=>`[${x.time}] ${x.message}`).join("\n");
    try{await navigator.clipboard.writeText(content);toast("로그를 클립보드에 복사했어요.");}
    catch(e){toast("클립보드 접근이 제한되어 있어요. TXT 추출을 이용해 주세요.");}
  });
  $("clear-log").addEventListener("click",()=>{
    if(!confirm("전투 로그를 비울까요?"))return;
    snapshot();logs=[];renderLogs();persist();toast("로그를 비웠어요.");
  });
  $("close-modal").addEventListener("click",()=>$("modal-backdrop").hidden=true);
  $("modal-backdrop").addEventListener("click",e=>{if(e.target===$("modal-backdrop"))$("modal-backdrop").hidden=true;});
  $("heal-amount").addEventListener("change",persist);
  $("escape-bonus").addEventListener("change",persist);

  load();renderMapping();render();renderLogs();
})();