import type { wildstatCoop } from "../../wildstat-coop";
import type { WildstatNativeBridge } from "../../app/native-ads";

declare global {
  interface Document {
    webkitExitFullscreen?: () => void;
    webkitFullscreenElement?: Element | null;
  }

  interface HTMLElement {
    webkitRequestFullscreen?: () => void;
  }

  interface Window {
    wildstatCoop?: typeof wildstatCoop;
    /** Compatibility alias for browser integrations created before the rename. */
    wildwoodCoop?: typeof wildstatCoop;
    /** Injected by the iOS/Android wrapper before game startup. */
    wildstatNative?: WildstatNativeBridge;
    /** Accepted while older native wrappers are still in use. */
    wildwoodNative?: WildstatNativeBridge;
  }
}

export {};
