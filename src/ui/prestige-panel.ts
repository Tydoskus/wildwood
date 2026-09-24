import { formatCompactNumber } from './number-format';
import { PRESTIGE_PERK_POINTS_PER_LEVEL, PRESTIGE_STAT_GAIN_PER_LEVEL, prestigeEndlessRequirement, prestigeRequirementHint, prestigeStatMultiplier } from '../../shared/prestige';
import { PRESTIGE_PERKS, PRESTIGE_PERK_IDS, PRESTIGE_PERK_MAX_RANK, prestigePerkEffectLabel, prestigePerkRank,
  type PrestigePerkId, type PrestigePerkRanks } from '../../shared/prestige-perks';

export type PrestigeRow = { level: number; perkPoints: number; peakPower: number };
export type PrestigeResult = { ok: boolean; error?: string } | boolean | undefined;

const LOCKED_HINT = 'Defeat Aegis Prime to unlock Prestige.';
/** What a prestige takes away and what it leaves, in the words every prestige window uses. */
export const PRESTIGE_COST = 'Prestige resets your stats, equipment and every map unlock. '
  + 'Your tech research, lifetime kills, name, gems, bought slots and upgrade bench all stay.';
/** The warning shown once a prestige button is armed and the next press resets. */
export const PRESTIGE_ARMED_WARNING = 'This cannot be undone.';

/**
 * The one way a window prestiges: the same reducer call and the same words for
 * success and failure, whether the press came from the prestige panel or from
 * the popup announcing that a level has unlocked. `level` is read after the
 * call resolves, so the message names the level just reached.
 */
export async function submitPrestige(runPrestige: () => Promise<PrestigeResult>, level: () => number)
  : Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const result = await runPrestige();
    const ok = typeof result === 'boolean' ? result : result?.ok === true;
    if (ok) return { ok: true, message: `Prestige ${level() || ''}`.trim() + ' complete.' };
    return { ok: false, error: (typeof result === 'object' && result?.error) || "Couldn't prestige. Please try again." };
  } catch {
    return { ok: false, error: "Couldn't prestige. Please try again." };
  }
}

/**
 * What one more prestige adds, from the current level. Every prestige adds the
 * same stat gain and perk points; after the first, the new total follows.
 */
export function prestigeRewardLabel(level: number) {
  const gain = Math.round(PRESTIGE_STAT_GAIN_PER_LEVEL * 100);
  const total = Math.round(prestigeStatMultiplier(level + 1) * 100 - 100);
  const points = PRESTIGE_PERK_POINTS_PER_LEVEL;
  return `+${gain}% stat gain${level > 0 ? ` (+${total}% total)` : ''} and ${points} perk point${points === 1 ? '' : 's'}`;
}

