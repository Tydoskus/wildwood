/**
 * The numbers a picture is drawn from, compared with the last picture's, so a cached picture is redrawn
 * (and uploaded again) only when one of them moved. Text goes in as a number of its own.
 */
export function createChangeSignature() {
  let last = new Float64Array(64), next = new Float64Array(64);
  let lastLength = -1, length = 0;
  const textIds = new Map<string, number>();
  const signature = {
    /** Starts a new signature. */
    begin() { length = 0; return signature; },
    add(value: number) {
      if (length === next.length) {
        const grown = new Float64Array(next.length * 2);
        grown.set(next);
        next = grown;
      }
      next[length++] = value;
      return signature;
    },
    text(value: string) {
      let id = textIds.get(value);
      if (id === undefined) textIds.set(value, id = textIds.size);
      return signature.add(id);
    },
    /** Whether this signature differs from the last one finished; it becomes the last. */
    finish() {
      let changed = length !== lastLength;
      for (let index = 0; !changed && index < length; index += 1) changed = !Object.is(next[index], last[index]);
      [last, next] = [next, last];
      lastLength = length;
      return changed;
    },
    /** Forgets the last signature, so the next one counts as changed. */
    reset() { lastLength = -1; },
  };
  return signature;
}
