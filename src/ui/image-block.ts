import {
  createConstructPatch,
  type SourceBlock,
} from "../editor/block-projection.ts";

export interface ImageBlockDetails {
  alternative: string;
  target: string;
  title: string;
}

export function imageBlockDetails(
  block: SourceBlock | undefined,
): ImageBlockDetails | null {
  if (
    !block ||
    block.kind !== "paragraph" ||
    !block.expectedText.trimStart().startsWith("![")
  ) {
    return null;
  }

  try {
    return {
      alternative: createConstructPatch(block, { kind: "image-alt" }, "")
        .expectedText,
      target: createConstructPatch(block, { kind: "image-target" }, "")
        .expectedText,
      title: createConstructPatch(block, { kind: "image-title" }, "")
        .expectedText,
    };
  } catch {
    return null;
  }
}

export function isInspectableImageBlock(block: SourceBlock): boolean {
  return imageBlockDetails(block) !== null;
}
