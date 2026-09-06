// Generates a 1024x1024 "CodeLens" icon (a lens + spark) as a source PNG
// that the Tauri CLI can turn into the full multi-size icon set.
// Pure Node — no canvas dependency.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 1024;

// ---- minimal PNG encoder ---------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline prefixed with filter byte 0.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- drawing helpers -------------------------------------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Signed distance to a rounded-rect (returns <=0 inside). */
function roundedRectSdf(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Signed distance to a circle. */
function circleSdf(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

/** Signed distance to the 4-point sparkle star centered at (cx, cy). */
function sparkleSdf(px, py, cx, cy, len, thickness) {
  const dx = px - cx;
  const dy = py - cy;
  // Two crossing line segments: horizontal-ish and vertical-ish rotated 45°.
  const d1 = Math.abs(dx);
  const along1 = Math.abs(dy);
  const d2 = Math.abs((dx + dy) / Math.SQRT2);
  const along2 = Math.abs((dx - dy) / Math.SQRT2);

  const seg = (perp, alongHalf) =>
    Math.hypot(perp - thickness, Math.max(alongHalf - len / 2, 0));
  return Math.min(seg(d1, along1), seg(d2, along2));
}

// ---- render -----------------------------------------------------------------
const img = Buffer.alloc(SIZE * SIZE * 4);
const bg = [30, 30, 30, 255]; // #1e1e1e
const panel = [37, 37, 43, 255]; // #25252b
const blue = [76, 194, 255, 255]; // #4cc2ff
const yellow = [227, 179, 65, 255]; // #e3b341
const white = [255, 255, 255, 255];

const cx = 512;
const cy = 512;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const px = x + 0.5;
    const py = y + 0.5;

    // Rounded-square app backdrop.
    const rectD = roundedRectSdf(px, py, cx, cy, 420, 420, 150);
    let r = bg[0],
      g = bg[1],
      b = bg[2],
      a = 255;
    if (rectD > 0) {
      a = 0;
    } else {
      // Slight vertical gradient on the panel.
      const t = py / SIZE;
      r = lerp(28, 34, t);
      g = lerp(28, 34, t);
      b = lerp(30, 38, t);
      // Inner border ring (subtle).
      const innerD = roundedRectSdf(px, py, cx, cy, 408, 408, 142);
      if (innerD > -4 && innerD < 0) {
        r = 60;
        g = 60;
        b = 70;
      }
      // Lens circle: outer blue ring, dark pupil, small highlight.
      const ringD = Math.abs(circleSdf(px, py, cx - 20, cy + 10, 250)) - 28;
      if (ringD < 0) {
        const ang = Math.atan2(py - (cy + 10), px - (cx - 20));
        const blend = 0.5 + 0.5 * Math.cos(ang);
        r = lerp(36, 145, blend) * 0.55;
        g = lerp(120, 220, blend) * 0.55;
        b = lerp(220, 255, blend) * 0.55;
      }
      const pupilD = circleSdf(px, py, cx - 20, cy + 10, 196);
      if (pupilD < 0) {
        r = 16;
        g = 18;
        b = 22;
      }
      const glintD = circleSdf(px, py, cx - 92, cy - 66, 34);
      if (glintD < 0) {
        const gt = 0.55 + 0.45 * Math.cos(circleSdf(px, py, cx - 92, cy - 66, 12));
        r = lerp(90, 255, gt);
        g = lerp(180, 255, gt);
        b = lerp(255, 255, gt);
      }
      // Sparkle (top-right).
      const sparkD = sparkleSdf(px, py, cx + 250, cy - 260, 190, 18);
      if (sparkD < 0) {
        r = yellow[0];
        g = yellow[1];
        b = yellow[2];
      }
    }

    img[i] = clamp(r, 0, 255);
    img[i + 1] = clamp(g, 0, 255);
    img[i + 2] = clamp(b, 0, 255);
    img[i + 3] = a;
  }
}

const outDir = join(__dirname, "..", "assets");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "icon-source.png");
writeFileSync(outPath, encodePng(SIZE, SIZE, img));
console.log("wrote", outPath);