import { expect, it, vi } from "vitest";
import { createProfileDirectory, generatedDisplayName } from "./profile-directory";
import type { Identity } from "spacetimedb";
it("prunes inactive sender metadata after a busy chat session without evicting the current player", () => {
  const directory = createProfileDirectory({ localIdentity: () => "me", shouldRetain: (id: string) => id === "visible", notify: vi.fn() } as never);
  const remember = (id: string) => directory.rememberChatSender({ identity: id, identityValue: { toHexString: () => id } as Identity, name: id, isGuest: false });
  remember("me"); remember("visible");
  for (let i = 0; i < 10000; i++) remember(String(i));
  expect(directory.identityFor("0")).toBeUndefined();
  expect(directory.identityFor("9999")).toBeDefined();
  expect(directory.identityFor("me")).toBeDefined();
  expect(directory.identityFor("visible")).toBeDefined();
});

it("recognizes a saved profile name before the subscription catches up and after reconnect", async () => {
  const identity = { toHexString: () => "me" } as Identity;
  const directory = createProfileDirectory({
    localIdentity: () => "me", shouldRetain: () => true, notify: vi.fn(),
    rememberCharacter: vi.fn(), rememberGender: vi.fn(), completeAccountReturn: vi.fn(),
    renameRemotePlayer: vi.fn(), markChatPresentationChanged: vi.fn(), localIsGuestFallback: () => true,
    reducers: { protocolBlocked: () => false, connection: () => ({ reducers: { setDisplayName: vi.fn() } }),
      runWorldReducer: async (call: () => void) => { call(); } },
  } as never);
  const profile = { identity, displayName: generatedDisplayName("me"), profileIcon: 0, playerSprite: 0 };
  directory.tables.upsertProfile(profile);
  expect(directory.api.hasChosenDisplayName()).toBe(false);
  await directory.api.setDisplayName("  Chosen Name  ");
  expect(directory.api.localDisplayName()).toBe("Chosen Name");
  expect(directory.api.hasChosenDisplayName()).toBe(true);
  directory.prepareSession("Chosen Name");
  directory.tables.upsertProfile({ ...profile, displayName: "Chosen Name" });
  expect(directory.api.hasChosenDisplayName()).toBe(true);
  // Even a deliberately chosen name that resembles a generated name is retained.
  directory.tables.upsertProfile({ ...profile, displayName: generatedDisplayName("another-account") });
  expect(directory.api.hasChosenDisplayName()).toBe(true);
});

it("snapshots the character with no arguments and shows it as the local picture on the same backdrop", async () => {
  const identity = { toHexString: () => "me" } as Identity;
  const snapshotProfileCharacter = vi.fn();
  const directory = createProfileDirectory({
    localIdentity: () => "me", shouldRetain: () => true, notify: vi.fn(),
    rememberCharacter: vi.fn(), rememberGender: vi.fn(), completeAccountReturn: vi.fn(),
    renameRemotePlayer: vi.fn(), markChatPresentationChanged: vi.fn(), localIsGuestFallback: () => true,
    reducers: { protocolBlocked: () => false, connection: () => connection, errorMessage: (error: Error) => error.message, handleFailure: vi.fn(),
      runWorldReducer: async (call: () => unknown) => call() },
  } as never);
  const connection = { isActive: false, reducers: { snapshotProfileCharacter } };
  directory.tables.upsertProfile({ identity, displayName: "Me", profileIcon: 7 | 0x10000, playerSprite: 0 });
  expect(await directory.api.snapshotProfileCharacter()).toEqual({ ok: true });
  expect(snapshotProfileCharacter).toHaveBeenCalledExactlyOnceWith({});
  expect(directory.api.profileIcon()).toBe(0xffff | 0x10000);
  snapshotProfileCharacter.mockImplementation(() => { throw new Error("You can snapshot your character again in 29 seconds."); });
  expect(await directory.api.snapshotProfileCharacter()).toEqual({ ok: false, error: "You can snapshot your character again in 29 seconds." });
  directory.clearSession();
});
