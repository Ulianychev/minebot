'use strict';

require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env.gold' });

const fs = require('fs');
const { execFile } = require('child_process');
const mineflayer = require('mineflayer');
const path = require('path');
const readline = require('readline');
const { PNG } = require('pngjs');
const { Vec3 } = require('vec3');

const config = {
  host: process.env.MC_HOST || 'CHANGE_ME',
  port: Number.parseInt(process.env.MC_PORT || '25565', 10),
  username: process.env.MC_USERNAME || 'AFKgoodbot2',
  version: process.env.MC_VERSION || false,
  loginPassword: process.env.LOGIN_PASSWORD || '',
  commandOwner: (process.env.COMMAND_OWNER || 'CHANGE_ME').trim(),
  summonCommand: (process.env.SUMMON_COMMAND || 'gold').trim().toLowerCase(),
  stopCommand: (process.env.STOP_COMMAND || 'стоп').trim().toLowerCase(),
  walkCommand: (process.env.WALK_COMMAND || 'walk').trim().toLowerCase(),
  followCommand: (process.env.FOLLOW_COMMAND || 'follow').trim().toLowerCase(),
  swordCommand: (process.env.SWORD_COMMAND || 'меч').trim().toLowerCase(),
  swordItem: process.env.SWORD_ITEM || 'netherite_sword',
  swordHotbarSlot: clampInteger(Number.parseInt(process.env.SWORD_HOTBAR_SLOT || '0', 10), 0, 8),
  spawnWaitMs: Number.parseInt(process.env.SPAWN_WAIT_MS || '7000', 10),
  spawnWaitJitterMs: Number.parseInt(process.env.SPAWN_WAIT_JITTER_MS || '900', 10),
  reconnectDelayMs: Number.parseInt(process.env.RECONNECT_DELAY_MS || '15000', 10),
  reconnectDelayJitterMs: Number.parseInt(process.env.RECONNECT_DELAY_JITTER_MS || '2500', 10),
  statusIntervalMs: Number.parseInt(process.env.STATUS_INTERVAL_MS || '15000', 10),
  attackIntervalTicks: Number.parseInt(process.env.ATTACK_INTERVAL_TICKS || '50', 10),
  attackIntervalJitterTicks: Number.parseInt(process.env.ATTACK_INTERVAL_JITTER_TICKS || '8', 10),
  attackExtraPauseChance: Number.parseFloat(process.env.ATTACK_EXTRA_PAUSE_CHANCE || '0.18'),
  attackExtraPauseMinTicks: Number.parseInt(process.env.ATTACK_EXTRA_PAUSE_MIN_TICKS || '6', 10),
  attackExtraPauseMaxTicks: Number.parseInt(process.env.ATTACK_EXTRA_PAUSE_MAX_TICKS || '16', 10),
  attackTargetRange: Number.parseFloat(process.env.ATTACK_TARGET_RANGE || '3.5'),
  attackStartDelayMs: Number.parseInt(process.env.ATTACK_START_DELAY_MS || '1200', 10),
  autoEatItem: process.env.AUTO_EAT_ITEM || 'cooked_porkchop',
  autoEatFoodThreshold: Number.parseInt(process.env.AUTO_EAT_FOOD_THRESHOLD || '3', 10),
  autoEatHealthThreshold: Number.parseFloat(process.env.AUTO_EAT_HEALTH_THRESHOLD || '8'),
  autoEatCheckIntervalMs: Number.parseInt(process.env.AUTO_EAT_CHECK_INTERVAL_MS || '4000', 10),
  autoEatTimeoutMs: Number.parseInt(process.env.AUTO_EAT_TIMEOUT_MS || '9000', 10),
  antiAfkIntervalMs: Number.parseInt(process.env.ANTI_AFK_INTERVAL_MS || '45000', 10),
  antiAfkIntervalJitterMs: Number.parseInt(process.env.ANTI_AFK_INTERVAL_JITTER_MS || '12000', 10),
  mapCaptchaEnabled: process.env.MAP_CAPTCHA_ENABLED !== '0',
  mapCaptchaDir: process.env.MAP_CAPTCHA_DIR || 'captcha-maps',
  mapCaptchaChatPrefix: process.env.MAP_CAPTCHA_CHAT_PREFIX || '/captcha ',
  approachDistance: Number.parseFloat(process.env.NPC_APPROACH_DISTANCE || '3.2'),
  punchDelayMs: Number.parseInt(process.env.NPC_PUNCH_DELAY_MS || '700', 10),
  punchDelayJitterMs: Number.parseInt(process.env.NPC_PUNCH_DELAY_JITTER_MS || '250', 10),
  lobbyNpcPos: parseVec3(process.env.LOBBY_NPC_POS),
  walkTargetPos: parseVec3(process.env.WALK_TARGET_POS),
  followDistance: Number.parseFloat(process.env.FOLLOW_DISTANCE || '1.4'),
  debug: process.env.DEBUG === '1'
};

