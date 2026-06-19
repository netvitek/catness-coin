# Деплой бота на Cloudflare Workers (бесплатно, 24/7)

Бот работает по webhook — Cloudflare сам держит его онлайн, ПК не нужен.

## Шаг 1. Создай Worker
1. Зарегистрируйся (бесплатно): https://dash.cloudflare.com
2. Слева **Workers & Pages** → **Create** → **Create Worker**
3. Имя, например `catness-bot` → **Deploy** (создастся заготовка)
4. **Edit code** → удали весь шаблон, вставь содержимое `worker.js` → **Deploy**

## Шаг 2. Добавь секреты
В воркере: **Settings → Variables and Secrets → Add**:
- `BOT_TOKEN` — токен от @BotFather (тип: Secret) — **обязательно**
- `WEBHOOK_SECRET` — любая случайная строка, напр. `cat_9f3kZ1q7` (тип: Secret) — желательно

Сохрани (**Deploy** ещё раз, если попросит).

## Шаг 3. Узнай адрес воркера
Он вида: `https://catness-bot.ТВОЙ-САБДОМЕН.workers.dev`
Открой его в браузере — должно написать: `Catness Coin bot is running 🐱`

## Шаг 4. Привяжи webhook
Открой в браузере ссылку (подставь токен, адрес воркера и тот же секрет):
```
https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://catness-bot.САБДОМЕН.workers.dev&secret_token=<WEBHOOK_SECRET>
```
Ответ `{"ok":true,...}` = готово.

## Проверка
Напиши боту `/start` — придёт приветствие с кнопками. Теперь бот живёт 24/7.

## Полезное
- Проверить webhook: `https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo`
- Снять webhook (вернуться к polling): `https://api.telegram.org/bot<ТОКЕН>/deleteWebhook`

> ⚠️ Пока стоит webhook, локальный `bot.py` (polling) работать не будет — это нормально, бот теперь на Cloudflare.
