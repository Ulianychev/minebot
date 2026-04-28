'use strict';

require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env.premium' });

const mineflayer = require('mineflayer');
const { createMapCaptchaHandler } = require('./map-captcha');

const config = {
  host: process.env.MC_HOST || 'CHANGE_ME',
  port: Number.parseInt(process.env.MC_PORT || '25565', 10),
  username: process.env.MC_USERNAME || 'CHANGE_ME',
  version: process.env.MC_VERSION || false,
  auth: process.env.MC_AUTH || 'microsoft',
  reconnectDelayMs: Number.parseInt(process.env.RECONNECT_DELAY_MS || '15000', 10),
  lookIntervalMs: Number.parseInt(process.env.LOOK_INTERVAL_MS || '45000', 10),
  statusIntervalMs: Number.parseInt(process.env.STATUS_INTERVAL_MS || '30000', 10),
  mapCaptchaEnabled: process.env.MAP_CAPTCHA_ENABLED !== '0',
  mapCaptchaDir: process.env.MAP_CAPTCHA_DIR || 'captcha-maps',
  mapCaptchaChatPrefix: process.env.MAP_CAPTCHA_CHAT_PREFIX || '/captcha ',
  mapCaptchaAutoOpen: process.env.MAP_CAPTCHA_AUTO_OPEN !== '0',
  debug: process.env.DEBUG === '1'
};

let reconnectTimer = null;
let lookTimer = null;
let statusTimer = null;
let currentBot = null;
const mapCaptcha = createMapCaptchaHandler(config);

if (config.host === 'CHANGE_ME' || config.username === 'CHANGE_ME') {
  console.error('Set MC_HOST and MC_USERNAME before starting the premium bot.');
  process.exit(1);
}

createBot();

function createBot() {
  clearReconnect();

  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version,
    auth: config.auth
  });

  currentBot = bot;
  console.log(`[boot] Connecting to ${config.host}:${config.port} as ${config.username}. Auth: ${config.auth}.`);

  if (config.mapCaptchaEnabled) {
    bot._client.on('map', (packet) => {
      mapCaptcha.handleMapPacket(bot, packet).catch((error) => {
        console.error(`[captcha] ${error.message}`);
      });
    });
  }

  bot.once('spawn', () => {
    console.log(`[spawn] Bot spawned at ${formatPosition(bot)}.`);
    bot.setControlState('sneak', true);
    console.log('[afk] Sneak enabled.');
    startLookLoop(bot);
    startStatusLoop(bot);
  });

  bot.on('login', () => {
    console.log('[login] Session established.');
  });

  bot.on('end', () => {
    stopLoops();
    console.log('[end] Connection closed.');
    scheduleReconnect();
  });

  bot.on('kicked', (reason) => {
    console.error(`[kick] ${formatReason(reason)}`);
  });

  bot.on('error', (error) => {
    console.error(`[error] ${error.message}`);
  });

  bot.on('messagestr', (message) => {
    if (message.trim()) {
      console.log(`[chat] ${message}`);
    }
  });

  bot.on('forcedMove', () => {
    console.log(`[move] Server moved bot to ${formatPosition(bot)}.`);
  });
}

function startLookLoop(bot) {
  stopLookLoop();
  console.log(`[afk] Look loop every ${config.lookIntervalMs}ms.`);

  lookTimer = setInterval(async () => {
    if (!bot.entity) {
      return;
    }

    try {
      const yawJitter = (Math.random() - 0.5) * 0.35;
      const pitchBase = Math.max(-0.45, Math.min(0.45, bot.entity.pitch));
      const pitchJitter = pitchBase + ((Math.random() - 0.5) * 0.12);
      await bot.look(bot.entity.yaw + yawJitter, pitchJitter, true);
      bot.setControlState('sneak', true);
      log(`Look update at ${formatPosition(bot)}.`);
    } catch (error) {
      console.error(`[afk] ${error.message}`);
    }
  }, config.lookIntervalMs);
}

function startStatusLoop(bot) {
  stopStatusLoop();
  console.log(`[status] Periodic status every ${config.statusIntervalMs}ms.`);

  statusTimer = setInterval(() => {
    if (!bot.entity) {
      return;
    }

    console.log(
      `[status] Pos ${formatPosition(bot)}, hp ${safeStat(bot.health)}, food ${safeStat(bot.food)}, sneaking ${bot.controlState.sneak}.`
    );
  }, config.statusIntervalMs);
}

function stopLoops() {
  stopLookLoop();
  stopStatusLoop();
}

function stopLookLoop() {
  if (lookTimer) {
    clearInterval(lookTimer);
    lookTimer = null;
  }
}

function stopStatusLoop() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
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

function formatPosition(bot) {
  if (!bot.entity || !bot.entity.position) {
    return 'n/a';
  }

  const { x, y, z } = bot.entity.position;
  return `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
}

function safeStat(value) {
  return Number.isFinite(value) ? value.toFixed(1) : 'n/a';
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

  mapCaptcha.close();

  process.exit(0);
});
