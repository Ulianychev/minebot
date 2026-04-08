'use strict';

require('dotenv').config();

const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');

const config = {
  host: process.env.MC_HOST || 'CHANGE_ME',
  port: Number.parseInt(process.env.MC_PORT || '25565', 10),
  username: process.env.MC_USERNAME || 'CHANGE_ME',
  version: process.env.MC_VERSION || false,
  loginPassword: process.env.LOGIN_PASSWORD || '',
  commandOwners: parseOwners(process.env.COMMAND_OWNERS || process.env.COMMAND_OWNER || ''),
  autoEatItem: process.env.AUTO_EAT_ITEM || 'cooked_porkchop',
  autoEatHealthThreshold: Number.parseFloat(process.env.AUTO_EAT_HEALTH_THRESHOLD || '5'),
  autoEatFoodThreshold: Number.parseInt(process.env.AUTO_EAT_FOOD_THRESHOLD || '5', 10),
  spawnWaitMs: Number.parseInt(process.env.SPAWN_WAIT_MS || '12000', 10),
  reconnectDelayMs: Number.parseInt(process.env.RECONNECT_DELAY_MS || '15000', 10),
  approachDistance: Number.parseFloat(process.env.NPC_APPROACH_DISTANCE || '3.2'),
  punchDelayMs: Number.parseInt(process.env.NPC_PUNCH_DELAY_MS || '700', 10),
  antiAfkIntervalMs: Number.parseInt(process.env.ANTI_AFK_INTERVAL_MS || '45000', 10),
  statusIntervalMs: Number.parseInt(process.env.STATUS_INTERVAL_MS || '15000', 10),
  debug: process.env.DEBUG === '1',
  lobbyNpcPos: parseVec3(process.env.LOBBY_NPC_POS)
};

let reconnectTimer = null;
let antiAfkTimer = null;
let statusTimer = null;
let lobbyHandled = false;
let currentBot = null;
let botState = 'booting';
let authRequested = false;
let authCompleted = false;
let loginSent = false;
let lobbySpawnPos = null;
let isEating = false;

if (config.host === 'CHANGE_ME' || config.username === 'CHANGE_ME') {
  console.error('Set MC_HOST and MC_USERNAME before starting the bot.');
  process.exit(1);
}

createBot();

function createBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  lobbyHandled = false;
  authRequested = false;
  authCompleted = false;
  loginSent = false;
  lobbySpawnPos = null;
  isEating = false;
  botState = 'connecting';

  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version
  });

  currentBot = bot;
  console.log(`[boot] Connecting to ${config.host}:${config.port} as ${config.username}. Version: ${config.version || 'auto'}.`);

  bot.once('spawn', () => {
    botState = 'spawned';
    console.log(`[spawn] Bot spawned at ${formatVec(bot.entity.position)}.`);
    startStatusUpdates(bot);
    runLobbyFlow(bot).catch((error) => {
      console.error(`[flow] ${error.message}`);
    });
  });

  bot.on('login', () => {
    botState = 'logged_in';
    console.log('[login] Session established.');
  });

  bot.on('inject_allowed', () => {
    console.log('[net] Protocol injected, waiting for game data.');
  });

  bot.on('message', (jsonMsg) => {
    const message = jsonMsg.toString().trim();
    if (message) {
      console.log(`[chat] ${message}`);
      handleServerMessage(bot, message);
    }
  });

  bot.on('kicked', (reason) => {
    console.error(`[kick] ${reason}`);
  });

  bot.on('error', (error) => {
    console.error(`[error] ${error.message}`);
  });

  bot.on('health', () => {
    void maybeEat(bot, 'health');
  });

  bot.on('food', () => {
    void maybeEat(bot, 'food');
  });

  bot.on('end', () => {
    stopAntiAfk();
    stopStatusUpdates();
    botState = 'disconnected';
    console.log('[end] Connection closed.');
    scheduleReconnect();
  });

  bot.on('death', () => {
    console.warn(`[death] Bot died at ${formatVec(bot.entity.position)}.`);
  });

  bot.on('forcedMove', () => {
    if (bot.entity) {
      console.log(`[move] Server moved bot to ${formatVec(bot.entity.position)}.`);
    }
  });
}

