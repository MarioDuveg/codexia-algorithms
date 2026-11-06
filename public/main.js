'use strict';
const LEVEL_TITLES = ['Radar del mínimo','El recuerdo que no se borra','Carrera por el gBest','Laboratorio de fuerzas','Semáforo de convergencia'];
const $ = selector => document.querySelector(selector);
let state=null, anchor=performance.now(), anchorElapsed=0, viewedLevel=null;
let polling=false, expiryRequested=false, holdAdvance=false;
const MAX_MISSION_MS=15*60*1000;
function duration(ms) {
  const cs=Math.max(0,Math.floor(ms/10));
  return `${String(Math.floor(cs/6000)).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;
}
async function api(url, options={}) {
  const response=await fetch(url,{...options,credentials:'same-origin',cache:'no-store'});
  const data=await response.json().catch(()=>{throw Error('El servidor no respondió correctamente.');});
  if(!response.ok)throw Error(data.error||'Error de conexión.');
  return data;
}
function openLevel(number) {
  if(!state?.started||state.expiredAt||number<1||number>5||number>state.currentLevel)return;
  viewedLevel=number;
  const url='/reto/'+number;
  $('#challengeFrame').src=url;
  $('#openTab').href=url;
  $('#activeLevel').textContent=`RETO ${String(number).padStart(2,'0')} / 05`;
  $('#iframeWrap').hidden=false;$('#finishCard').hidden=true;$('#openTab').hidden=false;
  renderNav();
}
function renderNav() {
  if(!state?.started)return;
  const nav=$('#levelList');nav.replaceChildren();
  LEVEL_TITLES.forEach((title,idx)=>{
    const n=idx+1;
    const result=state.results[idx];
    const unlocked=n<=state.currentLevel;
    const active=viewedLevel===n&&!state.ended;
    const btn=document.createElement('button');btn.type='button';
    btn.className='level-item'+(result?.correct?' is-done':'')+(result&&!result.correct?' is-missed':'')+(active?' is-active':'')+(!unlocked?' is-locked':'');
    btn.disabled=!unlocked||Boolean(state.expiredAt);
    btn.setAttribute('aria-label',`Reto ${n}: ${title}, ${result?result.points+' puntos':unlocked?'disponible':'bloqueado'}`);
    const index=document.createElement('span');index.className='level-number';index.textContent=String(n).padStart(2,'0');
    const info=document.createElement('span');info.className='level-info';
    const label=document.createElement('span');label.textContent='RETO '+String(n).padStart(2,'0');
    const name=document.createElement('strong');name.textContent=title;info.append(label,name);
    const badge=document.createElement('span');badge.className='level-check';
    badge.textContent=result?result.points+'p':unlocked?'→':'⌁';
    btn.append(index,info,badge);
    btn.addEventListener('click',()=>{holdAdvance=false;openLevel(n);});
    nav.append(btn);
  });
}
function updateTimer() {
  if(!state?.started)return;
  const elapsed=Math.min(MAX_MISSION_MS,state.ended?anchorElapsed:anchorElapsed+(performance.now()-anchor));
  $('#timer').textContent=duration(elapsed);
  const remaining=Math.max(0,MAX_MISSION_MS-elapsed);
  $('#remainingTime').textContent=String(Math.floor(remaining/60000)).padStart(2,'0')+':'+String(Math.floor(remaining%60000/1000)).padStart(2,'0')+' RESTANTES';
  if(!remaining&&!state.ended&&!expiryRequested){expiryRequested=true;refreshState();}
}
function renderState(data) {
  const oldLevel=state?.currentLevel;
  state=data;
  if(!data.started){$('#workspace').hidden=true;$('#joinOverlay').hidden=false;return;}
  $('#joinOverlay').hidden=true;$('#workspace').hidden=false;
  expiryRequested=false;
  $('#teamName').textContent=data.name;
  anchorElapsed=data.elapsedMs;anchor=performance.now();
  const progress=data.results.length;
  $('#progressText').textContent=String(progress).padStart(2,'0')+' / 05';
  $('#progressFill').style.width=progress*20+'%';
  $('#teamStatus').textContent=data.expiredAt?'TIEMPO AGOTADO':data.completedAt?'COMPETENCIA FINALIZADA':`RETO ${data.currentLevel} EN CURSO`;
  $('#timerMeta').textContent=data.ended?'TIEMPO FINAL / REGISTRADO':'CRONÓMETRO ACTIVO / MÁXIMO 15 MIN';
  $('.timer-box').classList.toggle('timer-finished',Boolean(data.ended));
  $('#currentScore').textContent=String(data.score).padStart(2,'0');
  const sb=data.supabase;
  $('#syncStatus').textContent=!sb?.enabled
    ? `${data.totalAttempts} intentos · guardado local (Supabase deshabilitado)`
    : sb.upToDate
      ? `Supabase ✓ Mejor puntaje registrado en taller_2: ${sb.publishedScore}/100`
      : sb.error
        ? 'Supabase: envío pendiente, el servidor reintentará automáticamente.'
        : sb.eligible
          ? 'Supabase: sincronizando el mejor puntaje con taller_2…'
          : 'Supabase: el puntaje se enviará al resolver el primer reto.';
  updateTimer();
  if(data.ended){
    $('#finalTime').textContent=duration(data.elapsedMs);
    $('#finalScore').textContent=data.score;
    $('#finishIcon').textContent=data.expiredAt?'⌛':'✓';
    $('#finishEyebrow').textContent=data.expiredAt?`[ TIEMPO AGOTADO // ${progress} / 05 RETOS ]`:'[ 05 / 05 RETOS COMPLETADOS ]';
    $('#finishTitle').textContent=data.expiredAt?'TIEMPO AGOTADO.':'MISIÓN COMPLETADA.';
    $('#finishDescription').textContent=data.expiredAt?'Se agotaron los 15 minutos. Este es su resultado:':'Terminaron los cinco retos. Su puntuación y tiempo:';
    $('#finalPlace').textContent=`EQUIPO ${String(data.teamNumber).padStart(2,'0')} · PUESTO DEL MEJOR INTENTO #${data.rank||'—'} · ${data.totalAttempts} INTENTOS`;
    $('#finishFoot').textContent='El mejor puntaje se conserva en taller_2 de Supabase. El ranking ordena por puntos, tiempo e intentos.';
    $('#matrixPanel').hidden=false;$('#reviewBtn').hidden=Boolean(data.expiredAt);
    if(data.expiredAt || (!holdAdvance && viewedLevel===null))showFinish();
  }else if(viewedLevel===null||((oldLevel&&data.currentLevel>oldLevel)&&!holdAdvance)){
    openLevel(data.currentLevel);
  }
  renderNav();
}
function showFinish() {
  $('#iframeWrap').hidden=true;$('#finishCard').hidden=false;$('#openTab').hidden=true;
  $('#activeLevel').textContent=state.expiredAt?'TIEMPO AGOTADO':'05 / 05 RETOS';
  viewedLevel=null;holdAdvance=false;renderNav();
}
async function refreshState() {
  if(polling)return;
  polling=true;
  try {renderState(await api('/api/state'));}catch(error){console.warn('No se pudo actualizar:',error.message);}
  finally{polling=false;}
}
function selectedTeam() {
  const raw=$('#joinTeamNumber').value.trim();const n=Number(raw);
  return /^\d{1,2}$/.test(raw)&&Number.isInteger(n)&&n>=1&&n<=20?n:null;
}
function selectionChanged() {
  const n=selectedTeam();$('#startBtn').disabled=n===null;
  $('#teamSelectStatus').textContent=n===null?'NINGÚN EQUIPO SELECCIONADO':`EQUIPO ${String(n).padStart(2,'0')} SELECCIONADO`;
}
$('#joinTeamNumber').addEventListener('input',selectionChanged);
$('#teamPlus').addEventListener('click',()=>{$('#joinTeamNumber').value=selectedTeam()===null?1:Math.min(20,selectedTeam()+1);selectionChanged();});
$('#teamMinus').addEventListener('click',()=>{$('#joinTeamNumber').value=selectedTeam()===null?20:Math.max(1,selectedTeam()-1);selectionChanged();});
selectionChanged();
$('#joinForm').addEventListener('submit',async(event)=>{
  event.preventDefault();const n=selectedTeam();if(n===null)return;
  $('#startBtn').disabled=true;$('#joinError').textContent='';
  try{await api('/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teamNumber:n})});await refreshState();}
  catch(error){$('#joinError').textContent=error.message;}
  finally{selectionChanged();}
});
$('#reviewBtn').addEventListener('click',()=>openLevel(1));
$('#retryBtn').addEventListener('click',async()=>{
  $('#retryError').textContent='';$('#retryBtn').disabled=true;
  try{await api('/api/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    viewedLevel=null;holdAdvance=false;$('#challengeFrame').src='about:blank';$('#finishCard').hidden=true;await refreshState();
  }catch(error){$('#retryError').textContent=error.message;}
  finally{$('#retryBtn').disabled=false;}
});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==$('#challengeFrame').contentWindow)return;
  if(event.data?.type==='pso-progress'){holdAdvance=true;refreshState();}
  if(event.data?.type==='pso-continue'){
    api('/api/state').then(latest=>{
      renderState(latest);holdAdvance=false;
      if(latest.ended)showFinish();else openLevel(latest.currentLevel);
    }).catch(err=>console.warn('No se pudo avanzar:',err.message));
  }
});
setInterval(updateTimer,65);setInterval(refreshState,4000);refreshState();
