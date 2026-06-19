# -*- coding: utf-8 -*-
"""
Catness Coin — Telegram-бот.
Отвечает на /start приветствием с кнопками «Играть» и «Канал».
Зависимостей нет — только стандартная библиотека (long polling).

Запуск:
  1) Положи токен бота (из @BotFather) в файл bot_token.txt рядом с этим файлом,
     либо задай переменную окружения BOT_TOKEN.
  2) py bot.py
"""
import os, json, time, urllib.request, urllib.parse, urllib.error

# ---- Настройки ----
GAME_URL    = "https://netvitek.github.io/catness-coin/"
CHANNEL_URL = "https://t.me/Catness_Coin"

WELCOME = (
    "Котость пробудилась! 🐱\n\n"
    "В мире <b>Catness Coin</b> тебя ждут тапы, апгрейды и собственная "
    "крипто-империя 🚀\n\n"
    "Тапай кота, прокачивайся и забирай награды за активность!"
)

KEYBOARD = {
    "inline_keyboard": [
        [{"text": "🎮 Играть и тапать", "web_app": {"url": GAME_URL}}],
        [{"text": "📢 Официальный канал", "url": CHANNEL_URL}],
    ]
}


def get_token():
    tok = os.environ.get("BOT_TOKEN", "").strip()
    if tok:
        return tok
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "bot_token.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    raise SystemExit(
        "Не найден токен. Создай файл bot_token.txt с токеном от @BotFather "
        "или задай переменную окружения BOT_TOKEN."
    )


API = "https://api.telegram.org/bot{}/{}"


def call(token, method, **params):
    url = API.format(token, method)
    data = urllib.parse.urlencode(
        {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in params.items()}
    ).encode()
    try:
        with urllib.request.urlopen(url, data=data, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:200])
    except Exception as e:
        print("err:", e)
    return None


def send_welcome(token, chat_id):
    call(token, "sendMessage",
         chat_id=chat_id, text=WELCOME, parse_mode="HTML",
         reply_markup=KEYBOARD, disable_web_page_preview=True)


def main():
    token = get_token()
    me = call(token, "getMe")
    if not me or not me.get("ok"):
        raise SystemExit("Токен неверный — getMe не прошёл.")
    print("Бот запущен:", me["result"]["username"])

    offset = 0
    while True:
        upd = call(token, "getUpdates", offset=offset, timeout=50)
        if not upd or not upd.get("ok"):
            time.sleep(3)
            continue
        for u in upd["result"]:
            offset = u["update_id"] + 1
            msg = u.get("message")
            if not msg:
                continue
            text = (msg.get("text") or "").strip()
            chat_id = msg["chat"]["id"]
            if text.startswith("/start"):
                send_welcome(token, chat_id)
                print("welcome ->", chat_id)


if __name__ == "__main__":
    main()
