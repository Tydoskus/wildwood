export const GAME_VERSION = "0.782";
export const ATTACK_RANGE_VISIBLE_KEY = "wildwood-attack-range-visible-v1";
export const SCREEN_SHAKE_ENABLED_KEY = "wildwood-screen-shake-enabled-v1";
export const LOW_PERFORMANCE_MODE_KEY = "wildwood-low-performance-mode-v1";
export const FPS_VISIBLE_KEY = "wildwood-fps-visible-v1";
export const LATENCY_VISIBLE_KEY = "wildwood-latency-visible-v1";
export const BOSS_HITBOX_VISIBLE_KEY = "wildwood-boss-hitbox-visible-v1";
export const MUSIC_VOLUME_KEY = "wildwood-music-volume-v1";
export const SFX_VOLUME_KEY = "wildwood-sfx-volume-v1";
/**
 * The reward became a bank the player spends, so the stored shape changed from
 * an expiry instant to remaining milliseconds plus the switch position. A new
 * key lets an old countdown lapse instead of reading as a full bank.
 */
export const REWARDED_RESPAWN_BOOST_BANK_KEY = "wildwood-rewarded-respawn-boost-bank-v1";

export type StoredRespawnBoostBank = { remainingMs: number; enabled: boolean };

/** A missing, unreadable or malformed bank reads as no bank, never as a full one. */
export function readRespawnBoostBank(): Partial<StoredRespawnBoostBank> {
  try {
    const stored = localStorage.getItem(REWARDED_RESPAWN_BOOST_BANK_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<StoredRespawnBoostBank>;
      return { remainingMs: Number(parsed?.remainingMs), enabled: Boolean(parsed?.enabled) };
    }
  } catch {}
  return {};
}

export function writeRespawnBoostBank(bank: StoredRespawnBoostBank) {
  try {
    if (bank.remainingMs > 0) localStorage.setItem(REWARDED_RESPAWN_BOOST_BANK_KEY, JSON.stringify(bank));
    else localStorage.removeItem(REWARDED_RESPAWN_BOOST_BANK_KEY);
  } catch {}
}
export const DRAGON_PORTAL_CUTSCENE_SEEN_KEY = "wildwood-dragon-portal-cutscene-v2";
export const SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY = "wildwood-snowlands-portal-cutscene-v1";
export const LAVA_PORTAL_CUTSCENE_SEEN_KEY = "wildwood-lava-portal-cutscene-v1";
export const INFERNAL_PORTAL_CUTSCENE_SEEN_KEY = "wildwood-infernal-portal-cutscene-v1";
export const WATER_PORTAL_CUTSCENE_SEEN_KEY = "wildwood-water-portal-cutscene-v1";
export const SAMURAI_PORTAL_CUTSCENE_SEEN_KEY = "wildwood-samurai-portal-cutscene-v1";
// Pixel-aligned height keeps floating HP text centered and crisp.
/**
 * Eleven, with softened corners rather than fully rounded ends. A pill is a
 * much heavier shape than the rectangle it replaced, which is why 16 read as
 * about twice the old bar despite being only three pixels taller.
 */
export const WORLD_HEALTH_BAR_HEIGHT = 11;
/** Softened, not pilled: a fraction of the height rather than half of it. */
export const WORLD_HEALTH_BAR_RADIUS = 3.5;
export const ENEMY_TEXT_CULL_MIN_DISTANCE = 600;
