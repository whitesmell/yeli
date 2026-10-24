import type { OpenEmbeddedResult } from "./format/open.ts";
import { Workspace } from "./ui/workspace.tsx";

export function App({ initialResult }: { initialResult: OpenEmbeddedResult }) {
  return <Workspace initialResult={initialResult} />;
}
