import { AGE_SLIDER_MAX, MINIMUM_PLAYER_AGE } from "../../shared/legal";

type LegalGateElements = {
  panel: HTMLElement;
  ageSlider: HTMLInputElement;
  ageOutput: HTMLOutputElement;
  agreement: HTMLInputElement;
  termsLink: HTMLAnchorElement;
  continueButton: HTMLButtonElement;
  status: HTMLElement;
};

type LegalGateDependencies = {
  accept: (age: number) => Promise<{ ok?: boolean; error?: string } | undefined> | { ok?: boolean; error?: string } | undefined;
  onAccepted: () => void;
};

export function legalGateElements(documentValue = document): LegalGateElements {
  function get<T extends HTMLElement>(id: string) {
    const element = documentValue.getElementById(id);
    if (!element) throw new Error(`Missing legal gate element #${id}`);
    return element as T;
  }
  return {
    panel: get("legalGatePanel"),
    ageSlider: get("legalAgeSlider"),
    ageOutput: get<HTMLOutputElement>("legalAgeOutput"),
    agreement: get<HTMLInputElement>("legalTermsAgreement"),
    termsLink: get<HTMLAnchorElement>("legalTermsLink"),
    continueButton: get<HTMLButtonElement>("legalContinueBtn"),
    status: get("legalGateStatus"),
  };
}

export function createLegalGateController(
  dependencies: LegalGateDependencies,
  elements = legalGateElements(),
) {
  let ageSelected = false;
  let pending = false;
  let statusOverride = "";

  function render() {
    const age = Number(elements.ageSlider.value);
    const eligible = ageSelected && Number.isInteger(age) && age >= MINIMUM_PLAYER_AGE;
    elements.ageSlider.classList.toggle("is-unset", !ageSelected);
    elements.ageSlider.setAttribute("aria-valuetext", ageSelected
      ? age >= AGE_SLIDER_MAX ? `${AGE_SLIDER_MAX} or older` : String(age)
      : "Not selected");
    elements.ageOutput.textContent = ageSelected
      ? age >= AGE_SLIDER_MAX ? `${AGE_SLIDER_MAX}+` : String(age)
      : "—";
    elements.agreement.disabled = !eligible || pending;
    if (!eligible) elements.agreement.checked = false;
    elements.continueButton.disabled = pending || !eligible || !elements.agreement.checked;
    elements.continueButton.textContent = pending ? "Saving…" : "Continue";
    elements.status.classList.toggle("is-blocked", ageSelected && !eligible);
    elements.status.textContent = statusOverride || (!ageSelected
      ? "Select your age to continue."
      : !eligible
        ? `Wildwood is currently available to players age ${MINIMUM_PLAYER_AGE} and older.`
        : !elements.agreement.checked
          ? "Review and agree to the Terms to continue."
          : "");
  }

  async function accept() {
    if (elements.continueButton.disabled || !ageSelected) return;
    pending = true;
    statusOverride = "";
    render();
    const result = await dependencies.accept(Number(elements.ageSlider.value));
    pending = false;
    if (result?.ok !== true) {
      statusOverride = result?.error || "Could not save your agreement. Try again.";
      render();
      return;
    }
    elements.panel.hidden = true;
    dependencies.onAccepted();
  }

  function onAgeInput() {
    ageSelected = true;
    statusOverride = "";
    render();
  }

  function onAgreementChange() {
    statusOverride = "";
    render();
  }

  function onTermsLinkClick(event: Event) {
    event.stopPropagation();
  }

  function onContinue() {
    void accept();
  }

  elements.ageSlider.addEventListener("input", onAgeInput);
  elements.ageSlider.addEventListener("click", onAgeInput);
  elements.agreement.addEventListener("change", onAgreementChange);
  elements.termsLink.addEventListener("click", onTermsLinkClick);
  elements.continueButton.addEventListener("click", onContinue);

  return {
    dispose() {
      elements.ageSlider.removeEventListener("input", onAgeInput);
      elements.ageSlider.removeEventListener("click", onAgeInput);
      elements.agreement.removeEventListener("change", onAgreementChange);
      elements.termsLink.removeEventListener("click", onTermsLinkClick);
      elements.continueButton.removeEventListener("click", onContinue);
    },
    hide() { elements.panel.hidden = true; },
    show() {
      elements.panel.hidden = false;
      render();
    },
  };
}

export type { LegalGateDependencies, LegalGateElements };
