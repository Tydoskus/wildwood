import { isSoulMap, SOUL_MAP_ID } from "../../../shared/soul-dimension";
import { isDeveloperIdentity } from "../developer";
import { createSoulDimensionWindow } from "../../ui/soul-dimension-window";
import type { MapId } from "../../game/world";
import type { EnemyState } from "../../game/runtime/types";
import { createSoulDimensionRuntime } from "../../game/runtime/soul/soul-dimension-runtime";
import { createTownRuntime } from "../../game/runtime/town/town-runtime";
import { createDpsDummy } from "../../game/runtime/town/dps-dummy";
import { createSoulLevelHud } from "../../ui/soul-level-hud";
import { gameConfirm } from "../../ui/confirm-dialog";

/**
 * The Town and the Soul Dimension its bottom road leads to, as the
 * composition root sees them: the Town's runtime (doors, wells, walls), the
 * Soul Dimension's (its camps and the soul stats combat adds), the
 * window at the Town's portal that leads in, and the Soul Level on the HUD.
 */
export function createSoulDimension(deps: Parameters<typeof createSoulDimensionRuntime>[0] & Parameters<typeof createTownRuntime>[0] & {
  travel: (mapId: MapId) => Promise<boolean>;
}) {
  const runtime = createSoulDimensionRuntime({ ...deps, notice: text => { void gameConfirm({ message: text, confirmLabel: "OK", cancelLabel: "" }); } });
  const town = createTownRuntime(deps);
  const dummy = createDpsDummy(deps);
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
        soulLevel: runtime.soulLevel(),
      };
    },
    enter: () => deps.travel(SOUL_MAP_ID),
    setOpen: async open => Boolean(await deps.source()?.setSoulDimensionOpen?.(open)),
    pause: () => {},
    clearInput: deps.clearInput,
  });
  const levelHud = createSoulLevelHud();
  return { ...runtime, defeated: (enemy: EnemyState) => dummy.defeated(enemy) || runtime.defeated(enemy),
    update: (dt: number) => { runtime.update(dt); town.update(dt); dummy.update(); const level = runtime.soulLevel(); levelHud.render(isSoulMap(deps.currentMapId()) ? level : null); },
    refreshTown: town.refresh, tapTown: town.tap, openWindow: () => window.open(), closeWindow: () => window.close() };
}
