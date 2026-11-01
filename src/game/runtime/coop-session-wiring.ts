import { leaderboardEligible } from "../../../shared/leaderboard-window";
import { itemDisplayName } from "../../../shared/items";
import { createAutoEquipFeedback } from "../../ui/auto-equip-feedback";
import { createEquipmentOfferPrompt } from "../../ui/equipment-offer-prompt";
import { type createGameRuntimeHud, watchCardDrops } from "../../ui/game-ui-runtime";
import { itemDropColor } from "../../ui/item-drop-color";
import { itemStatsWithWeaponSkills } from "../../ui/item-inspection-controller";
import { createItemUpgradeFeedback } from "../../ui/item-upgrade-feedback";
import { createOfflineProgressSummary } from "../../ui/offline-progress-summary";
import { setInventoryItemQuantity } from "../inventory";
import { itemPresentation } from "../item-presentation";
import type { CoopAccess } from "./coop-access";
import { createCoopSessionController, createSessionWindowRefresh } from "./coop-session-controller";
import type { createGameBootstrap } from "./game-bootstrap";
import type { createPlayerInputController } from "./player-input-controller";
import type { PlayerState } from "./types";

type SessionWindows = Parameters<typeof createSessionWindowRefresh>[0];
type CoopSessionHooks = Parameters<typeof createCoopSessionController>[0];

export type CoopSessionWiringDeps = {
  coop: CoopAccess;
  player: PlayerState;
  inventory: ReturnType<typeof createGameBootstrap>["inventory"];
  renderInventory: () => void;
  saveProgress: (immediate?: boolean) => void;
  healthMultiplierBonus: () => number;
  showMessage: (text: string, color?: string) => void;
  windows: Omit<SessionWindows, "coop">;
  leaderboard: { setUnlocked: (unlocked: boolean) => void };
  runtimeHud: Pick<ReturnType<typeof createGameRuntimeHud>, "showGemDrop" | "showCardCopy" | "showItemDrop">;
  slotUpgrades: { observeUpgradeTier: (itemId: string, level: number) => void };
  inTutorial: () => boolean;
  isRunning: () => boolean;
  moveSpeed: () => number;
  playerInput: Pick<ReturnType<typeof createPlayerInputController>, "movement">;
  reconcileMap: () => void;
} & Pick<CoopSessionHooks,
  | "syncLifetimeKills" | "refreshGemCounter" | "refreshGiftsAndMail" | "refreshDevPanel" | "loadProgress"
  | "resetMovementSync" | "syncBossState" | "finishStartup" | "updateProtocolGate" | "refreshChat" | "updateDuelControls"
  | "refreshAppStatus" | "refreshReconnectOverlay">;

/**
 * Connects the game to the coop client's notifications: server changes, drops, offers and upgrades.
 * Returns the offline-progress summary, which the HUD shows once the player is in the world.
 */
export function createCoopSessionWiring(deps: CoopSessionWiringDeps) {
  const { coop, player, inventory, renderInventory, showMessage, runtimeHud } = deps;
  const client = coop.client;
  let observedSessionGeneration = 0;

  const coopSession = createCoopSessionController({
    coop: client,
    syncLifetimeKills: deps.syncLifetimeKills,
    refreshGemCounter: deps.refreshGemCounter,
    refreshGiftsAndMail: deps.refreshGiftsAndMail,
    refreshWindows: createSessionWindowRefresh({ coop: client, ...deps.windows }),
    refreshLeaderboard: () => deps.leaderboard.setUnlocked(leaderboardEligible(coop.savedProgress()?.desertUnlocked, client?.prestige?.()?.level)),
    refreshDevPanel: deps.refreshDevPanel,
    loadProgress: deps.loadProgress,
    observedSessionGeneration: () => observedSessionGeneration,
    setObservedSessionGeneration: generation => { observedSessionGeneration = generation; },
    resetMovementSync: deps.resetMovementSync,
    running: deps.isRunning,
    syncPlayerState: () => {
      if (deps.inTutorial()) return;
      client?.syncSpeed?.(deps.moveSpeed());
      const movement = deps.playerInput.movement();
      const movementSpeed = deps.moveSpeed();
      client?.syncMovementState?.(
        player.x,
        player.y,
        movement.x * movementSpeed,
        movement.y * movementSpeed,
        movement.source === "none" ? "keyboard" : movement.source,
        true,
      );
    },
    reconcileMap: deps.reconcileMap,
    syncBossState: deps.syncBossState,
    finishStartup: deps.finishStartup,
    updateProtocolGate: deps.updateProtocolGate,
    refreshChat: deps.refreshChat,
    updateDuelControls: deps.updateDuelControls,
    refreshAppStatus: deps.refreshAppStatus,
    refreshReconnectOverlay: deps.refreshReconnectOverlay,
  });
  const offlineProgressSummary = createOfflineProgressSummary({
    acknowledge: activity => client?.acknowledgeOfflineProgress?.(activity),
    pending: () => client?.pendingOfflineProgress?.(),
    readyToShow: () => !deps.inTutorial() && deps.isRunning(),
  });

  if (client?.setOnChange) client.setOnChange(coopSession.onChange);
  client?.setOnGemDrop?.(({ amount }) => runtimeHud.showGemDrop(amount));
  watchCardDrops(client, { duplicate: copy => runtimeHud.showCardCopy(copy) });
  // A duplicate of held equipment is not revealed here: it can only upgrade the held weapon's skills.
  createEquipmentOfferPrompt({ coop: client, inventory, renderInventory, showMessage, ready: deps.isRunning });
  client?.setOnItemDrop?.(({ itemId, alreadyOwned }) => {
    if (alreadyOwned) return;
    if (!setInventoryItemQuantity(inventory, itemId, 1)) return;
    renderInventory();
    const level = client?.itemUpgradeLevel?.(itemId) ?? 0;
    runtimeHud.showItemDrop({
      artSource: itemPresentation(itemId)?.inventory.source ?? "", itemId,
      color: itemDropColor(itemId),
      name: itemDisplayName(itemId),
      stats: itemStatsWithWeaponSkills(itemId, level, coop.weaponSkills(itemId)),
    });
  });
  const { healthMultiplierBonus } = deps;
  const showItemUpgrade = createItemUpgradeFeedback({
    inventory, player, healthMultiplierBonus, renderInventory, saveProgress: deps.saveProgress, showMessage,
  });
  createAutoEquipFeedback({ coop: client, inventory, player, healthMultiplierBonus, renderInventory, showMessage });
  client?.setOnItemUpgrade?.(upgrade => {
    deps.slotUpgrades.observeUpgradeTier(upgrade.itemId, upgrade.level);
    showItemUpgrade(upgrade);
  });

  return { offlineProgressSummary };
}
