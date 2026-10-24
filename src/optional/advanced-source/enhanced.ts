import { CommandLineIcon } from "@heroicons/react/24/outline";

import { AdvancedView } from "./advanced-view.tsx";
import type { AdvancedModePlugin } from "./plugin-api.ts";
import "./plugin.css";

export const advancedModePlugin: AdvancedModePlugin = {
  enabled: true,
  menuLabel: (locale) => (locale === "zh-CN" ? "高级视图" : "Advanced View"),
  MenuIcon: CommandLineIcon,
  View: AdvancedView,
};
