/** Keep messages from the previous server release readable during a staggered rollout. */
export function reducerErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(?:https?|wss?):\/\/\S+|\b(?:wildwood|wildstat)\b(?![-.])/gi, (part) =>
    /^(?:wildwood|wildstat)$/i.test(part) ? "WildStat" : part,
  );
}
