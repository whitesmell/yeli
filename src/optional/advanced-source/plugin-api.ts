import type { ComponentType } from "react";

import type { DocumentSnapshot, DocumentStore } from "../../document/store.ts";

export type AdvancedModeLocale = "en" | "zh-CN";

export interface AdvancedModeViewProps {
  locale: AdvancedModeLocale;
  onClose: () => void;
  snapshot: DocumentSnapshot;
  store: DocumentStore;
}

export interface AdvancedModePlugin {
  enabled: boolean;
  menuLabel: (locale: AdvancedModeLocale) => string;
  MenuIcon: ComponentType<{ "aria-hidden"?: boolean | "true" }> | null;
  View: ComponentType<AdvancedModeViewProps> | null;
}
