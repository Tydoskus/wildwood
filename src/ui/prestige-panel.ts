import { formatCompactNumber } from './number-format';
import { PRESTIGE_STAT_GAIN_PER_LEVEL, prestigeEndlessRequirement, prestigeRequirementHint, prestigeStatMultiplier } from '../../shared/prestige';
import { PRESTIGE_PERKS, PRESTIGE_PERK_IDS, PRESTIGE_PERK_MAX_RANK, prestigePerkEffectLabel, prestigePerkRank,
  type PrestigePerkId, type PrestigePerkRanks } from '../../shared/prestige-perks';

export type PrestigeRow = { level: number; perkPoints: number; peakPower: number };
type Result = { ok: boolean; error?: string } | boolean | undefined;

const LOCKED_HINT = 'Defeat Aegis Prime to unlock Prestige.';
const COST = 'Prestige resets your stats, equipment and every map unlock. '
  + 'Your tech research, lifetime kills, name, gems, bought slots and upgrade bench all stay.';

/** What one more prestige is worth, as the panel words it. */
export function prestigeRewardLabel(level: number) {
  return `+${Math.round(prestigeStatMultiplier(level + 1) * 100 - 100)}% stat gain, ${level + 1} perk point${level ? 's' : ''}`;
}

export function createPrestigeController(options: {
  openButton: HTMLButtonElement; ownActions: HTMLElement;
  overlay: HTMLElement; closeButton: HTMLButtonElement; confirmButton: HTMLButtonElement; perkList: HTMLElement;
  level: HTMLElement; bonus: HTMLElement; points: HTMLElement; peak: HTMLElement;
  cost: HTMLElement; status: HTMLElement;
  prestige: () => PrestigeRow | null;
  perks: () => PrestigePerkRanks | null | undefined;
  spendPerk: (perk: PrestigePerkId) => Promise<Result>;
  /** Whether the first Endless map is open: the campaign is complete. */
  unlocked: () => boolean;
  /** Endless stages cleared this run; the second prestige needs one, the third two, and so on. */
  completed?: () => number;
  runPrestige: () => Promise<Result>;
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

  /** One row per perk: what it does, the rank owned, and a button when a point is banked. */
  function renderPerks(points: number) {
    const ranks = options.perks();
    // Build from the list's own document so the panel works wherever it is mounted.
    const create = (tag: string) => options.perkList.ownerDocument.createElement(tag) as HTMLElement;
    options.perkList.replaceChildren(...PRESTIGE_PERK_IDS.map(id => {
      const rank = prestigePerkRank(ranks, id);
      const row = create('div');
      row.className = 'prestige-perk';
      row.dataset.perk = id;
      const maxed = rank >= PRESTIGE_PERK_MAX_RANK;
      const title = create('div');
      title.className = 'prestige-perk-title';
      title.textContent = `${PRESTIGE_PERKS[id].title} ${rank}/${PRESTIGE_PERK_MAX_RANK}`;
      const detail = create('div');
      detail.className = 'prestige-perk-detail';
      detail.textContent = PRESTIGE_PERKS[id].detail;
      // What the rank owned is worth, and what one more point would buy.
      const value = create('div');
      value.className = 'prestige-perk-value';
      value.textContent = maxed
        ? `Now ${prestigePerkEffectLabel(id, rank)}`
        : `Now ${prestigePerkEffectLabel(id, rank)} · Next ${prestigePerkEffectLabel(id, rank + 1)}`;
      const spend = create('button') as HTMLButtonElement;
      spend.type = 'button';
      spend.className = 'prestige-perk-spend';
      spend.textContent = maxed ? 'Maxed' : 'Spend';
      spend.disabled = pending || maxed || points < 1;
      spend.addEventListener('click', async () => {
        if (spend.disabled) return;
        pending = true; spend.disabled = true;
        status.textContent = `Spending a point on ${PRESTIGE_PERKS[id].title}…`;
        try {
          const result = await options.spendPerk(id);
          const ok = typeof result === 'boolean' ? result : result?.ok !== false;
          status.textContent = ok ? `${PRESTIGE_PERKS[id].title} is now rank ${rank + 1}.`
            : (typeof result === 'object' && result?.error) || "Couldn't spend that point.";
        } catch {
          status.textContent = "Couldn't spend that point.";
        } finally {
          pending = false; render();
        }
      });
      row.append(title, detail, value, spend);
      return row;
    }));
  }

  function render() {
    const row = options.prestige();
    const level = row?.level ?? 0;
    options.level.textContent = `PRESTIGE ${level}`;
    options.bonus.textContent = `+${Math.round(level * PRESTIGE_STAT_GAIN_PER_LEVEL * 100)}%`;
    options.points.textContent = String(row?.perkPoints ?? 0);
    options.peak.textContent = row?.peakPower ? formatCompactNumber(row.peakPower) : '—';
    options.cost.textContent = unlocked()
      ? `${COST} You would earn ${prestigeRewardLabel(level)}.`
      : `Spend the points you have banked. ${hint()}`;
    renderPerks(row?.perkPoints ?? 0);
    confirmButton.disabled = pending || !unlocked();
    confirmButton.hidden = !unlocked();
    if (!unlocked() && !status.textContent) status.textContent = hint();
  }

  /** Called whenever the profile window renders, so the button tracks progress. */
  function refresh(ownProfile: boolean) {
    options.ownActions.hidden = !ownProfile;
    const open = canOpen();
    openButton.disabled = !open;
    openButton.title = open ? 'Prestige' : hint() || LOCKED_HINT;
    openButton.setAttribute('aria-disabled', String(!open));
    const row = options.prestige();
    openButton.textContent = row?.level ? `Prestige ${row.level}` : 'Prestige';
    if (!overlay.hidden) render();
  }

  function open() {
    if (!canOpen()) { options.showMessage?.(hint() || LOCKED_HINT); return; }
    options.beforeOpen?.();
    disarm();
    status.textContent = '';
    overlay.hidden = false;
    render();
  }
  function close() { overlay.hidden = true; disarm(); }

  openButton.addEventListener('click', open);
  options.closeButton.addEventListener('click', close);
  confirmButton.addEventListener('click', async () => {
    if (pending || !unlocked()) return;
    // Losing every map unlock deserves a second press, not a single tap.
    if (!armed) {
      armed = true;
      confirmButton.textContent = 'Yes, reset everything';
      confirmButton.classList.add('is-armed');
      status.textContent = 'This cannot be undone.';
      return;
    }
    pending = true; disarm();
    status.textContent = 'Prestiging…';
    confirmButton.disabled = true;
    try {
      const result = await options.runPrestige();
      const ok = typeof result === 'boolean' ? result : result?.ok !== false;
      if (ok) {
        close();
        options.showMessage?.(`Prestige ${(options.prestige()?.level ?? 0) || ''}`.trim() + ' complete.');
      } else {
        status.textContent = (typeof result === 'object' && result?.error) || "Couldn't prestige. Please try again.";
      }
    } catch {
      status.textContent = "Couldn't prestige. Please try again.";
    } finally {
      pending = false; render();
    }
  });

  return { refresh, open, close, render, get isOpen() { return !overlay.hidden; } };
}
