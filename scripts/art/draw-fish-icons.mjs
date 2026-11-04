// Draws the fish bag icons in the arrows' flat style: thick dark outline, flat fills, one shadow and one light tone.
// Writes public/assets/wildstat/fish/<id>.webp (128 × 128); an optional path also writes a preview strip.
//
//   node scripts/art/draw-fish-icons.mjs [preview.png]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const sharp = createRequire(import.meta.url)(resolve(root, "node_modules/sharp"));
const OUT = resolve(root, "public/assets/wildstat/fish");
const SIZE = 128;
const INK = "#15181b";
const EYE = "#f6f5f1";
const TILT = -15;

let clipIds = 0;
const p = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
const line = (d, color, width) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const oval = (x, y, rx, ry, fill, turn = 0) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${turn} ${x} ${y})"/>`;

// A filled part with its shading clipped inside; edge draws a thin outline where it sits over other parts.
function part(d, fill, shading = [], edge = 0) {
  const id = `c${clipIds++}`;
  return (edge ? line(d, INK, edge) : "")
    + `<clipPath id="${id}"><path d="${d}"/></clipPath>${p(d, fill)}`
    + (shading.length ? `<g clip-path="url(#${id})">${shading.join("")}</g>` : "");
}

// The thick outer outline: every silhouette piece stroked wide underneath.
const underlay = (u, pieces) =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${12 * u}" stroke-linejoin="round" stroke-linecap="round">${pieces.map((d) => `<path d="${d}"/>`).join("")}</g>`;

// Barbels sit on top of everything, each with its own thin outline.
const whiskers = (u, list, color) =>
  list.map(({ d, w }) => line(d, INK, (w + 4) * u)).join("") + list.map(({ d, w }) => line(d, color, w * u)).join("");

function eye(u, x, y, r) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${EYE}" stroke="${INK}" stroke-width="${3 * u}"/>`
    + dot(x + r * 0.22, y + r * 0.05, r * 0.55, INK) + dot(x - r * 0.12, y - r * 0.32, r * 0.24, "#ffffff");
}

// Points along a cubic curve, each with its unit normal (pointing down while the curve runs right).
function along([a, b, c, d], steps) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps, s = 1 - t;
    const at = (k) => s * s * s * a[k] + 3 * s * s * t * b[k] + 3 * s * t * t * c[k] + t * t * t * d[k];
    const slope = (k) => 3 * s * s * (b[k] - a[k]) + 6 * s * t * (c[k] - b[k]) + 3 * t * t * (d[k] - c[k]);
    const length = Math.hypot(slope(0), slope(1));
    points.push({ t, x: at(0), y: at(1), nx: -slope(1) / length, ny: slope(0) / length });
  }
  return points;
}
const poly = (points) => `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")} Z`;

// A lobster claw pointing right from (x, y), its two fingers slightly open.
function pincer(x, y, s) {
  const at = (px, py) => `${x + px * s} ${y + py * s}`;
  return `M${at(0, 0)} C${at(0, -8)} ${at(6, -10)} ${at(12, -8)} C${at(20, -8)} ${at(26, -6)} ${at(28, -2)} C${at(22, -2)} ${at(18, -1)} ${at(15, 0)}`
    + ` C${at(19, 1)} ${at(23, 2)} ${at(27, 3)} C${at(24, 8)} ${at(18, 10)} ${at(12, 8)} C${at(6, 10)} ${at(0, 8)} ${at(0, 0)} Z`;
}

