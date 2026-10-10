import { describe, expect, it } from "vitest";
import { createActorRenderer } from "./actor-renderer";
import { drawStartingPlayer, type PlayerAppearanceAssets } from "../player-appearance";
import type { LayerBounds, PlayerLayer } from "../player-layer-alignment";
import { GALAXY_ARMOR, GALAXY_BOOTS, GALAXY_HELMET } from "../../../shared/items";

const image = (name: string) => ({ complete: true, naturalWidth: 40, naturalHeight: 40, width: 40, height: 40, name }) as unknown as HTMLImageElement;
const assets: PlayerAppearanceAssets = {
  basicFrontLeg: image("front-leg"), basicBackLeg: image("back-leg"),
  equipment: {
    [GALAXY_HELMET]: { sprite: image("helmet") }, [GALAXY_ARMOR]: { sprite: image("chest") },
    [GALAXY_BOOTS]: { frontLeg: image("boot-front"), backLeg: image("boot-back") },
  },
};

/** A 2D context that accepts every call; layer bounds are then in the character's own space. */
function fakeContext() {
  return new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return () => ({ addColorStop() {} });
    },
    set(target, key, value) { target[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

/**
 * The world draws players the way world-render-runtime does: the frame clock
 * unless the actor holds its own moment. Returns the head layer's height
 * against the body's, for each frame the renderer drew a player.
 */
function headAgainstBody(look: { headItem?: string; chestItem?: string; feetItem?: string }, death: boolean, clocks: number[], nowMs: number) {
  let clock = 0;
  const offsets: number[] = [];
  const ctx = fakeContext();
  const renderer = createActorRenderer({
    ctx, camera: { x: 0, y: 0, zoom: 1 }, viewport: () => ({ width: 800, height: 800 }), devicePixelRatio: () => 1,
    gameTime: () => clock, nowMs: () => nowMs, player: { x: 100, y: 100, hp: death ? 0 : 10, maxHp: 10, facing: 0 },
    localHeadItem: () => look.headItem ?? "", localChestItem: () => look.chestItem ?? "", localFeetItem: () => look.feetItem ?? "",
    localRightHandItem: () => "", localLeftHandItem: () => "",
    localDeath: () => death ? { id: "me", x: 100, y: 100, facing: 0, startedAtMs: 0 } : null, remoteDeath: () => null,
    itemSprite: () => undefined, drawShadow: () => {}, drawStatus: () => {}, drawSpeechBubble: () => {},
    drawPlayerAppearance: (actor: Parameters<typeof drawStartingPlayer>[2], alpha: number) => {
      const bounds = new Map<PlayerLayer, LayerBounds>();
      drawStartingPlayer(ctx, assets, { ...actor, gameTime: actor.gameTime ?? clock, alpha, onLayerBounds: (layer, value) => bounds.set(layer, value) });
      offsets.push(bounds.get("head")!.y - bounds.get("body")!.y);
    },
  } as unknown as Parameters<typeof createActorRenderer>[0]);
  for (const value of clocks) { clock = value; renderer.drawPlayer("me", "Me", 1); }
  return offsets;
}

// Half a second apart: each lands on a different idle frame, whose head bob is 0, -2, -3, -2.
const IDLE_FRAMES = [0, .5, 1, 1.5];

describe("a fallen player's head", () => {
  it("bobs while standing, so the check below can see a bob", () => {
    expect(new Set(headAgainstBody({}, false, IDLE_FRAMES, 0)).size).toBeGreaterThan(1);
  });
  for (const [name, look] of [["plain", {}], ["galaxy", { headItem: GALAXY_HELMET, chestItem: GALAXY_ARMOR, feetItem: GALAXY_BOOTS }]] as const) {
    it(`follows the body through the fall and stays still once it lies (${name})`, () => {
      const rest = headAgainstBody({}, false, [0], 0)[0];
      for (const nowMs of [200, 600, 5_000]) {
        expect(headAgainstBody(look, true, IDLE_FRAMES, nowMs), `${nowMs} ms`).toEqual(IDLE_FRAMES.map(() => rest));
      }
    });
  }
});
