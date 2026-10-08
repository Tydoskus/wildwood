/**
 * Drives one virtual player (virtual-player.ts, unchanged) on one farming
 * option, for the growth forecast's calibration: stay on the start map, farm
 * one stat group (or Auto), with Pull on or off.
 *
 * virtual-player.ts builds its own autofarm controller and keeps it private.
 * The calibration test mocks '../auto-farm-controller' so that every
 * controller built is handed to `captureController` first, with the options
 * this option needs swapped in (no portal back, so a farm that keeps dying
 * stays where it is and its deaths are counted). Only the test may import this.
 */
import type { AutoFarmController } from '../auto-farm-controller';
import { ENEMY_TYPES, type EnemyDefinition } from '../../enemies';
import { createVirtualPlayer, type VirtualPlayerProfile } from './virtual-player';

type ControllerOptions = Parameters<typeof import('../auto-farm-controller').createAutoFarmController>[0];

let captured: AutoFarmController | null = null;
let overrides: Partial<ControllerOptions> = {};

/** What the mocked createAutoFarmController calls: the options to build with, then what it built. */
export type HarnessHooks = {
  options: (options: ControllerOptions) => ControllerOptions;
  capture: (controller: AutoFarmController) => AutoFarmController;
};
(globalThis as { __forecastHarness?: HarnessHooks }).__forecastHarness = {
  options: options => ({ ...options, ...overrides }),
  capture: controller => { captured = controller; return controller; },
};

/** What the calibration test's enemy-simulation mock counts while a run plays. */
export type CombatMeasure = {
  enemyTypes: Readonly<Record<string, EnemyDefinition>>;
  meleeHits: number;
  /** Hits that were not melee: enemy shots (and any boss). */
  otherHits: number;
  shotsFired: number;
  meleeEngagedSeconds: number;
  rangedEngagedSeconds: number;
  /** Seconds an engaged enemy was near: a melee one inside kiting's room (160 from the player's edge), a ranged one in range. */
  meleeNearSeconds: number;
  rangedNearSeconds: number;
  /** Near seconds weighed by each enemy's attack speed: the hits it would land if every swing landed. */
  meleePotentialHits: number;
  rangedPotentialHits: number;
  /** Kills by the group they paid ("stat:health", "soul:armor"). */
  killsByGroup: Record<string, number>;
  /** Health lost, in shares of max health, and the seconds alive it was lost over. */
  damageTaken: number;
  aliveSeconds: number;
};
const emptyMeasure = (): CombatMeasure => ({ enemyTypes: ENEMY_TYPES, meleeHits: 0, otherHits: 0, shotsFired: 0,
  meleeEngagedSeconds: 0, rangedEngagedSeconds: 0, meleeNearSeconds: 0, rangedNearSeconds: 0, meleePotentialHits: 0, rangedPotentialHits: 0, killsByGroup: {}, damageTaken: 0, aliveSeconds: 0 });

export type HarnessOption = {
  /** One stat group ("stat:health", "soul:armor"), 'all' (every group's slider up), or null for Auto. */
  group: string | null;
  pull: boolean;
  /** False: autofarm's kite off (KiteTuning mode 'off'): it stands and fights melee enemies, still stepping out of shots. */
  kite?: boolean;
  /** Pull's camps: how many groups come at once (the controller's pullCamps). */
  pullCamps?: number;
  /**
   * Picks the group to farm from the live build, every 20 simulated seconds
   * (growthStatChoice, for the Best Gain comparison); not saved with the result.
   */
  chooser?: (live: { base: import('../../../../shared/player-power').PlayerPowerStats; x: number; y: number; health: number }) => string | null;
  /** A name for the chooser, saved in the result. */
  chooserName?: string;
};

export type HarnessResult = {
  name: string;
  map: string;
  option: HarnessOption;
  simSeconds: number;
  wallMs: number;
  startPower: number;
  endPower: number;
  powerPerMinute: number;
  deaths: number;
  deathsPerHour: number;
  kills: number;
  /** Power at each minute, for a growth curve. */
  minutes: number[];
  activity: Record<string, number>;
  /** Seconds in each kind of status ("Kiting", "Dodging", "Farming"...). */
  statuses: Record<string, number>;
  combat: Omit<CombatMeasure, 'enemyTypes'>;
  /** With a chooser: the seconds it had each group picked. */
  chosen?: Record<string, number>;
};

