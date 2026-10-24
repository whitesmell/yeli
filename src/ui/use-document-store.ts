import { useSyncExternalStore } from "react";

import type { DocumentStore } from "../document/store.ts";

export function useDocumentStore(store: DocumentStore) {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
