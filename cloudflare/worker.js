// ===== Catness Coin — бот + проверка подписки + рефералы (Cloudflare Workers) =====
// Маршруты:
//   GET  /        -> "жив"
//   POST /tg      -> webhook Telegram (/start, обработка реф-ссылок)
//   POST /verify  -> проверка подписки на канал
//   POST /claim   -> забрать накопленные реф-награды (+ счётчик друзей)
//
// Секреты воркера: BOT_TOKEN (обяз.), WEBHOOK_SECRET, CHANNEL (по умолч. @Catness_Coin)
// KV-биндинг: REF (хранит рефералов)

const GAME_URL = 'https://netvitek.github.io/catness-coin/';
const CHANNEL_URL = 'https://t.me/Catness_Coin';
const DEFAULT_CHANNEL = '@Catness_Coin';
const REF_REWARD = 10000; // монет за каждого приглашённого друга

const WELCOME =
  'Котость пробудилась! 🐱\n\n' +
  'В мире <b>Catness Coin</b> тебя ждут тапы, апгрейды и собственная крипто-империя 🚀\n\n' +
  'Тапай кота, прокачивайся и забирай награды за активность!';

const KEYBOARD = {
  inline_keyboard: [
    [{ text: '🎮 Играть и тапать', web_app: { url: GAME_URL } }],
    [{ text: '📢 Официальный канал', url: CHANNEL_URL }],
  ],
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'GET') return new Response('Catness Coin bot is running 🐱', { status: 200 });
    if (!env.BOT_TOKEN) return new Response('BOT_TOKEN not set', { status: 500 });

    if (url.pathname === '/verify') return handleVerify(request, env);
    if (url.pathname === '/claim') return handleClaim(request, env);

    // ---- Webhook Telegram ----
    if (env.WEBHOOK_SECRET) {
      const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (got !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
    }
    let update;
    try { update = await request.json(); } catch (_) { return new Response('bad', { status: 400 }); }
    const msg = update.message;
    const text = msg && typeof msg.text === 'string' ? msg.text.trim() : '';
    if (msg && text.startsWith('/start')) {
      await handleStartRef(env, msg, text);
      await tg(env.BOT_TOKEN, 'sendMessage', {
        chat_id: msg.chat.id, text: WELCOME, parse_mode: 'HTML',
        disable_web_page_preview: true, reply_markup: KEYBOARD,
      });
    }
    return new Response('ok', { status: 200 });
  },
};

// Засчитываем реферала, когда новый юзер пришёл по ссылке ?start=ref_<id>
async function handleStartRef(env, msg, text) {
  if (!env.REF || !msg.from) return;
  const parts = text.split(/\s+/);
  if (parts.length < 2 || !parts[1].startsWith('ref_')) return;
  const refId = parts[1].slice(4).replace(/[^0-9]/g, '');
  const newUser = String(msg.from.id);
  if (!refId || refId === newUser) return;            // нет id или сам себя
  const invKey = 'inv:' + newUser;
  if (await env.REF.get(invKey)) return;              // этого юзера уже считали
  await env.REF.put(invKey, refId);
  const refKey = 'ref:' + refId;
  let data = { count: 0, pending: 0 };
  try { const raw = await env.REF.get(refKey); if (raw) data = JSON.parse(raw); } catch (_) {}
  data.count += 1;
  data.pending += REF_REWARD;
  await env.REF.put(refKey, JSON.stringify(data));
}

async function handleVerify(request, env) {
  const channel = env.CHANNEL || DEFAULT_CHANNEL;
  let initData = '';
  try { initData = (await request.json()).initData || ''; } catch (_) {}
  const user = await validateInitData(initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad_init_data', subscribed: false });
  const subscribed = await isSubscribed(env.BOT_TOKEN, channel, user.id);
  return json({ ok: true, subscribed, userId: user.id });
}

async function handleClaim(request, env) {
  let initData = '';
  try { initData = (await request.json()).initData || ''; } catch (_) {}
  const user = await validateInitData(initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad_init_data' });
  let data = { count: 0, pending: 0 };
  if (env.REF) {
    try { const raw = await env.REF.get('ref:' + user.id); if (raw) data = JSON.parse(raw); } catch (_) {}
    if (data.pending > 0) {
      await env.REF.put('ref:' + user.id, JSON.stringify({ count: data.count, pending: 0 }));
    }
  }
  return json({ ok: true, count: data.count, credited: data.pending });
}

// Проверяем подпись initData (нельзя подделать свой id)
async function validateInitData(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  const entries = [...params.entries()].filter(([k]) => k !== 'hash').sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  const enc = new TextEncoder();
  const secretKey = await hmac(enc.encode('WebAppData'), enc.encode(botToken));
  const calc = await hmac(secretKey, enc.encode(dataCheckString));
  if (toHex(calc) !== hash) return null;
  const userStr = params.get('user');
  if (!userStr) return null;
  try { return JSON.parse(userStr); } catch (_) { return null; }
}

async function isSubscribed(token, chatId, userId) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${userId}`);
    const j = await r.json();
    if (!j.ok) return false;
    return ['creator', 'administrator', 'member'].includes(j.result.status);
  } catch (_) { return false; }
}

async function hmac(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, msgBytes));
}
function toHex(buf) { return [...buf].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function json(obj) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}
async function tg(token, method, payload) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  } catch (_) {}
}
