import { equipmentStatDefinition } from "./equipment-budget";

/** Each treasure keeps its own share of the catch roll as later treasures unlock. */
export const FISHING_TREASURES = [
  { id: "reedward_cap", name: "Reedward Cap", rarity: "Rare", color: "#69b7ff", level: 1, odds: 160, tier: 2, faster: 4 },
  { id: "drowned_court_mail", name: "Drowned Court Mail", rarity: "Epic", color: "#c68aff", level: 15, odds: 600, tier: 5, faster: 6 },
  { id: "crown_of_the_wishing_deep", name: "Crown of the Wishing Deep", rarity: "Legendary", color: "#ffac51", level: 35, odds: 2000, tier: 9, faster: 10 },
] as const;

export function rollFishingTreasure(level: number, roll: number) {
  let edge = 0;
  for (const treasure of FISHING_TREASURES) {
    if (level < treasure.level) continue;
    edge += 1 / treasure.odds;
    if (roll < edge) return treasure;
  }
  return null;
}

const [cap, mail, crown] = FISHING_TREASURES;
export function fishingTimeFactor(head?: string, chest?: string) {
  const headBonus = head === cap.id ? cap.faster : head === crown.id ? crown.faster : 0;
  return 1 - (headBonus + (chest === mail.id ? mail.faster : 0)) / 100;
}
function relic<T extends typeof FISHING_TREASURES[number]>(treasure: T, slot: "HEAD" | "CHEST", lore: string) {
  return { id: treasure.id, name: treasure.name, slot, acquisition: "FISHING_DROP" as const,
    description: `${treasure.rarity} fishing treasure. ${treasure.faster}% shorter wait for bites while worn. ${lore}`, ...equipmentStatDefinition(treasure.tier, slot) };
}
export const FISHING_EQUIPMENT = {
  [cap.id]: relic(cap, "HEAD", "A kingfisher feather and three lucky flies are still pinned to the brim."),
  [mail.id]: relic(mail, "CHEST", "Freshwater pearls hold the river court’s old ceremonial scales together."),
  [crown.id]: relic(crown, "HEAD", "Hammered from wishing coins. The inside bears the print of a small webbed foot."),
};
