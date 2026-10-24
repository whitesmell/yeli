import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicDirectories = new Set([
  ".github",
  "docs",
  "packages",
  "scripts",
  "site",
  "skills",
  "src",
  "tests",
]);
const publicRootFiles = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".nvmrc",
  ".prettierignore",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "CONTRIBUTING.zh-CN.md",
  "LICENSE",
  "PROJECT_CONTEXT.md",
  "README.md",
  "README.zh-CN.md",
  "SECURITY.md",
  "SECURITY.zh-CN.md",
  "eslint.config.js",
  "index.html",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "tsconfig.app.json",
  "tsconfig.cli.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "vitest.config.ts",
]);
const publicDocumentationFiles = new Set([
  "docs/README.md",
  "docs/README.zh-CN.md",
  "docs/agent-quickstart.md",
  "docs/agent-quickstart.zh-CN.md",
  "docs/agents.md",
  "docs/architecture.md",
  "docs/browser-support.md",
  "docs/compression.md",
  "docs/development.md",
  "docs/development.zh-CN.md",
  "docs/format.md",
  "docs/project-status.md",
  "docs/project-status.zh-CN.md",
  "docs/public-scope.md",
  "docs/public-scope.zh-CN.md",
  "docs/releasing.md",
  "docs/third-party-notices.md",
]);
const privateDirectory =
  /^(?:reference|node_modules|dist(?:-.*)?|output|coverage|playwright-report|test-results|reports|ideation|\.local-archive|\.git|\.codex|\.agents|\.aws|\.idea|\.vscode)$/;

export function publicPathProblem(file) {
  const parts = file.split("/");
  const basename = parts.at(-1);
  if (
    path.posix.isAbsolute(file) ||
    file.includes("\\") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    return "invalid repository-relative path";
  }
  if (parts.slice(0, -1).some((part) => privateDirectory.test(part))) {
    return "private, third-party or generated directory";
  }
  if (
    /^(?:intent|spec)\//.test(file) ||
    /^docs\/(?:plans|design)\//.test(file)
  ) {
    return "internal product contract, plan or design evidence";
  }
  if (
    /^(?:\.env(?:\..*)?|\.DS_Store|session-log\.md|design-qa\.md|issues.*\.html)$/.test(
      basename,
    ) ||
    /\.(?:pem|key|p12|pfx|tgz|zip|tar\.gz)$/i.test(basename)
  ) {
    return "local configuration, private record, key or generated archive";
  }
  if (
    /\.(?:yeli|aimd)\.html$/i.test(file) &&
    !file.startsWith("tests/fixtures/")
  ) {
    return "compiled or user document outside synthetic fixtures";
  }
  if (/^docs\/(?:research|evaluations|reviews|ideation)\//.test(file)) {
    return "private research or review";
  }
  if (file.startsWith("docs/") && !publicDocumentationFiles.has(file)) {
    return "documentation outside the essential public allowlist";
  }
  if (
    parts.length === 1
      ? !publicRootFiles.has(file)
      : !publicDirectories.has(parts[0])
  ) {
    return "outside the reviewed public roots";
  }
  return null;
}

export function checkPublicScope(root) {
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
  });
  if (top.error) throw top.error;
  if (top.status !== 0) throw new Error(top.stderr || "Git root unavailable");
  if (realpathSync(top.stdout.trim()) !== realpathSync(root)) {
    throw new Error("Run the public scope check from the repository root");
  }
  // Read tracked paths too: .gitignore does not protect an already tracked file.
  const git = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  if (git.error) throw git.error;
  if (git.status !== 0) throw new Error(git.stderr || "git ls-files failed");
  const files = [...new Set(git.stdout.split("\0").filter(Boolean))].sort();
  const findings = [];
  let fileCount = 0;
  for (const file of files) {
    const absolute = path.join(root, file);
    // A deleted tracked file is absent from the proposed working-tree snapshot.
    if (!existsSync(absolute)) {
      try {
        if (lstatSync(absolute).isSymbolicLink()) {
          findings.push({ file, reason: "symbolic link" });
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      continue;
    }
    fileCount++;
    const stat = lstatSync(absolute);
    const reason =
      publicPathProblem(file) ??
      (stat.isSymbolicLink()
        ? "symbolic link"
        : !stat.isFile()
          ? "non-file entry, including a nested repository"
          : null);
    if (reason) findings.push({ file, reason });
  }
  return { fileCount, findings };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = checkPublicScope(process.cwd());
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length) process.exitCode = 1;
}