const fish = {
  minnow: {
    width: 0.6,
    draw(u) {
      const body = "M116 64 C110 52 90 50 70 51 C50 52 38 58 30 60 L30 68 C40 71 60 78 78 78 C98 78 112 74 116 64 Z";
      const tail = "M34 59 Q22 50 12 46 Q18 58 20 64 Q18 70 12 82 Q22 78 34 69 Z";
      const dorsal = "M78 53 Q70 40 62 38 Q58 46 56 54 Z";
      const anal = "M54 74 Q48 84 42 84 Q42 78 42 71 Z";
      const pelvic = "M78 76 Q74 86 68 86 Q66 80 66 76 Z";
      const fin = "#a9b8c4", finShade = "#8597a6";
      return underlay(u, [tail, dorsal, anal, pelvic, body])
        + part(tail, fin, [p("M0 64 L40 64 L40 100 L0 100 Z", finShade)])
        + part(dorsal, fin, [p("M50 30 L66 30 L60 56 L50 56 Z", finShade)])
        + part(anal, fin, [p("M30 78 L60 78 L60 90 L30 90 Z", finShade)])
        + part(pelvic, fin, [p("M60 81 L84 81 L84 90 L60 90 Z", finShade)])
        + part(body, "#c5d0d8", [
          p("M20 40 L124 40 L124 61 C100 58 70 58 20 63 Z", "#5f7d96"),
          p("M100 50 C88 50 70 51 56 54 C70 53 88 53 104 56 Z", "#7f9cb4"),
          p("M20 67 C60 67 96 68 124 66 L124 90 L20 90 Z", "#eef2f4"),
          p("M20 72 C60 75 96 77 124 70 L124 90 L20 90 Z", "#c9d3da"),
          line("M98 64 C80 62.5 56 63 32 64.5", "#7b8e9c", 2.5 * u),
        ], 6 * u)
        + line("M100 54 Q94 63 99 73", INK, 3 * u)
        + line("M116 64 L110 66", INK, 3 * u)
        + `<ellipse cx="86" cy="55" rx="5" ry="1.8" fill="#ffffff" transform="rotate(-4 86 55)"/>`
        + eye(u, 107, 60.5, 6.5);
    },
  },

  perch: {
    width: 0.85,
    draw(u) {
      const body = "M114 66 C110 48 88 40 70 40 C52 40 40 52 34 57 L34 71 C44 78 60 86 78 86 C98 86 112 78 114 66 Z";
      const tail = "M38 57 Q26 48 14 42 Q20 54 23 64 Q20 74 14 86 Q26 80 38 71 Z";
      const dorsal = "M98 50 L95 29 L89 38 L83 24 L77 36 L71 23 L65 35 L59 26 L54 44 Z";
      const soft = "M54 46 Q50 34 40 39 L36 54 Z";
      const pelvic = "M88 80 Q84 96 74 100 Q70 90 70 82 Z";
      const anal = "M58 78 Q54 92 44 92 Q42 84 42 74 Z";
      const red = "#ee6a2e", redShade = "#c4471c", redLight = "#ff9a5c";
      const bars = [99, 88, 77, 66, 55, 45].map((x) => p(`M${x - 5} 30 L${x + 4} 30 L${x + 1} 74 L${x - 2} 74 Z`, "#4b5f1d")).join("");
      return underlay(u, [tail, dorsal, soft, pelvic, anal, body])
        + part(tail, "#c9a43a", [p("M0 64 L40 64 L40 100 L0 100 Z", "#a07e25"), line("M36 60 L18 48 M36 64 L22 64 M36 68 L18 80", "#a07e25", 2 * u)])
        + part(dorsal, "#a8b54e", [p("M50 36 L100 36 L100 60 L50 60 Z", "#7d8a33"), line("M95 34 L93 46 M83 28 L82 44 M71 27 L71 44 M59 30 L60 44", INK, 2.5 * u)])
        + part(soft, "#a8b54e", [p("M30 44 L60 44 L60 60 L30 60 Z", "#7d8a33")])
        + part(pelvic, red, [p("M60 90 L92 84 L92 110 L60 110 Z", redShade), p("M84 82 Q80 92 76 96 L78 82 Z", redLight)])
        + part(anal, red, [p("M30 86 L62 84 L62 100 L30 100 Z", redShade)])
        + part(body, "#7d9a32", [
          p("M20 64 C50 66 90 70 124 64 L124 100 L20 100 Z", "#f2cf4a"),
          p("M20 76 C56 80 92 86 124 74 L124 100 L20 100 Z", "#d9a52a"),
          p("M104 50 C92 44 72 43 56 48 C72 47 90 48 104 55 Z", "#9fbb4a"),
          bars,
        ], 6 * u)
        + line("M101 49 Q93 64 99 80", INK, 3 * u)
        + line("M114 66 Q109 69 104 68.5", INK, 3 * u)
        + `<ellipse cx="84" cy="45" rx="5" ry="2" fill="#ffffff" transform="rotate(-6 84 45)"/>`
        + eye(u, 104.5, 58, 6.8);
    },
  },

  bluegill: {
    width: 0.65,
    draw(u) {
      const body = "M110 63 C108 44 90 33 70 33 C52 33 42 47 36 56 L36 72 C42 82 54 95 72 95 C92 95 108 84 110 63 Z";
      const tail = "M40 56 Q28 46 17 43 Q22 55 24 64 Q22 73 17 85 Q28 82 40 72 Z";
      const dorsal = "M94 39 C88 24 70 19 56 23 C48 27 42 37 39 50 Z";
      const anal = "M62 89 C58 101 47 101 42 93 L39 76 Z";
      const pelvic = "M86 91 Q82 103 73 101 L71 89 Z";
      const fin = "#6f8264", finShade = "#55664c";
      const bars = [78, 66, 54].map((x) => p(`M${x - 4} 30 L${x + 4} 30 L${x + 2} 82 L${x - 2} 82 Z`, "#447060")).join("");
      return underlay(u, [tail, dorsal, anal, pelvic, body])
        + part(tail, fin, [p("M0 64 L44 64 L44 100 L0 100 Z", finShade)])
        + part(dorsal, fin, [p("M30 34 L100 30 L100 56 L30 56 Z", finShade), oval(47, 37, 4, 3.4, INK)])
        + part(anal, fin, [p("M30 92 L66 90 L66 104 L30 104 Z", finShade)])
        + part(pelvic, "#e89a3a", [p("M60 97 L90 95 L90 110 L60 110 Z", "#c47a26")])
        + part(body, "#4f7d6c", [
          p("M20 20 L124 20 L124 47 C100 43 70 43 20 50 Z", "#3b6457"),
          bars,
          p("M20 72 C50 76 84 74 124 66 L124 100 L20 100 Z", "#f2c04a"),
          p("M124 64 C110 68 96 72 80 74 C84 84 96 94 124 100 Z", "#ef8a32"),
          p("M20 84 C56 92 92 97 124 84 L124 100 L20 100 Z", "#c9762a"),
          p("M100 45 C90 39 74 38 60 41 C74 41 90 43 101 50 Z", "#6c9a86"),
        ], 6 * u)
        + line("M98 44 Q89 64 97 84", INK, 3 * u)
        + p("M93 53 C86 51 79 55 79 62 C79 69 86 71 92 68 Z", INK)
        + line("M110 63 Q107 66 104 65.5", INK, 3 * u)
        + `<ellipse cx="78" cy="40" rx="5" ry="2" fill="#ffffff" transform="rotate(-8 78 40)"/>`
        + eye(u, 102, 55, 7);
    },
  },

  trout: {
    width: 0.85,
    draw(u) {
      const body = "M118 62 C112 49 92 46 72 46 C52 46 40 52 32 56 L32 70 C42 74 60 80 80 80 C100 80 114 74 118 62 Z";
      const tail = "M36 56 Q24 48 12 42 Q19 54 20 63 Q19 72 12 86 Q24 78 36 70 Z";
      const dorsal = "M80 48 Q74 33 62 33 Q58 40 56 48 Z";
      const adipose = "M45 52 Q43 44 37 47 Q37 52 39 55 Z";
      const anal = "M54 76 Q50 90 42 88 Q42 80 42 73 Z";
      const pelvic = "M76 78 Q72 91 64 89 Q64 84 64 78 Z";
      const specks = [[100, 51], [92, 49], [84, 52], [76, 49], [70, 54], [62, 50], [56, 55], [50, 52], [44, 57], [88, 56], [96, 55], [80, 56]]
        .map(([x, y]) => dot(x, y, 1.7, INK)).join("");
      const finSpecks = [[22, 52], [28, 58], [20, 74], [28, 70], [66, 38], [72, 42], [62, 44]].map(([x, y]) => dot(x, y, 1.5, INK)).join("");
      return underlay(u, [tail, dorsal, adipose, anal, pelvic, body])
        + part(tail, "#a3925c", [p("M0 64 L40 64 L40 100 L0 100 Z", "#807142"), finSpecks])
        + part(dorsal, "#a3925c", [p("M50 41 L82 41 L82 52 L50 52 Z", "#807142"), finSpecks])
        + part(adipose, "#a3925c")
        + part(anal, "#e2a08a", [p("M30 82 L60 82 L60 96 L30 96 Z", "#c47f6a")])
        + part(pelvic, "#e2a08a", [p("M60 84 L80 84 L80 96 L60 96 Z", "#c47f6a")])
        + part(body, "#8a7a45", [
          p("M104 50 C92 47 74 47 58 50 C74 49 90 50 104 53 Z", "#a8975d"),
          p("M20 69 C60 68 96 70 124 66 L124 100 L20 100 Z", "#f1e9da"),
          p("M20 74 C60 76 96 78 124 70 L124 100 L20 100 Z", "#d6c8b0"),
          p("M120 62 C100 57 70 57 28 60 L28 70 C70 69 100 70 120 68 Z", "#e86f7e"),
          p("M120 66 C100 66 70 67 28 68 L28 70 C70 69 100 70 120 68 Z", "#c9505f"),
          p("M112 60 C100 58.5 80 58.5 60 59.5 L60 61 C80 60.5 100 60.5 112 61.5 Z", "#f4a0aa"),
          specks,
        ], 6 * u)
        + line("M102 50 Q95 62 101 76", INK, 3 * u)
        + line("M118 62 Q113 65 108 64.5", INK, 3 * u)
        + `<ellipse cx="86" cy="49.5" rx="5" ry="1.8" fill="#ffffff" transform="rotate(-3 86 49.5)"/>`
        + eye(u, 107.5, 56, 6.3);
    },
  },

  carp: {
    width: 0.85,
    draw(u) {
      const body = "M116 66 C110 47 92 37 70 37 C50 37 40 50 32 56 L32 72 C42 79 60 89 80 89 C100 89 114 80 116 66 Z";
      const tail = "M36 56 Q24 46 10 38 Q20 52 22 64 Q20 76 10 90 Q24 82 36 72 Z";
      const dorsal = "M90 42 Q86 26 74 25 L46 34 Q40 42 40 52 Z";
      const anal = "M54 82 Q52 96 42 95 Q40 86 40 77 Z";
      const pelvic = "M82 86 Q78 100 68 98 Q66 92 66 86 Z";
      const scales = [];
      for (let col = 0; col < 9; col += 1) {
        const x = 92 - col * 7;
        for (let row = -1; row < 5; row += 1) {
          const y = 36 + row * 14 + (col % 2) * 7;
          scales.push(`M${x} ${y - 7} A7 7 0 0 0 ${x} ${y + 7}`);
        }
      }
      return underlay(u, [tail, dorsal, anal, pelvic, body])
        + part(tail, "#c4823a", [p("M0 64 L40 64 L40 100 L0 100 Z", "#9a5f26"), line("M34 60 L16 46 M34 64 L22 64 M34 68 L16 82", "#9a5f26", 2 * u)])
        + part(dorsal, "#c4823a", [p("M40 38 L94 34 L94 56 L40 56 Z", "#9a5f26"), line("M84 30 L82 42 M74 28 L72 40 M64 30 L62 42 M54 33 L52 44", "#9a5f26", 2 * u)])
        + part(anal, "#c4823a", [p("M30 88 L60 86 L60 100 L30 100 Z", "#9a5f26")])
        + part(pelvic, "#c4823a", [p("M60 93 L90 91 L90 110 L60 110 Z", "#9a5f26")])
        + part(body, "#d9a03a", [
          p("M20 20 L124 20 L124 52 C100 46 70 46 20 52 Z", "#b9842c"),
          p("M20 70 C60 72 96 77 124 69 L124 100 L20 100 Z", "#f2d88a"),
          p("M20 79 C56 84 92 90 124 78 L124 100 L20 100 Z", "#d4ac5c"),
          `<g fill="none" stroke="#a06a1e" stroke-width="${2.2 * u}" stroke-linecap="round">${scales.map((d) => `<path d="${d}"/>`).join("")}</g>`,
          p("M100 44 C90 40 74 40 62 43 C74 43 90 45 101 50 Z", "#f2c860"),
        ], 6 * u)
        + whiskers(u, [{ d: "M113.5 69.5 Q117 75 115 80", w: 2 }, { d: "M109 70.5 Q110 76 106.5 80", w: 2 }], "#e0b056")
        + line("M100 46 Q91 64 99 84", INK, 3 * u)
        + line("M116 66 Q112 69.5 107 68.5", INK, 3 * u)
        + `<ellipse cx="80" cy="41.5" rx="5.5" ry="2" fill="#ffffff" transform="rotate(-6 80 41.5)"/>`
        + eye(u, 104.5, 57, 6.8);
    },
  },

  eel: {
    width: 0.84,
    height: 0.84,
    draw(u) {
      const spine = along([[10, 74], [40, 30], [78, 104], [116, 58]], 64);
      const half = (t) => (t > 0.86 ? 9.5 - (t - 0.86) * 14 : 1.5 + 8 * Math.min(1, t / 0.55) ** 0.8);
      const off = (q, k) => [q.x + q.nx * k, q.y + q.ny * k];
      const span = (from, to, k) => spine.filter((q) => q.t >= from && q.t <= to).map((q) => off(q, k(q.t)));
      const head = spine[spine.length - 1], r = half(1), tx = head.ny, ty = -head.nx;
      const cap = Array.from({ length: 13 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 12;
        return [head.x + tx * r * 1.5 * Math.cos(a) + head.nx * r * Math.sin(a), head.y + ty * r * 1.5 * Math.cos(a) + head.ny * r * Math.sin(a)];
      });
      const body = poly([...span(0, 1, (t) => -half(t)), ...cap, ...span(0, 1, (t) => half(t)).reverse()]);
      const tail = spine[0], ttx = tail.ny, tty = -tail.nx;
      const fin = poly([
        ...span(0, 0.56, (t) => -half(t) - 5.5 * Math.min(1, (0.56 - t) / 0.2)).reverse(),
        [tail.x - ttx * 8, tail.y - tty * 8],
        ...span(0, 0.42, (t) => half(t) + 5 * Math.min(1, (0.42 - t) / 0.15)),
        ...span(0.42, 0.56, () => 0),
      ]);
      const band = (from, to, a, b) => poly([...span(from, to, (t) => half(t) * a), ...span(from, to, (t) => half(t) * b).reverse()]);
      const near = spine.find((q) => q.t >= 0.95), cheek = spine.find((q) => q.t >= 0.88);
      const gill = spine.find((q) => q.t >= 0.84), gillFront = spine.find((q) => q.t >= 0.87);
      const [ex, ey] = off(near, -half(0.95) * 0.32);
      const tip = [head.x + tx * r * 1.5 + head.nx * 1.5, head.y + ty * r * 1.5 + head.ny * 1.5];
      const [mx, my] = off(cheek, half(0.88) * 0.3);
      return underlay(u, [fin, body])
        + part(fin, "#8a8150", [p(band(0, 1, 0, 3), "#6b6440")])
        + part(body, "#5e5a33", [
          p(band(0.06, 1, 0.12, 1.6), "#e3d69a"),
          p(band(0.06, 1, 0.62, 1.6), "#c4b678"),
          p(band(0.32, 0.84, -0.72, -0.42), "#7c7748"),
          p(poly([...cap.slice(6), off(head, r * 0.12)]), "#e3d69a"),
        ], 6 * u)
        + line(`M${tip[0]} ${tip[1]} L${mx} ${my}`, INK, 3 * u)
        + line(`M${off(gill, -half(0.86) * 0.55).join(" ")} Q${off(gillFront, 0).join(" ")} ${off(gill, half(0.86) * 0.55).join(" ")}`, INK, 3 * u)
        + eye(u, ex, ey, 4.6);
    },
  },

  salmon: {
    width: 0.85,
    draw(u) {
      const body = "M117 57 C110 46 90 42 70 42 C52 42 40 50 32 55 L32 69 C42 74 60 82 80 82 C98 82 112 77 118 69 Q125 64 122 57 Q120 61 115 62.5 Q117 60 117 57 Z";
      const tail = "M36 55 Q22 44 9 37 Q17 52 22 62 Q17 73 9 88 Q22 80 36 69 Z";
      const dorsal = "M80 44 Q74 28 63 29 Q59 37 56 44 Z";
      const adipose = "M45 50 Q43 43 37 45 Q37 50 39 53 Z";
      const anal = "M54 78 Q49 91 41 89 Q41 80 42 72 Z";
      const pelvic = "M76 81 Q72 93 64 91 Q64 85 64 80 Z";
      const fin = "#8fa3b0", finShade = "#6e8392";
      const spots = [[96, 47], [86, 46], [76, 47], [66, 47], [58, 50], [50, 51], [80, 51], [70, 52]].map(([x, y]) => dot(x, y, 1.6, INK)).join("");
      const tailSpots = [[24, 50], [30, 56], [20, 76], [28, 72], [70, 36], [64, 40]].map(([x, y]) => dot(x, y, 1.4, INK)).join("");
      return underlay(u, [tail, dorsal, adipose, anal, pelvic, body])
        + part(tail, fin, [p("M0 62 L40 62 L40 100 L0 100 Z", finShade), tailSpots])
        + part(dorsal, fin, [p("M50 38 L82 38 L82 50 L50 50 Z", finShade), tailSpots])
        + part(adipose, fin)
        + part(anal, fin, [p("M30 82 L60 82 L60 96 L30 96 Z", finShade)])
        + part(pelvic, fin, [p("M60 85 L80 85 L80 96 L60 96 Z", finShade)])
        + part(body, "#d3dbe0", [
          p("M20 30 L124 30 L124 55 C100 52 70 52 20 58 Z", "#4f7086"),
          p("M104 47 C92 44 74 44 58 47 C74 46 90 47 104 50 Z", "#6d8fa5"),
          p("M20 74 C60 77 96 79 124 72 L124 100 L20 100 Z", "#eef2f4"),
          p("M20 78 C60 81 96 83 124 76 L124 100 L20 100 Z", "#c4ced5"),
          p("M115 61 C102 55 76 56 42 61 C38 63 38 67 42 69 C76 76 102 77 112 71 C117 68 118 63 115 61 Z", "#f39a7a"),
          p("M42 68 C76 71 100 72 114 68.5 C110 73 100 77 76 75 C62 74 50 71 42 68 Z", "#d97a5c"),
          p("M106 59.5 C94 58 76 58.5 58 61 C76 60 94 60 106 61.5 Z", "#ffc0a3"),
          spots,
        ], 6 * u)
        + line("M100 47 Q93 60 99 76", INK, 3 * u)
        + line("M115 62.5 L107 64", INK, 3 * u)
        + `<ellipse cx="86" cy="45.5" rx="5" ry="1.8" fill="#ffffff" transform="rotate(-3 86 45.5)"/>`
        + eye(u, 106, 54.5, 6.2);
    },
  },

  catfish: {
    width: 0.85,
    draw(u) {
      const body = "M122 70 C122 62 119 58 110 58 C100 58 90 49 74 49 C58 49 44 56 30 60 L30 70 C44 73 58 79 76 80 C90 81 100 83 110 83 C118 83 122 78 122 70 Z";
      const tail = "M34 59 Q22 47 12 46 Q18 57 18 64.5 Q18 72 12 83 Q22 82 34 70 Z";
      const dorsal = "M84 52 Q81 37 72 36 L67 50 Z";
      const adipose = "M48 54 Q44 47 38 51 L37 59 Z";
      const anal = "M72 79 Q62 91 40 85 L31 71 Z";
      const pelvic = "M86 82 Q82 91 75 89 L74 81 Z";
      const fin = "#6a6258", finShade = "#544d45";
      return underlay(u, [tail, dorsal, adipose, anal, pelvic, body])
        + part(tail, fin, [p("M0 64.5 L40 64.5 L40 100 L0 100 Z", finShade)])
        + part(dorsal, fin, [p("M60 44 L90 44 L90 56 L60 56 Z", finShade)])
        + part(adipose, fin)
        + part(anal, fin, [p("M20 82 L80 82 L80 100 L20 100 Z", finShade)])
        + part(pelvic, fin, [p("M60 86 L90 86 L90 96 L60 96 Z", finShade)])
        + part(body, "#7d7468", [
          p("M116 60 C100 60 92 51 70 52 C88 54 98 63 116 63 Z", "#9a9284"),
          p("M20 69 C60 70 96 76 124 73 L124 100 L20 100 Z", "#e0d6c4"),
          p("M20 74 C60 77 96 81 124 78 L124 100 L20 100 Z", "#bfb39d"),
          oval(86, 64, 3, 2, "#645c52"), oval(74, 58, 2.6, 1.8, "#645c52"), oval(62, 64, 2.4, 1.7, "#645c52"), oval(50, 61, 2, 1.5, "#645c52"),
        ], 6 * u)
        + line("M104 59 Q98 70 103 81", INK, 3 * u)
        + line("M122 71 Q117 74 107 73", INK, 3 * u)
        + `<ellipse cx="86" cy="53" rx="4.5" ry="1.6" fill="#ffffff" transform="rotate(-10 86 53)"/>`
        + eye(u, 113, 64, 4)
        + whiskers(u, [
          { d: "M121 69 C130 67 136 77 132 91", w: 2.2 },
          { d: "M108 74 C105 84 96 90 82 90", w: 2.2 },
          { d: "M119 80 Q121 85 119 89", w: 1.8 },
          { d: "M114 82.5 Q115 87 112 90", w: 1.8 },
        ], "#b0a696");
    },
  },

  pike: {
    width: 0.85,
    draw(u) {
      const body = "M124 61 Q124 56.5 118 56.5 L102 54.5 C92 51 80 50.5 66 51 C50 52 40 55 30 58 L30 69 C44 71 56 75 70 75 C86 75 96 73 104 71 L118 66 Q124 65 124 61 Z";
      const tail = "M34 58 Q22 48 11 43 Q18 55 20 63.5 Q18 72 11 84 Q22 79 34 69 Z";
      const dorsal = "M52 53 Q48 40 38 42 L33 58 Z";
      const anal = "M52 73 Q48 86 38 84 L33 69 Z";
      const pelvic = "M76 74 Q74 84 67 82 L65 73 Z";
      const fin = "#c27a3a", finShade = "#96572a";
      const spots = [];
      for (let row = 0; row < 3; row += 1) {
        for (let x = 94 - row * 4; x > 34; x -= 9) spots.push(oval(x, 57 + row * 5.5, 3, 1.8, "#e8df8c", -4));
      }
      return underlay(u, [tail, dorsal, anal, pelvic, body])
        + part(tail, fin, [p("M0 63.5 L40 63.5 L40 100 L0 100 Z", finShade), oval(22, 52, 2.4, 1.5, "#6b3f1e"), oval(22, 76, 2.4, 1.5, "#6b3f1e")])
        + part(dorsal, fin, [p("M30 50 L56 50 L56 60 L30 60 Z", finShade), oval(42, 47, 2.2, 1.4, "#6b3f1e")])
        + part(anal, fin, [p("M30 78 L56 78 L56 90 L30 90 Z", finShade)])
        + part(pelvic, fin, [p("M60 78 L80 78 L80 90 L60 90 Z", finShade)])
        + part(body, "#3e6b3a", [
          p("M100 53.5 C90 52 76 52 62 53.5 C76 53.5 90 54.5 100 56.5 Z", "#5c8a4f"),
          spots.join(""),
          p("M20 69 C56 70 90 70.5 124 64.5 L124 100 L20 100 Z", "#e6e2b0"),
          p("M20 72 C56 75 90 75 124 67 L124 100 L20 100 Z", "#c7c18a"),
        ], 6 * u)
        + line("M100 55 Q95 63 99.5 71", INK, 3 * u)
        + line("M123 62 L104 64", INK, 3 * u)
        + `<ellipse cx="84" cy="53" rx="5" ry="1.5" fill="#ffffff" transform="rotate(-2 84 53)"/>`
        + eye(u, 109, 58.5, 5.4);
    },
  },

  lobster: {
    width: 0.84,
    height: 0.84,
    draw(u) {
      const red = "#e0482a", redShade = "#b23218", redLight = "#ff8058";
      const shell = "M48 54 C56 45 76 42 90 46 C96 48 100 52 109 56 C101 58 99 62 97 66 C93 74 83 78 71 78 C61 78 52 76 48 70 C45 65 45 59 48 54 Z";
      const tail = "M52 55 C42 53 30 56 20 60 L19 75 C30 79 42 80 52 77 Z";
      const fan = "M23 60 C16 52 7 51 4 57 C2 63 2 72 4 78 C7 84 16 83 23 75 Z";
      const nearArm = "M84 66 L97 76 L101 74 L104 79 L100 87 L93 83 L80 72 Z";
      const farArm = "M86 53 L93 43 L97 36 L102 36 L102 42 L97 46 L91 57 Z";
      const nearClaw = pincer(100, 80, 1), farClaw = pincer(100, 36, 0.85);
      const legs = ["M58 76 L54 84 L49 88", "M65 77 L62 86 L58 91", "M72 77 L71 86 L67 92", "M79 76 L80 85 L77 91"].map((d) => ({ d, w: 2.2 }));
      const feelers = [{ d: "M95 50 C94 30 78 16 50 14", w: 2.2 }, { d: "M92 50 C98 34 92 18 74 8", w: 2.2 }];
      return whiskers(u, feelers, red)
        + whiskers(u, legs, redShade)
        + underlay(u, [farArm, farClaw])
        + part(farArm, redShade)
        + part(farClaw, redShade, [p("M90 20 L130 20 L130 32 L90 32 Z", red)])
        + underlay(u, [fan, tail, shell, nearArm, nearClaw])
        + part(fan, red, [p("M0 68 L24 68 L24 90 L0 90 Z", redShade), line("M21 66 L6 59 M21 68 L4 68 M21 70 L6 77", redShade, 2 * u)])
        + part(tail, red, [
          p("M10 69 C30 71 42 72 56 70 L56 90 L10 90 Z", redShade),
          p("M48 57 C40 56 30 58 22 61 C30 59 40 59 48 59.5 Z", redLight),
          line("M44 54.5 Q41.5 66 44 78.5 M36 55.5 Q33.5 67 36 79 M28 57.5 Q25.5 68 28 78", INK, 2.5 * u),
        ], 6 * u)
        + part(shell, red, [
          p("M40 66 C60 70 84 70 112 60 L112 90 L40 90 Z", redShade),
          p("M86 49 C76 46 62 47 54 52 C62 50 74 50 88 53 Z", redLight),
          line("M70 45 Q65 60 71 77", redShade, 2.5 * u),
          dot(62, 60, 1.6, redShade), dot(80, 58, 1.6, redShade), dot(58, 68, 1.4, redShade),
        ], 6 * u)
        + part(nearArm, red, [p("M80 76 L106 80 L106 90 L80 90 Z", redShade)], 6 * u)
        + part(nearClaw, red, [p("M96 83 L130 81 L130 92 L96 92 Z", redShade), p("M104 75 C108 72 114 72 118 73 C114 74 108 75 104 77 Z", redLight)], 6 * u)
        + line("M98 52 L99 48", INK, 3 * u)
        + dot(99.5, 47, 3.6, INK) + dot(98.4, 45.8, 1.2, "#ffffff");
    },
  },

  jellyfish: {
    width: 0.84,
    height: 0.86,
    tilt: 0,
    draw(u) {
      const rim = Array.from({ length: 6 }, (_, i) => {
        const x0 = 104 - (i * 80) / 6, x1 = x0 - 80 / 6;
        return `Q${(x0 + x1) / 2} 71 ${x1} 62`;
      }).join(" ");
      const bell = `M24 62 C24 34 42 16 64 16 C86 16 104 34 104 62 ${rim} Z`;
      const arms = [
        "M51 63 C44 72 56 78 49 88 C44 96 52 101 50 107 C56 106 61 98 58 92 C55 84 62 80 61 72 L61 63 Z",
        "M68 63 C68 72 79 78 74 88 C71 96 80 100 78 106 C85 104 87 96 83 90 C78 82 81 76 79 70 L79 63 Z",
      ];
      const tentacles = [31, 43, 88, 99].map((x, i) => ({
        d: `M${x} 64 C${x - 5} 76 ${x + 5} 84 ${x} ${94 + i % 2 * 4} C${x - 5} ${103 + i % 2 * 3} ${x + 3} ${109 + i % 2 * 2} ${x - 1} ${116 - i % 2 * 3}`,
        w: 2.4,
      }));
      return whiskers(u, tentacles, "#dc9ae8")
        + underlay(u, [...arms, bell])
        + arms.map((d) => part(d, "#eaa6de", [p("M40 84 L90 84 L90 110 L40 110 Z", "#c97cc0")])).join("")
        + part(bell, "#c77ddb", [
          p("M0 52 C40 60 88 60 128 52 L128 80 L0 80 Z", "#a25cba"),
          p("M36 56 C36 36 50 26 64 26 C78 26 92 36 92 56 C80 60 48 60 36 56 Z", "#e0a2ec"),
          p("M48 50 C48 40 56 34 64 34 C72 34 80 40 80 50 C72 53 56 53 48 50 Z", "#f6d2fa"),
          line("M33 47 C35 37 43 28 53 24", "#ffffff", 3 * u),
        ], 6 * u);
    },
  },

  tuna: {
    width: 0.84,
    draw(u) {
      const body = "M122 62 C114 47 94 40 72 40 C54 40 42 50 31 58 L31 66 C42 73 56 83 74 83 C96 83 114 76 122 62 Z";
      const tail = "M34 58 C28 50 19 37 9 27 C17 40 20 52 22 62 C20 72 17 84 9 97 C19 87 28 74 34 66 Z";
      const dorsal = "M90 42 Q84 31 72 31 L64 42 Z";
      const second = "M60 44 Q58 30 50 23 Q52 35 47 49 Z";
      const anal = "M60 80 Q58 94 50 101 Q52 89 47 75 Z";
      const navy = "#284a85", navyShade = "#1c3666", yellow = "#f2c230", yellowShade = "#c99a1c";
      const finlet = (x, y, up) => `M${x + 2} ${y} L${x - 3} ${y + (up ? -5 : 5)} L${x - 4} ${y} Z`;
      const finlets = [[44, 49.5, 1], [40, 52, 1], [36, 54.5, 1], [44, 76, 0], [40, 73, 0], [36, 70, 0]].map(([x, y, up]) => finlet(x, y, up));
      return underlay(u, [tail, dorsal, second, anal, body])
        + part(tail, navy, [p("M0 62 L40 62 L40 100 L0 100 Z", navyShade)])
        + part(dorsal, navy, [p("M60 37 L94 37 L94 46 L60 46 Z", navyShade)])
        + part(second, yellow, [p("M40 36 L64 30 L64 50 L40 50 Z", yellowShade)])
        + part(anal, yellow, [p("M40 88 L64 84 L64 104 L40 104 Z", yellowShade)])
        + finlets.map((d) => part(d, yellow, [], 4 * u)).join("")
        + part(body, "#d9e0e6", [
          p("M20 20 L124 20 L124 58 C100 54 70 55 20 61 Z", navy),
          p("M104 46 C92 43 74 43 58 47 C74 46 90 47 104 50 Z", "#3d64a8"),
          p("M108 59 C94 57.5 76 58 56 60.5 L56 62.5 C76 60.5 94 60 108 61 Z", "#e9c04a"),
          p("M20 72 C60 77 96 80 124 70 L124 100 L20 100 Z", "#aeb9c4"),
        ], 6 * u)
        + line("M101 46 Q94 60 100 76", INK, 3 * u)
        + line("M122 62 Q117 64.5 112 64", INK, 3 * u)
        + `<ellipse cx="86" cy="45" rx="5" ry="1.8" fill="#ffffff" transform="rotate(-3 86 45)"/>`
        + eye(u, 109, 56.5, 6);
    },
  },

  swordfish: {
    width: 0.84,
    draw(u) {
      const bill = "M93 53 L125 55.6 Q127.5 57.2 125 58.8 L94 61.5 Z";
      const body = "M95 52 C88 45 72 42 58 43 C44 44 36 52 28 58 L28 64 C38 70 50 77 64 77 C80 77 92 72 98 64 L105 61.5 L96 60 Z";
      const tail = "M31 58 C26 49 17 36 8 26 C16 39 19 51 21 61 C19 71 16 83 8 96 C17 86 26 73 31 64 Z";
      const dorsal = "M86 47 C84 34 80 22 71 11 C71 23 69 36 62 45 Z";
      const second = "M40 52 Q38 46 34 46 L33 57 Z";
      const anal = "M68 76 Q66 86 60 88 L57 76 Z";
      const fin = "#34465a", finShade = "#263445";
      return underlay(u, [tail, dorsal, second, anal, body, bill])
        + part(tail, fin, [p("M0 61 L40 61 L40 100 L0 100 Z", finShade)])
        + part(dorsal, fin, [p("M70 20 L80 20 L86 50 L62 50 Z", finShade)])
        + part(second, fin)
        + part(anal, fin, [p("M50 82 L72 82 L72 92 L50 92 Z", finShade)])
        + part(body, "#d4dbe1", [
          p("M20 20 L124 20 L124 57 C100 56 70 57 20 62 Z", "#3f5268"),
          p("M90 47 C80 44 66 44 54 47 C66 46 80 47 91 50 Z", "#5a7290"),
          p("M20 70 C56 75 90 76 124 66 L124 100 L20 100 Z", "#aab5bf"),
        ], 6 * u)
        + part(bill, "#56677a", [p("M90 57.4 L130 57.4 L130 64 L90 64 Z", "#3f4e5f"), p("M96 54.6 L122 56.3 L96 56 Z", "#8a9bae")], 6 * u)
        + line("M86 49 Q80 60 85 72", INK, 3 * u)
        + line("M97 61 Q93 62.5 89 62", INK, 3 * u)
        + `<ellipse cx="70" cy="46" rx="4.5" ry="1.6" fill="#ffffff" transform="rotate(-4 70 46)"/>`
        + eye(u, 91, 55, 5.6);
    },
  },

  anglerfish: {
    width: 0.84,
    draw(u) {
      const body = "M108 50 C100 36 82 30 64 30 C44 30 30 46 28 60 L28 74 C32 90 48 100 66 100 C90 100 110 92 120 76 C106 78 90 74 83 66 C88 58 98 52 108 50 Z";
      const mouth = "M108 50 C116 56 121 66 120 76 L83 66 Z";
      const tail = "M31 60 Q18 50 10 54 Q14 67 10 80 Q18 84 31 74 Z";
      const dorsal = "M56 34 Q50 22 41 28 Q41 34 43 41 Z";
      const lure = [{ d: "M82 33 C82 15 102 7 113 16", w: 2.4 }];
      const teeth = [];
      const tooth = (ax, ay, bx, by, n, dir) => {
        for (let i = 0; i < n; i += 1) {
          const t = (i + 0.5) / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
          teeth.push(`M${x - 2.2} ${y} L${x + 2.2} ${y} L${x + 0.8} ${y + dir * 7} Z`);
        }
      };
      tooth(87, 61, 106, 51.5, 5, 1);
      tooth(89, 68.5, 117, 76, 6, -1);
      const brown = "#4b3b31", brownShade = "#362a23", brownLight = "#67554a";
      return `<defs><radialGradient id="lure-light"><stop offset="0" stop-color="#e6ff7a" stop-opacity="0.65"/><stop offset="1" stop-color="#e6ff7a" stop-opacity="0"/></radialGradient></defs>`
        + underlay(u, [tail, dorsal, mouth, body])
        + part(tail, brown, [p("M0 67 L32 67 L32 90 L0 90 Z", brownShade), line("M28 64 L14 57 M28 67 L13 67 M28 70 L14 77", brownShade, 2 * u)])
        + part(dorsal, brown, [p("M36 32 L60 32 L60 44 L36 44 Z", brownShade)])
        + part(mouth, "#6b1f26", [p("M86 64 L120 70 L120 80 L86 80 Z", "#4a141a")])
        + teeth.map((d) => `<path d="${d}" fill="#f4f1e6" stroke="${INK}" stroke-width="${1.5 * u}" stroke-linejoin="round"/>`).join("")
        + part(body, brown, [
          p("M20 80 C50 92 90 94 124 76 L124 110 L20 110 Z", brownShade),
          p("M90 40 C78 35 62 35 50 40 C62 38 78 40 92 46 Z", brownLight),
          dot(60, 56, 1.8, brownLight), dot(70, 64, 1.6, brownLight), dot(52, 68, 1.6, brownLight), dot(76, 50, 1.5, brownLight), dot(62, 78, 1.5, brownLight),
        ], 6 * u)
        + eye(u, 94, 42, 4)
        + whiskers(u, lure, brownLight)
        + `<circle cx="115" cy="20" r="15" fill="url(#lure-light)"/>`
        + `<circle cx="115" cy="20" r="5.5" fill="#d8f25a" stroke="${INK}" stroke-width="${3 * u}"/>`
        + dot(114, 19, 3, "#f4ffc0") + dot(113, 18, 1.2, "#ffffff");
    },
  },

  shark: {
    width: 0.84,
    draw(u) {
      const body = "M123 58 C116 46 94 42 72 43 C54 44 42 52 30 57 L30 63 C42 68 60 77 82 77 C100 77 112 72 119 65 C122 63 124 61 123 58 Z";
      const tail = "M33 57 C27 45 18 30 7 20 C12 36 15 48 18 59 C15 66 13 73 11 82 C19 75 27 68 33 63 Z";
      const dorsal = "M88 45 C82 34 76 24 68 15 C68 28 65 38 58 47 Z";
      const second = "M44 52 Q42 45 38 44 L37 55 Z";
      const anal = "M48 69 Q46 77 41 77 L40 65 Z";
      const pectoral = "M96 74 C90 84 80 92 66 96 C72 88 76 80 78 75 Z";
      const pelvic = "M62 76 Q58 84 52 84 L52 74 Z";
      const fin = "#6f7d88", finShade = "#56636d";
      return underlay(u, [tail, dorsal, second, anal, pectoral, pelvic, body])
        + part(tail, fin, [p("M0 60 L40 60 L40 100 L0 100 Z", finShade)])
        + part(dorsal, fin, [p("M66 10 L74 10 L90 50 L56 50 Z", finShade)])
        + part(second, fin)
        + part(anal, fin)
        + part(pelvic, fin, [p("M48 80 L66 80 L66 90 L48 90 Z", finShade)])
        + part(pectoral, fin, [p("M60 84 L100 78 L100 100 L60 100 Z", finShade)])
        + part(body, "#7d8b96", [
          p("M104 47 C92 44 74 44 58 48 C74 47 90 48 104 51 Z", "#9aa8b2"),
          p("M20 63 C50 66 80 69 124 60 L124 100 L20 100 Z", "#eef1f3"),
          p("M20 70 C56 76 92 79 124 68 L124 100 L20 100 Z", "#c9d0d6"),
          line("M93 56 Q91 61 93 67 M89 56.5 Q87 61.5 89 67.5 M85 57 Q83 62 85 68 M81 57.5 Q79 62.5 81 68.5", "#4f5c66", 2 * u),
        ], 6 * u)
        + line("M116 67.5 Q110 71 102 70", INK, 3 * u)
        + `<ellipse cx="86" cy="47" rx="5" ry="1.8" fill="#ffffff" transform="rotate(-3 86 47)"/>`
        + eye(u, 108, 56, 4.6);
    },
  },

  golden_koi: {
    width: 0.85,
    sparkles: [[18, 28, 9], [110, 102, 7]],
    glow: true,
    draw(u) {
      const body = "M116 64 C112 50 94 44 74 44 C54 44 44 52 36 58 L36 70 C46 76 62 84 80 84 C98 84 112 77 116 64 Z";
      const tail = "M40 58 C30 46 18 34 6 30 C12 38 10 44 15 49 C9 53 11 59 16 64 C11 69 9 75 15 79 C10 84 12 90 6 98 C18 94 30 82 40 70 Z";
      const dorsal = "M92 48 C86 34 72 27 54 30 C56 36 48 40 50 46 C46 48 44 52 42 56 Z";
      const pelvic = "M76 83 C72 92 64 100 54 100 C59 94 60 90 62 82 Z";
      const pectoral = "M94 74 C90 86 82 97 68 99 C73 92 76 85 82 77 Z";
      const fin = "#fbefd0", finShade = "#f0cf85", gold = "#f4c045", goldShade = "#d99a26", red = "#ee5a2a", redShade = "#c8401c";
      const rays = (d) => line(d, "#e9b54a", 2 * u);
      return underlay(u, [tail, dorsal, pelvic, body])
        + part(tail, fin, [
          p("M0 64 L40 64 L40 100 L0 100 Z", finShade),
          p("M0 20 L12 20 Q16 64 12 108 L0 108 Z", gold),
          rays("M38 60 Q24 46 12 36 M38 64 Q26 60 14 56 M38 68 Q26 72 14 76 M38 70 Q24 82 12 92"),
        ])
        + part(dorsal, fin, [p("M40 42 L96 42 L96 60 L40 60 Z", finShade), p("M50 22 C70 24 84 30 94 42 L96 32 L50 18 Z", gold), rays("M86 44 Q80 36 72 32 M76 46 Q70 38 62 34 M66 48 Q60 42 54 38")])
        + part(pelvic, fin, [p("M50 92 L80 88 L80 110 L50 110 Z", finShade), rays("M70 86 Q64 94 58 98")])
        + part(body, "#f8f5ee", [
          p("M92 42 C90 54 80 60 66 60 C56 60 48 58 40 52 L40 36 L92 36 Z", gold),
          p("M92 42 C90 50 84 55 76 57 C84 54 88 49 90 42 Z", goldShade),
          p("M76 46 C84 41 97 43 98 51 C99 58 93 62 87 60 C83 66 73 65 72 59 C70 53 72 48 76 46 Z", red),
          p("M58 62 C64 58 72 60 73 66 C77 70 73 77 66 76 C60 79 53 75 54 69 C52 66 54 63 58 62 Z", red),
          p("M86 70 C90 67 96 69 95 74 C94 78 88 79 85 76 C83 74 84 71 86 70 Z", red),
          p("M20 73 C60 78 96 82 124 72 L124 100 L20 100 Z", "#ded6c4"),
          p("M54 71 C58 75 66 77 73 74 C71 78 62 79 54 71 Z", redShade),
          p("M98 49 C90 47 78 47 68 50 C78 49 90 50 99 53 Z", "#fff6d6"),
        ], 6 * u)
        + part(pectoral, fin, [p("M66 90 L100 82 L100 110 L66 110 Z", finShade), rays("M90 80 Q85 89 77 94")], 6 * u)
        + line("M101 50 Q94 63 100 77", INK, 3 * u)
        + line("M116 64 Q113 67.5 109.5 67", INK, 3 * u)
        + eye(u, 107, 58.5, 6.3);
    },
  },
};

