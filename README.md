# Minebot

Mineflayer-бот для `AFKgoodbot5`.

Что он делает:

- заходит на сервер;
- ждет антибот-проверку;
- при необходимости отправляет `/login`;
- идет к нужному NPC в лобби и заходит на сервер;
- держит анти-АФК;
- принимает команды владельцев;
- ест `cooked_porkchop`, если HP или еда падают ниже порога;
- переподключается после дисконнекта.

## Настройка

1. Скопируйте `.env.example` в `.env`.
2. Заполните как минимум:
   - `MC_HOST`
   - `MC_PORT`
   - `MC_USERNAME`
   - `LOGIN_PASSWORD`
   - `COMMAND_OWNERS`
   - `LOBBY_NPC_POS`
3. Если нужна фиксированная версия протокола, задайте `MC_VERSION`.

Установка и локальный запуск:

```bash
npm ci
npm start
```

Проверка синтаксиса:

```bash
npm run check
```

## Команды

Команды в чате от ников из `COMMAND_OWNERS`:

- `бот, к ноге` -> бот отправляет `/tpa` отправителю;
- `статус` -> бот пишет в чат свои `HP`, `Food` и текущее состояние.

Если ту же команду пишет кто-то вне белого списка, бот отвечает: `кукиш тебе, врунишка`.

## Переменные

- `DEBUG=1` включает дополнительные служебные сообщения.
- `STATUS_INTERVAL_MS=15000` задает частоту статус-логов.
- `AUTO_EAT_ITEM=cooked_porkchop` задает еду для автопоедания.
- `AUTO_EAT_HEALTH_THRESHOLD=5` и `AUTO_EAT_FOOD_THRESHOLD=5` задают пороги поедания.

## VPS

Для VPS в репозитории есть готовый unit-файл `minebot.service`.

Рекомендуемая схема:

```bash
cd /opt/minebot
npm ci --omit=dev
cp .env.example .env
systemctl enable minebot
systemctl start minebot
```

Логи:

```bash
journalctl -u minebot -f
```