export function createPrestigeController(options: {
  openButton: HTMLButtonElement; ownActions: HTMLElement;
  overlay: HTMLElement; closeButton: HTMLButtonElement; confirmButton: HTMLButtonElement; perkList: HTMLElement;
  level: HTMLElement; bonus: HTMLElement; points: HTMLElement; peak: HTMLElement;
  cost: HTMLElement; status: HTMLElement;
  prestige: () => PrestigeRow | null;
  perks: () => PrestigePerkRanks | null | undefined;
  spendPerk: (perk: PrestigePerkId) => Promise<PrestigeResult>;
  /** Whether the first Endless map is open: the campaign is complete. */
  unlocked: () => boolean;
  /** Endless stages cleared this run; the second prestige needs one, the third two, and so on. */
  completed?: () => number;
  runPrestige: () => Promise<PrestigeResult>;
  showMessage?: (text: string) => void;
  beforeOpen?: () => void;
}) {
  const { openButton, overlay, confirmButton, status } = options;
  let armed = false, pending = false;

  const nextLevel = () => (options.prestige()?.level ?? 0) + 1;
  const completed = () => options.completed?.() ?? 0;
  // The campaign, then one Endless stage more than the last prestige asked for.
  const unlocked = () => options.unlocked() && completed() >= prestigeEndlessRequirement(nextLevel());
  const hint = () => prestigeRequirementHint(options.unlocked(), completed(), nextLevel());
  // Prestiging clears the campaign, which would otherwise lock a player out of
  // the window holding the point they just earned. Anyone who has prestiged,
  // or has a point banked, can always open it; only the reset stays gated.
  const canOpen = () => {
    const row = options.prestige();
    return unlocked() || (row?.level ?? 0) > 0 || (row?.perkPoints ?? 0) > 0;
  };

  function disarm() {
    armed = false;
    confirmButton.textContent = 'Prestige';
    confirmButton.classList.remove('is-armed');
  }

  /**
   * One row per perk: what it does, the rank owned, and a button when a point
   * is banked. The rows are built once and then updated in place. Rebuilding
   * them on every render replaced the button between a press and its click,
   * which is why spending a point sometimes took several taps.
   */
  const perkRows = new Map<PrestigePerkId, { title: HTMLElement; value: HTMLElement; spend: HTMLButtonElement }>();

  function buildPerkRows() {
    // Build from the list's own document so the panel works wherever it is mounted.
    const create = (tag: string) => options.perkList.ownerDocument.createElement(tag) as HTMLElement;
    options.perkList.replaceChildren(...PRESTIGE_PERK_IDS.map(id => {
      const row = create('div');
      row.className = 'prestige-perk';
      row.dataset.perk = id;
      const title = create('div');
      title.className = 'prestige-perk-title';
      const detail = create('div');
      detail.className = 'prestige-perk-detail';
      detail.textContent = PRESTIGE_PERKS[id].detail;
      // What the rank owned is worth, and what one more point would buy.
      const value = create('div');
      value.className = 'prestige-perk-value';
      const spend = create('button') as HTMLButtonElement;
      spend.type = 'button';
      spend.className = 'prestige-perk-spend';
      spend.addEventListener('click', async () => {
        if (spend.disabled) return;
        // Read the rank now rather than closing over the one this row was
        // built with, which a rank bought since would have left stale.
        const rank = prestigePerkRank(options.perks(), id);
        pending = true; spend.disabled = true;
        status.textContent = `Spending a point on ${PRESTIGE_PERKS[id].title}…`;
        try {
          const result = await options.spendPerk(id);
          const ok = typeof result === 'boolean' ? result : result?.ok === true;
          status.textContent = ok ? `${PRESTIGE_PERKS[id].title} is now rank ${rank + 1}.`
            : (typeof result === 'object' && result?.error) || "Couldn't spend that point.";
        } catch {
          status.textContent = "Couldn't spend that point.";
        } finally {
          pending = false; render();
        }
      });
      row.append(title, detail, value, spend);
      perkRows.set(id, { title, value, spend });
      return row;
    }));
  }

  function renderPerks(points: number) {
    if (!perkRows.size) buildPerkRows();
    const ranks = options.perks();
    for (const id of PRESTIGE_PERK_IDS) {
      const row = perkRows.get(id);
      if (!row) continue;
      const rank = prestigePerkRank(ranks, id);
      const maxed = rank >= PRESTIGE_PERK_MAX_RANK;
      row.title.textContent = `${PRESTIGE_PERKS[id].title} ${rank}/${PRESTIGE_PERK_MAX_RANK}`;
      row.value.textContent = maxed
        ? `Now ${prestigePerkEffectLabel(id, rank)}`
        : `Now ${prestigePerkEffectLabel(id, rank)} · Next ${prestigePerkEffectLabel(id, rank + 1)}`;
      row.spend.textContent = maxed ? 'Maxed' : 'Spend';
      row.spend.disabled = pending || maxed || points < 1;
    }
  }

  function render() {
    const row = options.prestige();
    const level = row?.level ?? 0;
    options.level.textContent = `PRESTIGE ${level}`;
    options.bonus.textContent = `+${Math.round(level * PRESTIGE_STAT_GAIN_PER_LEVEL * 100)}%`;
    options.points.textContent = String(row?.perkPoints ?? 0);
    options.peak.textContent = row?.peakPower ? formatCompactNumber(row.peakPower) : '—';
    options.cost.textContent = unlocked()
      ? `${PRESTIGE_COST} You would earn ${prestigeRewardLabel(level)}.`
      : `Spend the points you have banked. ${hint()}`;
    renderPerks(row?.perkPoints ?? 0);
    // Enabled whenever the campaign is done, even if this client reads fewer
    // Endless stages than the server has. A missing procedural_progress row
    // and a genuine zero look identical here, so refusing on that reading
    // blocks players who have cleared the stage: it did it to Teus, and to
    // Toephu on 2026-09-22, whose window said to clear a boss he had already
    // beaten. The requirement is still spelled out beside the button; the
    // server owns the decision and names exactly what is missing.
    confirmButton.disabled = pending || !options.unlocked();
    confirmButton.hidden = false;
    if (!unlocked() && !status.textContent) status.textContent = hint();
  }

  /** Called whenever the profile window renders, so the button tracks progress. */
  /** Also runs on the 100ms HUD tick, so it only writes what changed. */
  function refresh(ownProfile: boolean) {
    if (options.ownActions.hidden !== !ownProfile) options.ownActions.hidden = !ownProfile;
    const open = canOpen();
    if (openButton.disabled !== !open) openButton.disabled = !open;
    const title = open ? 'Prestige' : hint() || LOCKED_HINT;
    if (openButton.title !== title) openButton.title = title;
    if (openButton.getAttribute('aria-disabled') !== String(!open)) openButton.setAttribute('aria-disabled', String(!open));
    const row = options.prestige();
    const label = row?.level ? `Prestige ${row.level}` : 'Prestige';
    if (openButton.textContent !== label) openButton.textContent = label;
    if (!overlay.hidden) render();
  }

  function open() {
    options.beforeOpen?.();
    disarm();
    // Whatever still stands in the way is shown inside, where the requirement
    // is spelled out, rather than used to keep the window shut.
    status.textContent = canOpen() ? '' : hint() || LOCKED_HINT;
    overlay.hidden = false;
    render();
  }
  function close() { overlay.hidden = true; disarm(); }

  openButton.addEventListener('click', open);
  options.closeButton.addEventListener('click', close);
  confirmButton.addEventListener('click', async () => {
    // Only the campaign gate is enforced here, because it is the one this
    // client can be certain of. An Endless count that has not arrived yet must
    // not swallow the press; the server refuses and says why.
    if (pending || !options.unlocked()) {
      if (!pending) status.textContent = hint() || LOCKED_HINT;
      return;
    }
    // Losing every map unlock deserves a second press, not a single tap.
    if (!armed) {
      armed = true;
      confirmButton.textContent = 'Yes, prestige';
      confirmButton.classList.add('is-armed');
      status.textContent = PRESTIGE_ARMED_WARNING;
      return;
    }
    pending = true; disarm();
    status.textContent = 'Prestiging…';
    confirmButton.disabled = true;
    try {
      const outcome = await submitPrestige(options.runPrestige, () => options.prestige()?.level ?? 0);
      if (outcome.ok) {
        close();
        options.showMessage?.(outcome.message);
      } else {
        status.textContent = outcome.error;
      }
    } finally {
      pending = false; render();
    }
  });

  return { refresh, open, close, render, get isOpen() { return !overlay.hidden; } };
}
