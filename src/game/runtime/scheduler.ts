type SchedulerLike = {
  yield?: () => Promise<void>;
  postTask?: (callback: () => void, options?: { priority?: "background" | "user-visible" | "user-blocking" }) => Promise<void>;
};

function browserScheduler() {
  return (globalThis as typeof globalThis & { scheduler?: SchedulerLike }).scheduler;
}

export function yieldToUser() {
  const scheduler = browserScheduler();
  if (scheduler?.yield) return scheduler.yield();
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

export function scheduleBackgroundTask(callback: () => void) {
  const scheduler = browserScheduler();
  if (scheduler?.postTask) {
    void scheduler.postTask(callback, { priority: "background" }).catch(() => {});
    return;
  }
  window.setTimeout(callback, 0);
}
