'use strict';

require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env.mayday' });

const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');
const { createMapCaptchaHandler } = require('./map-captcha');

const config = {
  host: process.env.MC_HOST || 'CHANGE_ME',
  port: Number.parseInt(process.env.MC_PORT || '25565', 10),
  username: process.env.MC_USERNAME || 'CHANGE_ME',
  version: process.env.MC_VERSION || false,
  loginPassword: process.env.LOGIN_PASSWORD || '',
  commandOwner: (process.env.COMMAND_OWNER || 'CHANGE_ME').trim(),
  maydayPhrase: (process.env.MAYDAY_PHRASE || 'mayday').trim().toLowerCase(),
  spawnWaitMs: Number.parseInt(process.env.SPAWN_WAIT_MS || '7000', 10),
  spawnWaitJitterMs: Number.parseInt(process.env.SPAWN_WAIT_JITTER_MS || '900', 10),
  reconnectDelayMs: Number.parseInt(process.env.RECONNECT_DELAY_MS || '15000', 10),
  reconnectDelayJitterMs: Number.parseInt(process.env.RECONNECT_DELAY_JITTER_MS || '2500', 10),
  approachDistance: Number.parseFloat(process.env.NPC_APPROACH_DISTANCE || '3.2'),
  punchDelayMs: Number.parseInt(process.env.NPC_PUNCH_DELAY_MS || '700', 10),
  punchDelayJitterMs: Number.parseInt(process.env.NPC_PUNCH_DELAY_JITTER_MS || '250', 10),
  antiAfkIntervalMs: Number.parseInt(process.env.ANTI_AFK_INTERVAL_MS || '45000', 10),
  antiAfkIntervalJitterMs: Number.parseInt(process.env.ANTI_AFK_INTERVAL_JITTER_MS || '12000', 10),
  statusIntervalMs: Number.parseInt(process.env.STATUS_INTERVAL_MS || '15000', 10),
  mapCaptchaEnabled: process.env.MAP_CAPTCHA_ENABLED !== '0',
  mapCaptchaDir: process.env.MAP_CAPTCHA_DIR || 'captcha-maps',
  mapCaptchaChatPrefix: process.env.MAP_CAPTCHA_CHAT_PREFIX || '/captcha ',
  mapCaptchaAutoOpen: process.env.MAP_CAPTCHA_AUTO_OPEN !== '0',
  lobbyNpcPos: parseVec3(process.env.LOBBY_NPC_POS),
  buttonStandPos: parseVec3(process.env.BUTTON_STAND_POS),
  buttonPos: parseVec3(process.env.BUTTON_POS),
  standFacingYawDeg: Number.parseFloat(process.env.STAND_FACING_YAW_DEG || '0'),
  buttonAimOffset: parseVec3(process.env.BUTTON_AIM_OFFSET || '0.5,0.5,0.9375'),
  debug: process.env.DEBUG === '1'
};

let reconnectTimer = null;
let antiAfkTimer = null;
let statusTimer = null;
let currentBot = null;
let currentSessionId = 0;
let botState = 'booting';
let authRequested = false;
let authCompleted = false;
let loginSent = false;
let lobbySpawnPos = null;
let isTransitioning = false;
let isPressingButton = false;
let isPositioning = false;
let buttonStandReady = false;
const mapCaptcha = createMapCaptchaHandler(config);

if (config.host === 'CHANGE_ME' || config.username === 'CHANGE_ME' || config.commandOwner === 'CHANGE_ME') {
  console.error('Set MC_HOST, MC_USERNAME and COMMAND_OWNER before starting mayday bot.');
  process.exit(1);
}

createBot();

