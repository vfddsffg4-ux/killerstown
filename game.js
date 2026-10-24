'use strict';
// «Город убийц» — авторитетная игровая логика. Клиент ничего не решает сам.
const crypto = require('crypto');
const rnd = n => crypto.randomInt(n);
const pick = a => a[rnd(a.length)];
const roll = p => rnd(100) < p;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uid = () => crypto.randomBytes(5).toString('hex');
const rtime = () => String(rnd(24)).padStart(2, '0') + ':' + String(rnd(60)).padStart(2, '0');
const MIN = +process.env.MIN_PLAYERS || 6, MAX = 12;
const TN = { pos: 'положительное', neu: 'нейтральное', neg: 'отрицательное' };

const CARDS = {
  hobby: { name: 'Увлечение',
    pos: ['Занимается благотворительностью', 'Разводит растения', 'Помогает бездомным животным', 'Занимается волонтёрством'],
    neu: ['Коллекционирует монеты', 'Собирает старые часы', 'Изучает историю', 'Изучает карты города'],
    neg: ['Увлекается азартными играми', 'Участвует в нелегальных гонках', 'Увлекается опасными экспериментами', 'Увлекается жестокими фильмами'] },
  past: { name: 'Прошлое',
    pos: ['Работал врачом', 'Помогал полиции как свидетель', 'Спас человека при пожаре', 'Служил добровольцем'],
    neu: ['Работал курьером', 'Работал на складе', 'Учился в техническом колледже', 'Работал часовщиком'],
    neg: ['Был замешан в мошенничестве', 'Отбывал наказание за кражу', 'Был уволен за угрозы коллегам', 'Был связан с подпольной группировкой'] },
  hate: { name: 'Ненависть',
    pos: ['Не терпит несправедливости', 'Не переносит жестокость', 'Не терпит издевательств', 'Выступает против коррупции'],
    neu: ['Не любит громкую музыку', 'Не любит дождь', 'Не любит собак', 'Не любит тесные помещения'],
    neg: ['Ненавидит определённую семью', 'Ненавидит полицейских', 'Не прощает обид', 'Испытывает ненависть к бывшему другу'] },
  fact: { name: 'Факты',
    pos: ['Однажды спас незнакомца', 'Регулярно помогает соседям', 'Знает город как свои пять пальцев', 'Часто путешествовал'],
    neu: ['Однажды вернул потерянные деньги', 'Умеет играть на пианино', 'Знает основы механики', 'Коллекционирует открытки'],
    neg: ['Когда-то угрожал соседу', 'Был пойман на подделке документов', 'Скрывает серьёзный конфликт', 'Уничтожил чужую вещь из мести'] },
  trait: { name: 'Черта характера',
    pos: ['Доброжелательный', 'Честный', 'Терпеливый', 'Ответственный'],
    neu: ['Молчаливый', 'Замкнутый', 'Любопытный', 'Расчётливый'],
    neg: ['Агрессивный', 'Жестокий', 'Мстительный', 'Манипулятивный'] }
};
const CATS = ['hobby', 'past', 'hate', 'fact', 'trait'];
function dealCards() {
  const c = [{ cat: 'gender', name: 'Личность', label: 'Пол', text: pick(['Мужской', 'Женский']), type: null }];
  for (const k of CATS) { const t = pick(['pos', 'neu', 'neg']); c.push({ cat: k, name: CARDS[k].name, text: pick(CARDS[k][t]), type: t }); }
  return c;
}

const LOCS = [
  { id: 'power', name: 'Электростанция', icon: '⚡', d: 'Отвечает за электричество. Если сообщник выводит её из строя, часть улик может стать скрытой или недоступной для обычного осмотра.' },
  { id: 'road', name: 'Магистраль', icon: '🛣️', d: 'Здесь можно нарушить движение по дорогам или скрыть доступ к некоторым следам, связанным с перемещениями.' },
  { id: 'home', name: 'Жилой сектор', icon: '🏘️', d: 'Место, где сообщник может подбрасывать ложные улики, создавая неверные версии событий и подозреваемых.' },
  { id: 'archive', name: 'Полицейский архив', icon: '🗄️', d: 'Здесь можно искать сведения о прошлом, сопоставлять найденные факты и получать косвенные зацепки.' },
  { id: 'store', name: 'Склад', icon: '📦', d: 'Место, связанное с перевозкой вещей, документами, подготовкой преступлений и возможными следами действий преступника.' }
];

// g: killer | acc | det | res ; f: evil | good ; tg: тип цели способности
const ROLES = {
  serial: { name: 'Серийный убийца', f: 'evil', g: 'killer', tg: 'player', d: 'Может убивать игроков в свой ход. Способность перезаряжается каждый круг.' },
  fan: { name: 'Поклонник', f: 'evil', g: 'acc', tg: 'none', d: 'Активируйте умение до осмотра места: после осмотра Психопат автоматически проверит место на улики и избавится от одной. Один раз за игру.' },
  mistress: { name: 'Любовница', f: 'evil', g: 'acc', tg: 'player', d: 'Раз за круг выбирает живого игрока: в следующий обвинительный круг его голос не учитывается.' },
  accomplice: { name: 'Сообщник', f: 'evil', g: 'acc', tg: null, d: 'Помогайте убийце саботажем локаций.' },
  sherlock: { name: 'Шерлок', f: 'good', g: 'det', tg: 'player', d: 'После убийства, если в прошлом кругу никто не выдвигал обвинение, раскрывает роль одного игрока. Увидите только вы.' },
  cop: { name: 'Злой коп', f: 'good', g: 'det', tg: 'player', d: 'Запрещает игроку пользоваться способностями до конца круга. Одну цель нельзя выбрать повторно. Нельзя выбрать тех, кто ходил до вас.' },
  judge: { name: 'Судья', f: 'good', g: 'det', tg: 'player', d: 'Обязывает цель раскрыть роль. Житель — Судья погибает. Сообщник — изгнан. Убийца — игра заканчивается.' },
  medic: { name: 'Медичка', f: 'good', g: 'res', tg: 'dead', d: 'Воскрешает убитого игрока. После двух убийств способность перезаряжается (изгнания не считаются).' },
  angel: { name: 'Ангел-хранитель', f: 'good', g: 'res', tg: 'player', d: 'Выдаёт одноразовый щит другому игроку; щит сохраняется до первого срабатывания.' },
  clown: { name: 'Клоун', f: 'good', g: 'res', tg: null, d: 'Ваша цель — добиться собственного изгнания голосованием. Кнопки умения нет.' },
  citizen: { name: 'Житель', f: 'good', g: 'res', tg: null, d: 'Помогайте сыщикам, охраняя локации.' }
};

