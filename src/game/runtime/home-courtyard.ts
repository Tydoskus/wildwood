import { HOME_ART_OFFSET, HOME_WORLD_WIDTH, HOME_WORLD_HEIGHT } from "../../../shared/home";

/** Reference-inspired Home artwork in world coordinates. Ground is cached in static tiles. */
type ArtContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const INK = "#3a3525";

function polygon(c: ArtContext, points: number[], fill: string, stroke = INK, width = 2) {
  c.beginPath();
  c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.closePath(); c.fillStyle = fill; c.fill();
  if (width) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function box(c: ArtContext, x: number, y: number, w: number, h: number, fill: string, radius = 3, stroke = INK) {
  c.beginPath(); c.roundRect(x, y, w, h, radius); c.fillStyle = fill; c.fill();
  c.strokeStyle = stroke; c.lineWidth = 2; c.stroke();
}
function ellipse(c: ArtContext, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke?: string) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
}
function line(c: ArtContext, points: number[], color: string, width = 2) {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

function planter(c: ArtContext, x: number, y: number, tall = false) {
  ellipse(c, x + 3, y + 3, 19, 7, "#203e2c55");
  polygon(c, [x - 15, y - 20, x + 15, y - 20, x + 11, y + 1, x - 10, y + 1], "#a77842");
  ellipse(c, x, y - 20, 16, 7, "#c09960", "#4b412a");
  ellipse(c, x, y - 21, 12, 4, "#493f27");
  if (tall) {
    for (let row = 0; row < 3; row++) for (const side of [-1, 1]) {
      const yy = y - 25 - row * 12;
      polygon(c, [x, yy + 5, x + side * (18 - row * 3), yy - 9, x + side * 8, yy - 22, x, yy - 5], row % 2 ? "#548946" : "#3c713b", "#284c2b", 1.5);
    }
    polygon(c, [x - 5, y - 48, x, y - 76, x + 8, y - 54, x, y - 39], "#659149", "#284c2b", 1.5);
  } else {
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4;
      ellipse(c, x + Math.cos(a) * 10, y - 37 + Math.sin(a) * 12, 10, 12, i % 3 ? "#447e43" : "#5c9148", "#35623a");
    }
    ellipse(c, x - 3, y - 42, 11, 13, "#568b44");
  }
}

function lantern(c: ArtContext, x: number, y: number) {
  const glow = c.createRadialGradient(x, y - 15, 2, x, y - 15, 29);
  glow.addColorStop(0, "#ffdc7160"); glow.addColorStop(1, "#ffdc7100");
  ellipse(c, x, y - 15, 30, 30, glow);
  box(c, x - 10, y - 30, 20, 31, "#4c5145", 3);
  box(c, x - 6, y - 26, 12, 23, "#f9d66b", 2, "#b59647");
  box(c, x - 2, y - 24, 5, 18, "#fff4af", 1, "#fff0a0");
  polygon(c, [x - 12, y - 31, x - 5, y - 40, x + 5, y - 40, x + 12, y - 31], "#646655");
  box(c, x - 3, y - 45, 6, 7, "#737466", 2);
}

function crate(c: ArtContext, x: number, y: number, books = false) {
  polygon(c, [x - 24, y - 30, x + 5, y - 40, x + 25, y - 29, x - 4, y - 18], "#ac7b49");
  polygon(c, [x - 24, y - 30, x - 4, y - 18, x - 4, y + 18, x - 24, y + 5], "#88603d");
  polygon(c, [x - 4, y - 18, x + 25, y - 29, x + 25, y + 8, x - 4, y + 18], "#9a7046");
  for (let i = 0; i < 3; i++) line(c, [x + i * 9, y - 17 - i * 3, x + i * 9, y + 14 - i * 3], "#57452c", 1.5);
  line(c, [x - 2, y + 13, x + 22, y - 24], "#c09259", 5);
  if (books) for (let i = 0; i < 3; i++) {
    box(c, x - 14 + i % 2 * 4, y - 43 - i * 7, 30, 8, ["#815044", "#c9b58a", "#466c60"][i], 1);
  }
}

function stone(c: ArtContext, x: number, y: number, w: number, h = 23) {
  box(c, x + 2, y + 7, w, h, "#6e6a51", 3);
  box(c, x, y, w, h - 5, "#a99c7b", 3);
  line(c, [x + 4, y + 3, x + w - 4, y + 3], "#c5b794", 2);
}