let currentBot = null;
let reconnectTimer = null;
let statusTimer = null;
let antiAfkTimer = null;
let attackTimer = null;
let followTimer = null;
let autoEatTimer = null;
let currentSessionId = 0;
let botState = 'booting';
let authRequested = false;
let authCompleted = false;
let loginSent = false;
let lobbyHandled = false;
let lobbyRejoinInProgress = false;
let lobbySpawnPos = null;
let pendingOwner = null;
let pendingTeleportUntil = 0;
let pendingArmTimer = null;
let lastValidPosition = null;
let shouldResumeGold = false;
let isEating = false;
let lastGoldOwner = config.commandOwner;
const mapCaptchas = new Map();
let captchaPromptActive = false;
let pendingCaptchaBot = null;
let pendingCaptchaFilePath = null;
let readlineInterface = null;
const MAP_SHADES = [180, 220, 255, 135];
const MAP_BASE_COLORS = [
  [0, 0, 0],
  [127, 178, 56],
  [247, 233, 163],
  [199, 199, 199],
  [255, 0, 0],
  [160, 160, 255],
  [167, 167, 167],
  [0, 124, 0],
  [255, 255, 255],
  [164, 168, 184],
  [151, 109, 77],
  [112, 112, 112],
  [64, 64, 255],
  [143, 119, 72],
  [255, 252, 245],
  [216, 127, 51],
  [178, 76, 216],
  [102, 153, 216],
  [229, 229, 51],
  [127, 204, 25],
  [242, 127, 165],
  [76, 76, 76],
  [153, 153, 153],
  [76, 127, 153],
  [127, 63, 178],
  [51, 76, 178],
  [102, 76, 51],
  [102, 127, 51],
  [153, 51, 51],
  [25, 25, 25],
  [250, 238, 77],
  [92, 219, 213],
  [74, 128, 255],
  [0, 217, 58],
  [129, 86, 49],
  [112, 2, 0],
  [209, 177, 161],
  [159, 82, 36],
  [149, 87, 108],
  [112, 108, 138],
  [186, 133, 36],
  [103, 117, 53],
  [160, 77, 78],
  [57, 41, 35],
  [135, 107, 98],
  [87, 92, 92],
  [122, 73, 88],
  [76, 62, 92],
  [76, 50, 35],
  [76, 82, 42],
  [142, 60, 46],
  [37, 22, 16],
  [189, 48, 49],
  [148, 63, 97],
  [92, 25, 29],
  [22, 126, 134],
  [58, 142, 140],
  [86, 44, 62],
  [20, 180, 133],
  [100, 100, 100],
  [216, 175, 147],
  [127, 167, 150]
];

if (config.host === 'CHANGE_ME' || config.commandOwner === 'CHANGE_ME') {
  console.error('Set MC_HOST and COMMAND_OWNER before starting gold bot.');
  process.exit(1);
}

if (!config.lobbyNpcPos) {
  console.error('Set LOBBY_NPC_POS before starting gold bot.');
  process.exit(1);
}

startConsoleInterface();
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
    updateLastValidPosition(bot);
    console.log(`[spawn] Bot spawned at ${formatPosition(bot)}.`);
    startStatusLoop(bot);
    startAutoEatLoop(bot);
    void runLobbyFlow(bot, sessionId).catch((error) => {
      console.error(`[flow] ${error.message}`);
    });
  });

  bot.on('login', () => {
    console.log('[login] Session established.');
  });

  bot.on('inject_allowed', () => {
    console.log('[net] Protocol injected, waiting for game data.');
  });

  if (config.mapCaptchaEnabled) {
    bot._client.on('map', (packet) => {
      handleMapPacket(bot, packet).catch((error) => {
        console.error(`[captcha] ${error.message}`);
      });
    });
  }

  bot.on('message', (jsonMsg) => {
    const message = jsonMsg.toString().trim();
    if (!message) {
      return;
    }

    console.log(`[chat] ${message}`);
    handleChatMessage(bot, message, sessionId);
  });

  bot.on('messagestr', (message) => {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    console.log(`[chat] ${trimmed}`);
  });

  bot.on('forcedMove', () => {
    updateLastValidPosition(bot);
    console.log(`[move] Server moved bot to ${formatPosition(bot)}.`);

    if (isProbablyBackInLobby(bot) && (botState === 'active' || botState === 'arming')) {
      requestLobbyRejoin(bot, sessionId, 'forced move to lobby position');
      return;
    }

    if (
      pendingOwner &&
      Date.now() <= pendingTeleportUntil &&
      botState === 'summoning'
    ) {
      void startGoldRoutine(bot, pendingOwner, sessionId).catch((error) => {
        console.error(`[gold] ${error.message}`);
      });
    }
  });

  bot.on('move', () => {
    updateLastValidPosition(bot);
  });

  bot.on('health', () => {
    void maybeEat(bot, 'health');
  });

  bot.on('food', () => {
    void maybeEat(bot, 'food');
  });

  bot.on('playerCollect', (collector) => {
    if (collector?.id === bot.entity?.id) {
      setTimeout(() => {
        void maybeEat(bot, 'pickup');
      }, 500);
    }
  });

  bot.on('kicked', (reason) => {
    const formattedReason = formatReason(reason);
    console.error(`[kick] ${formattedReason}`);

    if (isUnfairAdvantageKick(formattedReason)) {
      shouldResumeGold = shouldResumeGold || botState === 'active' || botState === 'arming';
      console.warn(`[kick] Unfair advantage kick detected. Gold resume: ${shouldResumeGold ? 'yes' : 'no'}.`);
      scheduleReconnect(1000);
    }
  });

  bot.on('error', (error) => {
    console.error(`[error] ${error.message}`);
  });

  bot.on('end', () => {
    if (sessionId === currentSessionId) {
      currentSessionId += 1;
    }

    stopLoops();
    botState = 'disconnected';
    console.log('[end] Connection closed.');
    scheduleReconnect();
  });
}

function resetState() {
  authRequested = false;
  authCompleted = false;
  loginSent = false;
  lobbyHandled = false;
  lobbyRejoinInProgress = false;
  lobbySpawnPos = null;
  pendingOwner = null;
  pendingTeleportUntil = 0;
  clearPendingArmTimer();
  lastValidPosition = null;
  isEating = false;
  botState = 'connecting';
}

