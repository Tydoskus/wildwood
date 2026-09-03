import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareVersions, selectEditor, prepareProject, versionParts } from "./unity-sprite-exporter.mjs";
import "../tools/unity-sprite-exporter/viewer/viewer-core.js";

const core = (globalThis as any).WildStatSpriteTools;
const temps: string[] = [];
afterEach(() => { for (const path of temps.splice(0)) rmSync(path, { recursive: true, force: true }); });
const scratch = () => { const path = mkdtempSync(join(tmpdir(), "wildstat-exporter-test-")); temps.push(path); return path; };
const fixture = () => ({ schemaVersion: 1, name: "fungus", coordinates: "top-left-pixels", alpha: "straight", frameWidth: 64, frameHeight: 64, anchorX: 32, anchorY: 60, pixelsPerUnit: 64,
  pages: [{ file: "idle-0.png", width: 136, height: 68 }],
  animations: [{ key: "idle", loop: true, durationMs: 200, frameDurationMs: 100, frames: [{ page: 0, x: 2, y: 2, w: 64, h: 64 }, { page: 0, x: 70, y: 2, w: 64, h: 64 }] }],
});

describe("Unity sprite export tooling", () => {
  it("uses the same three-motion defaults for the window and batch export, including open-window migration", () => {
    const window = readFileSync("tools/unity-sprite-exporter/Editor/WildStatSpriteExporterWindow.cs", "utf8");
    const batch = readFileSync("tools/unity-sprite-exporter/Editor/WildStatSpriteExportBatch.cs", "utf8");
    expect(window).toContain("SpriteMotions.CoreKeys.Select");
    expect(batch).toContain("foreach (string key in SpriteMotions.CoreKeys)");
    expect(window).toContain("if (!coreMotionDefaultsApplied)");
    expect(window).toContain("settings.clips.RemoveAll(choice => SpriteMotions.UsesGameEffect(choice.key))");
    expect(window).toContain("i >= SpriteMotions.CoreKeys.Count");
    expect(window + batch).not.toContain("five motion");
  });

  it("selects a compatible stable editor but never silently changes a project version", () => {
    const editors = ["2022.3.15f1", "6000.4.9f1"].map((version) => ({ version }));
    expect(selectEditor(editors, undefined).version).toBe("6000.4.9f1");
    expect(selectEditor(editors, "2022.3.15f1").version).toBe("2022.3.15f1");
    expect(() => selectEditor(editors, "2022.3.62f3")).toThrow("will not silently upgrade");
    expect(() => selectEditor(editors.slice(0, 1))).toThrow("Install Unity");
    expect(compareVersions("2022.3.62f3", "2022.3.62f2")).toBeGreaterThan(0);
    expect(versionParts("6000.5.0b1")).toBeNull();
  });

  it("prepares only a marked local art project and preserves package/user settings", () => {
    const root = scratch();
    for (const dir of ["Editor", "viewer"]) mkdirSync(join(root, "tools/unity-sprite-exporter", dir), { recursive: true });
    writeFileSync(join(root, "tools/unity-sprite-exporter/Editor/Test.cs"), "// exporter\n");
    writeFileSync(join(root, "tools/unity-sprite-exporter/viewer/index.html"), "preview");
    const project = prepareProject(root, { version: "6000.4.9f1" });
    expect(project).toContain("art-source/unity-workspace/");
    expect(JSON.parse(readFileSync(join(project, "wildstat-exporter.json"), "utf8")).exportRoot).toBe(join(root, "art-source/generated/unity-sprites"));
    const manifest = join(project, "Packages/manifest.json");
    writeFileSync(manifest, '{"dependencies":{"user-package":"1"}}');
    prepareProject(root, { version: "6000.4.9f1" });
    expect(readFileSync(manifest, "utf8")).toContain("user-package");
    expect(existsSync(join(root, "public"))).toBe(false);
    expect(existsSync(join(root, "dist"))).toBe(false);
  });

  it("refuses an existing unrecognized project and symlinked workspace", () => {
    const root = scratch();
    mkdirSync(join(root, "art-source/unity-workspace/SpriteExporter"), { recursive: true });
    expect(() => prepareProject(root, { version: "6000.4.9f1" })).toThrow("unrecognized");
    const other = scratch(), escaped = scratch();
    mkdirSync(join(other, "art-source"));
    symlinkSync(escaped, join(other, "art-source/unity-workspace"));
    expect(() => prepareProject(other, { version: "6000.4.9f1" })).toThrow("symlinked");
  });

  it("validates frame coordinates, anchor, timing, page names, and memory ceilings", () => {
    expect(core.validateManifest(fixture()).name).toBe("fungus");
    const changes = [
      (m: any) => m.pages[0].file = "../secret.png",
      (m: any) => m.pages[0].width = 8192,
      (m: any) => m.anchorX = Number.NaN,
      (m: any) => m.animations[0].frames[0].x = 100,
      (m: any) => m.animations[0].frames[0].page = -1,
      (m: any) => m.animations[0].frameDurationMs = 0,
      (m: any) => m.animations[0].durationMs = 300,
      (m: any) => m.animations.push(m.animations[0]),
      (m: any) => m.pages.push(m.pages[0]),
    ];
    for (const change of changes) { const manifest = fixture(); change(manifest); expect(() => core.validateManifest(manifest)).toThrow("Invalid sprite.json"); }
  });

  it("loops idle/walk but holds a one-shot final pose; WebP preserves all frame geometry", () => {
    const original = fixture(), clip = original.animations[0];
    expect(core.frameAt(clip, 199)).toBe(1);
    expect(core.frameAt(clip, 200)).toBe(0);
    expect(core.frameAt({ ...clip, loop: false }, 10000)).toBe(1);
    expect(core.frameAt(clip, -10)).toBe(0);
    const converted = core.webpManifest(original);
    expect(converted.pages[0].file).toBe("idle-0.webp");
    expect(original.pages[0].file).toBe("idle-0.png");
    expect(converted.animations).toEqual(original.animations);
    expect(converted.anchorY).toBe(original.anchorY);
  });

  it("writes standards-compliant ZIP headers, directory offsets, bytes, and CRC", async () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(core.crc32(bytes)).toBe(0xcbf43926);
    const zip = core.makeZip([{ name: "sprite.json", bytes }, { name: "idle-0.webp", bytes: new Uint8Array([1, 2, 3]) }]);
    const contents = new Uint8Array(await zip.arrayBuffer()), view = new DataView(contents.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(0xcbf43926);
    expect(view.getUint32(18, true)).toBe(bytes.length);
    expect(new TextDecoder().decode(contents.subarray(30, 41))).toBe("sprite.json");
    expect([...contents.subarray(41, 50)]).toEqual([...bytes]);
    const end = contents.length - 22, central = view.getUint32(end + 16, true);
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint32(central + 42, true)).toBe(0);
    expect(() => core.makeZip([{ name: "../bad.png", bytes }])).toThrow("Unsafe");
  });

  it("keeps the preview offline and never disguises a PNG as WebP", () => {
    const html = readFileSync("tools/unity-sprite-exporter/viewer/index.html", "utf8");
    const script = readFileSync("tools/unity-sprite-exporter/viewer/viewer.js", "utf8");
    expect(html).toContain("connect-src 'none'");
    expect(script).toContain('blob.type !== "image/webp"');
    expect(script).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
    const ignore = readFileSync(".gitignore", "utf8");
    expect(ignore).toContain("art-source/unity-workspace/**");
    expect(ignore).toContain("*.unitypackage");
  });
});
