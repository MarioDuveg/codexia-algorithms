'use strict';

// ALGORITMOS / Particle Swarm Optimization. Las respuestas y el tiempo se verifican en servidor.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// Enrutador HTTP mínimo con APIs del núcleo de Node.js (sin paquetes externos).
// Solo sirve las rutas definidas aquí y los recursos permitidos de /public.
const routes = [];
const app = {
  get(pattern, ...handlers) { routes.push({ method: 'GET', pattern, handlers }); },
  post(pattern, ...handlers) { routes.push({ method: 'POST', pattern, handlers }); },
  listen(port, host, callback) { return http.createServer(handleRequest).listen(port, host, callback); },
};
function matchRoute(pattern, pathname) {
  const keys = [];
  const escaped = pattern.split('/').map(segment => {
    if (segment.startsWith(':')) { keys.push(segment.slice(1)); return '([^/]+)'; }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  const match = pathname.match(new RegExp('^' + escaped + '$'));
  if (!match) return null;
  return Object.fromEntries(keys.map((k, i) => [k, match[i + 1]]));
}
function appendCookie(res, header) {
  const old = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', old ? [...(Array.isArray(old) ? old : [old]), header] : [header]);
}
function decorateResponse(res) {
  res.status = function (code) { this.statusCode = code; return this; };
  res.send = function (value) {
    if (!this.hasHeader('Content-Type')) this.setHeader('Content-Type', 'text/html; charset=utf-8');
    this.end(String(value)); return this;
  };
  res.json = function (value) {
    this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(value)); return this;
  };
  res.sendFile = function (filepath) {
    fs.readFile(filepath, (err, contents) => {
      if (err) return this.status(404).send('Archivo no encontrado.');
      this.setHeader('Content-Type', 'text/html; charset=utf-8');
      this.end(contents);
    });
  };
  res.cookie = function (key, value, opts = {}) {
    let header = encodeURIComponent(key) + '=' + encodeURIComponent(value);
    header += '; Path=' + (opts.path || '/');
    if (opts.httpOnly) header += '; HttpOnly';
    if (opts.sameSite) header += '; SameSite=' + opts.sameSite;
    if (opts.secure) header += '; Secure';
    if (opts.maxAge !== undefined) header += '; Max-Age=' + Math.ceil(opts.maxAge / 1000);
    appendCookie(this, header);
  };
  res.clearCookie = function (key) { appendCookie(this, encodeURIComponent(key) + '=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'); };
}
async function handleRequest(req, res) {
  decorateResponse(res);
  req.ip = req.socket.remoteAddress || 'unknown';
  req.secure = Boolean(req.socket.encrypted);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/public/')) {
      if (req.method !== 'GET') return res.status(405).send('Método no permitido.');
      const name = pathname.slice('/public/'.length);
      if (!/^[a-z0-9_-]+\.(css|js|webp|png)$/.test(name)) return res.status(404).send('Archivo no encontrado.');
      const filepath = path.join(ROOT, 'public', name);
      const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.webp') ? 'image/webp' : 'image/png';
      const data = await fs.promises.readFile(filepath).catch(() => null);
      if (!data) return res.status(404).send('Archivo no encontrado.');
      res.setHeader('Content-Type', type + '; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.end(data);
    }
    if (pathname.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString('utf8');
        if (body.length > 8192) return res.status(413).json({error:'Petición demasiado grande.'});
      }
      if (body && !(req.headers['content-type'] || '').startsWith('application/json')) {
        return res.status(415).json({error:'Se requiere JSON.'});
      }
      try { req.body = body ? JSON.parse(body) : {}; }
      catch { return res.status(400).json({error:'JSON inválido.'}); }
    }
    for (const route of routes) {
      if (req.method !== route.method) continue;
      const params = matchRoute(route.pattern, pathname);
      if (!params) continue;
      req.params = params;
      let index = 0;
      const next = () => {
        const handler = route.handlers[index++];
        if (handler) handler(req, res, next);
      };
      return next();
    }
    res.status(404).send('Ruta no encontrada.');
  } catch (err) {
    console.error('Error de petición:', err);
    if (!res.headersSent) res.status(500).json({error:'Error interno del servidor.'});
    else res.end();
  }
}

const PORT = Number(process.env.PORT) || 3011;
const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.ALGORITMOS_DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = path.join(DATA_DIR, 'equipos.json');
const KEY_FILE = path.join(DATA_DIR, '.clave-servidor');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
const ADMIN_GENERATED = !process.env.ADMIN_PASSWORD;
const COOKIE_TEAM = 'algoritmos_equipo';
const COOKIE_ADMIN = 'algoritmos_docente';
const MAX_TEAM_NUMBER = 20;
const MAX_MISSION_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
// Cada reto: precisión (14/10/6 según el intento) + rapidez (0..6).
// El cronómetro del reto empieza al abrirlo por primera vez; recargar NO lo reinicia.
const BASE_BY_ATTEMPT = [14, 10, 6];
const SPEED_MAX = 6;
const SPEED_STEP_MS = 20_000;
function speedPoints(ms) {return Math.max(0,SPEED_MAX-Math.floor(Math.max(0,ms)/SPEED_STEP_MS));}
function pointsPreview(attemptIndex,ms) {return (BASE_BY_ATTEMPT[attemptIndex]||0)+speedPoints(ms);}
function levelDuration(t,now=Date.now()) {return t.levelStartedAt==null?null:Math.max(0,now-t.levelStartedAt);}
// Se reutilizan la URL y la clave PUBLICABLE del proyecto CODEXIA adjunto.
// Nunca se necesita ni debe configurarse la clave service_role/secret.
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://zgpfcmvjmjfaphtudmis.supabase.co')
  .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0uQxgvjB7S7eCSqssUlPnA_Brhj-zx7';
