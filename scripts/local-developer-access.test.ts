import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import ts from 'typescript';
import { localDeveloperAccess } from './local-developer-access.mjs';
const shared = readFileSync(new URL('../shared/developer-identity.ts', import.meta.url), 'utf8');
const localIdentity = 'a'.repeat(64);
const server = readFileSync(new URL('../spacetimedb/src/index.ts', import.meta.url), 'utf8');
it('grants only the configured local guest developer access', () => {
  const js = ts.transpile(localDeveloperAccess(shared, false, localIdentity), { module: ts.ModuleKind.CommonJS });
  const exports: any = {};
  new Function('exports', js)(exports);
  expect(exports.isDeveloperIdentity(localIdentity)).toBe(true);
  expect(exports.isDeveloperIdentity('b'.repeat(64))).toBe(false);
  expect(exports.isDeveloperIdentity(exports.DEVELOPER_IDENTITY)).toBe(true);
  expect(exports.isDeveloperIdentity(null)).toBe(false);
  expect(shared).toContain('=== DEVELOPER_IDENTITY');
});
it('changes only the isolated developer gates and keeps session checks', () => {
  const local = localDeveloperAccess(server, true, localIdentity);
  expect(local).toContain(`normalized === "${localIdentity}"`);
  expect(local).toContain('!virtualRegistration && isDeveloperIdentity(ctx.sender)');
  expect(local).not.toContain('!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)');
  expect(local).toContain('requireSupportedSessionProtocol(ctx);');
  expect(local).toContain('requireControllingPlayer(ctx);');
  expect(local).toContain('!hasSpacetimeAuthAccount(ctx)');
  expect(local).toContain('bossRewardClaims: CAMPAIGN_MAPS.reduce');
  expect(local).toContain('localReferenceBuild(Math.max(0, CAMPAIGN_MAPS.length - 2))');
  expect(server).toContain('!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)');
});
it('fails closed if the source contract changes', () => {
  expect(() => localDeveloperAccess('export const unrelated = 1')).toThrow();
});
