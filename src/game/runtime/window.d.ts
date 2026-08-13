import type { wildwoodCoop } from "../../wildwood-coop";

declare global {
  interface Document {
    webkitExitFullscreen?: () => void;
    webkitFullscreenElement?: Element | null;
  }

  interface HTMLElement {
    webkitRequestFullscreen?: () => void;
  }

  interface Window {
    wildwoodCoop?: typeof wildwoodCoop;
  }
}

export {};
