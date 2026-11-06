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
const POINTS_BY_ATTEMPT = [20, 15, 10];
// Se reutilizan la URL y la clave PUBLICABLE del proyecto CODEXIA adjunto.
// Nunca se necesita ni debe configurarse la clave service_role/secret.
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://zgpfcmvjmjfaphtudmis.supabase.co')
  .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0uQxgvjB7S7eCSqssUlPnA_Brhj-zx7';
const SUPABASE_ENABLED = process.env.SUPABASE_DISABLED !== '1' && Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
const TALLER_2_RPC = '/rest/v1/rpc/registrar_taller'; // RPC compartido por talleres 1 a 4
const LEVELS = [
  { title: 'Encuentra el tesoro', topic: 'FUNCIÓN OBJETIVO', answer: '8',
    hint: 'Calcula (x − 7)² para cada posición. El menor valor es la mejor solución.',
    explanation: 'La partícula en x = 8 tiene f(8) = (8 − 7)² = 1; las otras producen valores mayores.' },
  { title: 'La memoria de la partícula', topic: 'PBEST', answer: '5',
    hint: 'El pBest es la mejor posición que ESTA partícula visitó, no necesariamente la posición actual.',
    explanation: 'La posición x = 5 produjo costo 1, menor que 16 y 9. Por eso pBest = 5.' },
  { title: 'El líder del enjambre', topic: 'GBEST', answer: 'D',
    hint: 'Compara los costos de todas las partículas. En minimización gana el menor costo.',
    explanation: 'D tiene costo 1, frente a 36, 4 y 16; por tanto D aporta gBest = 11.' },
  { title: 'Calcula el movimiento', topic: 'VELOCIDAD', answer: '10',
    hint: 'Primero v nueva = 0.5×2 + (5−3) + (7−3) = 7. Después suma v nueva a x actual.',
    explanation: 'La velocidad nueva es 1 + 2 + 4 = 7. Por tanto, x nueva = 3 + 7 = 10.' },
  { title: 'Detén el enjambre', topic: 'CONVERGENCIA', answer: '5',
    hint: 'Cuenta las iteraciones consecutivas que no mejoran el costo. La 4 es la primera sin mejora.',
    explanation: 'El costo baja a 2 en la iteración 3; en la 4 y la 5 no mejora. Se detiene en la 5.' },
];

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
    startedAt:Date.now(),completedAt:null,expiredAt:null,currentLevel:1,currentAttempts:0,results:[]};
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
app.get('/scores',(req,res)=>res.sendFile(path.join(ROOT,'public','resultados.html')));
app.get('/admin',(req,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.get('/api/config',(req,res)=>res.json({title:'ALGORITMOS',maxScore:100,maxAttempts:MAX_ATTEMPTS,maxDurationMs:MAX_MISSION_MS,teams:MAX_TEAM_NUMBER,supabaseEnabled:SUPABASE_ENABLED,supabaseColumn:'taller_2'}));
app.get('/api/state',(req,res)=>{
  const t=teamFromReq(req);const now=Date.now();
  if(!t)return res.json({started:false,serverNow:now,maxDurationMs:MAX_MISSION_MS});
  expireIfNeeded(t,now);
  const row=leaderboard(now).find(r=>r.equipo===t.teamNumber);
  res.json({started:true,serverNow:now,name:t.name,teamNumber:t.teamNumber,startedAt:t.startedAt,
    completedAt:t.completedAt,expiredAt:t.expiredAt,ended:Boolean(endedAt(t)),
    elapsedMs:elapsed(t,now),remainingMs:MAX_MISSION_MS-elapsed(t,now),maxDurationMs:MAX_MISSION_MS,
    currentLevel:t.currentLevel,currentAttempts:t.currentAttempts,attemptsRemaining:MAX_ATTEMPTS-t.currentAttempts,
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
app.post('/api/answer',requireTeam,(req,res)=>{
  const t=req.team;expireIfNeeded(t);
  if(t.expiredAt)return res.status(409).json({error:'Se agotaron los 15 minutos de la competencia.'});
  if(t.completedAt)return res.status(409).json({error:'Este intento ya terminó.'});
  const level=req.body?.level;
  if(!Number.isInteger(level)||level!==t.currentLevel)return res.status(409).json({error:'Este reto no está activo.'});
  const answer=req.body?.answer;
  if(typeof answer!=='string'||!answer.trim()||answer.length>90)return res.status(400).json({error:'Escribe una respuesta válida.'});
  const correct=safeEqual(answer.trim().toUpperCase(),LEVELS[level-1].answer.toUpperCase());
  t.currentAttempts+=1;
  const tries=t.currentAttempts;
  if(correct||tries===MAX_ATTEMPTS){
    const points=correct?POINTS_BY_ATTEMPT[tries-1]:0;
    t.results.push({level,correct,attempts:tries,points,at:Date.now()});
    t.currentLevel+=1;t.currentAttempts=0;
    if(t.currentLevel===6)t.completedAt=Date.now();
    save();
    void syncBestScore(t.teamNumber); // se envía el mejor score, sin bloquear la respuesta al alumno
    return res.json({ok:correct,advanced:true,completed:Boolean(t.completedAt),points,attemptsUsed:tries,
      remaining:0,nextLevel:t.completedAt?null:t.currentLevel,score:scoreForTeam(t),
      explanation:LEVELS[level-1].explanation,
      message:correct?`¡Correcto! +${points} puntos.`:'Sin intentos disponibles. Este reto suma 0 puntos.'});
  }
  save();
  res.json({ok:false,advanced:false,remaining:MAX_ATTEMPTS-tries,attemptsUsed:tries,
    score:scoreForTeam(t),message:`No es correcto. Quedan ${MAX_ATTEMPTS-tries} intentos.`});
});
function levelExtra(level) {
  switch(level){
    case 1:return {
      title:'LOCALIZA EL MÍNIMO',text:'Las partículas exploran una línea numérica. El tesoro está definido por la función de costo f(x) = (x − 7)². Cuanto MENOR sea f(x), mejor es la posición.',
      instruction:'¿Qué posición, entre las exploradas, tiene el costo más bajo? Escribe solo el número de x.',
      visual:`<div class="equation">f(x) = (x − 7)² <small>MINIMIZAR</small></div>
      <div class="numberline"><div class="track"></div><span class="dot" style="left:12%"><b>2</b></span><span class="dot" style="left:35%"><b>5</b></span><span class="target" style="left:53%"><b>OBJETIVO: 7</b></span><span class="dot" style="left:64%"><b>8</b></span><span class="dot" style="left:88%"><b>11</b></span></div>
      <div class="result-pills"><span>x = 2</span><span>x = 5</span><span>x = 8</span><span>x = 11</span></div>`};
    case 2:return {
      title:'LA MEJOR MEMORIA',text:'Una partícula conserva su mejor posición personal (pBest), aunque después se mueva a una posición peor. Ahora su función es f(x) = (x − 6)².',
      instruction:'Según el historial, ¿cuál es su pBest? Escribe solamente la posición x.',
      visual:`<div class="equation">f(x) = (x − 6)² <small>MEMORIA PERSONAL</small></div>
      <div class="data-grid"><div><small>VISITA 1</small><strong>x = 2</strong><span>f(x) = 16</span></div><div><small>VISITA 2</small><strong>x = 5</strong><span>f(x) = 1</span></div><div><small>AHORA</small><strong>x = 9</strong><span>f(x) = 9</span></div></div>`};
    case 3:return {
      title:'EL MEJOR DEL GRUPO',text:'En PSO, las partículas comparten la mejor posición global conocida (gBest). Todos usan la función f(x) = (x − 10)².',
      instruction:'¿Qué partícula tiene la mejor posición del enjambre? Escribe A, B, C o D.',
      visual:`<div class="equation">f(x) = (x − 10)² <small>MEJOR GLOBAL</small></div>
      <div class="data-grid four"><div><small>PARTÍCULA A</small><strong>x = 4</strong><span>f(x) = 36</span></div><div><small>PARTÍCULA B</small><strong>x = 8</strong><span>f(x) = 4</span></div><div><small>PARTÍCULA C</small><strong>x = 14</strong><span>f(x) = 16</span></div><div><small>PARTÍCULA D</small><strong>x = 11</strong><span>f(x) = 1</span></div></div>`};
    case 4:return {
      title:'EL SIGUIENTE SALTO',text:'La partícula combina inercia, su propia memoria y la mejor solución del grupo. Para esta ronda los coeficientes aleatorios ya están fijados.',
      instruction:'Calcula primero la nueva velocidad v′ y luego x′ = x + v′. ¿Cuál es la NUEVA POSICIÓN x′?',
      visual:`<div class="equation smaller">v′ = 0.5v + 1(pBest − x) + 1(gBest − x)</div>
      <div class="data-grid four"><div><small>POSICIÓN ACTUAL</small><strong>x = 3</strong></div><div><small>VELOCIDAD</small><strong>v = 2</strong></div><div><small>MEJOR PERSONAL</small><strong>pBest = 5</strong></div><div><small>MEJOR GLOBAL</small><strong>gBest = 7</strong></div></div>
      <div class="terminal-line dim">&gt; x′ = x + v′ &nbsp;&nbsp; // Calcula tu siguiente posición</div>`};
    case 5:return {
      title:'DECIDE CUÁNDO PARAR',text:'El enjambre registra su mejor costo gBest en cada iteración. La regla de parada es: detenerse cuando pasen DOS iteraciones consecutivas sin mejorar el mejor costo.',
      instruction:'¿En qué iteración debe detenerse el algoritmo? Escribe el número de iteración.',
      visual:`<div class="equation">Criterio: 2 rondas sin mejora <small>CONVERGENCIA</small></div>
      <div class="iterations"><div><small>ITERACIÓN</small><small>COSTO gBest</small></div><div><b>01</b><strong>12</strong></div><div><b>02</b><strong>5</strong></div><div><b>03</b><strong>2</strong></div><div><b>04</b><strong>2</strong></div><div><b>05</b><strong>2</strong></div></div>`};
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
  <div class="objective"><span class="objective-icon">⌁</span><div><strong>TU MISIÓN</strong><p>${htmlEsc(details.instruction)}</p></div></div>
  ${review ? `<div class="review-card"><strong>RETO CERRADO · ${result?.points||0}/20 PUNTOS</strong><p>${htmlEsc(meta.explanation)}</p></div>`:
   `<div class="attempts" id="attemptInfo">INTENTOS RESTANTES: ${MAX_ATTEMPTS-t.currentAttempts} / 3 · PUNTOS POSIBLES: ${POINTS_BY_ATTEMPT[t.currentAttempts]}</div>
  <form id="answerForm" autocomplete="off"><label for="answer">TU RESPUESTA</label>
    <div class="form-row"><input id="answer" name="answer" type="text" spellcheck="false" maxlength="90" placeholder="Escribe tu respuesta" required aria-label="Respuesta del reto"><button id="submitBtn" type="submit">VALIDAR <span>↗</span></button></div>
    <p id="feedback" class="feedback" role="status" aria-live="polite"></p></form>
  <div class="review-card" id="explanation" hidden><strong>RESULTADO DEL RETO</strong><p id="explanationText"></p><button class="next-button" type="button" id="nextBtn">${level===5?'VER RESULTADOS':'CONTINUAR AL SIGUIENTE RETO'} →</button></div>
  <div class="help-row"><button type="button" id="hintBtn">¿Necesitas una pista? <span>+</span></button><p id="hintText" hidden>${htmlEsc(meta.hint)}</p></div>`}
  <div class="footer-meta">PARTICLE SWARM OPTIMIZATION · MÁXIMO 20 PUNTOS POR RETO · 15 MINUTOS TOTALES</div></main>
  ${!review ? `<script>(function(){
    const form=document.getElementById('answerForm'),input=document.getElementById('answer'),button=document.getElementById('submitBtn');
    const feedback=document.getElementById('feedback'),info=document.getElementById('attemptInfo');
    const hint=document.getElementById('hintBtn'),hintText=document.getElementById('hintText');
    hint.addEventListener('click',()=>{hintText.hidden=!hintText.hidden;hint.querySelector('span').textContent=hintText.hidden?'+':'−';});
    document.getElementById('nextBtn').addEventListener('click',()=>window.parent.postMessage({type:'pso-continue'},location.origin));
    form.addEventListener('submit',async event=>{
      event.preventDefault();button.disabled=true;feedback.textContent='Comprobando respuesta...';feedback.className='feedback';
      try{
        const response=await fetch('/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({level:${level},answer:input.value})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'Error al validar');
        feedback.textContent=result.message;feedback.className='feedback '+(result.ok?'good':'bad');
        if(result.advanced){
          form.hidden=true;info.hidden=true;hint.parentElement.hidden=true;
          const explanation=document.getElementById('explanation');explanation.hidden=false;
          document.getElementById('explanationText').textContent=result.explanation;
          window.parent.postMessage({type:'pso-progress'},location.origin);
        }else{
          info.textContent='INTENTOS RESTANTES: '+result.remaining+' / 3 · PUNTOS POSIBLES: '+([20,15,10][result.attemptsUsed]||0);
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
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.send(challengeDocument(level,t));
});
app.get('/api/scores',(req,res)=>{res.json({scores:leaderboard(),maxScore:100,order:'puntos DESC, tiempo ASC, intentos ASC'});});
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
