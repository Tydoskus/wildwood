import { setTimeout as delay } from "node:timers/promises";

export function createReleaseApi({ host, database, token, fetchImpl = fetch, allowClientBreak = false, sleep = delay }) {
  if (!token || !database) throw new Error("Set WILDSTAT_ROOT_DATABASE and WILDSTAT_SHARD_OPERATOR_TOKEN.");
  const endpoint = name => `${host}/v1/database/${encodeURIComponent(name)}`;
  // A publish uploads a five-megabyte bundle twice (check, then publish), and
  // the gateway sheds one now and then: a 502 here came back 200 on a direct
  // retry seconds later. Retry the host's own failures (5xx, timeouts) with
  // room to ride out a busy spell; a 4xx is the module's considered answer and
  // will not change on a second ask.
  async function request(name, suffix, init = {}, attempts = 5) {
    let failure;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let response;
      try {
        response = await fetchImpl(endpoint(name) + suffix, {
          ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(60_000),
        });
      } catch (error) {
        failure = error;
        if (attempt === attempts) break;
        await sleep(attempt * 3_000);
        continue;
      }
      if (response.ok) return response;
      failure = new Error(`${name}${suffix.split("?")[0]}: HTTP ${response.status}`);
      if (response.status < 500 || attempt === attempts) break;
      await sleep(attempt * 3_000);
    }
    throw failure;
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
      // Compatible refuses a plan that breaks clients however the caller feels
      // about it; BreakClients is the acknowledgement, and the token from the
      // recheck above is its proof. Ask for it only when the plan needs it, so
      // a compatible plan still publishes under the stricter policy.
      const policy = result.break_clients ? "BreakClients" : "Compatible";
      await request(name, `?host_type=Js&clear=false&policy=${policy}&token=${encodeURIComponent(result.token)}`, { method: "PUT", body: program });
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
