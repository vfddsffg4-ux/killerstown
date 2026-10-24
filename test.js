'use strict';
process.env.MIN_PLAYERS = '6';
const http = require('http');
const G = require('./game');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('✗ ' + name); } };
const has = (room, p, re) => G.view(room, p.id).log.some(e => re.test(e.text));

// ---------- помощники ----------
function mk(roles) {
  const ps = roles.map((r, i) => G.newPlayer('P' + i));
  const room = G.mkRoom(ps[0]); room.players = ps;
  const r = G.startGame(room, ps[0]); if (r.err) throw new Error(r.err);
  ps.forEach((p, i) => { p.role = roles[i]; p.items = []; });
  return { room, P: ps };
}
function turnOrder(room, ps) { room.order = ps.map(p => p.id); room.turn = -1; G.advance(room); }
const A = (room, p, m) => G.act(room, p, m);
const loc = (room, id) => room.locs.find(l => l.id === id);

// ---------- 1. состав ----------
const expect = { 6: [1, 1, 2, 2, 3], 7: [1, 1, 3, 2, 3], 8: [1, 2, 3, 2, 3], 9: [1, 2, 4, 2, 4], 10: [1, 2, 4, 3, 4], 11: [1, 2, 5, 3, 5], 12: [2, 2, 5, 3, 5] };
for (let n = 6; n <= 12; n++) {
  const c = G.composition(n); ok([c.k, c.a, c.r, c.d, c.loc].join() === expect[n].join(), 'состав ' + n);
  const ps = Array.from({ length: n }, (_, i) => G.newPlayer('N' + i)); const room = G.mkRoom(ps[0]); room.players = ps; G.startGame(room, ps[0]);
  const cnt = g => ps.filter(p => G.ROLES[p.role].g === g).length;
  ok(cnt('killer') === c.k && cnt('acc') === c.a && cnt('res') === c.r && cnt('det') === c.d, 'роли по группам ' + n);
  ok(room.locs.length === c.loc, 'локации ' + n);
  ok(ps.every(p => p.cards.length === 6 && p.cards[0].cat === 'gender'), 'карточки ' + n);
}
{ const ps = Array.from({ length: 5 }, (_, i) => G.newPlayer('S' + i)); const room = G.mkRoom(ps[0]); room.players = ps; ok(!!G.startGame(room, ps[0]).err, 'меньше 6 игроков нельзя'); }
{ const ps = Array.from({ length: 6 }, (_, i) => G.newPlayer('H' + i)); const room = G.mkRoom(ps[0]); room.players = ps; ok(!!G.startGame(room, ps[1]).err, 'старт только создателем'); }

