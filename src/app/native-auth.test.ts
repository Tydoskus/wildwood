import { describe, expect, it } from 'vitest';
import { NATIVE_AUTH_CALLBACK, parseNativeCallback } from './native-auth';

describe('native authentication callbacks', () => {
  it('accepts matching code and cancellation callbacks', () => {
    expect(parseNativeCallback(`${NATIVE_AUTH_CALLBACK}?state=expected&code=one`, 'expected')?.get('code')).toBe('one');
    expect(parseNativeCallback(`${NATIVE_AUTH_CALLBACK}?state=expected&error=access_denied`, 'expected')?.get('error')).toBe('access_denied');
  });
  it('rejects other destinations, state mismatches, duplicates and ambiguous results', () => {
    for (const url of [
      'https://evil.example/callback?state=expected&code=one',
      `${NATIVE_AUTH_CALLBACK}?state=wrong&code=one`,
      `${NATIVE_AUTH_CALLBACK}?state=expected&code=one&code=two`,
      `${NATIVE_AUTH_CALLBACK}?state=expected&code=one&error=denied`,
      `${NATIVE_AUTH_CALLBACK}?state=expected`,
      `${NATIVE_AUTH_CALLBACK}?state=expected&code=one#fragment`,
    ]) expect(parseNativeCallback(url, 'expected')).toBeNull();
  });
  it('passes only OAuth response fields to the app', () => {
    expect(parseNativeCallback(`${NATIVE_AUTH_CALLBACK}?state=expected&code=one&redirect=https://evil.example`, 'expected')?.has('redirect')).toBe(false);
  });
});
