'use strict';

require('dotenv').config();

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
  username: process.env.MC_USERNAME || 'CHANGE_ME',
  version: process.env.MC_VERSION || false,
  loginPassword: process.env.LOGIN_PASSWORD || '',
  commandOwners: parseOwners(process.env.COMMAND_OWNERS || process.env.COMMAND_OWNER || ''),
  autoEatItem: process.env.AUTO_EAT_ITEM || 'cooked_porkchop',
  autoEatHealthThreshold: Number.parseFloat(process.env.AUTO_EAT_HEALTH_THRESHOLD || '5'),
  autoEatFoodThreshold: Number.parseInt(process.env.AUTO_EAT_FOOD_THRESHOLD || '5', 10),
  spawnWaitMs: Number.parseInt(process.env.SPAWN_WAIT_MS || '12000', 10),
  spawnWaitJitterMs: Number.parseInt(process.env.SPAWN_WAIT_JITTER_MS || '900', 10),
  reconnectDelayMs: Number.parseInt(process.env.RECONNECT_DELAY_MS || '15000', 10),
  reconnectDelayJitterMs: Number.parseInt(process.env.RECONNECT_DELAY_JITTER_MS || '2500', 10),
  approachDistance: Number.parseFloat(process.env.NPC_APPROACH_DISTANCE || '3.2'),
  punchDelayMs: Number.parseInt(process.env.NPC_PUNCH_DELAY_MS || '700', 10),
  punchDelayJitterMs: Number.parseInt(process.env.NPC_PUNCH_DELAY_JITTER_MS || '250', 10),
  clickDelayMs: Number.parseInt(process.env.CLICK_DELAY_MS || '120', 10),
  clickDelayJitterMs: Number.parseInt(process.env.CLICK_DELAY_JITTER_MS || '90', 10),
  antiAfkIntervalMs: Number.parseInt(process.env.ANTI_AFK_INTERVAL_MS || '45000', 10),
  antiAfkIntervalJitterMs: Number.parseInt(process.env.ANTI_AFK_INTERVAL_JITTER_MS || '12000', 10),
  statusIntervalMs: Number.parseInt(process.env.STATUS_INTERVAL_MS || '15000', 10),
  autoEatTimeoutMs: Number.parseInt(process.env.AUTO_EAT_TIMEOUT_MS || '8000', 10),
  mapCaptchaEnabled: process.env.MAP_CAPTCHA_ENABLED !== '0',
  mapCaptchaDir: process.env.MAP_CAPTCHA_DIR || 'captcha-maps',
  mapCaptchaChatPrefix: process.env.MAP_CAPTCHA_CHAT_PREFIX || '/captcha ',
  playerListEnabled: process.env.PLAYER_LIST_ENABLED === '1',
  playerListIntervalMs: Number.parseInt(process.env.PLAYER_LIST_INTERVAL_MS || '60000', 10),
  debug: process.env.DEBUG === '1',
  lobbyNpcPos: parseVec3(process.env.LOBBY_NPC_POS)
};

