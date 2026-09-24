import ts from 'typescript';

// Applied only to the disposable workspace built/published by local-dev.mjs.
// Release sources, identities and authentication policy remain untouched.
export function localDeveloperAccess(source, server = false) {
  const file = ts.createSourceFile('local.ts', source, ts.ScriptTarget.Latest, true);
  const edits = [];
  let found = false;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'isDeveloperIdentity' && node.body) {
      found = true;
      edits.push({ start: node.body.getStart(file), end: node.body.end,
        text: server ? '{ return Boolean(identity?.toHexString?.()); }' : '{ return Boolean(identity); }' });
    }
    // Local guest sessions can use dev reducers while retaining protocol,
    // controlling-tab checks, and the usual audit trail.
    if (server && ts.isFunctionDeclaration(node) && ['requireDeveloper', 'requireDeveloperSession'].includes(node.name?.text)) {
      const body = node.body.getText(file);
      const expected = '!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)';
      if (!body.includes(expected)) throw new Error('Local developer guard changed; update the local adapter.');
      edits.push({ start: node.body.getStart(file), end: node.body.end,
        text: body.replace(expected, '!isDeveloperIdentity(ctx.sender)') });
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error('Local developer identity function was not found.');
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  if (server) {
    const marker = '  ensureCutsceneHistory(ctx, ctx.sender);';
    if (source.split(marker).length !== 2) throw new Error('Local guest setup location changed.');
    source = 'import { referenceBuildForMap as localReferenceBuild } from "../../shared/progression";\n' + source;
    source = source.replace(marker, `
  // Disposable local build only: give guests a ready-to-test campaign save.
  if (!virtualRegistration && !hasSpacetimeAuthAccount(ctx)) {
    const stats = localReferenceBuild(Math.max(0, CAMPAIGN_MAPS.length - 2));
    const unlocked = Object.fromEntries(CAMPAIGN_MAPS.filter(map => map.unlockField).map(map => [map.unlockField, true]));
    existingProgress = { ...existingProgress, ...unlocked, introComplete: true,
      bossRewardClaims: CAMPAIGN_MAPS.reduce((mask, map) => mask | 2 ** map.claimIndex, 0) >>> 0,
      maxHp: Math.max(existingProgress.maxHp, stats.maxHp), damage: Math.max(existingProgress.damage, stats.damage),
      armor: Math.max(existingProgress.armor, stats.armor), regen: Math.max(existingProgress.regen, stats.regen) };
    updateSnapshotRow(ctx, "playerProgress", existingProgress);
    const onboarding = ctx.db.playerOnboarding.identity.find(ctx.sender);
    if (onboarding) ctx.db.playerOnboarding.identity.update({ ...onboarding, step: 6 });
  }
${marker}`);
  }
  return source;
}
