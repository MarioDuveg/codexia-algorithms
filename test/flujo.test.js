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
    const r=await fetch(host+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
    const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
    const text=await r.text();let data;
    try{data=JSON.parse(text);}catch{data=text;}
    return {status:r.status,data};
  };
}
const valid=['8','5','D','10','5'];
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
    assert.doesNotMatch(html,/youtube-nocookie|ciberseguridad/);
    assert.match(html,/taller_2/);
    const config=(await a('/api/config')).data;
    assert.deepEqual([config.maxScore,config.maxAttempts,config.maxDurationMs],[100,3,900000]);
    for(const n of [null,'',0,21,2.1,'no',undefined])assert.equal((await a('/api/start',{teamNumber:n})).status,400);
    assert.equal((await a('/reto/1')).status,401);
    assert.equal((await a('/api/start',{teamNumber:1})).status,201);
    assert.equal((await a('/api/state')).data.score,0);
    assert.equal((await a('/reto/5')).status,403);
    const reto1=(await a('/reto/1')).data;
    assert.match(reto1,/f\(x\) = \(x − 7\)²/);
    assert.doesNotMatch(reto1,/answer: '8'/);
    for(let i=1;i<=5;i++){
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
    const bad1=await b('/api/answer',{level:1,answer:'99'});
    assert.equal(bad1.data.remaining,2);
    assert.equal(bad1.data.advanced,false);
    assert.equal((await b('/api/state')).data.currentAttempts,1);
    const good2=await b('/api/answer',{level:1,answer:'8'});
    assert.equal(good2.data.points,15);
    for(let i=2;i<=5;i++)assert.equal((await b('/api/answer',{level:i,answer:valid[i-1]})).data.points,20);
    assert.equal((await b('/api/state')).data.score,95);
    assert.equal((await c('/api/start',{teamNumber:3})).status,201);
    for(let i=0;i<3;i++){
      const res=await c('/api/answer',{level:1,answer:'-1'});
      assert.equal(res.data.ok,false);
      assert.equal(res.data.advanced,i===2);
      if(i===2)assert.equal(res.data.points,0);
    }
    assert.equal((await c('/api/state')).data.currentLevel,2);
    assert.equal((await c('/api/state')).data.results[0].points,0);
    assert.equal((await c('/api/answer',{level:1,answer:'8'})).status,409);
    assert.equal((await c('/api/answer',{level:2,answer:'0'})).data.remaining,2);
    assert.equal((await c('/api/answer',{level:2,answer:'0'})).data.remaining,1);
    assert.equal((await c('/api/answer',{level:2,answer:'5'})).data.points,10);
    assert.equal((await c('/api/state')).data.score,10);
    let leaderboard=(await d('/api/scores')).data.scores;
    assert.equal(leaderboard.find(t=>t.equipo===1).puntos,100); // conserva mejor de varios intentos
    assert.equal(leaderboard.find(t=>t.equipo===2).puntos,95);
    assert.deepEqual(leaderboard.map(t=>t.equipo),[1,2,3]);
    assert.deepEqual(leaderboard[0].porReto,[20,20,20,20,20]);
    assert.equal((await admin('/api/admin/teams')).status,401);
    assert.equal((await admin('/api/admin/login',{password:'mal'})).status,401);
    assert.equal((await admin('/api/admin/login',{password:process.env.ADMIN_PASSWORD})).status,200);
    const teachers=(await admin('/api/admin/teams')).data;
    assert.equal(teachers.total,3);
    assert.equal(teachers.teams[0].score,100);
    assert.equal((await d('/api/start',{teamNumber:19})).status,201);
    const start=(await d('/api/state')).data.startedAt;
    Date.now=()=>start+900001;
    const expired=(await d('/api/state')).data;
    assert.equal(expired.ended,true);
    assert.equal(expired.expiredAt,start+900000);
    assert.equal(expired.elapsedMs,900000);
    assert.equal(expired.score,0);
    assert.equal((await d('/api/answer',{level:1,answer:'8'})).status,409);
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
