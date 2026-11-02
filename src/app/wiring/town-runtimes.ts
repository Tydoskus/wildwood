import type { WeaponSkillRoll } from "../../../shared/weapon-skills";
import type { WeaponSchool } from "../../../shared/weapon-mastery";
import {
  createCardSellerRuntime, createExchangeRuntime, createGearSellerRuntime, createHomeStationTouchHandler, createSchoolWindowRuntime, createSmithRuntime, createStarterChestRuntime,
} from "../../ui/game-ui-runtime";
import type { createGameElements } from "../../ui/game-elements";
import { bindTownTeleportButton, paintTownTeleportButton } from "../../ui/town-teleport-button";
import { createOxShopRuntime } from "../../ui/ox-shop-controller";
import { createSlotUpgradesController } from "../../ui/slot-upgrades-controller";
import { closeStationsOutOfReach } from "../../ui/station-reach";
import {
  TOWN_ARMOR_SELLER_POSITION, TOWN_CARD_SELLER_POSITION, TOWN_CARD_SELLER_SERVER_REACH, TOWN_EXCHANGE_POSITION, TOWN_EXCHANGE_SERVER_REACH, TOWN_GEAR_SELLER_SERVER_REACH, TOWN_SMITH_POSITION,
  TOWN_SMITH_SERVER_REACH, TOWN_WEAPON_SELLER_POSITION, TOWN_DOORS, TOWN_RESEARCH_POSITION, townRoomAt,
  TOWN_ARRIVAL, inTownGrove, inTownHills,
} from "../../../shared/town";
import { TUTORIAL_FOREST_MAP_ID, SLOT_UPGRADES_POSITION, type MapId } from "../../game/world";
import type { CoopAccess } from "../../game/runtime/coop-access";
import type { MapController } from "../../game/runtime/map-controller";
import type { createGameBootstrap } from "../../game/runtime/game-bootstrap";
import type { PlayerState } from "../../game/runtime/types";

export type TownRuntimeDeps = {
  /** The item window, for gear on the Trade Chrysanthemum: its stats, skills and refine before buying. */
  itemInspection?: { open: (request: { itemId: string; refine?: number; skills?: WeaponSkillRoll | null; ownItem?: boolean; context?: string;
    actions?: readonly { label: string; kind?: "PRIMARY" | "SECONDARY" | "DESTROY"; disabled?: boolean; onActivate: () => void | Promise<void> }[] }) => void };
  coop: CoopAccess;
  e: ReturnType<typeof createGameElements>;
  player: PlayerState;
  inventory: ReturnType<typeof createGameBootstrap>["inventory"];
  currentMapId: () => MapId;
  inTutorial: () => boolean;
  isMapTransitioning: () => boolean;
  teleportHome: () => Promise<boolean>;
  teleportToMap: MapController["teleportToMap"];
  clearInput: () => void;
  renderInventory: () => void;
  showMessage: (text: string, color?: string) => void;
  techTree: { open: () => void; close: () => void };
  quests: { board: { open: () => void; close: () => void }; refreshAtHome: () => void };
  /** Closes every window that competes with Slot Upgrades before it opens. */
  beforeUpgradesOpen: () => void;
  onUpgradeFinished: Parameters<typeof createSlotUpgradesController>[1]["onUpgradeFinished"];
  /** Reapplies speed and max health after Slot Upgrades changed what is equipped. */
  applyEquipmentStats: () => void;
  saveProgress: (immediate?: boolean) => void;
};

/**
 * The Town's stations (Ox's shop, the Smith, Slot Upgrades, the Card, Weapon and Armor Sellers, the schools) and the forest's Starter Chest.
 * Walking up to a station opens it; the home button closes them all before it teleports.
 */
