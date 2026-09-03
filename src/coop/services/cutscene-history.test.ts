import { describe, expect, it, vi } from "vitest";
import { PORTAL_CUTSCENES } from "../../../shared/portal-cutscenes";
import { createCutsceneHistory } from "./cutscene-history";

const first = PORTAL_CUTSCENES[0].id;
const second = PORTAL_CUTSCENES[1].id;
function fixture() {
  let identity = "alice";
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  } as unknown as Storage;
  const send = vi.fn(async (_id: string) => true);
  const create = () => createCutsceneHistory({ identity: () => identity, storage, send });
  const history = create();
  history.begin();
  return { history, send, saved, create, switchIdentity: (next: string) => { identity = next; } };
}

describe("character cutscene history", () => {
  it("waits for server history, then suppresses scenes watched on another device", () => {
    const { history } = fixture();
    expect(history.hasSeen(first)).toBe(true);
    history.upsert("alice", 1);
    expect(history.hasSeen(first)).toBe(true);
    expect(history.hasSeen(second)).toBe(false);
    history.upsert("bob", 63);
    expect(history.hasSeen(second)).toBe(false);
  });
  it("records completion once and does not treat a new unlock as already watched", async () => {
    const { history, send } = fixture();
    history.upsert("alice", 0);
    history.mark(first);
    expect(history.hasSeen(first)).toBe(true);
    await history.flush();
    history.mark(first);
    expect(send).toHaveBeenCalledExactlyOnceWith(first, 0);
    expect(history.hasSeen(second)).toBe(false);
  });
  it("retries interrupted completion saves after reconnecting", async () => {
    const { history, send, create, saved } = fixture();
    history.upsert("alice", 0);
    send.mockResolvedValueOnce(false);
    history.mark(first);
    expect(await history.flush()).toBe(false);
    expect(saved.size).toBe(1);
    const restored = create();
    restored.begin();
    restored.upsert("alice", 0);
    expect(restored.hasSeen(first)).toBe(true);
    expect(await restored.flush()).toBe(true);
    expect(saved.size).toBe(0);
  });
  it("does not leak a pending save or its response into another character", async () => {
    const { history, send, switchIdentity, saved } = fixture();
    history.upsert("alice", 0);
    let resolveSend!: (value: boolean) => void;
    send.mockImplementationOnce(() => new Promise((resolve) => { resolveSend = resolve; }));
    history.mark(first);
    const saving = history.flush();
    switchIdentity("bob");
    history.begin();
    history.upsert("bob", 0);
    resolveSend(true);
    await saving;
    expect(history.hasSeen(first)).toBe(false);
    expect(saved.has("wildstat-cutscene-pending-v1:alice")).toBe(true);
  });
  it("resets completed and queued scenes, and ignores unknown scene IDs", async () => {
    const { history, send, saved } = fixture();
    history.upsert("alice", 63);
    history.reset();
    expect(history.hasSeen(first)).toBe(false);
    history.mark("not-a-scene");
    expect(await history.flush()).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(saved.size).toBe(0);
  });
  it("discards an old pending completion when the character is reset elsewhere", async () => {
    const { history, send, saved } = fixture();
    history.upsert("alice", 0, 0);
    send.mockResolvedValueOnce(false);
    history.mark(first);
    await history.flush();
    history.upsert("alice", 0, 1);
    expect(history.hasSeen(first)).toBe(false);
    expect(saved.size).toBe(0);
    expect(await history.flush()).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
