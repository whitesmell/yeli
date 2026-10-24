import { describe, expect, it } from "vitest";

import { projectMarkdown } from "../../src/editor/block-projection.ts";
import {
  imageBlockDetails,
  isInspectableImageBlock,
} from "../../src/ui/image-block.ts";

describe("image block inspection", () => {
  it("extracts a projected image's alt text and target", () => {
    const [image] = projectMarkdown(
      "![quiet workspace](yeli-demo:workspace-photo)\n",
      1,
    ).blocks;

    expect(imageBlockDetails(image)).toEqual({
      alternative: "quiet workspace",
      target: "yeli-demo:workspace-photo",
      title: "",
    });
    expect(isInspectableImageBlock(image!)).toBe(true);
  });

  it("extracts an optional standard Markdown image title", () => {
    const [image] = projectMarkdown(
      '![quiet workspace](yeli-demo:workspace-photo "Morning notes")\n',
      1,
    ).blocks;

    expect(imageBlockDetails(image)).toEqual({
      alternative: "quiet workspace",
      target: "yeli-demo:workspace-photo",
      title: "Morning notes",
    });
  });

  it.each([
    ["ordinary paragraph", "Plain paragraph.\n"],
    ["malformed image-like paragraph", "![missing target](\n"],
  ])("rejects an %s", (_case, markdown) => {
    const [paragraph] = projectMarkdown(markdown, 1).blocks;

    expect(imageBlockDetails(paragraph)).toBeNull();
    expect(isInspectableImageBlock(paragraph!)).toBe(false);
  });

  it("returns no details without a projected block", () => {
    expect(imageBlockDetails(undefined)).toBeNull();
  });
});
