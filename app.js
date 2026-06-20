// ===== Catness Coin — игровая логика =====
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.setHeaderColor?.('#0f0f14'); tg.setBackgroundColor?.('#0f0f14'); }

const haptic = (type = 'light') => {
  try { tg?.HapticFeedback?.impactOccurred(type); } catch (e) {}
};

// Открыть ссылку Telegram (канал) правильным способом
function openTg(url) {
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

// ---- Лиги (по балансу) ----
const LEAGUES = [
  { name: 'Бронза',    emoji: '🥉', min: 0 },
  { name: 'Серебро',   emoji: '🥈', min: 5000 },
  { name: 'Золото',    emoji: '🥇', min: 50000 },
  { name: 'Платина',   emoji: '💎', min: 250000 },
  { name: 'Алмаз',     emoji: '🔷', min: 1000000 },
  { name: 'Магнат',    emoji: '👑', min: 5000000 },
];

// ---- Карточки апгрейдов (увеличивают прибыль в час) ----
const CARDS = [
  { id: 'fish',    name: 'Рыбная ферма',     emoji: '🐟', baseProfit: 50,   baseCost: 300 },
  { id: 'milk',    name: 'Молочный завод',   emoji: '🥛', baseProfit: 120,  baseCost: 800 },
  { id: 'yarn',    name: 'Фабрика клубков',  emoji: '🧶', baseProfit: 280,  baseCost: 2000 },
  { id: 'cafe',    name: 'Кото-кафе',        emoji: '☕', baseProfit: 600,  baseCost: 5000 },
  { id: 'mine',    name: 'Майнинг-ферма',    emoji: '🖥️', baseProfit: 1500, baseCost: 15000 },
  { id: 'bank',    name: 'Кото-банк',        emoji: '🏦', baseProfit: 4000, baseCost: 50000 },
  { id: 'rocket',  name: 'Космо-программа',  emoji: '🚀', baseProfit: 10000,baseCost: 200000 },
  { id: 'token',   name: 'Листинг $CATS',    emoji: '💠', baseProfit: 30000,baseCost: 1000000 },
];

// ---- Канал (обязательная подписка для игры) ----
const CHANNEL_URL = 'https://t.me/Catness_Coin';
// Адрес воркера Cloudflare для настоящей проверки подписки.
const WORKER_URL = 'https://catness-bot.catness-edcaw.workers.dev';

// Спрашиваем у сервера, реально ли человек подписан на канал.
// Возвращает true / false, либо null если проверка недоступна (воркер не настроен).
async function verifySubscription() {
  if (!WORKER_URL || !tg?.initData) return null;
  try {
    const r = await fetch(WORKER_URL + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData }),
    });
    const j = await r.json();
    if (!j || j.ok === false) return null;
    return !!j.subscribed;
  } catch (e) { return null; }
}

// Забираем накопленные награды за приглашённых друзей (+10 000 за каждого)
async function claimReferrals() {
  if (!WORKER_URL || !tg?.initData) return;
  try {
    const r = await fetch(WORKER_URL + '/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData }),
    });
    const j = await r.json();
    if (!j || !j.ok) return;
    state.refCount = j.count || 0;
    if (j.credited > 0) {
      state.balance += j.credited;
      state.totalEarned += j.credited;
      setTimeout(() => toast(`👬 +${fmt(j.credited)} за друзей!`), 900);
    }
  } catch (e) {}
}

// Регистрация игрока на сервере: бан-статус + начисления от админа
let isBanned = false;
async function syncServer() {
  if (!WORKER_URL || !tg?.initData) return;
  try {
    const r = await fetch(WORKER_URL + '/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData, balance: Math.floor(state.balance) }),
    });
    const j = await r.json();
    if (!j || !j.ok) return;
    isBanned = !!j.banned;
    if (isBanned) {
      // блокировка + сброс счёта
      state.balance = 0; state.totalEarned = 0; state.cards = {}; state.tapsToday = 0;
      save();
      return;
    }
    if (j.credited > 0) {
      state.balance += j.credited;
      state.totalEarned += j.credited;
      setTimeout(() => toast(`🎁 Начислено админом: +${fmt(j.credited)}`), 1200);
    }
  } catch (e) {}
}

