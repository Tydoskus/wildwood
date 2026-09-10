import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ENEMY_SPRITE_LAYOUTS } from "./enemy-sprite-layouts.mjs";
import { MAP_ASSET_GROUPS } from "./runtime/map-asset-groups";
it("uses the same animated sword sentry across Neon Bastion", () => {
  const sheets = new Set<string>();
  for (const kind of MAP_ASSET_GROUPS.neon_bastion.enemies) {
    const sprite = ENEMY_SPRITE_LAYOUTS[kind], animation = sprite.animation!;
    expect(sprite.family).toBe("neon-sentry");
    expect(animation.sourceFacingX).toBe(1);
    for (const motion of Object.values(animation.animations)) expect(motion.frames).toHaveLength(8);
    const path = animation.pages[0].src;
    sheets.add(path);
    const source = readFileSync(new URL("../../public/" + path, import.meta.url), "utf8");
    expect(source).toContain('width="1024" height="384"');
    expect(source.length).toBeLessThan(40_000);
  }
  expect([...sheets]).toEqual(["assets/wildstat/enemies/neon-sentry/reaver.svg"]);
});
