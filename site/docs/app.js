(() => {
  "use strict";
  const data = JSON.parse(document.getElementById("search-data").textContent);
  const input = document.getElementById("docs-search");
  const results = document.getElementById("search-results");
  const status = document.getElementById("search-status");
  input.form.hidden = false;
  if (matchMedia("(max-width: 720px)").matches) {
    document.querySelectorAll(".sidebar details").forEach((section) => {
      section.open = false;
    });
  }
  const zh = data.locale === "zh-CN";
  const normalized = (value) => value.normalize("NFKC").toLocaleLowerCase();
  const entries = data.entries.map((entry) => ({
    ...entry,
    haystack: normalized(`${entry.title}\n${entry.description}\n${entry.text}`),
  }));
  input.form.addEventListener("submit", (event) => event.preventDefault());
  input.addEventListener("input", () => {
    const terms = normalized(input.value.trim()).split(/\s+/u).filter(Boolean);
    results.replaceChildren();
    results.hidden = terms.length === 0;
    status.textContent = "";
    if (!terms.length) return;
    const matches = entries.filter((entry) =>
      terms.every((term) => entry.haystack.includes(term)),
    );
    status.textContent = zh
      ? matches.length
        ? `找到 ${matches.length} 篇教程`
        : "没有匹配教程。试试其他关键词。"
      : matches.length
        ? `${matches.length} matching tutorials`
        : "No matching tutorials. Try another keyword.";
    for (const match of matches) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `${data.prefix}${match.id}.html`;
      link.textContent = match.title;
      const excerpt = document.createElement("p");
      excerpt.textContent = match.description;
      item.append(link, excerpt);
      results.append(item);
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    input.value = "";
    input.dispatchEvent(new Event("input"));
  });
})();
