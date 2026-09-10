import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { NATIVE_AUTH_CANCEL, NATIVE_AUTH_REDIRECT, parseNativeCallback, type NativeAuthBridge } from '../../src/app/native-auth';
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from '../../shared/rules';

const STORAGE_KEY = 'wildstat.native-auth.pending';
const MAX_AGE = 10 * 60_000;
type Pending = { started: number; state: string; values: Record<string, string> };
const iosAuth = registerPlugin<{ authenticate(options: { url: string }): Promise<{ url?: string; cancelled?: boolean }>; cancel(): Promise<void> }>('WildStatAuth');

export function installNativeAuth() {
  const ios = Capacitor.getPlatform() === 'ios';
  const redirectUri = NATIVE_AUTH_REDIRECT;
  let navigating = false;
  let active = false;
  function cancel() {
    active = false;
    localStorage.removeItem(STORAGE_KEY);
  }
  function receive(raw: string) {
    if (navigating) return;
    try {
      const pending = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Pending | null;
      if (!pending) return;
      if (Date.now() - pending.started > MAX_AGE || pending.started > Date.now()) { cancel(); return; }
      const query = parseNativeCallback(raw, pending.state);
      if (!query || (query.has('iss') && query.get('iss') !== SPACETIME_AUTH_ISSUER)) return;
      for (const [key, value] of Object.entries(pending.values)) sessionStorage.setItem(key, value);
      cancel();
      navigating = true;
      const destination = new URL(window.location.href);
      destination.search = query.toString();
      destination.hash = '';
      if (!ios) void Browser.close().catch(() => {});
      window.location.replace(destination.toString());
    } catch { cancel(); }
  }
  const ready = (async () => {
    await App.addListener('appUrlOpen', ({ url }) => receive(url));
    if (!ios) await Browser.addListener('browserFinished', () => {
      // Allow the deep-link event to win when closing the browser accompanies a callback.
      setTimeout(() => {
        if (!active || navigating) return;
        cancel();
        window.dispatchEvent(new Event(NATIVE_AUTH_CANCEL));
      }, 750);
    });
    const launch = await App.getLaunchUrl();
    if (launch?.url) receive(launch.url);
    return navigating;
  })();
  const bridge: NativeAuthBridge = {
    ready,
    cancel() { cancel(); if (ios) void iosAuth.cancel().catch(() => {}); },
    async open(raw, keys) {
      await ready;
      if (active || navigating) return;
      const url = new URL(raw);
      if (`${url.origin}${url.pathname}` !== `${SPACETIME_AUTH_ISSUER}/auth` ||
          url.searchParams.get('client_id') !== SPACETIME_AUTH_CLIENT_ID ||
          url.searchParams.get('redirect_uri') !== redirectUri ||
          url.searchParams.get('code_challenge_method') !== 'S256' || !url.searchParams.get('state')) {
        throw new Error('Invalid native sign-in request');
      }
      const values: Record<string, string> = {};
      for (const key of keys) {
        const value = sessionStorage.getItem(key);
        if (value !== null) values[key] = value;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ started: Date.now(), state: url.searchParams.get('state'), values }));
      active = true;
      try {
        if (ios) {
          const result = await iosAuth.authenticate({ url: raw });
          if (navigating) return;
          if (result.url) receive(result.url);
          else {
            cancel();
            window.dispatchEvent(new Event(NATIVE_AUTH_CANCEL));
          }
        } else await Browser.open({ url: raw });
      }
      catch (error) { cancel(); throw error; }
    },
  };
  (window as unknown as { wildstatNativeAuth: NativeAuthBridge }).wildstatNativeAuth = bridge;
}
