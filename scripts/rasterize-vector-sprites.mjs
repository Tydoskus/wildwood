import sharp from "sharp";

/**
 * The game draws these sheets onto its canvas every frame. Firefox redraws an
 * SVG from its vector paths on every drawImage, so a screen of Ion Guardians
 * cost hundreds of rasterizations a second; a bitmap is drawn for free once
 * decoded. Each sheet is rendered at twice its viewBox so it stays sharp on
 * a Retina screen, and the atlases scale their frame coordinates to match.
 *
 * Run after build-neon-sentries.mjs or build-verdant-enemies.mjs rewrites an SVG.
 */
export const VECTOR_SPRITE_SCALE = 2;
const SHEETS = [
  "public/assets/wildstat/aegis-prime-boss-v1.svg",
  "public/assets/wildstat/enemies/ion-guardian/guardian.svg",
  "public/assets/wildstat/enemies/neon-sentry/reaver.svg",
  ...["guardian", "oracle", "reaver", "regent", "slinger", "stalker"].map(role => `public/assets/wildstat/enemies/verdant-crypt/${role}.svg`),
];

for (const sheet of SHEETS) {
  const output = sheet.replace(/\.svg$/, ".webp");
  const info = await sharp(sheet, { density: 72 * VECTOR_SPRITE_SCALE })
    // Flat-coloured vector art compresses smaller lossless than lossy, with no artefacts.
    .webp({ lossless: true, effort: 6 })
    .toFile(output);
  console.log(`${output} ${info.width}x${info.height} ${Math.round(info.size / 1024)} KiB`);
}