async function runLobbyFlow(bot, sessionId) {
  if (lobbyHandled) {
    return;
  }

  lobbyHandled = true;
  botState = 'waiting_antibot';
  const spawnWaitMs = jitter(config.spawnWaitMs, config.spawnWaitJitterMs, 2000);
  console.log(`[flow] Waiting ${spawnWaitMs}ms for anti-bot check.`);
  await sleep(spawnWaitMs);
  ensureSessionActive(sessionId);

  if (!bot.entity) {
    throw new Error('Bot entity is not available after spawn.');
  }

  lobbySpawnPos = getSafePosition(bot).clone();
  console.log(`[flow] Lobby reference position saved as ${formatVec(lobbySpawnPos)}.`);

  if (authRequested && !authCompleted) {
    console.log('[auth] Authorization is required before movement.');
    await ensureAuthenticated(bot, sessionId);
  }

  botState = 'moving_to_npc';
  console.log(`[flow] Starting walk to lobby NPC at ${formatVec(config.lobbyNpcPos)}.`);
  await moveNear(bot, config.lobbyNpcPos, config.approachDistance, sessionId);
  await sleep(jitter(config.punchDelayMs, config.punchDelayJitterMs, 250));
  ensureSessionActive(sessionId);
  botState = 'attacking_npc';
  await joinServerViaNpc(bot, config.lobbyNpcPos, sessionId);

  console.log('[flow] Server transition detected. Waiting for summon command.');
  botState = 'idle';
  startAntiAfk(bot);

  if (shouldResumeGold) {
    console.log('[gold] Resume requested after reconnect. Restarting attack routine.');
    await armGoldAtCurrentPosition(bot, lastGoldOwner, sessionId, 'reconnect');
  }

  lobbyRejoinInProgress = false;
}

function requestLobbyRejoin(bot, sessionId, reason) {
  if (lobbyRejoinInProgress) {
    return;
  }

  if (sessionId !== currentSessionId || !bot.entity) {
    return;
  }

  shouldResumeGold = shouldResumeGold || botState === 'active' || botState === 'arming';
  lobbyRejoinInProgress = true;
  lobbyHandled = false;
  stopAttackLoop();
  stopFollowLoop(bot);
  stopAntiAfk();
  bot.setControlState('forward', false);
  bot.setControlState('jump', false);
  bot.setControlState('sneak', false);
  console.warn(`[flow] Returned to lobby after server kick (${reason}). Rejoining through NPC. Gold resume: ${shouldResumeGold ? 'yes' : 'no'}.`);

  void runLobbyFlow(bot, sessionId).catch((error) => {
    if (sessionId !== currentSessionId) {
      return;
    }

    lobbyRejoinInProgress = false;
    console.error(`[flow] ${error.message}`);
  });
}

function handleChatMessage(bot, message, sessionId) {
  const lower = message.toLowerCase();

  if (isSurvivalKickMessage(lower)) {
    requestLobbyRejoin(bot, sessionId, message);
    return;
  }

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
      void sendLoginCommand(bot, sessionId);
    }
  }

  const chatCommand = parseChatCommand(message);
  if (!chatCommand) {
    return;
  }

  if (chatCommand.sender.toLowerCase() !== config.commandOwner.toLowerCase()) {
    return;
  }

  const normalizedText = chatCommand.text.trim().toLowerCase();
  if (normalizedText === config.stopCommand) {
    cancelCurrentAction(bot, chatCommand.sender);
    return;
  }

  if (normalizedText === config.walkCommand) {
    void moveToConfiguredPoint(bot, chatCommand.sender, sessionId);
    return;
  }

  if (normalizedText === config.followCommand) {
    startFollowOwner(bot, chatCommand.sender, sessionId);
    return;
  }

  if (normalizedText === config.swordCommand) {
    void equipConfiguredSword(bot, chatCommand.sender, sessionId);
    return;
  }

  if (
    normalizedText === config.summonCommand ||
    normalizedText.includes('бот, к ноге')
  ) {
    void summonToOwner(bot, chatCommand.sender, sessionId);
  }
}

function startConsoleInterface() {
  const rl = ensureReadlineInterface();
  console.log('[console] Commands: gold/start, stop, status, tpa, walk, follow, sword, help.');
  rl.prompt();
}

function ensureReadlineInterface() {
  if (readlineInterface) {
    return readlineInterface;
  }

  readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  readlineInterface.on('line', (line) => {
    handleConsoleLine(line);
    readlineInterface.prompt();
  });

  return readlineInterface;
}

function handleConsoleLine(line) {
  const trimmed = line.trim();

  if (captchaPromptActive) {
    submitConsoleCaptcha(trimmed);
    return;
  }

  if (!trimmed) {
    return;
  }

  const command = trimmed.toLowerCase();
  if (command === 'help') {
    console.log('[console] gold/start - start gold attack at current position.');
    console.log('[console] stop - stop current action.');
    console.log('[console] status - print state, position, hp and food.');
    console.log('[console] tpa - send /tpa to COMMAND_OWNER.');
    console.log('[console] walk/follow/sword - same as chat commands for owner.');
    return;
  }

  if (!currentBot?.entity) {
    console.warn('[console] Bot is not spawned yet.');
    return;
  }

  const sessionId = currentSessionId;
  if (command === 'gold' || command === 'start') {
    void startGoldFromConsole(currentBot, sessionId);
    return;
  }

  if (command === 'stop') {
    cancelCurrentAction(currentBot, 'console');
    return;
  }

  if (command === 'status') {
    console.log(
      `[console] State ${botState}, pos ${formatPosition(currentBot)}, hp ${formatStat(currentBot.health)}, food ${formatStat(currentBot.food)}, sneaking ${currentBot.controlState.sneak}.`
    );
    return;
  }

  if (command === 'tpa') {
    void summonToOwner(currentBot, config.commandOwner, sessionId);
    return;
  }

  if (command === 'walk') {
    void moveToConfiguredPoint(currentBot, 'console', sessionId);
    return;
  }

  if (command === 'follow') {
    startFollowOwner(currentBot, config.commandOwner, sessionId);
    return;
  }

  if (command === 'sword') {
    void equipConfiguredSword(currentBot, 'console', sessionId);
    return;
  }

  console.warn(`[console] Unknown command "${trimmed}". Type "help".`);
}

