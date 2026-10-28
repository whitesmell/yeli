import type { YeliHost } from "./host/contracts.ts";
import { Workspace } from "./ui/workspace.tsx";

export function App({ host }: { host: YeliHost }) {
  return <Workspace host={host} />;
}
