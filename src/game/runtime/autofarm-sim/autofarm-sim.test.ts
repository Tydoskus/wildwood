/**
 * The virtual-player run: opt-in, so it never slows `npx vitest run` or CI.
 *
 *   npm run sim:autofarm                         every profile, 3 simulated hours each
 *   AUTOFARM_SIM_HOURS=1 AUTOFARM_SIM_ONLY=tank,fresh npm run sim:autofarm
 *
 * Reports go to AUTOFARM_SIM_OUT (default: the system temp directory), one JSON
 * per player plus summary.txt.
 */
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { virtualPlayers } from './profiles';
import { campaignReferenceBuilds } from './reference-builds';
import { bossDuel, createVirtualPlayer, type VirtualPlayerReport } from './virtual-player';
import { summarize } from './summary';

const enabled = process.env.AUTOFARM_SIM === '1';
const hours = Number(process.env.AUTOFARM_SIM_HOURS ?? 3);
const only = (process.env.AUTOFARM_SIM_ONLY ?? '').split(',').filter(Boolean);
const out = process.env.AUTOFARM_SIM_OUT ?? join(tmpdir(), 'wildstat-autofarm-sim');

describe.skipIf(!enabled)('autofarm virtual players', () => {
  it('runs every profile and writes its report', async () => {
    mkdirSync(out, { recursive: true });
    const references = campaignReferenceBuilds(out);
    const reports: VirtualPlayerReport[] = [];
    for (const profile of virtualPlayers(references).filter(entry => !only.length || only.includes(entry.name))) {
      const player = createVirtualPlayer(profile);
      try {
        const report = await player.run(hours * 3600, progress => {
          console.log(`${profile.name}: ${(progress.simSeconds || 0).toFixed(0)}s simulated`);
        });
        // Each walk-away, fought on to the end from where it stood (the same build, beside the boss).
        for (const attempt of report.bossAttempts.filter(entry => entry.outcome === 'walked').slice(0, 6)) {
          attempt.foughtOn = await bossDuel({ ...profile, startMap: attempt.map, base: attempt.base!, bossBeaten: false, endlessCompleted: profile.endlessCompleted },
            { bossShare: attempt.bossShareEnd ?? 1, playerShare: attempt.playerShareEnd ?? 1 });
        }
        writeFileSync(join(out, `${profile.name}.json`), JSON.stringify(report, null, 1));
        reports.push(report);
        console.log(summarize([report], references));
      } finally { player.dispose(); }
    }
    const text = summarize(reports, references);
    writeFileSync(join(out, only.length ? `summary-${only.join('+')}.txt` : 'summary.txt'), text);
    console.log(text);
  }, 24 * 3600_000);
});
