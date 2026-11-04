/**
 * The balance curve: how much each map's enemies grow over the map before, from Tutorial Forest through the
 * campaign and on through Endless, the same every map. Health and hits grow alike, about as fast as players get
 * tougher; pay grows slower, so each map takes a little longer than the last.
 */
export const CURVE_STEPS = Object.freeze({ health: 2.15, damage: 2.15, reward: 1.8 });
/**
 * Enemy hits from map 2 on stand this far above the Forest's line: players get about 20x tougher from the Forest
 * to the Desert (their first gear and upgrades), so hits on the Forest's line would barely scratch them there.
 */
export const CURVE_HIT_LEVEL = 5;
/**
 * The floor under map time: from map 2 on enemies have `health` times the health and hits (so hits keep their share
 * of a player's health) and pay `pay` times less, so the early maps are not over in minutes. Pay stays under the
 * reward step, so each map still pays more than the last.
 */
export const CURVE_FLOOR = Object.freeze({ health: 1.725, pay: 1.7 });
