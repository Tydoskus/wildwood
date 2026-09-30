/** Supporter names come from the live, verified membership feed. */
export const GAME_TIPS = [
  "From 1,000 armor onward, every thousandfold increase in armor halves damage taken.",
  "Base attack speed is capped at 2.62/s.",
  "A crossed-out eye keeps multiplayer off. Turn it on to see other players who also have it on.",
  "With the eye on, 5 minutes without manual movement switches it to Idle—even while autofarming or chatting. Move to become visible again.",
  "You can use the Fight button to teleport back to where you were before coming Home.",
] as const;

export const supporterTip = (names: readonly string[]) => `Thank you to these Patreon supporters for paying for this game's development and costs: ${names.join(", ")}.`;

export function pickGameTip(previous: number, random = Math.random, count: number = GAME_TIPS.length) {
  const choices = Array.from({ length: count }, (_, index) => index).filter(index => index !== previous);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