function banner(c: ArtContext, x: number, blue: boolean) {
  const y = 285;
  polygon(c, [x - 28, y, x + 28, y, x + 28, y + 69, x, y + 89, x - 28, y + 69], blue ? "#23536a" : "#873b35");
  line(c, [x - 23, y + 4, x - 23, y + 66, x, y + 82, x + 23, y + 66, x + 23, y + 4], blue ? "#4b8291" : "#b58b46", 2);
  if (blue) { c.strokeStyle = "#8ad5dd"; c.lineWidth = 3; c.strokeRect(x - 11, y + 26, 22, 22); }
  else {
    line(c, [x - 14, y + 49, x + 13, y + 24], "#e8cfaa", 4);
    line(c, [x - 13, y + 24, x + 14, y + 49], "#e8cfaa", 4);
    polygon(c, [x - 19, y + 24, x - 12, y + 17, x - 4, y + 25, x - 11, y + 32], "#e8cfaa", "", 0);
    polygon(c, [x + 19, y + 24, x + 12, y + 17, x + 4, y + 25, x + 11, y + 32], "#e8cfaa", "", 0);
  }
}

/** Draw in world space, after grass and before players and interactable stations. */
export function drawHomeCourtyard(c: ArtContext) {
  c.save(); c.lineJoin = "round"; c.lineCap = "round";
  c.translate(HOME_ART_OFFSET.x, HOME_ART_OFFSET.y);
  for (let i = 0; i < Math.round(HOME_WORLD_WIDTH * HOME_WORLD_HEIGHT / 10_000); i++) {
    const x = 34 + i * 137 % (HOME_WORLD_WIDTH - 70) - HOME_ART_OFFSET.x;
    const y = 80 + i * 223 % (HOME_WORLD_HEIGHT - 130) - HOME_ART_OFFSET.y;
    if ((x > 206 && x < 794 && y > 240 && y < 665) || (x > 399 && x < 601 && y > 600 && y < 900)) continue;
    c.beginPath(); c.moveTo(x - 11, y);
    c.quadraticCurveTo(x - 18, y - 18, x - 5, y - 8);
    c.quadraticCurveTo(x - 3, y - 30, x + 3, y - 9);
    c.quadraticCurveTo(x + 22, y - 21, x + 12, y);
    c.closePath(); c.fillStyle = "#447f4c"; c.fill(); c.strokeStyle = "#316844"; c.lineWidth = 1.5; c.stroke();
  }
  for (const [x, y] of [[260, 781], [741, 787], [192, 358], [808, 503]]) {
    ellipse(c, x, y + 4, 29, 9, "#285b3c88");
    polygon(c, [x - 25, y, x - 16, y - 23, x + 1, y - 34, x + 20, y - 19, x + 28, y + 2, x + 10, y + 8], "#727f79", "#394d42", 2.5);
    polygon(c, [x - 16, y - 23, x + 1, y - 34, x + 10, y - 19, x - 1, y - 7], "#929d90", "", 0);
    polygon(c, [x + 10, y - 19, x + 20, y - 19, x + 28, y + 2, x + 10, y + 8, x - 1, y - 7], "#56685f", "", 0);
  }
  // Broad paved wings, a circular meeting point, and one clear southern approach.
  const outline = [246, 344, 754, 344, 770, 366, 770, 594, 752, 619, 602, 619, 580, 655, 550, 672, 550, 875, 450, 875, 450, 672, 420, 655, 398, 619, 248, 619, 230, 594, 230, 366];
  c.save(); c.translate(4, 9); polygon(c, outline, "#244e3555", "", 0); c.restore();
  polygon(c, outline, "#b6a381", "#514d39", 3);
  c.save();
  c.beginPath(); c.moveTo(outline[0], outline[1]);
  for (let i = 2; i < outline.length; i += 2) c.lineTo(outline[i], outline[i + 1]);
  c.closePath(); c.clip();
  for (let row = 0; row < 22; row++) for (let col = 0; col < 20; col++) {
    const x = 216 + col * 31 + row % 2 * 15, y = 338 + row * 25;
    box(c, x, y, 29, 23, (row * 7 + col * 3) % 5 ? "#b5a17e" : "#beac89", 3, "#a99878");
  }
  box(c, 463, 650, 74, 226, "#bca886", 2, "#ae9975");
  ellipse(c, 500, 586, 101, 86, "#bba887", "#998c6d");
  ellipse(c, 500, 586, 84, 70, "#baa783", "#ad9975");
  for (let i = 0; i < 90; i++) {
    const x = 244 + (i * 137 % 512), y = 350 + (i * 83 % 520);
    ellipse(c, x, y, i % 3 + 1, 1.2, "#8f805c35");
  }
  c.restore();
  // Low stone curbs leave the entrance and station approaches open.
  for (const [start, end] of [[.3, 1.06], [2.08, 2.84]]) {
    c.beginPath(); c.ellipse(500, 586, 101, 86, 0, start, end);
    c.strokeStyle = "#514d39"; c.lineWidth = 20; c.stroke();
    c.strokeStyle = "#ac9e7d"; c.lineWidth = 16; c.stroke();
    for (let a = start + .1; a < end; a += .23) line(c, [500 + Math.cos(a) * 92, 586 + Math.sin(a) * 78, 500 + Math.cos(a) * 110, 586 + Math.sin(a) * 94], "#7d765a", 2);
  }
  for (let x = 232; x < 400; x += 42) stone(c, x, 608, 42);
  for (let x = 602; x < 754; x += 40) stone(c, x, 608, 40);
  for (let y = 362; y < 598; y += 43) { stone(c, 228, y, 18, 43); stone(c, 754, y, 18, 43); }
  for (let y = 688; y < 870; y += 32) { stone(c, 448, y, 11, 30); stone(c, 541, y, 11, 30); }
  // Back wall and contrasting hanging station banners.
  box(c, 246, 291, 210, 72, "#a79776", 5);
  box(c, 544, 291, 210, 72, "#a79776", 5);
  for (const x of [252, 548]) for (let i = 0; i < 4; i++) {
    line(c, [x + i * 47, 318, x + i * 47 + 37, 318], "#918566", 1);
    line(c, [x + i * 47 + 19, 318, x + i * 47 + 19, 332], "#918566", 1);
  }
  banner(c, 380, false); banner(c, 620, true);
  for (const x of [246, 444, 544, 746]) { stone(c, x, 285, 17, 39); stone(c, x, 322, 17, 39); }
  // Rugs match each station and leave a generous central walkway.
  polygon(c, [291, 405, 442, 405, 442, 486, 420, 507, 291, 507], "#884d39", "#b5944e", 3);
  polygon(c, [559, 405, 713, 405, 713, 507, 583, 507, 559, 486], "#294e60", "#ae985b", 3);
  for (const x of [299, 705]) for (let y = 416; y < 490; y += 18) ellipse(c, x, y, 1.5, 1.5, "#c8aa68");
  for (const x of [265, 735]) {
    line(c, [x, 342, x, 279, x + (x < 500 ? 28 : -28), 287], "#4a3b28", 10);
    line(c, [x, 309, x + (x < 500 ? 20 : -20), 286], "#725337", 5);
    lantern(c, x + (x < 500 ? 27 : -27), 324);
  }
  planter(c, 441, 378, true); planter(c, 560, 378, true);
  planter(c, 268, 603); planter(c, 731, 603);
  crate(c, 270, 427); crate(c, 272, 478);
  crate(c, 735, 456, true); crate(c, 731, 502, true);
  // Cyan research vessel beside the books.
  box(c, 731, 397, 20, 36, "#235460", 6);
  box(c, 735, 403, 12, 25, "#55dbe0", 4, "#318e9c");
  ellipse(c, 741, 414, 3, 6, "#c6ffff"); ellipse(c, 741, 397, 10, 4, "#799b96", INK);
  for (const x of [430, 570]) {
    planter(c, x, 700);
    stone(c, x - 17, 728, 34, 39); lantern(c, x, 730);
  }
  c.restore();
}

