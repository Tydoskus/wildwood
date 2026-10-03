import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { validateBalanceSettings } from "../shared/map-balance";
import { liveBalanceSource } from "./balance/live-balance-source";

// One read-only join captures a consistent head + settings pair. No player data.
const query = "SELECT v.revision, v.settings_json FROM map_balance_version v JOIN map_balance_head h ON v.revision = h.revision";
const output = execFileSync(process.env.SPACETIME_BIN || "spacetime", [
  "sql", "wildwood-coop", "--server", "maincloud", "--format", "json", query,
], { encoding: "utf8", timeout: 30_000 });
const rows = JSON.parse(output)[0]?.rows;
if (rows?.length !== 1) throw new Error("Expected one live balance revision; previous snapshot retained.");
const [revision, json] = rows[0];
if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid balance revision.");
const snapshot = { revision, capturedAt: new Date().toISOString(), database: "wildwood-coop",
  settings: validateBalanceSettings(JSON.parse(json)) };
writeFileSync(new URL("../src/balance/live-balance.ts", import.meta.url), liveBalanceSource(snapshot));
console.log(`Balance Lab captured maincloud revision ${revision}. No server changes.`);
