import {
  DARK_METAL_HELMET, FIRE_METAL_BOW, FIRE_METAL_HELMET, FROST_ARMOR, FROST_BOW, IRON_BOW, NIGHT_BOW, SNOW_BOW, STARTER_BOW,
} from "../game/inventory";

/** The glow and name colour an item's drop reveal uses; everything else shares the wooden brown. */
export function itemDropColor(itemId: string) {
  return itemId === DARK_METAL_HELMET
    ? "#8f83a6"
    : itemId === NIGHT_BOW
      ? "#a982ff"
    : itemId === FIRE_METAL_BOW || itemId === FIRE_METAL_HELMET
    ? "#ff6557"
    : itemId === SNOW_BOW
      ? "#e9fbff"
    : itemId === FROST_BOW || itemId === FROST_ARMOR
      ? "#2d92ff"
      : itemId === IRON_BOW ? "#aeb7c5"
        : itemId === STARTER_BOW ? "#ffd45c" : "#b98752";
}
