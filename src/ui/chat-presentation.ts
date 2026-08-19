export function duelReplayIsInteractive(replayId: bigint, large: boolean) {
  return replayId > 0n && large;
}