async function startGoldFromConsole(bot, sessionId) {
  if (botState === 'active' || botState === 'arming') {
    console.log(`[console] Gold routine is already ${botState}.`);
    return;
  }

  if (botState !== 'idle') {
    console.log(`[console] Cannot start gold while state is ${botState}. Wait for idle or use stop.`);
    return;
  }

  clearPendingArmTimer();
  pendingOwner = null;
  pendingTeleportUntil = 0;
  stopFollowLoop(bot);
  await armGoldAtCurrentPosition(bot, config.commandOwner, sessionId, 'console');
}

async function ensureAuthenticated(bot, sessionId) {
  if (!loginSent) {
    await sendLoginCommand(bot, sessionId);
  }

  const timeoutMs = 15000;
  const startedAt = Date.now();
  botState = 'authenticating';

  while (authRequested && !authCompleted) {
    ensureSessionActive(sessionId);
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Authorization timeout expired.');
    }

    await sleep(500);
  }
}

async function sendLoginCommand(bot, sessionId) {
  ensureSessionActive(sessionId);
  loginSent = true;
  botState = 'sending_login';
  console.log('[auth] Sending /login command.');
  bot.chat(`/login ${config.loginPassword}`);
  await sleep(1500);
}

async function moveNear(bot, targetPos, stopDistance, sessionId) {
  console.log(`[move] Moving toward ${formatVec(targetPos)} until distance <= ${stopDistance}.`);

  const startedAt = Date.now();
  const timeoutMs = 15000;
  let lastReportAt = 0;

  while (getSafePosition(bot).distanceTo(targetPos) > stopDistance) {
    ensureSessionActive(sessionId);

    if (botState === 'idle') {
      bot.setControlState('forward', false);
      throw new Error('Movement was cancelled.');
    }

    if (Date.now() - startedAt > timeoutMs) {
      bot.setControlState('forward', false);
      throw new Error('Timed out while walking to the target.');
    }

    await facePosition(bot, targetPos);
    bot.setControlState('forward', true);

    if (Date.now() - lastReportAt >= 1000) {
      const distance = getSafePosition(bot).distanceTo(targetPos);
      console.log(`[move] Position ${formatPosition(bot)}, distance ${distance.toFixed(2)}.`);
      lastReportAt = Date.now();
    }

    await sleep(100);
  }

  bot.setControlState('forward', false);
  await facePosition(bot, targetPos);
  console.log(`[move] Reached target range at ${formatPosition(bot)}.`);
}

async function joinServerViaNpc(bot, targetPos, sessionId) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    ensureSessionActive(sessionId);
    console.log(`[attack] NPC join attempt ${attempt}/${maxAttempts}.`);
    await hitLobbyNpc(bot, targetPos);

    const switched = await waitForServerTransition(bot, 8000, sessionId);
    if (switched) {
      return;
    }

    if (attempt < maxAttempts) {
      console.warn('[attack] No server transition after attack, retrying.');
      await sleep(jitter(1200, 450, 2500));
      await moveNear(bot, targetPos, config.approachDistance, sessionId);
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

async function waitForServerTransition(bot, timeoutMs, sessionId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    ensureSessionActive(sessionId);
    const position = getSafePosition(bot);
    const movedFromLobbySpawn = lobbySpawnPos ? position.distanceTo(lobbySpawnPos) > 12 : false;
    const movedAwayFromNpc = position.distanceTo(config.lobbyNpcPos) > 12;

    if (movedFromLobbySpawn && movedAwayFromNpc) {
      console.log(`[flow] Transition confirmed at ${formatPosition(bot)}.`);
      return true;
    }

    await sleep(250);
  }

  return false;
}

async function summonToOwner(bot, sender, sessionId) {
  if (botState !== 'idle' && botState !== 'active') {
    console.log(`[cmd] Ignoring summon from ${sender} while state is ${botState}.`);
    return;
  }

  ensureSessionActive(sessionId);
  stopFollowLoop(bot);
  stopAttackLoop();
  stopFollowLoop(bot);
  bot.setControlState('sneak', false);
  pendingOwner = sender;
  pendingTeleportUntil = Date.now() + 30000;
  botState = 'summoning';
  console.log(`[cmd] Summon command received from ${sender}. Sending /tpa.`);
  bot.chat(`/tpa ${sender}`);
  scheduleFallbackArm(bot, sender, sessionId);
}

async function moveToConfiguredPoint(bot, sender, sessionId) {
  if (!config.walkTargetPos) {
    console.warn('[move] WALK_TARGET_POS is not configured.');
    return;
  }

  if (botState !== 'idle' && botState !== 'active') {
    console.log(`[cmd] Ignoring move command from ${sender} while state is ${botState}.`);
    return;
  }

  ensureSessionActive(sessionId);
  clearPendingArmTimer();
  stopFollowLoop(bot);
  pendingOwner = null;
  pendingTeleportUntil = 0;
  stopAttackLoop();
  bot.setControlState('sneak', false);
  botState = 'moving_to_point';
  console.log(`[cmd] Move command received from ${sender}. Walking to ${formatVec(config.walkTargetPos)}.`);

  try {
    await moveNear(bot, config.walkTargetPos, 0.8, sessionId);
    botState = 'idle';
    console.log(`[move] Target point reached at ${formatPosition(bot)}.`);
  } catch (error) {
    botState = 'idle';
    console.error(`[move] ${error.message}`);
  }
}

