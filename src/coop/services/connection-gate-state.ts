export function connectionGateState(
  protocolBlocked: boolean,
  wakeReconnectVisible: boolean,
  networkReconnectVisible: boolean,
) {
  return {
    updating: protocolBlocked,
    reconnecting: !protocolBlocked && (wakeReconnectVisible || networkReconnectVisible),
  };
}
