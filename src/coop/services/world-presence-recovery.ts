export function isMissingWorldPresenceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /enter wildwood first\.?/i.test(message);
}

/** Retries one reducer only after the client successfully rebuilds missing world presence. */
export async function retryAfterMissingWorldPresence<T>(
  attempt: () => T | PromiseLike<T>,
  recover: () => boolean | PromiseLike<boolean>,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!isMissingWorldPresenceError(error) || !await recover()) throw error;
  }
  return await attempt();
}
