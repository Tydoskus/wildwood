import { describe, expect, it } from "vitest";
import { rewardedAdWasEarned, supportedNativeBridge } from "./native-ads";

describe("native rewarded ad contract", () => {
  it("accepts iOS and Android bridges with a rewarded-ad show method", () => {
    const show = async () => ({ rewarded: true });

    expect(supportedNativeBridge({ platform: "ios", rewardedAds: { show } })?.platform).toBe("ios");
    expect(supportedNativeBridge({ platform: "android", rewardedAds: { show } })?.platform).toBe("android");
  });

  it("rejects browsers, unsupported platforms, and partial bridges", () => {
    expect(supportedNativeBridge(undefined)).toBeNull();
    expect(supportedNativeBridge({ platform: "browser", rewardedAds: { show() {} } })).toBeNull();
    expect(supportedNativeBridge({ platform: "ios", rewardedAds: {} })).toBeNull();
    expect(supportedNativeBridge({ platform: "ios", rewardedAds: { show() {}, isReady: true } })).toBeNull();
  });

  it("grants only an explicit rewarded result", () => {
    expect(rewardedAdWasEarned({ rewarded: true })).toBe(true);
    expect(rewardedAdWasEarned({ rewarded: false })).toBe(false);
    expect(rewardedAdWasEarned(true)).toBe(false);
    expect(rewardedAdWasEarned(null)).toBe(false);
  });
});
