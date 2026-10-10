import { armorDamageReduction } from "../../../shared/combat";
import { soulEnemyStats, SOUL_SECONDS_TO_KILL, type SoulStrength } from "../../../shared/soul-dimension";
import { ENEMY_TYPES } from "../enemies";
import { SOUL_DEFENSE_FORCE_KIND } from "../soul-world";
import type { SpawnSite } from "../world";
import type { EnemyState, PlayerState } from "./types";

/**
 * The Soul Defense Force: an easter egg, after the Witcher's Bovine Defense
 * Force. Every thousand soul enemies a player kills, a giant Angry Evilmass comes
 * for them in the Soul Dimension, drawn at an Endless boss's size. It chases, glows, and charges in a straight
 * line; three charges kill. Built from the player's own strength like every
 * soul enemy, so it is as hard at any power. Beating it pays nothing, and its
 * kill never reaches the server (onEnemyDefeated stops it before the report).
 * Killing the player sends them back to the Town.
 *
 * The count is this device's, kept per character.
 */
export const SOUL_DEFENSE_FORCE_KILLS = 1000;
export const SOUL_DEFENSE_FORCE_NAME = "Soul Defense Force";

const KEY = "wildstat:soul-defense-force:v1";
/** Its own site id: -1 is the generated bosses', and a respawn timer kept for that id refused the spawn. */
const SITE_ID = -7_000;
/** Seconds of the player's own damage it takes to bring down; a soul enemy takes SOUL_SECONDS_TO_KILL. */
const SECONDS_TO_KILL = 45;
const TOUCH_DAMAGE_MULTIPLIER = 3;
/** A charge that lands takes this share of the player's health, after their armor. */
const CHARGE_HEALTH_SHARE = .35;
const CHASE_SPEED = 150;
const CHARGE_EVERY = 4;
const WINDUP_SECONDS = .8;
const DASH_SECONDS = .4;
const DASH_SPEED = 1_100;
/** A death this close to it, while it stands, is its doing. */
const BLAME_DISTANCE = 450;
/** The server learns of the respawn a moment after the client; until then it refuses the trip. */
const TOWN_TRIP_ATTEMPTS = 5;
/** After the Town fades in, the defeat line stays this long: shown before the trip, the fade hid it. */
const ARRIVAL_SETTLE_MS = 700;
const DEFEAT_MESSAGE_SECONDS = 4;

type Phase = "chase" | "windup" | "dash";

