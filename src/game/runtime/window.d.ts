import type { wildwoodCoop } from "../../wildwood-coop";
import type { WildwoodNativeBridge } from "../../app/native-ads";

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
    /** Injected by the iOS/Android wrapper before game startup. */
    wildwoodNative?: WildwoodNativeBridge;
  }
}

export {};
