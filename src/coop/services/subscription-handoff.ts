export type ActiveSubscription<Context = unknown> = {
  unsubscribe(): void;
  unsubscribeThen(onEnd: (context: Context) => void): void;
  isActive(): boolean;
  isEnded(): boolean;
};

/**
 * Ends the old query set before starting its replacement. SpacetimeDB supports
 * overlapping subscriptions, but moving rows through two changing query sets
 * can make the TypeScript SDK's local reference counts race under heavy load.
 */
export function startAfterSubscriptionEnds<Context>(
  previous: ActiveSubscription<Context> | null,
  start: () => void,
  fail: (error: unknown) => void,
) {
  if (!previous) {
    start();
    return;
  }
  try {
    previous.unsubscribeThen(() => start());
  } catch (error) {
    fail(error);
  }
}

/** Pending subscriptions cannot legally be unsubscribed. */
export function unsubscribeIfActive(subscription: ActiveSubscription | null) {
  if (!subscription || subscription.isEnded() || !subscription.isActive()) return false;
  try {
    subscription.unsubscribe();
    return true;
  } catch {
    return false;
  }
}
