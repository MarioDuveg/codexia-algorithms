'use strict';
// Demostraciones didácticas reales de PSO (canvas, sin librerías externas).
// Sus datos son independientes de las respuestas del concurso.
(() => {
  const root = document.querySelector('[data-swarm-mode]');
  if (!root) return;
  const mode = Number(root.dataset.swarmMode);
  const canvas = document.getElementById('swarmCanvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const play = document.getElementById('swarmToggle');
  const reset = document.getElementById('swarmReset');
  const status = document.getElementById('swarmStatus');
  const W = 760, H = 255, X0 = 60, X1 = 700;
  const colors = ['#77e7cb', '#ff80ad', '#9ca5ff', '#ffd381', '#81c0fc', '#e69efa'];
  const cap = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
  const lerp = (a,b,t) => a+(b-a)*t;
  const fmt = x => Number(x).toFixed(1);
  let seed, frame, lastTick = 0, iteration, running, particles, globalBest, target, prev, history;
  const rand = () => {seed = (seed*1664525+1013904223) >>> 0; return seed/4294967296;};
  const mapX = x => X0+(X1-X0)*(x/16);
  const xy = p => ({x:58+p.x*637,y:28+p.y*184});
  const cost1d = x => (x-target)*(x-target);
  const cost2d = p => Math.pow(p.x-0.68,2)+Math.pow(p.y-0.43,2);
  const cleanP = (x,y,v=0,name='') => ({x,y,v,name,px:x,py:y,prevX:x,prevY:y,trail:[{x,y}]});
  const bestParticle = () => particles.reduce((a,b)=>cost1d(a.px)<cost1d(b.px)?a:b);
  function setStatus(text) {status.textContent=text;}
  function initialize(autoplay=true) {
    seed=1009+mode*173;
    iteration=0;history=[];lastTick=performance.now();
    target= mode===1?7:mode===3?10:5;
    if(mode===1) particles=[2,5,8,11].map((x,i)=>cleanP(x,0.28+i*0.16,0.15-i*.05,String(i+1)));
    if(mode===2) particles=[cleanP(1,.55,0,'ÚNICA')];
    if(mode===3) particles=[4,8,14,11].map((x,i)=>cleanP(x,0.27+i*.17,0,i>=0?'ABCD'[i]:''));
    if(mode===4) particles=[cleanP(2,.55,1,'EJEMPLO')];
    if(mode===5) {
      target=null;
      particles=Array.from({length:13},(_,i)=>{
        const x=0.06+rand()*.86,y=.09+rand()*.81;
        const p=cleanP(x,y,0,String(i+1));p.vx=(rand()-.5)*.08;p.vy=(rand()-.5)*.08;return p;
      });
      const best=particles.reduce((a,b)=>cost2d(a)<cost2d(b)?a:b);
      globalBest={x:best.x,y:best.y,cost:cost2d(best)};
      history=[globalBest.cost];
    }
    if(mode===1||mode===3){
      const best=bestParticle();globalBest={x:best.px,cost:cost1d(best.px)};
    }
    if(mode===2) globalBest={x:1,cost:cost1d(1)};
    if(mode===4) globalBest={x:6,cost:1};
    prev=particles.map(p=>({x:p.x,y:p.y}));
    running=autoplay;
    play.textContent=running?'⏸ PAUSAR':'▶ REPRODUCIR';
    play.setAttribute('aria-pressed',String(running));
    if(mode===1)setStatus('Ronda inicial · 4 partículas buscando el mínimo');
    if(mode===2)setStatus('Visita 1/6 · x actual: 1 · pBest: 1');
    if(mode===3)setStatus('Ronda inicial · A, B, C y D comparten el gBest');
    if(mode===4)setStatus('Ejemplo distinto: x = 2, v = 1, pBest = 4, gBest = 6');
    if(mode===5)setStatus('Iteración 0 · 13 partículas exploran un espacio 2D');
    render(1);
  }
  function step() {
    iteration++;
    prev=particles.map(p=>({x:p.x,y:p.y}));
    if(mode===1||mode===3){
      for(const p of particles){
        const r1=rand(),r2=rand();
        p.v=cap(0.48*p.v+1.25*r1*(p.px-p.x)+1.45*r2*(globalBest.x-p.x),-2.8,2.8);
        p.x=cap(p.x+p.v,0.2,15.8);
        if(cost1d(p.x)<cost1d(p.px))p.px=p.x;
        p.trail.push({x:p.x,y:p.y});
        if(p.trail.length>12)p.trail.shift();
      }
      const best=bestParticle();
      if(cost1d(best.px)<globalBest.cost)globalBest={x:best.px,cost:cost1d(best.px)};
      setStatus(`Iteración ${iteration} · gBest aproximado: ${fmt(globalBest.x)} · costo: ${globalBest.cost.toFixed(2)}`);
      if(iteration>=14)finish('Fin de demostración · reinicia para observar otro recorrido');
    }
    if(mode===2){
      const visits=[1,4,8,7,5,4];
      if(iteration>=visits.length){finish('Fin del recorrido · el mejor lugar visitado queda guardado');return;}
      const p=particles[0];p.x=visits[iteration];
      if(cost1d(p.x)<cost1d(p.px))p.px=p.x;
      p.trail.push({x:p.x,y:p.y});
      globalBest={x:p.px,cost:cost1d(p.px)};
      setStatus(`Visita ${iteration+1}/6 · x actual: ${p.x} · pBest: ${p.px} · costo mínimo: ${globalBest.cost}`);
      if(iteration===visits.length-1)finish();
    }
    if(mode===4){
      const p=particles[0];
      if(iteration%2===1){
        // Demostración con datos diferentes del ejercicio: 0.5(1)+(4-2)+(6-2)=6.5.
        p.x=8.5;p.trail.push({x:p.x,y:p.y});
        setStatus('Inercia 0.5 + memoria 2 + grupo 4 = v′ 6.5 → x′ 8.5');
      }else{
        p.x=2;p.trail=[{x:2,y:p.y}];
        setStatus('Se reinicia el ejemplo: x = 2, pBest = 4, gBest = 6');
      }
    }
    if(mode===5){
      for(const p of particles){
        const r1=rand(),r2=rand();
        p.vx=cap(.52*p.vx+1.5*r1*(p.px-p.x)+1.45*r2*(globalBest.x-p.x),-.18,.18);
        p.vy=cap(.52*p.vy+1.5*r1*(p.py-p.y)+1.45*r2*(globalBest.y-p.y),-.18,.18);
        p.x=cap(p.x+p.vx,.02,.98);p.y=cap(p.y+p.vy,.02,.98);
        if(cost2d(p)<cost2d({x:p.px,y:p.py})){p.px=p.x;p.py=p.y;}
        p.trail.push({x:p.x,y:p.y});if(p.trail.length>14)p.trail.shift();
        const candidate=cost2d({x:p.px,y:p.py});
        if(candidate<globalBest.cost)globalBest={x:p.px,y:p.py,cost:candidate};
      }
      history.push(globalBest.cost);
      setStatus(`Iteración ${iteration} · mejor costo gBest: ${globalBest.cost.toFixed(4)} · partículas cooperando`);
      if(iteration>=18)finish('Fin de demostración · observa el grupo alrededor del mejor lugar');
    }
  }
  function finish(message) {
    running=false;play.textContent='▶ REPETIR';play.setAttribute('aria-pressed','false');
    if(message)setStatus(message);
  }
  function line(x,y,x2,y2,color='#344353',w=1) {
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=w;ctx.stroke();
  }
  function circle(x,y,r,color,glow=0) {
    ctx.save();ctx.shadowBlur=glow;ctx.shadowColor=color;ctx.fillStyle=color;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function label(value,x,y,color='#b8adbd',size=12,align='left') {
    ctx.fillStyle=color;ctx.font=`${size}px monospace`;ctx.textAlign=align;ctx.fillText(value,x,y);ctx.textAlign='left';
  }
  function arrow(x0,y0,x1,y1,color) {
    line(x0,y0,x1,y1,color,2);
    const a=Math.atan2(y1-y0,x1-x0);
    line(x1,y1,x1-9*Math.cos(a-.5),y1-9*Math.sin(a-.5),color,2);
    line(x1,y1,x1-9*Math.cos(a+.5),y1-9*Math.sin(a+.5),color,2);
  }
  function drawBase() {
    ctx.clearRect(0,0,W,H);
    const grad=ctx.createLinearGradient(0,0,W,H);
    grad.addColorStop(0,'#0c1820');grad.addColorStop(.55,'#141522');grad.addColorStop(1,'#1d1120');
    ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    for(let x=26;x<W;x+=40)line(x,0,x,H,'#26314054');
    for(let y=13;y<H;y+=34)line(0,y,W,y,'#26314054');
    label('PARTICLE SWARM OPTIMIZATION // VISUALIZACIÓN',19,21,'#d4a0bb',11);
  }
  function draw1d(alpha) {
    const y=161;
    line(X0,y,X1,y,'#6d7688',2);
    for(let n=0;n<=16;n+=2){const x=mapX(n);line(x,y-5,x,y+6,'#69758a');label(String(n),x,y+21,'#9eacb8',11,'center');}
    const goal=mapX(target);
    line(goal,59,goal,218,'#e6a35975',2);
    label('MÍNIMO',goal,51,'#ffd28f',11,'center');
    if(mode===4){
      const p=particles[0],drawX=lerp(prev[0].x,p.x,alpha);
      const best=mapX(4),glob=mapX(6);
      line(best,75,best,170,'#7ce7bb82',2);label('pBest 4',best,66,'#7ce7bb',11,'center');
      line(glob,75,glob,170,'#ffd481ad',2);label('gBest 6',glob,83,'#ffd481',11,'center');
      arrow(mapX(2),123,mapX(drawX),123,'#ff90ba');
      circle(mapX(drawX),161,11,'#8debd4',15);
      label('x ACTUAL',mapX(drawX),194,'#d9f8f0',12,'center');
      label('EJEMPLO: v′ = 0.5v + (pBest−x) + (gBest−x)',21,239,'#c4afc5',12);
      return;
    }
    const bestX=mapX(globalBest.x);
    line(bestX,91,bestX,211,'#ffcf8185',2);
    ctx.strokeStyle='#ffcf81';ctx.lineWidth=2;ctx.beginPath();ctx.arc(bestX,161,15,0,Math.PI*2);ctx.stroke();
    label(mode===2?'MEJOR RECUERDO / pBest':'gBest COMPARTIDO',bestX,84,'#ffd481',11,'center');
    particles.forEach((p,i)=>{
      const yPart=mode===2?134:108+((i%4)*12);
      const current=mapX(lerp(prev[i].x,p.x,alpha));
      for(let j=0;j<p.trail.length-1;j++){
        const a=mapX(p.trail[j].x),b=mapX(p.trail[j+1].x);
        line(a,yPart,b,yPart,colors[i%colors.length]+'5c',2);
      }
      const pb=mapX(p.px);
      ctx.save();ctx.beginPath();ctx.setLineDash([3,4]);ctx.strokeStyle='#83e9c1';ctx.lineWidth=1.5;
      ctx.arc(pb,yPart,13,0,Math.PI*2);ctx.stroke();ctx.restore();
      line(current,yPart+9,current,160,colors[i%colors.length]+'62');
      circle(current,yPart,8,colors[i%colors.length],12);
      label(mode===2?'x':p.name,current,yPart-15,'#f1e5ec',11,'center');
    });
    if(mode===2)label('El aro punteado conserva la mejor posición visitada.',20,241,'#b0a8b8',12);
    else label('Las partículas usan memoria personal y la mejor solución compartida.',20,241,'#b0a8b8',12);
  }
  function draw2d(alpha) {
    const goal=xy({x:.68,y:.43});
    const glow=ctx.createRadialGradient(goal.x,goal.y,0,goal.x,goal.y,130);
    glow.addColorStop(0,'#fbc77833');glow.addColorStop(1,'#fbc77800');
    ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    circle(goal.x,goal.y,6,'#ffe3a0',18);
    label('MÍNIMO',goal.x+12,goal.y-11,'#fbd28f',11);
    const gp=xy(globalBest);
    ctx.beginPath();ctx.arc(gp.x,gp.y,14,0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle='#ff9a90';ctx.stroke();
    label('gBest',gp.x+17,gp.y+7,'#ffb0aa',11);
    particles.forEach((p,i)=>{
      const c=colors[i%colors.length];
      for(let j=1;j<p.trail.length;j++){
        const a=xy(p.trail[j-1]),b=xy(p.trail[j]);
        line(a.x,a.y,b.x,b.y,c+'5c',1.6);
      }
      const pb=xy({x:p.px,y:p.py});
      ctx.beginPath();ctx.strokeStyle='#8ae8c065';ctx.lineWidth=1;
      ctx.arc(pb.x,pb.y,8,0,Math.PI*2);ctx.stroke();
      const v=xy({x:lerp(prev[i].x,p.x,alpha),y:lerp(prev[i].y,p.y,alpha)});
      circle(v.x,v.y,5.5,c,8);
    });
    label(`MEJOR COSTO: ${globalBest.cost.toFixed(4)}`,20,239,'#dbe5e1',12);
    label(`ITERACIÓN ${iteration}`,W-18,239,'#ffd58b',12,'right');
  }
  function render(alpha) {drawBase();if(mode===5)draw2d(alpha);else draw1d(alpha);}
  let lastFrame=0;
  function animate(now) {
    frame=requestAnimationFrame(animate);
    if(now-lastFrame<35)return;
    lastFrame=now;
    if(running){
      const interval=mode===4?2600:mode===2?1800:1150;
      if(now-lastTick>interval){lastTick=now;step();}
      render(cap((now-lastTick)/Math.min(interval*.62,700),0,1));
    }else render(1);
  }
  play.addEventListener('click',()=>{
    if(!running && ((mode===5&&iteration>=18)||(mode===1||mode===3)&&iteration>=14||(mode===2&&iteration>=6)))initialize(true);
    else {running=!running;lastTick=performance.now();play.textContent=running?'⏸ PAUSAR':'▶ REPRODUCIR';play.setAttribute('aria-pressed',String(running));}
  });
  reset.addEventListener('click',()=>initialize(true));
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  initialize(!reducedMotion);
  frame=requestAnimationFrame(animate);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){running=false;play.textContent='▶ REPRODUCIR';play.setAttribute('aria-pressed','false');}
  });
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame),{once:true});
})();