/** Runs `profile` for `seconds` on `option`, staying on its start map. */
export async function runOption(profile: VirtualPlayerProfile, option: HarnessOption, seconds: number): Promise<HarnessResult> {
  overrides = {
    previousPortal: () => null,
    nextPortal: () => null,
    bossUnlocksNext: () => false,
    pullCamps: () => option.pullCamps ?? 1,
    forcedGroups: () => null,
    // Standing: the kite off. Pulled, as the game pulls: as many at once as the build can stand through (tankableCount).
    kite: option.kite === false ? { mode: 'off' } : {},
  };
  captured = null;
  const measure = emptyMeasure();
  (globalThis as { __forecastMeasure?: CombatMeasure }).__forecastMeasure = measure;
  // The forecast is checked against autofarm's own fighting, so its own planner (which prices by the forecast) is off.
  const player = createVirtualPlayer({ ...profile, advance: false, growth: false });
  try {
    const controller = captured as AutoFarmController | null;
    if (!controller) throw new Error('The autofarm controller was not captured: is ../auto-farm-controller mocked?');
    controller.setPullAll(option.pull);
    if (option.group) {
      // A group left out of the sliders is at the default share, so every other group is set to 0.
      const weights = Object.fromEntries(controller.choices().map(choice => [choice.key, option.group === 'all' || choice.key === option.group ? 100 : 0]));
      const started = controller.start({ auto: false, weights });
      if (!started) throw new Error(`${profile.name}: no ${option.group} on ${profile.startMap}`);
    }
    const minutes: number[] = [player.power()];
    const chosen: Record<string, number> = {};
    let picked: string | null = null;
    const choose = () => {
      const live = (globalThis as { __forecastPlayer?: import('../types').PlayerState }).__forecastPlayer;
      if (!option.chooser || !live) return;
      const group = option.chooser({ base: { damage: live.damage, maxHp: live.baseMaxHp, attackRate: live.attackRate, armor: live.armor, regen: live.regen },
        x: live.x, y: live.y, health: live.maxHp > 0 ? Math.max(0, live.hp) / live.maxHp : 1 });
      if (group && group !== picked && controller.choices().some(choice => choice.key === group)) {
        picked = group;
        controller.start({ auto: false, weights: Object.fromEntries(controller.choices().map(choice => [choice.key, choice.key === group ? 100 : 0])) });
      }
    };
    choose();
    let report = player.report();
    const step = option.chooser ? 20 : 60;
    for (let at = 0; at < seconds - 1e-6; at += step) {
      report = await player.run(Math.min(step, seconds - at));
      if (picked) chosen[picked] = (chosen[picked] ?? 0) + Math.min(step, seconds - at);
      if (Math.round((at + step) % 60) === 0) minutes.push(player.power());
      choose();
    }
    const simSeconds = report.simSeconds;
    return {
      name: profile.name, map: profile.startMap, option, simSeconds, wallMs: report.wallMs,
      startPower: report.startPower, endPower: report.endPower,
      powerPerMinute: (report.endPower - report.startPower) / (simSeconds / 60),
      deaths: report.deaths.length, deathsPerHour: report.deaths.length / (simSeconds / 3600),
      kills: report.kills, minutes, activity: report.activity,
      statuses: Object.fromEntries(Object.entries(report.statuses).map(([key, value]) => [key.replace(/ · .*$/, ''), value.seconds])
        .reduce((all, [key, seconds]) => { all.set(key as string, (all.get(key as string) ?? 0) + (seconds as number)); return all; }, new Map<string, number>())),
      combat: (({ enemyTypes: _types, ...rest }) => rest)(measure),
      ...option.chooser ? { chosen } : {},
    };
  } finally {
    player.dispose();
    overrides = {};
    (globalThis as { __forecastMeasure?: CombatMeasure }).__forecastMeasure = undefined;
  }
}
