import { describe, expect, it, vi } from "vitest";
import { createReleaseApi, executeRollout, mapLimit } from "./rollout.mjs";
import { releaseScope } from "./cli.mjs";
function fixture() {
  let clock = 0;
  const d = { now: () => clock, sleep: async ms => { clock += ms; },
    phase: vi.fn(async () => {}), deployWeb: vi.fn(async () => {}), deployServers: vi.fn(async () => { clock += 1200; }),
    missingAcknowledgements: vi.fn(async () => 0) };
  return { d, plan: { id: "release-1", version: "0.696", startsAt: 10000, reload: true, webRun: 123 } };
}
describe("prepared release orchestration", () => {
  it("publishes prepared web before switching servers and records actual interruption", async () => {
    const f = fixture(); const timing = await executeRollout(f.plan, f.d);
    expect(f.d.phase.mock.calls.map(args => args[1])).toEqual(["scheduled", "draining", "updating", "complete"]);
    expect(f.d.deployWeb.mock.invocationCallOrder[0]).toBeLessThan(f.d.deployServers.mock.invocationCallOrder[0]);
    expect(timing.interruptionMs).toBe(1200);
  });
  it("resumes compatible clients before distributing a backend-dependent web build", async () => {
    const f = fixture(); f.plan.scope = { root: true, maps: true };
    await executeRollout(f.plan, f.d);
    const completionIndex = f.d.phase.mock.calls.findIndex(args => args[1] === "complete");
    expect(f.d.deployServers.mock.invocationCallOrder[0]).toBeLessThan(f.d.phase.mock.invocationCallOrder[completionIndex]);
    expect(f.d.phase.mock.invocationCallOrder[completionIndex]).toBeLessThan(f.d.deployWeb.mock.invocationCallOrder[0]);
  });
  it("postpones rather than dropping unacknowledged player progress", async () => {
    const f = fixture(); f.d.missingAcknowledgements.mockResolvedValue(1);
    await expect(executeRollout(f.plan, f.d)).rejects.toThrow("postponed");
    expect(f.d.deployServers).not.toHaveBeenCalled(); expect(f.d.phase.mock.calls.at(-1)[1]).toBe("cancelled");
  });
  it("cancels after web failure before changing any servers", async () => {
    const f = fixture(); f.d.deployWeb.mockRejectedValue(new Error("failed"));
    await expect(executeRollout(f.plan, f.d)).rejects.toThrow("failed"); expect(f.d.deployServers).not.toHaveBeenCalled();
    expect(f.d.phase.mock.calls.at(-1)[1]).toBe("cancelled");
  });
  it("leaves every server alone for client-only changes", () => {
    expect(releaseScope(["src/main.ts", "public/assets/wildstat/game.css"])).toEqual({ root: false, maps: false });
    expect(releaseScope(["shared/rules.ts"]).maps).toBe(true);
  });
  it("rejects destructive or client-breaking plans before publishing", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ AutoMigrate: { token: "t", break_clients: true } }) }));
    const api = createReleaseApi({ host: "https://example.test", database: "game", token: "fake", fetchImpl });
    await expect(api.publish("map", "code")).rejects.toThrow("client-compatibility"); expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("uses compatible publishing with clear=false", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ AutoMigrate: { token: "t", break_clients: false } }) }));
    const api = createReleaseApi({ host: "https://example.test", database: "game", token: "fake", fetchImpl });
    await api.publish("map", "code");
    expect(fetchImpl.mock.calls[1][0]).toContain("clear=false&policy=Compatible");
  });
  it("bounds simultaneous map publishes and stops scheduling work after failure", async () => {
    let active = 0, peak = 0;
    await mapLimit([1,2,3,4,5], 2, async () => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; });
    expect(peak).toBe(2);
    const run = vi.fn(async () => { throw new Error("failed"); });
    await expect(mapLimit([1,2,3,4,5], 2, run)).rejects.toThrow("failed"); expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("transient host failures during a hundred-database rollout", () => {
  const ok = body => ({ ok: true, status: 200, json: async () => body });
  function api(responses) {
    const calls = [];
    const fetchImpl = async url => { calls.push(url); const next = responses.shift(); if (next instanceof Error) throw next; return next; };
    return { calls, api: createReleaseApi({ host: "https://h", database: "db", token: "t", fetchImpl, sleep: async () => {} }) };
  }
  const passing = ok({ AutoMigrate: { break_clients: false, token: "x" } });

  it("retries a 502 rather than abandoning the remaining databases", async () => {
    const f = api([{ ok: false, status: 502 }, passing]);
    await expect(f.api.preflight("shard", "program")).resolves.toMatchObject({ break_clients: false });
    expect(f.calls).toHaveLength(2);
  });

  it("retries a dropped connection", async () => {
    const f = api([new Error("fetch failed"), passing]);
    await expect(f.api.preflight("shard", "program")).resolves.toMatchObject({ break_clients: false });
    expect(f.calls).toHaveLength(2);
  });

  it("does not retry a 4xx, which is the module's own answer", async () => {
    const f = api([{ ok: false, status: 401 }]);
    await expect(f.api.preflight("shard", "program")).rejects.toThrow("HTTP 401");
    expect(f.calls).toHaveLength(1);
  });

  it("gives up after five attempts and names the last failure", async () => {
    const f = api(Array.from({ length: 5 }, () => ({ ok: false, status: 503 })));
    await expect(f.api.preflight("shard", "program")).rejects.toThrow("HTTP 503");
    expect(f.calls).toHaveLength(5);
  });

  it("still refuses a client break unless the release asked for one", async () => {
    const breaking = () => ok({ AutoMigrate: { break_clients: true, token: "x" } });
    const strict = createReleaseApi({ host: "https://h", database: "db", token: "t", fetchImpl: async () => breaking() });
    await expect(strict.preflight("db", "program")).rejects.toThrow("--allow-client-break");
    const waived = createReleaseApi({ host: "https://h", database: "db", token: "t", fetchImpl: async () => breaking(), allowClientBreak: true });
    await expect(waived.preflight("db", "program")).resolves.toMatchObject({ break_clients: true });
  });

  it("never waives a manual migration", async () => {
    const waived = createReleaseApi({ host: "https://h", database: "db", token: "t", allowClientBreak: true,
      fetchImpl: async () => ok({ ManualMigrate: { reason: "Reordering table player" } }) });
    await expect(waived.preflight("db", "program")).rejects.toThrow("manual migration");
  });
});

describe("the policy a publish is sent under", () => {
  function publisher(breakClients, allowClientBreak) {
    const urls = [];
    const fetchImpl = async (url, init) => {
      urls.push(`${init?.method ?? "GET"} ${url}`);
      return { ok: true, status: 200, json: async () => ({ AutoMigrate: { break_clients: breakClients, token: "0xabc" } }) };
    };
    return { urls, api: createReleaseApi({ host: "https://h", database: "db", token: "t", fetchImpl, allowClientBreak, sleep: async () => {} }) };
  }

  it("asks for BreakClients when the plan breaks clients, carrying the token as proof", async () => {
    const f = publisher(true, true);
    await f.api.publish("db", "program");
    const put = f.urls.find(url => url.startsWith("PUT "));
    expect(put).toContain("policy=BreakClients");
    expect(put).toContain("token=0xabc");
  });

  it("keeps the stricter policy for a database whose own plan is compatible", async () => {
    const f = publisher(false, true);
    await f.api.publish("db", "program");
    expect(f.urls.find(url => url.startsWith("PUT "))).toContain("policy=Compatible");
  });

  it("never reaches a breaking publish without the flag", async () => {
    const f = publisher(true, false);
    await expect(f.api.publish("db", "program")).rejects.toThrow("--allow-client-break");
    expect(f.urls.some(url => url.startsWith("PUT "))).toBe(false);
  });
});
