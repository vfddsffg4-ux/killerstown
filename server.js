'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const G = require('./game');
const rooms = new Map(), tokens = new Map(), conns = new Map(), listSubs = new Set();
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const body = req => new Promise(r => { let b = ''; req.on('data', d => { b += d; if (b.length > 400000) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
function auth(token) { const t = tokens.get(token); if (!t) return null; const room = rooms.get(t.roomId); if (!room) return null; const p = room.players.find(x => x.id === t.pid); return p ? { room, p } : null; }
const send = (res, ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
function listRooms() {
  return [...rooms.values()].filter(r => r.phase === 'lobby').map(r => ({ id: r.id, name: r.name, host: G.pl(r, r.host).nick, count: r.players.length, max: G.MAX }));
}
function pushList() { const l = listRooms(); for (const res of listSubs) send(res, 'rooms', l); }
function pushRoom(room) {
  for (const p of room.players) { const s = conns.get(p.id); if (s) for (const res of s) send(res, 'state', G.view(room, p.id)); }
  pushList();
}
function cleanNick(n) { n = String(n || '').replace(/[<>]/g, '').trim().slice(0, 16); return n; }
function removeFromLobby(room, p) {
  room.players = room.players.filter(x => x !== p); tokens.delete(p.token);
  const s = conns.get(p.id); if (s) { for (const r of s) r.end(); conns.delete(p.id); }
  if (!room.players.length) rooms.delete(room.id);
  else if (room.host === p.id) { room.host = room.players[0].id; room.name = 'Комната ' + room.players[0].nick; }
  if (rooms.has(room.id)) pushRoom(room); else pushList();
}
function detach(token) { const a = auth(token); if (a && a.room.phase === 'lobby') removeFromLobby(a.room, a.p); }

async function api(req, res, url) {
  const q = url.searchParams;
  if (req.method === 'GET' && url.pathname === '/api/rooms') return json(res, 200, listRooms());
  if (req.method === 'GET' && url.pathname === '/api/me') { const a = auth(q.get('token')); return a ? json(res, 200, { ok: true, roomId: a.room.id }) : json(res, 404, { ok: false }); }
  if (req.method !== 'POST') return json(res, 404, { err: 'not found' });
  const b = await body(req);
  if (url.pathname === '/api/create' || url.pathname === '/api/join') {
    const nick = cleanNick(b.nick); if (!nick) return json(res, 400, { err: 'Введите ник' });
    let room;
    if (url.pathname === '/api/join') {
      room = rooms.get(b.roomId);
      if (!room) return json(res, 404, { err: 'Комната не найдена' });
      if (room.phase !== 'lobby') return json(res, 400, { err: 'Игра в этой комнате уже началась' });
      if (room.players.length >= G.MAX) return json(res, 400, { err: 'Комната заполнена' });
      if (room.players.some(p => p.nick.toLowerCase() === nick.toLowerCase())) return json(res, 400, { err: 'Этот ник уже занят в комнате' });
    }
    if (b.oldToken) { const old = auth(b.oldToken); if (old && old.room.phase === 'lobby') { if (room && old.room === room) return json(res, 400, { err: 'Вы уже в этой комнате' }); detach(b.oldToken); } }
    const p = G.newPlayer(nick);
    if (!room) { room = G.mkRoom(p); rooms.set(room.id, room); } else room.players.push(p);
    tokens.set(p.token, { roomId: room.id, pid: p.id });
    pushRoom(room);
    return json(res, 200, { token: p.token, roomId: room.id });
  }
  const a = auth(b.token);
  if (!a) return json(res, 401, { err: 'Сессия не найдена' });
  const { room, p } = a;
  if (url.pathname === '/api/leave') { if (room.phase === 'lobby') removeFromLobby(room, p); else { tokens.delete(p.token); p.connected = false; p.lastSeen = Date.now(); pushRoom(room); } return json(res, 200, { ok: true }); }
  if (url.pathname === '/api/avatar') {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(b.data || ''));
    if (!m) return json(res, 400, { err: 'Неверное изображение' });
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 90000) return json(res, 400, { err: 'Изображение слишком большое' });
    p.avatar = { mime: 'image/' + m[1], buf }; p.av++; pushRoom(room); return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/act') {
    const r = G.act(room, p, b) || { ok: true };
    pushRoom(room);
    return json(res, r.err ? 400 : 200, r);
  }
  return json(res, 404, { err: 'not found' });
}

function sse(req, res, url) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 1500\n\n');
  if (url.pathname === '/events/rooms') { listSubs.add(res); send(res, 'rooms', listRooms()); req.on('close', () => listSubs.delete(res)); return; }
  const a = auth(url.searchParams.get('token'));
  if (!a) { send(res, 'gone', {}); return res.end(); }
  const { room, p } = a;
  if (!conns.has(p.id)) conns.set(p.id, new Set()); conns.get(p.id).add(res);
  p.connected = true; p.lastSeen = Date.now();
  send(res, 'state', G.view(room, p.id)); pushRoom(room);
  req.on('close', () => {
    const s = conns.get(p.id); if (s) { s.delete(res); if (!s.size) { conns.delete(p.id); p.connected = false; p.lastSeen = Date.now(); if (rooms.has(room.id)) pushRoom(room); } }
  });
}

function serveStatic(req, res, url) {
  let m = /^\/avatar\/([a-f0-9]+)\/([a-f0-9]+)$/.exec(url.pathname);
  if (m) { const room = rooms.get(m[1]), p = room && G.pl(room, m[2]); if (!p || !p.avatar) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': p.avatar.mime, 'Cache-Control': 'max-age=300' }); return res.end(p.avatar.buf); }
  let f = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const full = path.normalize(path.join(PUB, f));
  if (!full.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' }); res.end(d); });
}

function start(port) {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) return api(req, res, url).catch(e => { console.error(e); json(res, 500, { err: 'Ошибка сервера' }); });
      if (url.pathname.startsWith('/events')) return sse(req, res, url);
      return serveStatic(req, res, url);
    } catch (e) { console.error(e); res.writeHead(500); res.end(); }
  });
  const timer = setInterval(() => {
    for (const room of [...rooms.values()]) {
      if (room.phase === 'lobby') { for (const p of [...room.players]) if (!p.connected && Date.now() - p.lastSeen > 45000) removeFromLobby(room, p); }
      else {
        if (G.tick(room)) pushRoom(room);
        if (room.players.every(p => !p.connected && Date.now() - p.lastSeen > 30 * 60000)) { rooms.delete(room.id); pushList(); }
      }
    }
    for (const s of conns.values()) for (const r of s) r.write(': ping\n\n');
    for (const r of listSubs) r.write(': ping\n\n');
  }, 5000);
  srv.on('close', () => clearInterval(timer));
  return new Promise(r => srv.listen(port, () => r(srv)));
}
module.exports = { start, rooms };
if (require.main === module) { const port = +process.env.PORT || 3000; start(port).then(() => console.log('Город убийц: http://localhost:' + port)); }
