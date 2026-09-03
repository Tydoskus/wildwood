import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("organized repository layout", () => {
  it("keeps one-click launchers executable and anchored to the parent project", () => {
    const folder = resolve(root, "launchers");
    const launchers = readdirSync(folder).filter((name) => name.endsWith(".command"));
    expect(launchers).toHaveLength(4);
    for (const name of launchers) {
      const file = resolve(folder, name);
      expect(statSync(file).mode & 0o111, name).not.toBe(0);
      expect(readFileSync(file, "utf8"), name).toContain('${0:A:h:h}');
    }
  });

  it("routes existing build and typecheck commands to real config files", () => {
    const { scripts } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    for (const name of ["build:coop", "build:game", "build:balance", "balance:lab", "typecheck:coop", "typecheck:balance", "typecheck:loadtest"]) {
      const path = scripts[name].match(/(?:--config|-p) (config\/\S+)/)?.[1];
      expect(path, name).toBeDefined();
      expect(statSync(resolve(root, path)).isFile(), name).toBe(true);
    }
  });
});
