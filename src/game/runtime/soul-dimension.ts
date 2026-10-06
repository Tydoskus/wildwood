import { SOUL_MAP_ID } from "../../../shared/soul-dimension";
import { isDeveloperIdentity } from "../../app/developer";
import { createSoulDimensionWindow } from "../../ui/soul-dimension-window";
import type { MapId } from "../world";
import { createSoulDimensionRuntime } from "./soul-dimension-runtime";

/**
 * The Soul Dimension as the composition root sees it: the runtime that runs
 * the world, and the home portal's window that leads into it.
 */
export function createSoulDimension(deps: Parameters<typeof createSoulDimensionRuntime>[0] & {
  travel: (mapId: MapId) => Promise<boolean>;
}) {
  const runtime = createSoulDimensionRuntime(deps);
  const window = createSoulDimensionWindow({
    state: () => {
      const source = deps.source();
      return {
        access: runtime.access(),
        developer: isDeveloperIdentity(source?.localIdentity?.() ?? ""),
        open: Boolean(source?.soulDimensionOpen?.()),
        tier: runtime.tier(),
        kills: runtime.rewardKills(),
        soul: runtime.soulStats(),
      };
    },
    enter: () => deps.travel(SOUL_MAP_ID),
    setOpen: async open => Boolean(await deps.source()?.setSoulDimensionOpen?.(open)),
    pause: () => {},
    clearInput: deps.clearInput,
  });
  return { ...runtime, openWindow: () => window.open() };
}
