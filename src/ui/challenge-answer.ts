/** How long a challenge's start or drop out waits for the server before the button is given back. */
export const CHALLENGE_ANSWER_MS = 15_000;
export const CHALLENGE_NO_ANSWER = "No answer from the server. Try again.";

/**
 * A challenge start or drop out, or a "no answer" after a while: a call lost to a dropped connection
 * never settles, and the button stayed greyed until a reload (Lucky Deer, 0.901.43). An answer that
 * comes later still lands through the run's own row.
 */
export function challengeAnswer<T>(action: Promise<T>, ms = CHALLENGE_ANSWER_MS): Promise<T | { ok: false; error: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ ok: false; error: string }>(resolve => { timer = setTimeout(() => resolve({ ok: false, error: CHALLENGE_NO_ANSWER }), ms); });
  return Promise.race([action, late]).finally(() => clearTimeout(timer));
}
