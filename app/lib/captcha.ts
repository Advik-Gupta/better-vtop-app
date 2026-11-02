/* Reads VTOP's image captcha in the browser. Each of the six characters sits
   in a fixed 25-pixel slot; it is matched, allowing small shifts, against
   labelled examples of every character. Examples from this device's own
   successful logins are added over time. */

const WIDTH = 200;
const HEIGHT = 40;
const TILE_W = 25;
const TILE_H = 26;
const LEFT = 25;
const STEP = 25;
const SLOTS = 6;
const SIZE = TILE_W * TILE_H;
const BYTES = Math.ceil(SIZE / 8);
const LEARNED_KEY = "captchaLearned";
const LEARNED_LIMIT = 1200;

const SHIFTS: [number, number][] = [];
for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) SHIFTS.push([dy, dx]);

export interface Reference {
  char: string;
  vector: Float32Array;
}

function inkMask(pixels: Uint8ClampedArray): Uint8Array {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  for (let i = 0; i < mask.length; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    // Red ink on vtop.vit.ac.in, blue on the feedback site.
    mask[i] = Math.max(r - Math.max(g, b), b - Math.max(r, g)) > 50 ? 1 : 0;
  }
  return mask;
}

function tileAt(mask: Uint8Array, slot: number): Uint8Array {
  const x0 = LEFT + slot * STEP;
  const tile = new Uint8Array(SIZE);
  let top = -1;
  for (let y = 0; y < HEIGHT && top < 0; y++) {
    let ink = 0;
    for (let x = 0; x < TILE_W; x++) ink += mask[y * WIDTH + x0 + x];
    if (ink >= 2) top = y;
  }
  if (top < 0) return tile;
  for (let y = 0; y < TILE_H && top + y < HEIGHT; y++) {
    for (let x = 0; x < TILE_W; x++) tile[y * TILE_W + x] = mask[(top + y) * WIDTH + x0 + x];
  }
  return tile;
}

function blur(tile: Uint8Array): Float32Array {
  const out = new Float32Array(SIZE);
  const at = (y: number, x: number) =>
    y < 0 || y >= TILE_H || x < 0 || x >= TILE_W ? 0 : tile[y * TILE_W + x];
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      out[y * TILE_W + x] =
        (at(y - 1, x) + at(y + 1, x) + at(y, x - 1) + at(y, x + 1) + 2 * at(y, x)) / 6;
    }
  }
  return out;
}

function unit(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum) + 1e-6;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

function shifted(blurred: Float32Array, dy: number, dx: number): Float32Array {
  const out = new Float32Array(SIZE);
  for (let y = 0; y < TILE_H; y++) {
    const sy = y + dy;
    if (sy < 0 || sy >= TILE_H) continue;
    for (let x = 0; x < TILE_W; x++) {
      const sx = x + dx;
      if (sx >= 0 && sx < TILE_W) out[y * TILE_W + x] = blurred[sy * TILE_W + sx];
    }
  }
  return unit(out);
}

function pack(tiles: Uint8Array[]): string {
  const bytes = new Uint8Array(tiles.length * BYTES);
  tiles.forEach((tile, t) => {
    for (let i = 0; i < SIZE; i++) if (tile[i]) bytes[t * BYTES + (i >> 3)] |= 128 >> (i & 7);
  });
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unpack(base64: string): Uint8Array[] {
  const binary = atob(base64);
  const tiles: Uint8Array[] = [];
  for (let t = 0; t + BYTES <= binary.length; t += BYTES) {
    const tile = new Uint8Array(SIZE);
    for (let i = 0; i < SIZE; i++) tile[i] = (binary.charCodeAt(t + (i >> 3)) >> (7 - (i & 7))) & 1;
    tiles.push(tile);
  }
  return tiles;
}

export const toReferences = (labels: string, base64: string): Reference[] =>
  unpack(base64).map((tile, i) => ({ char: labels[i], vector: unit(blur(tile)) }));

let references: Reference[] | null = null;

async function loadReferences(): Promise<Reference[]> {
  if (references) return references;
  const { default: data } = await import("./captchaData");
  let learned: Reference[] = [];
  try {
    const stored = JSON.parse(localStorage.getItem(LEARNED_KEY) ?? "null");
    if (stored?.labels && stored?.tiles) learned = toReferences(stored.labels, stored.tiles);
  } catch {
    learned = [];
  }
  references = [...toReferences(data.labels, data.tiles), ...learned];
  return references;
}

function pixelsOf(image: string): Promise<Uint8ClampedArray | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth !== WIDTH || img.naturalHeight !== HEIGHT) return resolve(null);
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return resolve(null);
      context.drawImage(img, 0, 0);
      resolve(context.getImageData(0, 0, WIDTH, HEIGHT).data);
    };
    img.onerror = () => resolve(null);
    img.src = image;
  });
}

export interface CaptchaReading {
  text: string;
  tiles: Uint8Array[];
}

/** The six characters in a captcha image (a data URI), or null if the image
 *  is not the kind this can read. */
export async function readCaptcha(image: string): Promise<CaptchaReading | null> {
  const pixels = await pixelsOf(image);
  if (!pixels) return null;
  return readPixels(pixels, await loadReferences());
}

export function readPixels(pixels: Uint8ClampedArray, refs: Reference[]): CaptchaReading {
  const mask = inkMask(pixels);
  const tiles: Uint8Array[] = [];
  let text = "";
  for (let slot = 0; slot < SLOTS; slot++) {
    const tile = tileAt(mask, slot);
    tiles.push(tile);
    const blurred = blur(tile);
    const candidates = SHIFTS.map(([dy, dx]) => shifted(blurred, dy, dx));
    let best = -1;
    let char = "";
    for (const ref of refs) {
      for (const candidate of candidates) {
        let score = 0;
        for (let i = 0; i < SIZE; i++) score += candidate[i] * ref.vector[i];
        if (score > best) {
          best = score;
          char = ref.char;
        }
      }
    }
    text += char;
  }
  return { text, tiles };
}

/** A captcha VTOP accepted: its characters become examples for next time. */
export function learnCaptcha(reading: CaptchaReading, answer: string): void {
  const text = answer.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(text)) return;
  try {
    const stored = JSON.parse(localStorage.getItem(LEARNED_KEY) ?? "null") ?? {
      labels: "",
      tiles: "",
    };
    const labels = (stored.labels + text).slice(-LEARNED_LIMIT);
    const tiles = [...unpack(stored.tiles), ...reading.tiles].slice(-LEARNED_LIMIT);
    localStorage.setItem(LEARNED_KEY, JSON.stringify({ labels, tiles: pack(tiles) }));
    references = null;
  } catch {
    // Storage full or blocked: the built-in examples still work.
  }
}
