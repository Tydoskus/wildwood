import { playerPowerForStats, type PlayerPowerStats } from "../../shared/player-power";

export function presentedChatPower(
  senderPower: number,
  senderIdentity: string,
  displayedIdentity: string,
  displayedStats: PlayerPowerStats | null,
) {
  if (senderIdentity === displayedIdentity) return senderPower;
  return displayedStats ? playerPowerForStats(displayedStats) : 0;
}

export function duelReplayIsInteractive(replayId: bigint, large: boolean) {
  return replayId > 0n && large;
}