// ---------- предметы ----------
const ITEM_LIST = [
  ['k_gloves', 'killer', 'Перчатки без следов', 'При следующем убийстве не появляется улика, связанная с самим убийством. Ранее найденные улики сохраняются.', []],
  ['k_letter', 'killer', 'Кровавое письмо', 'Отправьте письмо любому игроку: он станет сообщником или заявит о письме всем. Если заявит — вы сможете убить его в свой ход, не тратя ход.', ['player']],
  ['k_smoke', 'killer', 'Дымовая шашка', 'На выбранной локации временно блокирует обычный осмотр детективами до конца раунда.', ['loc']],
  ['k_clock', 'killer', 'Сломанные часы', 'Искажает время, указанное в случайной найденной улике.', []],
  ['k_note', 'killer', 'Поддельная записка', 'Создаёт одну ложную улику в доступной локации.', ['loc']],
  ['a_cutters', 'acc', 'Кусачки', 'Следующий саботаж пройдёт вопреки обычной защите жителя. Не обходят блокировку локации и усиленную защиту.', []],
  ['a_wire', 'acc', 'Перерезанный провод', 'Выводит электростанцию из строя до конца следующего раунда без осмотра.', []],
  ['a_report', 'acc', 'Поддельный отчёт', 'Создаёт одну ложную улику.', ['loc']],
  ['a_soot', 'acc', 'Мешочек с сажей', 'Скрывает одну ещё не найденную настоящую улику до конца следующего раунда.', ['loc']],
  ['a_chain', 'acc', 'Дорожная цепь', 'Блокирует дорожную службу до конца следующего раунда. Обычная защита не останавливает её; специальная может.', []],
  ['a_ink', 'acc', 'Чернильная бомба', 'С вероятностью 60% делает одну настоящую улику недоступной до конца текущего раунда.', ['loc']],
  ['a_anon', 'acc', 'Анонимное письмо', 'Отправляет сыщикам ложное письмо «от жителей» с ложной уликой.', []],
  ['a_key', 'acc', 'Сломанный ключ', 'Снимает защиту локации, установленную обычным предметом жителя. Не открывает запертые локации.', ['loc']],
  ['a_gas', 'acc', 'Газовая шашка', 'Делает локацию недоступной для осмотра до конца текущего раунда.', ['loc']],
  ['a_print', 'acc', 'Подброшенный отпечаток', 'Создаёт ложную улику, имитирующую след преступника. При проверке подделка может быть обнаружена.', ['loc']],
  ['r_lock', 'res', 'Старый замок', 'Блокирует выбранную локацию до конца раунда. Осмотр и саботаж там невозможны.', ['loc']],
  ['r_tools', 'res', 'Набор инструментов', 'С вероятностью 70% предотвращает один саботаж электростанции или магистрали.', ['loc']],
  ['r_lantern', 'res', 'Аварийный фонарь', 'Позволяет сыщикам осмотреть электростанцию, даже когда свет отключён.', []],
  ['r_barricade', 'res', 'Дорожное заграждение', 'Ограждает магистраль от сообщников.', []],
  ['r_camera', 'res', 'Камера наблюдения', 'Если в выбранной локации в этом раунде будет саботаж, вы узнаете об этом, но не увидите виновника.', ['loc']],
  ['r_medkit', 'res', 'Аптечка', 'Защищает выбранного живого игрока от одного убийства до следующего раунда. Не спасает от изгнания.', ['player']],
  ['r_radio', 'res', 'Полицейская рация', 'Анонимно предупреждает живого игрока о выбранной локации.', ['player', 'loc']],
  ['r_keys', 'res', 'Связка ключей', 'Открывает локацию, закрытую обычным старым замком. Другие блокировки не снимает.', ['loc']],
  ['r_map', 'res', 'Карта города', 'Раскрывает состояние одной локации, но не показывает, кто его изменил.', ['loc']],
  ['r_bell', 'res', 'Сигнальный колокол', 'Если в выбранной локации в этом раунде будет саботаж, все живые игроки получат уведомление без имени виновника.', ['loc']],
  ['d_micro', 'det', 'Микроскоп', 'Повышает шанс найти настоящую улику на 30% (следующий осмотр).', []],
  ['d_dog', 'det', 'Розыскная собака', 'На следующем осмотре с вероятностью 40% находит вторую улику, если первая обнаружена.', []],
  ['d_prints', 'det', 'Набор для отпечатков', 'Определяет подлинность выбранной вашей улики.', ['clue']],
  ['d_uv', 'det', 'Ультрафиолетовый фонарь', 'Следующий осмотр найдёт улику даже после саботажа.', []],
  ['d_collect', 'det', 'Сборник уликов', 'Показывает одну случайную улику, найденную другим сыщиком.', []],
  ['d_notebook', 'det', 'Следственный блокнот', 'При наличии минимум 3 улик определяет подлинность ваших улик.', []],
  ['d_loupe', 'det', 'Экспертная лупа', 'С вероятностью 50% определяет, настоящая ли выбранная улика.', ['clue']],
  ['d_recorder', 'det', 'Диктофон', 'Раскрывает карточку «Пол» убийцы.', []],
  ['d_desc', 'det', 'Описание преступника', 'Определяет, был ли саботаж в выбранной локации.', ['loc']],
  ['d_dossier', 'det', 'Архивное досье', 'Сразу выдаёт случайную улику без осмотра.', []]
];
const ITEMS = {}; for (const [id, g, name, d, t] of ITEM_LIST) ITEMS[id] = { id, g, name, d, t };

