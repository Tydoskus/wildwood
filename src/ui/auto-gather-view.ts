import type { AutoChop } from '../game/runtime/auto-farm/auto-chop';
import type { AutoFish } from '../game/runtime/auto-farm/auto-fish';
import type { AutoMine } from '../game/runtime/auto-farm/auto-mine';

/** Auto Mine's "?" page, in the Copper Hills. */
export const AUTO_MINE_HELP_LINES: readonly [term: string, line: string][] = [
  ['Ores', 'Switch on the ores to mine. Every rock of that ore counts, Small, Large and Mysterious, and Arcane Crystal is the crystal rocks.'],
  ['Mining', 'Start it in the Copper Hills: it mines the nearest rock, then the next.'],
  ['Bare Rocks', 'With every rock of your ores mined, it waits by the one that grows back first.'],
  ['Moving', 'Move yourself any time; it carries on when you let go.'],
  ['Leaving', 'Leaving the Copper Hills stops it.'],
];
/** Auto Chop's "?" page, in Timberwood. */
export const AUTO_CHOP_HELP_LINES: readonly [term: string, line: string][] = [
  ['Trees', 'Switch on the trees to chop.'],
  ['Chopping', 'Start it in Timberwood: it chops the nearest tree, then the next.'],
  ['Stumps', 'With every tree of your kinds felled, it waits by the one that grows back first.'],
  ['Bag', 'With no bag room for a kind of log it chops your other kinds, and stops once none are left.'],
  ['Moving', 'Move yourself any time; it carries on when you let go.'],
  ['Leaving', 'Leaving Timberwood stops it.'],
];

/** Auto Fish's "?" page, along the Town's river and pond. */
export const AUTO_FISH_HELP_LINES: readonly [term: string, line: string][] = [
  ['Spots', 'Switch on the stretches of the river and pond to visit.'],
  ['Fishing', 'Start it near the Town river: it walks to the nearest active spot, fishes until it moves, then walks to the next.'],
  ['Bag', 'Stops automatically when your bag has no room for new fish.'],
  ['Moving', 'Move yourself any time; it carries on when you let go.'],
  ['Leaving', 'Walking away from the river stops it.'],
];

/** One switch's worth: a kind of ore or tree, whether it is open (or what opens it), picked, and how many stand. */
type GatherKind = { id: string; name: string; open: boolean; locked: string; picked: boolean; total: number; standing: number };
type Gatherer = {
  state: () => { active: boolean; status: string };
  kinds: () => GatherKind[];
  toggle: (id: string) => void;
};

/**
 * The window's body for Auto Mine or Auto Chop: what it is doing, and one switch per kind, the Move On switch's
 * look. A shut kind's switch is locked, with what opens it under its name.
 */
function createAutoGatherView(gather: Gatherer, look: { kind: string; label: string; unit: string; attribute: string }, changed: () => void) {
  const body = document.createElement('div');
  // Both share Auto Mine's look (auto-farm.css).
  body.className = look.kind === 'mine' ? 'farm-body farm-mine-body' : `farm-body farm-mine-body farm-${look.kind}-body`;
  body.hidden = true;
  const labelId = `auto${look.kind[0].toUpperCase()}${look.kind.slice(1)}KindsLabel`;
  body.innerHTML = '<p class="farm-mine-status" aria-live="polite"></p>'
    + `<div class="farm-setting"><span id="${labelId}" class="farm-setting-label"></span></div>`
    + `<div class="farm-mine-ores" role="group" aria-labelledby="${labelId}"></div>`;
  body.querySelector('.farm-setting-label')!.textContent = look.label;
  const statusLine = body.querySelector<HTMLElement>('.farm-mine-status')!;
  const list = body.querySelector<HTMLElement>('.farm-mine-ores')!;
  for (const kind of gather.kinds()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'farm-switch farm-ore';
    button.setAttribute('role', 'switch');
    button.setAttribute(`data-${look.attribute}`, kind.id);
    button.innerHTML = '<span class="farm-switch-copy"><span class="farm-switch-label"></span><small class="farm-boss-status"></small></span><span class="farm-knob" aria-hidden="true"></span>';
    button.querySelector('.farm-switch-label')!.textContent = kind.name;
    button.addEventListener('click', () => {
      if (button.disabled) return;
      gather.toggle(kind.id);
      changed();
    });
    list.append(button);
  }

  /** Brings the switches and the status line up to date: a stop's reason stays up until it starts again. */
  function render() {
    const state = gather.state();
    const text = state.active || state.status.includes('Stopped:') ? state.status : 'Off';
    if (statusLine.textContent !== text) statusLine.textContent = text;
    statusLine.classList.toggle('is-idle', !state.active);
    for (const kind of gather.kinds()) {
      const button = list.querySelector<HTMLButtonElement>(`[data-${look.attribute}="${kind.id}"]`)!;
      const on = kind.open && kind.picked;
      button.disabled = !kind.open;
      button.setAttribute('aria-checked', String(on));
      const line = kind.open ? `${kind.standing} of ${kind.total} ${look.unit} Ready` : kind.locked;
      const sub = button.querySelector<HTMLElement>('.farm-boss-status')!;
      if (sub.textContent !== line) sub.textContent = line;
      sub.classList.toggle('is-idle', !on);
    }
  }
  return { body, render };
}

/** Auto Mine's body: a switch per ore. */
export function createAutoMineView(mine: AutoMine, changed: () => void) {
  return createAutoGatherView({
    state: mine.state,
    kinds: () => mine.veins().map(vein => ({ id: vein.ore, name: vein.name, open: vein.open, locked: vein.locked, picked: vein.picked, total: vein.rocks, standing: vein.standing })),
    toggle: id => { const ore = id as Parameters<AutoMine['picked']>[0]; mine.setPicked(ore, !mine.picked(ore)); },
  }, { kind: 'mine', label: 'Ores', unit: 'Rocks', attribute: 'ore' }, changed);
}

/** Auto Chop's body: a switch per kind of tree. */
export function createAutoChopView(chop: AutoChop, changed: () => void) {
  return createAutoGatherView({
    state: chop.state,
    kinds: () => chop.stands().map(stand => ({ id: stand.kind, name: stand.name, open: stand.open, locked: stand.locked, picked: stand.picked, total: stand.trees, standing: stand.standing })),
    toggle: id => { const kind = id as Parameters<AutoChop['picked']>[0]; chop.setPicked(kind, !chop.picked(kind)); },
  }, { kind: 'chop', label: 'Trees', unit: 'Trees', attribute: 'tree' }, changed);
}

/** Auto Fish's body: a switch per river stretch. */
export function createAutoFishView(fish: AutoFish, changed: () => void) {
  return createAutoGatherView({
    state: fish.state,
    kinds: () => fish.spots().map(spot => ({ id: spot.id, name: spot.name, open: spot.open, locked: spot.locked, picked: spot.picked, total: spot.sites, standing: 1 })),
    toggle: id => { fish.setPicked(id, !fish.picked(id)); },
  }, { kind: 'fish', label: 'River Spots', unit: 'Active', attribute: 'spot' }, changed);
}