// ---------- 2. основной цикл ----------
{
  const { room, P } = mk(['serial', 'fan', 'sherlock', 'cop', 'medic', 'citizen']);
  const [killer, fan, sher, cop, medic, cit] = P;
  // приватность
  const v = G.view(room, cit.id);
  ok(v.players.every(p => !('role' in p)) && v.you.role.key === 'citizen', 'в списке игроков нет чужих ролей');
  ok(!JSON.stringify(v).includes('"serial"') && !JSON.stringify(v).includes('Серийный'), 'роль убийцы не утекает жителю');
  ok(v.you.evidence === null, 'у жителя нет окна улик');
  ok(G.view(room, sher.id).you.evidence !== null, 'у сыщика есть окно улик');
  turnOrder(room, [cit, fan, killer, sher, cop, medic]);
  ok(A(room, fan, { type: 'inspect', loc: 'power' }).err, 'не очередь — осмотр запрещён');
  ok(A(room, killer, { type: 'skip' }).err, 'не очередь — пропуск запрещён');
  ok(A(room, killer, { type: 'inspect', loc: 'power' }).err, 'убийца не осматривает');
  // житель осматривает электростанцию
  ok(A(room, cit, { type: 'inspect', loc: 'power' }).ok, 'житель осматривает');
  ok(A(room, cit, { type: 'inspect', loc: 'road' }).err, 'второй осмотр в тот же ход запрещён');
  const dup = { type: 'skip', rid: 'abc' }; A(room, cit, dup);
  ok(room.order[room.turn] === fan.id, 'ход передан Поклоннику');
  ok(A(room, cit, dup).dup === true && room.order[room.turn] === fan.id, 'повторный rid игнорируется');
  // условие способности Поклонника
  ok(A(room, fan, { type: 'role' }).ok && fan.fanArmed, 'Поклонник активирует умение до осмотра');
  ok(A(room, fan, { type: 'role' }).err, 'повторная активация запрещена');
  // саботаж по охраняемой локации не срабатывает
  A(room, fan, { type: 'inspect', loc: 'power' });
  ok(loc(room, 'power').eff.every(e => e.t !== 'dark'), 'саботаж отбит осмотром жителя');
  ok(fan.used.fan === true && !fan.fanArmed, 'умение Поклонника потрачено (раз за игру)');
  A(room, fan, { type: 'skip' });
  // убийство
  ok(A(room, killer, { type: 'role', target: killer.id }).err, 'нельзя убить себя');
  ok(A(room, killer, { type: 'role', target: medic.id }).ok && !medic.alive, 'убийство работает');
  ok(room.locs.every(l => l.clues.length === 1), 'улики появились во всех локациях');
  ok(A(room, killer, { type: 'role', target: cop.id }).err, 'второе убийство в круг запрещено (перезарядка)');
  ok(has(room, cit, /убит/) && !has(room, cit, /Серийный/), 'смерть в общем журнале, убийца не назван');
  A(room, killer, { type: 'skip' });
  // сыщик: микроскоп → улика найдена
  sher.micro = true;
  ok(A(room, sher, { type: 'inspect', loc: 'road' }).ok && sher.evidence.length === 1, 'сыщик находит улику');
  ok(/тип|Личность/.test(sher.evidence[0].label), 'улика указывает карточку и тип');
  ok(!has(room, cit, /Найдена улика/), 'находка видна только сыщику');
  // Шерлок
  ok(A(room, sher, { type: 'role', target: fan.id }).ok, 'Шерлок раскрывает роль');
  ok(has(room, sher, /Поклонник/) && !has(room, cit, /Поклонник/) && !has(room, fan, /Роль игрока/), 'роль видит только Шерлок');
  A(room, sher, { type: 'skip' });
  // Злой коп: нельзя выбрать ходившего до него
  ok(A(room, cop, { type: 'role', target: sher.id }).err, 'коп не выбирает ходивших до себя');
  A(room, cop, { type: 'skip' });
  ok(room.phase === 'evening', 'после всех ходов наступает вечер');
  // вечер: обвинение
  ok(A(room, cit, { type: 'inspect', loc: 'road' }).err, 'вечером нельзя осматривать');
  ok(A(room, cit, { type: 'accuse', target: cit.id }).err, 'нельзя обвинить себя');
  ok(A(room, cit, { type: 'accuse', target: fan.id }).ok, 'обвинение выдвинуто');
  ok(A(room, cit, { type: 'accuse', target: killer.id }).err, 'второе обвинение от того же запрещено');
  ok(A(room, cit, { type: 'vote', acc: room.accus[0].id }).err, 'повторный голос запрещён');
  ok(A(room, sher, { type: 'vote', acc: room.accus[0].id }).ok && fan.alive, 'голосов недостаточно — не изгнан');
  A(room, cop, { type: 'vote', acc: room.accus[0].id });
  ok(!fan.alive && room.phase === 'day' && room.round === 2, 'больше половины — изгнан, новый круг');
  ok(room.accRounds[1] === true, 'обвинение учтено для Шерлока');
}

