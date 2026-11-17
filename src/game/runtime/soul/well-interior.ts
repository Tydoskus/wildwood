import { soulWellFall } from "./soul-well-fall";

// A first-person descent down a continuous pixel-art set. The waterline, the
// ferryman's perch and his fishing float all share the backdrop's coordinates.
const W = 384, H = 530, WATER = 448, CENTER = W / 2;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const noise = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
type Brush = CanvasRenderingContext2D;

function box(c: Brush, color: string, x: number, y: number, w: number, h: number) {
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h);
}
function oval(c: Brush, color: string, x: number, y: number, rx: number, ry: number) {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
function line(c: Brush, color: string, points: number[], width = 1) {
  c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.stroke();
}

function paintShaft(c: Brush) {
  box(c, "#0d1924", 0, 0, W, H);
  const stones = ["#293f48", "#324954", "#233c46", "#304650", "#384c54"];
  for (let course = 0; course < 30; course++) {
    for (let block = -1; block < 13; block++) {
      const n = course * 17 + block, x = block * 33 + course % 2 * 16;
      const y = course * 16 - Math.round(((x - CENTER) / CENTER) ** 2 * 15);
      const chip = Math.floor(noise(n) * 5);
      box(c, stones[Math.floor(noise(n + 38) * stones.length)], x + 1, y, 31, 14);
      box(c, "#536668", x + 3 + chip, y, 22 - chip, 1);
      box(c, "#192e39", x + 1, y + 12, 29, 2);
      box(c, "#203844", x + 5 + chip * 4, y + 4, 3 + chip, 1);
      if (noise(n + 43) > .74) {
        box(c, "#386458", x + 3, y + 1, 12 + chip, 2);
        box(c, "#314f46", x + 4 + chip, y + 3, 3, 3 + chip);
      }
    }
  }
  // The rope changes hands halfway down: a knot, a patched section and a
  // little abandoned bucket tell the distance as they pass the camera.
  line(c, "#211e21", [164, -4, 159, 121, 162, 226, 159, 298], 4);
  for (let y = 0; y < 297; y += 5) {
    const x = y < 121 ? 164 - y * 5 / 125 : y < 226 ? 159 + (y - 121) * 3 / 105 : 162 - (y - 226) * 3 / 72;
    box(c, "#ad9166", x - 1, y, 2, 3);
  }
  box(c, "#706249", 157, 176, 7, 5);
  line(c, "#b4ae8d", [151, 310, 153, 300, 159, 297, 165, 300, 167, 310]);
  box(c, "#453830", 150, 309, 18, 12); box(c, "#966e48", 152, 310, 13, 8);
  box(c, "#879293", 150, 311, 18, 2); box(c, "#54636a", 152, 319, 14, 2);
  for (let root = 0; root < 22; root++) {
    const x = Math.floor(noise(root) * W), end = 18 + noise(root + 70) * 100;
    line(c, "#354a38", [x, 0, x + 3, end / 2, x - 2, end, x + 2, end + 6], 2);
    for (let y = 6; y < end; y += 7) box(c, "#69805a", x + Math.sin(y) * 3, y, 4, 2);
  }
  // Thin daylight at the mouth gives way to cold seams of groundwater.
  const daylight = c.createLinearGradient(0, 0, 0, 115);
  daylight.addColorStop(0, "#a9dfcf85"); daylight.addColorStop(1, "#588c9900");
  c.fillStyle = daylight; c.beginPath(); c.moveTo(110, 0); c.lineTo(189, 0);
  c.lineTo(247, 110); c.lineTo(184, 110); c.fill();
  for (let seam = 0; seam < 15; seam++) {
    const x = Math.floor(noise(seam + 52) * W), y = 66 + Math.floor(noise(seam + 99) * 290);
    line(c, "#487077", [x, y, x - 2, y + 6, x - 2, y + 16], 1);
    box(c, "#7e9b9d", x - 2, y + 16, 1, 2);
  }
  const sides = c.createLinearGradient(0, 0, W, 0);
  sides.addColorStop(0, "#050b14ef"); sides.addColorStop(.36, "#09142320");
  sides.addColorStop(.6, "#07131b15"); sides.addColorStop(1, "#040b13ed");
  c.fillStyle = sides; c.fillRect(0, 0, W, H);
}
function paintPool(c: Brush) {
  // An old sluice arch, bricked up except for the little occupied chamber.
  oval(c, "#536067", 194, 404, 43, 51);
  box(c, "#536067", 151, 403, 86, 48);
  oval(c, "#101923", 194, 405, 36, 45);
  box(c, "#101923", 158, 405, 72, 45);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + i * Math.PI / 10;
    line(c, "#22303b", [194 + 37 * Math.cos(a), 404 + 46 * Math.sin(a), 194 + 44 * Math.cos(a), 404 + 52 * Math.sin(a)], 2);
  }
  box(c, "#2c2830", 162, 402, 64, 36);
  for (let i = 0; i < 8; i++) {
    box(c, i % 2 ? "#443b3a" : "#51443d", 163 + i * 8, 398, 6, 40);
    box(c, "#62513e", 165 + i * 8, 405 + i % 4, 1, 12);
  }
  line(c, "#302527", [151, 396, 190, 379, 235, 393], 7);
  line(c, "#a7835c", [151, 393, 190, 377, 235, 390], 3);
  const water = c.createLinearGradient(0, WATER, 0, H);
  water.addColorStop(0, "#244b51"); water.addColorStop(.3, "#173d48"); water.addColorStop(1, "#081b2b");
  c.fillStyle = water; c.fillRect(0, WATER, W, H - WATER);
  for (let i = 0; i < 270; i++) {
    const x = noise(i) * W, y = WATER + noise(i + 358) * (H - WATER);
    box(c, i % 3 ? "#1e4954" : "#35616a", x, y, 2 + Math.round(noise(i + 45) * 6), 1);
    if (i % 7 === 0) {
      oval(c, "#626044", x, y, 3, 1.5); box(c, "#ae9961", x - 1, y - 1, 3, 1);
    }
  }
  for (const x of [158, 202]) {
    box(c, "#30292c", x, 432, 5, 20); box(c, "#715340", x + 1, 435, 2, 14);
  }
  box(c, "#332a2b", 148, 435, 66, 5); box(c, "#ab8051", 148, 434, 66, 2);
  for (let i = 0; i < 8; i++) box(c, "#514037", 152 + i * 8, 434, 1, 4);
  // Fishing tackle under the eaves: spare hooks, a creel, and the last
  // three fish strung up to dry. Small silhouettes stay legible in the pan.
  line(c, "#9c8465", [115, 402, 131, 406, 153, 401]);
  for (const [x, y] of [[122, 405], [131, 407], [141, 405]]) {
    line(c, "#b8ab85", [x, y, x, y + 3]);
    oval(c, "#8da4a0", x, y + 6, 2, 4); box(c, "#47737a", x - 2, y + 9, 4, 2);
  }
  box(c, "#3d332b", 149, 422, 12, 12); box(c, "#927246", 150, 423, 10, 9);
  for (const y of [424, 427, 430]) box(c, "#5b4a35", 150, y, 10, 1);
  for (const x of [251, 258, 261, 98, 102]) {
    const y = WATER - 1 - Math.floor(noise(x) * 5);
    box(c, "#8ca3a0", x, y - 3, 2, 5); oval(c, "#68a8a0", x + 1, y - 4, 4, 2);
    box(c, "#b8d7bc", x - 1, y - 5, 3, 1);
  }
  const glow = c.createRadialGradient(218, 405, 2, 218, 405, 29);
  glow.addColorStop(0, "#ffbb626b"); glow.addColorStop(1, "#ffc07a00");
  c.fillStyle = glow; c.fillRect(189, 376, 59, 59);
  // A brass lamp hangs at the arch. Its reflection breaks on the water.
  line(c, "#a7895c", [218, 387, 218, 398], 1);
  box(c, "#32262a", 214, 398, 9, 13); box(c, "#9c7142", 213, 399, 11, 2);
  box(c, "#ffb85d", 215, 402, 6, 6); box(c, "#fff1ae", 216, 403, 3, 3);
}

