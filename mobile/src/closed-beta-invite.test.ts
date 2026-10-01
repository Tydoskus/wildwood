import { describe, expect, it } from 'vitest';
import { rememberClosedBetaJoin, shouldShowClosedBetaInvite } from './closed-beta-invite';

const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };

describe('closed beta invite', () => {
  it('asks until the tester has opened Google Play to join', () => {
    const storage = memory();
    expect(shouldShowClosedBetaInvite(storage)).toBe(true);
    rememberClosedBetaJoin(storage);
    expect(shouldShowClosedBetaInvite(storage)).toBe(false);
  });

  it('stays quiet in builds with the invite switched off', () => {
    expect(shouldShowClosedBetaInvite(memory(), false)).toBe(false);
  });

  it('still asks when storage is unavailable', () => {
    expect(shouldShowClosedBetaInvite({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} })).toBe(true);
  });
});
