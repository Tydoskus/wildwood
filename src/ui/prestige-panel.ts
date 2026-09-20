import { formatCompactNumber } from './number-format';
import { PRESTIGE_STAT_GAIN_PER_LEVEL, prestigeStatMultiplier } from '../../shared/prestige';

export type PrestigeRow = { level: number; perkPoints: number; peakPower: number };
type Result = { ok: boolean; error?: string } | boolean | undefined;

const LOCKED_HINT = 'Defeat Aegis Prime to unlock Prestige.';
const COST = 'Prestige resets your stats, research, equipment and every map unlock. '
  + 'Your name, gems, bought slots and upgrade bench stay.';

/** What one more prestige is worth, as the panel words it. */
export function prestigeRewardLabel(level: number) {
  return `+${Math.round(prestigeStatMultiplier(level + 1) * 100 - 100)}% stat gain, ${level + 1} perk point${level ? 's' : ''}`;
}

export function createPrestigeController(options: {
  openButton: HTMLButtonElement; ownActions: HTMLElement;
  overlay: HTMLElement; closeButton: HTMLButtonElement; confirmButton: HTMLButtonElement;
  level: HTMLElement; bonus: HTMLElement; points: HTMLElement; peak: HTMLElement;
  cost: HTMLElement; status: HTMLElement;
  prestige: () => PrestigeRow | null;
  /** Whether the first Endless map is open, the clearance prestige shares. */
  unlocked: () => boolean;
  runPrestige: () => Promise<Result>;
  showMessage?: (text: string) => void;
  beforeOpen?: () => void;
}) {
  const { openButton, overlay, confirmButton, status } = options;
  let armed = false, pending = false;

  const unlocked = () => options.unlocked();

  function disarm() {
    armed = false;
    confirmButton.textContent = 'Prestige';
    confirmButton.classList.remove('is-armed');
  }

  function render() {
    const row = options.prestige();
    const level = row?.level ?? 0;
    options.level.textContent = `PRESTIGE ${level}`;
    options.bonus.textContent = `+${Math.round(level * PRESTIGE_STAT_GAIN_PER_LEVEL * 100)}%`;
    options.points.textContent = String(row?.perkPoints ?? 0);
    options.peak.textContent = row?.peakPower ? formatCompactNumber(row.peakPower) : '—';
    options.cost.textContent = `${COST} You would earn ${prestigeRewardLabel(level)}.`;
    confirmButton.disabled = pending || !unlocked();
    if (!unlocked()) status.textContent = LOCKED_HINT;
  }

  /** Called whenever the profile window renders, so the button tracks progress. */
  function refresh(ownProfile: boolean) {
    options.ownActions.hidden = !ownProfile;
    const open = unlocked();
    openButton.disabled = !open;
    openButton.title = open ? 'Prestige' : LOCKED_HINT;
    openButton.setAttribute('aria-disabled', String(!open));
    const row = options.prestige();
    openButton.textContent = row?.level ? `Prestige ${row.level}` : 'Prestige';
    if (!overlay.hidden) render();
  }

  function open() {
    if (!unlocked()) { options.showMessage?.(LOCKED_HINT); return; }
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
