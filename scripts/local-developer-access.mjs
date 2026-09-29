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