async function runLobbyFlow(bot) {
  if (lobbyHandled) {
    return;
  }

  lobbyHandled = true;

  console.log(`[flow] Waiting ${config.spawnWaitMs}ms for anti-bot check.`);
  botState = 'waiting_antibot';
  await sleep(config.spawnWaitMs);

  if (!bot.entity || !bot.entity.position) {
    throw new Error('Bot entity is not available after spawn.');
  }

  lobbySpawnPos = bot.entity.position.clone();
  console.log(`[flow] Lobby reference position saved as ${formatVec(lobbySpawnPos)}.`);

  if (authRequested && !authCompleted) {
    console.log('[auth] Authorization is required before movement.');
    await ensureAuthenticated(bot);
  }

  if (config.lobbyNpcPos) {
    botState = 'moving_to_npc';
    console.log(`[flow] Starting walk to lobby NPC at ${formatVec(config.lobbyNpcPos)}.`);
    await moveNear(bot, config.lobbyNpcPos, config.approachDistance);
    await sleep(config.punchDelayMs);
    botState = 'attacking_npc';
    await joinServerViaNpc(bot, config.lobbyNpcPos);
  } else {
    console.warn('[flow] LOBBY_NPC_POS is not set, skipping NPC selection.');
  }

  console.log('[flow] Server transition detected, anti-AFK enabled.');
  botState = 'afk';
  startAntiAfk(bot);
}

async function moveNear(bot, targetPos, stopDistance) {
  console.log(`[move] Moving toward ${formatVec(targetPos)} until distance <= ${stopDistance}.`);

  const start = Date.now();
  const timeoutMs = 15000;
  let lastReportAt = 0;

  while (bot.entity.position.distanceTo(targetPos) > stopDistance) {
    if (Date.now() - start > timeoutMs) {
      bot.setControlState('forward', false);
      throw new Error('Timed out while walking to the NPC.');
    }

    await facePosition(bot, targetPos);
    bot.setControlState('forward', true);

    if (Date.now() - lastReportAt >= 1000) {
      const distance = bot.entity.position.distanceTo(targetPos);
      console.log(`[move] Position ${formatVec(bot.entity.position)}, distance to NPC ${distance.toFixed(2)}.`);
      lastReportAt = Date.now();
    }

    await sleep(100);
  }

  bot.setControlState('forward', false);
  await facePosition(bot, targetPos);
  console.log(`[move] Reached attack range at ${formatVec(bot.entity.position)}.`);
}

async function joinServerViaNpc(bot, targetPos) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`[attack] NPC join attempt ${attempt}/${maxAttempts}.`);
    await hitLobbyNpc(bot, targetPos);

    const switched = await waitForServerTransition(bot, 8000);
    if (switched) {
      return;
    }

    if (attempt < maxAttempts) {
      console.warn('[attack] No server transition after attack, retrying.');
      await sleep(1200);
      await moveNear(bot, targetPos, config.approachDistance);
    }
  }

  throw new Error('NPC was hit, but server transition was not detected.');
}

async function hitLobbyNpc(bot, targetPos) {
  const targetEntity = findBestNpcEntity(bot, targetPos, 4.5);

  if (targetEntity) {
    const entityName = targetEntity.username || targetEntity.name || targetEntity.displayName || targetEntity.type;
    console.log(`[attack] Found target "${entityName}" (${targetEntity.type}) at ${formatVec(targetEntity.position)}.`);
    await facePosition(bot, targetEntity.position.offset(0, Math.max(targetEntity.height || 1.8, 1.2) * 0.8, 0));
    bot.attack(targetEntity, true);
    console.log('[attack] Attack packet sent to entity.');
    return;
  }

  console.warn('[attack] No suitable NPC entity found, swinging at coordinates only.');
  await facePosition(bot, targetPos.offset(0, 1.2, 0));
  bot.swingArm('right', true);
  console.log('[attack] Arm swing sent.');
}

function startAntiAfk(bot) {
  stopAntiAfk();

  console.log(`[anti-afk] Active, interval ${config.antiAfkIntervalMs}ms.`);
  antiAfkTimer = setInterval(async () => {
    if (!bot.entity) {
      return;
    }

    try {
      const yawJitter = (Math.random() - 0.5) * 0.2;
      const pitchJitter = (Math.random() - 0.5) * 0.08;
      await bot.look(bot.entity.yaw + yawJitter, bot.entity.pitch + pitchJitter, true);
      bot.swingArm('right', true);
      console.log(`[anti-afk] Swing at ${formatVec(bot.entity.position)}.`);
    } catch (error) {
      console.error(`[anti-afk] ${error.message}`);
    }
  }, config.antiAfkIntervalMs);
}

function stopAntiAfk() {
  if (antiAfkTimer) {
    clearInterval(antiAfkTimer);
    antiAfkTimer = null;
    console.log('[anti-afk] Stopped.');
  }
}

