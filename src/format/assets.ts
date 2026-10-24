import { sha256BytesFallback } from "../document/freshness.ts";
import type {
  YeliAsset,
  YeliDocumentPayload,
  ValidationFinding,
} from "../document/model.ts";
import {
  DEFAULT_FORMAT_BUDGETS,
  type FormatBudgets,
} from "../document/schema.ts";

const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const CONTENT_ID = /^sha256:[a-f0-9]{64}$/u;
const SAFE_MIME_TYPES = new Set([
  "application/octet-stream",
  "application/pdf",
  "audio/mpeg",
  "audio/ogg",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "video/mp4",
  "video/webm",
]);

function finding(
  code: string,
  message: string,
  path: string,
): ValidationFinding {
  return { code, message, path, severity: "error" };
}

export function estimateDecodedBase64Bytes(data: string): number {
  if (data.length === 0) return 0;
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

export function decodeBase64(data: string): Uint8Array | null {
  if (!BASE64.test(data)) return null;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (
    (data.endsWith("==") &&
      (alphabet.indexOf(data[data.length - 3]!) & 0b1111) !== 0) ||
    (data.endsWith("=") &&
      !data.endsWith("==") &&
      (alphabet.indexOf(data[data.length - 2]!) & 0b11) !== 0)
  ) {
    return null;
  }
  const output = new Uint8Array(estimateDecodedBase64Bytes(data));
  let outputIndex = 0;
  for (let index = 0; index < data.length; index += 4) {
    const first = alphabet.indexOf(data[index]!);
    const second = alphabet.indexOf(data[index + 1]!);
    const third =
      data[index + 2] === "=" ? 0 : alphabet.indexOf(data[index + 2]!);
    const fourth =
      data[index + 3] === "=" ? 0 : alphabet.indexOf(data[index + 3]!);
    const combined = (first << 18) | (second << 12) | (third << 6) | fourth;
    if (outputIndex < output.length) output[outputIndex++] = combined >>> 16;
    if (outputIndex < output.length) output[outputIndex++] = combined >>> 8;
    if (outputIndex < output.length) output[outputIndex++] = combined;
  }
  return output;
}

function hasExpectedMagic(asset: YeliAsset, bytes: Uint8Array): boolean {
  if (asset.mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (byte, index) => bytes[index] === byte,
      )
    );
  }
  if (asset.mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8;
  }
  if (asset.mimeType === "image/gif") {
    return new TextDecoder().decode(bytes.slice(0, 6)).startsWith("GIF8");
  }
  if (asset.mimeType === "image/webp") {
    const header = new TextDecoder().decode(bytes.slice(0, 12));
    return header.startsWith("RIFF") && header.endsWith("WEBP");
  }
  return true;
}

export function validateAssets(
  payload: YeliDocumentPayload,
  budgets: FormatBudgets = DEFAULT_FORMAT_BUDGETS,
): ValidationFinding[] {
  return validateAssetSet(
    payload.assets,
    payload.manifest.assetReferences,
    budgets,
  );
}

export function validateAssetReferences(
  assets: readonly YeliAsset[],
  assetReferences: readonly string[],
): ValidationFinding[] {
  const identifiers = new Set(assets.map((asset) => asset.id));
  return assetReferences
    .filter((reference) => !identifiers.has(reference))
    .map((reference) =>
      finding(
        "ASSET_MISSING",
        `Markdown references missing asset ${reference}`,
        "$.manifest.assetReferences",
      ),
    )
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.code.localeCompare(right.code),
    );
}

export function validateAssetSet(
  assets: readonly YeliAsset[],
  assetReferences: readonly string[],
  budgets: FormatBudgets = DEFAULT_FORMAT_BUDGETS,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const identifiers = new Set<string>();
  let totalDecoded = 0;

  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index]!;
    const path = `$.assets[${index}]`;
    if (identifiers.has(asset.id)) {
      findings.push(
        finding(
          "ASSET_DUPLICATE_ID",
          `Asset id ${asset.id} appears more than once`,
          `${path}.id`,
        ),
      );
    }
    identifiers.add(asset.id);
    if (!CONTENT_ID.test(asset.id)) {
      findings.push(
        finding(
          "ASSET_ID_INVALID",
          "Asset id must be sha256:<lowercase hex>",
          `${path}.id`,
        ),
      );
    }
    if (!SAFE_MIME_TYPES.has(asset.mimeType)) {
      findings.push(
        finding(
          "ASSET_MIME_UNSAFE",
          `Asset MIME type ${asset.mimeType} is unsupported; SVG is never accepted`,
          `${path}.mimeType`,
        ),
      );
    }
    const bytes = decodeBase64(asset.data);
    if (!bytes) {
      findings.push(
        finding(
          "ASSET_BASE64_INVALID",
          "Asset data must use canonical base64 encoding",
          `${path}.data`,
        ),
      );
      continue;
    }
    const estimated = estimateDecodedBase64Bytes(asset.data);
    totalDecoded += estimated;
    if (estimated > budgets.maxDecodedAssetBytes) {
      findings.push(
        finding(
          "ASSET_TOO_LARGE",
          `Decoded asset exceeds ${budgets.maxDecodedAssetBytes} bytes`,
          `${path}.data`,
        ),
      );
      continue;
    }
    if (!hasExpectedMagic(asset, bytes)) {
      findings.push(
        finding(
          "ASSET_MIME_MISMATCH",
          "Decoded bytes do not match the declared MIME type",
          path,
        ),
      );
    }
    if (CONTENT_ID.test(asset.id)) {
      const actual = `sha256:${sha256BytesFallback(bytes)}`;
      if (actual !== asset.id) {
        findings.push(
          finding(
            "ASSET_HASH_MISMATCH",
            `Asset content hash is ${actual}`,
            `${path}.id`,
          ),
        );
      }
    }
  }

  if (totalDecoded > budgets.maxTotalDecodedAssetBytes) {
    findings.push(
      finding(
        "ASSET_TOTAL_BUDGET",
        `Decoded assets exceed ${budgets.maxTotalDecodedAssetBytes} total bytes`,
        "$.assets",
      ),
    );
  }
  findings.push(...validateAssetReferences(assets, assetReferences));

  return findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code),
  );
}

export interface TransportProfile {
  maxBytes: number;
  name: string;
}

export function measureTransportProfiles(
  artifactBytes: number,
  profiles: readonly TransportProfile[],
): {
  artifactBytes: number;
  profiles: Array<TransportProfile & { fits: boolean }>;
} {
  return {
    artifactBytes,
    profiles: profiles.map((profile) => ({
      ...profile,
      fits: artifactBytes <= profile.maxBytes,
    })),
  };
}
