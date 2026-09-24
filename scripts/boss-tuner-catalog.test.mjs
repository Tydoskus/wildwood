import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { loadBossCatalog } from './boss-tuner-catalog.mjs';
describe('boss tuner discovery', () => {
  it('includes every game art entry and both atlas animations', async () => {
    const rows = await loadBossCatalog(resolve('.'));
    expect(rows).toHaveLength(15);
    for (const row of rows) expect(row.frames).toBeGreaterThan(0);
    for (const id of ['IRONHORN', 'DREADREAPER']) {
      const row = rows.find(boss => boss.id === id);
      expect(row.frameNames.some(name => name.startsWith('attack'))).toBe(true);
      expect(row.framesData).toHaveLength(row.frames);
    }
  });
  it('discovers a newly registered sheet without editing the tuner', async () => {
    const root = await mkdtemp(join(tmpdir(), 'boss-catalog-'));
    try {
      await mkdir(join(root, 'src/game'), { recursive: true });
      await writeFile(join(root, 'src/game/boss-art.json'), JSON.stringify({ NEW_BOSS: { id: 'NEW_BOSS', name: 'New Boss', sheet: 'new.webp', frames: 6, drawWidth: 400, drawHeight: 400 } }));
      expect((await loadBossCatalog(root)).map(row => row.id)).toEqual(['NEW_BOSS']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