const SUPABASE_ENABLED = process.env.SUPABASE_DISABLED !== '1' && Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
const TALLER_2_RPC = '/rest/v1/rpc/registrar_taller'; // RPC compartido por talleres 1 a 4
const LEVELS = [
  { title: 'Radar del mínimo', topic: 'FUNCIÓN OBJETIVO', answer: '9',
    hint: 'Escanea todos los puntos. En optimización buscamos el COSTO menor, no la coordenada mayor.',
    explanation: 'Los escaneos dieron costos 25, 4, 1 y 16 para x = 3, 6, 9 y 12. El menor costo, 1, se encontró en x = 9.' },
  { title: 'El recuerdo que no se borra', topic: 'PBEST', answer: '6',
    hint: 'pBest guarda la primera posición que consiguió el costo mínimo. Si una visita empata, no sustituye el recuerdo.',
    explanation: 'La partícula visitó x = 2, 6, 10 y 8; sus costos fueron 25, 1, 9 y 1. Conserva pBest = 6 porque fue la primera posición con costo 1.' },
  { title: 'Carrera por el gBest', topic: 'GBEST', answer: 'D',
    hint: 'Lanza las cuatro partículas. Compara el mejor costo personal logrado por cada una; ese es el candidato a gBest.',
    explanation: 'La partícula D pasó de x = 6 a x = 10 y encontró costo 0, menor que los mejores costos de A, B y C.' },
  { title: 'Laboratorio de fuerzas', topic: 'VELOCIDAD', answer: '7',
    hint: 'Compara varias combinaciones, incluida la de las tres fuerzas. La pregunta pide VELOCIDAD v′, no posición x′.',
    explanation: 'Con las tres fuerzas activas: inercia = 0.5×2 = 1; memoria = 5−3 = 2; social = 7−3 = 4. La velocidad nueva v′ = 7 y la posición final x′ = 10.' },
  { title: 'Semáforo de convergencia', topic: 'CONVERGENCIA', answer: '5',
    hint: 'Avanza una iteración a la vez. Cuenta CUÁNTAS rondas consecutivas no mejoran el mejor costo del grupo.',
    explanation: 'El mejor costo global fue 16 → 9 → 1 → 1 → 1. Las rondas 4 y 5 no mejoraron; la regla exige detenerse en la iteración 5.' },
];
// Las pruebas son parte del juego, se guardan en el servidor y desbloquean
// la respuesta. Ninguna simulación independiente entrega puntos por sí sola.
const SCAN_POSITIONS = [3, 6, 9, 12];
const VISITS = [2, 6, 10, 8];
const SWARM_RUNS = {A:[1,7], B:[8,13], C:[11,9], D:[6,10]};
const CONVERGENCE_STEPS = [
  [2,6,14,17], [4,7,13,15], [6,8,9,13], [7,8,11,12], [8,9,11,12],
];
function ensureLab(t) {
  if (!t.experiment || t.experiment.level !== t.currentLevel || !Array.isArray(t.experiment.actions)) {
    t.experiment = {level:t.currentLevel,actions:[]};
  }
  return t.experiment;
}
function makeLabEvents(level,actions) {
  if(level===1)return actions.map(x=>({kind:'scan',position:x,cost:(x-8)**2}));
  if(level===2){
    let bestCost=Infinity,bestX=null;
    return actions.map((_,i)=>{
      const position=VISITS[i],cost=(position-7)**2,improved=cost<bestCost;
      if(improved){bestCost=cost;bestX=position;}
      return {kind:'step',step:i+1,position,cost,pBest:bestX,pBestCost:bestCost,improved};
    });
  }
  if(level===3){
    let gBestCost=Infinity,gBestParticle=null;
    return actions.map(letter=>{
      const [from,to]=SWARM_RUNS[letter],fromCost=(from-10)**2,toCost=(to-10)**2;
      const pBestCost=Math.min(fromCost,toCost),pBest=toCost<fromCost?to:from;
      if(pBestCost<gBestCost){gBestCost=pBestCost;gBestParticle=letter;}
      return {kind:'launch',letter,from,to,fromCost,toCost,pBest,pBestCost,gBestParticle,gBestCost};
    });
  }
  if(level===4)return actions.map(mask=>{
    const inertia=mask&1?1:0,memory=mask&2?2:0,social=mask&4?4:0;
    const velocity=inertia+memory+social;
    return {kind:'test',mask,inertia,memory,social,velocity,position:3+velocity};
  });
  if(level===5){
    let bestCost=Infinity,bestX=null,stale=0;
    return actions.map((_,i)=>{
      const positions=CONVERGENCE_STEPS[i],costs=positions.map(x=>(x-10)**2);
      const min=Math.min(...costs),improved=min<bestCost;
      if(improved){bestCost=min;bestX=positions[costs.indexOf(min)];stale=0;}
      else stale++;
      return {kind:'iteration',step:i+1,positions,globalBestX:bestX,globalBestCost:bestCost,improved,withoutImprovement:stale};
    });
  }
  return [];
}
function labReady(level,actions){
  if(level===4)return actions.length>=3&&actions.includes(7);
  return actions.length >= (level===5?5:4);
}
function labProgressText(level,actions) {
  const count=actions.length;
  if(level===1)return `Escaneos: ${count}/4. Examina los cuatro puntos.`;
  if(level===2)return `Visitas: ${count}/4. Completa el recorrido de la partícula.`;
  if(level===3)return `Partículas lanzadas: ${count}/4. Lanza A, B, C y D.`;
  if(level===4)return `Pruebas diferentes: ${count}/3. Incluye una simulación con las tres fuerzas activas.`;
  return `Iteraciones: ${count}/5. Avanza hasta comprobar dos rondas sin mejora.`;
}
function labSnapshot(level,actions) {
  return {level,events:makeLabEvents(level,actions),ready:labReady(level,actions),progress:labProgressText(level,actions)};
}

