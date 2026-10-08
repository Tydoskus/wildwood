import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENDLESS_STAGE_GROWTH, MAP_ENTRY_POWER, MAP_POWER_REVISION, recommendedBossPower, recommendedMapPower } from './auto-farm-power';
import { ENDLESS_STEPS } from '../../../shared/map-balance';
import { MAP_IDS } from '../../../shared/rules';
import { SOUL_MAP_ID } from '../../../shared/soul-dimension';

describe('recommended power', () => {
  it('has one for every campaign map and every Endless stage, rising map to map; none for the Soul Dimension, sized to the player', () => {
    expect(MAP_IDS.every(mapId => recommendedMapPower(mapId)! > 0)).toBe(true);
    for (let index = 1; index < MAP_IDS.length; index++) expect(recommendedMapPower(MAP_IDS[index])!).toBeGreaterThan(recommendedMapPower(MAP_IDS[index - 1])!);
    // Endless grows by the live balance's own per-stage steps (about 5.4x), on from the last campaign map.
    const last = MAP_IDS[MAP_IDS.length - 1];
    expect(ENDLESS_STAGE_GROWTH).toBeCloseTo(Math.sqrt(ENDLESS_STEPS.health * ENDLESS_STEPS.hit), 9);
    expect(recommendedMapPower('endless_1')).toBeCloseTo(recommendedMapPower(last)! * ENDLESS_STAGE_GROWTH, -3);
    expect(recommendedMapPower('endless_8')! / recommendedMapPower('endless_7')!).toBeCloseTo(ENDLESS_STAGE_GROWTH, 9);
    expect(recommendedMapPower(SOUL_MAP_ID)).toBeNull();
  });

  it("asks of a boss the power the next map asks (what the map is left with)", () => {
    expect(recommendedBossPower('tutorial_forest')).toBe(recommendedMapPower('beginner_desert'));
    // The last campaign boss opens Endless 1, and an Endless boss the stage after it.
    const last = MAP_IDS[MAP_IDS.length - 1];
    expect(recommendedBossPower(last)).toBe(recommendedMapPower('endless_1'));
    expect(recommendedBossPower('endless_3')).toBe(recommendedMapPower('endless_4'));
    expect(recommendedBossPower(SOUL_MAP_ID)).toBeNull();
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
