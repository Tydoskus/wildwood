import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ platform: 'android', authenticate: vi.fn(async (_options: { url: string }): Promise<{url?: string; cancelled?: boolean}> => ({cancelled:true})), cancel:vi.fn(async () => {}), listeners: {} as Record<string, Function>, launch: undefined as string | undefined, open: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform }, registerPlugin: () => ({authenticate:mocks.authenticate, cancel:mocks.cancel}) }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (name, listener) => { mocks.listeners[name] = listener; }),
  getLaunchUrl: vi.fn(async () => mocks.launch ? { url: mocks.launch } : undefined),
} }));
vi.mock('@capacitor/browser', () => ({ Browser: {
  addListener: vi.fn(async (name, listener) => { mocks.listeners[name] = listener; }),
  open: mocks.open, close: mocks.close,
} }));
import { installNativeAuth } from './native-auth';
import { NATIVE_AUTH_CALLBACK, NATIVE_AUTH_REDIRECT, type NativeAuthBridge } from '../../src/app/native-auth';
import { SPACETIME_AUTH_ISSUER, SPACETIME_AUTH_CLIENT_ID } from '../../shared/rules';
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() };
}
function setup() {
  const local = storage(), session = storage(), replace = vi.fn();
  vi.stubGlobal('localStorage', local); vi.stubGlobal('sessionStorage', session);
  const win = { location: { href: 'capacitor://localhost/', replace }, dispatchEvent: vi.fn(), wildstatNativeAuth: undefined as NativeAuthBridge | undefined };
  vi.stubGlobal('window', win);
  return { local, session, replace, win };
}
async function begin(win: ReturnType<typeof setup>['win']) {
  installNativeAuth();
  const url = new URL(`${SPACETIME_AUTH_ISSUER}/auth`);
  url.search = new URLSearchParams({ client_id: SPACETIME_AUTH_CLIENT_ID, redirect_uri: NATIVE_AUTH_REDIRECT, state: 'expected', code_challenge_method: 'S256' }).toString();
  await win.wildstatNativeAuth!.open(url.href, ['verifier', 'state']);
}
afterEach(() => { mocks.platform = 'android'; mocks.launch = undefined; vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('uses the direct iOS session callback and restores the verified transaction', async () => {
  mocks.platform = 'ios';
  mocks.authenticate.mockResolvedValueOnce({url: `${NATIVE_AUTH_CALLBACK}?state=expected&code=one`});
  const {session, replace, win} = setup(); session.setItem('verifier', 'secret');
  await begin(win);
  expect(new URL(mocks.authenticate.mock.calls[0]![0].url).searchParams.get('redirect_uri')).toBe(NATIVE_AUTH_REDIRECT);
  expect(mocks.open).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled();
  expect(replace).toHaveBeenCalledWith('capacitor://localhost/?state=expected&code=one');
  expect(session.getItem('verifier')).toBe('secret');
});
it('dismisses cancelled iOS sign-in without accepting a later callback', async () => {
  mocks.platform = 'ios'; mocks.authenticate.mockResolvedValueOnce({cancelled:true});
  const {replace, win, local} = setup(); await begin(win);
  expect(win.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({type:'wildstat:native-auth-cancel'}));
  expect(local.getItem('wildstat.native-auth.pending')).toBeNull();
  mocks.listeners.appUrlOpen({url:`${NATIVE_AUTH_CALLBACK}?state=expected&code=one`});
  expect(replace).not.toHaveBeenCalled();
});
it('restores transaction after cold launch and consumes the callback once', async () => {
  const { session, replace, win } = setup();
  session.setItem('verifier', 'secret'); session.setItem('state', 'expected');
  await begin(win);
  session.clear();
  mocks.launch = `${NATIVE_AUTH_CALLBACK}?state=expected&code=one`;
  installNativeAuth();
  expect(await win.wildstatNativeAuth!.ready).toBe(true);
  expect(session.getItem('verifier')).toBe('secret');
  expect(replace).toHaveBeenCalledWith('capacitor://localhost/?state=expected&code=one');
  mocks.listeners.appUrlOpen({ url: mocks.launch });
  expect(replace).toHaveBeenCalledTimes(1);
});
it('ignores a mismatched callback without consuming a valid transaction', async () => {
  const { replace, win } = setup();
  await begin(win);
  mocks.listeners.appUrlOpen({ url: `${NATIVE_AUTH_CALLBACK}?state=wrong&code=one` });
  expect(replace).not.toHaveBeenCalled();
  mocks.listeners.appUrlOpen({ url: `${NATIVE_AUTH_CALLBACK}?state=expected&code=one` });
  expect(replace).toHaveBeenCalledTimes(1);
});
it('canceling prevents a later callback from opening an account', async () => {
  const { replace, win } = setup();
  await begin(win);
  win.wildstatNativeAuth!.cancel();
  mocks.listeners.appUrlOpen({ url: `${NATIVE_AUTH_CALLBACK}?state=expected&code=one` });
  expect(replace).not.toHaveBeenCalled();
});

it('keeps one iOS session and consumes duplicate callbacks without reopening', async () => {
  mocks.platform = 'ios';
  let finish!: (result: { url?: string; cancelled?: boolean }) => void;
  mocks.authenticate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { session, local, replace, win } = setup();
  session.setItem('verifier', 'first-secret');
  const first = begin(win);
  await vi.waitFor(() => expect(mocks.authenticate).toHaveBeenCalledTimes(1));
  const raw = mocks.authenticate.mock.calls[0]![0].url;
  const duplicate = new URL(raw); duplicate.searchParams.set('state', 'duplicate');
  session.setItem('verifier', 'duplicate-secret');
  await win.wildstatNativeAuth!.open(duplicate.href, ['verifier']);
  expect(mocks.authenticate).toHaveBeenCalledTimes(1);
  expect(JSON.parse(local.getItem('wildstat.native-auth.pending')!).state).toBe('expected');
  const callback = `${NATIVE_AUTH_CALLBACK}?state=expected&code=one`;
  mocks.listeners.appUrlOpen({ url: callback });
  finish({ cancelled: true });
  await first;
  await win.wildstatNativeAuth!.open(raw, ['verifier']);
  mocks.listeners.appUrlOpen({ url: callback });
  expect(replace).toHaveBeenCalledTimes(1);
  expect(session.getItem('verifier')).toBe('first-secret');
  expect(mocks.authenticate).toHaveBeenCalledTimes(1);
  expect(win.dispatchEvent).not.toHaveBeenCalled();
});
it('allows retry after cancelling an iOS session', async () => {
  mocks.platform = 'ios';
  const { win } = setup();
  await begin(win);
  await win.wildstatNativeAuth!.open(mocks.authenticate.mock.calls[0]![0].url, []);
  expect(mocks.authenticate).toHaveBeenCalledTimes(2);
});
