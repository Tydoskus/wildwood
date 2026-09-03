import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, mkdtempSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRelative = "art-source/unity-workspace/SpriteExporter";
export const minimumEditorVersion = "2022.3.62f3";

export function versionParts(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)f(\d+)$/.exec(value);
  return match?.slice(1).map(Number) ?? null;
}

export function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  if (!a || !b) throw new Error("Expected a stable Unity editor version.");
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function findEditors(hubRoot = "/Applications/Unity/Hub/Editor") {
  if (!existsSync(hubRoot)) return [];
  return readdirSync(hubRoot).filter((version) => versionParts(version)).map((version) => ({
    version, app: join(hubRoot, version, "Unity.app"), executable: join(hubRoot, version, "Unity.app/Contents/MacOS/Unity"),
  })).filter((editor) => existsSync(editor.executable)).sort((a, b) => compareVersions(a.version, b.version));
}

export function selectEditor(editors, pinnedVersion) {
  if (pinnedVersion) {
    const editor = editors.find((candidate) => candidate.version === pinnedVersion);
    if (!editor) throw new Error(`This art project uses Unity ${pinnedVersion}. Install that version in Unity Hub; the launcher will not silently upgrade or downgrade the project.`);
    return editor;
  }
  const editor = editors.find((candidate) => compareVersions(candidate.version, minimumEditorVersion) >= 0);
  if (!editor) throw new Error(`Install Unity ${minimumEditorVersion} or a newer stable editor in Unity Hub. No editor is downloaded automatically.`);
  return editor;
}

function ensureInside(root, path) {
  let existing = path;
  while (!existsSync(existing)) existing = dirname(existing);
  const realRoot = realpathSync(root);
  const realExisting = realpathSync(existing);
  if (realExisting !== realRoot && !realExisting.startsWith(realRoot + "/")) throw new Error("Refusing a symlinked art workspace outside this repository.");
}