// Экран блокировки
function openBanned() {
  gateActive = true;
  $('#sheetClose').style.display = 'none';
  sheetBody.innerHTML = `
    <h2>🚫 Доступ заблокирован</h2>
    <p class="subtitle">Аккаунт заблокирован за нарушение правил (нечестная игра).</p>
    <button class="li-action" id="banContact" style="width:100%;padding:14px">📢 Наш канал</button>`;
  openSheet();
  $('#banContact')?.addEventListener('click', () => openTg(CHANNEL_URL));
}

// ---- Задания (обновляются каждые сутки) ----
const TASKS = [
  { id: 't_daily',   title: 'Ежедневный бонус',  sub: 'Заходи каждый день',   emoji: '📅', reward: 1000, kind: 'daily' },
  { id: 't_taps',    title: 'Сделать 500 тапов', sub: 'Натапай за сегодня',   emoji: '👆', reward: 2000, kind: 'goal', goal: 500 },
  { id: 't_upgrade', title: 'Прокачать карточку',sub: 'Купи любой апгрейд',   emoji: '📈', reward: 3000, kind: 'upgrade' },
];

// ---- Состояние по умолчанию ----
const DEFAULT_STATE = {
  balance: 0,
  totalEarned: 0,
  tapPower: 1,
  energyMax: 1000,
  energy: 1000,
  energyRegen: 1,        // за секунду
  cards: {},             // id -> level
  tasksDone: {},         // id -> true (сбрасывается каждые сутки)
  tasksDay: '',          // дата последнего сброса заданий (YYYY-MM-DD)
  tapsToday: 0,          // тапов за сегодня (для задания)
  upgradedToday: false,  // качал ли карточку сегодня
  subscribed: false,     // подписан на канал (обязательно для игры)
  subBonusGiven: false,  // бонус за подписку уже выдан (чтобы не фармили)
  refCount: 0,           // сколько друзей приглашено (с сервера)
  streakDay: 0,          // текущий день стрика (0 = ещё не забирал)
  streakLastDay: '',     // дата последнего забранного дня (YYYY-MM-DD)
  firstSeen: 0,          // дата первого захода (для профиля)
  boostUntil: 0,         // до какого времени активен x5
  boostCdUntil: 0,       // до какого времени кулдаун (нельзя жать)
  lastSeen: Date.now(),
};

let state = { ...DEFAULT_STATE };
const SAVE_KEY = 'catness_save';

// ---- Облачное сохранение Telegram (переживает закрытие/переустановку) ----
const CLOUD = tg?.CloudStorage;
function cloudGet(key) {
  return new Promise((res) => {
    if (!CLOUD) return res(null);
    try { CLOUD.getItem(key, (e, v) => res(e ? null : (v || null))); }
    catch (_) { res(null); }
  });
}
function cloudSet(key, val) {
  if (CLOUD) { try { CLOUD.setItem(key, val, () => {}); } catch (_) {} }
}

// Загрузка: сперва облако, потом локально
async function loadState() {
  let raw = await cloudGet(SAVE_KEY);
  if (!raw) { try { raw = localStorage.getItem(SAVE_KEY); } catch (_) {} }
  try { if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) }; } catch (e) {}
  return { ...DEFAULT_STATE };
}

// Сохранение: и в облако, и локально
function save() {
  state.lastSeen = Date.now();
  const raw = JSON.stringify(state);
  try { localStorage.setItem(SAVE_KEY, raw); } catch (_) {}
  cloudSet(SAVE_KEY, raw);
}

// Сброс заданий раз в сутки
function todayStr() { return new Date().toISOString().slice(0, 10); }
function checkDailyReset() {
  const t = todayStr();
  if (state.tasksDay !== t) {
    state.tasksDay = t;
    state.tasksDone = {};
    state.tapsToday = 0;
    state.upgradedToday = false;
  }
}

// ---- Расчёты ----
function cardLevel(id) { return state.cards[id] || 0; }
function cardProfit(card, lvl) { return Math.floor(card.baseProfit * lvl * (1 + lvl * 0.1)); }
function cardNextProfit(card) {
  const lvl = cardLevel(card.id);
  return cardProfit(card, lvl + 1) - cardProfit(card, lvl);
}
function cardCost(card) {
  const lvl = cardLevel(card.id);
  return Math.floor(card.baseCost * Math.pow(1.6, lvl));
}
function profitPerHour() {
  return CARDS.reduce((sum, c) => sum + cardProfit(c, cardLevel(c.id)), 0);
}
function profitPerSec() { return profitPerHour() / 3600; }

