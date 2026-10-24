export type CandidateGate = "fail" | "pass" | "pending-u3";

export interface CandidateEvidence {
  dependencyAdded: boolean;
  disposition: "reject" | "selected-projection";
  gates: Readonly<Record<string, CandidateGate>>;
  name: string;
  version: string;
}

export const WYSIWYG_CANDIDATE_EVIDENCE: readonly CandidateEvidence[] = [
  {
    dependencyAdded: false,
    disposition: "selected-projection",
    gates: {
      boundedSourceTransactions: "pass",
      generatedGrammarDifferential: "pass",
      noEditIdentity: "pass",
      productionAccessibility: "pending-u3",
      realOsIme: "pending-u3",
      staleRangeRejection: "pass",
      unsupportedSourceSafety: "pass",
    },
    name: "minimal source-mapped block projection",
    version: "u8-spike-1",
  },
  {
    dependencyAdded: false,
    disposition: "reject",
    gates: {
      canonicalMarkdownOffsets: "fail",
      noWholeDocumentSerialization: "fail",
      offlineDependencySurface: "pass",
    },
    name: "Milkdown / ProseMirror",
    version: "7.22.1",
  },
  {
    dependencyAdded: false,
    disposition: "reject",
    gates: {
      canonicalMarkdownOffsets: "fail",
      noWholeDocumentSerialization: "fail",
      offlineDependencySurface: "fail",
    },
    name: "Vditor",
    version: "4.0.0",
  },
] as const;
