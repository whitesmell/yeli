import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/{unit,integration,security}/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
