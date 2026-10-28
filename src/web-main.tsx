import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { createWebHost } from "./host/host.ts";
import { openMarkdownFile } from "./host/markdown-files.ts";
import {
  validateWebTemplate,
  type WebTemplateCapability,
} from "./host/web-template.ts";
import {
  IndexedDbStorageAdapter,
  MemoryStorageAdapter,
} from "./storage/recovery.ts";
import { persistentRecoveryAllowed } from "./storage/recovery-policy.ts";
import { WebSessionRepository } from "./storage/web-sessions.ts";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Yeli root element is missing");
let webTemplate: WebTemplateCapability = {
  available: false,
  reason: "missing",
};
try {
  const encoded = __YELI_WEB_TEMPLATE_BASE64__;
  const artifact = encoded
    ? new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)),
      )
    : "";
  webTemplate = await validateWebTemplate(
    artifact,
    __YELI_WEB_TEMPLATE_METADATA__,
    __YELI_VERSION__,
  );
} catch {
  webTemplate = { available: false, reason: "hash" };
}
const host = createWebHost(
  { ok: true, document: await openMarkdownFile("") },
  webTemplate,
);
host.webSessions = new WebSessionRepository(
  persistentRecoveryAllowed()
    ? new IndexedDbStorageAdapter()
    : new MemoryStorageAdapter(),
);
createRoot(root).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
