'use strict';

const fs = require('fs');
const { execFile } = require('child_process');
const path = require('path');
const readline = require('readline');
const { PNG } = require('pngjs');

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

function createMapCaptchaHandler(config) {
  const enabled = config.mapCaptchaEnabled !== false;
  const directoryName = config.mapCaptchaDir || 'captcha-maps';
  const chatPrefix = config.mapCaptchaChatPrefix || '/captcha ';
  const autoOpen = config.mapCaptchaAutoOpen !== false;
  const mapCaptchas = new Map();
  let captchaPromptActive = false;
  let readlineInterface = null;

  async function handleMapPacket(bot, packet) {
    if (!enabled || !packet || !Number.isFinite(packet.columns) || packet.columns <= 0 || !packet.data) {
      return;
    }

    const mapId = packet.itemDamage ?? packet.mapId ?? packet.id ?? 'unknown';
    const image = getOrCreateMapImage(mapCaptchas, mapId);
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

    const filePath = saveMapCaptchaPng(directoryName, mapId, image);
    console.log(`[captcha] Map captcha saved: ${filePath}`);

    if (autoOpen) {
      openImageFile(filePath);
    }

    promptForCaptcha(bot, filePath);
  }

  function promptForCaptcha(bot, filePath) {
    if (captchaPromptActive) {
      console.log('[captcha] Prompt already active. Use the latest opened image if needed.');
      return;
    }

    captchaPromptActive = true;
    readlineInterface ??= readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('[captcha] Type captcha here, or type "skip" to ignore it.');
    readlineInterface.question(`[captcha] ${filePath}\n[captcha] input> `, (answer) => {
      captchaPromptActive = false;
      const trimmed = answer.trim();

      if (!trimmed || trimmed.toLowerCase() === 'skip') {
        console.log('[captcha] Skipped.');
        return;
      }

      const command = trimmed.startsWith('/') ? trimmed : `${chatPrefix}${trimmed}`;
      console.log(`[captcha] Sending: ${command}`);
      bot.chat(command);
    });
  }

  function close() {
    if (readlineInterface) {
      readlineInterface.close();
      readlineInterface = null;
    }
  }

  return { handleMapPacket, close };
}

function getOrCreateMapImage(mapCaptchas, mapId) {
  if (!mapCaptchas.has(mapId)) {
    mapCaptchas.set(mapId, new Uint8Array(128 * 128));
  }

  return mapCaptchas.get(mapId);
}

function saveMapCaptchaPng(directoryName, mapId, image) {
  const directory = path.resolve(process.cwd(), directoryName);
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

module.exports = { createMapCaptchaHandler };
