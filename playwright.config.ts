import { defineConfig, devices } from "@playwright/test";
import { release } from "node:os";

const darwinMajor = Number.parseInt(release().split(".")[0] ?? "0", 10);
const canRunCurrentWebkit =
  process.platform !== "darwin" ||
  darwinMajor >= 24 ||
  process.env.YELI_FORCE_WEBKIT === "1";

const webkitProjects = canRunCurrentWebkit
  ? [
      {
        name: "webkit-desktop",
        use: { ...devices["Desktop Safari"] },
      },
      {
        name: "webkit-mobile",
        use: { ...devices["iPhone 13"] },
      },
    ]
  : [];

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
    },
    ...webkitProjects,
  ],
});
