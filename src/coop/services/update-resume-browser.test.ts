import { afterEach, expect, it, vi } from "vitest";
import { consumeUpdateResumeMode, reloadWithUpdateResume } from "./update-resume-browser";
import { createUpdateResumeStore } from "./update-resume-store";
function fixture(version = "0.811") {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) } as unknown as Storage;
  const replace = vi.fn();
  vi.stubGlobal("window", { location: { href: `https://example.com/?v=${version}`, replace } });
  vi.stubGlobal("sessionStorage", storage); vi.stubGlobal("localStorage", storage);
  const store = createUpdateResumeStore(storage, "resume");
  return { store, replace, options: { version, store, consumedKey: "consumed", tabKey: "tab", tokenKey: "token" } };
}
afterEach(() => vi.unstubAllGlobals());
it('preserves the active session through a same-version recovery reload', () => {
  const f = fixture();
  expect(reloadWithUpdateResume('0.811', version => f.store.write(version, 'account'))).toBe(true);
  expect(f.replace).toHaveBeenCalledWith('https://example.com/?v=0.811');
  expect(consumeUpdateResumeMode(f.options)).toBe('account');
  expect(consumeUpdateResumeMode(f.options)).toBeNull();
});
it('resumes when recovery loads a newer bundle than the one that requested reload', () => {
  const f = fixture('0.810'); f.store.write('0.810', 'account');
  expect(consumeUpdateResumeMode({ ...f.options, version: '0.811' })).toBe('account');
});
it('does not consume the handoff if an old cached bundle loads first', () => {
  const f = fixture(); f.store.write('0.811', 'account');
  expect(consumeUpdateResumeMode({ ...f.options, version: '0.810' })).toBeNull();
  expect(consumeUpdateResumeMode(f.options)).toBe('account');
});
it('does not reload if the session cannot be preserved', () => {
  const f = fixture();
  expect(reloadWithUpdateResume('0.811', () => false)).toBe(false);
  expect(f.replace).not.toHaveBeenCalled();
});
