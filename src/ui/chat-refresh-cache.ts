type Row = { id: bigint };

/** Unread counting moves only when a row newer than a channel's cursor
 * arrives, so for an id-ordered list its length and edge ids say whether a
 * recount could change anything. Row edits (reactions, moderation) cannot. */
export function chatListFingerprint(rows: readonly Row[]) {
  return `${rows.length}:${rows[0]?.id ?? ""}:${rows[rows.length - 1]?.id ?? ""}`;
}

/** The chat and social services replace a message object whenever its
 * content changes, and re-filter into new arrays of the same objects when
 * anything else in them moves. Compare the objects, not the arrays. */
export function sameChatRows<T>(previous: readonly T[], next: readonly T[]) {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index++) if (previous[index] !== next[index]) return false;
  return true;
}

/** Remembers the inputs of the last derivation. Inputs compare by identity. */
export function createChatInputMemo() {
  let previous: readonly unknown[] | null = null;
  return {
    changed(inputs: readonly unknown[]) {
      const same = previous !== null && previous.length === inputs.length
        && inputs.every((value, index) => Object.is(value, previous![index]));
      previous = inputs;
      return !same;
    },
    reset() { previous = null; },
  };
}

/** Assigning an unchanged string still replaces the text node, which dirties
 * layout for the next read. Unread badges are rewritten on every refresh. */
export function setChatText(element: { textContent: string | null }, text: string) {
  if (element.textContent !== text) element.textContent = text;
}
export function setChatAttribute(element: Pick<Element, "getAttribute" | "setAttribute">, name: string, value: string) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}
export function setChatHidden(element: { hidden: boolean }, hidden: boolean) {
  if (element.hidden !== hidden) element.hidden = hidden;
}
