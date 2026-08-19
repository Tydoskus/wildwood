export type DuelAnnouncementOutcome = "CHALLENGER_WIN" | "OPPONENT_WIN" | "DRAW";

/** Duel chat always speaks from the challenger's perspective for every viewer. */
export function duelAnnouncementText(
  challengerName: string,
  opponentName: string,
  outcome: DuelAnnouncementOutcome,
) {
  if (outcome === "CHALLENGER_WIN") return `${challengerName} beat ${opponentName} in a duel.`;
  if (outcome === "OPPONENT_WIN") return `${challengerName} lost to ${opponentName} in a duel.`;
  return `${challengerName} and ${opponentName} drew a duel.`;
}
