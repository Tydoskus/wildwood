import { setTimeout as delay } from "node:timers/promises";

export async function mapLimit(values, limit, run) {
  let next = 0, failure;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (!failure && next < values.length) {
      const index = next++;
      try { await run(values[index], index); } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
}

export function createReleaseApi({ host, database, token, fetchImpl = fetch, allowClientBreak = false }) {
  if (!token || !database) throw new Error("Set WILDSTAT_ROOT_DATABASE and WILDSTAT_SHARD_OPERATOR_TOKEN.");
  const endpoint = name => `${host}/v1/database/${encodeURIComponent(name)}`;
  async function request(name, suffix, init = {}) {
    const response = await fetchImpl(endpoint(name) + suffix, {
      ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`${name}${suffix.split("?")[0]}: HTTP ${response.status}`);
    return response;
  }
  const sql = async query => (await (await request(database, "/sql", { method: "POST", body: query })).json()).flatMap(result => result.rows);
  const call = async (name, args) => { await request(database, `/call/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args),
  }); };
  return {
    sql, call,
    async preflight(name, program) {
      const result = await (await request(name, "/pre_publish?host_type=Js", { method: "POST", body: program })).json();
      // A manual migration is never waivable: it needs data moved by hand.
      if (!result.AutoMigrate) throw new Error(`${name}: requires a manual migration. Nothing was cleared.`);
      // Disconnecting every player is waivable, but only deliberately: the cost
      // is one reconnect per release, not per change, so batch schema debt.
      if (result.AutoMigrate.break_clients !== false && !allowClientBreak) {
        throw new Error(`${name}: requires a separate client-compatibility release, or --allow-client-break to disconnect every player. Nothing was cleared.`);
      }
      return result.AutoMigrate;
    },
    async publish(name, program) {
      // Recheck against the current schema; another deployment may have intervened.
      const result = await this.preflight(name, program);
      await request(name, `?host_type=Js&clear=false&policy=Compatible&token=${encodeURIComponent(result.token)}`, { method: "PUT", body: program });
    },
    async phase(plan, phase) { await call("set_release_window", [plan.id, plan.version, phase, plan.startsAt, plan.reload]); },
    async missingAcknowledgements(id) {
      if (!/^[\w.-]+$/.test(id)) throw new Error("Invalid release id");
      const [players, ready] = await Promise.all([
        sql("SELECT identity FROM player"), sql(`SELECT identity FROM release_acknowledgement WHERE release_id = '${id}'`),
      ]);
      const acknowledged = new Set(ready.map(row => String(row[0])));
      return players.filter(row => !acknowledged.has(String(row[0]))).length;
    },
    async stageMapProgram(program) {
      const size = 150_000, count = Math.ceil(program.length / size);
      for (let part = 0; part < count; part++) await call("stage_shard_program", [part, count, program.slice(part * size, (part + 1) * size)]);
      await call("configure_shard_coordinator", [host, token, ""]);
    },
  };
}

/** Dependencies make failures/timeouts testable without touching a live database. */
export async function executeRollout(plan, d) {
  const now = d.now ?? Date.now, sleep = d.sleep ?? delay;
  const timings = { announcedAt: now(), startedAt: 0, completedAt: 0 };
  let phase = "scheduled", leaseFailure = null, heartbeat;
  await d.phase(plan, phase);
  try {
    // Deployment uses a previously tested web artifact, never a rebuild.
    // A client that adds tables/views must never run ahead of its server.
    // Client-only releases can distribute during the countdown.
    if (plan.webRun && !plan.scope?.root) await d.deployWeb(plan.webRun);
    while (now() < plan.startsAt) await sleep(Math.min(1000, plan.startsAt - now()));
    phase = "draining";
    await d.phase(plan, phase);
    timings.startedAt = now();
    // A crashed operator cannot strand players: the server notice expires in 90s.
    heartbeat = setInterval(() => { void d.phase(plan, phase).catch(error => { leaseFailure = error; }); }, 15_000);
    const deadline = now() + 30_000;
    while (await d.missingAcknowledgements(plan.id)) {
      if (leaseFailure) throw leaseFailure;
      if (now() >= deadline) throw new Error("Some online players have not confirmed saved progress. Update postponed.");
      await sleep(1000);
    }
    if (leaseFailure) throw leaseFailure;
    phase = "updating";
    await d.phase(plan, phase);
    await d.deployServers();
    if (leaseFailure) throw leaseFailure;
    clearInterval(heartbeat);
    await d.phase(plan, "complete");
    timings.completedAt = now();
    // Compatible older clients resume now; CDN/store distribution is outside
    // the interruption. They save again before their individual client reload.
    if (plan.webRun && plan.scope?.root) await d.deployWeb(plan.webRun);
    return { ...timings, interruptionMs: timings.completedAt - timings.startedAt };
  } catch (error) {
    clearInterval(heartbeat);
    await d.phase(plan, "cancelled").catch(() => {});
    throw error;
  }
}