function currentLeague() {
  let lg = LEAGUES[0], idx = 0;
  LEAGUES.forEach((l, i) => { if (state.balance >= l.min) { lg = l; idx = i; } });
  return { lg, idx };
}

function tapValue() {
  const boosted = Date.now() < state.boostUntil ? 5 : 1;
  return state.tapPower * boosted;
}

// ---- Форматирование чисел ----
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toLocaleString('ru-RU');
}

// ===== Оффлайн-доход при загрузке =====
function applyOffline() {
  const now = Date.now();
  const dt = Math.min((now - (state.lastSeen || now)) / 1000, 3 * 3600); // максимум 3 часа
  if (dt > 0) {
    const earned = profitPerSec() * dt;
    state.balance += earned;
    state.totalEarned += earned;
    state.energy = Math.min(state.energyMax, state.energy + state.energyRegen * dt);
    if (earned > 50) setTimeout(() => toast(`💤 Пока тебя не было: +${fmt(earned)}`), 600);
  }
}

// ===== DOM =====
const $ = (s) => document.querySelector(s);
const balanceEl = $('#balance');
const profitEl = $('#profitPerHour');
const energyCurEl = $('#energyCurrent');
const energyMaxEl = $('#energyMax');
const leagueNameEl = $('#leagueName');
const leagueEmojiEl = $('#leagueEmoji');
const leagueProgressEl = $('#leagueProgress');
const tapButton = $('#tapButton');

function render() {
  balanceEl.textContent = fmt(state.balance);
  profitEl.textContent = fmt(profitPerHour());
  energyCurEl.textContent = Math.floor(state.energy);
  energyMaxEl.textContent = state.energyMax;

  const { lg, idx } = currentLeague();
  leagueNameEl.textContent = lg.name;
  leagueEmojiEl.textContent = lg.emoji;
  const next = LEAGUES[idx + 1];
  if (next) {
    const span = next.min - lg.min;
    const prog = Math.min(100, ((state.balance - lg.min) / span) * 100);
    leagueProgressEl.style.width = prog + '%';
  } else {
    leagueProgressEl.style.width = '100%';
  }
  updateStreakWidget();
}

// Виджет стрика на главной (огонёк + число)
function updateStreakWidget() {
  const numEl = $('#streakNum');
  if (!numEl) return;
  const st = streakStatus();
  const cur = st.claimable ? Math.max(0, st.day - 1) : state.streakDay;
  numEl.textContent = cur;
  const subEl = $('#streakSub');
  if (subEl) subEl.textContent = st.claimable
    ? `День ${st.day} · награда готова`
    : `Серия ${state.streakDay} ${plur(state.streakDay, 'день', 'дня', 'дней')} · приходи завтра`;
  const cta = $('#streakCta');
  if (cta) cta.style.display = st.claimable ? '' : 'none';
  $('#streakWidget')?.classList.toggle('ready', st.claimable);
}

// ===== Тап =====
function doTap(clientX, clientY) {
  if (isBanned) return; // забаненный игрок не зарабатывает
  // Без подписки на канал монеты не капают
  if (!state.subscribed) { openGate(); return; }

  const cost = 1; // 1 энергия за тап
  if (state.energy < cost) { toast('⚡ Энергия кончилась!'); return; }

  const gain = tapValue();
  state.energy -= cost;
  state.balance += gain;
  state.totalEarned += gain;
  state.tapsToday = (state.tapsToday || 0) + 1;

  haptic('light');
  floatNumber(clientX, clientY, '+' + gain);
  render();
}

function floatNumber(x, y, text) {
  const el = document.createElement('div');
  el.className = 'float-num';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.transform = 'translate(-50%, 0)';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// Поддержка мультитача (несколько пальцев = несколько монет)
tapButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) doTap(t.clientX, t.clientY);
}, { passive: false });

tapButton.addEventListener('mousedown', (e) => {
  // для теста в браузере мышкой
  if (e.button === 0) doTap(e.clientX, e.clientY);
});

