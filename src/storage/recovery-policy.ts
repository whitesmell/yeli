const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLoopbackHttp(currentLocation: Location): boolean {
  try {
    return loopbackHosts.has(new URL(currentLocation.origin).hostname);
  } catch {
    return false;
  }
}

export function persistentRecoveryAllowed(
  ownerDocument: Document = document,
  currentLocation: Location = location,
  storage: IDBFactory | undefined = globalThis.indexedDB,
): boolean {
  if (!storage) return false;
  if (currentLocation.protocol === "file:") return true;
  if (currentLocation.protocol === "http:" && isLoopbackHttp(currentLocation)) {
    return true;
  }
  if (currentLocation.protocol !== "https:") return false;
  const configured = ownerDocument.querySelector<HTMLMetaElement>(
    'meta[name="yeli:trusted-recovery-origin"]',
  );
  return configured?.content === currentLocation.origin;
}
