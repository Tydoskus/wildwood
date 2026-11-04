import { CAMPAIGN_ITEM_DEFINITIONS, type CampaignItemId } from "../../shared/campaign-equipment";
import { GRADE_ITEM_DEFINITIONS, isGradeItemId, type GradeItemId } from "../../shared/grade-equipment";
import type { ItemDefinition } from "../../shared/items";
import { normalizeRefineLevel } from "../../shared/refine-multiplier";
import type { ItemPresentation, WorldLegPresentation } from "./item-presentation";
import { WEAPON_ALIGNMENT_DEFAULTS } from "./equipment-alignment";
import { isDagger } from "../../shared/dagger-skills";

/** A staff is held upright and casts (player-appearance.ts); its art is already the in-hand size (import-vendor-staffs.mjs). */
export const staffPresentation = (source: string): ItemPresentation => ({
  inventory: { source, equippedWidth: 22, equippedHeight: 42 },
  world: { kind: "SPRITE", source, layer: "HAND", top: STAFF_HELD_TOP, handAction: "CAST" },
  projectile: "BOLT",
});
/** Where an upright staff's top sits in the character's frame: its head clears the hat. */
export const STAFF_HELD_TOP = 64;

/** A graded piece's looks (scripts/art/import-grade-equipment.mjs): its base below ★10, another from ★10 and from ★20. */
export const GRADE_SKINS = ["base", "r10", "r20"] as const;
export type GradeSkin = typeof GRADE_SKINS[number];

/** The look a refine level shows. */
export const gradeSkinForRefine = (refineLevel: unknown): GradeSkin => {
  const level = normalizeRefineLevel(refineLevel);
  return level >= 20 ? "r20" : level >= 10 ? "r10" : "base";
};

// A dagger has no art of its own yet: it is its grade's sword, held smaller.
const vendorPartSource = (id: string, skin: GradeSkin = "base") =>
  `assets/wildstat/player-parts/${id.replace(/_dagger$/, "_sword").replace(/_/g, "-")}${skin === "base" ? "" : `-${skin}`}.webp`;

/** The sprite a graded piece is drawn with at a refine level (graded boots: their bag icon); undefined for any other item. */
export function gradeItemSkin(itemId: string | undefined, refineLevel: unknown = 0) {
  return isGradeItemId(itemId) ? vendorPartSource(itemId, gradeSkinForRefine(refineLevel)) : undefined;
}

/** Graded boots on the character: the game's boot legs recoloured per pair (scripts/art/import-grade-boots.mjs). */
export function gradeBootLegs(itemId: string, refineLevel: unknown = 0): WorldLegPresentation {
  const skin = gradeSkinForRefine(refineLevel), suffix = skin === "base" ? "" : `-${skin}`, base = `assets/wildstat/player-parts/${itemId.replace(/_/g, "-")}`;
  return { kind: "LEGS", frontSource: `${base}-leg-front${suffix}.webp`, backSource: `${base}-leg-back${suffix}.webp` };
}

/** Vendor parts use the same anchors and shared alignment controls as existing gear. */
const vendorPartPresentations = (definitions: Readonly<Record<string, ItemDefinition>>) => Object.fromEntries(
  Object.entries(definitions).map(([id, item]): [string, ItemPresentation] => {
    const source = vendorPartSource(id);
    // A sword swings, held as the Wooden Sword is: every sword is the vendor's Character Parts Pack art at the same
    // size (scripts/art/import-vendor-swords.mjs), so all of them share its alignment.
    if (item.weapon?.mode === "MELEE") return [id, {
      inventory: { source, equippedWidth: 32, equippedHeight: 28 },
      world: { kind: "SPRITE", source, layer: "HAND", top: 116, handAction: "SWING", weaponCategory: "SWORD",
        ...(isDagger(id) ? { alignment: { ...WEAPON_ALIGNMENT_DEFAULTS.SWORD, scale: .7 } } : {}) },
    }];
    if (item.weapon?.projectile === "BOLT") return [id, staffPresentation(source)];
    if (item.slot === "HAND") return [id, {
      inventory: { source, equippedWidth: 44, equippedHeight: 34 },
      world: { kind: "SPRITE", source, layer: "HAND", width: 115, height: 63, top: 106, handAction: "BOW" },
      projectile: "ARROW",
    }];
    if (item.slot === "FEET") return [id, { inventory: { source, equippedWidth: 32, equippedHeight: 27 }, world: gradeBootLegs(id) }];
    if (item.slot === "CHEST") return [id, {
      inventory: { source, equippedWidth: 34, equippedHeight: 31 },
      world: { kind: "SPRITE", source, layer: "CHEST", width: 76, height: 68, top: 100 },
    }];
    return [id, {
      inventory: { source, equippedWidth: 30, equippedHeight: 27 },
      world: { kind: "SPRITE", source, layer: "HEAD", bottom: 144 },
    }];
  }),
);

export const CAMPAIGN_ITEM_PRESENTATIONS = vendorPartPresentations(CAMPAIGN_ITEM_DEFINITIONS) as Record<CampaignItemId, ItemPresentation>;
/** Graded gear is the same pack's parts at the same sizes (scripts/art/import-grade-equipment.mjs). */
export const GRADE_ITEM_PRESENTATIONS = vendorPartPresentations(GRADE_ITEM_DEFINITIONS) as Record<GradeItemId, ItemPresentation>;