fs.mkdirSync(DATA_DIR, {recursive:true});
const serverKey = fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE,'utf8').trim() : crypto.randomBytes(32).toString('hex');
if (!fs.existsSync(KEY_FILE)) fs.writeFileSync(KEY_FILE, serverKey+'\n', {mode:0o600});
let db = {version:2, teams:[]};
if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
  if (!Array.isArray(db.teams) || db.version !== 2) throw new Error('La base de datos no corresponde a ALGORITMOS. Usa un directorio de datos independiente.');
}
// Confirmaciones de sincronización por equipo. El valor 0 es válido cuando
// un equipo termina sin aciertos. No modificar resultados de otros talleres.
if (!db.supabaseSync || typeof db.supabaseSync !== 'object' || Array.isArray(db.supabaseSync)) db.supabaseSync = {};
function save() {
  const tmp = DB_FILE+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(db,null,2),{mode:0o600});
  fs.renameSync(tmp,DB_FILE);
}
function hash(s) {return crypto.createHash('sha256').update(s).digest('hex');}
function sign(s) {return crypto.createHmac('sha256',serverKey).update(s).digest('hex');}
function safeEqual(a,b) {
  const aHash = Buffer.from(hash(a),'hex'); const bHash=Buffer.from(hash(b),'hex');
  return crypto.timingSafeEqual(aHash,bHash);
}
function cookies(req) {
  const result={};
  for(const pair of (req.headers.cookie||'').split(';')) {
    const i=pair.indexOf('='); if(i<0)continue;
    try {result[pair.slice(0,i).trim()]=decodeURIComponent(pair.slice(i+1).trim());}catch{}
  }
  return result;
}
function setCookie(res,key,value,seconds,req) {
  res.cookie(key,value,{httpOnly:true,sameSite:'Lax',secure:req.secure,path:'/',maxAge:seconds*1000});
}
function teamFromReq(req) {
  const token=cookies(req)[COOKIE_TEAM];
  return token && /^[a-f0-9]{64}$/.test(token) ? db.teams.find(t=>t.tokenHash===hash(token))||null : null;
}
function adminFromReq(req) {
  const token=cookies(req)[COOKIE_ADMIN];
  if(!token)return false;
  const parts=token.split('.'); if(parts.length!==4)return false;
  const [v,expiry,nonce,sig]=parts;
  if(v!=='v1'||!/^[0-9]+$/.test(expiry)||Number(expiry)<=Date.now()||!/^[a-f0-9]{24}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(sig))return false;
  return safeEqual(sign(v+'.'+expiry+'.'+nonce),sig);
}
function requireAdmin(req,res,next) {if(!adminFromReq(req))return res.status(401).json({error:'Acceso exclusivo del docente.'});next();}
function requireTeam(req,res,next) {const t=teamFromReq(req);if(!t)return res.status(401).json({error:'Selecciona un equipo e inicia la competencia.'});req.team=t;next();}
function htmlEsc(value) {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function endedAt(t) {return t.completedAt || t.expiredAt || null;}
function elapsed(t,now=Date.now()) {return Math.max(0,Math.min(MAX_MISSION_MS,(endedAt(t)||now)-t.startedAt));}
function scoreForTeam(t) {return t.results.reduce((sum,r)=>sum+r.points,0);}
function attemptsForTeam(t) {return t.results.reduce((sum,r)=>sum+r.attempts,0)+t.currentAttempts;}
// Se sincroniza únicamente el mejor resultado de cada equipo. La función
// PostgreSQL usa GREATEST de manera atómica: los reintentos no pueden bajarlo.
const syncInFlight = new Set();
const syncErrors = new Map();
let syncGeneration = 0;
function bestPublishableAttempt(teamNumber) {
  let best = null;
  for (const t of db.teams) {
    if (t.teamNumber !== teamNumber || (!t.results.length && !endedAt(t))) continue;
    if (!best || compareAttempts(t,best)<0) best = t;
  }
  return best;
}
function needsSync(teamNumber) {
  if (!SUPABASE_ENABLED) return false;
  const best = bestPublishableAttempt(teamNumber);
  if (!best) return false;
  const sent = db.supabaseSync[String(teamNumber)];
  return typeof sent !== 'number' || sent < scoreForTeam(best);
}
async function syncBestScore(teamNumber) {
  if (!needsSync(teamNumber) || syncInFlight.has(teamNumber)) return;
  const generation = syncGeneration;
  const best = bestPublishableAttempt(teamNumber);
  if (!best) return;
  const score = scoreForTeam(best);
  syncInFlight.add(teamNumber);
  let success = false;
  try {
    const response = await fetch(SUPABASE_URL + TALLER_2_RPC, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({p_equipo:teamNumber,p_taller:2,p_puntaje:score}),
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error('HTTP '+response.status+': '+body.slice(0,220));
    const returned = JSON.parse(body);
    const remoteScore = Number(returned);
    if (returned === null || !Number.isFinite(remoteScore) || remoteScore < score || remoteScore > 100) {
      throw new Error('Respuesta de puntuación inválida de Supabase.');
    }
    if (generation !== syncGeneration) return; // Se reinició la competencia.
    db.supabaseSync[String(teamNumber)] = Math.max(db.supabaseSync[String(teamNumber)] ?? 0,remoteScore);
    syncErrors.delete(teamNumber);
    save();
    success = true;
  } catch (err) {
    if (generation === syncGeneration) {
      syncErrors.set(teamNumber,true);
      console.error('[Supabase taller_2] Equipo '+teamNumber+': '+String(err.message||err));
    }
  } finally {
    syncInFlight.delete(teamNumber);
    // Si respondió mientras se resolvía otro reto, publicar el nuevo puntaje.
    // Si falló, esperar el reintento periódico (evita un bucle de solicitudes).
    if (success && needsSync(teamNumber)) void syncBestScore(teamNumber);
  }
}
function supabaseState(teamNumber) {
  const best = bestPublishableAttempt(teamNumber);
  const published = db.supabaseSync[String(teamNumber)];
  return {enabled:SUPABASE_ENABLED,column:'taller_2',
    eligible:Boolean(best),
    upToDate:SUPABASE_ENABLED && Boolean(best) && typeof published === 'number' && published >= scoreForTeam(best),
    publishedScore:typeof published === 'number' ? published : null,
    error:syncErrors.has(teamNumber)};
}
function expireIfNeeded(t,now=Date.now()) {
  if(endedAt(t)||now-t.startedAt<MAX_MISSION_MS)return false;
  t.expiredAt=t.startedAt+MAX_MISSION_MS;
  save();void syncBestScore(t.teamNumber);return true;
}
function createAttempt(number,req,res) {
  const token=crypto.randomBytes(32).toString('hex');
  const t={id:crypto.randomUUID(),teamNumber:number,name:'Equipo '+number,tokenHash:hash(token),
    startedAt:Date.now(),completedAt:null,expiredAt:null,currentLevel:1,levelStartedAt:null,currentAttempts:0,results:[]};
  db.teams.push(t);save();setCookie(res,COOKIE_TEAM,token,30*24*3600,req);return t;
}
// Se conserva únicamente el MEJOR intento por equipo; empate: menos tiempo y luego menos intentos.
function compareAttempts(a,b,now=Date.now()) {
  return scoreForTeam(b)-scoreForTeam(a)||elapsed(a,now)-elapsed(b,now)||attemptsForTeam(a)-attemptsForTeam(b)||a.startedAt-b.startedAt;
}
function leaderboard(now=Date.now()) {
  const best=new Map();
  for(const t of db.teams) {
    expireIfNeeded(t,now);
    const prior=best.get(t.teamNumber);
    if(!prior||compareAttempts(t,prior,now)<0)best.set(t.teamNumber,t);
  }
  const ranked=[...best.values()].sort((a,b)=>compareAttempts(a,b,now)||a.teamNumber-b.teamNumber);
  let prior=null,rank=0;
  return ranked.map((t,i)=>{
    const score=scoreForTeam(t),ms=elapsed(t,now),attempts=attemptsForTeam(t);
    if(!prior||score!==prior.score||ms!==prior.ms||attempts!==prior.attempts)rank=i+1;
    prior={score,ms,attempts};
    return {equipo:t.teamNumber,puntos:score,tiempoMs:ms,intentos:attempts,
      retosCompletados:t.results.length,aciertos:t.results.filter(r=>r.correct).length,
      porReto:Array.from({length:5},(_,i)=>t.results.find(r=>r.level===i+1)?.points||0),
      estado:t.expiredAt?'TIEMPO AGOTADO':t.completedAt?'FINALIZADO':'EN CURSO',
      terminado:Boolean(endedAt(t)),rank,completedAt:t.completedAt};
  });
}
const adminAttempts=new Map();
function limited(key) {
  const now=Date.now();
  const entries=(adminAttempts.get(key)||[]).filter(x=>now-x<600000);
  if(entries.length>=12){adminAttempts.set(key,entries);return true;}
  entries.push(now);adminAttempts.set(key,entries);return false;
}
const jsonType={'Content-Type':'application/json'};
app.get('/',(req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));
app.get('/resultados',(req,res)=>res.sendFile(path.join(ROOT,'public','resultados.html')));
app.get('/ranking',(req,res)=>res.sendFile(path.join(ROOT,'public','ranking.html')));
app.get('/scores',(req,res)=>res.sendFile(path.join(ROOT,'public','ranking.html')));
app.get('/admin',(req,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.get('/api/config',(req,res)=>res.json({title:'ALGORITMOS',maxScore:100,maxAttempts:MAX_ATTEMPTS,maxDurationMs:MAX_MISSION_MS,teams:MAX_TEAM_NUMBER,baseByAttempt:BASE_BY_ATTEMPT,speedMax:SPEED_MAX,speedStepMs:SPEED_STEP_MS,supabaseEnabled:SUPABASE_ENABLED,supabaseColumn:'taller_2'}));
app.get('/api/state',(req,res)=>{
  const t=teamFromReq(req);const now=Date.now();
  if(!t)return res.json({started:false,serverNow:now,maxDurationMs:MAX_MISSION_MS});
  expireIfNeeded(t,now);
  const row=leaderboard(now).find(r=>r.equipo===t.teamNumber);
  res.json({started:true,serverNow:now,name:t.name,teamNumber:t.teamNumber,startedAt:t.startedAt,
    completedAt:t.completedAt,expiredAt:t.expiredAt,ended:Boolean(endedAt(t)),
    elapsedMs:elapsed(t,now),remainingMs:MAX_MISSION_MS-elapsed(t,now),maxDurationMs:MAX_MISSION_MS,
    currentLevel:t.currentLevel,currentAttempts:t.currentAttempts,attemptsRemaining:MAX_ATTEMPTS-t.currentAttempts,
    levelElapsedMs:levelDuration(t,now),currentPossiblePoints:t.levelStartedAt==null?20:pointsPreview(t.currentAttempts,levelDuration(t,now)),
    results:t.results,score:scoreForTeam(t),totalAttempts:attemptsForTeam(t),rank:row?.rank||null,
    supabase:supabaseState(t.teamNumber)});
});
app.post('/api/start',(req,res)=>{
  if(teamFromReq(req))return res.json({ok:true,alreadyStarted:true});
  const raw=req.body?.teamNumber;
  const n=typeof raw==='number'?raw:typeof raw==='string'&&/^\d{1,2}$/.test(raw)?Number(raw):NaN;
  if(!Number.isInteger(n)||n<1||n>MAX_TEAM_NUMBER)return res.status(400).json({error:'Selecciona un equipo del 1 al 20.'});
  createAttempt(n,req,res);res.status(201).json({ok:true});
});
app.post('/api/retry',requireTeam,(req,res)=>{
  if(!endedAt(req.team))return res.status(409).json({error:'Solo se puede reintentar después de terminar o agotar el tiempo.'});
  createAttempt(req.team.teamNumber,req,res);res.status(201).json({ok:true});
});
app.get('/api/experiment/state',requireTeam,(req,res)=>{
  const t=req.team;expireIfNeeded(t);
  if(endedAt(t))return res.status(409).json({error:'La competencia ya finalizó.'});
  if(t.levelStartedAt==null)return res.status(409).json({error:'Primero abre tu reto actual.'});
  res.json(labSnapshot(t.currentLevel,ensureLab(t).actions));
});
app.post('/api/experiment',requireTeam,(req,res)=>{
  const t=req.team;expireIfNeeded(t);
  if(endedAt(t))return res.status(409).json({error:'La competencia ya finalizó.'});
  const level=req.body?.level,action=req.body?.action,value=req.body?.value;
  if(!Number.isInteger(level)||level!==t.currentLevel||t.levelStartedAt==null)
    return res.status(409).json({error:'El laboratorio de este reto no está activo.'});
  const lab=ensureLab(t),actions=lab.actions;
  if(labReady(level,actions))return res.json(labSnapshot(level,actions));
  let next;
  if(level===1&&action==='scan'&&Number.isInteger(value)&&SCAN_POSITIONS.includes(value))next=value;
  else if(level===2&&action==='step'&&value===null&&actions.length<VISITS.length)next=actions.length+1;
  else if(level===3&&action==='launch'&&typeof value==='string'&&Object.hasOwn(SWARM_RUNS,value))next=value;
  else if(level===4&&action==='test'&&Number.isInteger(value)&&value>=1&&value<=7)next=value;
  else if(level===5&&action==='iteration'&&value===null&&actions.length<CONVERGENCE_STEPS.length)next=actions.length+1;
  else return res.status(400).json({error:'Acción del laboratorio inválida.'});
  if((level===1||level===3||level===4)&&actions.includes(next))
    return res.json(labSnapshot(level,actions));
  if(actions.length>=8)return res.status(400).json({error:'Has alcanzado el límite de pruebas.'});
  actions.push(next);save();
  return res.json(labSnapshot(level,actions));
});
app.post('/api/answer',requireTeam,(req,res)=>{
  const t=req.team;expireIfNeeded(t);
  if(t.expiredAt)return res.status(409).json({error:'Se agotaron los 15 minutos de la competencia.'});
  if(t.completedAt)return res.status(409).json({error:'Este intento ya terminó.'});
  const level=req.body?.level;
  if(!Number.isInteger(level)||level!==t.currentLevel)return res.status(409).json({error:'Este reto no está activo.'});
  const answer=req.body?.answer;
  if(typeof answer!=='string'||!answer.trim()||answer.length>90)return res.status(400).json({error:'Escribe una respuesta válida.'});
  if(t.levelStartedAt==null)return res.status(409).json({error:'Abre este reto desde la plataforma antes de responder.'});
  const experiment=ensureLab(t);
  if(!labReady(level,experiment.actions))return res.status(409).json({error:'Primero completa la experimentación visual para desbloquear la respuesta.'});
  const checkedAt=Date.now(),durationMs=levelDuration(t,checkedAt);
  const correct=safeEqual(answer.trim().toUpperCase(),LEVELS[level-1].answer.toUpperCase());
  t.currentAttempts+=1;
  const tries=t.currentAttempts;
  if(correct||tries===MAX_ATTEMPTS){
    const basePoints=correct?BASE_BY_ATTEMPT[tries-1]:0;
    const bonusPoints=correct?speedPoints(durationMs):0;
    const points=basePoints+bonusPoints;
    t.results.push({level,correct,attempts:tries,points,basePoints,bonusPoints,durationMs,at:checkedAt,experimentActions:[...experiment.actions]});
    t.currentLevel+=1;t.currentAttempts=0;t.levelStartedAt=null;t.experiment=null;
    if(t.currentLevel===6)t.completedAt=checkedAt;
    save();
    void syncBestScore(t.teamNumber); // se envía el mejor score, sin bloquear la respuesta al alumno
    return res.json({ok:correct,advanced:true,completed:Boolean(t.completedAt),points,attemptsUsed:tries,
      remaining:0,nextLevel:t.completedAt?null:t.currentLevel,score:scoreForTeam(t),
      basePoints,bonusPoints,durationMs,
      explanation:LEVELS[level-1].explanation,
      message:correct?`¡Correcto! +${points} puntos (${basePoints} por precisión + ${bonusPoints} por rapidez).`:'Sin intentos disponibles. Este reto suma 0 puntos.'});
  }
  save();
  res.json({ok:false,advanced:false,remaining:MAX_ATTEMPTS-tries,attemptsUsed:tries,
    score:scoreForTeam(t),currentPossiblePoints:pointsPreview(tries,durationMs),
    message:`No es correcto. Quedan ${MAX_ATTEMPTS-tries} intentos. El reloj del reto sigue corriendo.`});
});
function levelExtra(level) {
  switch(level){
    case 1:return {
      title:'RADAR DEL MÍNIMO',
      text:'El paisaje tiene una función objetivo oculta. Activa cuatro sensores en distintos puntos y observa qué costo devuelve cada uno. En PSO, el menor costo indica la mejor solución.',
      instruction:'Después de explorar los CUATRO puntos, ¿qué coordenada x tuvo el costo más bajo?',
      visual:`<div class="equation">f(x) = ¿? <small>TERRENO OCULTO</small></div><p class="lab-callout">No hay una tabla precalculada. Escanea cada posición y compara las mediciones.</p>`};
    case 2:return {
      title:'LA MEMORIA DE UNA PARTÍCULA',
      text:'Una partícula camina por cuatro posiciones. Su recuerdo pBest solo cambia cuando descubre un costo estrictamente menor. Si dos posiciones empatan, conserva la primera.',
      instruction:'Al completar las CUATRO visitas, ¿qué coordenada x conserva la partícula como pBest?',
      visual:`<div class="equation">f(x) = (x − 7)² <small>MEMORIA PERSONAL</small></div><p class="lab-callout">Avanza paso a paso. Compara la posición actual con el aro que representa pBest.</p>`};
    case 3:return {
      title:'LA CARRERA POR EL GBEST',
      text:'Lanza A, B, C y D por separado. Cada una prueba dos posiciones y conserva su mejor resultado personal. El enjambre elige el costo más bajo de TODOS los recuerdos.',
      instruction:'Tras lanzar las CUATRO partículas, ¿cuál encontró el gBest? Escribe A, B, C o D.',
      visual:`<div class="equation">f(x) = (x − 10)² <small>COOPERACIÓN</small></div><p class="lab-callout">Cada lanzamiento revela una trayectoria distinta y el costo de su pBest.</p>`};
    case 4:return {
      title:'CONSTRUYE EL SIGUIENTE SALTO',
      text:'Puedes activar o desactivar las fuerzas de inercia, memoria y cooperación. Cambia la combinación y observa cómo se modifica el movimiento desde x = 3.',
      instruction:'Experimenta con TRES combinaciones diferentes, incluida la de las tres fuerzas. Con TODAS activas, ¿cuál es la velocidad nueva v′?',
      visual:`<div class="equation smaller">v′ = 0.5v + (pBest − x) + (gBest − x)</div><div class="data-grid four"><div><small>POSICIÓN</small><strong>x = 3</strong></div><div><small>VELOCIDAD</small><strong>v = 2</strong></div><div><small>MEMORIA</small><strong>pBest = 5</strong></div><div><small>GRUPO</small><strong>gBest = 7</strong></div></div>`};
    case 5:return {
      title:'DETECTOR DE CONVERGENCIA',
      text:'Controla las iteraciones del enjambre. En cada ronda, las partículas exploran posiciones y el sistema conserva el mejor costo global encontrado hasta ese momento.',
      instruction:'La regla es detenerse tras DOS rondas consecutivas SIN mejorar gBest. ¿En qué iteración ocurre?',
      visual:`<div class="equation">2 rondas sin mejora <small>CRITERIO DE PARADA</small></div><p class="lab-callout">Avanza el enjambre una iteración a la vez. Observa la gráfica del mejor costo.</p>`};
    default:throw Error('Reto inexistente');
  }
}
function challengeDocument(level,t) {
  const meta=LEVELS[level-1],details=levelExtra(level);
  const review=level<t.currentLevel;
  const result=t.results.find(x=>x.level===level);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reto ${level} — ${htmlEsc(meta.title)} | ALGORITMOS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800;900&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/public/challenge.css"></head><body>
  <main class="challenge"><div class="eyebrow"><span class="live-led"></span> ALGORITMOS / OPTIMIZACIÓN <span class="challenge-no">RETO 0${level} / 05</span></div>
  <h1>${htmlEsc(details.title)}</h1><p class="story">${htmlEsc(details.text)}</p>
  <div class="screen"><div class="screen-top"><span class="dots"><i></i><i></i><i></i></span> PSO SIMULATOR / ${String(level).padStart(2,'0')} <span>● ACTIVO</span></div><div class="screen-body">${details.visual}</div></div>
  <section class="swarm-lab" aria-label="Experimento interactivo del enjambre" data-swarm-mode="${level}" data-review="${review?'true':'false'}">
    <div class="lab-heading"><div><span class="lab-kicker">LAB // PRIMERO EXPERIMENTA</span><h2>${['','ESCANEA EL TERRENO','SIGUE UNA PARTÍCULA','LANZA EL ENJAMBRE','CAMBIA LAS FUERZAS','CONTROLA LAS ITERACIONES'][level]}</h2></div><span class="lab-badge">TU ACCIÓN CUENTA</span></div>
    <p class="lab-intro">${['','Selecciona cada sensor y mide su costo real.','Pulsa avanzar para descubrir el siguiente paso y actualizar la memoria.','Pulsa cada letra para lanzar una trayectoria distinta.','Prueba combinaciones de fuerzas y compara los saltos.','Pulsa iterar y revisa cómo evoluciona gBest.'][level]} <strong>La respuesta se desbloquea al completar el experimento.</strong></p>
    <div class="swarm-canvas-wrap"><canvas id="swarmCanvas" width="760" height="295" role="img" aria-label="Gráfica del experimento; resultados también disponibles en el registro de mediciones">Tu navegador no admite la gráfica; consulta el registro de mediciones inferior.</canvas></div>
    <div class="experiment-controls" id="experimentControls"></div>
    <div class="experiment-bottom"><div id="swarmStatus" role="status" aria-live="polite">Preparando laboratorio...</div><div id="labReadiness" class="lab-readiness">EXPERIMENTA PARA DESBLOQUEAR</div></div>
    <div class="experiment-log"><strong>REGISTRO DE MEDICIONES</strong><div id="experimentLog" aria-live="polite">Sin mediciones todavía.</div></div>
    <div class="swarm-legend"><span><i class="legend-particle"></i> Partícula / posición</span><span><i class="legend-personal"></i> pBest</span><span><i class="legend-global"></i> gBest</span></div>
  </section>
  ${review ? `<script id="labReviewData" type="application/json">${JSON.stringify(labSnapshot(level,result?.experimentActions||[])).replace(/</g,'\\u003c')}</script>`:''}
  <div class="objective"><span class="objective-icon">⌁</span><div><strong>TU MISIÓN</strong><p>${htmlEsc(details.instruction)}</p></div></div>
  ${review ? `<div class="review-card"><strong>RETO CERRADO · ${result?.points||0}/20 PUNTOS</strong><p>${htmlEsc(meta.explanation)}</p><p>${result?.correct?`Desglose: ${result.basePoints??'—'} por precisión + ${result.bonusPoints??'—'} por rapidez · ${Math.ceil((result.durationMs||0)/1000)} s.`:'Sin puntos: tres intentos incorrectos.'}</p></div>`:
   `<div class="score-live"><div><span>TIEMPO EN ESTE RETO</span><strong id="levelClock">00:00</strong></div><div><span>PRECISIÓN (SI ACIERTAS)</span><strong id="accuracyValue">${BASE_BY_ATTEMPT[t.currentAttempts]} pts</strong></div><div><span>EXTRA POR RAPIDEZ</span><strong id="speedValue">+${speedPoints(levelDuration(t))} pts</strong></div><div><span>TOTAL DISPONIBLE AHORA</span><strong id="possibleValue">${pointsPreview(t.currentAttempts,levelDuration(t))}/20</strong></div></div>
   <div class="attempts" id="attemptInfo">INTENTOS RESTANTES: ${MAX_ATTEMPTS-t.currentAttempts} / 3 · CADA 20 S SE REDUCE EL BONO DE RAPIDEZ (HASTA 120 S)</div>
  <p class="lab-locked" id="labLocked">Completa las acciones del laboratorio para habilitar la respuesta. El cronómetro sigue avanzando.</p>
  <form id="answerForm" autocomplete="off" hidden><label for="answer">TU RESPUESTA</label>
    <div class="form-row"><input id="answer" name="answer" type="text" spellcheck="false" maxlength="90" placeholder="Escribe tu respuesta" required aria-label="Respuesta del reto"><button id="submitBtn" type="submit">VALIDAR <span>↗</span></button></div>
    <p id="feedback" class="feedback" role="status" aria-live="polite"></p></form>
  <div class="review-card" id="explanation" hidden><strong>RESULTADO DEL RETO</strong><p id="explanationText"></p><button class="next-button" type="button" id="nextBtn">${level===5?'VER RESULTADOS':'CONTINUAR AL SIGUIENTE RETO'} →</button></div>
  <div class="help-row"><button type="button" id="hintBtn">¿Necesitas una pista? <span>+</span></button><p id="hintText" hidden>${htmlEsc(meta.hint)}</p></div>`}
  <div class="footer-meta">PUNTAJE = PRECISIÓN + RAPIDEZ · MÁXIMO 100 PUNTOS · 15 MINUTOS TOTALES</div></main>
  <script src="/public/swarm.js" defer></script>
  ${!review ? `<script>(function(){
    const form=document.getElementById('answerForm'),input=document.getElementById('answer'),button=document.getElementById('submitBtn');
    const feedback=document.getElementById('feedback'),info=document.getElementById('attemptInfo');
    const hint=document.getElementById('hintBtn'),hintText=document.getElementById('hintText');
    let usedAttempts=${t.currentAttempts};
    window.addEventListener('pso-lab-ready',()=>{document.getElementById('answerForm').hidden=false;document.getElementById('labLocked').hidden=true;},{once:true});
    const initialElapsed=${levelDuration(t)}, initialClock=performance.now();
    const basePoints=[14,10,6],fmt=n=>String(n).padStart(2,'0');
    function tick(){
      const ms=Math.max(0,initialElapsed+(performance.now()-initialClock));
      const secs=Math.floor(ms/1000);
      const bonus=Math.max(0,6-Math.floor(ms/20000));
      document.getElementById('levelClock').textContent=fmt(Math.floor(secs/60))+':'+fmt(secs%60);
      document.getElementById('accuracyValue').textContent=basePoints[usedAttempts]+' pts';
      document.getElementById('speedValue').textContent='+'+bonus+' pts';
      document.getElementById('possibleValue').textContent=(basePoints[usedAttempts]+bonus)+'/20';
    }
    tick();const levelTicker=setInterval(tick,500);
    hint.addEventListener('click',()=>{hintText.hidden=!hintText.hidden;hint.querySelector('span').textContent=hintText.hidden?'+':'−';});
    document.getElementById('nextBtn').addEventListener('click',()=>window.parent.postMessage({type:'pso-continue'},location.origin));
    form.addEventListener('submit',async event=>{
      event.preventDefault();button.disabled=true;feedback.textContent='Comprobando respuesta...';feedback.className='feedback';
      try{
        const response=await fetch('/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({level:${level},answer:input.value})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'Error al validar');
        feedback.textContent=result.message;feedback.className='feedback '+(result.ok?'good':'bad');
        if(result.advanced){
          form.hidden=true;info.hidden=true;hint.parentElement.hidden=true;clearInterval(levelTicker);
          const explanation=document.getElementById('explanation');explanation.hidden=false;
          document.getElementById('explanationText').textContent=result.explanation;
          window.parent.postMessage({type:'pso-progress'},location.origin);
        }else{
          usedAttempts=result.attemptsUsed;tick();
          info.textContent='INTENTOS RESTANTES: '+result.remaining+' / 3 · EL BONO DE RAPIDEZ SIGUE DISMINUYENDO';
          button.disabled=false;input.select();
        }
      }catch(error){feedback.textContent=error.message;feedback.className='feedback bad';button.disabled=false;}
    });
  })();</script>`:''}</body></html>`;
}
app.get('/reto/:level',(req,res)=>{
  const t=teamFromReq(req);if(!t)return res.status(401).send('Inicia tu competencia desde la portada.');
  const level=Number(req.params.level);if(!Number.isInteger(level)||level<1||level>5)return res.status(404).send('Reto inexistente.');
  expireIfNeeded(t);
  if(t.expiredAt)return res.status(410).send('Tiempo agotado. Consulta los resultados desde la portada.');
  if(level>t.currentLevel)return res.status(403).send('Este reto todavía está bloqueado.');
  if(level===t.currentLevel&&!endedAt(t)&&t.levelStartedAt==null){t.levelStartedAt=Date.now();ensureLab(t);save();}
  if(level===t.currentLevel&&!endedAt(t))ensureLab(t);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.send(challengeDocument(level,t));
});
app.get('/api/scores',(req,res)=>{res.json({scores:leaderboard(),maxScore:100,order:'puntos DESC, tiempo ASC, intentos ASC'});});
// Marcador general compartido con CODEXIA: lectura sin modificar ningún taller.
app.get('/api/general-scores',(req,res)=>{
  if(!SUPABASE_ENABLED)return res.status(503).json({error:'La conexión a Supabase está deshabilitada.'});
  (async()=>{
    const url=SUPABASE_URL+'/rest/v1/scores?select=equipo,taller_1,taller_2,taller_3,taller_4,batalla_final,total&order=total.desc,equipo.asc';
    const response=await fetch(url,{
      headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Accept:'application/json'},
      signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)throw new Error('HTTP '+response.status);
    const scores=await response.json();
    if(!Array.isArray(scores))throw new Error('Respuesta de Supabase inválida.');
    res.json({scores});
  })().catch(error=>{
    console.error('Lectura de marcador general:',error.message);
    if(!res.headersSent)res.status(502).json({error:'No se pudieron consultar los resultados de Supabase.'});
  });
});

app.get('/api/admin/session',(req,res)=>res.json({authenticated:adminFromReq(req)}));
app.post('/api/admin/login',(req,res)=>{
  if(limited(req.ip||'unknown'))return res.status(429).json({error:'Demasiados intentos. Intenta más tarde.'});
  if(typeof req.body?.password!=='string'||!safeEqual(req.body.password,ADMIN_PASSWORD))return res.status(401).json({error:'Contraseña incorrecta.'});
  adminAttempts.delete(req.ip||'unknown');
  const expiry=String(Date.now()+12*3600*1000),nonce=crypto.randomBytes(12).toString('hex');
  const payload='v1.'+expiry+'.'+nonce;
  setCookie(res,COOKIE_ADMIN,payload+'.'+sign(payload),12*3600,req);res.json({ok:true});
});
app.post('/api/admin/logout',requireAdmin,(req,res)=>{res.clearCookie(COOKIE_ADMIN);res.json({ok:true});});
app.get('/api/admin/teams',requireAdmin,(req,res)=>{
  const now=Date.now(),scores=leaderboard(now);
  res.json({serverNow:now,total:scores.length,finished:scores.filter(x=>x.terminado).length,
    active:scores.filter(x=>!x.terminado).length,teams:scores.map(row=>({
      id:'equipo-'+row.equipo,name:'Equipo '+row.equipo,teamNumber:row.equipo,
      rank:row.rank,elapsedMs:row.tiempoMs,score:row.puntos,totalAttempts:row.intentos,
      solvedCount:row.retosCompletados,correctCount:row.aciertos,
      completedAt:row.completedAt,ended:row.terminado,estado:row.estado,
    }))});
});
app.post('/api/admin/reset',requireAdmin,(req,res)=>{
  if(req.body?.confirm!=='REINICIAR')return res.status(400).json({error:'Escribe REINICIAR para confirmar.'});
  syncGeneration++;
  db.teams=[];db.supabaseSync={};syncErrors.clear();
  save();res.clearCookie(COOKIE_TEAM);res.json({ok:true});
});
const maintenance=setInterval(()=>{
  const teams=new Set();
  for(const t of db.teams){expireIfNeeded(t);teams.add(t.teamNumber);}
  for(const number of teams) if(needsSync(number)) void syncBestScore(number);
},15000);
maintenance.unref();
if(require.main===module){
  app.listen(PORT,'0.0.0.0',()=>{
    const addresses=Object.values(os.networkInterfaces()).flat().filter(x=>x&&x.family==='IPv4'&&!x.internal).map(x=>x.address);
    console.log('\n ALGORITMOS / PSO · 5 MINI RETOS');
    console.log(' Alumnos: http://localhost:'+PORT);
    for(const address of [...new Set(addresses)])console.log(' Red local: http://'+address+':'+PORT);
    console.log(' Docente: http://localhost:'+PORT+'/admin');
    if(ADMIN_GENERATED)console.log(' CONTRASEÑA TEMPORAL DOCENTE: '+ADMIN_PASSWORD);
    console.log(' Datos: '+DB_FILE);
    console.log(' Supabase: '+(SUPABASE_ENABLED ? 'TALLER 2 · activo (requiere SQL instalado)' : 'deshabilitado')+'\n');
    // Recuperar puntajes pendientes de una sesión anterior al reiniciar Node.
    for(const number of new Set(db.teams.map(t=>t.teamNumber))) if(needsSync(number)) void syncBestScore(number);
  });
}
module.exports=app;
