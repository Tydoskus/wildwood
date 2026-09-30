import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { installLoginMove } from "./login-move-controller";

function fixture(signedIn = true) {
  const { document } = parseHTML('<html><body><section id="settings-account-panel"><div class="setting-row setting-delete-account"><button id="deleteAccountButton"></button></div></section></body></html>');
  const state = { signedIn };
  const move = vi.fn(async () => ({ ok: false, error: "Sign in to your character first." }));
  const dialogProto = Object.getPrototypeOf(document.createElement("dialog"));
  dialogProto.showModal ??= function (this: any) { this.open = true; };
  dialogProto.close ??= function (this: any) { this.open = false; };
  installLoginMove(document as unknown as Document, { signedIn: () => state.signedIn, move });
  return { document, state, move, button: document.getElementById("moveToGoogleButton")! };
}

describe("Move to Google sign-in", () => {
  it("sits above Delete Account and shows only for a signed-in account", () => {
    const f = fixture(false);
    expect(f.button.parentElement!.nextElementSibling!.querySelector("#deleteAccountButton")).not.toBeNull();
    expect(f.button.parentElement!.hidden).toBe(true);
    f.state.signedIn = true;
    f.document.body.dispatchEvent(new f.document.defaultView!.Event("click", { bubbles: true }));
    expect(f.button.parentElement!.hidden).toBe(false);
  });
  it("asks first, then shows why a move could not start", async () => {
    const f = fixture();
    f.button.dispatchEvent(new f.document.defaultView!.Event("click"));
    expect(f.move).not.toHaveBeenCalled();
    f.document.querySelector<HTMLButtonElement>("[data-move-confirm]")!.dispatchEvent(new f.document.defaultView!.Event("click"));
    expect(f.move).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(f.document.querySelector(".login-move-status")!.textContent).toBe("Sign in to your character first."));
  });
});
