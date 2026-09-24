import { MOONFEN_ARMOR, CLOUDSPIRE_BOW } from "../../../shared/items";
import { ALPHA_TESTER_GIFT_ITEM } from "../../../shared/item-gifts";
import { mergeProgress } from "../../coop/services/progress";
import { describe, expect, it, vi } from "vitest";
import { createGameBootstrap } from "./game-bootstrap";
import { createProgressController } from "./progress-controller";
import type { PlayerProgress } from "../../coop/services/progress";

function savedProgress(): PlayerProgress {
  const { inventory } = createGameBootstrap();
  return {
    maxHp: 100,
    damage: 4,
    attackRate: 1.56,
    projectileSpeed: 390,
    projectileCount: 1,
    attackRange: 200,
    armor: 0,
    regen: 0,
    speed: 190,
    speedOverride: 0,
    bootsCollected: false,
    inventoryJson: JSON.stringify(inventory.itemIds),
    equippedHead: inventory.equippedHead,
    equippedChest: inventory.equippedChest,
    equippedFeet: inventory.equippedFeet,
    equippedRightHand: inventory.equippedRightHand,
    equippedLeftHand: inventory.equippedLeftHand,
    cosmeticHead: "",
    cosmeticChest: "",
    cosmeticFeet: "",
    cosmeticRightHand: "",
    cosmeticLeftHand: "",
    introComplete: true,
    desertUnlocked: false,
    snowlandsUnlocked: false,
    lavaUnlocked: false,
    infernalUnlocked: false,
    waterUnlocked: false,
    samuraiUnlocked: false,
    cloudspireUnlocked: false,
    moonfenUnlocked: false,
    crystalHollowsUnlocked: false, clockworkRuinsUnlocked: false, duskfallOrchardUnlocked: false, neonBastionUnlocked: false, verdantCatacombsUnlocked: false, ionCitadelUnlocked: false,
    bowCount: 0,
    woodenArmorCount: 0,
  };
}

