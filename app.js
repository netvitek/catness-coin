// ===== Catness Coin — игровая логика =====
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.setHeaderColor?.('#0f0f14'); tg.setBackgroundColor?.('#0f0f14'); }

const haptic = (type = 'light') => {
  try { tg?.HapticFeedback?.impactOccurred(type); } catch (e) {}
};

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

// ---- Задания ----
const TASKS = [
  { id: 't_sub',   title: 'Подписаться на канал', sub: 'Catness News', emoji: '📢', reward: 5000 },
  { id: 't_chat',  title: 'Вступить в чат',       sub: 'Сообщество',   emoji: '💬', reward: 5000 },
  { id: 't_x',     title: 'Подписаться в X',      sub: '@CatnessCoin', emoji: '🐦', reward: 3000 },
  { id: 't_daily', title: 'Ежедневный заход',     sub: 'Заходи каждый день', emoji: '📅', reward: 1000 },
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
  tasksDone: {},         // id -> true
  boostUntil: 0,
  lastSeen: Date.now(),
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem('catness_save');
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULT_STATE };
}
function save() {
  state.lastSeen = Date.now();
  localStorage.setItem('catness_save', JSON.stringify(state));
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
(function applyOffline() {
  const now = Date.now();
  const dt = Math.min((now - (state.lastSeen || now)) / 1000, 3 * 3600); // максимум 3 часа
  if (dt > 0) {
    const earned = profitPerSec() * dt;
    state.balance += earned;
    state.totalEarned += earned;
    state.energy = Math.min(state.energyMax, state.energy + state.energyRegen * dt);
    if (earned > 50) setTimeout(() => toast(`💤 Пока тебя не было: +${fmt(earned)}`), 600);
  }
})();

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
}

// ===== Тап =====
function doTap(clientX, clientY) {
  const cost = 1; // 1 энергия за тап
  if (state.energy < cost) { toast('⚡ Энергия кончилась!'); return; }

  const gain = tapValue();
  state.energy -= cost;
  state.balance += gain;
  state.totalEarned += gain;

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

// ===== Буст =====
$('#boostBtn').addEventListener('click', () => {
  if (Date.now() < state.boostUntil) { toast('🚀 Буст уже активен!'); return; }
  state.boostUntil = Date.now() + 20000; // 20 сек x5
  toast('🚀 Буст x5 на 20 секунд!');
  haptic('medium');
});

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
  sheet.classList.remove('open');
  setActiveNav(document.querySelector('.nav-item[data-tab="exchange"]'));
}
$('#sheetClose').addEventListener('click', closeSheet);
$('#sheetBackdrop').addEventListener('click', closeSheet);

function openTab(tab) {
  if (tab === 'cards') renderCards();
  else if (tab === 'friends') renderFriends();
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
  haptic('medium');
  toast(`${card.emoji} ${card.name} → ур. ${cardLevel(id)}`);
  render();
  renderCards();
  save();
}

function renderFriends() {
  const refLink = `https://t.me/CatnessCoin_bot?start=ref_${tg?.initDataUnsafe?.user?.id || 'demo'}`;
  sheetBody.innerHTML = `
    <h2>👬 Друзья</h2>
    <p class="subtitle">Зови друзей — получай бонусы за каждого</p>
    <div class="invite-banner">
      <b>+5 000 монет</b><p>за каждого друга · +25 000 за друга с Premium</p>
    </div>
    <button class="li-action" id="copyRef" style="width:100%;padding:14px">📨 Скопировать пригласительную ссылку</button>
    <p class="subtitle" style="margin-top:16px;text-align:center">Пока приглашённых нет</p>`;
  $('#copyRef').addEventListener('click', () => {
    navigator.clipboard?.writeText(refLink).then(() => toast('Ссылка скопирована!'), () => {});
    haptic('light');
  });
}

function renderEarn() {
  let html = `<h2>✅ Задания</h2><p class="subtitle">Выполняй задания — получай монеты</p>`;
  TASKS.forEach((t) => {
    const done = state.tasksDone[t.id];
    html += `
      <div class="list-item">
        <span class="li-emoji">${t.emoji}</span>
        <div class="li-text">
          <div class="li-title">${t.title}</div>
          <div class="li-sub">${t.sub} · +${fmt(t.reward)}</div>
        </div>
        <button class="li-action ${done ? 'done' : ''}" data-task="${t.id}" ${done ? 'disabled' : ''}>
          ${done ? '✓ Готово' : 'Выполнить'}</button>
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
  state.tasksDone[id] = true;
  state.balance += t.reward;
  state.totalEarned += t.reward;
  haptic('medium');
  toast(`+${fmt(t.reward)} за задание!`);
  render();
  renderEarn();
  save();
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
// Регенерация энергии + пассивный доход
setInterval(() => {
  // энергия
  if (state.energy < state.energyMax) {
    state.energy = Math.min(state.energyMax, state.energy + state.energyRegen);
  }
  // пассивный доход
  const inc = profitPerSec();
  if (inc > 0) { state.balance += inc; state.totalEarned += inc; }
  render();
}, 1000);

// Автосохранение
setInterval(save, 5000);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// Старт
render();
