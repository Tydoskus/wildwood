#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";

// Private configuration never passes through command arguments, output, or a client build.
const args = process.argv.slice(2);
const file = args[0];
if (!file || args.some((arg, index) => index > 0 && arg !== "--apply")) {
  throw new Error("Usage: node scripts/configure-patreon.mjs <private-config.json> [--apply]  (config may include diamondTierId)");
}
const info = await stat(file);
if (process.platform !== "win32" && (info.mode & 0o077)) throw new Error("Private configuration must have mode 600 (owner access only).");
const config = JSON.parse(await readFile(file, "utf8"));
const keys = ["clientId", "clientSecret", "campaignId", "silverTierId", "goldTierId", "redirectUri"];
if (keys.some(key => typeof config[key] !== "string" || !config[key].trim())) throw new Error("Complete all six Patreon configuration fields.");
// Diamond is optional: leave it out or empty until the tier exists on Patreon. Given, it must be a real, distinct tier id.
const diamondTierId = typeof config.diamondTierId === "string" ? config.diamondTierId.trim() : "";
if (diamondTierId && (!/^\d+$/.test(diamondTierId) || diamondTierId === config.goldTierId || diamondTierId === config.silverTierId)) throw new Error("The diamond tier id must be a distinct numeric Patreon tier id.");
if (["campaignId", "silverTierId", "goldTierId"].some(key => !/^\d+$/.test(config[key])) || config.silverTierId === config.goldTierId) throw new Error("Use the campaign ID and distinct Silver/Gold tier IDs from Patreon.");
const database = process.env.WILDSTAT_ROOT_DATABASE;
if (!database || !/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error("Set WILDSTAT_ROOT_DATABASE to the root database name.");
const host = "https://maincloud.spacetimedb.com";
if (config.redirectUri !== `${host}/v1/database/${database}/route/patreon/callback`) throw new Error("The redirect must match this root database's Patreon callback URL.");
if (!args.includes("--apply")) {
  console.log("Private Patreon configuration is valid. Nothing was sent. Add --apply after deploying the supporter module.");
} else {
  const token = process.env.WILDSTAT_SHARD_OPERATOR_TOKEN;
  if (!token) throw new Error("Set WILDSTAT_SHARD_OPERATOR_TOKEN to the database owner's token.");
  const response = await fetch(`${host}/v1/database/${database}/call/configure_patreon`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([...keys.map(key => config[key]), diamondTierId]), signal: AbortSignal.timeout(15_000),
  });
  // Do not echo a server response that could contain credentials from the request.
  if (!response.ok) throw new Error(`Patreon configuration failed (HTTP ${response.status}). Check database owner access and deployed module version.`);
  console.log("Patreon configured privately on the root database. No credentials were printed.");
}
