import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertCompatible, compatibleRange, newestCompatibleRange, directoryDigest, digest } from './common.mjs';
test('native and save changes require a new native baseline; protocol changes do not', () => {
  const base = { runtime: 'r', saveFormat: 1, protocol: 106, nativeFingerprint: 'native', version: '0.743' };
  assert.doesNotThrow(() => assertCompatible(base, { ...base, version: '0.744' }));
  assert.doesNotThrow(() => assertCompatible(base, { ...base, protocol: 110 }));
  for (const key of ['runtime', 'saveFormat', 'nativeFingerprint']) assert.throws(() => assertCompatible(base, { ...base, [key]: 'changed' }), /native app release/);
});
const at = (build, nativeFingerprint, extra = {}) => ({ runtime: 'r', saveFormat: 1, protocol: 100 + build, nativeFingerprint, platform: 'android', build, ...extra });
test('a feed covers only the unbroken run of builds that share the native code', () => {
  const baselines = [at(1, 'a'), at(5, 'b'), at(6, 'b'), at(7, 'b'), at(8, 'c'), at(9, 'b')];
  assert.deepEqual(compatibleRange(baselines, baselines[2]), { minBuild: 5, maxBuild: 7 });
  assert.deepEqual(compatibleRange(baselines, baselines[5]), { minBuild: 9, maxBuild: 9 });
  assert.deepEqual(compatibleRange(baselines, baselines[0]), { minBuild: 1, maxBuild: 1 });
});
test('automatic publishing picks the newest matching build and skips when none matches', () => {
  const baselines = [at(5, 'b'), at(6, 'b'), at(8, 'c'), at(7, 'b')];
  const pick = newestCompatibleRange(baselines, at(0, 'b', { protocol: 999 }));
  assert.equal(pick.baseline.build, 7);
  assert.deepEqual([pick.minBuild, pick.maxBuild], [5, 7]);
  assert.equal(newestCompatibleRange(baselines, at(0, 'z')), null);
  assert.equal(newestCompatibleRange(baselines, at(0, 'b', { saveFormat: 2 })), null);
  assert.equal(newestCompatibleRange([], at(0, 'b')), null);
});
test('the bundle digest follows file names and bytes, not source maps', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ota-digest-'));
  try {
    await mkdir(join(dir, 'a'));
    await writeFile(join(dir, 'a/index.js'), 'one');
    const first = await directoryDigest(dir);
    await writeFile(join(dir, 'a/index.js.map'), 'map');
    assert.equal(await directoryDigest(dir), first);
    await writeFile(join(dir, 'a/index.js'), 'two');
    assert.notEqual(await directoryDigest(dir), first);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('artifact digest changes when one byte changes', () => {
  assert.equal(digest(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(digest(Buffer.from('abc')), digest(Buffer.from('abd')));
});
