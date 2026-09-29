import ts from 'typescript';

// Applied only to the disposable workspace built/published by local-dev.mjs.
// Release sources, identities and authentication policy remain untouched.
export function localDeveloperAccess(source, server = false, localIdentity = null) {
  const identityHex = localIdentity?.replace(/^0x/i, '').toLowerCase() ?? null;
  if (identityHex !== null && !/^[0-9a-f]{64}$/.test(identityHex)) throw new Error('Invalid local developer identity.');
  const file = ts.createSourceFile('local.ts', source, ts.ScriptTarget.Latest, true);
  const edits = [];
  let found = false;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'isDeveloperIdentity' && node.body) {
      found = true;
      edits.push({ start: node.body.getStart(file), end: node.body.end,
        text: `{ const normalized = ${server ? 'identity?.toHexString?.()' : 'identity'}?.replace(/^0x/i, '').toLowerCase(); return Boolean(normalized) && (normalized === ${server ? 'DEVELOPER_IDENTITY_HEX' : 'DEVELOPER_IDENTITY'} || normalized === ${JSON.stringify(identityHex)}); }` });
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
  return source;
}

/**
 * Local builds only: every stat reward times `multiplier`, for balance
 * testing. It scales researchStatRewardMultiplier, which the server pays kills
 * with and the client predicts them with, so both agree. Set it in
 * local-data/reward-multiplier.txt (or WILDSTAT_LOCAL_REWARD_MULTIPLIER) and
 * restart `npm run dev:local`; 1 or no file is off.
 */
export function localRewardMultiplier(source, multiplier) {
  if (!(Number.isFinite(multiplier) && multiplier > 0)) throw new Error('Invalid local reward multiplier.');
  if (multiplier === 1) return source;
  const line = '  return 1 + normalizedResearchRank(ranks?.foraging) * .01 + normalizedResearchRank(ranks?.prosperity) * .02;';
  if (source.split(line).length !== 2) throw new Error('Research reward multiplier changed; update the local reward multiplier.');
  return source.replace(line, `  return (1 + normalizedResearchRank(ranks?.foraging) * .01 + normalizedResearchRank(ranks?.prosperity) * .02) * ${multiplier};`);
}
