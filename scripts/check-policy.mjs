import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const productRoots = ["src"];
const sourceExtensions = new Set([".ts", ".tsx", ".css", ".html"]);
const forbiddenSourcePatterns = [
  { label: "model endpoint", pattern: /api\.(?:openai|anthropic)\.com/i },
  {
    label: "model SDK import",
    pattern: /from\s+['"](?:openai|@anthropic-ai)\//i,
  },
  {
    label: "collaboration transport",
    pattern: /\b(?:WebSocket|EventSource)\s*\(/,
  },
  { label: "document-directed fetch", pattern: /\bfetch\s*\(/ },
  { label: "credential field", pattern: /(?:api[_-]?key|model[_-]?token)/i },
];
const forbiddenDependencies = [
  /(?:^|\/)(?:openai|anthropic|langchain)(?:$|\/)/i,
  /^(?:yjs|automerge|socket\.io-client|@liveblocks\/)/i,
];

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = [resolve("index.html")];
for (const root of productRoots) {
  sourceFiles.push(
    ...walk(resolve(root)).filter((path) =>
      sourceExtensions.has(extname(path)),
    ),
  );
}

const findings = [];
for (const path of sourceFiles) {
  const source = readFileSync(path, "utf8");
  for (const candidate of forbiddenSourcePatterns) {
    if (candidate.pattern.test(source)) {
      findings.push(`${candidate.label}: ${path}`);
    }
  }
}

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const dependencies = Object.keys({
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
});
for (const dependency of dependencies) {
  if (forbiddenDependencies.some((pattern) => pattern.test(dependency))) {
    findings.push(`forbidden dependency: ${dependency}`);
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Policy scan passed: ${sourceFiles.length} product files and ${dependencies.length} direct dependencies`,
  );
}
