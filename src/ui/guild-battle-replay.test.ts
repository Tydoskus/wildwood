import { expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { simulateGuildBattle } from "../../shared/guild-combat";
import { createGuildBattleReplay, type GuildReplayAssets } from "./guild-battle-replay";
function setup() {
  const { document, window } = parseHTML("<html><body><div id='host'></div></body></html>");
  let nextId = 0;
  const scheduled = new Map<number, FrameRequestCallback>();
  window.requestAnimationFrame = (callback: FrameRequestCallback) => { const id = ++nextId; scheduled.set(id, callback); return id; };
  window.cancelAnimationFrame = (id: number) => { scheduled.delete(id); };
  const context = new Proxy({}, { get: (_target, name) => name === "canvas" ? {} : vi.fn(), set: () => true });
  const create = document.createElement.bind(document);
  document.createElement = ((tag: string) => { const node = create(tag); if (tag === "canvas") Object.defineProperty(node, "getContext", { value: () => context }); return node; }) as typeof document.createElement;
  const member = (name: string) => ({ identity: name, name, fighter: { maxHp: 100, damage: 0, armor: 0, regen: 0, attackRate: 1 } });
  const battle = simulateGuildBattle([member("A")], [member("B")]);
  const frame = (time: number) => { const callbacks = [...scheduled.values()]; scheduled.clear(); callbacks.forEach(callback => callback(time)); };
  return { document, scheduled, frame, battle, host: document.getElementById("host")! as unknown as HTMLElement };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
it("supports pause, seek, restart and releases the animation callback on close", async () => {
  const h = setup(), replay = createGuildBattleReplay(h.host, h.battle, ["Fire", "Moon"]);
  await settle(); expect(h.scheduled.size).toBe(1);
  h.frame(100); h.frame(200);
  const button = (label: string) => [...h.document.querySelectorAll("button")].find(node => node.textContent === label)!;
  button("Pause").click(); h.frame(300); expect(h.scheduled.size).toBe(0);
  const seek = h.document.querySelector("input")! as unknown as HTMLInputElement;
  seek.value = "42"; seek.oninput!(new Event("input"));
  expect(h.document.querySelector('[role="status"]')!.textContent).toContain("42.0s");
  button("Restart").click(); expect(h.scheduled.size).toBe(1);
  expect(seek.value).toBe("0");
  replay.dispose(); expect(h.scheduled.size).toBe(0); expect(h.host.childElementCount).toBe(0);
});
it("does not start a late asset load after the replay is disposed", async () => {
  const h = setup(); let finish!: () => void;
  const assets = { prepare: () => new Promise<void>(resolve => { finish = resolve; }) } as GuildReplayAssets;
  const replay = createGuildBattleReplay(h.host, h.battle, ["Fire", "Moon"], assets);
  replay.dispose(); finish(); await settle();
  expect(h.scheduled.size).toBe(0); expect(h.host.childElementCount).toBe(0);
});
it("keeps Back to battles available after seeking to the finished replay", async () => {
  const h = setup(), back = vi.fn();
  const replay = createGuildBattleReplay(h.host, h.battle, ["Fire", "Moon"], undefined, back);
  await settle();
  const seek = h.document.querySelector("input")! as unknown as HTMLInputElement;
  seek.value = seek.max; seek.oninput!(new Event("input"));
  expect(h.document.querySelector('[role="status"]')!.textContent).toContain("Draw");
  const control = [...h.document.querySelectorAll("button")].find(button => button.textContent === "Back to battles")!;
  expect(control.disabled).toBe(false); control.click(); expect(back).toHaveBeenCalledOnce();
  replay.dispose();
});
