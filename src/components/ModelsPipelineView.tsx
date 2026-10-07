import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  Loader2,
  Play,
  Terminal,
} from 'lucide-react';

interface SandboxResponse {
  latencyMs: number;
  embeddingModel: string;
  classifierModel: string;
  denseVectorSimilarity: number;
  astLexicalSimilarity: number;
  combinedSimilarity: number;
  sharedIdentifiers: string[];
  zeroShotClassifications: { label: string; score: number }[];
}

const PIPELINE_MODELS = [
  {
    stage: '01. Semantic Bug & Stack Trace Embeddings',
    modelId: 'BAAI/bge-large-en-v1.5 + gemini-embedding-2-preview',
    family: 'Hugging Face Feature Extraction & Dense Vector Index',
    role: 'Encodes natural-language bug descriptions and exception traces into high-dimensional dense vectors to compute cosine similarity against historical issues.',
    dimension: '1024-d / 768-d normalized vectors',
  },
  {
    stage: '02. Source Code AST & Identifier Representation',
    modelId: 'microsoft/codebert-base',
    family: 'Hugging Face Bimodal Code-NL Transformer',
    role: 'Extracts structural code tokens, function signatures, and control-flow identifiers to detect duplicate defects even when symptom descriptions differ.',
    dimension: 'Bimodal PL-NL token embeddings',
  },
  {
    stage: '03. Zero-Shot Severity & CWE Defect Triage',
    modelId: 'facebook/bart-large-mnli',
    family: 'Hugging Face Zero-Shot Sequence Classification',
    role: 'Maps raw bug reports onto standardized CWE vulnerability categories (TOCTOU race conditions, SQL injection, memory leaks, off-by-one panics) and P0–P3 priorities.',
    dimension: 'Multi-label NLI entailment scoring',
  },
  {
    stage: '04. Deep Root Cause Localization & Patch Synthesis',
    modelId: 'Qwen/Qwen2.5-Coder-32B-Instruct + gemini-3.8-flash',
    family: 'Advanced Code Reasoning & Structured Output LLM',
    role: 'Pinpoints exact offending lines in source files, explains violated state invariants, synthesizes unified Git diffs, and generates structured engineering bug reports.',
    dimension: '32K context window · Schema-constrained JSON',
  },
];

