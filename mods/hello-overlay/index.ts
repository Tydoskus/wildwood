const HELLO_OVERLAY_ID = "hello-mod-overlay";

export function installHelloOverlay(): void {
  if (document.getElementById(HELLO_OVERLAY_ID)) return;

  const container = document.createElement("div");
  container.id = HELLO_OVERLAY_ID;
  Object.assign(container.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "10000",
    pointerEvents: "none",
  });

  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "Hello Mod");
  Object.assign(panel.style, {
    minWidth: "min(228px, calc(100vw - 24px))",
    maxWidth: "calc(100vw - 24px)",
    color: "var(--text, #f5f5e9)",
    background: "rgba(24, 24, 24, 0.6)",
    border: "var(--hud-border, 1.5px) solid var(--hud-frame, #0f0f0f)",
    borderRadius: "var(--hud-radius-small, 8px)",
    boxShadow: "0 2px 0 var(--ui-outline, #0f0f0f)",
    outline: "var(--hud-border, 1.5px) solid var(--ui-outline, #0f0f0f)",
    outlineOffset: "-1px",
    font: '12px/1.3 "Wildstat Chat", sans-serif',
    pointerEvents: "auto",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
    padding: "0 8px",
  });

  const title = document.createElement("strong");
  title.textContent = "Hello Mod";
  Object.assign(title.style, {
    flex: "1",
    fontWeight: "800",
  });

  const contentId = `${HELLO_OVERLAY_ID}-content`;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.setAttribute("aria-controls", contentId);
  toggle.setAttribute("aria-expanded", "true");
  Object.assign(toggle.style, {
    flex: "0 0 auto",
    minHeight: "32px",
    margin: "0",
    padding: "4px 6px",
    color: "inherit",
    background: "transparent",
    border: "0",
    font: "inherit",
    cursor: "pointer",
  });

  const content = document.createElement("div");
  content.id = contentId;
  content.textContent = "Hello World !";
  Object.assign(content.style, {
    padding: "3px 8px 8px",
  });

  let expanded = true;
  const updateToggle = (): void => {
    toggle.textContent = expanded ? "−" : "+";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "Replier le panneau" : "Déplier le panneau");
    content.hidden = !expanded;
  };

  toggle.addEventListener("click", () => {
    expanded = !expanded;
    updateToggle();
  });
  updateToggle();

  header.append(title, toggle);
  panel.append(header, content);
  container.append(panel);
  document.body.append(container);
}
