import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  indexFrontmatter,
  patchFrontmatter,
} from "../../src/document/frontmatter";

const fixture = readFileSync(
  resolve("tests/fixtures/fidelity/frontmatter-preserve.md"),
  "utf8",
);

describe("frontmatter range index", () => {
  it("indexes and edits BOM-prefixed frontmatter without moving the BOM or custom fields", () => {
    const source = `\ufeff${fixture}`;
    const index = indexFrontmatter(source);
    expect(index.status).toBe("safe");
    expect(index.metadata.title).toBe("Old title");
    expect(index.frontmatterRange).toEqual([1, source.indexOf("\n# Body")]);
    expect(
      index.properties.find((property) => property.key === "custom-safe"),
    ).toMatchObject({ value: "keep  two  spaces" });
    expect(index.entries.title?.valueRange).toEqual([
      source.indexOf('"Old title"'),
      source.indexOf('"Old title"') + '"Old title"'.length,
    ]);

    const result = patchFrontmatter(source, "title", "New title");

    expect(result).toMatchObject({
      ok: true,
      source: source.replace('"Old title"', '"New title"'),
    });
    if (!result.ok) return;
    expect(result.changedRange.before).toEqual(index.entries.title?.valueRange);
    expect(result.source[0]).toBe("\ufeff");
    expect(result.source.slice(1).match(/^---$/gmu)).toHaveLength(2);
    expect(indexFrontmatter(result.source).metadata.title).toBe("New title");
  });

  it("inserts the first metadata block after a BOM and preserves the body", () => {
    expect(patchFrontmatter("\ufeff# Body\n", "title", "Title")).toMatchObject({
      ok: true,
      changedRange: { before: [1, 1] },
      source: "\ufeff---\ntitle: Title\n---\n# Body\n",
    });
  });

  it.each([
    "\ufeff---\ntitle: Unclosed\n",
    "\ufeff---\r\ntitle: Windows\r\n---\r\nBody\r\n",
  ])(
    "rejects unsupported BOM frontmatter edits without changing source %j",
    (source) => {
      expect(indexFrontmatter(source).status).toBe("unsafe");
      expect(patchFrontmatter(source, "title", "Changed")).toMatchObject({
        ok: false,
        source,
      });
    },
  );

  it("indexes core metadata while retaining concrete source spans", () => {
    const index = indexFrontmatter(fixture);

    expect(index.status).toBe("safe");
    expect(index.metadata).toMatchObject({
      title: "Old title",
      description: "first line second line\n",
      tags: ["alpha", "two words"],
      lang: "en-US",
    });
    expect(index.entries.title?.valueRange).toEqual([
      fixture.indexOf('"Old title"'),
      fixture.indexOf('"Old title"') + '"Old title"'.length,
    ]);
  });

  it("patches one known value without reserializing untouched frontmatter", () => {
    const result = patchFrontmatter(fixture, "title", "New title");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe(fixture.replace('"Old title"', '"New title"'));
    expect(result.changedRange.before).toEqual([
      fixture.indexOf('"Old title"'),
      fixture.indexOf('"Old title"') + '"Old title"'.length,
    ]);
  });

  it("preserves the line boundary when replacing a multiline scalar", () => {
    const result = patchFrontmatter(fixture, "description", "replacement");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe(
      fixture.replace(">\n  first line\n  second line\n", "replacement\n"),
    );
    expect(result.source).toContain(
      'description: replacement\ntags: [alpha, "two words"]',
    );
  });

  it("creates frontmatter only on the first metadata edit", () => {
    const result = patchFrontmatter("# Body\n", "lang", "zh-CN");

    expect(result).toMatchObject({
      ok: true,
      source: "---\nlang: zh-CN\n---\n# Body\n",
    });
  });

  it("quotes numeric-looking metadata so authored strings stay strings", () => {
    const result = patchFrontmatter("# Body\n", "tags", ["2026", "alpha"]);

    expect(result).toMatchObject({
      ok: true,
      source: '---\ntags: ["2026", alpha]\n---\n# Body\n',
    });
    if (!result.ok) return;
    expect(indexFrontmatter(result.source).metadata.tags).toEqual([
      "2026",
      "alpha",
    ]);
  });

  it("indexes custom values without promoting them to core manifest metadata", () => {
    const index = indexFrontmatter(
      "---\nstatus: Draft\nrating: 4.5\npublished: false\nreview: 2026-10-24\nrelated: [one, two]\nextra: {owner: Ada}\n---\nBody",
    );
    expect(
      index.properties.map(({ key, value, editable }) => ({
        key,
        value,
        editable,
      })),
    ).toEqual([
      { key: "status", value: "Draft", editable: true },
      { key: "rating", value: 4.5, editable: true },
      { key: "published", value: false, editable: true },
      { key: "review", value: "2026-10-24", editable: true },
      { key: "related", value: ["one", "two"], editable: true },
      { key: "extra", value: undefined, editable: false },
    ]);
    expect(index.metadata).toEqual({});
  });

  it("patches and removes custom properties with narrow diffs", () => {
    const source = "---\n# keep\nrating: 1 # score\nextra: {x: y}\n---\nBody\n";
    const changed = patchFrontmatter(source, "rating", 2);
    expect(changed).toMatchObject({
      ok: true,
      source: source.replace("rating: 1", "rating: 2"),
    });
    const removed = patchFrontmatter(source, "rating", undefined);
    expect(removed).toMatchObject({
      ok: true,
      source: source.replace("rating: 1 ", ""),
    });
    expect(patchFrontmatter(source, "extra", "lost")).toMatchObject({
      ok: false,
      source,
    });
  });

  it("keeps multiline boundaries and validates the result before accepting a patch", () => {
    const source =
      "---\ntags:\n  - one\n  - two\n# next\ntitle: Hello\n---\nBody";
    const result = patchFrontmatter(source, "tags", ["three"]);
    expect(result).toMatchObject({
      ok: true,
      source: "---\ntags:\n  [three]\n# next\ntitle: Hello\n---\nBody",
    });
    expect(
      patchFrontmatter("---\ntitle: 'hello'\n---\n", "title", "a\nb"),
    ).toMatchObject({
      ok: true,
      source: '---\ntitle: "a\\nb"\n---\n',
    });
  });

  it("preserves an empty frontmatter and its comments after removing the last field", () => {
    const result = patchFrontmatter(
      "---\n# keep\nproject: Yeli\n---\nBody",
      "project",
      undefined,
    );
    expect(result).toMatchObject({
      ok: true,
      source: "---\n# keep\n---\nBody",
    });
    if (result.ok) {
      expect(indexFrontmatter(result.source).status).toBe("safe");
      expect(patchFrontmatter(result.source, "project", "Again")).toMatchObject(
        {
          ok: true,
          source: "---\n# keep\nproject: Again\n---\nBody",
        },
      );
    }
  });

  it("keeps integers beyond JavaScript precision read-only instead of rounding them", () => {
    const source = "---\ncount: 9007199254740993\n---\nBody";
    expect(indexFrontmatter(source).properties[0]).toMatchObject({
      key: "count",
      editable: false,
    });
    expect(patchFrontmatter(source, "title", "Safe")).toMatchObject({
      ok: true,
      source: source.replace("---\nBody", "title: Safe\n---\nBody"),
    });
    expect(patchFrontmatter(source, "count", 9007199254740992)).toMatchObject({
      ok: false,
      source,
    });
  });

  it.each([
    ["__proto__", "x"],
    ["bad\nkey", "x"],
    ["title", 42],
    ["tags", "one"],
    ["rating", Number.NaN],
  ])("rejects invalid property edits: %s", (key, value) => {
    expect(patchFrontmatter("# Body", key, value)).toMatchObject({
      ok: false,
      source: "# Body",
    });
  });

  it.each([
    [
      "duplicate core key",
      "---\ntitle: one\ntitle: two\n---\n",
      "DUPLICATE_CORE_KEY",
    ],
    [
      "alias",
      "---\ntitle: &name one\ndescription: *name\n---\n",
      "YAML_ALIAS_UNSAFE",
    ],
    [
      "duplicate custom key",
      "---\nstatus: one\nstatus: two\n---\n",
      "DUPLICATE_PROPERTY_KEY",
    ],
    [
      "compact root mapping",
      "---\n{title: Hi, project: Yeli}\n---\n",
      "FRONTMATTER_FLOW_MAPPING",
    ],
    ["custom tag", "---\ntitle: !danger value\n---\n", "YAML_TAG_UNSAFE"],
  ])("fails closed for %s", (_label, source, code) => {
    const result = patchFrontmatter(source, "title", "Changed");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.findings.map((finding) => finding.code)).toContain(code);
    expect(result.source).toBe(source);
  });
});
