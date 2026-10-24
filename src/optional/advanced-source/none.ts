import type { AdvancedModePlugin } from "./plugin-api.ts";

export const advancedModePlugin: AdvancedModePlugin = {
  enabled: false,
  menuLabel: () => "",
  MenuIcon: null,
  View: null,
};