/** Physical wooden signs sit above both stations at the same world-space size. */
export function drawHomeStationSign(c: CanvasRenderingContext2D, x: number, y: number, research: boolean, timer = "") {
  c.save();
  for (const dx of [-79, 79]) box(c, x + dx - 4, y - 151, 8, 28, "#795437", 2);
  box(c, x - 93, y - 177, 186, 37, "#a47548", 4);
  line(c, [x - 90, y - 165, x + 90, y - 165], "#835d3c", 1.5);
  line(c, [x - 90, y - 153, x + 90, y - 153], "#835d3c", 1.5);
  line(c, [x - 89, y - 174, x + 89, y - 174], "#c39861", 2);
  c.font = '900 15px "Arial Rounded MT Bold", Arial, sans-serif';
  c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
  c.strokeStyle = "#171810"; c.lineWidth = 4; c.fillStyle = "#fff1d2";
  const label = research ? "Tech Research" : "Loadout Upgrades";
  c.strokeText(label, x, y - 157, 174); c.fillText(label, x, y - 157, 174);
  if (timer) { c.font = '900 12px Arial'; c.strokeText(timer, x, y - 187); c.fillStyle = "#a4edf2"; c.fillText(timer, x, y - 187); }
  c.restore();
}

export function drawHomeResearchDesk(c: CanvasRenderingContext2D, x: number, y: number, time: number) {
  c.save(); c.translate(x, y);
  ellipse(c, 3, -12, 64, 14, "#122e3c44");
  box(c, -48, -53, 96, 40, "#344c55", 3);
  box(c, -45, -32, 8, 27, "#263b44", 2); box(c, 37, -32, 8, 27, "#263b44", 2);
  polygon(c, [-52, -72, 47, -72, 56, -46, -59, -46], "#b9a780");
  box(c, -59, -47, 115, 10, "#9f906e", 2);
  box(c, -7, -82, 14, 18, "#456c77", 2);
  box(c, -37, -124, 74, 56, "#75d7df", 3, "#1a3641");
  box(c, -32, -119, 64, 46, "#173e52", 1, "#c1f4ed");
  c.save(); c.translate(0, -97); c.rotate(Math.sin(time * .6) * .12);
  c.strokeStyle = "#9af1ec"; c.lineWidth = 3; c.strokeRect(-11, -11, 22, 22); c.restore();
  box(c, -49, -74, 6, 8, "#70b4bc", 1);
  c.restore();
}