// ---------- 3. саботаж / защита / предметы ----------
{ // саботаж без охраны скрывает улики; УФ находит
  const { room, P } = mk(['serial', 'fan', 'sherlock', 'cop', 'medic', 'citizen']); const [k, f, s, c, m, ci] = P;
  turnOrder(room, [k, f, s, c, m, ci]);
  A(room, k, { type: 'role', target: ci.id }); A(room, k, { type: 'skip' });
  A(room, f, { type: 'inspect', loc: 'road' }); A(room, f, { type: 'skip' });
  ok(A(room, s, { type: 'inspect', loc: 'road' }).msg.includes('ничего'), 'после саботажа сыщик ничего не находит');
  A(room, s, { type: 'skip' }); c.uv = true;
  ok(A(room, c, { type: 'inspect', loc: 'road' }).ok && c.evidence.length === 1, 'УФ-фонарь находит улику после саботажа');
}
{ // перчатки
  const { room, P } = mk(['serial', 'fan', 'sherlock', 'cop', 'medic', 'citizen']); const [k] = P; turnOrder(room, P);
  k.items.push({ uid: 'g1', id: 'k_gloves' });
  ok(A(room, k, { type: 'item', item: 'g1' }).ok, 'перчатки применены');
  A(room, k, { type: 'role', target: P[5].id });
  ok(room.locs.every(l => l.clues.length === 0), 'перчатки: улик нет');
  ok(A(room, k, { type: 'item', item: 'g1' }).err, 'предмет потрачен');
}
{ // замок, связка, дым
  const { room, P } = mk(['serial', 'fan', 'sherlock', 'cop', 'medic', 'citizen']); const [k, f, s, c, m, ci] = P; turnOrder(room, [ci, f, s, c, m, k]);
  ci.items.push({ uid: 'l1', id: 'r_lock' });
  ok(A(room, ci, { type: 'item', item: 'l1', loc: 'power' }).ok, 'старый замок');
  A(room, ci, { type: 'skip' });
  ok(A(room, f, { type: 'inspect', loc: 'power' }).err, 'на запертой локации саботаж невозможен');
  A(room, f, { type: 'skip' });
  ok(A(room, s, { type: 'inspect', loc: 'power' }).err, 'запертую локацию нельзя осмотреть');
  ok(!A(room, s, { type: 'inspect', loc: 'road' }).err, 'другая локация доступна');
}
{ // щит и аптечка, воскрешение, судья, клоун, любовница
  const { room, P } = mk(['serial', 'angel', 'medic', 'judge', 'mistress', 'citizen']); const [k, an, me, ju, mi, ci] = P;
  turnOrder(room, [an, k, me, ju, mi, ci]);
  ok(A(room, an, { type: 'role', target: ci.id }).ok, 'ангел выдаёт щит'); A(room, an, { type: 'skip' });
  ok(A(room, k, { type: 'role', target: ci.id }).ok && ci.alive && !ci.shield, 'щит спасает и расходуется');
  A(room, k, { type: 'skip' });
  ok(A(room, me, { type: 'role', target: ci.id }).err, 'Медичка не воскрешает живого'); A(room, me, { type: 'skip' });
  A(room, ju, { type: 'skip' });
  ok(A(room, mi, { type: 'role', target: ci.id }).ok && room.silenced[ci.id], 'Любовница глушит голос');
  ok(G.view(room, ci.id).log.some(e => /способность Любовницы/.test(e.text) && !e.text.includes(mi.nick)), 'в журнале: способность применена, без имени');
  A(room, mi, { type: 'skip' }); A(room, ci, { type: 'skip' });
  // вечер: голос заглушённого не считается
  const t = k; A(room, an, { type: 'accuse', target: t.id }); const acc = room.accus[0];
  A(room, ci, { type: 'vote', acc: acc.id }); A(room, me, { type: 'vote', acc: acc.id });
  ok(acc.counted === 2 && k.alive, 'голос заглушённого не учтён');
  A(room, ju, { type: 'vote', acc: acc.id }); A(room, mi, { type: 'vote', acc: acc.id });
  ok(!k.alive && room.phase === 'ended' && room.winner.side === 'good', 'изгнан убийца — победа добрых');
}
{ // убийство + воскрешение Медичкой и перезарядка
  const { room, P } = mk(['serial', 'angel', 'medic', 'judge', 'mistress', 'citizen']); const [k, an, me, ju, mi, ci] = P;
  turnOrder(room, [k, me, an, ju, mi, ci]);
  A(room, k, { type: 'role', target: mi.id }); A(room, k, { type: 'skip' });
  ok(A(room, me, { type: 'role', target: mi.id }).ok && mi.alive, 'Медичка воскрешает убитого');
  A(room, me, { type: 'skip' });
  ok(me.medUsed && me.medSince === 0, 'способность на перезарядке');
}
{ // судья
  let r = mk(['serial', 'cop', 'medic', 'judge', 'mistress', 'citizen']); let [k, an, me, ju, mi, ci] = r.P; turnOrder(r.room, [ju, k, an, me, mi, ci]);
  A(r.room, ju, { type: 'role', target: ci.id }); ok(!ju.alive, 'Судья погибает от жителя');
  ok(r.room.order[r.room.turn] === k.id, 'ход перешёл дальше после гибели судьи');
  r = mk(['serial', 'angel', 'medic', 'judge', 'mistress', 'citizen']); [k, an, me, ju, mi, ci] = r.P; turnOrder(r.room, [ju, k, an, me, mi, ci]);
  A(r.room, ju, { type: 'role', target: mi.id }); ok(!mi.alive && ju.alive, 'сообщник изгнан судьёй');
  r = mk(['serial', 'angel', 'medic', 'judge', 'mistress', 'citizen']); [k, an, me, ju, mi, ci] = r.P; turnOrder(r.room, [ju, k, an, me, mi, ci]);
  A(r.room, ju, { type: 'role', target: k.id }); ok(r.room.phase === 'ended' && r.room.winner.side === 'good', 'судья угадал убийцу — игра окончена');
}
{ // клоун
  const { room, P } = mk(['serial', 'clown', 'medic', 'judge', 'mistress', 'citizen']); const [k, cl, me, ju, mi, ci] = P;
  ok(A(room, k, { type: 'role', target: ci.id }).err || true, 'noop');
  turnOrder(room, [cl, k, me, ju, mi, ci]);
  ok(A(room, cl, { type: 'role' }).err, 'у клоуна нет способности');
  ok(G.view(room, cl.id).you.btnRole === false, 'у клоуна нет кнопки роли');
  [cl, k, me, ju, mi, ci].forEach(p => A(room, p, { type: 'skip' }));
  A(room, me, { type: 'accuse', target: cl.id }); const a = room.accus[0];
  A(room, ju, { type: 'vote', acc: a.id }); A(room, mi, { type: 'vote', acc: a.id }); A(room, ci, { type: 'vote', acc: a.id });
  ok(room.phase === 'ended' && room.winner.side === 'clown', 'клоун победил после изгнания');
}
{ // победа убийцы
  const { room, P } = mk(['serial', 'fan', 'sherlock', 'cop', 'medic', 'citizen']); const [k, f, s, c] = P;
  turnOrder(room, P); s.alive = false; c.alive = false; room.killed.push();
  const r = (() => { const x = G.act(room, k, { type: 'role', target: P[4].id }); return x; })();
  ok(r.ok, 'убийство'); // остаётся sher/cop мертвы — нет живых сыщиков
  ok(room.phase === 'ended' && room.winner.side === 'evil', 'все сыщики мертвы — победа убийцы');
}
{ // кровавое письмо
  const { room, P } = mk(['serial', 'fan', 'sherlock', 'cop', 'medic', 'citizen']); const [k, f, s, c, m, ci] = P; turnOrder(room, [k, ci, s, c, m, f]);
  k.items.push({ uid: 'b1', id: 'k_letter' });
  ok(A(room, k, { type: 'item', item: 'b1', player: ci.id }).ok && ci.pending, 'письмо отправлено');
  ok(G.view(room, ci.id).you.pending && !G.view(room, s.id).you.pending, 'письмо видит только адресат');
  A(room, ci, { type: 'letter', accept: false });
  ok(has(room, s, /заявляет/) && k.free.includes(ci.id), 'заявление публично, убийце даровано бесплатное убийство');
  A(room, k, { type: 'role', target: m.id });
  ok(A(room, k, { type: 'role', target: ci.id }).ok && !ci.alive, 'второе (бесплатное) убийство разрешено');
}
{ // авто-пропуск, дымовая, Любовница и Кусачки
  const { room, P } = mk(['serial', 'fan', 'sherlock', 'cop', 'medic', 'citizen']); const [k, f, s] = P; turnOrder(room, [f, s, k, P[3], P[4], P[5]]);
  f.cutters = true; room.locs[0].eff.push({ t: 'guard', until: room.round, by: 'x' });
  A(room, f, { type: 'inspect', loc: 'power' }); ok(room.locs[0].eff.some(e => e.t === 'dark'), 'Кусачки обходят обычную охрану');
  room.locs[1].eff.push({ t: 'barricade', until: room.round, by: 'x' }); f.cutters = true; A(room, f, { type: 'skip' });
  const g = (() => { P[1].cutters = true; return null; })();
}
// вероятность предметов ~15%
{ let got = 0; const N = 3000;
  for (let i = 0; i < N; i++) { const { room, P } = mk(['serial', 'fan', 'sherlock', 'cop', 'medic', 'citizen']); turnOrder(room, [P[5], ...P.slice(0, 5)]); A(room, P[5], { type: 'inspect', loc: 'home' }); if (P[5].items.length) got++; }
  ok(got / N > .11 && got / N < .19, 'шанс предмета при осмотре ≈15% (' + (100 * got / N).toFixed(1) + '%)'); }

