'use strict';
// LABORATORIOS: cada movimiento envía una medición al servidor. La gráfica
// representa los datos realmente explorados por el equipo y no una animación ornamental.
(() => {
  const root = document.querySelector('[data-swarm-mode]');
  if (!root) return;
  const mode=Number(root.dataset.swarmMode),review=root.dataset.review==='true';
  const canvas=document.getElementById('swarmCanvas'),ctx=canvas?.getContext('2d');
  const controls=document.getElementById('experimentControls');
  const status=document.getElementById('swarmStatus');
  const readiness=document.getElementById('labReadiness');
  const log=document.getElementById('experimentLog');
  if(!ctx||!controls||!status||!readiness||!log)return;
  const W=760,H=295;
  const cyan='#86f0d2',mint='#99f4b8',pink='#fc87b3',gold='#ffd58a',dim='#a5b3be';
  const colors=['#93e7cb','#f08caa','#ad9ef1','#ffd58a'];
  let state={level:mode,events:[],ready:false,progress:''},busy=false,readySent=false,forceMask=7;
  let lastSnapshot=[],motionStarted=0,frame=0;
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const lineX=(x,min=0,max=17)=>68+(x-min)/(max-min)*620;
  const txt=(value,x,y,color=dim,size=12,align='left')=>{
    ctx.font=`${size}px ui-monospace,SFMono-Regular,Consolas,monospace`;
    ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(value),x,y);ctx.textAlign='left';
  };
  function line(x1,y1,x2,y2,color='#405065',width=1,dash=[]){
    ctx.save();ctx.beginPath();ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();
  }
  function dot(x,y,r,color,halo=false){
    ctx.save();if(halo){ctx.shadowColor=color;ctx.shadowBlur=16;}
    ctx.beginPath();ctx.fillStyle=color;ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function ring(x,y,r,color){ctx.save();ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.restore();}
  function base(heading,subtitle){
    ctx.clearRect(0,0,W,H);
    const g=ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,'#0b1a23');g.addColorStop(1,'#171224');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    for(let x=20;x<W;x+=40)line(x,0,x,H,'#34415837');
    for(let y=23;y<H;y+=32)line(0,y,W,y,'#34415837');
    txt(heading,22,25,cyan,12);txt(subtitle,22,45,dim,11);
  }
  function axis(y,min=0,max=17){
    line(68,y,688,y,'#718396',2);
    for(let x=min;x<=max;x+=2){let px=lineX(x,min,max);line(px,y-5,px,y+6,'#667484');txt(x,px,y+22,dim,12,'center');}
    txt('POSICIÓN x',688,y+39,dim,11,'right');
  }
  function arrow(x1,y,x2,color){
    line(x1,y,x2,y,color,3);
    if(Math.abs(x2-x1)<6)return;
    const dir=x2>x1?1:-1;
    line(x2,y,x2-10*dir,y-6,color,2);
    line(x2,y,x2-10*dir,y+6,color,2);
  }
  function actionText(event){
    if(mode===1)return `Sensor x=${event.position} → costo ${event.cost}`;
    if(mode===2)return `Visita ${event.step}: x=${event.position} · costo ${event.cost} · pBest=${event.pBest}${event.improved?' (mejoró)':' (no cambia)'}`;
    if(mode===3)return `Partícula ${event.letter}: ${event.from}→${event.to} · pBest=${event.pBest} · costo ${event.pBestCost}`;
    if(mode===4)return `Fuerzas ${['','I','M','I+M','G','I+G','M+G','I+M+G'][event.mask]} · v′=${event.velocity} · x′=${event.position}`;
    return `Ronda ${event.step}: gBest costo=${event.globalBestCost} · ${event.improved?'mejora':'sin mejora'} · estancamiento=${event.withoutImprovement}/2`;
  }
  function renderLog(){
    log.replaceChildren();
    if(!state.events.length){log.textContent='Todavía no hay datos. Usa los controles del laboratorio.';return;}
    for(const e of state.events){
      const entry=document.createElement('div');entry.className='log-entry';
      entry.textContent=actionText(e);log.appendChild(entry);
    }
  }
  function scanBtns(){
    for(const x of [3,6,9,12]){
      addButton(`◉ SENSOR x=${x}`,()=>act('scan',x),state.events.some(e=>e.position===x));
    }
  }
  function addButton(label,fn,disabled=false){
    const button=document.createElement('button');button.type='button';
    button.className='lab-action';button.textContent=label;
    button.disabled=busy||disabled||state.ready||review;
    if(disabled)button.classList.add('lab-used');
    button.addEventListener('click',fn);controls.appendChild(button);
    return button;
  }
  function makeControls(){
    controls.replaceChildren();
    if(review){
      const box=document.createElement('p');box.className='lab-review-label';box.textContent='Experimento finalizado · estas son las mediciones que registraste.';
      controls.appendChild(box);return;
    }
    if(mode===1)scanBtns();
    if(mode===2)addButton(`▶ AVANZAR VISITA (${state.events.length}/4)`,()=>act('step',null));
    if(mode===3)for(const letter of ['A','B','C','D'])addButton(`▶ LANZAR ${letter}`,()=>act('launch',letter),state.events.some(e=>e.letter===letter));
    if(mode===4){
      const fields=document.createElement('div');fields.className='force-picker';
      for(const [mask,name,subtitle] of [[1,'INERCIA','0.5 × v'],[2,'MEMORIA','pBest − x'],[4,'ENJAMBRE','gBest − x']]){
        const item=document.createElement('label');item.className='force-switch';
        const check=document.createElement('input');check.type='checkbox';check.dataset.mask=String(mask);check.checked=Boolean(forceMask&mask);check.disabled=busy||state.ready;
        check.addEventListener('change',()=>{forceMask=check.checked?(forceMask|mask):(forceMask&~mask);});
        const text=document.createElement('span');text.textContent=name+' · '+subtitle;
        item.append(check,text);fields.appendChild(item);
      }
      controls.appendChild(fields);
      const last=state.events[state.events.length-1];
      const run=addButton('▶ SIMULAR COMBINACIÓN',()=>{
        const mask=Array.from(fields.querySelectorAll('input:checked')).reduce((sum,x)=>sum+Number(x.dataset.mask),0);
        if(mask===0){status.textContent='Activa al menos una de las tres fuerzas.';return;}
        if(state.events.some(e=>e.mask===mask)){status.textContent='Ya mediste esa combinación. Cambia al menos una fuerza.';return;}
        act('test',mask);
      });
      run.classList.add('lab-run');
      if(last&&!state.ready)status.textContent=`Última prueba: v′=${last.velocity}, x′=${last.position}. Compara otras fuerzas.`;
    }
    if(mode===5)addButton(`▶ EJECUTAR ITERACIÓN (${state.events.length}/5)`,()=>act('iteration',null));
  }
  function setState(next){
    lastSnapshot=state.events.slice();
    state=next;motionStarted=performance.now();
    renderLog();makeControls();
    readiness.textContent=state.ready?'✓ EXPERIMENTO COMPLETO · RESPONDE':'◷ '+state.progress;
    readiness.classList.toggle('ready',state.ready);
    if(state.ready&&!readySent&&!review){
      readySent=true;
      window.dispatchEvent(new Event('pso-lab-ready'));
      status.textContent='Experimento completo. Analiza las mediciones y escribe tu respuesta.';
    }else if(!state.ready){
      status.textContent=state.events.length?`Medición ${state.events.length} registrada. ${state.progress}`:'Interactúa con el laboratorio para generar tus propios datos.';
    }
  }
  async function act(action,value){
    if(busy||state.ready||review)return;
    busy=true;makeControls();status.textContent='Simulando y guardando la medición...';
    try{
      const response=await fetch('/api/experiment',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({level:mode,action,value}),
      });
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'No se pudo realizar la prueba.');
      setState(data);
    }catch(err){status.textContent='Error de laboratorio: '+err.message+' · vuelve a intentarlo.';}
    finally{busy=false;makeControls();}
  }
  const pulse=()=>{const elapsed=performance.now()-motionStarted;return clamp(elapsed/650,0,1);};
  const tween=(a,b)=>a+(b-a)*pulse();
  function draw1(){
    base('01 // RADAR DEL TERRENO OCULTO','Pulsa los cuatro sensores. Cada medición revela un costo.');
    const y=203;axis(y,0,14);
    const ee=state.events;
    for(const x of [3,6,9,12]){
      const xp=lineX(x,0,14);dot(xp,y,5,'#617181');
      txt('?',xp,93,'#738b99',13,'center');
    }
    for(const e of ee){
      const xp=lineX(e.position,0,14),height=18+(e.cost/25)*89;
      line(xp,y-7,xp,y-height,'#7ce4b099',3);
      dot(xp,y-height,8,cyan,true);
      txt(`f=${e.cost}`,xp,y-height-19,'#fff4dd',14,'center');
      txt(`x=${e.position}`,xp,y+42,cyan,12,'center');
    }
    if(ee.length){
      const best=ee.reduce((a,b)=>a.cost<=b.cost?a:b),px=lineX(best.position,0,14);
      ring(px,y-(18+best.cost/25*89),16,gold);
      txt('MEJOR COSTO OBSERVADO: '+best.cost,23,279,gold,12);
    }else txt('El terreno todavía no ha sido medido.',23,278,dim,12);
  }
  function draw2(){
    base('02 // LA MEMORIA NO ES LA POSICIÓN ACTUAL','Avanza el recorrido y compara el punto actual con pBest.');
    axis(199,0,14);
    const ee=state.events;
    if(!ee.length){txt('Pulsa AVANZAR para que la partícula descubra posiciones.',23,97,dim,13);return;}
    const current=ee[ee.length-1];
    for(let i=0;i<ee.length;i++){
      const p=ee[i],px=lineX(p.position,0,14);
      if(i){const prev=ee[i-1],fx=lineX(prev.position,0,14);
        arrow(fx,129,px,i===ee.length-1?pink:'#647c8a');}
      dot(px,129,5,'#778798');txt(String(p.step),px,106,dim,11,'center');
    }
    const xp=lineX(current.position,0,14),bp=lineX(current.pBest,0,14);
    dot(tween(lineX(ee.length>1?ee[ee.length-2].position:current.position,0,14),xp),129,10,pink,true);
    dot(bp,199,8,mint,true);ring(bp,199,17,mint);
    txt(`ACTUAL: x=${current.position} · COSTO=${current.cost}`,23,80,pink,13);
    txt(`MEMORIA: pBest = ${current.pBest} · COSTO=${current.pBestCost}`,23,276,mint,12);
  }
  function draw3(){
    base('03 // UNA RED DE CUATRO EXPLORADORES','Lanza A, B, C y D. Compara sus mejores costos personales.');
    const ee=state.events;
    line(65,257,692,257,'#576978',2);
    for(let x=0;x<=16;x+=2){const xp=lineX(x,0,17);line(xp,252,xp,261,'#677581');txt(x,xp,276,dim,11,'center');}
    const labels=['A','B','C','D'];
    for(let i=0;i<4;i++){
      const letter=labels[i],y=91+i*41,e=ee.find(x=>x.letter===letter);
      txt('PARTÍCULA '+letter,16,y+5,colors[i],11);
      line(146,y,688,y,'#455468',1);
      if(!e){txt('SIN LANZAR',300,y+5,'#8295a1',12);continue;}
      const x0=lineX(e.from,0,17),x1=lineX(e.to,0,17),xNow=tween(x0,x1);
      arrow(x0,y,xNow,colors[i]);dot(x0,y,5,'#63727f');dot(xNow,y,8,colors[i],true);
      ring(lineX(e.pBest,0,17),y,13,mint);
      txt('pBest costo '+e.pBestCost,686,y-10,mint,11,'right');
    }
    if(ee.length){
      const champion=ee[ee.length-1].gBestParticle;
      const winner=ee.find(e=>e.letter===champion);
      if(winner){
        const wy=91+labels.indexOf(champion)*41,wx=lineX(winner.pBest,0,17);
        ring(wx,wy,20,gold);
        txt('gBest',wx,wy-22,gold,11,'center');
      }
      txt('MEJOR COSTO ENTRE LANZADAS: '+Math.min(...ee.map(e=>e.pBestCost)),23,55,gold,11);
    }
  }
  function draw4(){
    base('04 // VECTOR DE MOVIMIENTO','Activa/desactiva fuerzas: el salto cambia según su suma.');
    const ee=state.events,current=ee[ee.length-1];
    axis(208,0,12);
    const from=lineX(3,0,12);dot(from,208,9,pink,true);txt('INICIO x=3',from,243,pink,12,'center');
    if(!current){txt('Elige fuerzas y pulsa SIMULAR COMBINACIÓN.',22,91,dim,13);return;}
    const to=lineX(current.position,0,12),now=tween(from,to);
    line(from,208,now,208,cyan,4);dot(now,208,9,cyan,true);ring(to,208,18,gold);
    txt(`INERCIA +${current.inertia} · MEMORIA +${current.memory} · ENJAMBRE +${current.social}`,22,89,'#efe0ed',13);
    txt(`VELOCIDAD v′ = ${current.velocity}`,22,126,cyan,15);
    txt(`POSICIÓN x′ = ${current.position}`,22,151,gold,15);
    txt('PRUEBAS REGISTRADAS: '+ee.length,22,275,dim,11);
  }
  function draw5(){
    base('05 // CONVERGENCIA: BUSCAR SIN MEJORAR','Controla cinco rondas. gBest conserva el mejor costo histórico.');
    const ee=state.events,last=ee[ee.length-1];
    line(45,219,441,219,'#677581',2);
    txt('ENJAMBRE SOBRE EL EJE x',42,73,dim,12);
    for(let x=0;x<=18;x+=3){let xp=45+x/18*396;line(xp,215,xp,224,'#677581');txt(x,xp,242,dim,11,'center');}
    if(last){
      const prev=ee.length>1?ee[ee.length-2]:last;
      for(let i=0;i<last.positions.length;i++){
        const cx=45+tween(prev.positions[i],last.positions[i])/18*396,y=109+i*28;
        dot(cx,y,8,colors[i],true);
        txt(String.fromCharCode(65+i),cx-14,y+4,colors[i],12,'right');
        line(cx,y+9,cx,219,colors[i]+'45');
      }
      const gx=45+last.globalBestX/18*396;
      ring(gx,216,15,gold);txt('gBest '+last.globalBestCost,gx,266,gold,12,'center');
    }else txt('PULSA EJECUTAR ITERACIÓN PARA MOVER EL ENJAMBRE',40,146,dim,12);
    line(476,64,476,229,'#566779',1);line(476,229,736,229,'#566779',1);
    txt('COSTO gBest',485,84,gold,12);
    for(let v=0;v<=20;v+=5){const py=224-v/20*125;line(477,py,731,py,'#6c7a8633');txt(v,473,py+4,dim,10,'right');}
    let previous=null;
    for(const e of ee){
      const point={x:487+e.step*43,y:224-e.globalBestCost/20*125};
      if(previous)line(previous.x,previous.y,point.x,point.y,cyan,2);
      dot(point.x,point.y,5,e.improved?mint:pink,true);
      txt(e.step,point.x,246,dim,11,'center');previous=point;
    }
    if(last)txt(`SIN MEJORA CONSECUTIVA: ${last.withoutImprovement}/2`,487,276,last.withoutImprovement>=2?pink:mint,11);
    else txt('ITERACIÓN 0 / 5',487,276,dim,11);
  }
  function draw(){
    if(mode===1)draw1();else if(mode===2)draw2();else if(mode===3)draw3();else if(mode===4)draw4();else draw5();
  }
  function animate(){
    draw();
    if(pulse()<1)frame=requestAnimationFrame(animate);
    else frame=0;
  }
  const oldSetState=setState;
  setState=function(next){oldSetState(next);if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(animate);};
  const seed=document.getElementById('labReviewData');
  if(review&&seed){
    try{setState(JSON.parse(seed.textContent));}catch{status.textContent='No se pudo mostrar el registro del reto.';draw();}
  }else{
    draw();
    fetch('/api/experiment/state',{cache:'no-store'})
      .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Error de sesión');return data;})
      .then(setState)
      .catch(err=>{status.textContent='Error al cargar el laboratorio: '+err.message+' · recarga el reto.';});
  }
  window.addEventListener('pagehide',()=>{if(frame)cancelAnimationFrame(frame);},{once:true});
})();
