import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "../../src/i18n/en.ts";
import { zhCN } from "../../src/i18n/zh-CN.ts";
import { AboutDialog } from "../../src/ui/about-dialog.tsx";

beforeEach(() => vi.stubGlobal("__YELI_VERSION__", "0.1.0"));
afterEach(() => vi.unstubAllGlobals());

describe.each([
  { labels: en, locale: "en" as const },
  { labels: zhCN, locale: "zh-CN" as const },
])("About file copy ($locale)", ({ labels, locale }) => {
  function render(saveKind?: "artifact" | "markdown") {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <AboutDialog
        canDirectSave={false}
        labels={labels}
        locale={locale}
        onClose={() => undefined}
        recoveryAvailable={false}
        {...(saveKind ? { saveKind } : {})}
        saveDisclosure={null}
        saveDisclosureLoading={false}
      />,
    );
    return host;
  }

  it("describes Markdown sharing and text attachments", () => {
    const host = render("markdown");

    expect(host.querySelector(".about-file-format")?.textContent).toBe(".md");
    expect(host.querySelector(".about-file-size")?.textContent).toContain(
      labels.aboutMarkdownIncludes,
    );
    expect(host.querySelector(".about-share-note p")?.textContent).toBe(
      labels.aboutSharing + labels.aboutMarkdownTrust,
    );
    expect(host.querySelector(".about-attachment-note")?.textContent).toBe(
      labels.disclosureMarkdownAttachmentSharing,
    );
    expect(host.textContent).not.toContain(labels.aboutTrust);
    expect(host.textContent).not.toContain(labels.disclosureAttachmentSharing);
    expect(host.textContent).not.toContain(".yeli.html");
    expect(host.textContent).not.toContain(labels.aboutVerification);
    expect(host.querySelector(".about-description")?.textContent).toBe(
      labels.webAboutDescription,
    );
  });

  it.each([undefined, "artifact"] as const)(
    "preserves artifact sharing and attachment copy (%s)",
    (mode) => {
      const host = render(mode);

      expect(host.querySelector(".about-file-format")?.textContent).toBe(
        ".yeli.html",
      );
      expect(host.querySelector(".about-file-size")?.textContent).toContain(
        labels.aboutArtifactIncludes,
      );
      expect(host.querySelector(".about-share-note p")?.textContent).toBe(
        labels.aboutSharing + labels.aboutTrust,
      );
      expect(host.querySelector(".about-attachment-note")?.textContent).toBe(
        labels.disclosureAttachmentSharing,
      );
      expect(host.textContent).not.toContain(labels.aboutMarkdownTrust);
    },
  );
});