// ---------- состав ----------
function composition(n) {
  let k = 1, a = 1, r = 2, d = 2, loc = 3;
  if (n >= 7) r++; if (n >= 8) a++; if (n >= 9) { r++; loc++; }
  if (n >= 10) d++; if (n >= 11) { r++; loc++; } if (n >= 12) k++;
  return { k, a, r, d, loc };
}
const take = (pool, n, fill) => { const s = shuffle(pool), o = []; for (let i = 0; i < n; i++) o.push(s[i] || fill); return o; };

// ---------- комната ----------
function newPlayer(nick) {
  return { id: uid(), token: crypto.randomBytes(16).toString('hex'), nick, av: 0, avatar: null, connected: true, lastSeen: Date.now(),
    alive: true, role: null, cards: [], items: [], evidence: [], used: {}, rids: [], pending: null, free: [], banUntil: 0, medkit: 0,
    shield: null, cutters: false, gloves: false, micro: false, dog: false, uv: false, fanArmed: false, copTargets: [], medUsed: false, medSince: 0 };
}
function mkRoom(host) {
  return { id: uid(), host: host.id, name: 'Комната ' + host.nick, players: [host], phase: 'lobby', round: 0, order: [], turn: -1, ts: {},
    locs: [], log: [], accus: [], skips: [], silenced: {}, kills: 0, accRounds: {}, killed: [], winner: null, seq: 0 };
}
const pl = (room, id) => room.players.find(p => p.id === id);
const alive = room => room.players.filter(p => p.alive);
const R = p => ROLES[p.role];
const getLoc = (room, id) => room.locs.find(l => l.id === id);
function say(room, text, o = {}) {
  room.log.push({ id: ++room.seq, r: room.round, text, kind: o.kind || 'info', to: o.to || null, acc: o.acc || null });
  if (room.log.length > 500) room.log.splice(0, room.log.length - 500);
}
const priv = (room, p, text, kind) => say(room, text, { to: [p.id], kind: kind || 'priv' });
const E = (room, loc, t) => loc.eff.filter(e => e.t === t && e.until >= room.round);
const addE = (room, loc, t, until, by) => loc.eff.push({ t, until, by });

function startGame(room, by) {
  if (room.phase !== 'lobby') return { err: 'Игра уже идёт' };
  if (by.id !== room.host) return { err: 'Начать игру может только создатель' };
  const n = room.players.length;
  if (n < MIN) return { err: `Нужно минимум ${MIN} игроков (сейчас ${n})` };
  if (n > MAX) return { err: `Максимум ${MAX} игроков` };
  const c = composition(n);
  const roles = [];
  for (let i = 0; i < c.k; i++) roles.push('serial');
  roles.push(...take(['fan', 'mistress'], c.a, 'accomplice'), ...take(['sherlock', 'cop', 'judge'], c.d, 'sherlock'), ...take(['medic', 'angel', 'clown'], c.r, 'citizen'));
  const rs = shuffle(roles);
  room.players.forEach((p, i) => { p.role = rs[i]; p.cards = dealCards(); });
  room.locs = LOCS.slice(0, c.loc).map(l => ({ id: l.id, name: l.name, eff: [], clues: [], sabRounds: [] }));
  room.phase = 'day'; room.round = 0;
  say(room, `Игра началась. Игроков: ${n}. Локаций: ${c.loc}.`, { kind: 'sys' });
  startDay(room);
  return { ok: true };
}

function startDay(room) {
  room.round++;
  room.locs.forEach(l => { l.eff = l.eff.filter(e => e.until >= room.round); l.clues.forEach(c => { if (c.hidden && c.hidden < room.round) delete c.hidden; }); });
  room.phase = 'day'; room.accus = []; room.skips = []; room.silenced = {}; room.kills = 0;
  room.order = shuffle(alive(room).map(p => p.id)); room.turn = -1;
  say(room, `☀ Круг ${room.round}. День. Порядок ходов: ${room.order.map(i => pl(room, i).nick).join(' → ')}`, { kind: 'sys' });
  advance(room);
}
function advance(room) {
  room.ts = {};
  for (;;) {
    room.turn++;
    if (room.turn >= room.order.length) return startEvening(room);
    const p = pl(room, room.order[room.turn]);
    if (p && p.alive) { say(room, `Ход игрока ${p.nick}`, { kind: 'turn' }); return; }
  }
}
function startEvening(room) {
  room.phase = 'evening'; room.turn = -1; room.accus = []; room.skips = [];
  say(room, '🌙 Наступил вечер. Обсуждайте, обвиняйте или пропускайте.', { kind: 'sys' });
}
function settle(room) {
  if (room.phase !== 'day') return;
  const cur = pl(room, room.order[room.turn]);
  if (!cur || !cur.alive) advance(room);
}

// ---------- улики ----------
const clueLabel = c => c.cat === 'gender' ? `Карточка Личность: ${c.gtxt}` : `Карточка ${CARDS[c.cat].name}, тип ${TN[c.type]}`;
function fakeClue(extra) {
  const cat = pick(['gender', ...CATS]);
  return { id: uid(), cat, type: cat === 'gender' ? null : pick(['pos', 'neu', 'neg']), gtxt: cat === 'gender' ? pick(['Мужской', 'Женский']) : null, time: rtime(), fake: true, ...extra };
}
function spawnClues(room, killer) {
  const time = rtime();
  for (const loc of room.locs) {
    const card = pick(killer.cards);
    loc.clues.push({ id: uid(), cat: card.cat, type: card.type, gtxt: card.cat === 'gender' ? card.text : null, time, fake: false, round: room.round });
  }
}
const toEv = (c, locName) => ({ id: uid(), label: clueLabel(c), cat: c.cat, type: c.type, time: c.time, fake: !!c.fake, loc: locName, auth: null });
function visible(room, loc, uv) {
  const sab = E(room, loc, 'sabotage').length > 0;
  return loc.clues.filter(c => uv || (!sab && !(c.hidden && c.hidden >= room.round)));
}
const hideRandom = (room, loc, until) => { const c = pick2(loc.clues.filter(x => !x.fake && !x.hidden)); if (c) c.hidden = until; };
const pick2 = a => a.length ? pick(a) : null;

