import { pathToFileURL } from "node:url";
import { replayRemoteMotion } from "./remote-motion-trace";

// Optionally pass a saved interpolation module to compare identical traces.
const baseline = process.argv[2] ? await import(pathToFileURL(process.argv[2]).href) : undefined;
const results = [];
for (const path of ["straight", "turn", "stop"] as const) {
  for (const delivery of ["steady", "jitter", "burst", "stall", "higher-latency"] as const) {
    results.push({
      path, delivery,
      ...(baseline ? { baseline: replayRemoteMotion(path, delivery, 60, baseline) } : {}),
      current: replayRemoteMotion(path, delivery),
    });
  }
}
console.log(JSON.stringify(results, null, 2));
