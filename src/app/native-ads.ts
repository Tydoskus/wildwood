export const REGULAR_ENEMY_RESPAWN_AD_PLACEMENT = "regular_enemy_respawn_2x" as const;
export const NATIVE_REWARDED_ADS_CHANGED_EVENT = "wildstat:native-rewarded-ads-changed";
// Existing native wrappers can keep sending the previous event until they update.
export const NATIVE_REWARDED_ADS_CHANGED_EVENTS = [
  NATIVE_REWARDED_ADS_CHANGED_EVENT,
  "wildwood:native-rewarded-ads-changed",
] as const;

export type NativeAppPlatform = "ios" | "android";
export type RewardedAdPlacement = typeof REGULAR_ENEMY_RESPAWN_AD_PLACEMENT;
export type RewardedAdResult = { rewarded: boolean };

export type WildstatNativeBridge = {
  platform: NativeAppPlatform;
  rewardedAds: {
    isReady?: (placement: RewardedAdPlacement) => boolean | Promise<boolean>;
    show: (placement: RewardedAdPlacement) => Promise<RewardedAdResult>;
  };
};

/** Ignore partial or browser-spoofed bridge-shaped values instead of crashing the HUD. */
export function supportedNativeBridge(value: unknown): WildstatNativeBridge | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WildstatNativeBridge>;
  if (candidate.platform !== "ios" && candidate.platform !== "android") return null;
  if (!candidate.rewardedAds || typeof candidate.rewardedAds.show !== "function") return null;
  if (candidate.rewardedAds.isReady !== undefined && typeof candidate.rewardedAds.isReady !== "function") return null;
  return candidate as WildstatNativeBridge;
}

export function rewardedAdWasEarned(value: unknown): value is RewardedAdResult {
  return Boolean(value && typeof value === "object" && (value as RewardedAdResult).rewarded === true);
}

export function nativeBridgeForRuntime(runtime: { wildstatNative?: unknown; wildwoodNative?: unknown }) {
  return supportedNativeBridge(runtime.wildstatNative) ?? supportedNativeBridge(runtime.wildwoodNative);
}
