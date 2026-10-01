/**
 * The move from internal testing to the closed beta (0.860, build 861). Play
 * only moves a tester when they accept the closed test themselves, so the
 * last internal build asks once: Join opens this app's Play Store page, where
 * a tester on the closed list accepts. Later asks again on the next launch.
 * Switch it off (CLOSED_BETA_INVITE = false) in builds made for the closed track.
 */
export const CLOSED_BETA_INVITE = true;
export const CLOSED_BETA_INVITE_KEY = 'wildstat.closed-beta-invite';
const SHOW_DELAY_MS = 4_000;

type InviteStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function shouldShowClosedBetaInvite(storage: InviteStorage, enabled = CLOSED_BETA_INVITE) {
  if (!enabled) return false;
  try { return storage.getItem(CLOSED_BETA_INVITE_KEY) !== 'joined'; } catch { return true; }
}

export function rememberClosedBetaJoin(storage: InviteStorage) {
  try { storage.setItem(CLOSED_BETA_INVITE_KEY, 'joined'); } catch { /* It asks again next launch. */ }
}

const STYLE = `
#closedBetaInvite { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: #0009; }
#closedBetaInvite[hidden] { display: none; }
#closedBetaInvite .closed-beta-card { display: grid; gap: 12px; width: min(340px, 100%); box-sizing: border-box; padding: 18px 16px 16px; border: 2px solid #090e13; border-radius: 14px; background: #121b24; box-shadow: 0 6px 20px #000a; color: #fff; text-align: center; font-weight: 900; }
#closedBetaInvite h2 { margin: 0; font-size: 18px; }
#closedBetaInvite p { margin: 0; color: #c7d2da; font-size: 14px; line-height: 1.35; font-weight: 700; }
#closedBetaInvite .closed-beta-actions { display: flex; gap: 10px; justify-content: center; }
#closedBetaInvite button { flex: 1 1 0; max-width: 150px; min-height: 44px; padding: 8px 12px; border: 2px solid #18371b; border-radius: 8px; background: linear-gradient(#63ad5c, #347536); box-shadow: 0 3px 0 #18371b; color: #fff; font: inherit; font-size: 15px; }
#closedBetaInvite button.closed-beta-later { border-color: #1d2227; background: linear-gradient(#6d7782, #444c55); box-shadow: 0 3px 0 #1a1e22; }
#closedBetaInvite button:disabled { opacity: .6; }
`;

/** Shows the invite once the game has had a moment to load; Join opens Google Play. */
export function installClosedBetaInvite(openStore: () => Promise<void>, storage: InviteStorage = localStorage) {
  if (!shouldShowClosedBetaInvite(storage)) return;
  const mount = () => {
    const style = document.createElement('style');
    style.textContent = STYLE;
    const overlay = document.createElement('section');
    overlay.id = 'closedBetaInvite';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'closedBetaInviteTitle');
    overlay.innerHTML = '<div class="closed-beta-card"><h2 id="closedBetaInviteTitle">WildStat is moving to the closed beta</h2>'
      + '<p>Tap Join, then join the test on Google Play to keep getting updates. Same app, nothing to reinstall, and your progress stays.</p>'
      + '<p class="closed-beta-status" role="status" hidden></p>'
      + '<div class="closed-beta-actions"><button type="button" class="closed-beta-later">Later</button><button type="button" class="closed-beta-join">Join</button></div></div>';
    const join = overlay.querySelector<HTMLButtonElement>('.closed-beta-join')!;
    const status = overlay.querySelector<HTMLElement>('.closed-beta-status')!;
    const close = () => { overlay.remove(); style.remove(); };
    overlay.querySelector('.closed-beta-later')!.addEventListener('click', close);
    join.addEventListener('click', async () => {
      if (join.disabled) return;
      join.disabled = true;
      try {
        await openStore();
        rememberClosedBetaJoin(storage);
        close();
      } catch {
        status.textContent = 'Could not open Google Play. Try again later.';
        status.hidden = false;
        join.disabled = false;
      }
    });
    document.head.append(style);
    document.body.append(overlay);
    join.focus();
  };
  const later = () => setTimeout(mount, SHOW_DELAY_MS);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later, { once: true });
  else later();
}
