#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");
const changelogPath = resolve(root, "src/app/changelog.ts");
const settingsPath = resolve(root, "src/game/runtime/game-settings.ts");
const releaseFilePaths = [
  changelogPath,
  settingsPath,
  resolve(root, "public/index.html"),
  resolve(root, "public/version.json"),
];
const liveVersionUrl = "https://tydoskus.github.io/wildwood/version.json";
const serverPathPrefixes = ["shared/", "spacetimedb/", "src/module_bindings/"];

function versionParts(version) {
  if (!/^\d+(?:\.\d+)+$/.test(version)) throw new Error(`Invalid version: ${version}`);
  const parts = version.split(".").map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) throw new Error(`Invalid version: ${version}`);
  return parts;
}

export function incrementVersion(version) {
  const parts = versionParts(version);
  const last = parts.length - 1;
  parts[last] += 1;
  if (!Number.isSafeInteger(parts[last])) throw new Error(`Version cannot be incremented safely: ${version}`);
  return parts.join(".");
}

export function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function insertReleaseNotes(source, version, notes) {
  versionParts(version);
  const cleanNotes = notes.map((note) => note.trim()).filter(Boolean);
  if (!cleanNotes.length) throw new Error("At least one release note is required.");
  const marker = "export const RELEASE_NOTES: Record<string, string[]> = {\n";
  if (!source.includes(marker)) throw new Error("Release-note insertion point was not found.");
  const escapedVersion = version.replaceAll(".", "\\.");
  if (new RegExp(`^\\s*"${escapedVersion}":`, "m").test(source)) {
    throw new Error(`Release notes already contain version ${version}.`);
  }
  const entry = [
    `  ${JSON.stringify(version)}: [`,
    ...cleanNotes.map((note) => `    ${JSON.stringify(note)},`),
    "  ],",
    "",
  ].join("\n");
  return source.replace(marker, `${marker}${entry}`);
}

export function insertReleaseDay(source, version, day) {
  versionParts(version);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Invalid release day: ${day}`);
  const marker = "export const RELEASE_DAYS: Record<string, string> = {\n";
  if (!source.includes(marker)) throw new Error("Release-day insertion point was not found.");
  const escapedVersion = version.replaceAll(".", "\\.");
  if (new RegExp(`^\\s*"${escapedVersion}":`, "m").test(source.slice(source.indexOf(marker)))) {
    throw new Error(`Release days already contain version ${version}.`);
  }
  return source.replace(marker, `${marker}  ${JSON.stringify(version)}: ${JSON.stringify(day)},\n`);
}

export function localReleaseDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseArguments(argv) {
  const options = {
    version: "",
    notes: [],
    message: "",
    yes: false,
    includeUntracked: false,
    waitForLive: true,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${argument} requires a value.`);
      index += 1;
      return next;
    };
    if (argument === "--version" || argument === "-v") options.version = value();
    else if (argument === "--note" || argument === "-n") options.notes.push(value());
    else if (argument === "--message" || argument === "-m") options.message = value();
    else if (argument === "--yes" || argument === "-y") options.yes = true;
    else if (argument === "--include-untracked") options.includeUntracked = true;
    else if (argument === "--no-wait") options.waitForLive = false;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function usage() {
  return `Usage:
  npm run release:live
  npm run release:live -- --version 0.457 --note "Fixed enemy aim." --yes

Options:
  -v, --version <version>       Override suggested next version
  -n, --note <text>             Add release note; repeat for multiple notes
  -m, --message <text>          Override commit message
  -y, --yes                     Skip final confirmation
      --include-untracked       Stage every untracked file too
      --no-wait                 Push without waiting for live version
  -h, --help                    Show help`;
}

function command(commandName, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(commandName, args, {
    cwd: root,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = capture ? result.stderr.trim() : "";
    throw new Error(`${commandName} ${args.join(" ")} failed${detail ? `: ${detail}` : "."}`);
  }
  return capture ? result.stdout.trim() : "";
}

function capture(commandName, args) {
  return command(commandName, args, { capture: true });
}

function changedPaths(includeUntracked, includeAhead) {
  const paths = new Set();
  for (const args of [
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ...(includeAhead ? [["diff", "--name-only", "origin/main...HEAD"]] : []),
    ...(includeUntracked ? [["ls-files", "--others", "--exclude-standard"]] : []),
  ]) {
    const output = capture("git", args);
    for (const path of output.split("\n")) if (path) paths.add(path);
  }
  return [...paths];
}

function assertClientOnly(paths) {
  const serverPaths = paths.filter((path) => serverPathPrefixes.some((prefix) => path.startsWith(prefix)));
  if (!serverPaths.length) return;
  throw new Error([
    "Server/shared changes detected. release:live intentionally handles client-only Pages releases.",
    ...serverPaths.map((path) => `  ${path}`),
    "Publish Maincloud with the server checklist before releasing the matching client.",
  ].join("\n"));
}

async function currentVersion() {
  const settings = await readFile(settingsPath, "utf8");
  const match = settings.match(/const GAME_VERSION = "([^"]+)";/);
  if (!match) throw new Error("GAME_VERSION was not found.");
  return match[1];
}