// небольшое «сжатие» картинки при тапе
tapButton.addEventListener('pointerdown', () => {
  const img = $('#catImg');
  if (img) { img.style.transform = 'scale(.95)'; setTimeout(() => img.style.transform = '', 80); }
});

// ===== Виджет стрика на главной =====
$('#streakWidget')?.addEventListener('click', () => { openStreak(); haptic('light'); });

// ===== Буст (x5 на 20 сек, кулдаун 30 сек) =====
const BOOST_DURATION = 20000; // длительность эффекта
const BOOST_COOLDOWN = 30000; // кулдаун между использованиями

$('#boostBtn').addEventListener('click', () => {
  const now = Date.now();
  if (now < state.boostCdUntil) {
    const left = Math.ceil((state.boostCdUntil - now) / 1000);
    toast(`⏳ Попробуйте через ${left} с`);
    haptic('rigid');
    return;
  }
  state.boostUntil = now + BOOST_DURATION;
  state.boostCdUntil = now + BOOST_COOLDOWN;
  toast('🚀 Буст x5 на 20 секунд!');
  haptic('medium');
  updateBoostUI();
  save();
});

// Живой таймер над кнопкой буста
function updateBoostUI() {
  const btn = $('#boostBtn');
  const cd = $('#boostCd');
  if (!btn || !cd) return;
  const now = Date.now();
  if (now < state.boostUntil) {
    // эффект активен
    const left = Math.ceil((state.boostUntil - now) / 1000);
    btn.textContent = `🚀 x5 · ${left}с`;
    btn.classList.add('cooling');
    cd.classList.remove('show');
  } else if (now < state.boostCdUntil) {
    // кулдаун — показываем подсказку
    const left = Math.ceil((state.boostCdUntil - now) / 1000);
    btn.textContent = '🚀 Буст';
    btn.classList.add('cooling');
    cd.textContent = `Попробуйте через ${left} с`;
    cd.classList.add('show');
  } else {
    // готов
    btn.textContent = '🚀 Буст';
    btn.classList.remove('cooling');
    cd.classList.remove('show');
  }
}

