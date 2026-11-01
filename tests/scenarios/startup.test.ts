import { describe, expect, it } from "vitest";
import { AGE_BAND_ADULT, AGE_BAND_UNDER_13, AGE_BAND_UNVERIFIED, TERMS_VERSION } from "../../shared/legal";
import { bootGame, gameWorld, playAs, storageKeys, type GameTab } from "./harness/game";
import { fakeSpacetimeAuth, memoryStorage, returnFromAnotherSite } from "./harness/boot-ops";

/** How many times game.js was put on the page. */
const gameScripts = (tab: GameTab) => tab.document.querySelectorAll("#wildstatGameScript").length;
const disabled = (tab: GameTab, id: string) => (tab.element(id) as HTMLButtonElement).disabled;
/** The last address the page sent the browser to. */
const lastNavigation = (tab: GameTab) => tab.navigations[tab.navigations.length - 1]?.url ?? "";
/** Taps Sign In and waits for the page to leave for the provider: a slow machine can take longer than a fixed wait. */
const tapSignIn = async (tab: GameTab) => {
  tab.tap("signInFromStartBtn");
  expect(await tab.until(() => lastNavigation(tab) !== "", 5_000)).toBe(true);
};
/** The server's session row for this tab's connection says it has entered the world. */
const enteredWorld = (tab: GameTab) => {
  const id = tab.connection()?.connectionId;
  return Boolean(id && tab.world.db.playerSession.connectionId.find(id)?.enteredWorld);
};
/** Calls this tab's connections had refused by the server. */
const refusedCalls = (tab: GameTab) => tab.network.connections.flatMap(connection => connection.fake.calls.filter(call => call.error));
const press = (tab: GameTab, element: HTMLElement) => element.dispatchEvent(new (tab.window as any).Event("click", { bubbles: true }));
/** The player's chat age answer: the slider moved to `age`, then Continue. */
function answerAge(tab: GameTab, age: number) {
  const slider = tab.element("chatAgeSlider") as HTMLInputElement;
  slider.value = String(age);
  slider.dispatchEvent(new (tab.window as any).Event("input"));
  tab.tap("chatAgeContinueBtn");
}

