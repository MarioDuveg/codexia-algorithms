'use strict';
(function(){
  const root=document.querySelector('[data-scores-root]');if(!root)return;
  const MODES=[{key:'total',button:'GENERAL',label:'PUNTUACIÓN TOTAL',detail:'Suma de los cinco retos (máximo 100 puntos). Desempata el menor tiempo y después el menor número de intentos.'},
    ...Array.from({length:5},(_,i)=>({key:'reto'+(i+1),button:'RETO '+(i+1),label:'RETO '+(i+1),detail:'Puntos obtenidos en el mini reto '+(i+1)+' (máximo 20). El tiempo total resuelve los empates.'}))];
  const el=id=>root.querySelector('#'+id);
  const filters=el('scoresFilters'),rows=el('scoresRows'),podium=el('scoresPodium'),status=el('scoresStatus');
  const overlay=document.getElementById('scoresOverlay'),openBtn=document.getElementById('scoresOpenBtn'),closeBtn=document.getElementById('scoresCloseBtn');
  let mode='total',scores=[],loaded=false,busy=false,previousFocus=null;
  function points(t){return mode==='total'?t.puntos:t.porReto?.[Number(mode.slice(-1))-1]||0;}
  function duration(ms){const sec=Math.floor(Math.max(0,ms)/1000);return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
  function make(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
  function ranked(){
    const sorted=scores.map(t=>({...t,value:points(t)})).sort((a,b)=>b.value-a.value||a.tiempoMs-b.tiempoMs||a.intentos-b.intentos||a.equipo-b.equipo);
    let previous=null,rank=0;
    return sorted.map((t,i)=>{
      if(!previous||previous.value!==t.value||previous.tiempoMs!==t.tiempoMs||previous.intentos!==t.intentos)rank=i+1;
      previous=t;return {...t,rank};
    });
  }
  function renderFilters(){filters.replaceChildren();for(const m of MODES){
    const b=make('button','scores-filter'+(m.key===mode?' is-active':''),m.button);
    b.type='button';b.setAttribute('aria-pressed',String(m.key===mode));b.onclick=()=>{mode=m.key;renderFilters();render();};filters.append(b);
  }}
  function render(){
    const selected=MODES.find(m=>m.key===mode),ordered=ranked();
    el('scoresActivityLabel').textContent=selected.label;el('scoresActivityDesc').textContent=selected.detail;
    el('scoresCount').textContent=String(ordered.length).padStart(2,'0');
    el('scoresHighest').textContent=ordered.length?String(ordered[0].value)+' / '+(mode==='total'?'100':'20'):'—';
    podium.replaceChildren();
    ordered.slice(0,3).forEach(t=>{
      const card=make('div','scores-podium-card'+(t.rank===1?' is-first':''));
      card.append(make('span','scores-podium-rank','#'+String(t.rank).padStart(2,'0')),
        make('strong','scores-podium-team','EQUIPO '+String(t.equipo).padStart(2,'0')),
        make('span','scores-podium-points',t.value+' PTS · '+duration(t.tiempoMs)));
      podium.append(card);
    });
    podium.hidden=!ordered.length;rows.replaceChildren();
    if(!ordered.length){const tr=make('tr'),td=make('td','scores-empty',loaded?'Aún no hay equipos registrados.':'Consultando resultados...');td.colSpan=5;tr.append(td);rows.append(tr);return;}
    for(const t of ordered){
      const tr=make('tr',t.rank===1?'scores-leader':'');
      tr.append(make('td','scores-rank','#'+String(t.rank).padStart(2,'0')),
        make('td','scores-team','EQUIPO '+String(t.equipo).padStart(2,'0')+' · '+t.estado),
        make('td','scores-value',t.value+' / '+(mode==='total'?'100':'20')),
        make('td','scores-time',duration(t.tiempoMs)),
        make('td','scores-tries',String(t.intentos)));
      rows.append(tr);
    }
  }
  function visible(){return !overlay||!overlay.hidden;}
  async function refresh(){if(busy||!visible())return;busy=true;status.textContent='ACTUALIZANDO...';
    try{const r=await fetch('/api/scores',{cache:'no-store'}),data=await r.json();
      if(!r.ok||!Array.isArray(data.scores))throw Error(data.error||'Respuesta inválida');
      scores=data.scores;loaded=true;render();
      status.textContent='ACTUALIZADO: '+new Date().toLocaleTimeString('es-MX')+' · CLASIFICACIÓN PROVISIONAL MIENTRAS HAYA EQUIPOS EN CURSO';
    }catch(err){status.textContent='SIN CONEXIÓN: '+err.message;}finally{busy=false;}
  }
  renderFilters();render();el('scoresRefreshBtn').onclick=refresh;
  if(overlay&&openBtn&&closeBtn){
    const close=()=>{overlay.hidden=true;document.body.classList.remove('scores-is-open');openBtn.setAttribute('aria-expanded','false');(previousFocus||openBtn).focus();};
    openBtn.onclick=()=>{previousFocus=document.activeElement;overlay.hidden=false;document.body.classList.add('scores-is-open');openBtn.setAttribute('aria-expanded','true');closeBtn.focus();refresh();};
    closeBtn.onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.addEventListener('keydown',e=>{if(overlay.hidden)return;if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){const list=[...overlay.querySelectorAll('button:not(:disabled),a[href]')];if(!list.length)return;
        if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus();}
        else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus();}}
    });
  }else refresh();
  setInterval(()=>{if(visible()&&!document.hidden)refresh();},10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&visible())refresh();});
})();
