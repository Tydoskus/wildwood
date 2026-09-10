/** Set only by the packaged phone preview's bootstrap, never by the web build. */
export function isNativePreview(runtime: unknown = window): boolean {
  return (runtime as { WILDSTAT_NATIVE_PREVIEW?: unknown } | undefined)?.WILDSTAT_NATIVE_PREVIEW === true;
}