// ---------- предметы: получение ----------
function rollItem(room, p) {
  if (!roll(15)) return;
  const pool = ITEM_LIST.filter(i => i[1] === R(p).g);
  const it = pick(pool);
  p.items.push({ uid: uid(), id: it[0] });
  priv(room, p, `🎁 Вы нашли предмет: «${it[2]}»`, 'priv');
}

// ---------- убийство / смерть ----------
function die(room, t, how) {
  t.alive = false; t.pending = null;
  if (how === 'kill') { room.killed.push(t.id); room.players.forEach(m => { if (m.role === 'medic' && m.alive) m.medSince++; }); }
}
function checkEnd(room) {
  if (room.phase === 'ended') return true;
  const al = alive(room);
  const end = (side, text) => { room.phase = 'ended'; room.winner = { side, text }; say(room, '🏁 ' + text, { kind: 'sys' }); return true; };
  if (!al.some(p => R(p).g === 'killer')) return end('good', 'Убийца повержен. Победа сыщиков и жителей!');
  if (!al.some(p => R(p).g === 'det')) return end('evil', 'Все сыщики мертвы. Победа убийцы и сообщников!');
  if (!al.some(p => R(p).f === 'good')) return end('evil', 'Не осталось честных жителей. Победа убийцы!');
  return false;
}
function kill(room, k, t, free) {
  if (!t || !t.alive || t.id === k.id) return { err: 'Недопустимая цель' };
  if (!free) {
    if (k.used.kill === room.round) return { err: 'Способность перезаряжается: в этом круге вы уже убивали' };
    k.used.kill = room.round;
  } else k.free = k.free.filter(x => x !== t.id);
  if (t.shield) { t.shield = null; priv(room, k, `🛡 ${t.nick} был защищён щитом — убийство не удалось`); return { ok: true, msg: 'Убийство не удалось' }; }
  if (t.medkit && t.medkit >= room.round) { t.medkit = 0; priv(room, k, `🩹 ${t.nick} защищён аптечкой — убийство не удалось`); return { ok: true, msg: 'Убийство не удалось' }; }
  die(room, t, 'kill');
  say(room, `💀 ${t.nick} убит(а)`, { kind: 'death' }); room.kills++;
  if (k.gloves) { k.gloves = false; priv(room, k, '🧤 Перчатки скрыли следы: улики не появились'); } else spawnClues(room, k);
  rollItem(room, k);
  checkEnd(room);
  return { ok: true, msg: `${t.nick} убит(а)` };
}

// ---------- саботаж ----------
function sabotage(room, p, loc, o) {
  o = o || {}; const dur = o.dur || 0;
  if (E(room, loc, 'lock').length) return { fail: 'заперта' };
  if (loc.id === 'road' && E(room, loc, 'barricade').length) return { fail: 'заграждение' };
  const tk = E(room, loc, 'toolkit')[0];
  if (tk && (loc.id === 'power' || loc.id === 'road')) { loc.eff = loc.eff.filter(e => e !== tk); if (roll(70)) return { fail: 'инструменты' }; }
  if (!o.cutters && !o.chain && E(room, loc, 'guard').length) return { fail: 'охрана' };
  const until = room.round + dur;
  loc.sabRounds.push(room.round);
  if (loc.id === 'power') { addE(room, loc, 'dark', until, p.id); room.locs.forEach(l => { if (l !== loc) hideRandom(room, l, until); }); }
  else if (loc.id === 'home' && !o.chain) { loc.clues.push(fakeClue({ planted: true })); addE(room, loc, 'plant', until, p.id); }
  else { addE(room, loc, 'sabotage', until, p.id); if (loc.id === 'road') room.locs.forEach(l => { if (l !== loc) hideRandom(room, l, until); }); }
  for (const e of E(room, loc, 'camera')) { const o2 = pl(room, e.by); if (o2) priv(room, o2, `📷 Камера: на локации «${loc.name}» произошёл саботаж (виновник неизвестен)`); }
  if (E(room, loc, 'bell').length) say(room, `🔔 Сигнальный колокол: на локации «${loc.name}» произошёл саботаж`, { kind: 'alert' });
  return { ok: true };
}