// ===== Ежедневный стрик (день 1, 2, 3… без предела; пропуск дня — сброс) =====
function streakReward(day) {
  return 1000 * day; // День 1 = 1к, День 2 = 2к, +1к каждый день
}
function dayOffsetStr(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
// Какой день можно забрать прямо сейчас
function streakStatus() {
  const today = todayStr();
  if (state.streakLastDay === today) return { claimable: false, day: state.streakDay };
  const day = (state.streakLastDay === dayOffsetStr(-1))
    ? (state.streakDay || 0) + 1  // забирал вчера — продолжаем
    : 1;                          // пропустил день / первый раз — с 1
  return { claimable: true, day };
}
function claimStreak() {
  const st = streakStatus();
  if (!st.claimable) return;
  const reward = streakReward(st.day);
  state.streakDay = st.day;
  state.streakLastDay = todayStr();
  state.balance += reward;
  state.totalEarned += reward;
  haptic('medium');
  toast(`🎁 День ${st.day}: +${fmt(reward)}!`);
  closeSheet();
  render();
  save();
}
function maybeShowStreak() {
  if (state.subscribed && streakStatus().claimable) openStreak();
}
function openStreak() {
  const st = streakStatus();
  const day = st.day;                 // день, который сейчас в фокусе
  const heroNum = st.claimable ? Math.max(0, day - 1) : state.streakDay; // текущий «огонёк»

  // Лента дней: показываем 30 вперёд, можно листать
  let strip = '';
  for (let d = 1; d <= day + 29; d++) {
    const claimed = d < day || (!st.claimable && d <= state.streakDay);
    const cls = (st.claimable && d === day) ? 'current' : (claimed ? 'claimed' : '');
    strip += `
      <div class="streak-day ${cls}" ${d === day ? 'id="sdCurrent"' : ''}>
        <div class="sd-day">День ${d}</div>
        <div class="sd-bigcoin">🪙</div>
        <div class="sd-coin">${fmt(streakReward(d))}</div>
        ${claimed ? '<div class="sd-check">✓</div>' : ''}
      </div>`;
  }

  const hero = `
    <div class="streak-hero">
      <div class="streak-flame-big">🔥<b>${heroNum}</b></div>
      <div class="streak-hero-text">${heroNum} ${plur(heroNum, 'день', 'дня', 'дней')} подряд</div>
    </div>`;

  if (st.claimable) {
    sheetBody.innerHTML = `
      <h2>🔥 Стрик</h2>
      ${hero}
      <p class="subtitle">Заходи каждый день — награда растёт на 1 000. Пропустишь день — стрик сгорит!</p>
      <div class="streak-strip">${strip}</div>
      <button class="li-action" id="streakClaim" style="width:100%;padding:15px;margin-top:16px">Забрать День ${day} · +${fmt(streakReward(day))} 🪙</button>`;
    openSheet();
    $('#streakClaim').addEventListener('click', claimStreak);
  } else {
    const next = (state.streakDay || 0) + 1;
    sheetBody.innerHTML = `
      <h2>🔥 Стрик</h2>
      ${hero}
      <p class="subtitle">Награда за сегодня уже забрана 🎉 Возвращайся завтра!</p>
      <div class="pf-row"><span>Завтра — День ${next}</span><b>+${fmt(streakReward(next))} 🪙</b></div>
      <div class="streak-strip">${strip}</div>`;
    openSheet();
  }
  // прокрутим к текущему дню
  setTimeout(() => { document.getElementById('sdCurrent')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 50);
}

// склонение: 1 день / 2 дня / 5 дней
function plur(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// ===== Вкладки / шторка =====
const sheet = $('#sheet');
const sheetBody = $('#sheetBody');
const navItems = document.querySelectorAll('.nav-item');

navItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'exchange') { closeSheet(); setActiveNav(btn); return; }
    setActiveNav(btn);
    openTab(tab);
  });
});
function setActiveNav(btn) {
  navItems.forEach((b) => b.classList.toggle('active', b === btn));
}
function openSheet() { sheet.classList.add('open'); }
function closeSheet() {
  if (gateActive) return; // нельзя закрыть, пока не подписался
  sheet.classList.remove('open');
  setActiveNav(document.querySelector('.nav-item[data-tab="exchange"]'));
}
$('#sheetClose').addEventListener('click', closeSheet);
$('#sheetBackdrop').addEventListener('click', closeSheet);

function openTab(tab) {
  if (tab === 'cards') renderCards();
  else if (tab === 'profile') renderProfile();
  else if (tab === 'earn') renderEarn();
  openSheet();
}

function renderCards() {
  let html = `<h2>📈 Карточки</h2><p class="subtitle">Прокачивай бизнес — монеты капают даже офлайн</p><div class="cards-grid">`;
  CARDS.forEach((card) => {
    const lvl = cardLevel(card.id);
    const cost = cardCost(card);
    const can = state.balance >= cost;
    html += `
      <div class="card ${can ? '' : 'locked'}" data-card="${card.id}">
        <div class="card-top"><span class="card-emoji">${card.emoji}</span>
          <span class="card-name">${card.name}</span></div>
        <div class="card-profit">+${fmt(cardNextProfit(card))}/час <b>↑</b></div>
        <div class="card-buy">
          <span class="card-lvl">ур. ${lvl}</span>
          <span class="card-cost"><i class="coin-mini"></i>${fmt(cost)}</span>
        </div>
      </div>`;
  });
  html += `</div>`;
  sheetBody.innerHTML = html;
  sheetBody.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', () => buyCard(el.dataset.card));
  });
}