function startFollowOwner(bot, sender, sessionId) {
  if (botState !== 'idle' && botState !== 'active') {
    console.log(`[cmd] Ignoring follow command from ${sender} while state is ${botState}.`);
    return;
  }

  ensureSessionActive(sessionId);
  clearPendingArmTimer();
  stopAttackLoop();
  stopFollowLoop(bot);
  pendingOwner = null;
  pendingTeleportUntil = 0;
  bot.setControlState('sneak', false);
  botState = 'following';
  console.log(`[cmd] Follow command received from ${sender}. Shadow mode enabled.`);

  followTimer = setInterval(async () => {
    if (sessionId !== currentSessionId || botState !== 'following') {
      return;
    }

    const ownerEntity = findPlayerEntityByUsername(bot, sender);
    if (!ownerEntity) {
      bot.setControlState('forward', false);
      bot.setControlState('jump', false);
      return;
    }

    const myPos = getSafePosition(bot);
    const ownerPos = ownerEntity.position;
    const horizontalDistance = Math.sqrt(
      ((ownerPos.x - myPos.x) ** 2) +
      ((ownerPos.z - myPos.z) ** 2)
    );
    const verticalDelta = ownerPos.y - myPos.y;

    try {
      await facePosition(bot, ownerPos.offset(0, Math.max(ownerEntity.height || 1.8, 1.2) * 0.6, 0));
    } catch (error) {
      console.error(`[follow] ${error.message}`);
    }

    bot.setControlState('forward', horizontalDistance > config.followDistance);
    bot.setControlState('jump', horizontalDistance > 0.4 && verticalDelta > 0.45);
  }, 100);
}

async function equipConfiguredSword(bot, sender, sessionId) {
  ensureSessionActive(sessionId);
  const sword = bot.inventory.items().find((item) => item.name === config.swordItem);

  if (!sword) {
    console.warn(`[sword] ${config.swordItem} was not found in inventory.`);
    return;
  }

  const targetSlot = 36 + config.swordHotbarSlot;
  console.log(`[sword] ${sender} requested sword swap. Moving ${sword.name} to hotbar slot ${config.swordHotbarSlot + 1}.`);

  try {
    if (sword.slot !== targetSlot) {
      await bot.moveSlotItem(sword.slot, targetSlot);
    }

    bot.setQuickBarSlot(config.swordHotbarSlot);
    console.log(`[sword] Equipped ${config.swordItem} in hotbar slot ${config.swordHotbarSlot + 1}.`);
  } catch (error) {
    console.error(`[sword] ${error.message}`);
  }
}

async function startGoldRoutine(bot, sender, sessionId) {
  if (!pendingOwner || pendingOwner.toLowerCase() !== sender.toLowerCase()) {
    return;
  }

  ensureSessionActive(sessionId);
  clearPendingArmTimer();
  pendingOwner = null;
  pendingTeleportUntil = 0;
  await armGoldAtCurrentPosition(bot, sender, sessionId, 'teleport');
}

async function armGoldAtCurrentPosition(bot, sender, sessionId, reason) {
  ensureSessionActive(sessionId);
  shouldResumeGold = true;
  lastGoldOwner = sender || lastGoldOwner || config.commandOwner;
  botState = 'arming';
  console.log(`[gold] Arming gold-bot after ${reason}. Owner: ${lastGoldOwner}.`);

  await sleep(config.attackStartDelayMs);
  ensureSessionActive(sessionId);
  bot.setControlState('sneak', true);
  await aimAtAttackTarget(bot);
  console.log('[gold] Sneaking and targeting armor stand.');
  startAttackLoop(bot, sessionId);
  botState = 'active';
}

function scheduleFallbackArm(bot, sender, sessionId) {
  clearPendingArmTimer();
  pendingArmTimer = setTimeout(() => {
    if (sessionId !== currentSessionId || botState !== 'summoning') {
      return;
    }

    const ownerEntity = findPlayerEntityByUsername(bot, sender);
    if (ownerEntity && getSafePosition(bot).distanceTo(ownerEntity.position) <= 8) {
      console.log(`[gold] ${sender} is already nearby. Starting without teleport.`);
      void startGoldRoutine(bot, sender, sessionId).catch((error) => {
        console.error(`[gold] ${error.message}`);
      });
      return;
    }

    console.warn('[gold] Teleport did not happen and owner is not nearby yet. Waiting for stop or another trigger.');
  }, 2500);
}

function startAttackLoop(bot, sessionId) {
  stopAttackLoop();
  console.log(
    `[gold] Armor stand attack randomized around ${Math.max(4, config.attackIntervalTicks)} ticks with ±${Math.max(0, config.attackIntervalJitterTicks)} ticks jitter.`
  );

  const scheduleNextAttack = () => {
    const nextDelayMs = getNextGoldAttackDelayMs(botState);
    attackTimer = setTimeout(async () => {
      if (sessionId !== currentSessionId || !bot.entity) {
        return;
      }

      if (isEating) {
        log('Skipping gold attack while eating.');
        scheduleNextAttack();
        return;
      }

      try {
        bot.setControlState('sneak', true);
        const target = findArmorStandTarget(bot);

        if (target) {
          await facePosition(bot, getRandomizedAttackAimPosition(target));
          bot.attack(target, true);
          log(`Gold attacked ${target.name || target.username || target.type} at ${formatVec(target.position)}.`);
        } else {
          const yawJitter = (Math.random() - 0.5) * 0.08;
          const pitchJitter = (Math.random() - 0.5) * 0.05;
          await bot.look(bot.entity.yaw + yawJitter, Math.PI / 2 - 0.05 + pitchJitter, true);
          bot.swingArm('right', true);
          console.warn(`[gold] No armor stand found in ${config.attackTargetRange} blocks, fallback swing sent.`);
        }
      } catch (error) {
        console.error(`[gold] ${error.message}`);
      } finally {
        if (sessionId === currentSessionId) {
          scheduleNextAttack();
        }
      }
    }, nextDelayMs);
  };

  scheduleNextAttack();
}