describe("startup and accounts", () => {
  it("BOOT-01 a first visit starts a guest with no taps, asks the Terms once loading is done, and enters only after Play", async () => {
    const world = gameWorld();
    const tab = await bootGame(world);
    let choiceSeen = false;
    let enteredBeforeTerms = false;
    const termsUp = await tab.until(() => {
      choiceSeen ||= tab.shown("accountChoicePanel");
      enteredBeforeTerms ||= enteredWorld(tab);
      return tab.shown("legalContinueBtn") && !disabled(tab, "legalContinueBtn");
    }, 20_000);
    expect(termsUp).toBe(true);
    expect(choiceSeen).toBe(false);
    expect(enteredBeforeTerms).toBe(false);
    // Connected as a guest, nothing agreed or entered yet.
    const guest = tab.connection()!.fake.player;
    expect(world.db.playerLegalConsent.identity.find(guest.identity)).toBeFalsy();
    await tab.play(3_000);
    expect(enteredWorld(tab)).toBe(false);

    tab.tap("legalContinueBtn");
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    expect(enteredWorld(tab)).toBe(true);
    // Agreed to the current Terms with the age not asked yet, and nothing was refused on the way in.
    expect(world.db.playerLegalConsent.identity.find(guest.identity)).toMatchObject({ termsVersion: TERMS_VERSION, ageBand: AGE_BAND_UNVERIFIED });
    expect(refusedCalls(tab)).toEqual([]);

    // Coming back: the same guest, straight in, no Terms.
    const back = await tab.reload();
    let askedAgain = false;
    expect(await back.until(() => { askedAgain ||= back.shown("legalGatePanel"); return back.playing(); }, 20_000)).toBe(true);
    expect(askedAgain).toBe(false);
    expect(back.connection()!.identity.toHexString()).toBe(guest.hex);
  }, 60_000);

  it("BOOT-01 chat asks the age once: 13 or older opens chat, under 13 is kept on the device, never sent, and blocks the game", async () => {
    const world = gameWorld();
    const tab = await bootGame(world);
    await tab.acceptTerms();
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    const guest = tab.connection()!.fake.player;

    tab.tap("chatSizeToggle");
    await tab.play(200);
    expect(tab.shown("chatAgeGate")).toBe(true);
    answerAge(tab, 30);
    await tab.play(1_000);
    expect(tab.shown("chatAgeGate")).toBe(false);
    expect(world.db.playerLegalConsent.identity.find(guest.identity)).toMatchObject({ ageBand: AGE_BAND_ADULT });

    // Another visitor under 13 cannot continue: chat stays shut and the server never hears an age.
    await tab.close();
    const young = await bootGame(world);
    await young.acceptTerms();
    expect(await young.until(young.playing, 20_000)).toBe(true);
    const child = young.connection()!.fake.player;
    young.tap("chatSizeToggle");
    await young.play(200);
    const slider = young.element("chatAgeSlider") as HTMLInputElement;
    slider.value = "12";
    slider.dispatchEvent(new (young.window as any).Event("input"));
    expect(disabled(young, "chatAgeContinueBtn")).toBe(true);
    await young.play(1_000);
    expect(world.db.playerLegalConsent.identity.find(child.identity)).toMatchObject({ ageBand: AGE_BAND_UNVERIFIED });

    // An under-13 answer kept on a device blocks the game there: no Play, nothing sent.
    await young.close();
    const device = memoryStorage();
    device.setItem(storageKeys.legalConsentKey, JSON.stringify({ termsVersion: TERMS_VERSION, ageBand: AGE_BAND_UNDER_13 }));
    const blocked = await bootGame(world, { localStorage: device });
    await blocked.play(5_000);
    expect(blocked.shown("legalGatePanel")).toBe(true);
    expect(blocked.shown("legalContinueBtn")).toBe(false);
    expect(blocked.playing()).toBe(false);
    expect(blocked.network.connections.flatMap(connection => connection.fake.calls.filter(call => call.reducer === "acceptTerms"))).toEqual([]);
  }, 60_000);

  it("BOOT-01 an account that agreed to older Terms is asked again on a new device", async () => {
    const world = gameWorld();
    const auth = await fakeSpacetimeAuth();
    const ann = world.join("old-terms", { kind: "account" });
    ann.disconnect();
    ann.patch("playerLegalConsent", { termsVersion: "2000-01-01" });
    const storage = memoryStorage();
    await auth.rememberSignIn(storage, "old-terms");
    const tab = await bootGame(world, { localStorage: storage, route: auth.route });
    expect(await tab.until(() => tab.shown("legalContinueBtn") && !disabled(tab, "legalContinueBtn"), 20_000)).toBe(true);
    expect(tab.playing()).toBe(false);
    tab.tap("legalContinueBtn");
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    expect(world.db.playerLegalConsent.identity.find(ann.identity)).toMatchObject({ termsVersion: TERMS_VERSION });
  }, 30_000);

  it("BOOT-02 a refused connection offers Retry, and a dropped socket at the Terms still enters; neither reloads the page", async () => {
    const world = gameWorld();
    world.join("Ann").disconnect();
    let refusing = true;
    const tab = await bootGame(world, { name: "Ann", refuse: () => refusing ? new Error("socket refused") : null });
    expect(await tab.until(() => tab.shown("connectionRetryBtn"), 20_000)).toBe(true);
    await tab.play(10_000);
    expect(tab.playing()).toBe(false);
    refusing = false;
    tab.tap("connectionRetryBtn");
    expect(await tab.until(tab.playing, 2_000)).toBe(true);
    expect(tab.navigations).toEqual([]);

    // A new visitor's socket drops while the Terms are up: Play still gets them in once it is back.
    await tab.close();
    const visitor = await bootGame(world);
    expect(await visitor.until(() => visitor.shown("legalContinueBtn") && !disabled(visitor, "legalContinueBtn"), 20_000)).toBe(true);
    // Only a new visitor is offered Sign In beside Play.
    expect(visitor.shown("consentSignInBtn")).toBe(true);
    visitor.connection()!.fake.drop(new Error("network lost"));
    await visitor.play(100);
    visitor.tap("legalContinueBtn");
    expect(await visitor.until(visitor.playing, 30_000)).toBe(true);
    expect(enteredWorld(visitor)).toBe(true);
    expect(visitor.navigations).toEqual([]);
  }, 60_000);

  it("BOOT-03 a returning player with a stored sign-in goes straight into the world, loading game.js once", async () => {
    const world = gameWorld();
    const auth = await fakeSpacetimeAuth();
    world.join("ann-account", { kind: "account" }).disconnect();
    const storage = memoryStorage();
    await auth.rememberSignIn(storage, "ann-account");

    const tab = await bootGame(world, { localStorage: storage, route: auth.route });
    let askedAnything = false;
    const inWorld = await tab.until(() => {
      askedAnything ||= tab.shown("accountChoicePanel") || tab.shown("legalGatePanel");
      return tab.playing();
    }, 20_000);

    expect(inWorld).toBe(true);
    expect(askedAnything).toBe(false);
    expect(tab.connection()!.identity.toHexString()).toBe(world.player("ann-account", "account").hex);
    expect(gameScripts(tab)).toBe(1);
    expect(tab.navigations).toEqual([]);
    await tab.play(2_000);
    expect(gameScripts(tab)).toBe(1);
    // game.js was fetched ahead once, and the art only the game uses was asked for when it took over.
    expect(tab.document.querySelectorAll("#wildstatGamePreload")).toHaveLength(1);
    expect(tab.document.querySelectorAll("img[data-game-src]")).toHaveLength(0);

    // Under Data Saver nothing is fetched ahead; the game still loads once, when it starts.
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    try {
      const saver = await tab.reload();
      expect(await saver.until(saver.playing, 20_000)).toBe(true);
      expect(saver.document.querySelectorAll("#wildstatGamePreload")).toHaveLength(0);
      expect(gameScripts(saver)).toBe(1);
    } finally { delete (navigator as { connection?: unknown }).connection; }
  }, 30_000);

  it("BOOT-04 an expired or refused sign-in asks for one Sign In beside Play as Guest; a cancelled sign-in gives the choice back", async () => {
    const world = gameWorld();
    const auth = await fakeSpacetimeAuth();
    world.join("bo-account", { kind: "account" }).disconnect();

    // Expired with nothing to renew it, or a renewal the provider refuses: Sign In beside Play as Guest, never a trip.
    const expired = memoryStorage();
    await auth.rememberSignIn(expired, "bo-account", { issuedAtMs: Date.now() - 2 * 3_600_000, lifetimeSeconds: 3_600, refresh: false });
    const refused = memoryStorage();
    await auth.rememberSignIn(refused, "bo-account", { issuedAtMs: Date.now() - 2 * 3_600_000, lifetimeSeconds: 3_600 });
    refused.setItem(`${storageKeys.accountTokenKey}:refresh`, JSON.stringify({ subject: "bo-account", token: "revoked", savedAt: Date.now() }));
    for (const storage of [expired, refused]) {
      const tab = await bootGame(world, { localStorage: storage, route: auth.route });
      expect(await tab.until(() => tab.shown("signInFromStartBtn") && tab.shown("continueGuestBtn"), 10_000)).toBe(true);
      await tab.play(2_000);
      expect(tab.playing()).toBe(false);
      expect(tab.navigations).toEqual([]);
      await tab.close();
    }

    // Signed out earlier: while the player chooses, and while Sign In leaves, game.js is not asked for.
    const signedOut = memoryStorage();
    signedOut.setItem(storageKeys.knownAccountKey, "true");
    let tab = await bootGame(world, { localStorage: signedOut, route: auth.route });
    expect(await tab.until(() => tab.shown("signInFromStartBtn") && !disabled(tab, "signInFromStartBtn"), 10_000)).toBe(true);
    await tab.play(2_000);
    expect(gameScripts(tab)).toBe(0);
    await tapSignIn(tab);
    expect(lastNavigation(tab)).toMatch(/^https:\/\/auth\.spacetimedb\.com\/oidc\/auth\?/);
    expect(disabled(tab, "signInFromStartBtn")).toBe(true);
    expect(disabled(tab, "continueGuestBtn")).toBe(true);
    expect(gameScripts(tab)).toBe(0);

    // Back from the provider's page: both choices work again.
    returnFromAnotherSite(tab);
    await tab.play(500);
    expect(tab.shown("accountChoicePanel")).toBe(true);
    expect(disabled(tab, "signInFromStartBtn")).toBe(false);
    expect(disabled(tab, "continueGuestBtn")).toBe(false);

    // The provider sends the player back cancelled: the choice again, the address cleaned.
    await tapSignIn(tab);
    tab = await tab.reload({ url: auth.cancelled(lastNavigation(tab)) });
    expect(await tab.until(() => tab.shown("signInFromStartBtn") && !disabled(tab, "signInFromStartBtn"), 10_000)).toBe(true);
    expect(tab.location.search).toBe("");
    expect(tab.playing()).toBe(false);

    // Play as Guest: a guest character, not the account.
    tab.tap("continueGuestBtn");
    await tab.acceptTerms();
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    expect(tab.connection()!.identity.toHexString()).not.toBe(world.player("bo-account", "account").hex);

    // Beside a remembered character, Use Another Account ends the provider's session and then asks for a login.
    await tab.close();
    const remembered = memoryStorage();
    await auth.rememberSignIn(remembered, "bo-account", { issuedAtMs: Date.now() - 2 * 3_600_000, lifetimeSeconds: 3_600, refresh: false });
    remembered.setItem(storageKeys.knownAccountCharacterKey, "Bo");
    let other = await bootGame(world, { localStorage: remembered, route: auth.route });
    expect(await other.until(() => other.shown("useAnotherAccountBtn") && !disabled(other, "useAnotherAccountBtn"), 10_000)).toBe(true);
    other.tap("useAnotherAccountBtn");
    await other.play(500);
    expect(lastNavigation(other)).toMatch(/^https:\/\/auth\.spacetimedb\.com\/oidc\/session\/end\?/);
    expect(other.localStorage.getItem(storageKeys.accountTokenKey)).toBeNull();
    other = await other.reload({ url: "https://wildstatmmo.com/" });
    await other.play(1_000);
    const login = new URL(lastNavigation(other));
    expect(`${login.origin}${login.pathname}`).toBe("https://auth.spacetimedb.com/oidc/auth");
    expect(login.searchParams.get("prompt")).toBe("login");
    expect(other.playing()).toBe(false);
  }, 60_000);

  it("BOOT-05 an OAuth return shows verifying, is accepted once and loads the game once", async () => {
    const world = gameWorld();
    const auth = await fakeSpacetimeAuth();
    world.join("cy-account", { kind: "account" }).disconnect();
    // Signed out earlier: the browser knows an account but holds no sign-in.
    const storage = memoryStorage();
    storage.setItem(storageKeys.knownAccountKey, "true");
    let tab = await bootGame(world, { localStorage: storage, route: auth.route });
    expect(await tab.until(() => tab.shown("signInFromStartBtn") && !disabled(tab, "signInFromStartBtn"), 10_000)).toBe(true);
    await tapSignIn(tab);

    // The provider is slow to confirm the code: the page waits on loading, game.js not yet asked for.
    auth.holdExchanges();
    tab = await tab.reload({ url: auth.signInAs(lastNavigation(tab), "cy-account") });
    await tab.play(1_000);
    expect(tab.shown("connectionPanel")).toBe(true);
    expect(tab.shown("accountChoicePanel")).toBe(false);
    expect(tab.playing()).toBe(false);

    auth.answerExchanges();
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    expect(tab.connection()!.identity.toHexString()).toBe(world.player("cy-account", "account").hex);
    expect(auth.requests.filter(request => request.startsWith("exchange"))).toHaveLength(1);
    expect(gameScripts(tab)).toBe(1);
    expect(tab.location.search).toBe("");

    // The next visit needs no trip: the sign-in was kept.
    const next = await tab.reload();
    expect(await next.until(next.playing, 20_000)).toBe(true);
    expect(next.navigations).toEqual([]);
    expect(next.connection()!.identity.toHexString()).toBe(world.player("cy-account", "account").hex);
  }, 60_000);

  it("BOOT-05 a code the provider refuses leaves the player on the choice, not in a game", async () => {
    const world = gameWorld();
    const auth = await fakeSpacetimeAuth();
    const storage = memoryStorage();
    storage.setItem(storageKeys.knownAccountKey, "true");
    let tab = await bootGame(world, { localStorage: storage, route: auth.route });
    expect(await tab.until(() => tab.shown("signInFromStartBtn") && !disabled(tab, "signInFromStartBtn"), 10_000)).toBe(true);
    await tapSignIn(tab);

    auth.refuseCodeExchange("invalid_grant");
    tab = await tab.reload({ url: auth.signInAs(lastNavigation(tab), "dee-account") });
    expect(await tab.until(() => tab.shown("signInFromStartBtn") && !disabled(tab, "signInFromStartBtn"), 10_000)).toBe(true);
    expect(tab.shown("continueGuestBtn")).toBe(true);
    expect(tab.playing()).toBe(false);
    expect(tab.localStorage.getItem(storageKeys.accountTokenKey)).toBeNull();
  }, 30_000);

  it("BOOT-06 the start screen: the install offer is used once, release notes open from the version, and music muted there stays muted in the game", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    ann.call("setAudioSettings", { musicVolume: 0.6, sfxVolume: 0.5 });
    ann.disconnect();

    // A signed-out browser waits on the account choice, with the game not yet loaded.
    const signedOut = memoryStorage();
    signedOut.setItem(storageKeys.knownAccountKey, "true");
    const choice = await bootGame(world, { localStorage: signedOut });
    expect(await choice.until(() => choice.shown("signInFromStartBtn") && !disabled(choice, "signInFromStartBtn"), 10_000)).toBe(true);

    // The browser offers installation: one tap uses it, then the offer is gone.
    expect(choice.shown("installAppBtn")).toBe(false);
    let prompts = 0;
    const offer = Object.assign(new (choice.window as any).Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => { prompts++; return { outcome: "accepted" }; } });
    choice.window.dispatchEvent(offer);
    expect(choice.shown("installAppBtn")).toBe(true);
    choice.tap("installAppBtn");
    await choice.play(100);
    expect(prompts).toBe(1);
    expect(choice.shown("installAppBtn")).toBe(false);
    choice.window.dispatchEvent(new (choice.window as any).Event("appinstalled"));
    expect(choice.shown("installAppHint")).toBe(false);

    // The version opens and closes the release notes; starting a sign-in closes them.
    expect(choice.shown("updateNotice")).toBe(false);
    choice.tap("signinVersion");
    expect(choice.shown("updateNotice")).toBe(true);
    choice.tap("signinVersion");
    expect(choice.shown("updateNotice")).toBe(false);
    choice.tap("signinVersion");
    choice.tap("signInFromStartBtn");
    await choice.play(200);
    expect(choice.shown("updateNotice")).toBe(false);
    await choice.close();

    // On an iPhone, where browsers cannot prompt, the button explains Add to Home Screen instead.
    const phone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
    for (const [name, value] of Object.entries(phone)) Object.defineProperty(navigator, name, { configurable: true, value });
    try {
      const iphone = await bootGame(world, { localStorage: signedOut });
      expect(await iphone.until(() => iphone.shown("installAppBtn"), 10_000)).toBe(true);
      expect(iphone.shown("installAppHint")).toBe(false);
      iphone.tap("installAppBtn");
      expect(iphone.shown("installAppHint")).toBe(true);
      await iphone.close();
    } finally { for (const name of Object.keys(phone)) delete (navigator as unknown as Record<string, unknown>)[name]; }

    // Muted on the start screen before the game loads: still muted in the game, and the account learns it.
    const tab = await bootGame(world, { name: "Ann" });
    tab.tap("signInMuteButton");
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    await tab.play(3_000);
    expect(Number((tab.element("musicVolume") as HTMLInputElement).value)).toBe(0);
    expect(world.db.playerAudioSetting.identity.find(ann.identity)).toMatchObject({ musicVolume: 0, sfxVolume: 0.5 });
  }, 60_000);

  it("BOOT-07 a guest who registers keeps one save on the account: unlocks, look, gold and finished lessons, paid once", async () => {
    const world = gameWorld();
    const auth = await fakeSpacetimeAuth();
    const ann = world.join("Ann");
    ann.patch("playerProfile", { skinTone: 17 });
    world.setup(ctx => ctx.db.playerGold.insert({ identity: ann.identity, gold: 500n }));
    ann.disconnect();
    const guestSave = ann.progress()!;
    ann.patch("playerProgress", { crystalHollowsUnlocked: true });

    let tab = await playAs(world, "Ann", { route: auth.route });
    tab.tap("settingsBtn");
    tab.tap("settings-account-tab");
    tab.tap("accountButton");
    expect(await tab.until(() => lastNavigation(tab).startsWith("https://auth.spacetimedb.com/oidc/auth"), 10_000)).toBe(true);
    expect(world.db.accountLink.iter().next().value).toBeTruthy();

    tab = await tab.reload({ url: auth.signInAs(lastNavigation(tab), "ann-account") });
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    await tab.play(2_000);
    const account = world.player("ann-account", "account");
    expect(tab.connection()!.identity.toHexString()).toBe(account.hex);

    // One save, on the account; the guest's is gone, as is the one-time link.
    expect(ann.progress()).toBeNull();
    expect(account.progress()).toMatchObject({ crystalHollowsUnlocked: true, damage: guestSave.damage, maxHp: guestSave.maxHp });
    expect(world.db.accountLink.iter().next().value).toBeFalsy();
    expect(world.db.playerProfile.identity.find(account.identity)).toMatchObject({ skinTone: 17 });
    expect(world.db.playerGold.identity.find(account.identity)?.gold).toBe(500n);
    expect(world.db.playerGold.identity.find(ann.identity)).toBeFalsy();
    // The finished tutorial stays finished: no lessons on screen.
    expect(world.db.playerOnboarding.identity.find(account.identity)?.step).toBe(6);
    expect(tab.document.querySelector(".onboarding-tutorial")).toBeNull();

    // Reloading as the account changes nothing and pays nothing again.
    const again = await tab.reload();
    expect(await again.until(again.playing, 20_000)).toBe(true);
    expect(world.db.playerGold.identity.find(account.identity)?.gold).toBe(500n);
  }, 60_000);

  it("BOOT-08 a new login on an email that already has a played character warns which one; a sign-in that loads someone else says so", async () => {
    const world = gameWorld();
    const auth = await fakeSpacetimeAuth();
    const vis = world.join("vis-account", { kind: "account" });
    vis.patch("playerProfile", { displayName: "Vis" });
    vis.disconnect();
    const fresh = world.join("fresh-account", { kind: "account" });
    fresh.disconnect();
    // Both logins came back from the provider with the same verified address; only Vis has played.
    world.setup(ctx => {
      for (const who of [vis, fresh]) ctx.db.accountEmail.insert({ identity: who.identity, email: "same@example.com", emailVerified: true, loginId: who.name, named: false, seenAt: ctx.timestamp });
      ctx.db.analyticsPlayer.identity.update({ ...ctx.db.analyticsPlayer.identity.find(vis.identity), firstKillDayKey: "20716" });
    });
    expect(vis.procedure("getOtherCharacterForLogin")).toBe("");

    const storage = memoryStorage();
    await auth.rememberSignIn(storage, "fresh-account");
    let tab = await bootGame(world, { localStorage: storage, route: auth.route });
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    expect(await tab.until(() => tab.shown("duplicateLoginWarning"), 10_000)).toBe(true);
    // Keeping this character closes the warning for good.
    await tab.play(1_500);
    press(tab, tab.element("duplicateLoginWarning").querySelector(".duplicate-login-keep") as HTMLElement);
    expect(tab.shown("duplicateLoginWarning")).toBe(false);
    tab = await tab.reload();
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    await tab.play(5_000);
    expect(tab.shown("duplicateLoginWarning")).toBe(false);
    // Nothing is named once the new character has played, or when its address is not verified.
    expect(fresh.procedure("getOtherCharacterForLogin")).toBe("Vis");
    world.setup(ctx => ctx.db.accountEmail.identity.update({ ...ctx.db.accountEmail.identity.find(fresh.identity), emailVerified: false }));
    expect(fresh.procedure("getOtherCharacterForLogin")).toBe("");
    world.setup(ctx => ctx.db.accountEmail.identity.update({ ...ctx.db.accountEmail.identity.find(fresh.identity), emailVerified: true }));
    world.setup(ctx => ctx.db.analyticsPlayer.identity.update({ ...ctx.db.analyticsPlayer.identity.find(fresh.identity), firstKillDayKey: "20725" }));
    expect(fresh.procedure("getOtherCharacterForLogin")).toBe("");

    // Signed out, the player taps Sign In for Bo but the provider's open session is Cy's: the game says whose it loaded.
    await tab.close();
    world.join("cy-account", { kind: "account" }).disconnect();
    const remembered = memoryStorage();
    remembered.setItem(storageKeys.knownAccountKey, "true");
    remembered.setItem(storageKeys.knownAccountCharacterKey, "Bo");
    let other = await bootGame(world, { localStorage: remembered, route: auth.route });
    expect(await other.until(() => other.shown("signInFromStartBtn") && !disabled(other, "signInFromStartBtn"), 10_000)).toBe(true);
    await tapSignIn(other);
    other = await other.reload({ url: auth.signInAs(lastNavigation(other), "cy-account") });
    expect(await other.until(other.playing, 20_000)).toBe(true);
    expect(await other.until(() => other.shown("signedInAsNotice"), 10_000)).toBe(true);
    const [, keep] = [...other.element("signedInAsNotice").querySelectorAll("button")] as HTMLElement[];
    press(other, keep);
    await other.play(2_000);
    expect(other.shown("signedInAsNotice")).toBe(false);
  }, 60_000);
});
