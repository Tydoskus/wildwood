import { ENEMY_TYPES } from "./enemy-definitions";
import { regularEnemySeededUnit } from "./regular-enemy-simulation";

/** Limits shared by the autofarm puppet reducer and the client that sends it (spacetimedb/src/autofarm-puppet.ts). */
export const AUTO_FARM_PUPPET_GROUP_MAX = 32;
export const AUTO_FARM_PUPPET_CAMP_MAX = 64;
/** The server ignores the same plan resent sooner than this. */
export const AUTO_FARM_PUPPET_MIN_RESEND_MICROS = 5_000_000n;
/** How often a farmer re-anchors their puppet, riding on the solo movement checkpoint. */
export const AUTO_FARM_PUPPET_REANCHOR_MS = 30_000;
/** Puppets drawn at once, nearest first; past this a farmer is a minimap dot. */
export const AUTO_FARM_PUPPET_DRAW_LIMIT = 40;

/**
 * An autofarming player as other players see them: played locally from one
 * row, not streamed. From the anchor it walks to one of the nearest camps of
 * the farmed group, stands within reach fighting a while, and moves on. Every
 * choice comes from the seed, so every viewer plays the same puppet. Close
 * enough, not exact: the real route follows the farmer's own kills, which no
 * one else sees, and a puppet walks straight, around nothing. The anchor is
 * renewed about every 30 seconds, which puts it back on their trail.
 */
export type PuppetSite = { x: number; y: number; type: string; campName: string; definition?: { reward: { type: string } } };
export type PuppetPlan = {
  /** Stable per farmer and anchor: their identity and anchor time. */
  seed: string;
  anchorX: number;
  anchorY: number;
  startedAtMs: number;
  speed: number;
};
export type PuppetLeg = { fromX: number; fromY: number; x: number; y: number; walk: number; fight: number; facing: number };
export type PuppetPose = { x: number; y: number; facing: number; moving: boolean };

/** How many of the nearest camps a leg chooses among, so puppets on one camp spread. */
const NEAREST_CHOICES = 3;
/** A fight at a camp lasts this long, plus up to the spread. */
const FIGHT_SECONDS = 1.6;
const FIGHT_SPREAD_SECONDS = 2.8;
/** How far from a camp's enemy a puppet stands, before the spread: about a bow's reach. */
const REACH = 95;
const REACH_SPREAD = 70;
/** Legs planned per anchor; past them the puppet stands where it got to until the next. */
const MAX_LEGS = 48;

const unit = (seed: string, leg: number, salt: string) => regularEnemySeededUnit("autofarm-puppet", seed, leg, salt);

/** The camps a plan farms: its group's sites, narrowed to its camp when one is chosen and present. */
export function puppetSites<T extends PuppetSite>(sites: readonly T[], group: string, camp: string): T[] {
  const inGroup = sites.filter(site => group.startsWith("stat:")
    ? `stat:${(site.definition ?? ENEMY_TYPES[site.type as keyof typeof ENEMY_TYPES])?.reward.type}` === group
    : site.type === group);
  const inCamp = camp ? inGroup.filter(site => site.campName === camp) : [];
  return inCamp.length ? inCamp : inGroup;
}

/** The route a plan walks: built once per anchor, then read by time. */
export function puppetLegs(plan: PuppetPlan, sites: readonly PuppetSite[]): PuppetLeg[] {
  const legs: PuppetLeg[] = [];
  if (!sites.length || !(plan.speed > 0)) return legs;
  let x = plan.anchorX, y = plan.anchorY;
  let last: PuppetSite | null = null;
  for (let leg = 0; leg < MAX_LEGS; leg += 1) {
    const choices = sites.filter(site => site !== last)
      .map(site => ({ site, distance: Math.hypot(site.x - x, site.y - y) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, NEAREST_CHOICES);
    if (!choices.length) break;
    const site = choices[Math.floor(unit(plan.seed, leg, "site") * choices.length)].site;
    // Stand off the site toward where the puppet came from, at reach.
    const reach = REACH + unit(plan.seed, leg, "reach") * REACH_SPREAD;
    const away = Math.atan2(y - site.y, x - site.x) + (unit(plan.seed, leg, "angle") - .5) * .9;
    const tx = site.x + Math.cos(away) * reach, ty = site.y + Math.sin(away) * reach;
    legs.push({ fromX: x, fromY: y, x: tx, y: ty, walk: Math.hypot(tx - x, ty - y) / plan.speed,
      fight: FIGHT_SECONDS + unit(plan.seed, leg, "fight") * FIGHT_SPREAD_SECONDS, facing: site.x < tx ? Math.PI : 0 });
    x = tx; y = ty;
    last = site;
  }
  return legs;
}

export function puppetPoseAt(plan: PuppetPlan, legs: readonly PuppetLeg[], nowMs: number): PuppetPose {
  let t = Math.max(0, (nowMs - plan.startedAtMs) / 1_000);
  for (const leg of legs) {
    if (t < leg.walk) {
      const f = t / leg.walk;
      return { x: leg.fromX + (leg.x - leg.fromX) * f, y: leg.fromY + (leg.y - leg.fromY) * f, facing: leg.x < leg.fromX ? Math.PI : 0, moving: true };
    }
    t -= leg.walk;
    if (t < leg.fight) return { x: leg.x, y: leg.y, facing: leg.facing, moving: false };
    t -= leg.fight;
  }
  const end = legs[legs.length - 1];
  return end ? { x: end.x, y: end.y, facing: end.facing, moving: false } : { x: plan.anchorX, y: plan.anchorY, facing: 0, moving: false };
}