async function aimAtAttackTarget(bot) {
  const target = findArmorStandTarget(bot);

  if (target) {
    await facePosition(bot, getRandomizedAttackAimPosition(target));
    console.log(`[gold] Target acquired: ${target.name || target.username || target.type} at ${formatVec(target.position)}.`);
    return;
  }

  await bot.look(bot.entity.yaw, Math.PI / 2 - 0.05, true);
  console.warn(`[gold] No armor stand found in ${config.attackTargetRange} blocks while arming.`);
}

function getRandomizedAttackAimPosition(target) {
  const height = Math.max(target.height || 1.8, 1.2);
  const verticalCenter = height * 0.45;
  const verticalJitter = (Math.random() - 0.5) * Math.min(0.18, height * 0.12);
  const horizontalJitter = 0.03;
  return target.position.offset(
    (Math.random() - 0.5) * horizontalJitter,
    verticalCenter + verticalJitter,
    (Math.random() - 0.5) * horizontalJitter
  );
}

function getNextGoldAttackDelayMs(state) {
  const baseTicks = Math.max(4, config.attackIntervalTicks);
  const jitterTicks = Math.max(0, config.attackIntervalJitterTicks);
  let nextTicks = baseTicks;

  if (jitterTicks > 0) {
    nextTicks += randomInt(-jitterTicks, jitterTicks);
  }

  if (state === 'active' && config.attackExtraPauseChance > 0 && Math.random() < config.attackExtraPauseChance) {
    const pauseMin = Math.max(0, config.attackExtraPauseMinTicks);
    const pauseMax = Math.max(pauseMin, config.attackExtraPauseMaxTicks);
    nextTicks += randomInt(pauseMin, pauseMax);
  }

  return Math.max(200, nextTicks * 50);
}

function randomInt(min, max) {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function findArmorStandTarget(bot) {
  let bestEntity = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const entity of Object.values(bot.entities)) {
    if (!entity.position || entity === bot.entity) {
      continue;
    }

    const name = String(entity.name || entity.username || entity.displayName || '').toLowerCase();
    const type = String(entity.type || '').toLowerCase();
    const distance = getSafePosition(bot).distanceTo(entity.position);

    if (distance > config.attackTargetRange) {
      continue;
    }

    const priority = getGoldTargetPriority(name, type);
    if (priority === Number.POSITIVE_INFINITY) {
      continue;
    }

    const score = (priority * 100) + distance;
    if (score < bestScore) {
      bestScore = score;
      bestEntity = entity;
    }
  }

  return bestEntity;
}

function getGoldTargetPriority(name, type) {
  if (name.includes('armor_stand') || name.includes('armor stand') || name.includes('стойка') || type.includes('armor_stand')) {
    return 1;
  }

  if (name.includes('display') || type.includes('display') || name.includes('item') || type.includes('item') || name.includes('experience')) {
    return Number.POSITIVE_INFINITY;
  }

  if (type === 'mob' || type === 'object') {
    return 2;
  }

  return Number.POSITIVE_INFINITY;
}

function stopAttackLoop() {
  if (attackTimer) {
    clearTimeout(attackTimer);
    attackTimer = null;
  }
}

function stopFollowLoop(bot) {
  if (followTimer) {
    clearInterval(followTimer);
    followTimer = null;
  }

  if (bot) {
    bot.setControlState('forward', false);
    bot.setControlState('jump', false);
  }
}

function clearPendingArmTimer() {
  if (pendingArmTimer) {
    clearTimeout(pendingArmTimer);
    pendingArmTimer = null;
  }
}

function startAutoEatLoop(bot) {
  stopAutoEatLoop();
  console.log(
    `[eat] Auto-eat active. Item ${config.autoEatItem}, food < ${config.autoEatFoodThreshold}, hp < ${config.autoEatHealthThreshold}.`
  );
  autoEatTimer = setInterval(() => {
    void maybeEat(bot, 'periodic');
  }, config.autoEatCheckIntervalMs);
}

function stopAutoEatLoop() {
  if (autoEatTimer) {
    clearInterval(autoEatTimer);
    autoEatTimer = null;
  }
}

async function maybeEat(bot, reason) {
  if (isEating || !bot.entity) {
    return;
  }

  if (botState === 'waiting_antibot' || botState === 'moving_to_npc' || botState === 'attacking_npc') {
    return;
  }

  const food = Number.isFinite(bot.food) ? bot.food : 20;
  const health = Number.isFinite(bot.health) ? bot.health : 20;
  const lowFood = food < config.autoEatFoodThreshold;
  const lowHealth = health < config.autoEatHealthThreshold;

  if (!lowFood && !(lowHealth && food < 20)) {
    return;
  }

  const foodItem = bot.inventory.items().find((item) => item.name === config.autoEatItem);
  if (!foodItem) {
    console.warn(
      `[eat] Need food because of ${reason} (hp ${formatStat(bot.health)}, food ${formatStat(bot.food)}), but ${config.autoEatItem} was not found.`
    );
    return;
  }

  const wasSneaking = bot.controlState.sneak;
  const previousQuickBarSlot = bot.quickBarSlot;
  isEating = true;

  try {
    console.log(
      `[eat] Triggered by ${reason}. hp ${formatStat(bot.health)}, food ${formatStat(bot.food)}. Eating ${foodItem.name}.`
    );
    bot.setControlState('forward', false);
    bot.setControlState('sneak', false);
    await bot.equip(foodItem, 'hand');
    await sleep(jitter(350, 180, 900));
    await withTimeout(bot.consume(), config.autoEatTimeoutMs, 'Promise timed out.');
    console.log(`[eat] Finished eating. hp ${formatStat(bot.health)}, food ${formatStat(bot.food)}.`);
  } catch (error) {
    console.error(`[eat] ${error.message}`);
  } finally {
    isEating = false;
    try {
      bot.setQuickBarSlot(previousQuickBarSlot ?? config.swordHotbarSlot);
    } catch {}
    if (botState === 'active' || wasSneaking) {
      bot.setControlState('sneak', true);
    }
  }
}