function createBot() {
  clearReconnect();
  resetState();
  currentSessionId += 1;
  const sessionId = currentSessionId;

  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version
  });

  currentBot = bot;
  console.log(`[boot] Connecting to ${config.host}:${config.port} as ${config.username}.`);

  bot.once('spawn', () => {
    botState = 'spawned';
    console.log(`[spawn] Bot spawned at ${formatVec(bot.entity.position)}.`);
    startStatusLoop(bot);
    runEntryFlow(bot, sessionId).catch((error) => {
      if (sessionId !== currentSessionId) {
        return;
      }

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

  if (config.mapCaptchaEnabled) {
    bot._client.on('map', (packet) => {
      mapCaptcha.handleMapPacket(bot, packet).catch((error) => {
        console.error(`[captcha] ${error.message}`);
      });
    });
  }

  bot.on('message', (jsonMsg) => {
    const message = jsonMsg.toString().trim();
    if (message) {
      console.log(`[chat] ${message}`);
      handleServerMessage(bot, message);
    }
  });

  bot.on('kicked', (reason) => {
    console.error(`[kick] ${formatReason(reason)}`);
  });

  bot.on('error', (error) => {
    console.error(`[error] ${error.message}`);
  });

  bot.on('forcedMove', () => {
    if (bot.entity) {
      console.log(`[move] Server moved bot to ${formatVec(bot.entity.position)}.`);
    }
  });

  bot.on('end', () => {
    if (sessionId === currentSessionId) {
      currentSessionId += 1;
    }

    stopAntiAfk();
    stopStatusLoop();
    botState = 'disconnected';
    console.log('[end] Connection closed.');
    scheduleReconnect();
  });
}

function resetState() {
  authRequested = false;
  authCompleted = false;
  loginSent = false;
  lobbySpawnPos = null;
  isTransitioning = false;
  isPressingButton = false;
  isPositioning = false;
  buttonStandReady = false;
  botState = 'connecting';
}

async function runEntryFlow(bot, sessionId) {
  const waitMs = jitter(config.spawnWaitMs, config.spawnWaitJitterMs, 2000);
  console.log(`[flow] Waiting ${waitMs}ms for anti-bot check.`);
  botState = 'waiting_antibot';
  await sleep(waitMs);
  ensureSessionActive(sessionId);

  if (!bot.entity || !bot.entity.position) {
    throw new Error('Bot entity is not available after spawn.');
  }

  lobbySpawnPos = bot.entity.position.clone();
  console.log(`[flow] Lobby reference position saved as ${formatVec(lobbySpawnPos)}.`);

  if (authRequested && !authCompleted) {
    console.log('[auth] Authorization is required before movement.');
    await ensureAuthenticated(bot, sessionId);
  }

  if (config.lobbyNpcPos) {
    botState = 'moving_to_npc';
    console.log(`[flow] Starting walk to lobby NPC at ${formatVec(config.lobbyNpcPos)}.`);
    await moveNear(bot, config.lobbyNpcPos, config.approachDistance, 'the NPC', sessionId);
    await sleep(jitter(config.punchDelayMs, config.punchDelayJitterMs, 1200));
    ensureSessionActive(sessionId);
    botState = 'attacking_npc';
    await joinServerViaNpc(bot, config.lobbyNpcPos, sessionId);
  }

  await moveToStandPosition(bot, sessionId);
  botState = 'armed';
  console.log(`[guard] Ready. Waiting for "${config.maydayPhrase}" from ${config.commandOwner}.`);
  startAntiAfk(bot);
}

async function moveNear(bot, targetPos, stopDistance, label, sessionId) {
  console.log(`[move] Moving toward ${formatVec(targetPos)} until distance <= ${stopDistance}.`);
  const start = Date.now();
  let lastReportAt = 0;

  while (bot.entity.position.distanceTo(targetPos) > stopDistance) {
    ensureSessionActive(sessionId);

    if (Date.now() - start > 15000) {
      bot.setControlState('forward', false);
      throw new Error(`Timed out while walking to ${label}.`);
    }

    await facePosition(bot, targetPos);
    bot.setControlState('forward', true);

    if (Date.now() - lastReportAt >= 1000) {
      const distance = bot.entity.position.distanceTo(targetPos);
      console.log(`[move] Position ${formatVec(bot.entity.position)}, distance ${distance.toFixed(2)}.`);
      lastReportAt = Date.now();
    }

    await sleep(100);
  }

  bot.setControlState('forward', false);
  await facePosition(bot, targetPos);
  console.log(`[move] Reached target range at ${formatVec(bot.entity.position)}.`);
}

async function joinServerViaNpc(bot, targetPos, sessionId) {
  isTransitioning = true;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    ensureSessionActive(sessionId);
    console.log(`[attack] NPC join attempt ${attempt}/4.`);
    await hitLobbyNpc(bot, targetPos);

    if (await waitForServerTransition(bot, 8000, sessionId)) {
      isTransitioning = false;
      return;
    }

    if (attempt < 4) {
      console.warn('[attack] No server transition after attack, retrying.');
      await sleep(jitter(1200, 450, 2500));
      await moveNear(bot, targetPos, config.approachDistance, 'the NPC', sessionId);
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

async function moveToStandPosition(bot, sessionId) {
  if (!config.buttonStandPos || !config.buttonPos) {
    console.warn('[guard] BUTTON_STAND_POS or BUTTON_POS is not set. Bot will stay where it is.');
    buttonStandReady = false;
    return;
  }

  isPositioning = true;
  botState = 'positioning';
  console.log(`[guard] Moving to stand position ${formatVec(config.buttonStandPos)}.`);
  await moveNear(bot, config.buttonStandPos, 0.8, 'the button stand position', sessionId);
  await faceStandDirection(bot);
  buttonStandReady = true;
  isPositioning = false;
  console.log(`[guard] Stand position reached at ${formatVec(bot.entity.position)}.`);
}

async function pressButton(bot, sender) {
  if (!buttonStandReady) {
    console.log('[guard] Button is not armed because stand position is not ready.');
    return;
  }

  if (isPressingButton || isPositioning) {
    console.log(`[guard] Ignoring mayday from ${sender}, action already in progress.`);
    return;
  }

  isPressingButton = true;
  botState = 'pressing';

  try {
    if (config.buttonStandPos && bot.entity.position.distanceTo(config.buttonStandPos) > 1.2) {
      console.log('[guard] Bot moved away from stand position, returning first.');
      await moveToStandPosition(bot, currentSessionId);
    }

    await faceButton(bot);
    const buttonBlock = bot.blockAt(config.buttonPos.floored());
    if (!buttonBlock) {
      throw new Error(`No block found at ${formatVec(config.buttonPos)}.`);
    }

    console.log(`[guard] MAYDAY from ${sender}. Pressing ${buttonBlock.name} at ${formatVec(config.buttonPos)}.`);
    await withTimeout(currentBot.activateBlock(buttonBlock), 3000, 'Button press timed out.');
    console.log('[guard] Button press packet sent.');
    await sleep(jitter(300, 120, 800));
    await faceStandDirection(bot);
  } catch (error) {
    console.error(`[guard] ${error.message}`);
  } finally {
    isPressingButton = false;
    botState = 'armed';
  }
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

  if (chatCommand.sender.toLowerCase() !== config.commandOwner.toLowerCase()) {
    return;
  }

  if (chatCommand.text.trim().toLowerCase().includes('бот, к ноге')) {
    void sendTpa(bot, chatCommand.sender);
    return;
  }

  if (chatCommand.text.trim().toLowerCase() === config.maydayPhrase) {
    void pressButton(bot, chatCommand.sender);
  }
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

async function ensureAuthenticated(bot, sessionId) {
  if (!loginSent) {
    await sendLoginCommand(bot);
  }

  const startedAt = Date.now();
  botState = 'authenticating';

  while (authRequested && !authCompleted) {
    ensureSessionActive(sessionId);

    if (Date.now() - startedAt > 15000) {
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

async function sendTpa(bot, sender) {
  if (botState !== 'armed') {
    console.log(`[cmd] Ignoring "бот, к ноге" while state is ${botState}.`);
    return;
  }

  console.log(`[cmd] TPA request command received from ${sender}.`);
  bot.chat(`/tpa ${sender}`);
}

async function waitForServerTransition(bot, timeoutMs, sessionId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    ensureSessionActive(sessionId);

    if (!bot.entity || !bot.entity.position) {
      return false;
    }

    const movedFromLobbySpawn = lobbySpawnPos ? bot.entity.position.distanceTo(lobbySpawnPos) > 12 : false;
    const movedAwayFromNpc = config.lobbyNpcPos ? bot.entity.position.distanceTo(config.lobbyNpcPos) > 12 : false;

    if (movedFromLobbySpawn && movedAwayFromNpc) {
      console.log(`[flow] Transition confirmed at ${formatVec(bot.entity.position)}.`);
      return true;
    }

    await sleep(250);
  }

  return false;
}

function startAntiAfk(bot) {
  stopAntiAfk();
  console.log(`[anti-afk] Active, base interval ${config.antiAfkIntervalMs}ms.`);
  scheduleNextAntiAfk(bot);
}

function stopAntiAfk() {
  if (antiAfkTimer) {
    clearTimeout(antiAfkTimer);
    antiAfkTimer = null;
    console.log('[anti-afk] Stopped.');
  }
}

function scheduleNextAntiAfk(bot) {
  stopAntiAfk();
  const nextDelayMs = jitter(config.antiAfkIntervalMs, config.antiAfkIntervalJitterMs, 5000);
  antiAfkTimer = setTimeout(async () => {
    if (!bot.entity) {
      scheduleNextAntiAfk(bot);
      return;
    }

    try {
      if (!isPressingButton && !isPositioning) {
        const yawJitter = (Math.random() - 0.5) * 0.2;
        const pitchJitter = (Math.random() - 0.5) * 0.1;
        await bot.look(bot.entity.yaw + yawJitter, bot.entity.pitch + pitchJitter, true);
      }

      console.log(`[anti-afk] Look update at ${formatVec(bot.entity.position)}. Next in ${nextDelayMs}ms.`);
    } catch (error) {
      console.error(`[anti-afk] ${error.message}`);
    } finally {
      scheduleNextAntiAfk(bot);
    }
  }, nextDelayMs);
}

function startStatusLoop(bot) {
  stopStatusLoop();
  console.log(`[status] Periodic status every ${config.statusIntervalMs}ms.`);
  statusTimer = setInterval(() => {
    if (!bot.entity) {
      return;
    }

    console.log(
      `[status] State ${botState}, pos ${formatVec(bot.entity.position)}, ready ${buttonStandReady}, hp ${safeStat(bot.health)}, food ${safeStat(bot.food)}.`
    );
  }, config.statusIntervalMs);
}

function stopStatusLoop() {
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

  const delayMs = jitter(config.reconnectDelayMs, config.reconnectDelayJitterMs, 60000);
  console.log(`[reconnect] Reconnecting in ${delayMs}ms.`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createBot();
  }, delayMs);
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
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

async function facePosition(bot, position) {
  const eyes = bot.entity.position.offset(0, bot.entity.height, 0);
  const delta = position.minus(eyes);
  const yaw = Math.atan2(-delta.x, -delta.z);
  const groundDistance = Math.sqrt((delta.x * delta.x) + (delta.z * delta.z));
  const pitch = -Math.atan2(delta.y, groundDistance);
  await bot.look(yaw, pitch, true);
}

async function faceStandDirection(bot) {
  const yawRadians = (config.standFacingYawDeg * Math.PI) / 180;
  await bot.look(yawRadians, 0, true);
  log(`[debug] Facing stand yaw ${config.standFacingYawDeg}.`);
}

async function faceButton(bot) {
  const target = config.buttonPos.plus(config.buttonAimOffset);
  await facePosition(bot, target);
  console.log(`[guard] Aiming at button face ${formatVec(target)}.`);
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

function parseVec3(value) {
  if (!value) {
    return null;
  }

  const parts = value.split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error('Vector env values must look like "12.5,64,-30.5".');
  }

  return new Vec3(parts[0], parts[1], parts[2]);
}

function safeStat(value) {
  return Number.isFinite(value) ? value.toFixed(1) : 'n/a';
}

function formatVec(vec) {
  return `${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)}`;
}

function formatReason(reason) {
  if (typeof reason === 'string') {
    return reason;
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function jitter(baseMs, jitterMs, minMs = 0) {
  const range = Math.max(0, jitterMs);
  const value = baseMs + ((Math.random() * 2 - 1) * range);
  return Math.max(minMs, Math.round(value));
}

function ensureSessionActive(sessionId) {
  if (sessionId !== currentSessionId) {
    throw new Error('Session replaced by reconnect.');
  }
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    sleep(timeoutMs).then(() => {
      throw new Error(message);
    })
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  if (config.debug) {
    console.log(message);
  }
}

process.on('SIGINT', () => {
  stopAntiAfk();
  stopStatusLoop();
  clearReconnect();

  if (currentBot) {
    currentBot.quit('Stopped');
  }

  mapCaptcha.close();

  process.exit(0);
});
