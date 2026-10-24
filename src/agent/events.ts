import type { MutationReceipt } from "./validate.ts";

export const YELI_AGENT_API_VERSION = 1 as const;

export type AgentMutationOperation =
  "patch-lines" | "patch-metadata" | "refresh" | "replace";

export interface AgentMutationEvent {
  apiVersion: typeof YELI_AGENT_API_VERSION;
  changedCharacters: MutationReceipt["changedCharacters"];
  changedLines: MutationReceipt["changedLines"];
  operation: AgentMutationOperation;
  revision: number;
  sourceHash: string;
  type: "yeli.document.changed";
}

export function createAgentMutationEvent(
  operation: AgentMutationOperation,
  receipt: MutationReceipt,
): Readonly<AgentMutationEvent> {
  return Object.freeze({
    apiVersion: YELI_AGENT_API_VERSION,
    changedCharacters: Object.freeze({
      before: Object.freeze([...receipt.changedCharacters.before]) as [
        number,
        number,
      ],
      after: Object.freeze([...receipt.changedCharacters.after]) as [
        number,
        number,
      ],
    }),
    changedLines: Object.freeze({ ...receipt.changedLines }),
    operation,
    revision: receipt.revision,
    sourceHash: receipt.sourceHash,
    type: "yeli.document.changed",
  });
}