export function prepareProject(root, editor) {
  const project = join(root, projectRelative);
  ensureInside(root, project);
  const marker = join(project, ".wildstat-exporter-project");
  if (existsSync(project) && !existsSync(marker)) throw new Error(`Refusing to modify an unrecognized project: ${project}`);
  const output = join(root, "art-source/generated/unity-sprites");
  ensureInside(root, output);
  for (const path of ["Assets/WildStatSpriteExporter/Editor", "Assets/WildStatSpriteExporter/Viewer", "Packages", "ProjectSettings"]) {
    ensureInside(root, join(project, path));
    mkdirSync(join(project, path), { recursive: true });
  }
  for (const path of [marker, join(project, "Packages/manifest.json"), join(project, "ProjectSettings/ProjectVersion.txt"), join(project, "wildstat-exporter.json"), join(project, "WildStatOpenExporter.request")]) ensureInside(root, path);
  writeFileSync(marker, "WildStat local sprite-export project v1\n");
  const manifest = join(project, "Packages/manifest.json");
  if (!existsSync(manifest)) writeFileSync(manifest, JSON.stringify({ dependencies: {
    "com.unity.modules.animation": "1.0.0", "com.unity.modules.imageconversion": "1.0.0",
    "com.unity.modules.imgui": "1.0.0", "com.unity.modules.jsonserialize": "1.0.0",
    "com.unity.modules.physics2d": "1.0.0",
  } }, null, 2) + "\n");
  const version = join(project, "ProjectSettings/ProjectVersion.txt");
  if (!existsSync(version)) writeFileSync(version, `m_EditorVersion: ${editor.version}\n`);
  const source = join(root, "tools/unity-sprite-exporter");
  for (const [from, to, filter] of [["Editor", "Editor", ".cs"], ["viewer", "Viewer", null]]) {
    for (const file of readdirSync(join(source, from))) {
      if (filter && !file.endsWith(filter)) continue;
      const destination = join(project, "Assets/WildStatSpriteExporter", to, file);
      const content = readFileSync(join(source, from, file));
      ensureInside(root, destination);
      if (!existsSync(destination) || !readFileSync(destination).equals(content)) writeFileSync(destination, content);
    }
  }
  writeFileSync(join(project, "wildstat-exporter.json"), JSON.stringify({ exportRoot: output }, null, 2) + "\n");
  return project;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status ?? result.signal}.`);
}

export function checkExporter(root, editors) {
  // Compile against each installed editor's actual API, not handwritten Unity stubs.
  // No Unity process, asset package, or renderer is started by this command.
  const scratch = mkdtempSync(join(tmpdir(), "wildstat-sprite-check-"));
  const sources = readdirSync(join(root, "tools/unity-sprite-exporter/Editor")).filter((file) => file.endsWith(".cs"))
    .map((file) => join(root, "tools/unity-sprite-exporter/Editor", file));
  if (editors.length === 0) throw new Error("Install Unity to compile-check the C# exporter.");
  for (const editor of editors) {
    let scripting = join(editor.app, "Contents");
    if (!existsSync(join(scripting, "Managed"))) scripting = join(scripting, "Resources/Scripting");
    const managed = join(scripting, "Managed/UnityEngine");
    const mono = join(scripting, "MonoBleedingEdge/bin/mono");
    const compiler = join(scripting, "MonoBleedingEdge/lib/mono/4.5/csc.exe");
    const references = readdirSync(managed).filter((file) => file.endsWith(".dll") && /^(UnityEngine|UnityEditor)/.test(file)).map((file) => `-r:${join(managed, file)}`);
    references.push(`-r:${join(scripting, "UnityReferenceAssemblies/unity-4.8-api/Facades/netstandard.dll")}`);
    const assembly = join(scratch, `WildStatSpriteExporter-${editor.version}.dll`);
    console.log(`Compile exporter against Unity ${editor.version}`);
    run(mono, [compiler, "-nologo", "-target:library", "-langversion:9.0", `-out:${assembly}`, ...references, ...sources]);
  }
  // Pure C# geometry/packing/timing assertions also run outside Unity.
  const editor = editors[0];
  let scripting = join(editor.app, "Contents");
  if (!existsSync(join(scripting, "Managed"))) scripting = join(scripting, "Resources/Scripting");
  const mono = join(scripting, "MonoBleedingEdge/bin/mono");
  const compiler = join(scripting, "MonoBleedingEdge/lib/mono/4.5/csc.exe");
  const runner = join(scratch, "SpriteMathTests.exe");
  run(mono, [compiler, "-nologo", `-out:${runner}`, join(root, "tools/unity-sprite-exporter/Editor/WildStatSpriteMath.cs"), join(root, "tools/unity-sprite-exporter/tests/SpriteMathTests.cs")]);
  run(mono, [runner]);
  console.log("Compile + math checks passed. Actual capture still requires Unity and a compatible prefab.");
}

export function main(args = process.argv.slice(2)) {
  const unknown = args.filter((arg) => !["--prepare-only", "--check"].includes(arg));
  if (unknown.length) throw new Error(`Unknown option: ${unknown[0]}`);
  const editors = findEditors();
  if (args.includes("--check")) return checkExporter(repoRoot, editors);
  const versionFile = join(repoRoot, projectRelative, "ProjectSettings/ProjectVersion.txt");
  const pinned = existsSync(versionFile) ? /^m_EditorVersion:\s*(\S+)/m.exec(readFileSync(versionFile, "utf8"))?.[1] : undefined;
  const editor = selectEditor(editors, pinned);
  const project = prepareProject(repoRoot, editor);
  console.log(`Local Unity art project: ${project}\nEditor: ${editor.version}\nExports stay under art-source/generated/unity-sprites. Nothing is published.`);
  if (args.includes("--prepare-only")) return;
  writeFileSync(join(project, "WildStatOpenExporter.request"), "open\n");
  const lock = join(project, "Temp/UnityLockfile");
  if (existsSync(lock)) run("/usr/bin/open", ["-a", editor.app]);
  else run("/usr/bin/open", ["-a", editor.app, "--args", "-projectPath", project]);
  console.log("Unity will open WildStat → Sprite Exporter after compiling. Import your trusted package there.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
