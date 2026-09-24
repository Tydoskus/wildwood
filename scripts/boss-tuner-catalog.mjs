import { readFile } from "node:fs/promises";
function atlasBoss(id, name, atlas) {
  const scale = 340 / (atlas.bounds.bottom - atlas.bounds.top);
  const framesData = [], frameNames = [];
  for (const motion of ['idle', 'attack']) {
    atlas.animations[motion].frames.forEach((frame, index) => {
      framesData.push({ ...frame, sheet: atlas.pages[frame.page].src.replace('assets/wildstat/', ''),
        drawX: -atlas.anchorX * scale, drawY: 170 - atlas.bounds.bottom * scale,
        drawWidth: atlas.frameWidth * scale, drawHeight: atlas.frameHeight * scale });
      frameNames.push(`${motion} ${index + 1}`);
    });
  }
  return { id, name, framesData, frameNames, frames: framesData.length,
    drawWidth: atlas.frameWidth * scale, drawHeight: atlas.frameHeight * scale,
    artTop: -170, spriteY: 0, shadowWidth: 0, bakedShadow: true,
    frameNote: 'Idle and attack frames from the same atlas the game draws. The shadow is part of the artwork.' };
}

/** Every game art definition appears in the tuner, including future bosses. */
export async function loadBossCatalog(root) {
  const { pathToFileURL } = await import('node:url');
  const { join } = await import('node:path');
  const catalog = JSON.parse(await readFile(join(root, 'src/game/boss-art.json'), 'utf8'));
  return Promise.all(Object.values(catalog).map(async boss => {
    if (!boss.atlas) return boss;
    const { default: atlas } = await import(pathToFileURL(join(root, `src/game/enemy-atlases/${boss.atlas}.mjs`)).href);
    const resolved = atlasBoss(boss.id, boss.name, atlas);
    return { ...boss, ...resolved };
  }));
}
