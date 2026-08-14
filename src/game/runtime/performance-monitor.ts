export type PerformanceSnapshot = {
  fps: number;
  frameP50Ms: number;
  frameP95Ms: number;
  worstFrameMs: number;
  updateMs: number;
  renderMs: number;
  longFrames: number;
  longestFrameMs: number;
};

type LongAnimationFrameEntry = PerformanceEntry & { duration: number };

export function createPerformanceMonitor() {
  const frames = new Float32Array(120);
  let frameCount = 0;
  let nextFrameIndex = 0;
  let updateMs = 0;
  let renderMs = 0;
  let longFrames = 0;
  let longestFrameMs = 0;

  if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LongAnimationFrameEntry[]) {
        longFrames += 1;
        longestFrameMs = Math.max(longestFrameMs, entry.duration);
      }
    });
    observer.observe({ type: "long-animation-frame", buffered: true });
  }

  function record(frameMs: number, nextUpdateMs: number, nextRenderMs: number) {
    frames[nextFrameIndex] = frameMs;
    nextFrameIndex = (nextFrameIndex + 1) % frames.length;
    frameCount = Math.min(frames.length, frameCount + 1);
    updateMs = nextUpdateMs;
    renderMs = nextRenderMs;
  }

  function snapshot(): PerformanceSnapshot {
    const sorted = Array.from(frames.subarray(0, frameCount)).sort((a, b) => a - b);
    const p50 = sorted.length ? sorted[Math.floor(sorted.length * .5)] : 0;
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] : 0;
    let totalFrameMs = 0;
    for (let index = 0; index < frameCount; index += 1) totalFrameMs += frames[index];
    const average = frameCount ? totalFrameMs / frameCount : 0;
    return {
      fps: average > 0 ? Math.round(1_000 / average) : 0,
      frameP50Ms: p50,
      frameP95Ms: p95,
      worstFrameMs: sorted[sorted.length - 1] ?? 0,
      updateMs,
      renderMs,
      longFrames,
      longestFrameMs,
    };
  }

  return { record, snapshot };
}