export function createSoulDefenseForce(deps: {
  identity: () => string | undefined;
  player: PlayerState;
  enemies: EnemyState[];
  strength: () => SoulStrength;
  spawnFromSite: (site: SpawnSite) => void;
  damagePlayer?: (damage: number, source: EnemyState) => void;
  message?: (text: string, color: string, seconds?: number) => void;
  burst?: (x: number, y: number, color: string, count: number, speed: number) => void;
  storage?: () => Pick<Storage, "getItem" | "setItem"> | undefined;
  /** The Town trip; false while the server still has the player down, so it is tried again. */
  sendToTown?: () => Promise<boolean>;
  wait?: (ms: number) => Promise<void>;
}) {
  const storage = () => { try { return deps.storage ? deps.storage() : localStorage; } catch { return undefined; } };
  const key = () => `${KEY}:${deps.identity() ?? ""}`;
  const read = () => { try { return Math.max(0, Math.floor(Number(storage()?.getItem(key()) ?? 0)) || 0); } catch { return 0; } };
  const write = (count: number) => { try { storage()?.setItem(key(), String(count)); } catch { /* Counted for this session. */ } };
  let boss: EnemyState | null = null;
  let phase: Phase = "chase", clock = 0, glow = 0, landed = false;
  let direction = { x: 0, y: 0 };
  let sendHome = false;

  function spawn() {
    const { player } = deps;
    const soul = soulEnemyStats(deps.strength());
    const angle = Math.random() * Math.PI * 2;
    const before = deps.enemies.length;
    deps.spawnFromSite({
      id: SITE_ID, type: SOUL_DEFENSE_FORCE_KIND, campName: SOUL_DEFENSE_FORCE_NAME,
      x: player.x + Math.cos(angle) * 520, y: player.y + Math.sin(angle) * 520,
      leashRange: 1e9, alive: false, respawnAt: 0,
      definition: {
        ...ENEMY_TYPES[SOUL_DEFENSE_FORCE_KIND],
        hp: soul.hp * SECONDS_TO_KILL / SOUL_SECONDS_TO_KILL,
        damage: soul.damage * TOUCH_DAMAGE_MULTIPLIER,
        attackSpeed: soul.attackSpeed,
        speed: CHASE_SPEED, r: 70, elite: true,
        reward: { type: "damage", amount: 0 },
      },
    });
    // A refused spawn adds nothing, and the last enemy is then a soul enemy: taking it
    // for the boss announced the boss, and killing that enemy "defeated" it.
    if (deps.enemies.length === before) return;
    boss = deps.enemies[deps.enemies.length - 1];
    boss.displayName = SOUL_DEFENSE_FORCE_NAME;
    boss.spriteScale = 2.4;
    boss.engaged = true;
    boss.aggroRadius = 1e9;
    phase = "chase"; clock = CHARGE_EVERY; landed = false;
    deps.message?.(`The ${SOUL_DEFENSE_FORCE_NAME} has noticed you`, "#ff6b6b");
  }

  function chargeDamage() {
    const { maxHp, armor } = deps.strength();
    const reduction = Math.min(.999, armorDamageReduction(Number.isFinite(armor) && armor > 0 ? armor : 0));
    return (Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 100) * CHARGE_HEALTH_SHARE / (1 - reduction);
  }

  return {
    /** One soul enemy down: counted toward the next visit. */
    countKill() { write(read() + 1); },
    count: read,
    update(dt: number, onSoulMap: boolean) {
      // A refilled or left map drops it; the count stands, so it comes back.
      if (boss && (boss.dead || !deps.enemies.includes(boss))) boss = null;
      if (!onSoulMap) { if (boss) boss.dead = true; boss = null; return; }
      const { player } = deps;
      if (!boss && read() >= SOUL_DEFENSE_FORCE_KILLS && player.hp > 0) spawn();
      if (!boss) return;
      boss.engaged = true;
      clock -= dt;
      if (phase === "chase") {
        boss.speed = CHASE_SPEED;
        if (clock <= 0) { phase = "windup"; clock = WINDUP_SECONDS; boss.speed = 0; }
      } else if (phase === "windup") {
        boss.speed = 0;
        glow -= dt;
        if (glow <= 0) { glow = .12; deps.burst?.(boss.x, boss.y, "#ff3b3b", 6, 70); }
        if (clock <= 0) {
          const dx = player.x - boss.x, dy = player.y - boss.y, length = Math.hypot(dx, dy) || 1;
          direction = { x: dx / length, y: dy / length };
          phase = "dash"; clock = DASH_SECONDS; landed = false;
        }
      } else {
        boss.speed = 0;
        boss.x += direction.x * DASH_SPEED * dt;
        boss.y += direction.y * DASH_SPEED * dt;
        boss.facingX = direction.x < 0 ? -1 : 1;
        deps.burst?.(boss.x, boss.y, "#ff9b9b", 2, 40);
        if (!landed && player.hp > 0 && Math.hypot(player.x - boss.x, player.y - boss.y) < boss.r + player.r) {
          landed = true;
          deps.damagePlayer?.(chargeDamage(), boss);
        }
        if (clock <= 0) { phase = "chase"; clock = CHARGE_EVERY; }
      }
    },
    /** Its kill: nothing paid or reported, and the count starts over. True when it was this boss. */
    defeated(enemy: EnemyState) {
      if (!boss || enemy !== boss) return false;
      boss = null;
      write(0);
      deps.message?.(`You defeated the ${SOUL_DEFENSE_FORCE_NAME}!`, "#ffd869");
      return true;
    },
    /** The player died: if it was the boss's doing, it leaves, the count starts over, and the respawn is in the Town. */
    playerDied() {
      if (!boss || boss.dead || Math.hypot(deps.player.x - boss.x, deps.player.y - boss.y) > BLAME_DISTANCE) return false;
      boss.dead = true;
      boss = null;
      write(0);
      sendHome = true;
      return true;
    },
    /** After a death to it, once: takes the respawned player to the Town, then says why once they are there. */
    async afterRespawn() {
      if (!sendHome) return false;
      sendHome = false;
      const wait = deps.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
      const say = () => deps.message?.(`The ${SOUL_DEFENSE_FORCE_NAME} defeated you`, "#ff6b6b", DEFEAT_MESSAGE_SECONDS);
      for (let attempt = 0; attempt < TOWN_TRIP_ATTEMPTS; attempt++) {
        if (await deps.sendToTown?.()) { await wait(ARRIVAL_SETTLE_MS); say(); return true; }
        await wait(1_000);
      }
      say();
      return false;
    },
    active: () => Boolean(boss && !boss.dead),
  };
}