// ---------- осмотр ----------
function inspect(room, p, locId) {
  const loc = getLoc(room, locId);
  if (!loc) return { err: 'Выберите локацию на столе' };
  const g = R(p).g;
  if (g === 'killer') return { err: 'У убийцы нет действия «Осмотреть»' };
  if (room.ts.insp) return { err: 'В этот ход вы уже осматривали локацию' };
  if (E(room, loc, 'lock').length) return { err: `Локация «${loc.name}» заперта: осмотр и саботаж невозможны` };
  room.ts.insp = 1;
  say(room, `${p.nick} осматривает локацию «${loc.name}»`, { kind: 'act' });
  let msg = '';
  if (g === 'res') {
    addE(room, loc, 'guard', room.round, p.id);
    msg = `Вы осмотрели «${loc.name}». Локация под охраной до конца круга.`;
  } else if (g === 'det') {
    const uv = p.uv, micro = p.micro, dog = p.dog; p.uv = p.micro = p.dog = false;
    if (E(room, loc, 'block').length) msg = `Осмотр «${loc.name}» невозможен: доступ закрыт.`;
    else if (loc.id === 'power' && E(room, loc, 'dark').length && !E(room, loc, 'lantern').length) msg = 'Электростанция обесточена: без аварийного фонаря осмотр невозможен.';
    else {
      let vis = visible(room, loc, uv); const found = [];
      const c1 = pick2(vis);
      if (c1 && (c1.fake || roll(micro ? 100 : 70))) {
        found.push(c1); vis = vis.filter(x => x !== c1);
        if (dog && roll(40)) { const c2 = pick2(vis); if (c2) found.push(c2); }
      }
      if (!found.length) msg = `В «${loc.name}» ничего не найдено.`;
      else {
        loc.clues = loc.clues.filter(c => !found.includes(c));
        for (const c of found) { p.evidence.push(toEv(c, loc.name)); priv(room, p, `🔍 Найдена улика (${loc.name}): ${clueLabel(c)}, время ${c.time}`, 'clue'); }
        msg = `Найдено улик: ${found.length}`;
        if (loc.id === 'archive') {
          const c = found[0]; const al = alive(room);
          const n = al.filter(x => { const cd = x.cards.find(k => k.cat === c.cat); return c.cat === 'gender' ? cd.text === c.gtxt : cd.type === c.type; }).length;
          priv(room, p, `🗄 Архив: среди живых игроков совпадений с этой уликой — ${n}`, 'priv');
        }
      }
    }
    rollItem(room, p);
    return { ok: true, msg };
  } else { // сообщник
    const cutters = p.cutters; p.cutters = false;
    const r = sabotage(room, p, loc, { cutters });
    msg = r.ok ? `Саботаж в «${loc.name}» удался.` : `Саботаж не удался (${r.fail}).`;
    priv(room, p, msg, 'priv');
    if (p.fanArmed) {
      p.fanArmed = false; p.used.fan = true;
      const real = loc.clues.filter(c => !c.fake); const c = pick2(real);
      if (c) { loc.clues = loc.clues.filter(x => x !== c); priv(room, p, '🔪 Психопат нашёл и уничтожил улику на локации.', 'priv'); }
      else priv(room, p, '🔪 Психопат проверил место: улик нет.', 'priv');
    }
    rollItem(room, p);
    return { ok: true, msg };
  }
  priv(room, p, msg, 'priv');
  rollItem(room, p);
  return { ok: true, msg };
}

