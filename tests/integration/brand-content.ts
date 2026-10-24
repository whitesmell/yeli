import { createHash } from "node:crypto";

export const brandContentDigests = [
  "a376ba96ad5daf0beef0747b2ee3f4726dc23d9559c558a062ce21acf1fc8813",
  "0c8a54523c19212fc67a27cf8e3e46bb618bc860b695d0439c7490d0fa7d8d8e",
  "80f2aed3c618c423ddf05a2891229fba44942d907173152442cf6591441ed6dc",
];

const foldedDigests = new Set([
  "fbdac1346f8cdbfc4f456f7e0ff28476eef645a45710ef0122e84173f11ea37c",
  "6177321eac992341d1ad0823a07e76bfc4ee6909db120e377ea303fdc216756c",
  "6326e0e8cfdaab9af83026a0620bafd05179e3a0cd1b812222682d86285b30cc",
]);

export function contentDigest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function hasBrandContent(text: string) {
  return (text.toLowerCase().match(/[a-z]{4,}/gu) ?? []).some((word) =>
    foldedDigests.has(contentDigest(word)),
  );
}
