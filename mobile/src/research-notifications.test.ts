import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({
  cancel: vi.fn(async () => {}), schedule: vi.fn(async (_value: unknown) => ({})),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  createChannel: vi.fn(async () => {}), removeDeliveredNotificationsById: vi.fn(async () => {}),
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: native }));
import { createResearchNotifications, RESEARCH_NOTIFICATION_ID } from './research-notifications';
function storage() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => map.set(key, value), removeItem: (key: string) => map.delete(key) };
}
const research = { owner: 'alice', researchId: 'foraging', title: 'FORAGING', targetRank: 2, completesAtMs: 2_000_000 };
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(1_000_000); vi.clearAllMocks(); native.requestPermissions.mockResolvedValue({ display: 'granted' }); });
afterEach(() => vi.restoreAllMocks());
describe('native research notifications', () => {
  it('prompts on first active research and schedules the server deadline once', async () => {
    const service = createResearchNotifications(storage(), 'ios');
    await service.refresh();
    expect(native.requestPermissions).not.toHaveBeenCalled();
    await service.sync(research);
    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
    expect(native.schedule).toHaveBeenCalledWith({ notifications: [expect.objectContaining({ id: RESEARCH_NOTIFICATION_ID, body: 'FORAGING rank 2 is ready in WildStat.', schedule: { at: new Date(research.completesAtMs), allowWhileIdle: true } })] });
    await service.sync(research); expect(native.schedule).toHaveBeenCalledTimes(1);
    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
  });
  it('cancels on completion or account clearing and does not schedule old deadlines', async () => {
    const service = createResearchNotifications(storage(), 'ios'); await service.toggle(); await service.sync(research);
    await service.sync(null);
    expect(native.cancel).toHaveBeenLastCalledWith({ notifications: [{ id: RESEARCH_NOTIFICATION_ID }] });
    await service.sync({ ...research, completesAtMs: 900_000 });
    expect(native.schedule).toHaveBeenCalledTimes(1);
  });
  it('restores opt-in and research after app restart, and disabling removes the alert', async () => {
    const saved = storage(); const original = createResearchNotifications(saved, 'android');
    await original.toggle(); await original.sync(research);
    const restarted = createResearchNotifications(saved, 'android');
    expect(restarted.enabled()).toBe(true); await restarted.refresh();
    expect(native.createChannel).toHaveBeenCalled(); expect(native.schedule).toHaveBeenCalledTimes(2);
    await restarted.toggle(); expect(restarted.enabled()).toBe(false);
    expect(native.removeDeliveredNotificationsById).toHaveBeenCalledWith({ ids: [RESEARCH_NOTIFICATION_ID] });
  });
  it('stays off when permission is denied', async () => {
    native.requestPermissions.mockResolvedValue({ display: 'denied' });
    const saved = storage();
    const service = createResearchNotifications(saved, 'ios'); await service.sync(research);
    await service.sync({ ...research, targetRank: 3 });
    await createResearchNotifications(saved, 'ios').refresh();
    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
    expect(service.enabled()).toBe(false); expect(native.schedule).not.toHaveBeenCalled();
  });
  it('keeps opt-in after sign-out and registered account sign-in across restarts', async () => {
    const saved = storage(); const original = createResearchNotifications(saved, 'ios');
    await original.sync(research); await original.sync(null);
    const signedIn = createResearchNotifications(saved, 'ios');
    await signedIn.sync({ ...research, owner: 'registered-account' });
    expect(signedIn.enabled()).toBe(true);
    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
    expect(native.schedule).toHaveBeenLastCalledWith({ notifications: [expect.objectContaining({ extra: { kind: 'research', owner: 'registered-account' } })] });
  });
  it('prompts existing players with active research who have never answered', async () => {
    const saved = storage(); saved.setItem('wildstat.research-notifications.pending', JSON.stringify(research));
    await createResearchNotifications(saved, 'ios').refresh();
    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
    expect(native.schedule).toHaveBeenCalledTimes(1);
  });
  it('respects an existing explicit OFF preference without prompting again', async () => {
    const saved = storage(); saved.setItem('wildstat.research-notifications.enabled', 'false');
    await createResearchNotifications(saved, 'ios').sync(research);
    expect(native.requestPermissions).not.toHaveBeenCalled();
    expect(native.schedule).not.toHaveBeenCalled();
  });
  it('serializes a speed-up or logout behind an in-flight schedule', async () => {
    let finish!: () => void;
    const service = createResearchNotifications(storage(), 'ios'); await service.toggle();
    native.schedule.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({}); }));
    const pending = service.sync(research);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const canceled = service.sync(null);
    finish(); await pending; await canceled;
    expect(native.cancel.mock.invocationCallOrder.at(-1)).toBeGreaterThan(native.schedule.mock.invocationCallOrder.at(-1)!);
  });
});