function startStatusUpdates(bot) {
  stopStatusUpdates();
  console.log(`[status] Periodic status every ${config.statusIntervalMs}ms.`);
  statusTimer = setInterval(() => {
    if (!bot.entity) {
      return;
    }

    const target = config.lobbyNpcPos
      ? `, npc distance ${bot.entity.position.distanceTo(config.lobbyNpcPos).toFixed(2)}`
      : '';

    console.log(
      `[status] State ${botState}, pos ${formatVec(bot.entity.position)}, hp ${bot.health?.toFixed(1) ?? 'n/a'}, food ${bot.food ?? 'n/a'}, yaw ${bot.entity.yaw.toFixed(2)}, pitch ${bot.entity.pitch.toFixed(2)}${target}.`
    );
  }, config.statusIntervalMs);
}

function stopStatusUpdates() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
    console.log('[status] Stopped.');
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  console.log(`[reconnect] Reconnecting in ${config.reconnectDelayMs}ms.`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createBot();
  }, config.reconnectDelayMs);
}

async function waitForServerTransition(bot, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!bot.entity || !bot.entity.position) {
      return false;
    }

    const movedFromLobbySpawn = lobbySpawnPos
      ? bot.entity.position.distanceTo(lobbySpawnPos) > 12
      : false;
    const movedAwayFromNpc = config.lobbyNpcPos
      ? bot.entity.position.distanceTo(config.lobbyNpcPos) > 12
      : false;

    if (movedFromLobbySpawn && movedAwayFromNpc) {
      console.log(`[flow] Transition confirmed at ${formatVec(bot.entity.position)}.`);
      return true;
    }

    await sleep(250);
  }

  return false;
}

function handleServerMessage(bot, message) {
  const lower = message.toLowerCase();

  if (isAuthSuccess(lower)) {
    authCompleted = true;
    authRequested = false;
    console.log('[auth] Authorization confirmed by server.');
    return;
  }

  if (isAuthPrompt(lower)) {
    authRequested = true;
    authCompleted = false;
    console.log('[auth] Server requested authorization.');

    if (!loginSent) {
      void sendLoginCommand(bot);
    }
  }

  const chatCommand = parseChatCommand(message);
  if (!chatCommand) {
    return;
  }

  if (!isSupportedCommand(chatCommand.text)) {
    return;
  }

  if (isAuthorizedSender(chatCommand.sender)) {
    if (containsCommand(chatCommand.text, 'бот, к ноге')) {
      void sendTpa(bot, chatCommand.sender);
      return;
    }

    if (containsCommand(chatCommand.text, 'статус')) {
      void sendStatusToChat(bot, chatCommand.sender);
    }
    return;
  }

  void rejectUnauthorizedCommand(bot, chatCommand.sender, chatCommand.text);
}

function isAuthPrompt(lowerMessage) {
  return (
    lowerMessage.includes('/login') ||
    lowerMessage.includes('войдите') ||
    lowerMessage.includes('введите пароль') ||
    lowerMessage.includes('зарегистриру') ||
    lowerMessage.includes('register') ||
    lowerMessage.includes('авторизация:')
  );
}

function isAuthSuccess(lowerMessage) {
  return (
    lowerMessage.includes('автоматически авториз') ||
    lowerMessage.includes('уже авториз') ||
    lowerMessage.includes('успешно авториз') ||
    lowerMessage.includes('успешно вош') ||
    lowerMessage.includes('logged in') ||
    lowerMessage.includes('login successful')
  );
}

async function ensureAuthenticated(bot) {
  if (!loginSent) {
    await sendLoginCommand(bot);
  }

  const timeoutMs = 15000;
  const startedAt = Date.now();
  botState = 'authenticating';

  while (authRequested && !authCompleted) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Authorization timeout expired.');
    }

    await sleep(500);
  }

  if (authCompleted) {
    console.log('[auth] Continuing after successful authorization.');
  }
}

async function sendLoginCommand(bot) {
  loginSent = true;
  botState = 'sending_login';
  console.log('[auth] Sending /login command.');
  bot.chat(`/login ${config.loginPassword}`);
  await sleep(1500);
}

function parseChatCommand(message) {
  const match = message.match(/^([^:]{1,32}):\s*(.+)$/);
  if (!match) {
    return null;
  }

  return {
    sender: match[1].trim(),
    text: match[2].trim()
  };
}

function isSupportedCommand(text) {
  return containsCommand(text, 'бот, к ноге') || containsCommand(text, 'статус');
}

