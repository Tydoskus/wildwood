import { effectivePlayerMovementSpeed } from "../../shared/rules";

/** The server's saved movement speed, including both research trees. */
export function effectiveMovementSpeedForProgress(ctx: any, progress: any, research?: any) {
  const ranks = research ?? ctx.db.playerResearch.identity.find(progress.identity);
  return effectivePlayerMovementSpeed(
    false,
    ranks?.moveSpeed ?? 0,
    progress.speedOverride ?? 0,
    ranks?.utilityMoveSpeed ?? 0,
  );
}