function cancelCurrentAction(bot, sender) {
  clearPendingArmTimer();
  pendingOwner = null;
  pendingTeleportUntil = 0;
  shouldResumeGold = false;
  stopAttackLoop();
  stopFollowLoop(bot);
  bot.setControlState('forward', false);
  bot.setControlState('sneak', false);
  botState = 'idle';
  console.log(`[cmd] Stop command received from ${sender}. Current action cancelled.`);
}

function startAntiAfk(bot) {
  stopAntiAfk();
  console.log(`[anti-afk] Active, interval ${config.antiAfkIntervalMs}ms.`);
  scheduleNextAntiAfk(bot);
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
      if (botState === 'active') {
        await bot.look(bot.entity.yaw, Math.PI / 2 - 0.05, true);
        bot.setControlState('sneak', true);
      } else {
        const yawJitter = (Math.random() - 0.5) * 0.25;
        const pitchJitter = (Math.random() - 0.5) * 0.1;
        await bot.look(bot.entity.yaw + yawJitter, bot.entity.pitch + pitchJitter, true);
      }
    } catch (error) {
      console.error(`[anti-afk] ${error.message}`);
    } finally {
      scheduleNextAntiAfk(bot);
    }
  }, nextDelayMs);
}

function stopAntiAfk() {
  if (antiAfkTimer) {
    clearTimeout(antiAfkTimer);
    antiAfkTimer = null;
  }
}

function startStatusLoop(bot) {
  stopStatusLoop();
  console.log(`[status] Periodic status every ${config.statusIntervalMs}ms.`);
  statusTimer = setInterval(() => {
    console.log(
      `[status] State ${botState}, pos ${formatPosition(bot)}, hp ${formatStat(bot.health)}, food ${formatStat(bot.food)}, sneaking ${bot.controlState.sneak}.`
    );
  }, config.statusIntervalMs);
}

function stopStatusLoop() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

