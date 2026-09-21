export type AvatarFrame = "none" | "silver" | "gold" | "diamond";
export type AvatarFrameState = { identity: string; tier: AvatarFrame; frame: AvatarFrame; validUntilMs: number };
export type PatreonStatus = { configured: boolean; linked: boolean; tier: AvatarFrame; frame: AvatarFrame; validUntilMs: number; preview?: boolean };
/** Each tier has its own artwork; silver is no longer gold under a filter. */
export const AVATAR_FRAME_ASSETS = {
  silver: "assets/wildstat/avatar-frames/patreon_silver.webp",
  gold: "assets/wildstat/avatar-frames/patreon_gold.webp",
  diamond: "assets/wildstat/avatar-frames/patreon_diamond.webp",
} as const;
export function avatarFrameAsset(frame: AvatarFrame) {
  return frame === "none" ? "" : AVATAR_FRAME_ASSETS[frame];
}
export const PATREON_PAGE = "https://www.patreon.com/c/wildstat/membership";
/**
 * Tiers are a ladder: a supporter may wear their own frame or any below it, so
 * a diamond member can still choose gold, and everyone may choose none.
 * Diamond is wired through but stays locked until patreon_config names its tier id.
 */
export const AVATAR_FRAME_RANK = { none: 0, silver: 1, gold: 2, diamond: 3 } as const;
export const AVATAR_FRAME_ORDER = ["none", "silver", "gold", "diamond"] as const;
/**
 * What the picker shows. Diamond is wired through the tier ladder, the assets
 * and the Patreon config, but is not sold yet, so it stays out of the list
 * until its tier id is configured. Add it here to offer it.
 */
export const AVATAR_FRAME_OFFERED = ["none", "silver", "gold"] as const;
export function isAvatarFrame(value: string): value is AvatarFrame {
  return Object.prototype.hasOwnProperty.call(AVATAR_FRAME_RANK, value);
}
export function allowedAvatarFrame(tier: AvatarFrame, frame: string): frame is AvatarFrame {
  return isAvatarFrame(frame) && AVATAR_FRAME_RANK[frame] <= AVATAR_FRAME_RANK[tier];
}
