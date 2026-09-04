import { runBalanceSimulation } from "../src/balance/simulator";
import { campaignExperience } from "../src/balance/experience";

// A compact reproducible release audit; the full sandbox stays in balance-report.
const scenarios = [
  { name: "mixed", trials: 20, strategy: "mixed" as const, researchPlan: "balanced" as const },
  { name: "no-gear-no-research", trials: 3, strategy: "mixed" as const, researchPlan: "off" as const, equipmentStrengthMultiplier: 0 },
  { name: "nearby", trials: 3, strategy: "natural" as const, researchPlan: "balanced" as const },
  { name: "boss-rush", trials: 3, strategy: "boss-rush" as const, researchPlan: "balanced" as const },
];
const results = scenarios.map(({ name, ...config }) => {
  const result = runBalanceSimulation({ ...config, seed: 7331, durationSeconds: 8 * 3600 });
  return { name, config: result.config, maps: campaignExperience(result) };
});
console.log(JSON.stringify({ assumptions: "Active-play forecast; no death, dodge, crowd, or recovery simulation. Readiness includes a heavy-hit survival check. Duels use raw earned stats.", results }, null, 2));
