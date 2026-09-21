#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createReleaseApi, executeRollout } from "./rollout.mjs";
import { compareVersions } from "../release-live.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
async function run(command, args, capture = false) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
    let out = "";
    child.stdout?.on("data", data => { out += data; });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolveRun(out.trim()) : reject(new Error(`${command} failed (${code})`)));
  });
}
export function releaseScope(paths) {
  return { root: paths.some(path => /^(shared\/|spacetimedb\/)/.test(path)) };
}
async function workflow(name, fields, ticket) {
  await run("gh", ["workflow", "run", name, ...Object.entries({ ...fields, ticket }).flatMap(([key, value]) => ["-f", `${key}=${value}`])]);
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const runs = JSON.parse(await run("gh", ["run", "list", "--workflow", name, "--limit", "20", "--json", "databaseId,displayTitle,status,conclusion"], true));
    const match = runs.find(row => row.displayTitle.endsWith(ticket));
    if (match?.status === "completed") {
      if (match.conclusion !== "success") throw new Error(`${name}: ${match.conclusion}`);
      return match.databaseId;
    }
    await delay(5000);
  }
  throw new Error(`${name} timed out. No server deployment was started.`);
}
export async function verifyArtifacts(plan) {
  for (const artifact of Object.values(plan.artifacts)) {
    if (digest(await readFile(artifact.path)) !== artifact.sha256) throw new Error(`Prepared artifact changed: ${artifact.path}`);
  }
}
function argumentsFor(args) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--") || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Expected --option value: ${args[i]}`);
    values[args[i].slice(2)] = args[++i];
  }
  return values;
}
async function prepare(options) {
  if (await run("git", ["diff", "HEAD", "--name-only"], true)) throw new Error("Commit the release candidate before preparing; builds must match its exact commit.");
  const commit = await run("git", ["rev-parse", "HEAD"], true);
  const base = options.base;
  if (!base) throw new Error("Pass --base with the last released commit so unchanged servers are skipped.");
  const paths = (await run("git", ["diff", "--name-only", base, commit], true)).split("\n");
  const version = JSON.parse(await readFile(resolve(root, "public/version.json"), "utf8")).version;
  const previousVersion = JSON.parse(await run("git", ["show", `${base}:public/version.json`], true)).version;
  if (compareVersions(version, previousVersion) <= 0) throw new Error("Bump the release version and notes before preparing the candidate.");
  const protocol = source => Number(source.match(/export const PROTOCOL_VERSION = (\d+);/)?.[1]);
  const oldProtocol = protocol(await run("git", ["show", `${base}:shared/rules.ts`], true));
  const nextProtocol = protocol(await readFile(resolve(root, "shared/rules.ts"), "utf8"));
  if (!Number.isInteger(oldProtocol) || oldProtocol !== nextProtocol) throw new Error("Protocol changes need a separately deployed compatibility bridge before using scheduled rollout. Never automatically allow the previous protocol.");
  const id = `release-${version}-${randomUUID()}`;
  const directory = resolve(root, "local-data/releases", id);
  await mkdir(directory, { recursive: true });
  const plan = { id, version, commit, base, scope: releaseScope(paths), reload: true, artifacts: {}, preparedAt: Date.now(), webRun: null };
  async function artifact(key, path) {
    const target = resolve(directory, `${key}-${basename(path)}`);
    await copyFile(path, target);
    plan.artifacts[key] = { path: target, sha256: digest(await readFile(target)) };
  }
  // Build/test before any announcement. Maincloud must never wait on a compiler.
  await run("npm", ["run", "check:release"]);
  await run("npm", ["run", "typecheck:coop"]);
  await run("npm", ["run", "test:unit"]);
  if (plan.scope.root) {
    await run("npx", ["tsc", "--noEmit", "-p", "spacetimedb/tsconfig.json"]);
    await run("spacetime", ["build", "--module-path", "spacetimedb"]);
    await artifact("root", resolve(root, "spacetimedb/dist/bundle.js"));
  }
  for (const platform of ["android", "ios"]) {
    if (!options[platform]) continue;
    if (!basename(options[platform]).includes(version)) throw new Error(`${platform} package filename must include ${version}.`);
    await artifact(platform, resolve(options[platform]));
  }
  console.log("Preparing the exact web commit in GitHub Actions; players remain online.");
  plan.webRun = await workflow("prepare-release.yml", { ref: commit }, id);
  await run("gh", ["run", "download", String(plan.webRun), "--name", "prepared-web", "--dir", resolve(directory, "web")]);
  if ((await readFile(resolve(directory, "web/release-commit.txt"), "utf8")).trim() !== commit ||
    JSON.parse(await readFile(resolve(directory, "web/version.json"), "utf8")).version !== version) throw new Error("Web artifact does not match the prepared release.");
  await artifact("webVersion", resolve(directory, "web/version.json"));
  const file = resolve(directory, "plan.json");
  await writeFile(file, JSON.stringify(plan, null, 2));
  console.log(`Ready: ${file}\nServer changes: ${plan.scope.root ? "yes" : "none"}. No update has been announced.`);
}
async function rollout(options) {
  if (!options.plan) throw new Error("Pass --plan from release:prepare.");
  const file = resolve(options.plan), plan = JSON.parse(await readFile(file, "utf8"));
  await verifyArtifacts(plan);
  const host = process.env.WILDSTAT_RELEASE_HOST ?? "https://maincloud.spacetimedb.com";
  const database = process.env.WILDSTAT_ROOT_DATABASE;
  const api = createReleaseApi({ host, database, token: process.env.WILDSTAT_SHARD_OPERATOR_TOKEN });
  const program = plan.artifacts.root ? await readFile(plan.artifacts.root.path, "utf8") : null;
  // The server is checked before the countdown starts.
  if (program) await api.preflight(database, program);
  plan.startsAt = options.at ? Date.parse(options.at) : Date.now() + 5 * 60_000;
  if (!Number.isFinite(plan.startsAt) || plan.startsAt < Date.now() + 30_000) throw new Error("Update time must be at least 30 seconds in the future.");
  await writeFile(file, JSON.stringify(plan, null, 2));
  console.log(`Update scheduled for ${new Date(plan.startsAt).toLocaleString()}.`);
  const timings = await executeRollout(plan, {
    ...api,
    async deployWeb(runId) {
      console.log("Publishing the prepared web artifact; gameplay stays available.");
      await workflow("publish-prepared-release.yml", { run_id: String(runId) }, `${plan.id}-${randomUUID()}`);
      // No build here. Clients only reload after this version is downloadable.
      const url = process.env.WILDSTAT_RELEASE_VERSION_URL ?? "https://tydoskus.github.io/wildwood/version.json";
      const response = await fetch(`${url}?release=${encodeURIComponent(plan.id)}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok || (await response.json()).version !== plan.version) throw new Error("The prepared client is not available yet. Client distribution needs a retry; compatible server sessions can continue.");
    },
    async deployServers() {
      if (!program) return;
      console.log("Saved progress confirmed. Updating the server.");
      await api.publish(database, program);
    },
  });
  await writeFile(resolve(file, "../timings.json"), JSON.stringify(timings, null, 2));
  console.log(`Release complete. Save/switch interruption: ${(timings.interruptionMs / 1000).toFixed(1)} seconds.`);
}
async function cancel(options) {
  const plan = JSON.parse(await readFile(resolve(options.plan), "utf8"));
  const api = createReleaseApi({ host: process.env.WILDSTAT_RELEASE_HOST ?? "https://maincloud.spacetimedb.com",
    database: process.env.WILDSTAT_ROOT_DATABASE, token: process.env.WILDSTAT_SHARD_OPERATOR_TOKEN });
  await api.phase(plan, "cancelled");
  console.log("Update cancelled. Clients resume without signing out.");
}
export async function main(args) {
  const [action, ...rest] = args;
  if (!action || action === "--help") {
    console.log("release:prepare -- --base <last-released-commit> [--android <aab>] [--ios <ipa>]\nrelease:rollout -- --plan <plan.json> [--at <ISO timestamp>]\nrelease:cancel -- --plan <plan.json>\nPrepare a committed, pushed release branch. No live changes occur during preparation.");
    return;
  }
  const options = argumentsFor(rest);
  if (action === "prepare") await prepare(options);
  else if (action === "rollout") await rollout(options);
  else if (action === "cancel") await cancel(options);
  else throw new Error(`Unknown action: ${action}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