// ---------- предметы: применение ----------
function useItem(room, p, m) {
  if (room.ts.item) return { err: 'В этот ход вы уже использовали предмет' };
  const inv = p.items.find(i => i.uid === m.item); if (!inv) return { err: 'У вас нет такого предмета' };
  const it = ITEMS[inv.id];
  const loc = getLoc(room, m.loc), tgt = pl(room, m.player);
  if (it.t.includes('loc') && !loc) return { err: 'Выберите локацию' };
  if (it.t.includes('player') && (!tgt || !tgt.alive)) return { err: 'Выберите живого игрока' };
  const myClue = () => p.evidence.find(e => e.id === m.clue);
  if (it.t.includes('clue') && !myClue()) return { err: 'Выберите свою улику' };
  const done = msg => { p.items = p.items.filter(i => i !== inv); room.ts.item = 1; say(room, `${p.nick} использует предмет`, { kind: 'act' }); if (msg) priv(room, p, msg, 'priv'); return { ok: true, msg }; };
  const L = id => getLoc(room, id);
  switch (inv.id) {
    case 'k_gloves': p.gloves = true; return done('Следующее убийство не оставит улики.');
    case 'k_letter':
      if (tgt.id === p.id) return { err: 'Нельзя отправить письмо себе' };
      if (tgt.pending) return { err: 'У игрока уже есть неотвеченное письмо' };
      tgt.pending = { type: 'letter', from: p.id };
      priv(room, tgt, '✉ Вам пришло кровавое письмо: «Я видел, что вы сделали». Выберите ответ.', 'priv');
      return done(`Письмо отправлено игроку ${tgt.nick}.`);
    case 'k_smoke': addE(room, loc, 'block', room.round, p.id); return done(`«${loc.name}» окутана дымом до конца раунда.`);
    case 'k_clock': {
      const all = room.players.filter(x => R(x).g === 'det').flatMap(x => x.evidence);
      if (!all.length) return { err: 'Пока нет найденных улик' };
      const e = pick(all); let t; do { t = rtime(); } while (t === e.time); e.time = t;
      return done('Время в одной из найденных улик искажено.');
    }
    case 'k_note': case 'a_report': case 'a_print':
      if (inv.id === 'k_note' && (E(room, loc, 'lock').length || E(room, loc, 'block').length)) return { err: 'Локация недоступна' };
      loc.clues.push(fakeClue(inv.id === 'a_print' ? { print: true } : {}));
      return done(`Ложная улика подброшена в «${loc.name}».`);
    case 'a_cutters': p.cutters = true; return done('Следующий саботаж пройдёт вопреки обычной защите.');
    case 'a_wire': { const r = sabotage(room, p, L('power'), { dur: 1 }); return done(r.ok ? 'Электростанция выведена из строя до конца следующего раунда.' : `Не удалось (${r.fail}).`); }
    case 'a_soot': { const c = pick2(loc.clues.filter(x => !x.fake && !x.hidden)); if (!c) return { err: 'На локации нет доступных настоящих улик' }; c.hidden = room.round + 1; return done('Улика скрыта сажей до конца следующего раунда.'); }
    case 'a_chain': { const r = sabotage(room, p, L('road'), { dur: 1, chain: true }); return done(r.ok ? 'Магистраль заблокирована цепью до конца следующего раунда.' : `Не удалось (${r.fail}).`); }
    case 'a_ink': { const c = pick2(loc.clues.filter(x => !x.fake && !x.hidden)); if (!c) return { err: 'На локации нет доступных настоящих улик' }; if (roll(60)) { c.hidden = room.round; return done('Улика залита чернилами до конца раунда.'); } return done('Чернильная бомба не сработала.'); }
    case 'a_anon': {
      const dets = room.players.filter(x => R(x).g === 'det' && x.alive); if (!dets.length) return { err: 'Нет живых сыщиков' };
      for (const d of dets) { const c = fakeClue(); d.evidence.push(toEv(c, 'Письмо от жителей')); priv(room, d, `✉ Анонимное письмо от жителей: ${clueLabel(c)}, время ${c.time}`, 'clue'); }
      return done('Ложное письмо отправлено сыщикам.');
    }
    case 'a_key': loc.eff = loc.eff.filter(e => !(e.t === 'guard' || e.t === 'toolkit')); return done(`Защита «${loc.name}» снята.`);
    case 'a_gas': addE(room, loc, 'block', room.round, p.id); return done(`«${loc.name}» недоступна для осмотра до конца раунда.`);
    case 'r_lock': if (E(room, loc, 'lock').length) return { err: 'Локация уже заперта' }; addE(room, loc, 'lock', room.round, p.id); return done(`«${loc.name}» заперта до конца раунда.`);
    case 'r_tools': if (loc.id !== 'power' && loc.id !== 'road') return { err: 'Подходят только Электростанция и Магистраль' }; addE(room, loc, 'toolkit', room.round + 1, p.id); return done(`Инструменты ждут саботажников в «${loc.name}».`);
    case 'r_lantern': addE(room, L('power'), 'lantern', room.round, p.id); return done('Аварийный фонарь готов: Электростанцию можно осмотреть в этом раунде.');
    case 'r_barricade': addE(room, L('road'), 'barricade', room.round + 1, p.id); return done('Магистраль огорожена до конца следующего раунда.');
    case 'r_camera': addE(room, loc, 'camera', room.round, p.id); return done(`Камера установлена в «${loc.name}».`);
    case 'r_medkit': tgt.medkit = room.round; return done(`${tgt.nick} защищён от одного убийства до конца раунда.`);
    case 'r_radio': {
      const sab = loc.eff.some(e => e.t === 'sabotage' || e.t === 'dark') && E(room, loc, 'sabotage').concat(E(room, loc, 'dark')).length > 0;
      priv(room, tgt, `📻 Анонимное предупреждение о локации «${loc.name}»: ${sab ? 'там замечена подозрительная активность' : 'будьте осторожны'}.`, 'priv');
      return done('Предупреждение отправлено.');
    }
    case 'r_keys': { const n = loc.eff.length; loc.eff = loc.eff.filter(e => e.t !== 'lock'); if (loc.eff.length === n) return { err: 'Старого замка здесь нет' }; return done(`Замок на «${loc.name}» открыт.`); }
    case 'r_map': {
      const names = { lock: 'заперта', block: 'доступ закрыт', sabotage: 'саботаж', dark: 'нет света', guard: 'под охраной', toolkit: 'защищена инструментами', barricade: 'огорожена', camera: 'под камерой', bell: 'под колоколом', lantern: 'аварийный свет', plant: 'подозрительна' };
      const st = [...new Set(loc.eff.filter(e => e.until >= room.round).map(e => names[e.t]))];
      return done(`🗺 «${loc.name}»: ${st.length ? st.join(', ') : 'без изменений'}.`);
    }
    case 'r_bell': addE(room, loc, 'bell', room.round, p.id); return done(`Колокол установлен в «${loc.name}».`);
    case 'd_micro': p.micro = true; return done('Следующий осмотр: шанс найти настоящую улику 100%.');
    case 'd_dog': p.dog = true; return done('Собака готова искать вторую улику.');
    case 'd_prints': { const e = myClue(); e.auth = e.fake ? 'fake' : 'real'; return done(`Отпечатки: улика «${e.label}» — ${e.fake ? 'ПОДДЕЛКА' : 'подлинная'}.`); }
    case 'd_uv': p.uv = true; return done('УФ-фонарь найдёт улику даже после саботажа.');
    case 'd_collect': {
      const others = room.players.filter(x => x !== p && R(x).g === 'det' && x.evidence.length);
      if (!others.length) return { err: 'У других сыщиков пока нет улик' };
      const e = pick(pick(others).evidence); p.evidence.push({ ...e, id: uid(), loc: e.loc + ' (из сборника)', auth: null });
      return done(`Из сборника: ${e.label}, время ${e.time}. Улика добавлена в ваш список.`);
    }
    case 'd_notebook':
      if (p.evidence.length < 3) return { err: 'Нужно минимум 3 улики' };
      p.evidence.forEach(e => { e.auth = e.fake ? 'fake' : 'real'; });
      return done('Следственный блокнот: подлинность ваших улик определена.');
    case 'd_loupe': { const e = myClue(); if (roll(50)) { e.auth = e.fake ? 'fake' : 'real'; return done(`Лупа: «${e.label}» — ${e.fake ? 'ПОДДЕЛКА' : 'подлинная'}.`); } return done('Лупа: результат неясен.'); }
    case 'd_recorder': { const k = pick(room.players.filter(x => R(x).g === 'killer')); return done(`🎙 Пол убийцы: ${k.cards[0].text}.`); }
    case 'd_desc': return done(`Описание преступника: в «${loc.name}» саботаж ${loc.sabRounds.length ? 'БЫЛ' : 'не зафиксирован'}.`);
    case 'd_dossier': {
      const all = room.locs.flatMap(l => l.clues.map(c => ({ l, c })));
      if (!all.length) return { err: 'В архиве нет неразысканных улик' };
      const x = pick(all); x.l.clues = x.l.clues.filter(c => c !== x.c); p.evidence.push(toEv(x.c, 'Архивное досье'));
      return done(`Досье: ${clueLabel(x.c)}, время ${x.c.time}.`);
    }
  }
  return { err: 'Неизвестный предмет' };
}