const FERRYMAN = [
  "       g   g    g        ",
  "       ygggyggggy        ",
  "        gyyryyyg         ",
  "       ddggggggdd        ",
  "      dllldddlllld       ",
  "     dlwpllllwpllld      ",
  "    dmmmmlllllmmmmmd     ",
  "    dllllllhllllllld     ",
  "     dldddddddddlld      ",
  "     ddhbbbbbbbhdd       ",
  "    dmlhbbbbbbbhlmd      ",
  "   dmlldhbbbbbhllllmd    ",
  "  dmmmdmdhhhhhdmdmmmd    ",
  "  dlllldddddddddlllld    ",
];
const PALETTE: Record<string, string> = { d: "#20362e", m: "#49764b", l: "#8aa556", h: "#babe70", b: "#d8c695",
  w: "#efd887", p: "#20292a", g: "#a87636", y: "#ffd775", r: "#56bac1" };

function paintFerryman(c: Brush, t: number) {
  const breath = Math.sin(t * 2) > .65 ? 1 : 0;
  for (const [row, cells] of FERRYMAN.entries()) {
    for (let col = 0; col < cells.length; col++) {
      const pigment = PALETTE[cells[col]];
      if (pigment) box(c, row === 5 && t % 3.1 < .16 ? PALETTE.l : pigment, 165 + col * 2, 406 + row * 2 + (row < 9 ? breath : 0), 2, 2);
    }
  }
  const pull = clamp((t - 3.75) / .4);
  const bob = Math.round(Math.sin(t * 3) - pull * 7), tip = 413 - pull * 12;
  line(c, "#c79a65", [198, 429, 212, 414 - pull * 4, 224, tip - 2, 230, tip]);
  line(c, "#91afab", [230, tip + 1, 233, 429 - pull * 8, 233, 451 + bob]);
  box(c, "#c95c4c", 231, 449 + bob, 4, 3); box(c, "#ffddae", 231, 452 + bob, 4, 1);
}

