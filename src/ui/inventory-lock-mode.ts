const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></svg>';
export function createInventoryLockMode(deps: {
  panel: HTMLElement; locked: (itemId: string, copyId?: bigint) => boolean;
  setLocked: (itemId: string, locked: boolean, copyId?: bigint) => Promise<{ ok: boolean; error?: string } | undefined>;
  onEnter: () => void; render: () => void; showMessage: (message: string, color?: string) => void;
}) {
  let active = false, busy = false;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'inventory-lock-toggle'; button.innerHTML = ICON;
  button.title = 'Lock equipment: protects the selected item from deletion and replacement';
  button.setAttribute('aria-label', 'Lock equipment');
  const sync = () => { button.setAttribute('aria-pressed', String(active)); deps.panel.classList.toggle('is-lock-mode', active); };
  button.addEventListener('click', () => { if (busy) return; active = !active; if (active) { deps.onEnter(); deps.showMessage('Tap equipment to lock or unlock it.', '#79c9ff'); } sync(); });
  sync();
  return {
    button, active: () => active,
    exit: () => { active = false; sync(); },
    async pick(itemId: string, copyId = 0n) {
      if (busy) return;
      busy = true;
      try {
        const locked = !deps.locked(itemId, copyId), result = await deps.setLocked(itemId, locked, copyId);
        if (!result?.ok) deps.showMessage(result?.error ?? 'NOT CONNECTED', '#ff9b91');
        else deps.showMessage(locked ? 'Equipment locked' : 'Equipment unlocked', '#79c9ff');
      } finally { busy = false; deps.render(); }
    },
    decorate() {
      for (const element of deps.panel.querySelectorAll<HTMLElement>('[data-item-id]')) {
        const locked = deps.locked(element.dataset.itemId || '', BigInt(element.dataset.copyId || '0'));
        element.classList.toggle('is-equipment-locked', locked);
        element.querySelector('.equipment-lock-badge')?.remove();
        if (locked) { const badge = document.createElement('span'); badge.className = 'equipment-lock-badge'; badge.innerHTML = ICON; badge.setAttribute('aria-label', 'Locked'); element.append(badge); }
      }
    },
  };
}
