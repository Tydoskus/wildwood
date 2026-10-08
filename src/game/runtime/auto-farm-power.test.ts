import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAP_ENTRY_POWER, MAP_POWER_REVISION, recommendedBossPower, recommendedMapPower } from './auto-farm-power';
import { MAP_IDS } from '../../../shared/rules';
import { SOUL_MAP_ID } from '../../../shared/soul-dimension';

describe('recommended power', () => {
  it('has one for every campaign map, rising map to map, and none for Endless or the Soul Dimension', () => {
    expect(MAP_IDS.every(mapId => recommendedMapPower(mapId)! > 0)).toBe(true);
    for (let index = 1; index < MAP_IDS.length; index++) expect(recommendedMapPower(MAP_IDS[index])!).toBeGreaterThan(recommendedMapPower(MAP_IDS[index - 1])!);
    expect(recommendedMapPower('endless_1')).toBeNull();
    expect(recommendedMapPower(SOUL_MAP_ID)).toBeNull();
  });

  it("asks of a boss the power the next map asks (what the map is left with), and the last map's own", () => {
    expect(recommendedBossPower('tutorial_forest')).toBe(recommendedMapPower('beginner_desert'));
    const last = MAP_IDS[MAP_IDS.length - 1];
    expect(recommendedBossPower(last)).toBe(recommendedMapPower(last));
    expect(recommendedBossPower('endless_3')).toBeNull();
  });

  // AUTOFARM_POWER_TABLE=1: runs the Lab campaign (about a minute) and prints the table for auto-farm-power.ts.
  it.skipIf(process.env.AUTOFARM_POWER_TABLE !== '1')('matches the Balance Lab reference builds', async () => {
    const { campaignReferenceBuilds } = await import('./autofarm-sim/reference-builds');
    const { LIVE_BALANCE } = await import('../../balance/live-balance');
    const builds = campaignReferenceBuilds(join(tmpdir(), 'wildstat-forecast-calibration'));
    console.log(`revision ${LIVE_BALANCE.revision}\n${builds.map(build => `  ${build.mapId}: ${Math.round(build.entryPower)},`).join('\n')}`);
    expect(MAP_POWER_REVISION).toBe(LIVE_BALANCE.revision);
    expect(Object.fromEntries(builds.map(build => [build.mapId, Math.round(build.entryPower)]))).toEqual(MAP_ENTRY_POWER);
  }, 600_000);
});