async function waitForLiveVersion(version, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  process.stdout.write(`Waiting for live v${version}`);
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${liveVersionUrl}?release-check=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const release = response.ok ? await response.json() : null;
      if (release?.version === version) {
        process.stdout.write("\n");
        console.log(`Live: ${liveVersionUrl} reports v${version}`);
        return;
      }
    } catch {}
    process.stdout.write(".");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
  }
  process.stdout.write("\n");
  throw new Error(`Timed out waiting for live v${version}. Check GitHub Actions.`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const branch = capture("git", ["branch", "--show-current"]);
  if (branch !== "main") throw new Error(`Release branch must be main; current branch is ${branch || "detached HEAD"}.`);
  command("node", ["scripts/release.mjs", "--check"]);
  command("git", ["fetch", "origin", "main"]);

  const [localAheadText, remoteAheadText] = capture("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"]).split(/\s+/);
  const localAhead = Number(localAheadText);
  const remoteAhead = Number(remoteAheadText);
  if (remoteAhead > 0) throw new Error("origin/main contains newer commits. Pull or rebase before releasing.");

  const status = capture("git", ["status", "--short"]);
  const statusLines = status ? status.split("\n") : [];
  const includedStatus = statusLines.filter((line) => options.includeUntracked || !line.startsWith("?? "));
  const excludedUntracked = statusLines.filter((line) => line.startsWith("?? "));
  const releasePaths = changedPaths(options.includeUntracked, localAhead > 0);
  if (!includedStatus.length && localAhead === 0) {
    throw new Error(options.includeUntracked
      ? "No local changes found."
      : "No tracked or staged changes found. Stage new files first, or review and use --include-untracked.");
  }
  assertClientOnly(releasePaths);

  const previousVersion = await currentVersion();
  const suggestedVersion = incrementVersion(previousVersion);
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive && (!options.notes.length || !options.yes)) {
    throw new Error("Non-interactive use requires --note and --yes.");
  }
  const prompt = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  let releaseFileSnapshot = null;
  let releaseFilesUpdated = false;
  let releaseFilesStaged = false;

  try {
    let nextVersion = options.version.trim();
    if (!nextVersion) {
      const answer = prompt ? await prompt.question(`Next version [${suggestedVersion}]: `) : "";
      nextVersion = answer.trim() || suggestedVersion;
    }
    if (compareVersions(nextVersion, previousVersion) <= 0) {
      throw new Error(`Next version must be greater than ${previousVersion}.`);
    }

    const notes = [...options.notes];
    if (!notes.length && prompt) {
      console.log("Enter one release note per line. Blank line finishes.");
      while (true) {
        const note = (await prompt.question("> ")).trim();
        if (!note) break;
        notes.push(note);
      }
    }
    if (!notes.some((note) => note.trim())) throw new Error("At least one release note is required.");
    const commitMessage = options.message.trim() || `Release ${nextVersion}`;

    console.log(`\nRelease ${previousVersion} → ${nextVersion}`);
    for (const note of notes) console.log(`  - ${note.trim()}`);
    if (localAhead > 0) console.log(`  - ${localAhead} local commit(s) will also push.`);
    console.log("\nIncluded working-tree changes:");
    for (const line of includedStatus) console.log(`  ${line}`);
    if (excludedUntracked.length && !options.includeUntracked) {
      console.log("\nExcluded untracked paths (stage intended new files first):");
      for (const line of excludedUntracked) console.log(`  ${line}`);
    }

    if (!options.yes) {
      const answer = (await prompt.question("\nRun checks, commit, push, and release? [y/N]: ")).trim().toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        console.log("Release cancelled.");
        return;
      }
    }

    releaseFileSnapshot = await Promise.all(releaseFilePaths.map(async (path) => [path, await readFile(path, "utf8")]));
    const changelog = releaseFileSnapshot.find(([path]) => path === changelogPath)?.[1];
    if (typeof changelog !== "string") throw new Error("Changelog snapshot failed.");
    const nextChangelog = insertReleaseDay(
      insertReleaseNotes(changelog, nextVersion, notes),
      nextVersion,
      localReleaseDay(),
    );
    await writeFile(changelogPath, nextChangelog);
    releaseFilesUpdated = true;
    command("node", ["scripts/release.mjs", nextVersion]);

    command("npm", ["run", "check:release"]);
    command("npm", ["run", "typecheck:coop"]);
    command("npm", ["run", "test:unit"]);
    command("npm", ["run", "build:client"]);
    command("node", ["--check", "dist/assets/wildstat/coop-client.js"]);
    command("node", ["--check", "dist/assets/wildstat/game.js"]);
    command("git", ["diff", "--check"]);
    command("git", ["diff", "--cached", "--check"]);

    command("git", ["add", options.includeUntracked ? "--all" : "--update"]);
    releaseFilesStaged = true;
    command("git", ["diff", "--cached", "--check"]);
    const stagedPaths = capture("git", ["diff", "--cached", "--name-only"]);
    if (!stagedPaths) throw new Error("Nothing was staged for release.");
    assertClientOnly(stagedPaths.split("\n"));
    console.log("\nRelease files:");
    for (const path of stagedPaths.split("\n")) console.log(`  ${path}`);

    command("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", commitMessage]);
    command("git", ["push", "origin", "main"]);
    if (options.waitForLive) await waitForLiveVersion(nextVersion);
    else console.log(`Pushed v${nextVersion}; deployment continues in GitHub Actions.`);
  } catch (error) {
    if (releaseFilesUpdated && !releaseFilesStaged && releaseFileSnapshot) {
      await Promise.all(releaseFileSnapshot.map(([path, source]) => writeFile(path, source)));
      console.error("Release metadata restored; local game changes were kept.");
    }
    throw error;
  } finally {
    prompt?.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`\nRelease failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