describe("loaded progress reconciliation", () => {
  it("reconciles stat rewards and claimed gift ownership after initial load without replacing equipment", () => {
    const state = createGameBootstrap();
    let saved = savedProgress();
    const renderInventory = vi.fn();
    const controller = createProgressController({
      player: state.player,
      inventory: state.inventory,
      bootsPickup: state.bootsPickup,
      legacyStorageKey: "unused-legacy-save",
      getSavedProgress: () => saved,
      saveRemoteProgress: vi.fn(),
      localIdentity: () => "guest-identity",
      lifetimeEnemyKills: () => 0,
      isDeveloper: () => false,
      getTotalKills: () => 0,
      setTotalKills: vi.fn(),
      researchVitalityRank: () => 0,
      healthMultiplierBonus: () => 0,
      setAppliedVitalityRank: vi.fn(),
      renderInventory,
      onLoaded: vi.fn(),
    });
    controller.load();

    saved = { ...saved, attackRate: 1.2, regen: 0.6, damage: 9, armor: 3, maxHp: 150, attackRange: 230 };
    state.player.attackRate = 1.56;
    state.player.regen = 0;
    controller.load();

    expect(state.player.attackRate).toBe(1.2);
    expect(state.player.regen).toBe(0.6);
    expect(state.player.damage).toBe(9);
    expect(state.player.armor).toBe(3);
    expect(state.player.baseMaxHp).toBe(150);
    expect(state.player.attackRange).toBe(230);

    // An already-running claimant receives server ownership while an earlier
    // local save still contains the inventory from before the gift was claimed.
    const pending = { ...saved, enemyKills: 0 };
    const headBefore = state.inventory.equippedHead;
    const baseItems = [...state.inventory.itemIds];
    saved = mergeProgress({ ...saved, inventoryJson: JSON.stringify([...baseItems, ALPHA_TESTER_GIFT_ITEM]) }, pending);
    renderInventory.mockClear();
    controller.load(); controller.load();
    expect(state.inventory.itemIds.filter(item => item === ALPHA_TESTER_GIFT_ITEM)).toHaveLength(1);
    expect(state.inventory.equippedHead).toBe(headBefore);
    expect(state.inventory.itemIds).toEqual([...baseItems, ALPHA_TESTER_GIFT_ITEM]);
    expect(renderInventory).toHaveBeenCalledOnce();
  });

  it("repairs a bag after missed completion hydration and removes items held by upgrades", () => {
    const state = createGameBootstrap();
    let saved = { ...savedProgress(), cloudspireUnlocked: true, inventoryJson: JSON.stringify(["basic_paper_hat", "starter_stone", CLOUDSPIRE_BOW]) };
    const renderInventory = vi.fn();
    const controller = createProgressController({
      player: state.player, inventory: state.inventory, bootsPickup: state.bootsPickup,
      legacyStorageKey: "unused", getSavedProgress: () => saved,
      saveRemoteProgress: vi.fn(), localIdentity: () => "player", lifetimeEnemyKills: () => 0,
      isDeveloper: () => false, getTotalKills: () => 0, setTotalKills: vi.fn(),
      researchVitalityRank: () => 0, healthMultiplierBonus: () => 0,
      setAppliedVitalityRank: vi.fn(), renderInventory, onLoaded: vi.fn(),
    });
    controller.load();
    state.inventory.equippedRightHand = CLOUDSPIRE_BOW;
    const pending = { ...saved, enemyKills: 0 };
    saved = mergeProgress({ ...saved, inventoryJson: JSON.stringify([...state.inventory.itemIds, MOONFEN_ARMOR]) }, pending);
    controller.load();
    expect(state.inventory.itemIds).toContain(MOONFEN_ARMOR);
    expect(state.inventory.equippedRightHand).toBe(CLOUDSPIRE_BOW);

    // No new completion event and even the same server snapshot must repair
    // a stale runtime bag after reconnect, without duplicating the reward.
    state.inventory.itemIds = state.inventory.itemIds.filter(item => item !== MOONFEN_ARMOR);
    renderInventory.mockClear();
    controller.load(); controller.load();
    expect(state.inventory.itemIds.filter(item => item === MOONFEN_ARMOR)).toHaveLength(1);
    expect(renderInventory).toHaveBeenCalledOnce();

    state.inventory.equippedChest = MOONFEN_ARMOR;
    saved = { ...saved, inventoryJson: pending.inventoryJson };
    controller.load();
    expect(state.inventory.itemIds).not.toContain(MOONFEN_ARMOR);
    expect(state.inventory.equippedChest).toBe("");
    expect(state.inventory.equippedRightHand).toBe(CLOUDSPIRE_BOW);

    // A rebalance can revoke map access without changing bag ownership.
    saved = { ...saved, cloudspireUnlocked: false };
    controller.load();
    expect(state.inventory.equippedRightHand).toBe(saved.equippedRightHand);
    expect(state.inventory.itemIds).toContain(CLOUDSPIRE_BOW);
    state.inventory.equippedRightHand = CLOUDSPIRE_BOW;
    controller.load();
    expect(state.inventory.equippedRightHand).toBe(saved.equippedRightHand);
  });

  function loaded(initial: Partial<PlayerProgress>) {
    const state = createGameBootstrap();
    let saved: PlayerProgress = { ...savedProgress(), ...initial };
    const controller = createProgressController({
      player: state.player, inventory: state.inventory, bootsPickup: state.bootsPickup,
      legacyStorageKey: "unused-legacy-save", getSavedProgress: () => saved, saveRemoteProgress: vi.fn(),
      localIdentity: () => "guest-identity", lifetimeEnemyKills: () => 0, isDeveloper: () => false,
      getTotalKills: () => 0, setTotalKills: vi.fn(), researchVitalityRank: () => 0, healthMultiplierBonus: () => 0,
      setAppliedVitalityRank: vi.fn(), renderInventory: vi.fn(), onLoaded: vi.fn(),
    });
    controller.load();
    return { state, reload: (next: Partial<PlayerProgress>) => { saved = { ...saved, ...next }; controller.load(); } };
  }

  it("never loads a blank hand: the best usable weapon, else the stone, whatever the bag holds", () => {
    // A blank saved hand with a map-locked iron bow in the bag: the stone, which stays owned.
    const locked = loaded({ inventoryJson: '["starter_stone","iron_bow"]', equippedRightHand: "" });
    expect(locked.state.inventory.equippedRightHand).toBe("starter_stone");
    expect(locked.state.inventory.itemIds).toEqual(expect.arrayContaining(["starter_stone", "iron_bow"]));
    // The same with the bow's map reached: the bow.
    const usable = loaded({ inventoryJson: '["starter_stone","iron_bow"]', equippedRightHand: "", desertUnlocked: true });
    expect(usable.state.inventory.equippedRightHand).toBe("iron_bow");
  });

  it("keeps the stone and a weapon in hand when the row drops both (the WEAPON EMPTY repro)", () => {
    const view = loaded({ inventoryJson: '["starter_stone","iron_bow"]', equippedRightHand: "starter_stone" });
    view.reload({ inventoryJson: '["iron_bow"]', equippedRightHand: "" });
    expect(view.state.inventory.itemIds).toContain("starter_stone");
    expect(view.state.inventory.equippedRightHand).toBe("starter_stone");
    // A weapon locked away again falls back to a usable one, never to nothing.
    const relocked = loaded({ inventoryJson: '["starter_stone","iron_bow"]', equippedRightHand: "iron_bow", desertUnlocked: true });
    expect(relocked.state.inventory.equippedRightHand).toBe("iron_bow");
    relocked.reload({ desertUnlocked: false });
    expect(relocked.state.inventory.equippedRightHand).toBe("starter_stone");
  });

});
