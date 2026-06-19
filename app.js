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
  if (gateActive) return; // нельзя закрыть, пока не подписался
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
  state.upgradedToday = true;
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
  $('#gateCheck').addEventListener('click', () => {
    state.subscribed = true;
    state.balance += 5000;
    state.totalEarned += 5000;
    gateActive = false;
    $('#sheetClose').style.display = '';
    haptic('medium');
    toast('+5 000 за подписку! 🎉');
    closeSheet();
    render();
    save();
  });
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
  checkDailyReset();
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
checkDailyReset();
render();
if (!state.subscribed) openGate();
