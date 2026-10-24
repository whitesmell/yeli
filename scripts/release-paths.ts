import { existsSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, ".."));

function realizedTargetPath(path: string): string {
  const target = resolve(path);
  return existsSync(target)
    ? realpathSync(target)
    : resolve(realpathSync(dirname(target)), basename(target));
}

export function assertOutsideRepository(path: string, message: string): string {
  const target = realizedTargetPath(path);
  const relation = relative(REPOSITORY_ROOT, target);
  const isOutside =
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation);
  if (!isOutside) throw new Error(message);
  return target;
}
