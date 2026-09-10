import { isNativePreview } from './native-preview';

export const NATIVE_AUTH_REDIRECT = 'https://wildstatmmo.com/app-auth/';
export const NATIVE_AUTH_CALLBACK = 'com.wildstatmmo.preview://auth/callback';
export const NATIVE_AUTH_CANCEL = 'wildstat:native-auth-cancel';
export type NativeAuthBridge = {
  ready: Promise<boolean>;
  open: (url: string, keys: string[]) => Promise<void>;
  cancel: () => void;
};
export function nativeAuth(): NativeAuthBridge | undefined {
  return isNativePreview() ? (window as unknown as { wildstatNativeAuth?: NativeAuthBridge }).wildstatNativeAuth : undefined;
}

export function parseNativeCallback(raw: string, state: string): URLSearchParams | null {
  try {
    const url = new URL(raw);
    if (`${url.protocol}//${url.host}${url.pathname}` !== NATIVE_AUTH_CALLBACK || url.username || url.password || url.hash) return null;
    for (const key of url.searchParams.keys()) if (url.searchParams.getAll(key).length !== 1) return null;
    if (!state || url.searchParams.get('state') !== state) return null;
    if (Boolean(url.searchParams.get('code')) === Boolean(url.searchParams.get('error'))) return null;
    const result = new URLSearchParams();
    for (const key of ['state', 'code', 'error', 'iss']) {
      const value = url.searchParams.get(key);
      if (value !== null) result.set(key, value);
    }
    return result;
  } catch { return null; }
}
