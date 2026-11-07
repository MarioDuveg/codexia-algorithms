'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'algoritmos-pso-test-'));
process.env.ALGORITMOS_DATA_DIR=temp;
process.env.SUPABASE_DISABLED='1'; // evita cualquier escritura a la base real
process.env.ADMIN_PASSWORD='Docente_Test_Clave_2026';
const app=require('../app');
const server=app.listen(0,'127.0.0.1');
function client(host){
  let cookie='';
  return async (route,body)=>{
    const headers={};if(cookie)headers.cookie=cookie;
    if(body!==undefined)headers['content-type']='application/json';
    if(route==='/api/answer' && body?.level)await fetch(host+'/reto/'+body.level,{headers});
    const r=await fetch(host+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
    const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
    const text=await r.text();let data;
    try{data=JSON.parse(text);}catch{data=text;}
    return {status:r.status,data};
  };
}
const valid=['9','6','D','7','5'];
const actions={
  1:[['scan',3],['scan',6],['scan',9],['scan',12]],
  2:[['step',null],['step',null],['step',null],['step',null]],
  3:[['launch','A'],['launch','B'],['launch','C'],['launch','D']],
  4:[['test',1],['test',3],['test',7]],
  5:[['iteration',null],['iteration',null],['iteration',null],['iteration',null],['iteration',null]],
};
async function runLab(api,level){
  assert.equal((await api('/reto/'+level)).status,200);
  assert.equal((await api('/api/answer',{level,answer:valid[level-1]})).status,409,'no se acepta responder sin experimentar');
  for(let i=0;i<actions[level].length;i++){
    const [action,value]=actions[level][i];
    const r=await api('/api/experiment',{level,action,value});
    assert.equal(r.status,200,JSON.stringify(r));
    assert.equal(r.data.ready,i===actions[level].length-1,'solo al final se desbloquea');
  }
  const state=(await api('/api/experiment/state')).data;
  assert.equal(state.ready,true);
  assert.equal(state.events.length,actions[level].length);
}

test('Cinco retos PSO, 100 puntos, 3 intentos, cronómetro, ranking, reintentos y admin',async()=>{
  if (!server.listening) await new Promise(resolve=>server.once('listening',resolve));
  const host='http://127.0.0.1:'+server.address().port;
  const a=client(host),b=client(host),c=client(host),d=client(host),admin=client(host);
  const originalNow=Date.now;
  try{
    const html=(await a('/')).data;
    assert.match(html,/ALGORITMOS/);
    assert.match(html,/PARTICLE SWARM OPTIMIZATION/);
    assert.match(html,/15 MINUTOS/);
    assert.match(html,/100/);
    assert.match(html,/youtube-nocookie\.com\/embed\/M8N3masC6oo/);
    assert.match(html,/youtu\.be\/M8N3masC6oo/);
    assert.doesNotMatch(html,/ciberseguridad/i);
    const homeJs=(await a('/public/main.js')).data;
    assert.match(homeJs,/function setIntroVideoVisible/);
    assert.match(homeJs,/about:blank/);
    assert.match((await a('/resultados')).data,/MARCADOR/);
    assert.match((await a('/resultados')).data,/BATALLA FINAL/);
    assert.match((await a('/resultados')).data,/TALLER 2/);
    assert.match((await a('/ranking')).data,/RANKING/);
    assert.match((await a('/scores')).data,/RANKING/);
    assert.match((await a('/public/resultados.js')).data,/api\/general-scores/);
    assert.equal((await a('/api/general-scores')).status,503);
    assert.match(html,/taller_2/);
    const config=(await a('/api/config')).data;
    assert.deepEqual([config.maxScore,config.maxAttempts,config.maxDurationMs,config.speedMax],[100,3,900000,6]);
    assert.deepEqual(config.baseByAttempt,[14,10,6]);
    for(const n of [null,'',0,21,2.1,'no',undefined])assert.equal((await a('/api/start',{teamNumber:n})).status,400);
    assert.equal((await a('/reto/1')).status,401);
    assert.equal((await a('/api/start',{teamNumber:1})).status,201);
    assert.equal((await a('/api/state')).data.score,0);
    assert.equal((await a('/reto/5')).status,403);
    assert.equal((await a('/api/experiment',{level:1,action:'scan',value:888})).status,409); // primero abrir reto
    const reto1=(await a('/reto/1')).data;
    assert.match(reto1,/TERRENO OCULTO/);
    assert.doesNotMatch(reto1,/answer: '8'/);
    assert.match(reto1,/swarmCanvas/);
    assert.match(reto1,/swarm.js/);
    assert.match(reto1,/PRECISIÓN/);
    assert.match((await a('/public/swarm.js')).data,/function draw5/);
    for(let i=1;i<=5;i++){
      await runLab(a,i);
      const answer=await a('/api/answer',{level:i,answer:valid[i-1]});
      assert.equal(answer.status,200);
      assert.equal(answer.data.ok,true);
      assert.equal(answer.data.points,20);
      assert.equal(answer.data.score,i*20);
    }
    const aState=(await a('/api/state')).data;
    assert.equal(aState.score,100);
    assert.equal(aState.results.length,5);
    assert.equal(aState.ended,true);
    assert.equal(aState.totalAttempts,5);
    assert.equal((await a('/api/answer',{level:5,answer:'5'})).status,409);
    assert.equal((await a('/api/retry',{})).status,201);
    assert.equal((await a('/api/state')).data.score,0);
    assert.equal((await b('/api/start',{teamNumber:2})).status,201);
    await runLab(b,1);
    const bad1=await b('/api/answer',{level:1,answer:'99'});
    assert.equal(bad1.data.remaining,2);
    assert.equal(bad1.data.advanced,false);
    assert.equal((await b('/api/state')).data.currentAttempts,1);
    const good2=await b('/api/answer',{level:1,answer:'9'});
    assert.equal(good2.data.points,16);
    for(let i=2;i<=5;i++){await runLab(b,i);assert.equal((await b('/api/answer',{level:i,answer:valid[i-1]})).data.points,20);}
    assert.equal((await b('/api/state')).data.score,96);
    assert.equal((await c('/api/start',{teamNumber:3})).status,201);
    await runLab(c,1);
    for(let i=0;i<3;i++){
      const res=await c('/api/answer',{level:1,answer:'-1'});
      assert.equal(res.data.ok,false);
      assert.equal(res.data.advanced,i===2);
      if(i===2)assert.equal(res.data.points,0);
    }
    assert.equal((await c('/api/state')).data.currentLevel,2);
    assert.equal((await c('/api/state')).data.results[0].points,0);
    assert.equal((await c('/api/answer',{level:1,answer:'9'})).status,409);
    await runLab(c,2);
    assert.equal((await c('/api/answer',{level:2,answer:'0'})).data.remaining,2);
    assert.equal((await c('/api/answer',{level:2,answer:'0'})).data.remaining,1);
    assert.equal((await c('/api/answer',{level:2,answer:'6'})).data.points,12);
    assert.equal((await c('/api/state')).data.score,12);
    let leaderboard=(await d('/api/scores')).data.scores;
    assert.equal(leaderboard.find(t=>t.equipo===1).puntos,100); // conserva mejor de varios intentos
    assert.equal(leaderboard.find(t=>t.equipo===2).puntos,96);
    assert.deepEqual(leaderboard.map(t=>t.equipo),[1,2,3]);
    assert.deepEqual(leaderboard[0].porReto,[20,20,20,20,20]);
    // Bonus por rapidez: cálculo en servidor; recargar el reto no reinicia su reloj.
    const e=client(host);
    assert.equal((await e('/api/start',{teamNumber:4})).status,201);
    await e('/reto/1');
    const started4=(await e('/api/state')).data.serverNow;
    Date.now=()=>started4+45_000;
    await e('/reto/1'); // recarga; el tiempo debe mantenerse
    await runLab(e,1);
    const timed=await e('/api/answer',{level:1,answer:'9'});
    assert.equal(timed.data.points,18); // 14 de precisión + 4 de rapidez
    assert.equal(timed.data.basePoints,14);
    assert.equal(timed.data.bonusPoints,4);
    assert.ok(timed.data.durationMs >= 45_000);
    Date.now=originalNow;
    assert.equal((await e('/api/state')).data.results[0].points,18);
    assert.equal((await admin('/api/admin/teams')).status,401);
    assert.equal((await admin('/api/admin/login',{password:'mal'})).status,401);
    assert.equal((await admin('/api/admin/login',{password:process.env.ADMIN_PASSWORD})).status,200);
    const teachers=(await admin('/api/admin/teams')).data;
    assert.equal(teachers.total,4);
    assert.equal(teachers.teams[0].score,100);
    assert.equal((await d('/api/start',{teamNumber:19})).status,201);
    const start=(await d('/api/state')).data.startedAt;
    Date.now=()=>start+900001;
    const expired=(await d('/api/state')).data;
    assert.equal(expired.ended,true);
    assert.equal(expired.expiredAt,start+900000);
    assert.equal(expired.elapsedMs,900000);
    assert.equal(expired.score,0);
    assert.equal((await d('/api/answer',{level:1,answer:'9'})).status,409);
    Date.now=originalNow;
    assert.equal((await admin('/api/admin/reset',{confirm:'No'})).status,400);
    assert.equal((await admin('/api/admin/reset',{confirm:'REINICIAR'})).status,200);
    assert.equal((await a('/api/scores')).data.scores.length,0);
    assert.equal((await a('/api/state')).data.started,false);
    const persisted=JSON.parse(fs.readFileSync(path.join(temp,'equipos.json'),'utf8'));
    assert.equal(persisted.version,2);
    assert.equal(persisted.teams.length,0);
  }finally{
    Date.now=originalNow;
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