// A four-point star with outline, drawn in final pixels.
function sparkle(x, y, r) {
  const s = r * 0.32;
  const d = `M${x} ${y - r} Q${x + s} ${y - s} ${x + r} ${y} Q${x + s} ${y + s} ${x} ${y + r} Q${x - s} ${y + s} ${x - r} ${y} Q${x - s} ${y - s} ${x} ${y - r} Z`;
  return `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>${p(d, "#ffd84a")}`
    + `<path d="M${x} ${y - r * 0.55} Q${x + s * 0.4} ${y - s * 0.4} ${x + r * 0.2} ${y} L${x} ${y} Z" fill="#fff4b8"/>`;
}

// A faint round gold light behind the rare fish.
const GLOW = `<defs><radialGradient id="glow"><stop offset="0.35" stop-color="#ffd24a" stop-opacity="0.4"/><stop offset="1" stop-color="#ffd24a" stop-opacity="0"/></radialGradient></defs><circle cx="64" cy="64" r="62" fill="url(#glow)"/>`;

const svg = (body, box = [0, 0, SIZE, SIZE]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${box[2]}" height="${box[3]}" viewBox="${box.join(" ")}">${body}</svg>`;
const placed = (spec, k, cx, cy) =>
  `<g transform="translate(64 64) scale(${k}) translate(${-cx} ${-cy}) rotate(${spec.tilt ?? TILT} 64 64)">${spec.draw(1 / k)}</g>`;

async function alphaBox(markup, box) {
  const { data, info } = await sharp(Buffer.from(svg(markup, box))).raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    if (data[(y * info.width + x) * 4 + 3] < 24) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { left: left + box[0], top: top + box[1], right: right + box[0] + 1, bottom: bottom + box[1] + 1 };
}

// Scales and centres the tilted fish so its outlined silhouette spans the asked share of the canvas width (or height).
async function render(spec) {
  let k = 1, cx = 64, cy = 64;
  for (let pass = 0; pass < 4; pass += 1) {
    const b = await alphaBox(placed(spec, k, cx, cy), [-64, -64, 256, 256]);
    cx += ((b.left + b.right) / 2 - 64) / k;
    cy += ((b.top + b.bottom) / 2 - 64) / k;
    k *= Math.min((spec.width * SIZE) / (b.right - b.left), ((spec.height ?? Infinity) * SIZE) / (b.bottom - b.top));
  }
  const extras = (spec.glow ? GLOW : "") + (spec.sparkles ?? []).map(([x, y, r]) => sparkle(x, y, r)).join("");
  return sharp(Buffer.from(svg(extras + placed(spec, k, cx, cy)))).png().toBuffer();
}

mkdirSync(OUT, { recursive: true });
const icons = [];
for (const [id, spec] of Object.entries(fish)) {
  const png = await render(spec);
  await sharp(png).webp({ lossless: true }).toFile(resolve(OUT, `${id}.webp`));
  icons.push(png);
  console.log(`fish/${id}.webp`);
}

const previewPath = process.argv[2];
if (previewPath) {
  const gap = 8, small = 40, perRow = 8, rowW = perRow * (SIZE + gap) + gap;
  const band = SIZE + small + gap * 3, rows = Math.ceil(icons.length / perRow);
  const tiles = [];
  for (const [n, png] of icons.entries()) {
    const left = gap + (n % perRow) * (SIZE + gap), top = Math.floor(n / perRow) * band;
    tiles.push({ input: png, left, top: top + gap });
    tiles.push({ input: await sharp(png).resize(small, small).png().toBuffer(), left: left + (SIZE - small) / 2, top: top + SIZE + gap * 2 });
  }
  await sharp({ create: { width: rowW, height: band * rows, channels: 4, background: "#282c32" } }).composite(tiles).png().toFile(previewPath);
  console.log(previewPath);
}
