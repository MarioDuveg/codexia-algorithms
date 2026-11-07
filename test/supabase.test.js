'use strict';
// Integra el envío usando una API REST simulada; NO modifica Supabase real.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');

function makeClient(host) {
  let cookie='';
  return async (route,payload)=>{
    const headers={};
    if(cookie)headers.cookie=cookie;
    if(payload!==undefined)headers['content-type']='application/json';
    if(route==='/api/answer' && payload?.level)await fetch(host+'/reto/'+payload.level,{headers});
    const r=await fetch(host+route,{method:payload===undefined?'GET':'POST',headers,
      body:payload===undefined?undefined:JSON.stringify(payload)});
    const setCookie=r.headers.get('set-cookie');
    if(setCookie)cookie=setCookie.split(';')[0];
    const text=await r.text();let body;try{body=JSON.parse(text);}catch{body=text;}
    return {status:r.status,body};
  };
}
async function until(check,timeout=2400) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(check())return;await new Promise(r=>setTimeout(r,35));}
  assert.ok(check(),'No llegó la confirmación de Supabase dentro del plazo.');
}

test('El PSO publica SOLO taller_2, 0 a 100, conserva mejor intento; simula caídas sin red real',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pso-supabase-test-'));
  const rows=new Map();
  const calls=[];
  let failNext=true;
  const supabase=http.createServer(async(req,res)=>{
    if(req.method==='GET'&&req.url?.startsWith('/rest/v1/scores?')){
      assert.match(req.url,/select=equipo,taller_1,taller_2,taller_3,taller_4,batalla_final,total/);
      assert.match(req.url,/order=total.desc,equipo.asc/);
      assert.equal(req.headers.apikey,'sb_publishable_prueba_no_real');
      const scores=[...rows.values()].map(x=>({...x,total:x.taller_1+x.taller_2+x.taller_3+x.taller_4+x.batalla_final})).sort((a,b)=>b.total-a.total||a.equipo-b.equipo);
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(scores));return;
    }
    if(req.method!=='POST'||req.url!=='/rest/v1/rpc/registrar_taller'){
      res.writeHead(404);res.end('No encontrado');return;
    }
    assert.equal(req.headers.apikey,'sb_publishable_prueba_no_real');
    let payload='';for await(const ch of req)payload+=ch;
    const {p_equipo,p_taller,p_puntaje}=JSON.parse(payload);
    assert.equal(p_taller,2);
    assert.ok(Number.isInteger(p_equipo)&&p_equipo>=1&&p_equipo<=20);
    assert.ok(Number.isInteger(p_puntaje)&&p_puntaje>=0&&p_puntaje<=100);
    calls.push({p_equipo,p_taller,p_puntaje});
    if(failNext){failNext=false;res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"simulando caída temporal"}');return;}
    let row=rows.get(p_equipo);
    if(!row){row={equipo:p_equipo,taller_1:35,taller_2:0,taller_3:40,taller_4:50,batalla_final:70};rows.set(p_equipo,row);}
    row.taller_2=Math.max(row.taller_2,p_puntaje);
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify(row.taller_2));
  });
  await new Promise(resolve=>supabase.listen(0,'127.0.0.1',resolve));
  process.env.ALGORITMOS_DATA_DIR=temp;
  process.env.ADMIN_PASSWORD='DocenteTestSolo';
  process.env.SUPABASE_URL=`http://127.0.0.1:${supabase.address().port}/rest/v1/`;
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_prueba_no_real';
  delete process.env.SUPABASE_DISABLED;
  const app=require('../app');
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
  const host=`http://127.0.0.1:${server.address().port}`;
  const equipo5=makeClient(host),equipo6=makeClient(host),admin=makeClient(host);
  const answers=['9','6','D','7','5'];
  const steps={
    1:[['scan',3],['scan',6],['scan',9],['scan',12]],
    2:Array.from({length:4},()=>['step',null]),
    3:['A','B','C','D'].map(letter=>['launch',letter]),
    4:[['test',1],['test',3],['test',7]],
    5:Array.from({length:5},()=>['iteration',null]),
  };
  async function lab(client,level){
    await client('/reto/'+level);
    for(const [action,value] of steps[level]){
      const response=await client('/api/experiment',{level,action,value});
      assert.equal(response.status,200,JSON.stringify(response.body));
    }
  }

  try{
    const cfg=(await equipo5('/api/config')).body;
    assert.equal(cfg.supabaseEnabled,true);
    assert.equal(cfg.supabaseColumn,'taller_2');
    assert.equal((await equipo5('/api/start',{teamNumber:5})).status,201);
    await lab(equipo5,1);
    assert.equal((await equipo5('/api/answer',{level:1,answer:'9'})).body.score,20);
    await until(()=>calls.length>=1);
    assert.equal(rows.has(5),false); // la primera llamada falló, pero el puntaje sigue local
    const pending=(await equipo5('/api/state')).body;
    assert.equal(pending.supabase.error,true);
    assert.equal(pending.score,20);
    await lab(equipo5,2);
    assert.equal((await equipo5('/api/answer',{level:2,answer:'6'})).body.score,40);
    await until(()=>rows.get(5)?.taller_2===40);
    for(let i=3;i<=5;i++){
      await lab(equipo5,i);
      assert.equal((await equipo5('/api/answer',{level:i,answer:answers[i-1]})).body.score,i*20);
    }
    await until(()=>rows.get(5)?.taller_2===100);
    const general=(await equipo5('/api/general-scores'));
    assert.equal(general.status,200);
    assert.equal(general.body.scores.find(x=>x.equipo===5).taller_2,100);
    assert.equal(general.body.scores.find(x=>x.equipo===5).total,295);
    assert.equal(rows.get(5).taller_1,35);
    assert.equal(rows.get(5).taller_3,40);
    assert.equal(rows.get(5).taller_4,50);
    assert.equal(rows.get(5).batalla_final,70);
    const published=(await equipo5('/api/state')).body.supabase;
    assert.equal(published.upToDate,true);
    assert.equal(published.publishedScore,100);
    assert.equal(published.error,false);
    const beforeLowerRetry=calls.length;
    assert.equal((await equipo5('/api/retry',{})).status,201);
    await lab(equipo5,1);
    assert.equal((await equipo5('/api/answer',{level:1,answer:'0'})).body.advanced,false);
    assert.equal((await equipo5('/api/answer',{level:1,answer:'9'})).body.points,16);
    for(let i=2;i<=5;i++){await lab(equipo5,i);await equipo5('/api/answer',{level:i,answer:answers[i-1]});}
    await new Promise(r=>setTimeout(r,110));
    assert.equal(rows.get(5).taller_2,100);
    assert.equal(calls.length,beforeLowerRetry); // no se mandan notas inferiores
    assert.equal((await equipo6('/api/start',{teamNumber:6})).status,201);
    await lab(equipo6,1);
    for(let i=0;i<3;i++)await equipo6('/api/answer',{level:1,answer:'-22'});
    await until(()=>rows.has(6)); // nota 0 también es válida
    assert.equal(rows.get(6).taller_2,0);
    assert.equal((await admin('/api/admin/login',{password:process.env.ADMIN_PASSWORD})).status,200);
    assert.equal((await admin('/api/admin/reset',{confirm:'REINICIAR'})).status,200);
    assert.equal((await equipo5('/api/scores')).body.scores.length,0);
    assert.equal(rows.get(5).taller_2,100); // reset local no modifica Supabase
    const local=JSON.parse(fs.readFileSync(path.join(temp,'equipos.json'),'utf8'));
    assert.deepEqual(local.supabaseSync,{});
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await new Promise(resolve=>supabase.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
