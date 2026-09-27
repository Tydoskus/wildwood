import { wallClockNowMs } from "../../app/trusted-clock";
import { ATTACK_BALANCE_VERSION } from "../../../shared/rules";
type Checkpoint = { mapId: string; hp: number; maxHp: number };
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** One active fight per character; checkpoint writes are local and throttled. */
export function createBossFightMemory(storage: StoragePort, identity: () => string, now = wallClockNowMs) {
  let owner = "", loaded = false, checkpoint: Checkpoint | null = null;
  let dirty = false, lastWrite = -Infinity;
  const key = () => `wildstat-boss-fight-v1-balance${ATTACK_BALANCE_VERSION}:${owner}`;
  function load() {
    const next = identity();
    if (loaded && next === owner) return;
    flush();
    owner = next; loaded = true; checkpoint = null; dirty = false; lastWrite = -Infinity;
    if (!owner) return;
    try {
      const saved = JSON.parse(storage.getItem(key()) ?? "null");
      if (saved && typeof saved.mapId === "string" && Number.isFinite(saved.hp) && Number.isFinite(saved.maxHp)
        && saved.hp > 0 && saved.hp < saved.maxHp) checkpoint = saved;
    } catch {}
  }
  function flush() {
    if (!owner || !dirty) return;
    try {
      if (checkpoint) storage.setItem(key(), JSON.stringify(checkpoint));
      else storage.removeItem(key());
      dirty = false; lastWrite = now();
    } catch {}
  }
  return {
    restore(mapId: string, maxHp: number) {
      load();
      if (!checkpoint) return null;
      if (checkpoint.mapId !== mapId || checkpoint.maxHp !== maxHp) {
        checkpoint = null; dirty = true; flush(); return null;
      }
      return checkpoint.hp;
    },
    remember(mapId: string, hp: number, maxHp: number) {
      load(); if (!owner || !Number.isFinite(hp) || hp <= 0 || hp >= maxHp) return;
      checkpoint = { mapId, hp, maxHp }; dirty = true;
      if (now() - lastWrite >= 1_000) flush();
    },
    clear() { load(); checkpoint = null; dirty = true; flush(); },
    flush,
  };
}
export type BossFightMemory = ReturnType<typeof createBossFightMemory>;