function buyCard(id) {
  const card = CARDS.find((c) => c.id === id);
  const cost = cardCost(card);
  if (state.balance < cost) { toast('Недостаточно монет'); haptic('rigid'); return; }
  state.balance -= cost;
  state.cards[id] = cardLevel(id) + 1;
  state.upgradedToday = true;
  haptic('medium');
  toast(`${card.emoji} ${card.name} → ур. ${cardLevel(id)}`);
  render();
  renderCards();
  save();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderProfile() {
  const u = tg?.initDataUnsafe?.user;
  const name = u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : 'Гость';
  const username = u?.username ? '@' + u.username : '—';
  const id = u?.id || '—';
  const photo = u?.photo_url;
  const joined = new Date(state.firstSeen || Date.now())
    .toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  const initial = (name && name[0]) ? name[0] : '🐱';
  const avatar = photo
    ? `<img src="${esc(photo)}" class="pf-avatar" alt="avatar">`
    : `<div class="pf-avatar pf-avatar-ph">${esc(initial)}</div>`;
  const { lg } = currentLeague();

  sheetBody.innerHTML = `
    <h2>👤 Профиль</h2>
    <p class="subtitle">Твоя кото-карточка</p>
    <div class="pf-head">
      ${avatar}
      <div>
        <div class="pf-name">${esc(name)}</div>
        <div class="pf-user">${esc(username)}</div>
      </div>
    </div>
    <div class="pf-row"><span>Ник</span><b>${esc(username)}</b></div>
    <div class="pf-row"><span>ID</span><b>${esc(id)}</b></div>
    <div class="pf-row"><span>Дата захода</span><b>${joined}</b></div>
    <div class="pf-row"><span>Лига</span><b>${lg.emoji} ${lg.name}</b></div>
    <div class="pf-row"><span>Баланс</span><b>${fmt(state.balance)}</b></div>
    <div class="pf-row"><span>Прибыль в час</span><b>${fmt(profitPerHour())}</b></div>
    <div class="pf-row"><span>Всего заработано</span><b>${fmt(state.totalEarned)}</b></div>

    <h2 style="margin-top:22px">👬 Друзья</h2>
    <p class="subtitle">За каждого приглашённого — <b>+10 000 монет</b></p>
    <div class="pf-row"><span>Приглашено друзей</span><b>${state.refCount || 0}</b></div>
    <button class="li-action" id="refShare" style="width:100%;padding:14px;margin-top:12px">🚀 Пригласить друга</button>
    <button class="li-action" id="refCopy" style="width:100%;padding:14px;margin-top:8px;background:var(--bg-card);color:var(--text)">📋 Скопировать ссылку</button>

    <h2 style="margin-top:22px">📅 Стрик</h2>
    <div class="pf-row"><span>Текущий стрик</span><b>${state.streakDay || 0} дн.</b></div>
    <button class="li-action" id="openStreakBtn" style="width:100%;padding:14px;margin-top:12px">🎁 Ежедневная награда</button>`;

  const refLink = `https://t.me/CatnessCoin_bot?start=ref_${u?.id || ''}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('Заходи в Catness Coin — тапай кота и зарабатывай монеты! 🐱')}`;
  $('#refShare')?.addEventListener('click', () => { openTg(shareUrl); haptic('light'); });
  $('#refCopy')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(refLink).then(() => toast('Ссылка скопирована!'), () => {});
    haptic('light');
  });
  $('#openStreakBtn')?.addEventListener('click', () => { openStreak(); haptic('light'); });
}

function renderEarn() {
  let html = `<h2>✅ Задания</h2><p class="subtitle">Обновляются каждые сутки</p>`;

  // Обязательная подписка на канал (выполнена, раз игра открыта)
  html += `
    <div class="list-item">
      <span class="li-emoji">📢</span>
      <div class="li-text">
        <div class="li-title">Канал Catness Coin</div>
        <div class="li-sub">Ты подписан ✓</div>
      </div>
      <button class="li-action done" disabled>✓ Готово</button>
    </div>`;

  TASKS.forEach((t) => {
    const done = state.tasksDone[t.id];
    let sub = t.sub, disabled = '';
    if (t.kind === 'goal') {
      const cur = Math.min(state.tapsToday || 0, t.goal);
      sub = `Прогресс: ${cur}/${t.goal}`;
      if (cur < t.goal) disabled = 'disabled';
    }
    if (t.kind === 'upgrade' && !state.upgradedToday) disabled = 'disabled';
    html += `
      <div class="list-item">
        <span class="li-emoji">${t.emoji}</span>
        <div class="li-text">
          <div class="li-title">${t.title}</div>
          <div class="li-sub">${sub} · +${fmt(t.reward)}</div>
        </div>
        <button class="li-action ${done ? 'done' : ''}" data-task="${t.id}" ${done ? 'disabled' : disabled}>
          ${done ? '✓ Готово' : 'Забрать'}</button>
      </div>`;
  });
  sheetBody.innerHTML = html;
  sheetBody.querySelectorAll('.li-action[data-task]').forEach((el) => {
    el.addEventListener('click', () => completeTask(el.dataset.task));
  });
}

