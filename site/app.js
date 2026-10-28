(() => {
  "use strict";
  const en = {
    onlineEditor: "Edit online",
    onlineEditorGuide:
      "Create or open a local Markdown file. Content is not uploaded.",
    skip: "Skip to product",
    navigation: "Main navigation",
    navEditor: "Editor",
    navDelivery: "Delivery & reuse",
    navOpen: "Open source",
    docs: "Docs",
    language: "Language",
    menu: "Open navigation",
    heroLine1: "A Markdown editor.",
    heroLine2: "For you. And AI.",
    heroSub1: "Read https://yeli.zetury.com/skill.md ",
    heroSub2: "and follow the instructions to create and edit Yeli documents.",
    promptLabel: "Send this instruction to your Agent",
    copyPrompt: "Copy instruction",
    copiedLabel: "Copied",
    copiedPrompt: "Copied. Paste it into your Agent's conversation.",
    manualCopy:
      "Instruction selected. Copy it and paste it into your Agent's conversation.",
    demo: "Open example",
    agentGuide: "Agent guide",
    heroAlt:
      "A person edits the page while an external Agent works with the connected Markdown beneath it. Two ways to work on the same document.",
    agentAudience: "AI Agent",
    agentContext: "Understand context. Keep working.",
    offline: "Works offline · Saved locally",
    editorTitle: "Edit directly. See what you mean.",
    editorLead:
      "Focus on your ideas, without switching between source and preview.",
    editorDemo: "Open the Yeli editor example in a new tab",
    editorAlt:
      "Actual Yeli editor with the graphic logo and Yeli wordmark, a separate document title, outline and WYSIWYG editing canvas.",
    tryEditor: "Open editor",
    syntax: "Markdown essentials",
    syntaxDesc: "Headings, lists, tables and tasks.",
    learnMarkdown: "Learn Markdown",
    editingGuide: "Editing guide",
    shortcuts: "Familiar shortcuts",
    shortcutsDesc: "Format, find and save.",
    seeShortcuts: "View shortcuts",
    readEdit: "Read. Or edit.",
    readEditDesc: "Tools when you write. Focus when you read.",
    agentTitle: "Your Agent delivers. You keep writing.",
    agentLead:
      "Meeting notes, research reports and project plans, delivered with the editor inside.",
    pipeline: "Pre-read, patch, then validate",
    preRead: "Pre-read",
    executionPlan: "Execution plan",
    lineRange: "Lines 10–14",
    located: "Target section located",
    patch: "Patch",
    line12: "Line 12",
    diffBefore: "Verify reading and editing.",
    diffAfter: "Verify page editing and source read/write.",
    updated: "Line 12 updated",
    validate: "Validate",
    validated: "Validation passed",
    shellStable: "Runtime shell unchanged",
    fileFormat: "File format",
    formatDesc: "Markdown source and a structural index.",
    cliDesc: "Pre-read, patch and validate.",
    cliReference: "See how it works",
    skillDesc: "From first-time setup to a finished document.",
    deliveryTitle: "New tools. The same work.",
    deliveryLead:
      "The source and editor travel with your file, ready for the next revision.",
    withoutLabel: "Without Yeli",
    without: "Separate files. Separate upkeep.",
    sourceMd: "Source .md",
    withoutDesc: "Revise the source. Convert and deliver again.",
    withLabel: "With Yeli",
    with: "One Yeli file. Keep working.",
    oneFile: "One .yeli.html",
    trustedTemplate: "Built from a trusted Yeli template",
    source: "Source",
    assets: "Assets",
    withDesc: "Open, read and edit. Let an external Agent continue.",
    knowledgeLabel: "Project knowledge, carried with the file",
    knowledgeTitle: "Carry the work—and how it was done—forward.",
    background: "Context & goals",
    backgroundDesc: "The problem, decision criteria and definition of done.",
    results: "Results & source",
    resultsDesc: "Key deliverables and their Markdown source.",
    methods: "Methods & evidence",
    methodsDesc: "Approaches, references and supporting evidence.",
    records: "Tasks & validation",
    recordsDesc: "Task records, changes and validation results.",
    reviewNote:
      "Keep decisions, source, evidence and validation together, so the next task can pick up where this one ended.",
    openTitle: "Start here.",
    openLead: "Explore the source. Build with us.",
    readDocs: "Read the docs",
    getStarted: "Get started",
    quickstart: "Quick start",
    developers: "Developers & Agents",
    and: "&",
    participate: "Contribute",
    contributing: "Contribution guide",
    projectStatus: "Project status",
    license: "License",
    footer: "Local files · Offline work · Your assets, under your control",
    close: "Close documentation",
  };
  const zh = {};
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    zh[el.dataset.i18n] = el.textContent;
  });
  document.querySelectorAll("[data-label]").forEach((el) => {
    zh[el.dataset.label] = el.getAttribute("aria-label") || "";
  });
  document.querySelectorAll("[data-alt]").forEach((el) => {
    zh[el.dataset.alt] = el.alt;
  });
  const docs = JSON.parse(document.getElementById("embedded-docs").textContent);
  const config = JSON.parse(document.getElementById("site-config").textContent);
  const dialog = document.getElementById("docs-dialog");
  const content = document.getElementById("dialog-content");
  const language = document.getElementById("language");
  const menuButton = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-menu");
  const editorImage = document.querySelector(".editor-link > img");
  const editorImageZh = editorImage.getAttribute("src");
  const prompt = document.getElementById("agent-prompt");
  const chinesePrompt = prompt.value;
  const copyButton = document.getElementById("copy-agent-prompt");
  const copyLabel = copyButton.querySelector("[data-i18n]");
  const copyStatus = document.getElementById("agent-copy-status");
  Object.assign(zh, {
    heroSub1: chinesePrompt,
    heroSub2: "",
    copiedLabel: "已复制",
    copiedPrompt: "已复制，粘贴到你的 Agent 对话中即可。",
    manualCopy: "已选中指令，请复制后粘贴到你的 Agent 对话中。",
  });
  copyButton.disabled = false;
  let copyVersion = 0;
  let locale = "zh-CN";
  let currentDoc = "";
  let returnFocus = null;

  function fitPrompt() {
    prompt.style.height = "auto";
    prompt.style.height = `${prompt.scrollHeight + 2}px`;
  }
  prompt.addEventListener("focus", () => prompt.select());
  prompt.addEventListener("click", () => prompt.select());
  copyButton.addEventListener("click", async () => {
    const version = ++copyVersion;
    const instruction = prompt.value;
    const text = locale === "en" ? en : zh;
    try {
      await navigator.clipboard.writeText(instruction);
      if (version !== copyVersion) return;
      copyLabel.textContent = text.copiedLabel;
      copyStatus.textContent = text.copiedPrompt;
    } catch {
      if (version !== copyVersion) return;
      copyLabel.textContent = text.copyPrompt;
      prompt.focus();
      prompt.select();
      copyStatus.textContent = text.manualCopy;
    }
  });

  function closeMenu() {
    menu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  }
  function renderDoc(id) {
    const doc = docs[id]?.[locale] || docs[id]?.["zh-CN"];
    if (!doc) return false;
    currentDoc = id;
    document.getElementById("dialog-title").textContent = doc.title;
    content.innerHTML = doc.html;
    dialog.querySelector(".dialog-scroll").scrollTop = 0;
    return true;
  }
  function openDoc(id, trigger) {
    const routes = {
      start: "yeli/quickstart.html",
      agent: "yeli/agent.html",
      cli: "yeli/agent.html",
      guide: "yeli/writing.html",
      shortcuts: "yeli/shortcuts.html",
      docs: "index.html",
    };
    if (routes[id]) {
      location.assign(`docs/${locale}/${routes[id]}`);
      return;
    }
    if (!renderDoc(id)) return;
    closeMenu();
    if (!dialog.open) {
      returnFocus = trigger || document.activeElement;
      dialog.showModal();
      dialog.querySelector(".close-dialog").focus();
    }
  }
  function setLanguage(value, remember = true) {
    locale = value === "en" ? "en" : "zh-CN";
    const text = locale === "en" ? en : zh;
    copyVersion++;
    copyStatus.textContent = "";
    prompt.value = locale === "en" ? en.heroSub1 + en.heroSub2 : chinesePrompt;
    fitPrompt();
    document.documentElement.lang = locale;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = text[el.dataset.i18n] ?? zh[el.dataset.i18n];
    });
    document.querySelectorAll("[data-label]").forEach((el) => {
      el.setAttribute(
        "aria-label",
        text[el.dataset.label] ?? zh[el.dataset.label],
      );
    });
    document.querySelectorAll("[data-alt]").forEach((el) => {
      el.alt = text[el.dataset.alt] ?? zh[el.dataset.alt];
    });
    editorImage.src =
      locale === "en" ? editorImage.dataset.srcEn : editorImageZh;
    document.querySelectorAll("[data-demo]").forEach((el) => {
      el.href = `sample.${locale}.yeli.html`;
    });
    document.querySelectorAll("[data-tutorial]").forEach((el) => {
      el.href = `docs/${locale}/${el.dataset.tutorial}`;
    });
    document.querySelectorAll("[data-language]").forEach((el) => {
      el.setAttribute("aria-current", String(el.dataset.language === locale));
    });
    document.querySelectorAll(".brand").forEach((el) => {
      el.setAttribute(
        "aria-label",
        locale === "en" ? "Yeli home" : "Yeli 首页",
      );
    });
    language.value = locale;
    document.title =
      locale === "en"
        ? "Yeli — A Markdown editor for you and AI"
        : "Yeli 页里 — 人和 AI 都好用的 Markdown 编辑器";
    document.querySelector('meta[name="description"]').content =
      `${text.heroLine1} ${text.heroLine2} ${text.heroSub1} ${text.heroSub2}`;
    if (dialog.open && currentDoc) renderDoc(currentDoc);
    try {
      const url = new URL(location.href);
      url.searchParams.set("lang", locale);
      history.replaceState(null, "", url);
    } catch {
      /* file: URLs can restrict history updates. */
    }
    if (remember) {
      try {
        localStorage.setItem("yeli-homepage-language", locale);
      } catch {
        /* Optional preference. */
      }
    }
  }
  function resource(kind, trigger) {
    const href = config[kind];
    if (href && /^https:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      openDoc(kind, trigger);
    }
  }
  language.addEventListener("change", () => setLanguage(language.value));
  menuButton.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    menuButton.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", (event) => {
    const el = event.target.closest("a,button");
    if (!el) return;
    if (el.dataset.language) setLanguage(el.dataset.language);
    if (el.hasAttribute("data-repository")) resource("repository", el);
    if (el.hasAttribute("data-license")) resource("license", el);
    const docId =
      el.dataset.doc ||
      (el.getAttribute("href")?.startsWith("#doc:")
        ? el.getAttribute("href").slice(5)
        : "");
    if (docId) {
      event.preventDefault();
      if (el.dataset.docLanguage) setLanguage(el.dataset.docLanguage);
      openDoc(docId, el);
    }
    if (el.hasAttribute("data-local-heading")) {
      event.preventDefault();
      const slug = (text) =>
        text
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]/gu, "")
          .replace(/\s+/g, "-");
      const target = [...content.querySelectorAll("h1,h2,h3,h4")].find(
        (h) => slug(h.textContent) === el.dataset.localHeading,
      );
      target?.scrollIntoView({ block: "start" });
    }
    if (el.closest("#mobile-menu") && !docId) closeMenu();
    if (!el.closest(".nav,.mobile-menu") && !menu.hidden) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      closeMenu();
      menuButton.focus();
    }
  });
  dialog
    .querySelector(".close-dialog")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    returnFocus?.focus();
    currentDoc = "";
  });
  window.addEventListener("resize", () => {
    fitPrompt();
    if (innerWidth > 720) closeMenu();
  });
  let initial = new URLSearchParams(location.search).get("lang");
  if (!initial) {
    try {
      initial = localStorage.getItem("yeli-homepage-language");
    } catch {
      /* Default to Chinese. */
    }
  }
  setLanguage(initial || "zh-CN", false);
})();
