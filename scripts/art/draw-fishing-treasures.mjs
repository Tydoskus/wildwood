// Hand-drawn inventory and wearable layers. The hat canvases match the head
// anchors in player-parts; the torso uses the existing 76 x 68 chest anchor.
import sharp from "sharp";
import { join } from "node:path";

const dir = join(import.meta.dirname, "../../public/assets/wildstat/player-parts");
const path = (d, fill, outline = "#202027", weight = 2.8) =>
  `<path d="${d}" fill="${fill}" stroke="${outline}" stroke-width="${weight}" stroke-linejoin="round" stroke-linecap="round"/>`;
const pearl = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
async function draw(name, w, h, parts) {
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`))
    .webp({ lossless: true }).toFile(join(dir, name + ".webp"));
}

await draw("reedward-cap", 118, 106, [
  path("M23 57 Q28 47 32 33 Q34 23 45 23 L58 28 Q68 23 78 32 L86 54 Q99 48 104 56 Q104 64 85 67 Q58 73 27 66 Q13 63 15 59Z", "#627749"),
  path("M31 51 Q51 62 86 52 L88 59 Q56 67 29 57Z", "#6a4639"),
  path("M34 47 Q39 31 45 30 Q49 30 56 35", "none", "#adba79", 3),
  path("M74 52 Q76 38 81 29 Q87 19 97 13 L96 25 L90 30 L93 29 Q85 43 75 53Z", "#45a7a5"),
  path("M78 46 L91 22", "none", "#bcdfbd", 1.7),
  path("M25 59 Q49 71 91 60 Q72 72 30 66Z", "#3b4635", "none"),
  path("M47 58 q-4 6 0 8 q4 1 4 -3", "none", "#e6b958", 2),
  pearl(53, 57, 2, "#dc8160"), pearl(58, 57, 2, "#eca76c"), pearl(63, 57, 2, "#a7c7b5"),
]);
const armor = [
  path("M23 13 L29 10 Q36 17 44 11 L51 13 Q59 12 65 22 L60 29 L55 29 L55 54 Q34 62 16 53 L17 29 L10 27 L8 22 Q12 14 23 13Z", "#25455a"),
  path("M18 23 L35 26 L53 22 L53 51 L37 57 L18 51Z", "#3d707a"),
];
for (let row = 0; row < 4; row++) {
  for (let i = 0; i < 4; i++) {
    const x = 19 + i * 8 + (row % 2) * 2, y = 25 + row * 6;
    armor.push(path(`M${x} ${y} q4 2 8 0 l-1 5 -3 3 -4 -3Z`, ["#609199", "#54858c", "#477b85", "#416775"][(i + row) % 4], "#345769", 1));
  }
}
armor.push(path("M10 24 Q11 15 22 13 L27 16 L23 25 L15 28Z", "#507c84"),
  path("M46 15 L52 12 Q62 14 65 22 L61 27 L51 24Z", "#547681"),
  path("M22 14 Q28 23 38 26 Q45 23 53 15", "none", "#cab991", 2),
  pearl(37, 25, 3.8, "#776880"), pearl(37, 24, 2.8, "#eacbef"), pearl(36, 23, 1, "#fff2d7"),
  path("M18 49 Q35 56 54 50 L54 54 Q33 62 17 54Z", "#625343"));
await draw("drowned-court-mail", 76, 68, armor);
await draw("wishing-deep-crown", 118, 106, [
  path("M18 36 L32 45 L34 25 L47 40 L58 17 L68 40 L82 24 L83 43 L99 32 L88 61 Q56 76 27 62Z", "#cb8a3d"),
  path("M24 41 L33 50 L35 34 L45 45 L58 24 L65 45 L81 31 L81 50 L93 41 L87 54 Q59 70 29 56Z", "#f4c96c", "none"),
  path("M28 55 Q56 66 90 54 L87 64 Q57 74 29 63Z", "#c89545"),
  path("M55 46 Q59 37 63 45 L66 53 L59 60 L52 53Z", "#298c93"),
  path("M57 47 L60 42 L59 50 L55 53Z", "#99e3cd", "none"),
  pearl(38, 60, 2, "#b7d6b1"), pearl(78, 60, 2, "#b7d6b1"),
  pearl(58, 16, 3, "#f6db93"), pearl(34, 24, 2, "#ebc47c"), pearl(82, 24, 2, "#ebc47c"),
]);
