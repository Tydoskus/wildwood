import { PRESTIGE_CHALLENGE_LIMIT, PRESTIGE_CHALLENGE_ATTACKS_PER_SECOND } from "../../shared/prestige-challenge";
import type { ConfirmRequest } from "./confirm-dialog";

type ChallengeReading = { identity: string; active: boolean; completed: number };

/** A run that was going is over with one more win on the same account. A drop-out ends it without a win. */
export function challengeWinReached(previous: ChallengeReading | null, next: ChallengeReading) {
  return Boolean(previous && previous.identity === next.identity && previous.active && !next.active && next.completed > previous.completed);
}

/** The popup for a Reflect Only win: what it paid, and that the saved run is back. */
export function reflectOnlyWinNotice(completed: number): ConfirmRequest {
  return {
    message: "Reflect Only complete!",
    details: [
      { label: "Reward", value: `+${PRESTIGE_CHALLENGE_ATTACKS_PER_SECOND} attacks/sec`, kind: "after" },
      { label: "Reflect cap", value: "+1", kind: "after" },
      { label: "Your saved run", value: "Restored" },
      { label: "Challenges won", value: `${completed}/${PRESTIGE_CHALLENGE_LIMIT}` },
    ],
    confirmLabel: "Nice!",
    cancelLabel: "",
  };
}