let reconnectTimer = null;
let antiAfkTimer = null;
let statusTimer = null;
let playerListTimer = null;
let lobbyHandled = false;
let currentBot = null;
let botState = 'booting';
let authRequested = false;
let authCompleted = false;
let loginSent = false;
let lobbySpawnPos = null;
let isEating = false;
let isTransitioning = false;
const mapCaptchas = new Map();
let captchaPromptActive = false;
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
  isTransitioning = false;
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

  if (config.mapCaptchaEnabled) {
    bot._client.on('map', (packet) => {
      handleMapPacket(bot, packet).catch((error) => {
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
    const formattedReason = formatReason(reason);
    console.error(`[kick] ${formattedReason}`);

    if (isUnfairAdvantageKick(formattedReason)) {
      botState = 'reconnecting_after_advantage_kick';
      console.warn('[kick] Unfair advantage kick detected, reconnect requested.');
      scheduleReconnect(1000);
    }
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
    stopPlayerList();
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

  bot.on('playerJoined', (player) => {
    if (!config.playerListEnabled || !player?.username || player.username === bot.username) {
      return;
    }

    console.log(`[players] Joined: ${player.username}. Online now: ${getSortedPlayerNames(bot).length}.`);
  });

  bot.on('playerLeft', (player) => {
    if (!config.playerListEnabled || !player?.username || player.username === bot.username) {
      return;
    }

    console.log(`[players] Left: ${player.username}. Online now: ${getSortedPlayerNames(bot).length}.`);
  });
}

async function runLobbyFlow(bot) {
  if (lobbyHandled) {
    return;
  }

  lobbyHandled = true;

  const spawnWaitMs = jitter(config.spawnWaitMs, config.spawnWaitJitterMs, 2000);
  console.log(`[flow] Waiting ${spawnWaitMs}ms for anti-bot check.`);
  botState = 'waiting_antibot';
  await sleep(spawnWaitMs);

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
    await sleep(jitter(config.punchDelayMs, config.punchDelayJitterMs, 1200));
    botState = 'attacking_npc';
    await joinServerViaNpc(bot, config.lobbyNpcPos);
  } else {
    console.warn('[flow] LOBBY_NPC_POS is not set, skipping NPC selection.');
  }

  console.log('[flow] Server transition detected, anti-AFK enabled.');
  botState = 'afk';
  isTransitioning = false;
  startAntiAfk(bot);
  startPlayerList(bot);
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
  isTransitioning = true;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`[attack] NPC join attempt ${attempt}/${maxAttempts}.`);
    await hitLobbyNpc(bot, targetPos);

    const switched = await waitForServerTransition(bot, 8000);
    if (switched) {
      return;
    }

    if (attempt < maxAttempts) {
      console.warn('[attack] No server transition after attack, retrying.');
      await sleep(jitter(1200, 450, 2500));
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
    await humanizedClickAction(async () => {
      bot.attack(targetEntity, true);
    });
    console.log('[attack] Attack packet sent to entity.');
    return;
  }

  console.warn('[attack] No suitable NPC entity found, swinging at coordinates only.');
  await facePosition(bot, targetPos.offset(0, 1.2, 0));
  await humanizedClickAction(async () => {
    bot.swingArm('right', true);
  });
  console.log('[attack] Arm swing sent.');
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

function startPlayerList(bot) {
  stopPlayerList();

  if (!config.playerListEnabled) {
    return;
  }

  console.log(`[players] Live player list every ${config.playerListIntervalMs}ms.`);
  logPlayerList(bot);
  playerListTimer = setInterval(() => {
    logPlayerList(bot);
  }, config.playerListIntervalMs);
}

function stopPlayerList() {
  if (playerListTimer) {
    clearInterval(playerListTimer);
    playerListTimer = null;
  }
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
  if (isEating || !bot.entity || isTransitioning || botState === 'moving_to_npc' || botState === 'attacking_npc') {
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
    bot.setControlState('forward', false);
    await bot.equip(foodItem, 'hand');
    await sleep(jitter(350, 180, 900));
    await withTimeout(bot.consume(), config.autoEatTimeoutMs, 'Promise timed out.');
    console.log(`[eat] Finished eating. hp ${formatStat(bot.health)}, food ${formatStat(bot.food)}.`);
  } catch (error) {
    console.error(`[eat] ${error.message}`);
  } finally {
    try {
      await bot.unequip('hand');
    } catch {}
    isEating = false;
  }
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
    console.log('[captcha] Prompt already active. Use the latest saved image if needed.');
    return;
  }

  captchaPromptActive = true;
  readlineInterface ??= readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('[captcha] Open the PNG, type captcha here, or type "skip" to ignore it.');
  readlineInterface.question(`[captcha] ${filePath}\n[captcha] input> `, (answer) => {
    captchaPromptActive = false;
    const trimmed = answer.trim();

    if (!trimmed || trimmed.toLowerCase() === 'skip') {
      console.log('[captcha] Skipped.');
      return;
    }

    const command = trimmed.startsWith('/') ? trimmed : `${config.mapCaptchaChatPrefix}${trimmed}`;
    console.log(`[captcha] Sending: ${command}`);
    bot.chat(command);
  });
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

function getSortedPlayerNames(bot) {
  return Object.values(bot.players)
    .map((player) => player?.username)
    .filter((username) => typeof username === 'string' && username.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function logPlayerList(bot) {
  const names = getSortedPlayerNames(bot);
  console.log(`[players] Online ${names.length}: ${names.join(', ') || '(none)'}.`);
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

function jitter(baseMs, jitterMs, minMs = 0) {
  const range = Math.max(0, jitterMs);
  const value = baseMs + ((Math.random() * 2 - 1) * range);
  return Math.max(minMs, Math.round(value));
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
      const yawJitter = (Math.random() - 0.5) * 0.28;
      const pitchJitter = (Math.random() - 0.5) * 0.12;
      await bot.look(bot.entity.yaw + yawJitter, bot.entity.pitch + pitchJitter, true);
      if (Math.random() < 0.7) {
        await humanizedClickAction(async () => {
          bot.swingArm('right', true);
        });
      }
      console.log(`[anti-afk] Action at ${formatVec(bot.entity.position)}. Next in ${nextDelayMs}ms.`);
    } catch (error) {
      console.error(`[anti-afk] ${error.message}`);
    } finally {
      scheduleNextAntiAfk(bot);
    }
  }, nextDelayMs);
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    sleep(timeoutMs).then(() => {
      throw new Error(message);
    })
  ]);
}

async function humanizedClickAction(action) {
  await sleep(jitter(config.clickDelayMs, config.clickDelayJitterMs, 25));
  await action();
}

function isUnfairAdvantageKick(reasonText) {
  const normalized = reasonText.toLowerCase();
  return (
    normalized.includes('несправедливое преимущество') ||
    normalized.includes('unfair advantage') ||
    normalized.includes('РЅРµСЃРїСЂР°РІРµРґР»РёРІРѕРµ РїСЂРµРёРјСѓС‰РµСЃС‚РІРѕ'.toLowerCase())
  );
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

function log(message) {
  if (config.debug) {
    console.log(`[debug] ${message}`);
  }
}

process.on('SIGINT', () => {
  stopAntiAfk();
  stopStatusUpdates();
  stopPlayerList();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  if (currentBot) {
    currentBot.quit('Stopped');
  }

  if (readlineInterface) {
    readlineInterface.close();
  }

  process.exit(0);
});