function containsCommand(text, commandText) {
  return text.toLowerCase().includes(commandText.toLowerCase());
}

function isAuthorizedSender(sender) {
  return config.commandOwners.has(sender.toLowerCase());
}

async function sendTpa(bot, sender) {
  if (botState !== 'afk') {
    console.log(`[cmd] Ignoring "бот, к ноге" while state is ${botState}.`);
    return;
  }

  console.log(`[cmd] TPA request command received from ${sender}.`);
  bot.chat(`/tpa ${sender}`);
}

async function sendStatusToChat(bot, sender) {
  const hp = Number.isFinite(bot.health) ? bot.health.toFixed(1) : 'n/a';
  const food = Number.isFinite(bot.food) ? bot.food.toString() : 'n/a';
  const message = `HP: ${hp}, Food: ${food}, State: ${botState}`;
  console.log(`[cmd] Status requested by ${sender}: ${message}.`);
  bot.chat(message);
}

async function rejectUnauthorizedCommand(bot, sender, text) {
  console.log(`[cmd] Unauthorized command from ${sender}: ${text}.`);
  bot.chat('кукиш тебе, врунишка');
}

function findBestNpcEntity(bot, position, maxDistance) {
  let bestEntity = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const entity of Object.values(bot.entities)) {
    if (!entity.position || entity === bot.entity) {
      continue;
    }

    const distance = entity.position.distanceTo(position);
    if (distance > maxDistance) {
      continue;
    }

    const priority = getNpcEntityPriority(entity);
    if (priority === Number.POSITIVE_INFINITY) {
      continue;
    }

    const score = (priority * 100) + distance;
    if (score < bestScore) {
      bestEntity = entity;
      bestScore = score;
    }
  }

  return bestEntity;
}

function getNpcEntityPriority(entity) {
  const type = String(entity.type || '').toLowerCase();
  const name = String(entity.name || '').toLowerCase();

  if (type === 'player') {
    return 1;
  }

  if (type === 'mob' || type === 'object') {
    return 2;
  }

  if (name.includes('interaction')) {
    return 3;
  }

  if (name.includes('display') || type.includes('display')) {
    return 50;
  }

  return 10;
}

async function maybeEat(bot, reason) {
  if (isEating || !bot.entity) {
    return;
  }

  const lowHealth = Number.isFinite(bot.health) && bot.health < config.autoEatHealthThreshold;
  const lowFood = Number.isFinite(bot.food) && bot.food < config.autoEatFoodThreshold;

  if (!lowHealth && !lowFood) {
    return;
  }

  const foodItem = bot.inventory.items().find((item) => item.name === config.autoEatItem);
  if (!foodItem) {
    console.warn(
      `[eat] Need food because of ${reason} (hp ${formatStat(bot.health)}, food ${formatStat(bot.food)}), but ${config.autoEatItem} was not found.`
    );
    return;
  }

  isEating = true;

  try {
    console.log(
      `[eat] Triggered by ${reason}. hp ${formatStat(bot.health)}, food ${formatStat(bot.food)}. Eating ${foodItem.name}.`
    );
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    console.log(`[eat] Finished eating. hp ${formatStat(bot.health)}, food ${formatStat(bot.food)}.`);
  } catch (error) {
    console.error(`[eat] ${error.message}`);
  } finally {
    isEating = false;
  }
}

function formatStat(value) {
  return Number.isFinite(value) ? value.toString() : 'n/a';
}

function parseOwners(value) {
  return new Set(
    value
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function facePosition(bot, position) {
  const eyes = bot.entity.position.offset(0, bot.entity.height, 0);
  const delta = position.minus(eyes);
  const yaw = Math.atan2(-delta.x, -delta.z);
  const groundDistance = Math.sqrt((delta.x * delta.x) + (delta.z * delta.z));
  const pitch = -Math.atan2(delta.y, groundDistance);
  await bot.look(yaw, pitch, true);
}

function parseVec3(value) {
  if (!value) {
    return null;
  }

  const parts = value.split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error('LOBBY_NPC_POS must look like "12.5,64,-30.5".');
  }

  return new Vec3(parts[0], parts[1], parts[2]);
}

function formatVec(vec) {
  return `${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  if (config.debug) {
    console.log(`[debug] ${message}`);
  }
}

process.on('SIGINT', () => {
  stopAntiAfk();
  stopStatusUpdates();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  if (currentBot) {
    currentBot.quit('Stopped');
  }

  process.exit(0);
});
