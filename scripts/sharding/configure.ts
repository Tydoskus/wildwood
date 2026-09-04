/** One-shot deployment configuration. No service needs to keep running here. */
import { readFile } from "node:fs/promises";
const database = process.env.WILDSTAT_ROOT_DATABASE;
const token = process.env.WILDSTAT_SHARD_OPERATOR_TOKEN;
if (!database || !token) throw new Error("Set WILDSTAT_ROOT_DATABASE and WILDSTAT_SHARD_OPERATOR_TOKEN for this deployment.");
const host = "https://maincloud.spacetimedb.com";
async function call(name: string, args: unknown[]) {
  const response = await fetch(`${host}/v1/database/${encodeURIComponent(database!)}/call/${name}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${name} failed (${response.status}); configuration was not enabled.`);
}
const program = await readFile(new URL("../../spacetimedb-map/dist/bundle.js", import.meta.url), "utf8");
const size = 150_000;
const total = Math.ceil(program.length / size);
for (let part = 0; part < total; part++) await call("stage_shard_program", [part, total, program.slice(part * size, (part + 1) * size)]);
await call("configure_shard_coordinator", [host, token, ""]);
const directoryResponse = await fetch(`${host}/v1/database/${encodeURIComponent(database)}/sql`, {
  method: "POST", headers: { Authorization: `Bearer ${token}` },
  body: "SELECT database_name FROM map_shard WHERE state = 'ready'", signal: AbortSignal.timeout(60_000),
});
if (!directoryResponse.ok) throw new Error(`Map directory read failed (${directoryResponse.status}).`);
const results = await directoryResponse.json() as { rows: string[][] }[];
for (const [name] of results.flatMap(result => result.rows)) {
  const target = `${host}/v1/database/${encodeURIComponent(name)}`;
  const preflight = await fetch(`${target}/pre_publish?host_type=Js`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: program, signal: AbortSignal.timeout(60_000),
  });
  if (!preflight.ok) throw new Error(`Map migration check failed (${preflight.status}).`);
  const plan = await preflight.json() as { AutoMigrate?: { token: string } };
  if (!plan.AutoMigrate) throw new Error("Map update requires a manual migration; no data was cleared.");
  const response = await fetch(`${target}?host_type=Js&clear=false&policy=BreakClients&token=${encodeURIComponent(plan.AutoMigrate.token)}`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: program, signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Map program update failed (${response.status}); no data was cleared.`);
}
if (process.argv.includes("--enable")) await call("configure_sharding", ["root", true, "", 0]);
console.log(`SpacetimeDB coordinator configured${process.argv.includes("--enable") ? " and sharding enabled" : "; sharding enablement unchanged"}.`);
