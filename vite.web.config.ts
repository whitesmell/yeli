import react from "@vitejs/plugin-react-swc";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { describeWebTemplate } from "./src/host/web-template.ts";

const version = (
  JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
).version;
const templatePath = resolve("dist/empty/empty.yeli.html");
const template = existsSync(templatePath)
  ? readFileSync(templatePath, "utf8")
  : null;
const metadata = template ? describeWebTemplate(template, version) : null;
export default defineConfig({
  root: resolve("site"),
  base: "./",
  resolve: {
    alias: {
      "#advanced-mode": resolve("src/optional/advanced-source/none.ts"),
    },
  },
  define: {
    __YELI_VERSION__: JSON.stringify(version),
    __YELI_WEB_TEMPLATE_BASE64__: JSON.stringify(
      template ? Buffer.from(template, "utf8").toString("base64") : null,
    ),
    __YELI_WEB_TEMPLATE_METADATA__: JSON.stringify(metadata),
  },
  plugins: [react()],
  build: {
    outDir: resolve("dist/site"),
    emptyOutDir: false,
    rolldownOptions: { input: resolve("site/editor/index.html") },
    target: "es2022",
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2048,
  },
});