export const ModelsPipelineView: React.FC = () => {
  const [snippetA, setSnippetA] = useState(
    `const existing = await db.webhookEvents.findUnique({ where: { eventId } });
if (existing?.status === 'COMPLETED') return;
const wallet = await db.wallets.findUnique({ where: { userId } });
await db.wallets.update({ where: { userId }, data: { balanceCents: wallet.balanceCents + amount } });`
  );
  const [snippetB, setSnippetB] = useState(
    `const record = await db.webhookEvents.findUnique({ where: { eventId: payload.id } });
if (record?.status === 'COMPLETED') return;
const account = await db.wallets.findUnique({ where: { userId: payload.userId } });
await db.wallets.update({ where: { userId: payload.userId }, data: { balanceCents: account.balanceCents + payload.amountCents } });`
  );
  const [defectDescription, setDefectDescription] = useState(
    'Concurrent Stripe webhook delivery credits customer account balance twice before idempotency status is saved due to race condition.'
  );

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SandboxResponse | null>(null);

  const handleRunSandbox = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setRunning(true);
    try {
      const res = await fetch('/api/models/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippetA,
          snippetB,
          defectDescription,
        }),
      });
      if (res.ok) {
        const data: SandboxResponse = await res.json();
        setResult(data);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Architecture Overview */}
      <div className="border border-slate-800 bg-[#111827] rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="text-base font-semibold text-slate-100">
            Hugging Face & Advanced LLM Multi-Stage Pipeline Architecture
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            FaultLine combines specialized Hugging Face encoders for fast semantic/AST deduplication with advanced generative reasoning models for root-cause localization and patch synthesis.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PIPELINE_MODELS.map((m) => (
            <div
              key={m.stage}
              className="p-4 rounded-md bg-[#0B0F19] border border-slate-800 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-100">{m.stage}</span>
                <span className="text-[11px] font-mono text-slate-400">{m.dimension}</span>
              </div>
              <div className="text-xs font-mono text-blue-400">{m.modelId}</div>
              <div className="text-[11px] text-slate-400 font-mono">{m.family}</div>
              <p className="text-xs text-slate-300 leading-relaxed pt-1">{m.role}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Live Embedding & Zero-Shot Sandbox */}
      <div className="border border-slate-800 bg-[#111827] rounded-lg p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Interactive Embedding Similarity & Zero-Shot Defect Classifier Sandbox
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Test live vector cosine similarity (`BAAI/bge-large-en-v1.5` + `gemini-embedding-2-preview`), CodeBERT token overlap, and `facebook/bart-large-mnli` zero-shot defect classification.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleRunSandbox()}
            disabled={running}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
          >
            {running ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Evaluating Models...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Live Vector & Zero-Shot Probe</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleRunSandbox} className="lg:col-span-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Code Snippet A (Primary Bug Source)
              </label>
              <textarea
                rows={4}
                value={snippetA}
                onChange={(e) => setSnippetA(e.target.value)}
                className="w-full p-2.5 text-xs font-mono bg-[#0B0F19] border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Code Snippet B (Candidate Duplicate Source)
              </label>
              <textarea
                rows={4}
                value={snippetB}
                onChange={(e) => setSnippetB(e.target.value)}
                className="w-full p-2.5 text-xs font-mono bg-[#0B0F19] border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Defect Symptom Narrative (for BART-Large-MNLI Zero-Shot Classification)
              </label>
              <textarea
                rows={2}
                value={defectDescription}
                onChange={(e) => setDefectDescription(e.target.value)}
                className="w-full p-2.5 text-xs bg-[#0B0F19] border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </form>

          <div className="lg:col-span-6 border border-slate-800 bg-[#0B0F19] rounded-md p-4 min-h-[320px] flex flex-col justify-between">
            {!result ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <Cpu className="w-8 h-8 text-slate-600 mb-2" />
                <div className="text-xs font-semibold text-slate-200">
                  Run Probe to Inspect Raw Model Outputs
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Click "Run Live Vector & Zero-Shot Probe" to compute dense cosine similarity and zero-shot CWE classification scores.
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 font-mono">
                  <span className="text-slate-300 font-semibold">
                    Combined Duplicate Similarity: {(result.combinedSimilarity * 100).toFixed(2)}%
                  </span>
                  <span className="text-slate-400 tabular-nums">
                    Latency: {result.latencyMs}ms
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div className="p-3 rounded bg-[#111827] border border-slate-800">
                    <div className="text-[11px] text-slate-400">
                      Dense Embedding Cosine
                    </div>
                    <div className="text-sm font-semibold text-blue-400 mt-0.5 tabular-nums">
                      {(result.denseVectorSimilarity * 100).toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {result.embeddingModel}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[#111827] border border-slate-800">
                    <div className="text-[11px] text-slate-400">
                      CodeBERT AST Token Overlap
                    </div>
                    <div className="text-sm font-semibold text-emerald-400 mt-0.5 tabular-nums">
                      {(result.astLexicalSimilarity * 100).toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      Shared: {result.sharedIdentifiers.slice(0, 4).join(', ')}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="font-semibold text-slate-200">
                    Zero-Shot Defect Taxonomy Scores ({result.classifierModel})
                  </div>
                  <div className="space-y-1.5">
                    {result.zeroShotClassifications.map((item) => {
                      const pct = Math.round(item.score * 100);
                      return (
                        <div key={item.label} className="space-y-1">
                          <div className="flex items-center justify-between font-mono text-[11px]">
                            <span className="text-slate-300">{item.label}</span>
                            <span className="text-slate-400 tabular-nums">{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