function completeTask(id) {
  if (state.tasksDone[id]) return;
  const t = TASKS.find((x) => x.id === id);
  // Проверка условий
  if (t.kind === 'goal' && (state.tapsToday || 0) < t.goal) {
    toast(`Натапай ещё ${t.goal - (state.tapsToday || 0)}`); return;
  }
  if (t.kind === 'upgrade' && !state.upgradedToday) {
    toast('Сначала прокачай любую карточку'); return;
  }
  state.tasksDone[id] = true;
  state.balance += t.reward;
  state.totalEarned += t.reward;
  haptic('medium');
  toast(`+${fmt(t.reward)} за задание!`);
  render();
  renderEarn();
  save();
}

// ===== Обязательная подписка на канал (без неё нет монет) =====
let gateActive = false;
function openGate() {
  gateActive = true;
  $('#sheetClose').style.display = 'none';
  sheetBody.innerHTML = `
    <h2>📢 Один шаг до игры</h2>
    <p class="subtitle">Подпишись на официальный канал Catness Coin — без подписки монеты не капают.</p>
    <div class="invite-banner"><b>+5 000 монет</b><p>за подписку на канал</p></div>
    <button class="li-action" id="gateSub" style="width:100%;padding:14px;margin-bottom:10px">📢 Подписаться на канал</button>
    <button class="li-action" id="gateCheck" style="width:100%;padding:14px;background:var(--green);color:#0f0f14;display:none">✓ Я подписался</button>`;
  openSheet();
  $('#gateSub').addEventListener('click', () => {
    openTg(CHANNEL_URL);
    $('#gateCheck').style.display = 'block';
    haptic('light');
  });
  $('#gateCheck').addEventListener('click', async () => {
    const btn = $('#gateCheck');
    btn.disabled = true;
    btn.textContent = 'Проверяю…';
    const sub = await verifySubscription();
    if (sub === false) {
      // воркер реально сказал «не подписан»
      btn.disabled = false;
      btn.textContent = '✓ Я подписался';
      toast('Ты ещё не подписан на канал 😿');
      haptic('rigid');
      return;
    }
    // sub === true (подтверждено) или null (проверка не настроена — пускаем)
    grantAccess();
  });
}

function grantAccess() {
  const bonus = state.subBonusGiven ? 0 : 5000;
  state.subscribed = true;
  state.subBonusGiven = true;
  if (bonus) { state.balance += bonus; state.totalEarned += bonus; }
  gateActive = false;
  $('#sheetClose').style.display = '';
  haptic('medium');
  toast(bonus ? '+5 000 за подписку! 🎉' : 'Подписка подтверждена ✓');
  closeSheet();
  render();
  save();
  setTimeout(maybeShowStreak, 400); // покажем дневную награду сразу после входа
}

// ===== Тосты =====
let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ===== Игровые тики =====
function startLoops() {
  // Регенерация энергии + пассивный доход
  setInterval(() => {
    checkDailyReset();
    if (state.energy < state.energyMax) {
      state.energy = Math.min(state.energyMax, state.energy + state.energyRegen);
    }
    const inc = profitPerSec();
    if (inc > 0) { state.balance += inc; state.totalEarned += inc; }
    render();
    updateBoostUI();
  }, 1000);

  // Автосохранение
  setInterval(save, 5000);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}

// ===== Старт =====
async function init() {
  state = await loadState();
  if (!state.firstSeen) state.firstSeen = Date.now(); // дата первого захода
  applyOffline();
  checkDailyReset();

  // Перепроверяем подписку на канал на каждом запуске (если воркер настроен).
  // Отписался — снова блокируем игру.
  await syncServer(); // регистрация + бан-статус + начисления от админа
  if (isBanned) { render(); openBanned(); return; } // забанен — игра недоступна

  const sub = await verifySubscription();
  if (sub === true) state.subscribed = true;
  else if (sub === false) state.subscribed = false;

  await claimReferrals(); // начислить награды за приглашённых друзей

  render();
  updateBoostUI();
  if (!state.subscribed) openGate();
  else maybeShowStreak();
  startLoops();
  save();
}
init();