// ---------- способности ролей ----------
function useRole(room, p, m) {
  const key = p.role;
  if (key === 'clown') return { err: 'У Клоуна нет способности: добейтесь своего изгнания голосованием' };
  if (key === 'citizen' || key === 'accomplice') return { err: 'У вашей роли нет активной способности' };
  if (p.banUntil >= room.round) return { err: 'Вам запрещено использовать способности до конца круга' };
  if (room.ts.role && !(key === 'serial' && p.free.includes(m.target))) return { err: 'Способность уже использована в этот ход' };
  const t = pl(room, m.target);
  const needAlive = () => (!t || !t.alive || t.id === p.id) ? 'Выберите другого живого игрока' : null;
  const done = (msg, pub) => { room.ts.role = 1; if (pub) say(room, pub, { kind: 'act' }); if (msg) priv(room, p, msg, 'priv'); return { ok: true, msg }; };
  switch (key) {
    case 'serial': {
      if (!t) return { err: 'Выберите цель' };
      const free = p.free.includes(t.id);
      const r = kill(room, p, t, free); if (r.ok) room.ts.role = free ? room.ts.role : 1; return r;
    }
    case 'fan':
      if (p.used.fan) return { err: 'Умение Поклонника уже использовано (раз за игру)' };
      if (p.fanArmed) return { err: 'Умение уже активировано — осмотрите место' };
      if (room.ts.insp) return { err: 'Умение нужно активировать ДО осмотра места' };
      p.fanArmed = true; return done('Психопат готов: после осмотра он проверит место и избавится от улики.');
    case 'mistress': {
      if (p.used.mist === room.round) return { err: 'В этом круге способность уже использована' };
      const e = needAlive(); if (e) return { err: e };
      p.used.mist = room.round; room.silenced[t.id] = true;
      return done(null, '💋 В этом круге была применена способность Любовницы');
    }
    case 'sherlock': {
      if (p.used.sh === room.round) return { err: 'В этом круге способность уже использована' };
      if (!room.kills) return { err: 'Способность работает только после убийства в этом круге' };
      if (room.accRounds[room.round - 1]) return { err: 'В прошлом круге было обвинение — способность недоступна' };
      if (!t || t.id === p.id) return { err: 'Выберите другого игрока' };
      p.used.sh = room.round; return done(`🕵 Роль игрока ${t.nick}: ${R(t).name}`, 'Кто-то применил способность роли');
    }
    case 'cop': {
      const e = needAlive(); if (e) return { err: e };
      if (p.copTargets.includes(t.id)) return { err: 'Эту цель нельзя выбирать повторно' };
      if (room.order.indexOf(t.id) <= room.turn) return { err: 'Нельзя выбрать игрока, который ходил до вас' };
      p.copTargets.push(t.id); t.banUntil = room.round; return done(`${t.nick} не сможет пользоваться способностями до конца круга.`, 'Кто-то применил способность роли');
    }
    case 'judge': {
      if (p.used.judge === room.round) return { err: 'В этом круге способность уже использована' };
      const e = needAlive(); if (e) return { err: e };
      p.used.judge = room.round; room.ts.role = 1;
      say(room, `⚖ Судья обязывает ${t.nick} раскрыть роль: ${R(t).name}`, { kind: 'alert' });
      if (R(t).g === 'killer') { room.phase = 'ended'; room.winner = { side: 'good', text: 'Судья вывел убийцу на чистую воду! Победа жителей и сыщиков!' }; say(room, '🏁 ' + room.winner.text, { kind: 'sys' }); }
      else if (R(t).g === 'acc') { die(room, t, 'expel'); say(room, `${t.nick} изгнан как сообщник`, { kind: 'death' }); checkEnd(room); }
      else if (R(t).g === 'res') { die(room, p, 'judge'); say(room, `💀 Судья погибает: ${t.nick} оказался жителем`, { kind: 'death' }); checkEnd(room); }
      return { ok: true, msg: 'Роль раскрыта' };
    }
    case 'medic': {
      const ready = !p.medUsed || p.medSince >= 2;
      if (!ready) return { err: `Способность перезаряжается: нужно ещё ${2 - p.medSince} убийств(а)` };
      if (!t || t.alive || !room.killed.includes(t.id)) return { err: 'Выберите убитого игрока (изгнанных воскресить нельзя)' };
      t.alive = true; room.killed = room.killed.filter(x => x !== t.id); p.medUsed = true; p.medSince = 0;
      return done(null, `✨ ${t.nick} возвращён(а) к жизни`);
    }
    case 'angel': {
      const e = needAlive(); if (e) return { err: e };
      if (room.players.some(x => x.shield === p.id)) return { err: 'Ваш прошлый щит ещё не сработал' };
      t.shield = p.id; return done(`🛡 ${t.nick} получил щит.`, 'Кто-то применил способность роли');
    }
  }
  return { err: 'Неизвестная способность' };
}

// ---------- вечер ----------
function expel(room, t) {
  die(room, t, 'expel');
  say(room, `⛔ ${t.nick} изгнан большинством голосов`, { kind: 'death' });
  if (t.role === 'clown') { room.phase = 'ended'; room.winner = { side: 'clown', text: 'Клоун добился изгнания! Победа Клоуна!' }; say(room, '🏁 ' + room.winner.text, { kind: 'sys' }); return; }
  if (checkEnd(room)) return;
  startDay(room);
}
function tally(room, a) {
  const counted = a.votes.filter(v => !room.silenced[v] && pl(room, v) && pl(room, v).alive).length;
  a.counted = counted;
  if (counted * 2 > alive(room).length) { a.closed = true; expel(room, pl(room, a.target)); }
}
function accuse(room, p, tid) {
  if (room.phase !== 'evening') return { err: 'Обвинять можно только вечером' };
  const t = pl(room, tid); if (!t || !t.alive || t.id === p.id) return { err: 'Выберите другого живого игрока' };
  if (room.accus.some(a => a.by === p.id)) return { err: 'Вы уже выдвинули обвинение в этом вечере' };
  if (room.accus.some(a => a.target === t.id)) return { err: 'Этого игрока уже обвинили — проголосуйте в журнале' };
  const a = { id: uid(), by: p.id, target: t.id, votes: [p.id], counted: 0, closed: false };
  room.accus.push(a); room.accRounds[room.round] = true;
  say(room, `⚠ ${p.nick} обвиняет ${t.nick}!`, { kind: 'accuse', acc: a.id });
  tally(room, a); return { ok: true };
}
function vote(room, p, id) {
  if (room.phase !== 'evening') return { err: 'Голосовать можно только вечером' };
  const a = room.accus.find(x => x.id === id); if (!a || a.closed) return { err: 'Обвинение недействительно' };
  if (a.votes.includes(p.id)) return { err: 'Вы уже проголосовали' };
  a.votes.push(p.id); tally(room, a); return { ok: true };
}

