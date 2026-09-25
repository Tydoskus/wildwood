export function connectionGateState(
  protocolBlocked: boolean,
  wakeReconnectVisible: boolean,
  networkReconnectVisible: boolean,
  quietReturn = false,
) {
  const reconnecting = !protocolBlocked && (wakeReconnectVisible || networkReconnectVisible);
  return {
    updating: protocolBlocked,
    reconnecting,
    /** Still reconnecting and still paused, but shown as a small badge rather than the full overlay. */
    quiet: reconnecting && quietReturn,
  };
}
