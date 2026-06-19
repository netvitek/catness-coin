// ===== Catness Coin — Telegram-бот на Cloudflare Workers (webhook) =====
// Отвечает на /start приветствием с кнопками «Играть» и «Канал».
// Токен хранится в секрете BOT_TOKEN (НЕ в коде).
//
// Деплой: вставь этот файл в Worker через дашборд Cloudflare,
// добавь секреты BOT_TOKEN (обязательно) и WEBHOOK_SECRET (желательно),
// затем привяжи webhook (см. cloudflare/README.md).

const GAME_URL = 'https://netvitek.github.io/catness-coin/';
const CHANNEL_URL = 'https://t.me/Catness_Coin';

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

export default {
  async fetch(request, env) {
    // Проверка обращения (GET) — для проверки, что воркер жив
    if (request.method !== 'POST') {
      return new Response('Catness Coin bot is running 🐱', { status: 200 });
    }

    // Защита: пускаем только запросы с правильным секретом (если задан)
    if (env.WEBHOOK_SECRET) {
      const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (got !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
    }

    if (!env.BOT_TOKEN) {
      return new Response('BOT_TOKEN not set', { status: 500 });
    }

    let update;
    try { update = await request.json(); }
    catch (_) { return new Response('bad request', { status: 400 }); }

    const msg = update.message;
    const text = msg && typeof msg.text === 'string' ? msg.text.trim() : '';

    if (msg && text.startsWith('/start')) {
      await tg(env.BOT_TOKEN, 'sendMessage', {
        chat_id: msg.chat.id,
        text: WELCOME,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: KEYBOARD,
      });
    }

    // Telegram'у достаточно ответить 200 OK
    return new Response('ok', { status: 200 });
  },
};

async function tg(token, method, payload) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // тихо игнорируем — Telegram повторит при необходимости
  }
}
