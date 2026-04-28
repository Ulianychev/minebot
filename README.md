# Minebot

Простой `mineflayer`-бот для AFK на Minecraft-сервере.

Он умеет:

- заходить на сервер под указанным ником;
- ждать антибот-проверку;
- при необходимости писать `/login`;
- идти к NPC в лобби и заходить на нужный сервер;
- стоять в AFK;
- отвечать на команды доверенных ников;
- есть еду, если падают HP или голод;
- переподключаться после вылета.

## Что Нужно

Перед началом у тебя должны быть:

- установленный `Node.js` версии 18+;
- установленный `npm`;
- доступ к серверу Minecraft;
- ник бота;
- пароль от регистрации на сервере, если он нужен;
- координаты NPC в лобби;
- список ников, которым бот должен отвечать в чате.

Проверить, что `node` и `npm` стоят:

```bash
node -v
npm -v
```

## Как Скачать

С GitHub:

```bash
git clone https://github.com/Ulianychev/minebot.git
cd minebot
```

Если Git не нужен, можно просто скачать архив с GitHub и распаковать его в любую папку.

## Как Установить

В папке проекта выполни:

```bash
npm ci
```

Это установит все зависимости.

## Как Настроить

1. Скопируй `.env.example` в `.env`

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

2. Открой `.env` в любом редакторе.

3. Заполни основные поля.

Пример:

```env
MC_HOST=mc.example.ru
MC_PORT=25565
MC_USERNAME=MyBot123
MC_VERSION=
LOGIN_PASSWORD=123456
COMMAND_OWNERS=MyNick,FriendNick
LOBBY_NPC_POS=89.5,72,-182
SPAWN_WAIT_MS=7000
NPC_APPROACH_DISTANCE=3.2
NPC_PUNCH_DELAY_MS=700
ANTI_AFK_INTERVAL_MS=45000
AUTO_EAT_ITEM=cooked_porkchop
AUTO_EAT_HEALTH_THRESHOLD=5
AUTO_EAT_FOOD_THRESHOLD=5
STATUS_INTERVAL_MS=15000
RECONNECT_DELAY_MS=15000
DEBUG=1
```

## Что Значит Каждая Переменная

- `MC_HOST` - адрес сервера.
- `MC_PORT` - порт сервера, обычно `25565`.
- `MC_USERNAME` - ник бота.
- `MC_VERSION` - версия Minecraft. Если пусто, бот пытается подобрать ее сам.
- `LOGIN_PASSWORD` - пароль для команды `/login`.
- `COMMAND_OWNERS` - ники через запятую, чьи команды бот слушает.
- `LOBBY_NPC_POS` - координаты NPC, по которому бот должен ударить в лобби.
- `SPAWN_WAIT_MS` - сколько миллисекунд ждать после входа перед движением.
- `NPC_APPROACH_DISTANCE` - на каком расстоянии остановиться перед NPC.
- `NPC_PUNCH_DELAY_MS` - пауза перед ударом по NPC.
- `ANTI_AFK_INTERVAL_MS` - как часто бот делает анти-АФК взмах.
- `AUTO_EAT_ITEM` - название еды в инвентаре.
- `AUTO_EAT_HEALTH_THRESHOLD` - порог HP для еды.
- `AUTO_EAT_FOOD_THRESHOLD` - порог сытости для еды.
- `AUTO_EAT_TIMEOUT_MS` - таймаут попытки поесть.
- `STATUS_INTERVAL_MS` - как часто писать статус в консоль.
- `RECONNECT_DELAY_MS` - сколько ждать перед переподключением после вылета.
- `SPAWN_WAIT_JITTER_MS`, `NPC_PUNCH_DELAY_JITTER_MS`, `ANTI_AFK_INTERVAL_JITTER_MS`, `RECONNECT_DELAY_JITTER_MS` - случайный разброс таймингов, чтобы действия не были слишком механическими.
- `PLAYER_LIST_ENABLED=1` - включает живой лог списка игроков.
- `PLAYER_LIST_INTERVAL_MS=60000` - как часто печатать полный список игроков.
- `DEBUG` - `1` включает подробные служебные логи.

## Как Запустить

Обычный запуск:

```bash
npm start
```

Проверка синтаксиса без запуска:

```bash
npm run check
```

## Как Работают Команды

Бот реагирует только на ники из `COMMAND_OWNERS`.

Команды:

- `бот, к ноге`
  Бот пишет `/tpa <твой ник>`.

- `статус`
  Бот пишет в чат свои `HP`, `Food` и текущее состояние.

Если такую же команду напишет кто-то не из белого списка, бот ответит:

```text
кукиш тебе, врунишка
```

## Как Подобрать Координаты NPC

1. Зайди на сервер обычным клиентом.
2. Дойди до лобби.
3. Встань там, где обычно спавнится игрок.
4. Посмотри координаты нужного NPC.
5. Запиши их в `LOBBY_NPC_POS`.

Если бот не доходит:

- немного увеличь `SPAWN_WAIT_MS`;
- уменьши или увеличь `NPC_APPROACH_DISTANCE`;
- проверь, что координаты NPC записаны без ошибки.

## Что Будет В Логах

В консоли бот пишет:

- подключение;
- чат сервера;
- момент спавна;
- ожидание антибот-проверки;
- движение к NPC;
- попытку удара;
- статус AFK;
- вылеты и переподключения;
- попытки поесть;
- команды от игроков.
- входы и выходы игроков, если включен `PLAYER_LIST_ENABLED=1`;
- периодический полный список онлайна, если включен `PLAYER_LIST_ENABLED=1`.

Самая полезная настройка для отладки:

```env
DEBUG=1
```

## Как Остановить

Если бот запущен в консоли, остановить можно так:

Windows:

```powershell
Ctrl + C
```

Linux/macOS:

```bash
Ctrl + C
```

## Как Поделиться С Другом

Самый удобный вариант:

1. Дай другу ссылку на репозиторий.
2. Пусть он скачает проект.
3. Пусть создаст свой `.env`.
4. Пусть впишет туда:
   - свой ник бота;
   - свой пароль;
   - свои доверенные ники;
   - свои координаты NPC;
   - свои тайминги, если нужно.
5. Пусть запустит `npm ci`, потом `npm start`.

Важно:

- не передавай свой реальный `.env`;
- не коммить `.env` в GitHub;
- у каждого человека должны быть свои логин, ник и настройки.

## Отдельная Версия Для Лицензионного Аккаунта

В проекте есть отдельный минимальный бот для лицензионного аккаунта без антибот-защиты:

- файл: `premium-afk.js`
- запуск: `npm run start:premium`
- шаблон настроек: `.env.premium.example`

Что он делает:

- заходит через `Microsoft`-авторизацию;
- сразу зажимает `sneak`;
- редко крутит головой;
- переподключается после дисконнекта.

Как настроить:

1. Скопируй `.env.premium.example` в `.env.premium`
2. Заполни:
   - `MC_HOST`
   - `MC_PORT`
   - `MC_USERNAME`
   - `MC_AUTH=microsoft`
3. Запусти:

```bash
npm run start:premium
```

На первом запуске mineflayer может попросить пройти вход в Microsoft-аккаунт.

### Premium На VPS

Если хочешь держать именно лицензионного AFK-бота на VPS, ставь его как отдельный сервис, не поверх обычного `minebot.service`.

Подготовленные файлы:

- `premium-afk.js` - сам premium-бот;
- `.env.premium.example` - шаблон настроек;
- `minebot-premium.service` - отдельный `systemd`-юнит под VPS.

Рекомендуемый порядок:

1. Залей проект в `/opt/minebot`
2. Установи зависимости:

```bash
cd /opt/minebot
npm ci
```

3. Создай настройки:

```bash
cp .env.premium.example .env.premium
```

4. Заполни `.env.premium`:

- `MC_HOST`
- `MC_PORT`
- `MC_USERNAME`
- `MC_AUTH=microsoft`
- для VPS лучше сразу поставить `MAP_CAPTCHA_AUTO_OPEN=0`

5. Проверь запуск вручную:

```bash
cd /opt/minebot
npm run check:premium
npm run start:premium
```

6. На первом запуске заверши `Microsoft`-авторизацию, если mineflayer ее попросит.
7. После ручной проверки поставь сервис:

```bash
sudo cp /opt/minebot/minebot-premium.service /etc/systemd/system/minebot-premium.service
sudo systemctl daemon-reload
sudo systemctl enable minebot-premium
sudo systemctl start minebot-premium
```

8. Проверка состояния:

```bash
sudo systemctl status minebot-premium
journalctl -u minebot-premium -f
```

9. Основные команды управления:

```bash
sudo systemctl restart minebot-premium
sudo systemctl stop minebot-premium
sudo systemctl start minebot-premium
```

Важно:

- не запускай `minebot-premium` и обычный `minebot` под одним и тем же аккаунтом Minecraft одновременно;
- сначала добейся успешного ручного логина, и только потом включай автозапуск;
- если на VPS нет GUI, автoоткрытие капчи должно быть выключено: `MAP_CAPTCHA_AUTO_OPEN=0`.

## Частые Проблемы

`npm` не запускается на Windows из-за policy:

```powershell
npm.cmd start
```

Бот не логинится:

- проверь `LOGIN_PASSWORD`;
- проверь, действительно ли сервер ждет `/login`.

Бот не заходит через NPC:

- проверь `LOBBY_NPC_POS`;
- увеличь `SPAWN_WAIT_MS`;
- включи `DEBUG=1` и посмотри логи.

Бот не ест:

- проверь, что у него в инвентаре есть именно `cooked_porkchop`;
- проверь пороги `AUTO_EAT_HEALTH_THRESHOLD` и `AUTO_EAT_FOOD_THRESHOLD`.

## Файлы Проекта

- `index.js` - основной код бота.
- `.env.example` - шаблон настроек.
- `package.json` - команды запуска и зависимости.
- `README.md` - инструкция.
