import { describe, expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import type { ReducerPort } from "../ports";
import { DEVELOPER_IDENTITY } from "../../app/developer";
import { createDevModerationService } from "./dev-moderation";

const TARGET = "ab".repeat(32);

function fixture(local = DEVELOPER_IDENTITY) {
  const reducers = {
    devSetChatMute: vi.fn(async (_args: unknown) => {}),
    devSuspendPlayerAccount: vi.fn(async (_args: unknown) => {}),
    devReviewReport: vi.fn(async (_args: unknown) => {}),
  };
  const procedures = {
    getDevReviewQueue: vi.fn(async () => JSON.stringify({ reports: [], bugs: [], openReports: 0, openBugs: 0, serverNowMs: Date.now() + 60_000 })),
  };
  const port = {
    connection: () => ({ reducers, procedures }), protocolBlocked: () => false,
    runWorldReducer: (run: () => Promise<void>) => run(),
    errorMessage: (error: Error) => error.message, handleFailure: vi.fn(),
  } as unknown as ReducerPort;
  return { service: createDevModerationService({ reducers: port, localIdentity: () => local }), reducers, procedures };
}

describe("developer moderation service", () => {
  it("mutes through the typed reducer, and 0 lifts the mute", async () => {
    const { service, reducers } = fixture();
    expect(await service.api.setChatMute(TARGET, 60)).toEqual({ ok: true });
    expect(await service.api.setChatMute(TARGET, 0)).toEqual({ ok: true });
    const calls = reducers.devSetChatMute.mock.calls.map(([args]) => args as { identity: Identity; minutes: number });
    expect(calls.map(call => [call.identity.toHexString(), call.minutes])).toEqual([[TARGET, 60], [TARGET, 0]]);
  });

  it("measures timed bans against the server clock and keeps 7 days inside the server's limit", async () => {
    const { service, reducers } = fixture();
    await service.api.reviewQueue();
    const before = Date.now() + 60_000;
    await service.api.suspend(TARGET, "Rude", 168, "spam");
    const { untilMicros } = reducers.devSuspendPlayerAccount.mock.calls[0][0] as { untilMicros: bigint };
    const untilMs = Number(untilMicros / 1000n);
    expect(untilMs).toBeGreaterThan(before + 6.9 * 86_400_000);
    expect(untilMs).toBeLessThan(before + 7 * 86_400_000);
    await service.api.suspend(TARGET, "Rude", 0, "spam");
    expect((reducers.devSuspendPlayerAccount.mock.calls[1][0] as { untilMicros: bigint }).untilMicros).toBe(0n);
  });

  it("sends nothing from a non-developer tab", async () => {
    const { service, reducers, procedures } = fixture("cd".repeat(32));
    expect(await service.api.setChatMute(TARGET, 60)).toEqual({ ok: false, error: "Developer access required." });
    expect(await service.api.reviewReport("chat:1", "dismissed", "", true)).toMatchObject({ ok: false });
    await expect(service.api.reviewQueue()).rejects.toThrow("Developer access required.");
    expect(reducers.devSetChatMute).not.toHaveBeenCalled();
    expect(procedures.getDevReviewQueue).not.toHaveBeenCalled();
  });
});