function stopLoops() {
  stopStatusLoop();
  stopAntiAfk();
  stopAutoEatLoop();
  stopAttackLoop();
  stopFollowLoop(currentBot);
  clearPendingArmTimer();
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

function isSurvivalKickMessage(lowerMessage) {
  return (
    lowerMessage.includes('you were kicked from survival') ||
    lowerMessage.includes('вас кикнули с сервера') ||
    lowerMessage.includes('kicked from survival')
  );
}

function isProbablyBackInLobby(bot) {
  if (!config.lobbyNpcPos || !bot.entity) {
    return false;
  }

  const position = getSafePosition(bot);
  const nearNpc = position.distanceTo(config.lobbyNpcPos) < 12;
  const nearKnownLobbySpawn = lobbySpawnPos ? position.distanceTo(lobbySpawnPos) < 3 : false;
  return nearNpc || nearKnownLobbySpawn;
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

function updateLastValidPosition(bot) {
  if (bot?.entity?.position && isFiniteVec3(bot.entity.position)) {
    lastValidPosition = bot.entity.position.clone();
  }
}

function getSafePosition(bot) {
  if (bot?.entity?.position && isFiniteVec3(bot.entity.position)) {
    return bot.entity.position;
  }

  if (lastValidPosition) {
    return lastValidPosition;
  }

  return new Vec3(0, 0, 0);
}

function isFiniteVec3(vec) {
  return Number.isFinite(vec.x) && Number.isFinite(vec.y) && Number.isFinite(vec.z);
}

function formatPosition(bot) {
  return formatVec(getSafePosition(bot));
}

function formatVec(vec) {
  return `${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)}`;
}

function formatStat(value) {
  return Number.isFinite(value) ? value.toFixed(1) : 'n/a';
}

async function handleMapPacket(bot, packet) {
  if (!packet || !Number.isFinite(packet.columns) || packet.columns <= 0 || !packet.data) {
    return;
  }

  const mapId = getMapId(packet);
  const image = getOrCreateMapImage(mapId);
  const data = Buffer.from(packet.data);
  const columns = Number(packet.columns);
  const rows = Number(packet.rows || 0);
  const offsetX = Number(packet.x || 0);
  const offsetY = Number(packet.y || 0);

  if (rows <= 0 || data.length === 0) {
    return;
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sourceIndex = row * columns + column;
      const targetX = offsetX + column;
      const targetY = offsetY + row;

      if (sourceIndex >= data.length || targetX < 0 || targetX >= 128 || targetY < 0 || targetY >= 128) {
        continue;
      }

      image[targetY * 128 + targetX] = data[sourceIndex];
    }
  }

  const filePath = saveMapCaptchaPng(mapId, image);
  console.log(`[captcha] Map captcha saved: ${filePath}`);
  openImageFile(filePath);
  promptForCaptcha(bot, filePath);
}

function getMapId(packet) {
  return packet.itemDamage ?? packet.mapId ?? packet.id ?? 'unknown';
}

function getOrCreateMapImage(mapId) {
  if (!mapCaptchas.has(mapId)) {
    mapCaptchas.set(mapId, new Uint8Array(128 * 128));
  }

  return mapCaptchas.get(mapId);
}

function saveMapCaptchaPng(mapId, image) {
  const directory = path.resolve(process.cwd(), config.mapCaptchaDir);
  fs.mkdirSync(directory, { recursive: true });

  const png = new PNG({ width: 128, height: 128 });
  for (let index = 0; index < image.length; index += 1) {
    const [red, green, blue, alpha] = mapColorToRgba(image[index]);
    const pngIndex = index * 4;
    png.data[pngIndex] = red;
    png.data[pngIndex + 1] = green;
    png.data[pngIndex + 2] = blue;
    png.data[pngIndex + 3] = alpha;
  }

  const safeMapId = String(mapId).replace(/[^a-z0-9_-]/gi, '_');
  const filePath = path.join(directory, `map-${safeMapId}-${Date.now()}.png`);
  fs.writeFileSync(filePath, PNG.sync.write(png));
  return filePath;
}

function openImageFile(filePath) {
  if (process.env.MAP_CAPTCHA_AUTO_OPEN === '0') {
    return;
  }

  const command = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', filePath]]
    : process.platform === 'darwin'
      ? ['open', [filePath]]
      : ['xdg-open', [filePath]];

  execFile(command[0], command[1], { windowsHide: true }, (error) => {
    if (error) {
      console.warn(`[captcha] Could not auto-open image: ${error.message}`);
    }
  });
}

function promptForCaptcha(bot, filePath) {
  if (captchaPromptActive) {
    console.log('[captcha] Prompt already active. Use the latest opened image if needed.');
    return;
  }

  captchaPromptActive = true;
  pendingCaptchaBot = bot;
  pendingCaptchaFilePath = filePath;
  ensureReadlineInterface();
  console.log('[captcha] Type captcha here, or type "skip" to ignore it.');
  console.log(`[captcha] ${filePath}`);
  console.log('[captcha] input>');
}

function submitConsoleCaptcha(answer) {
  const bot = pendingCaptchaBot;
  captchaPromptActive = false;
  pendingCaptchaBot = null;
  pendingCaptchaFilePath = null;

  const trimmed = answer.trim();
  if (!trimmed || trimmed.toLowerCase() === 'skip') {
    console.log('[captcha] Skipped.');
    return;
  }

  if (!bot?.entity) {
    console.warn('[captcha] Bot is not connected, captcha was not sent.');
    return;
  }

  const command = trimmed.startsWith('/') ? trimmed : `${config.mapCaptchaChatPrefix}${trimmed}`;
  console.log(`[captcha] Sending: ${command}`);
  bot.chat(command);
}

function mapColorToRgba(colorId) {
  const id = colorId & 0xff;
  if (id === 0) {
    return [0, 0, 0, 0];
  }

  const baseColor = MAP_BASE_COLORS[Math.floor(id / 4)] || [0, 0, 0];
  const shade = MAP_SHADES[id & 3] || 255;
  return [
    Math.floor((baseColor[0] * shade) / 255),
    Math.floor((baseColor[1] * shade) / 255),
    Math.floor((baseColor[2] * shade) / 255),
    255
  ];
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

function findPlayerEntityByUsername(bot, username) {
  const normalized = username.toLowerCase();

  for (const entity of Object.values(bot.entities)) {
    if (entity === bot.entity || !entity.position) {
      continue;
    }

    const entityUsername = String(entity.username || entity.name || '').trim().toLowerCase();
    if (entity.type === 'player' && entityUsername === normalized) {
      return entity;
    }
  }

  return null;
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

async function facePosition(bot, position) {
  const eyes = getSafePosition(bot).offset(0, bot.entity?.height || 1.62, 0);
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
    throw new Error('Vector env value must look like "12.5,64,-30.5".');
  }

  return new Vec3(parts[0], parts[1], parts[2]);
}

function scheduleReconnect(minDelayMs = 1000) {
  if (reconnectTimer) {
    return;
  }

  const delayMs = jitter(config.reconnectDelayMs, config.reconnectDelayJitterMs, minDelayMs);
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

function ensureSessionActive(sessionId) {
  if (sessionId !== currentSessionId) {
    throw new Error('Session replaced by reconnect.');
  }
}

function jitter(baseMs, jitterMs, minMs = 0) {
  const range = Math.max(0, jitterMs);
  const value = baseMs + ((Math.random() * 2 - 1) * range);
  return Math.max(minMs, Math.round(value));
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    sleep(timeoutMs).then(() => {
      throw new Error(message);
    })
  ]);
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function formatReason(reason) {
  if (typeof reason === 'string') {
    return reason;
  }

  const textParts = [];
  collectReasonText(reason, textParts);

  if (textParts.length > 0) {
    return textParts.join(' ');
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function collectReasonText(value, textParts) {
  if (value == null) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    textParts.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReasonText(item, textParts);
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  if (typeof value.value === 'string') {
    textParts.push(value.value);
  }

  if (typeof value.text === 'string') {
    textParts.push(value.text);
  }

  if (typeof value.translate === 'string') {
    textParts.push(value.translate);
  }

  for (const nestedValue of Object.values(value)) {
    collectReasonText(nestedValue, textParts);
  }
}

function isUnfairAdvantageKick(reasonText) {
  const normalized = reasonText.toLowerCase();
  return (
    normalized.includes('несправедливое преимущество') ||
    normalized.includes('unfair advantage') ||
    normalized.includes('РЅРµСЃРїСЂР°РІРµРґР»РёРІРѕРµ РїСЂРµРёРјСѓС‰РµСЃС‚РІРѕ'.toLowerCase())
  );
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
  stopLoops();
  clearReconnect();

  if (currentBot) {
    currentBot.quit('Stopped');
  }

  if (readlineInterface) {
    readlineInterface.close();
  }

  process.exit(0);
});
