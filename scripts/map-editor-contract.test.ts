import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("one-click map editor", () => {
  it("ships an executable launcher and complete browser shell", () => {
    const launcher = resolve(root, "launchers/Open WildStat Map Editor.command");
    const html = readFileSync(resolve(root, "tools/map-editor/index.html"), "utf8");
    expect(existsSync(launcher)).toBe(true);
    expect(statSync(launcher).mode & 0o111).not.toBe(0);
    if (process.platform === "darwin") {
      const launcherCheck = spawnSync(launcher, ["--check"], { cwd: resolve(root, "launchers"), encoding: "utf8" });
      expect(launcherCheck.status).toBe(0);
      expect(launcherCheck.stdout).toContain("launcher check passed");
    }
    expect(html).toContain('id="map-canvas"');
    expect(html).toContain('id="save-map"');
    expect(html).toContain('id="new-map-dialog"');
  });

  it("keeps both browser and local-server JavaScript parseable", () => {
    for (const file of ["tools/map-editor/map-editor.js", "scripts/map-editor-server.mjs"]) {
      const checked = spawnSync(process.execPath, ["--check", resolve(root, file)], { encoding: "utf8" });
      expect(checked.stderr).toBe("");
      expect(checked.status).toBe(0);
    }
  });

  it("takes an editable snapshot of every live game map", () => {
    const snapshot = spawnSync(resolve(root, "node_modules/.bin/tsx"), [resolve(root, "scripts/map-editor-snapshot.ts")], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    expect(snapshot.stderr).toBe("");
    expect(snapshot.status).toBe(0);
    const catalog = JSON.parse(snapshot.stdout);
    expect(catalog.maps).toHaveLength(9);
    expect(catalog.maps.every((map: { paths: unknown[]; decor: unknown[]; gameplay: { portals: unknown[] } }) =>
      map.paths.length > 0 && map.decor.length > 0 && map.gameplay.portals.length > 0)).toBe(true);
    const bootsPickup = catalog.maps.find((map: { id: string; gameplay: { bootsPickup?: { x: number; y: number } } }) => map.id === "tutorial_forest")?.gameplay.bootsPickup;
    expect(bootsPickup).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(bootsPickup.x).toBeGreaterThanOrEqual(0);
    expect(bootsPickup.x).toBeLessThanOrEqual(4_800);
    expect(bootsPickup.y).toBeGreaterThanOrEqual(0);
    expect(bootsPickup.y).toBeLessThanOrEqual(4_800);
    expect(catalog.enemyKinds.length).toBeGreaterThan(40);
  });
});