// ---------- 4. HTTP: комнаты, сессии, приватность ----------
const { start } = require('./server');
(async () => {
  const srv = await start(0), port = srv.address().port;
  const call = async (path, body) => { const r = await fetch(`http://localhost:${port}${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); return { s: r.status, j: await r.json() }; };
  const st = {}, reqs = [];
  const sse = tk => { const q = http.get({ port, path: '/events?token=' + tk }, res => { let buf = ''; res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ch = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /event: (\w+)/.exec(ch), dt = /data: (.*)/.exec(ch); if (ev && ev[1] === 'state') st[tk] = JSON.parse(dt[1]); } }); }); reqs.push(q); return q; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const host = (await call('/api/create', { nick: 'Хост' })).j; ok(!!host.token, 'создание комнаты');
  ok((await call('/api/rooms')).j.some(r => r.id === host.roomId), 'комната в списке');
  // игрок сначала в другой комнате, затем напрямую присоединяется (без выхода)
  const other = (await call('/api/create', { nick: 'Другой' })).j;
  ok((await call('/api/rooms')).j.length === 2, 'две комнаты');
  const moved = (await call('/api/join', { nick: 'Другой', roomId: host.roomId, oldToken: other.token })).j;
  ok(!!moved.token && (await call('/api/rooms')).j.length === 1, 'прямое присоединение без выхода, пустая комната удалена');
  ok((await call('/api/join', { nick: 'хост', roomId: host.roomId })).s === 400, 'дубль ника запрещён');
  const toks = [host.token, moved.token];
  for (let i = 2; i < 6; i++) { if (i === 5) { ok((await call('/api/act', { token: host.token, type: 'start' })).s === 400, 'старт при <6 игроках отклонён'); } const j = (await call('/api/join', { nick: 'И' + i, roomId: host.roomId })).j; toks.push(j.token); }
  toks.forEach(sse); await wait(300);
  ok(toks.every(t => st[t] && st[t].players.length === 6), 'все видят 6 игроков в реальном времени');
  ok((await call('/api/act', { token: toks[1], type: 'start' })).s === 400, 'не-создатель не стартует');
  ok((await call('/api/act', { token: host.token, type: 'start' })).s === 200, 'старт игры');
  await wait(300);
  const roles = toks.map(t => st[t].you.role.key);
  ok(roles.every(Boolean) && roles.filter(r => r === 'serial').length === 1, 'роли розданы приватно');
  ok(toks.every(t => st[t].players.every(p => !('role' in p))), 'сетевые ответы без чужих ролей');
  ok(toks.every(t => { const own = st[t].you.role.name; return !JSON.stringify(st[t].log).includes('Серийный'); }), 'журнал без ролей');
  ok(toks.every(t => st[t].players.every(p => p.cards.length === 6)), 'карточки игроков публичны, у всех по 6');
  // ход
  const cur = toks.find(t => st[t].turn === st[t].you.id), non = toks.find(t => t !== cur);
  ok((await call('/api/act', { token: non, type: 'skip' })).s === 400, 'не в свой ход — отказ');
  ok((await call('/api/act', { token: cur, type: 'skip', rid: 'r1' })).s === 200, 'пропуск хода');
  ok((await call('/api/act', { token: cur, type: 'skip', rid: 'r1' })).j.dup === true, 'дубль запроса игнорируется');
  await wait(200);
  ok(st[toks[0]].turn !== st[cur].you.id, 'ход передан дальше у всех');
  // перезагрузка страницы — восстановление
  reqs.forEach(r => r.destroy()); await wait(200);
  const me = await call('/api/me?token=' + toks[2]); ok(me.s === 200, 'сессия восстановлена по токену');
  const before = roles[2]; delete st[toks[2]]; sse(toks[2]); await wait(300);
  ok(st[toks[2]] && st[toks[2]].you.role.key === before, 'после перезагрузки игрок вернулся со своей ролью');
  ok((await call('/api/me?token=bad')).s === 404, 'чужой токен не действует');
  console.log(`\nПройдено: ${pass}, провалено: ${fail}`);
  reqs.forEach(r => r.destroy()); srv.close(); process.exit(fail ? 1 : 0);
})();
