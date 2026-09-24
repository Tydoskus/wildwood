import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MAPS, campaignEndpoint } from './campaign-registry';
import { prestigeUnlocked, prestigeEndlessRequirement, prestigeRequirementHint } from './prestige';
import { campaignMapUnlocked } from './equipment-access';
import art from '../src/game/boss-art.json';
const expanded = [15, 16].reduce((maps, index) => [...maps, {
  ...CAMPAIGN_MAPS[14], id: `new_${index + 1}`, bossKind: `new${index + 1}`, bossName: `Boss ${index + 1}`,
  bossArt: `NEW_${index + 1}`, name: `Map ${index + 1}`, displayName: `Map ${index + 1}`, claimIndex: index, unlockField: '',
}], [...CAMPAIGN_MAPS]);
describe('campaign growth', () => {
  it('has unique permanent claims and art for every current boss', () => {
    expect(new Set(CAMPAIGN_MAPS.map(map => map.claimIndex)).size).toBe(CAMPAIGN_MAPS.length);
    for (const map of CAMPAIGN_MAPS) expect(art).toHaveProperty(map.bossArt);
    expect(Math.max(...CAMPAIGN_MAPS.map(map => map.claimIndex))).toBeLessThan(32);
  });
  it('moves the Endless entry and baseline when campaign maps are added', () => {
    expect(campaignEndpoint(expanded)).toMatchObject({ mapId: 'new_17', bossKind: 'new17', mapNumber: 17, endlessTier: 16 });
  });
  it('keeps prestige one at 15 and prestige two at 16 when campaign grows', () => {
    const map15 = 2 ** 14, map16 = 2 ** 15, map17 = 2 ** 16;
    expect(prestigeUnlocked(map15, 0, 1, expanded)).toBe(true);
    expect(prestigeUnlocked(map15, 99, 2, expanded)).toBe(false);
    expect(prestigeUnlocked(map16, 0, 2, expanded)).toBe(true);
    expect(prestigeUnlocked(map17, 0, 3, expanded)).toBe(true);
    expect(prestigeUnlocked(map17, 0, 4, expanded)).toBe(false);
    expect(prestigeUnlocked(map17, 1, 4, expanded)).toBe(true);
    expect(prestigeEndlessRequirement(4, 17)).toBe(1);
    expect(prestigeRequirementHint(false, 0, 2, expanded)).toBe('Defeat Boss 16 to unlock Prestige.');
  });
  it('gates an added map from the preceding boss claim without a new database column', () => {
    expect(campaignMapUnlocked(15, {}, expanded)).toBe(false);
    expect(campaignMapUnlocked(15, { bossRewardClaims: 2 ** 14 }, expanded)).toBe(true);
    expect(campaignMapUnlocked(16, { bossRewardClaims: 2 ** 14 }, expanded)).toBe(false);
    expect(campaignMapUnlocked(16, { bossRewardClaims: 2 ** 15 }, expanded)).toBe(true);
  });
});
