export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export type BugStatus = 'Open' | 'In Progress' | 'Resolved' | 'Duplicate';

export type ModelEnsembleId =
  | 'hybrid-hf-gemini'
  | 'deep-code-qwen-gemini'
  | 'fast-triage-bart-bge';

export interface DuplicateMatch {
  bugId: string;
  title: string;
  status: BugStatus;
  severity: SeverityLevel;
  component: string;
  similarityScore: number; // 0 to 1 (e.g. 0.894)
  embeddingScore: number;  // Dense vector cosine similarity (BGE-Large / Gemini Embedding)
  astTokenScore: number;   // CodeBERT / AST token overlap score
  matchClassification: 'Exact Duplicate' | 'High Overlap' | 'Related Subsystem';
  sharedSymbols: string[];
  existingResolutionSummary?: string;
}

export interface CodeLineError {
  id: string;
  lineNumber: number;
  endLineNumber?: number;
  errorType: string;
  cweId: string;
  severity: SeverityLevel;
  faultyLineContent: string;
  errorMessage: string;
  fixedLineContent: string;
}

export interface RootCauseItem {
  id: string;
  title: string;
  confidence: number; // 0 to 1
  offendingLines: string;
  codeConstruct: string;
  mechanismExplanation: string;
  invariantViolated: string;
}

export interface SolutionRecommendation {
  id: string;
  title: string;
  strategyType: 'Immediate Hotfix' | 'Architectural Refactor' | 'Defensive Guard';
  description: string;
  originalCode: string;
  patchedCode: string;
  unifiedDiff: string;
  verificationTestCode: string;
  estimatedComplexity: 'Low' | 'Medium' | 'High';
}

export interface StructuredBugReport {
  reportId: string;
  title: string;
  executiveSummary: string;
  severity: SeverityLevel;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: string;
  cweId: string;
  affectedComponent: string;
  environment: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  rootCauseSummary: string;
  recommendedFixSummary: string;
  regressionTestPlan: string[];
}

export interface ModelStageTrace {
  stageName: string;
  modelId: string;
  provider: 'Hugging Face' | 'Advanced LLM';
  taskType: string;
  latencyMs: number;
  confidenceScore: number;
  outputSummary: string;
}

export interface BugAnalysisResult {
  analysisId: string;
  timestamp: string;
  ensembleUsed: ModelEnsembleId;
  severity: SeverityLevel;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  severityJustification: string;
  category: string;
  cweId: string;
  affectedComponent: string;
  isDuplicate: boolean;
  highestSimilarity: number;
  duplicateMatches: DuplicateMatch[];
  detectedErrors?: CodeLineError[];
  rootCauses: RootCauseItem[];
  recommendations: SolutionRecommendation[];
  structuredReport: StructuredBugReport;
  modelTraces: ModelStageTrace[];
}

export interface TrackedBug {
  id: string;
  title: string;
  description: string;
  stackTrace: string;
  sourceCode: string;
  filePath: string;
  language: string;
  component: string;
  severity: SeverityLevel;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: string;
  cweId: string;
  status: BugStatus;
  duplicateOf?: string;
  reporter: string;
  createdAt: string;
  updatedAt: string;
  rootCauseSummary: string;
  resolutionPatch?: string;
  structuredReport?: StructuredBugReport;
  similarityToLatest?: number;
}

export interface PresetScenario {
  id: string;
  label: string;
  subtitle: string;
  title: string;
  description: string;
  stackTrace: string;
  filePath: string;
  language: string;
  component: string;
  environment: string;
  sourceCode: string;
  fixedSourceCode: string;
  detectedErrors: CodeLineError[];
}

export interface PairwiseDuplicateCluster {
  pairId: string;
  sourceBugId: string;
  sourceTitle: string;
  targetBugId: string;
  targetTitle: string;
  component: string;
  combinedSimilarity: number;
  semanticScore: number;
  codeAstScore: number;
  sharedTokens: string[];
  status: 'Unlinked Overlap' | 'Confirmed Duplicate';
}