// ---------- диспетчер действий ----------
function act(room, p, m) {
  if (m.rid) { if (p.rids.includes(m.rid)) return { ok: true, dup: true }; p.rids.push(m.rid); if (p.rids.length > 60) p.rids.shift(); }
  if (m.type === 'start') { const r = startGame(room, p); return r; }
  if (room.phase === 'lobby') return { err: 'Игра ещё не началась' };
  if (room.phase === 'ended') return { err: 'Игра окончена' };
  if (!p.alive && m.type !== 'letter') return { err: 'Вы выбыли из игры' };
  const myTurn = room.phase === 'day' && room.order[room.turn] === p.id;
  let r;
  switch (m.type) {
    case 'letter': {
      if (!p.pending) return { err: 'Нет письма' };
      const from = pl(room, p.pending.from); p.pending = null;
      if (m.accept) {
        if (R(p).f !== 'evil') p.role = 'accomplice';
        priv(room, p, '🤝 Вы приняли письмо и стали сообщником убийцы.');
        if (from) priv(room, from, `✉ ${p.nick} принял(а) письмо и стал(а) вашим сообщником.`);
      } else {
        say(room, `📣 ${p.nick} заявляет всем о кровавом письме!`, { kind: 'alert' });
        if (from) { from.free.push(p.id); priv(room, from, `✉ ${p.nick} заявил(а) о письме — вы можете убить его/её в свой ход, не тратя ход.`); }
      }
      return { ok: true };
    }
    case 'inspect': if (!myTurn) return { err: 'Сейчас не ваш ход' }; r = inspect(room, p, m.loc); break;
    case 'role': if (!myTurn) return { err: 'Сейчас не ваш ход' }; r = useRole(room, p, m); break;
    case 'item': if (!myTurn) return { err: 'Сейчас не ваш ход' }; r = useItem(room, p, m); break;
    case 'skip':
      if (room.phase === 'day') {
        if (!myTurn) return { err: 'Сейчас не ваш ход' };
        say(room, `${p.nick} пропускает ход`, { kind: 'act' }); advance(room); r = { ok: true }; break;
      }
      if (room.skips.includes(p.id)) return { err: 'Вы уже нажали «Пропустить»' };
      room.skips.push(p.id);
      if (room.skips.length * 2 >= alive(room).length) { say(room, 'Вечер завершён: большинство предпочло не обвинять.', { kind: 'sys' }); startDay(room); }
      r = { ok: true }; break;
    case 'accuse': r = accuse(room, p, m.target); break;
    case 'vote': r = vote(room, p, m.acc); break;
    default: return { err: 'Неизвестное действие' };
  }
  settle(room);
  return r;
}

// ---------- перезагрузка соединения: авто-пропуск ----------
function tick(room) {
  if (room.phase !== 'day') return false;
  const cur = pl(room, room.order[room.turn]);
  if (cur && !cur.connected && Date.now() - cur.lastSeen > 20000) { say(room, `${cur.nick} не отвечает — ход пропущен`, { kind: 'sys' }); advance(room); return true; }
  return false;
}

// ---------- представление для конкретного игрока (приватность) ----------
function view(room, pid) {
  const me = pl(room, pid); const ended = room.phase === 'ended';
  const v = { id: room.id, name: room.name, host: room.host, phase: room.phase, round: room.round, min: MIN, max: MAX,
    turn: room.phase === 'day' ? room.order[room.turn] || null : null, order: room.order,
    players: room.players.map(p => ({ id: p.id, nick: p.nick, alive: p.alive, connected: p.connected, av: p.av, cards: room.phase === 'lobby' ? [] : p.cards.map(c => ({ name: c.name, label: c.label, text: c.text, type: c.type })) })),
    locs: room.locs.map(l => { const d = LOCS.find(x => x.id === l.id); return { id: l.id, name: l.name, icon: d.icon, d: d.d }; }),
    log: room.log.filter(e => !e.to || e.to.includes(pid)).slice(-250).map(e => ({ id: e.id, text: e.text, kind: e.kind, acc: e.acc, r: e.r })),
    accus: room.accus.map(a => ({ id: a.id, by: a.by, target: a.target, n: a.counted, voted: a.votes.includes(pid), closed: a.closed })),
    skips: room.skips.length, skipped: room.skips.includes(pid), need: Math.ceil(alive(room).length / 2), winner: room.winner };
  if (me && room.phase !== 'lobby') {
    const r = R(me);
    v.you = { id: me.id, alive: me.alive, role: { key: me.role, name: r.name, d: r.d, g: r.g, tg: r.tg }, items: me.items.map(i => ({ uid: i.uid, id: i.id, name: ITEMS[i.id].name, d: ITEMS[i.id].d, t: ITEMS[i.id].t })),
      evidence: r.g === 'det' ? me.evidence.map(e => ({ id: e.id, label: e.label, time: e.time, loc: e.loc, auth: e.auth })) : null,
      pending: me.pending ? { type: me.pending.type } : null, btnInspect: r.g !== 'killer', btnRole: me.role !== 'clown' };
  } else if (me) v.you = { id: me.id };
  if (ended) v.roles = room.players.map(p => ({ id: p.id, nick: p.nick, role: R(p).name, alive: p.alive }));
  return v;
}

module.exports = { mkRoom, newPlayer, startGame, act, view, tick, composition, ROLES, ITEMS, ITEM_LIST, LOCS, CARDS, MIN, MAX, pl, alive, advance, startDay, say };
