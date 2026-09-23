import { SenderError } from "spacetimedb/server";
import { STARTER_BOW, WOODEN_ARMOR, canonicalItemId } from "../../shared/items";
import { COSMETIC_CONVERSION_GEM_COST, canConvertToCosmetic, cosmeticUnlocks } from "../../shared/cosmetic-conversion";

/** A Gem purchase unlocks an appearance while retaining the original item. */
export function createCosmeticConversion(deps: {
  requireControllingPlayer: (ctx: any) => unknown;
  activeDuelFor: (ctx: any, identity: any) => unknown;
  inventoryForProgress: (progress: any) => string[];
  writeProgressAndPresentation: (ctx: any, progress: any) => void;
  applyGemBalanceChange: (ctx: any, input: any) => unknown;
}) {
  function removeItemFromProgress(progress: any, itemId: string) {
    const next = { ...progress };
    const permanentLook = cosmeticUnlocks(progress.cosmeticItemsJson).includes(itemId);
    const fields = ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand",
      ...(!permanentLook ? ["cosmeticHead", "cosmeticChest", "cosmeticFeet", "cosmeticRightHand", "cosmeticLeftHand"] : [])];
    for (const field of fields) if (next[field] === itemId) next[field] = "";
    if (itemId === STARTER_BOW) next.bowCount = 0;
    if (itemId === WOODEN_ARMOR) next.woodenArmorCount = 0;
    next.inventoryJson = JSON.stringify(deps.inventoryForProgress(next).filter(saved => saved !== itemId));
    return next;
  }

  function convertItemToCosmetic(ctx: any, itemId: string) {
    deps.requireControllingPlayer(ctx);
    if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const canonical = canonicalItemId(itemId);
    if (!canonical || !canConvertToCosmetic(canonical)) throw new SenderError("This item cannot become a cosmetic.");
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress || !deps.inventoryForProgress(progress).includes(canonical)) {
      throw new SenderError("That item is not in your inventory.");
    }
    const unlocked = cosmeticUnlocks(progress.cosmeticItemsJson);
    if (unlocked.includes(canonical)) throw new SenderError("This cosmetic is already unlocked.");
    deps.applyGemBalanceChange(ctx, {
      identity: ctx.sender, delta: -COSMETIC_CONVERSION_GEM_COST,
      kind: "cosmetic_conversion", note: `Unlocked ${canonical} as a permanent cosmetic.`,
      externalReference: `cosmetic-conversion:${ctx.sender.toHexString()}:${canonical}`,
    });
    deps.writeProgressAndPresentation(ctx, {
      ...progress, cosmeticItemsJson: JSON.stringify([...unlocked, canonical]),
    });
  }

  return { removeItemFromProgress, convertItemToCosmetic };
}
