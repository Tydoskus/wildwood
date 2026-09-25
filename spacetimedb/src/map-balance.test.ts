import revision75 from '../../tests/fixtures/balance-revision-75.json';
import { activateCampaignPacing, activateCampaignProgression, activateCampaignRewardFloor } from './campaign-pacing-migration';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from '../../shared/map-balance';
import bakeFixture from '../../tests/fixtures/balance-revision-73.json';
import { it, expect, vi } from 'vitest';
import { balanceEditorState, forgetBalanceCaches, saveMapBalance, pinMapBalance, pinnedMapBalance } from './map-balance';
function fixture() {
  forgetBalanceCaches();
  const sender = { toHexString: () => 'test' };
  const table = (field: string) => {
    const rows = new Map(); const key = (value: any) => value === sender ? 'test' : value;
    return { [field]: { find: (id: any) => rows.get(key(id)), update: (row: any) => rows.set(key(row[field]), row) }, insert: (row: any) => rows.set(key(row[field]), row) };
  };
  return { sender, timestamp: { microsSinceUnixEpoch: 1n }, db: { mapBalanceVersion: table('revision'), mapBalanceHead: table('id'), playerMapBalance: table('identity') } } as any;
}
it('pins a visit across changes/reconnects, refreshes on travel, preserves previous version', () => {
  const ctx = fixture(); pinMapBalance(ctx, 'tutorial_forest', true);
  const initial = pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')!;
  const edited = balanceEditorState(ctx); edited.settings.maps.tutorial_forest.bossHealth = 2;
  saveMapBalance(ctx, 0, JSON.stringify(edited.settings));
  pinMapBalance(ctx, 'tutorial_forest');
  expect(pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')!.boss!.hp).toBe(initial.boss!.hp);
  pinMapBalance(ctx, 'home_exterior'); pinMapBalance(ctx, 'tutorial_forest');
  expect(pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')!.boss!.hp).toBe(initial.boss!.hp * 2);
  expect(ctx.db.mapBalanceVersion.revision.find(0)).toBeDefined();
  expect(() => saveMapBalance(ctx, 0, JSON.stringify(edited.settings))).toThrow('another editor');
});
it('does not opt an old client into new values before it requests the snapshot', () => {
  const ctx = fixture(); pinMapBalance(ctx, 'tutorial_forest');
  expect(pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')).toBeNull();
});

vi.mock('spacetimedb/server', () => import('../../tests/helpers/spacetime-module'));

import { crystalFixture, server } from '../../tests/helpers/crystal-hollows-fixture';
it('rejects non-developer changes and previews; rejects balance queries for a different map', () => {
  const f = crystalFixture();
  const proc = { withTx: (action: any) => f.transaction(() => action(f.ctx)) } as any;
  expect(() => f.run(server.setMapBalance, { expectedRevision: 0, settingsJson: '{}' })).toThrow('Developer access required');
  expect(() => server.getBalanceEditor(proc, {})).toThrow('Developer access required');
  expect(() => server.getMapBalance(proc, { mapId: 'ion_citadel' })).toThrow('Enter the map');
});
it('awards the snapshot shown to the client even after an administrator edits rewards', () => {
  const f = crystalFixture();
  const proc = { withTx: (action: any) => f.transaction(() => action(f.ctx)) } as any;
  const snapshot = JSON.parse(server.getMapBalance(proc, { mapId: 'crystal_hollows' }));
  const settings = balanceEditorState(f.ctx as any).settings; settings.maps.crystal_hollows.bossRewards = 3;
  f.transaction(() => saveMapBalance(f.ctx as any, 0, JSON.stringify(settings)));
  f.patch('playerProgress', { damage: 1e15 });
  const before = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.recordEnemyDefeats, { streamId: 'balance-boss-rewards-01', sequence: 1n, mapId: 'crystal_hollows', enemies: [{ enemy: 'boss', count: 1 }] });
  const after = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(after.maxHp - before.maxHp).toBe(snapshot.boss.rewards.health);
  expect(after.clockworkRuinsUnlocked).toBe(true);
  f.transaction(() => { pinMapBalance(f.ctx as any, 'home_exterior'); pinMapBalance(f.ctx as any, 'crystal_hollows'); });
  expect(pinnedMapBalance(f.ctx as any, f.ctx.sender, 'crystal_hollows')!.boss!.rewards.health).toBe(snapshot.boss.rewards.health * 3);
});
it('negotiates new fields without switching balance revisions during a visit', () => {
  const ctx = fixture(); pinMapBalance(ctx, 'tutorial_forest', true, 1);
  const settings = balanceEditorState(ctx).settings; settings.maps.tutorial_forest.enemyRespawn = 2;
  saveMapBalance(ctx, 0, JSON.stringify(settings));
  pinMapBalance(ctx, 'tutorial_forest', true, 2);
  expect(pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')).toMatchObject({ revision: 0, configurationVersion: 2, regularRespawnSeconds: 10 });
  pinMapBalance(ctx, 'home_exterior'); pinMapBalance(ctx, 'tutorial_forest');
  expect(pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')).toMatchObject({ revision: 1, configurationVersion: 2, regularRespawnSeconds: 20 });
});
it('re-pins a visit whose snapshot was scaled from the old 20-second respawn', () => {
  const ctx = fixture(); pinMapBalance(ctx, 'tutorial_forest', true, 2);
  const current = pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')!;
  expect(current).toMatchObject({ regularRespawnSeconds: 10, regularRespawnBaseSeconds: 10 });
  // What a pre-0.807 server pinned: the same revision, scaled from 20 seconds, with no base recorded.
  const { regularRespawnBaseSeconds: _base, ...rest } = current;
  ctx.db.playerMapBalance.identity.update({ identity: ctx.sender, mapId: 'tutorial_forest', snapshotJson: JSON.stringify({ ...rest, regularRespawnSeconds: 20 }) });
  pinMapBalance(ctx, 'tutorial_forest');
  expect(pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')).toEqual(current);
  // A current snapshot is still kept for the rest of the visit.
  const settings = balanceEditorState(ctx).settings; settings.maps.tutorial_forest.enemyRespawn = 2;
  saveMapBalance(ctx, 0, JSON.stringify(settings));
  pinMapBalance(ctx, 'tutorial_forest', true, 2);
  expect(pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')).toEqual(current);
});

it('reuses a revision across players without serving it past the next save', () => {
  const ctx = fixture();
  pinMapBalance(ctx, 'tutorial_forest', true);
  const before = pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')!;
  const settings = balanceEditorState(ctx).settings;
  settings.maps.tutorial_forest.bossHealth = 5;
  saveMapBalance(ctx, 0, JSON.stringify(settings));

  // Travelling away and back takes the new revision rather than a cached one.
  pinMapBalance(ctx, 'home_exterior'); pinMapBalance(ctx, 'tutorial_forest');
  const after = pinnedMapBalance(ctx, ctx.sender, 'tutorial_forest')!;
  expect(after.revision).toBe(1);
  expect(after.boss!.hp).toBe(before.boss!.hp * 5);

  // A second player arriving at the same revision is served the same snapshot.
  const other = { ...ctx, sender: { toHexString: () => 'other' } };
  pinMapBalance(other, 'tutorial_forest', true);
  expect(pinnedMapBalance(other, other.sender, 'tutorial_forest')).toEqual(after);
});

it('serves byte-identical snapshots whether or not the caches are warm', () => {
  const maps = ['tutorial_forest', 'beginner_desert', 'crystal_hollows', 'endless_1', 'endless_97'];
  const snapshotsFor = (cold: boolean) => {
    const ctx = fixture();
    // Two revisions, so the cache is exercised across a save as well as within one.
    pinMapBalance(ctx, 'tutorial_forest', true);
    const settings = balanceEditorState(ctx).settings;
    settings.maps.endless.bossHealth = 3;
    settings.endless.statStep = .2;
    saveMapBalance(ctx, 0, JSON.stringify(settings));
    const collected: Record<string, unknown> = {};
    for (const mapId of maps) {
      if (cold) forgetBalanceCaches();
      pinMapBalance(ctx, 'home_exterior');
      if (cold) forgetBalanceCaches();
      pinMapBalance(ctx, mapId, true);
      collected[mapId] = pinnedMapBalance(ctx, ctx.sender, mapId);
    }
    return collected;
  };
  expect(snapshotsFor(false)).toEqual(snapshotsFor(true));
});

 it.each(['tutorial_forest', 'ion_citadel', 'endless_40'])('restores damage for an existing %s visit without changing anything else', (mapId) => {
  const ctx = fixture(); pinMapBalance(ctx, mapId, true, 2);
  const original = pinnedMapBalance(ctx, ctx.sender, mapId)!;
  const old = JSON.parse(JSON.stringify(original)); delete old.enemyDamageVersion;
  for (const row of [...Object.values(old.enemies), ...Object.values(old.lanes)] as any[]) row.damage = row.hp * .1;
  // A pinned reward may predate a reward buff; the damage hotfix must leave it alone.
  if (old.boss) old.boss.rewards.health = 123;
  ctx.db.playerMapBalance.identity.update({ identity: ctx.sender, mapId, snapshotJson: JSON.stringify(old) });
  pinMapBalance(ctx, mapId);
  if (original.boss) original.boss.rewards.health = 123;
  expect(pinnedMapBalance(ctx, ctx.sender, mapId)).toEqual(original);
  pinMapBalance(ctx, mapId);
  expect(pinnedMapBalance(ctx, ctx.sender, mapId)).toEqual(original);
});

it('loads and saves pre-bake revisions without applying rewards twice or rewriting history', () => {
  const ctx = fixture();
  const json = JSON.stringify(bakeFixture.settings);
  ctx.db.mapBalanceVersion.insert({ revision: 73, settingsJson: json, editor: ctx.sender, createdAt: ctx.timestamp });
  ctx.db.mapBalanceHead.insert({ id: 0, revision: 73 });
  const editor = balanceEditorState(ctx);
  expect(editor.settings.baselineVersion).toBe(2);
  expect(editor.settings.maps.ion_citadel.enemyRewards).toBe(1);
  pinMapBalance(ctx, 'ion_citadel', true, 2);
  const before = pinnedMapBalance(ctx, ctx.sender, 'ion_citadel')!;
  saveMapBalance(ctx, 73, JSON.stringify(editor.settings));
  expect(balanceEditorState(ctx).settings).toEqual(editor.settings);
  expect(ctx.db.mapBalanceVersion.revision.find(73).settingsJson).toBe(json);
  pinMapBalance(ctx, 'home_exterior');
  pinMapBalance(ctx, 'ion_citadel');
  expect(pinnedMapBalance(ctx, ctx.sender, 'ion_citadel')).toEqual({ ...before, revision: 74 });
});

it('activates the exact tested campaign settings once, retaining archived revisions and pinned visits', () => {
  const ctx = fixture();
  const archived = { revision: 73, settingsJson: JSON.stringify(bakeFixture.settings), editor: ctx.sender, createdAt: ctx.timestamp };
  ctx.db.mapBalanceVersion.insert(archived);
  ctx.db.mapBalanceHead.insert({ id: 0, revision: 73 });
  pinMapBalance(ctx, 'ion_citadel', true, 2);
  const pinned = ctx.db.playerMapBalance.identity.find(ctx.sender).snapshotJson;
  activateCampaignPacing(ctx);
  const expected = JSON.parse(JSON.stringify(revision75)); delete expected.campaignRewardVersion;
  expect(balanceEditorState(ctx).settings).toEqual(expected);
  expect(balanceEditorState(ctx).revision).toBe(74);
  expect(ctx.db.mapBalanceVersion.revision.find(73)).toEqual(archived);
  expect(ctx.db.playerMapBalance.identity.find(ctx.sender).snapshotJson).toBe(pinned);
  activateCampaignPacing(ctx);
  expect(balanceEditorState(ctx).revision).toBe(74);
  pinMapBalance(ctx, 'home_exterior');
  pinMapBalance(ctx, 'ion_citadel');
  expect(pinnedMapBalance(ctx, ctx.sender, 'ion_citadel')!.revision).toBe(74);
});
/** The curve's settings, allowing the Endless reward factor its round-off from being multiplied back to 1. */
function expectProgressionCurve(settings: ReturnType<typeof defaultBalanceSettings>) {
  expect(settings.maps.endless.enemyRewards).toBeCloseTo(1, 12);
  expect({ ...settings, maps: { ...settings.maps, endless: { ...settings.maps.endless, enemyRewards: 1 } } }).toEqual(defaultBalanceSettings());
}

it('runs pending campaign migrations from the connection path only once', () => {
  const f = crystalFixture();
  forgetBalanceCaches();
  f.seed('moduleMigrationState', { id: 0, version: 42 });
  f.seed('mapBalanceHead', { id: 0, revision: 73 });
  f.seed('mapBalanceVersion', { revision: 73, settingsJson: JSON.stringify(bakeFixture.settings), editor: f.ctx.sender, createdAt: f.ctx.timestamp });
  f.ctx.connectionId = null;
  f.run(server.onConnect);
  expect(f.db.moduleMigrationState.id.find(0).version).toBe(45);
  expect(f.db.mapBalanceVersion.revision.find(75).settingsJson).toBe(JSON.stringify(validateBalanceSettings(revision75)));
  expect(balanceEditorState(f.ctx as any).revision).toBe(76);
  expectProgressionCurve(balanceEditorState(f.ctx as any).settings);
  f.run(server.onConnect);
  expect(balanceEditorState(f.ctx as any).revision).toBe(76);
});

it('migration 45 turns the live revision into the tested progression curve, once, keeping Endless and dev tuning', () => {
  const ctx = fixture();
  const live = validateBalanceSettings(revision75);
  ctx.db.mapBalanceVersion.insert({ revision: 75, settingsJson: JSON.stringify(live), editor: ctx.sender, createdAt: ctx.timestamp });
  ctx.db.mapBalanceHead.insert({ id: 0, revision: 75 });
  activateCampaignProgression(ctx);
  expect(balanceEditorState(ctx).revision).toBe(76);
  expectProgressionCurve(balanceEditorState(ctx).settings);
  for (const map of ['endless_1', 'endless_40', 'endless_1000']) {
    const before = resolveMapBalance(map, live, 0), after = resolveMapBalance(map, balanceEditorState(ctx).settings, 0);
    for (const [lane, value] of Object.entries(after.lanes)) expect(value.reward.amount / before.lanes[lane].reward.amount).toBeCloseTo(1, 12);
  }
  activateCampaignProgression(ctx);
  expect(balanceEditorState(ctx).revision).toBe(76);

  const tuned = fixture();
  const tweaked = structuredClone(live); tweaked.maps.moonfen.enemyDamage = 1.2; tweaked.maps.water_reach.enemyRespawn = .8;
  tuned.db.mapBalanceVersion.insert({ revision: 75, settingsJson: JSON.stringify(tweaked), editor: tuned.sender, createdAt: tuned.timestamp });
  tuned.db.mapBalanceHead.insert({ id: 0, revision: 75 });
  activateCampaignProgression(tuned);
  expect(balanceEditorState(tuned).settings.maps.moonfen.enemyDamage).toBe(1.2);
  expect(balanceEditorState(tuned).settings.maps.water_reach.enemyRespawn).toBe(.8);
});

it('migration 44 changes only the reward-floor flag and remains idempotent', () => {
  const ctx = fixture();
  const before = defaultBalanceSettings(); delete before.campaignRewardVersion;
  before.maps.beginner_desert.bossRewards = 1.25;
  ctx.db.mapBalanceVersion.insert({ revision: 74, settingsJson: JSON.stringify(before), editor: ctx.sender, createdAt: ctx.timestamp });
  ctx.db.mapBalanceHead.insert({ id: 0, revision: 74 });
  activateCampaignRewardFloor(ctx);
  expect(balanceEditorState(ctx)).toMatchObject({ revision: 75, settings: { ...before, campaignRewardVersion: 1 } });
  expect(JSON.parse(ctx.db.mapBalanceVersion.revision.find(74).settingsJson)).toEqual(before);
  activateCampaignRewardFloor(ctx);
  expect(balanceEditorState(ctx).revision).toBe(75);
});
