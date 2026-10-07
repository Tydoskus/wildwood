import { SOUL_MAP_ID } from "../../../shared/soul-dimension";
import { isDeveloperIdentity } from "../../app/developer";
import { createSoulDimensionWindow } from "../../ui/soul-dimension-window";
import type { MapId } from "../world";
import { createSoulDimensionRuntime } from "./soul-dimension-runtime";
import { createTownRuntime } from "./town-runtime";

/**
 * The Town and the Soul Dimension its bottom road leads to, as the
 * composition root sees them: the Town's runtime (doors, wells, walls), the
 * Soul Dimension's (its camps and the soul stats combat adds), and the
 * window at the Town's portal that leads in.
 */
export function createSoulDimension(deps: Parameters<typeof createSoulDimensionRuntime>[0] & Parameters<typeof createTownRuntime>[0] & {
  travel: (mapId: MapId) => Promise<boolean>;
}) {
  const runtime = createSoulDimensionRuntime(deps);
  const town = createTownRuntime(deps);
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
  return { ...runtime, update: (dt: number) => { runtime.update(dt); town.update(dt); }, refreshTown: town.refresh, openWindow: () => window.open(), closeWindow: () => window.close() };
}