let backdrop: HTMLCanvasElement | undefined;
function wellBackdrop() {
  if (backdrop) return backdrop;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) return;
  paintShaft(c); paintPool(c);
  backdrop = canvas;
  return canvas;
}

export const WELL_REVEAL_AT = .45, WELL_RETURN_AT = WELL_REVEAL_AT + 5.1;
export const fullyInsideWell = () => soulWellFall.active && soulWellFall.elapsed >= WELL_REVEAL_AT + .22;
export function drawWellInterior(ctx: Brush, width: number, height: number, drawPlayer?: () => void) {
  const t = soulWellFall.elapsed - WELL_REVEAL_AT;
  if (!soulWellFall.active || t <= 0) return;
  const image = wellBackdrop();
  if (!image) return;
  const travel = clamp(t / 1.75), ease = travel * travel * (3 - 2 * travel);
  const scale = Math.max(height / 200, Math.min(width / W, height / 138));
  // When the ferryman's line goes taut the view lifts back up the shaft.
  const lift = clamp((t - 4.15) / 1.25);
  const top = (421 - height / scale * .60) * ease * (1 - lift * lift);
  ctx.save();
  ctx.globalAlpha = clamp(t / .22);
  box(ctx, "#0b1620", 0, 0, width, height);
  ctx.translate(Math.round(width / 2 - CENTER * scale), -Math.round(top * scale));
  ctx.scale(scale, scale);
  ctx.drawImage(image, 0, 0);
  paintFerryman(ctx, t);
  const impact = 1.95, splash = t - impact;
  const descent = clamp(t / impact);
  const waterline = WATER + 9;
  if (splash < .32) {
    const feet = top + height / scale * .32;
    const y = feet + (waterline - feet) * descent ** 3 + Math.max(0, splash) * 230;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, waterline); ctx.clip();
    ctx.translate(CENTER + Math.sin(descent * Math.PI) * 10, y);
    ctx.rotate(Math.sin(descent * Math.PI * 1.6) * .25);
    drawPlayer?.();
    ctx.restore();
  }
  if (splash >= 0 && splash < 1.7) {
    for (let i = 0; i < 3; i++) {
      const age = splash - i * .14;
      if (age < 0) continue;
      ctx.strokeStyle = `rgba(191,247,234,${.8 * (1 - age / 1.7)})`;
      ctx.lineWidth = 2 - age;
      ctx.beginPath(); ctx.ellipse(CENTER, waterline, 5 + age * 55, 2 + age * 10, 0, 0, Math.PI * 2); ctx.stroke();
    }
    const crest = Math.sin(Math.PI * clamp(splash / .65));
    if (crest > .01) {
      for (const side of [-1, 1]) {
        const x = CENTER + side * splash * 30;
        ctx.fillStyle = "#60b5be"; ctx.beginPath(); ctx.moveTo(x, waterline);
        for (const [dx, dy] of [[8,-10],[12,-31],[17,-22],[28,-43],[24,-13],[34,-18],[26,0]]) ctx.lineTo(x + side * dx, waterline + dy * crest);
        ctx.fill(); line(ctx, "#dbfff3", [x + side * 17, waterline - 22 * crest, x + side * 28, waterline - 43 * crest], 2);
      }
    }
  }
  if (splash > 0 && splash < 1.3) {
    for (let i = 0; i < 28; i++) {
      const angle = (i + .5) * Math.PI / 28;
      const x = CENTER + Math.cos(angle) * splash * (65 + noise(i) * 35);
      const y = WATER + 9 - Math.sin(angle) * splash * (125 + noise(i) * 75) + splash * splash * 155;
      if (y < WATER + 10) box(ctx, "#a1d6cd", x, y, 2, 3);
    }
  }
  for (let ring = 0; ring < 3; ring++) {
    const k = ((t + ring * .55) % 1.65) / 1.65;
    ctx.strokeStyle = `rgba(145,209,198,${.48 * (1 - k)})`;
    ctx.lineWidth = .8; ctx.beginPath();
    ctx.ellipse(233, 454, 2 + k * 18, 1 + k * 4, 0, 0, 2 * Math.PI); ctx.stroke();
  }
  for (let i = 0; i < 6; i++) box(ctx, "#9b8156", 215 + Math.sin(t * 2 + i) * (i + 1), WATER + 2 + i * 2, 6 - i * .6, 1);
  ctx.restore();
}