export function createTownRuntimes(deps: TownRuntimeDeps) {
  const { coop, e, player, inventory, clearInput, showMessage } = deps;
  const client = () => coop.client;
  const inTown = () => deps.currentMapId() === "town";
  /** Out mining or chopping, where the Town button goes back to the square rather than to the fight. */
  const gathering = () => inTown() && (inTownHills(player.x, player.y) || inTownGrove(player.x, player.y));
  const toSquare = () => deps.teleportToMap("town", async () =>
    await coop.client?.teleportToTownSquare?.() ? { mapId: "town", ...TOWN_ARRIVAL, facing: 0 } : false);
  let gatheringShown = false;

  const townTeleport = bindTownTeleportButton(e.townButton, {
    beforeTeleport: () => {
      deps.techTree.close();
      slotUpgrades.close();
      deps.quests.board.close();
      oxShop.close();
      smith.close();
      cardSeller.close();
      exchange.close();
      gearSellers.close();
      schools.close();
    },
    teleport: () => deps.inTutorial() ? Promise.resolve(false) : gathering() ? toSquare() : deps.teleportHome(),
    showFailure: failed => showMessage(failed ? "TELEPORT FAILED · TRY AGAIN" : "TELEPORT UNAVAILABLE", "#ffbc91"),
    showBlocked: text => showMessage(text, "#ffbc91"),
  });

  const oxShop = createOxShopRuntime({ coop: client, inventory, renderInventory: deps.renderInventory, showMessage, clearInput, inTown });
  const smith = createSmithRuntime({ coop: client, inventory, showMessage, clearInput, inTown });
  const gearSellers = createGearSellerRuntime({ coop: client, inventory, showMessage, clearInput, inTown });
  const cardSeller = createCardSellerRuntime({ coop: client, showMessage, clearInput, inTown });
  const exchange = createExchangeRuntime({ coop: client, inventory, identity: coop.identity, showMessage, clearInput, inTown,
    inspect: (itemId, refine, roll, actions) => deps.itemInspection?.open({ itemId, refine, skills: roll, ownItem: true, context: "Trade Chrysanthemum", actions }) });
  const schools = createSchoolWindowRuntime({ coop: client, clearInput, inTown });
  const starterChest = createStarterChestRuntime({
    coop: client, player, showMessage, clearInput,
    inForest: () => deps.currentMapId() === TUTORIAL_FOREST_MAP_ID && !deps.isMapTransitioning(),
  });

  const openAfterClearingInput = (open: () => void) => () => { clearInput(); open(); };
  const updateHomeStations = createHomeStationTouchHandler(
    () => inTown() && !deps.isMapTransitioning(), player,
    openAfterClearingInput(() => deps.techTree.open()),
    () => { slotUpgrades.updateTouch(); deps.quests.refreshAtHome(); },
    openAfterClearingInput(() => deps.quests.board.open()),
    openAfterClearingInput(() => oxShop.open()),
    openAfterClearingInput(() => smith.open()),
    openAfterClearingInput(() => cardSeller.open()),
    (school: WeaponSchool) => { clearInput(); schools.open(school); },
    seller => { clearInput(); gearSellers.open(seller); },
    openAfterClearingInput(() => exchange.open()),
  );

  const slotUpgrades = createSlotUpgradesController({
    panel: e.slotUpgradesPanel,
    prompt: e.slotUpgradesPrompt,
    queueOne: e.slotUpgradesQueueOne,
    queueTwo: e.slotUpgradesQueueTwo,
    queueThree: e.slotUpgradesQueueThree,
    statGain: e.slotUpgradesStatGain,
    timer: e.slotUpgradesTimer,
    action: e.slotUpgradesAction,
    speedUp: e.slotUpgradesSpeedUp,
    back: e.slotUpgradesBack,
    picker: e.slotUpgradesPicker,
    pickerItems: e.slotUpgradesPickerItems,
    closePicker: e.closeSlotUpgradesPickerBtn,
  }, {
    playerPosition: () => player,
    currentMapId: deps.currentMapId,
    stationMapId: "town",
    stationPosition: SLOT_UPGRADES_POSITION,
    activeUpgrades: () => coop.client?.activeItemUpgrades?.() ?? [],
    secondQueueUnlocked: () => coop.client?.secondUpgradeSlotUnlocked?.() ?? false,
    thirdQueueUnlocked: () => coop.client?.thirdUpgradeSlotUnlocked?.() ?? false,
    gemBalance: coop.gemBalance,
    upgradeLevel: itemId => coop.client?.itemUpgradeLevel?.(itemId) ?? 0,
    refineLevel: itemId => coop.client?.itemRefine?.(itemId) ?? 0,
    slotTier: slot => coop.client?.slotUpgradeTier?.(slot) ?? 0,
    slotUpgradeSpeedRank: () => coop.client?.research?.()?.slotUpgradeSpeed ?? 0,
    equippedIn: slot => slot === "HAND" ? (inventory.equippedRightHand || inventory.equippedLeftHand)
      : slot === "HEAD" ? inventory.equippedHead : inventory.equippedChest,
    storage: localStorage,
    startUpgrade: async (queue, itemId, position) => coop.client?.startItemUpgrade?.(queue, itemId, position),
    localIdentity: coop.identity,
    cancelUpgrade: async queue => coop.client?.cancelItemUpgrade?.(queue),
    speedUpUpgrade: async queue => coop.client?.speedUpItemUpgradeWithGems?.(queue),
    unlockSecondQueue: async () => coop.client?.unlockSecondUpgradeSlot?.(),
    unlockThirdQueue: async () => coop.client?.unlockThirdUpgradeSlot?.(),
    beforeOpen: deps.beforeUpgradesOpen,
    setPaused: () => {},
    clearPlayerInput: clearInput,
    onInventoryChanged: () => {
      if (inventory.selectedItemId && !inventory.itemIds.includes(inventory.selectedItemId)) {
        inventory.selectedItemId = "";
        inventory.selectedItemLocation = "";
      }
      deps.applyEquipmentStats();
      deps.renderInventory();
      deps.saveProgress(true);
    },
    onUpgradeFinished: deps.onUpgradeFinished,
    showMessage,
  });

  return {
    oxShop, smith, cardSeller, exchange, gearSellers, schools, starterChest, slotUpgrades,
    /** Research Ready's tap: through the Town teleport into the Research building; false when it cannot go now. */
    goToResearch() {
      const there = inTown() && townRoomAt(player.x, player.y)?.index === TOWN_RESEARCH_POSITION.door;
      if (there || deps.inTutorial() || deps.isMapTransitioning() || !townTeleport.ready()) return false;
      // Lands where the server puts it, so the arrival is known before the reply's row comes in.
      const inside = TOWN_DOORS[TOWN_RESEARCH_POSITION.door].inside;
      void townTeleport.go(() => deps.teleportToMap("town", async () =>
        await coop.client?.teleportToResearch?.(player.x, player.y) ? { mapId: "town", ...inside, facing: 0 } : false));
      return true;
    },
    /** Opens a station the player walked up to, and moves the Starter Chest's prompt. */
    update() {
      updateHomeStations();
      if (gathering() !== gatheringShown) {
        gatheringShown = !gatheringShown;
        paintTownTeleportButton(e.townButton, deps.currentMapId(), gatheringShown);
      }
      closeStationsOutOfReach(player, inTown() && !deps.isMapTransitioning(), [
        [smith, TOWN_SMITH_POSITION, TOWN_SMITH_SERVER_REACH],
        [cardSeller, TOWN_CARD_SELLER_POSITION, TOWN_CARD_SELLER_SERVER_REACH],
        [exchange, TOWN_EXCHANGE_POSITION, TOWN_EXCHANGE_SERVER_REACH],
        [gearSellers.sellers.weapons, TOWN_WEAPON_SELLER_POSITION, TOWN_GEAR_SELLER_SERVER_REACH],
        [gearSellers.sellers.armor, TOWN_ARMOR_SELLER_POSITION, TOWN_GEAR_SELLER_SERVER_REACH],
      ]);
      starterChest.update();
    },
  };
}
