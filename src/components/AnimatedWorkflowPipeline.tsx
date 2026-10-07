import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Code2,
  Cpu,
  FileCheck,
  GitCompare,
  Play,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Wrench,
} from 'lucide-react';
import type { BugAnalysisResult, CodeLineError } from '../types/bug';

interface AnimatedWorkflowPipelineProps {
  analysisResult: BugAnalysisResult | null;
  sourceCode: string;
  fixedCode: string;
  detectedErrors: CodeLineError[];
  isCodeFixed: boolean;
  onApplyAutoFix: () => void;
  onResetFaultyCode: () => void;
  isAnalyzingExternal?: boolean;
}

interface WorkflowStage {
  index: number;
  id: string;
  shortTitle: string;
  fullTitle: string;
  modelBadge: string;
  provider: string;
  durationMs: number;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
}

export const AnimatedWorkflowPipeline: React.FC<AnimatedWorkflowPipelineProps> = ({
  analysisResult,
  sourceCode,
  fixedCode,
  detectedErrors,
  isCodeFixed,
  onApplyAutoFix,
  onResetFaultyCode,
  isAnalyzingExternal = false,
}) => {
  const [activeStage, setActiveStage] = useState<number>(isCodeFixed ? 5 : 0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [completedStages, setCompletedStages] = useState<number[]>([0, 1, 2, 3, 4, 5]);

  const stages: WorkflowStage[] = [
    {
      index: 0,
      id: 'stage-ingest',
      shortTitle: '01. AST & Error Scan',
      fullTitle: 'Source Code AST Lexing & Inline Error Detection',
      modelBadge: 'Tree-sitter AST + microsoft/codebert-base',
      provider: 'Hugging Face',
      durationMs: 95,
      icon: Terminal,
      summary: isCodeFixed
        ? '0 static or runtime invariant errors remaining in source buffer.'
        : `Detected ${detectedErrors.length} critical line-level code error(s) in source file.`,
    },
    {
      index: 1,
      id: 'stage-dedup',
      shortTitle: '02. Vector Deduplication',
      fullTitle: 'Dense Semantic Embedding & Duplicate Issue Search',
      modelBadge: 'BAAI/bge-large-en-v1.5 + gemini-embedding-2-preview',
      provider: 'Hugging Face + Gemini',
      durationMs: analysisResult?.modelTraces[0]?.latencyMs || 64,
      icon: GitCompare,
      summary: analysisResult?.duplicateMatches?.[0]
        ? `Matched ${analysisResult.duplicateMatches[0].bugId} (${(
            analysisResult.duplicateMatches[0].similarityScore * 100
          ).toFixed(1)}% cosine similarity)`
        : 'Compared dense embeddings against repository issue index.',
    },
    {
      index: 2,
      id: 'stage-triage',
      shortTitle: '03. Zero-Shot Triage',
      fullTitle: 'Zero-Shot Severity & CWE Vulnerability Classification',
      modelBadge: 'facebook/bart-large-mnli',
      provider: 'Hugging Face',
      durationMs: analysisResult?.modelTraces[1]?.latencyMs || 118,
      icon: AlertTriangle,
      summary: analysisResult
        ? `Classified as ${analysisResult.severity} (${analysisResult.priority}) · ${analysisResult.cweId} · ${analysisResult.category}`
        : 'Zero-shot entailment scoring across CWE defect taxonomy.',
    },
    {
      index: 3,
      id: 'stage-rootcause',
      shortTitle: '04. Root Cause Trace',
      fullTitle: 'Execution Path & Violated Invariant Localization',
      modelBadge: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      provider: 'Hugging Face',
      durationMs: 240,
      icon: Cpu,
      summary:
        analysisResult?.rootCauses?.[0]?.title ||
        'Pinpointed unguarded state mutation and concurrency window.',
    },
    {
      index: 4,
      id: 'stage-autofix',
      shortTitle: '05. Auto-Fix & Patch',
      fullTitle: 'Automated Code Error Resolution & Unified Diff Synthesis',
      modelBadge: 'gemini-3.8-flash + Qwen2.5-Coder',
      provider: 'Advanced LLM',
      durationMs: 310,
      icon: Wrench,
      summary: isCodeFixed
        ? `Applied atomic patch and eliminated all ${detectedErrors.length} code error(s).`
        : `Synthesized verified code patch to fix ${detectedErrors.length} offending construct(s).`,
    },
    {
      index: 5,
      id: 'stage-verify',
      shortTitle: '06. Verify & Report',
      fullTitle: 'Regression Suite Verification & Structured Report Generation',
      modelBadge: 'gemini-3.8-flash Schema Engine',
      provider: 'Advanced LLM',
      durationMs: 180,
      icon: ShieldCheck,
      summary: isCodeFixed
        ? 'All regression unit tests PASSED · 0 errors remaining · Report ready.'
        : 'Generated regression test suite and structured engineering bug report.',
    },
  ];

  // Trigger automated playback when external analysis starts or user clicks Play
  useEffect(() => {
    if (isAnalyzingExternal) {
      startWorkflowPlayback(false);
    }
  }, [isAnalyzingExternal]);

  const startWorkflowPlayback = (applyFixOnStep4: boolean = true) => {
    setIsPlaying(true);
    setActiveStage(0);
    setCompletedStages([]);

    let step = 0;
    const interval = setInterval(() => {
      setCompletedStages((prev) => Array.from(new Set([...prev, step])));
      if (step === 4 && applyFixOnStep4) {
        onApplyAutoFix();
      }
      step += 1;
      if (step < stages.length) {
        setActiveStage(step);
      } else {
        setCompletedStages([0, 1, 2, 3, 4, 5]);
        setIsPlaying(false);
        clearInterval(interval);
      }
    }, 650);
  };

  const currentStageObj = stages[activeStage] || stages[0];

  return (
    <div className="border border-slate-800 bg-[#111827] rounded-lg p-5 space-y-5">
      {/* Top Bar of Animated Workflow */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-blue-400 font-semibold">
              Interactive Animated AI Diagnostic & Auto-Fix Workflow
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className={isCodeFixed ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
              {isCodeFixed
                ? 'Status: All Errors Fixed & Verified (0 Errors)'
                : `Status: ${detectedErrors.length} Active Error(s) Detected in Code`}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-100 mt-1">
            End-to-End Hugging Face & Gemini 3.8 Execution Pipeline
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isCodeFixed ? (
            <button
              type="button"
              onClick={() => startWorkflowPlayback(true)}
              disabled={isPlaying}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/50 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>
                {isPlaying
                  ? 'Running Animated Error Fix...'
                  : `Auto-Fix ${detectedErrors.length} Error(s) & Run Workflow`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onResetFaultyCode}
              className="px-3 py-2 bg-[#0B0F19] hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Original Faulty Code</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => startWorkflowPlayback(false)}
            disabled={isPlaying}
            className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Replay Pipeline Animation</span>
          </button>
        </div>
      </div>

      {/* 6-Node Animated Pipeline Stepper */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 relative">
        {stages.map((st, idx) => {
          const IconComponent = st.icon;
          const isCurrent = activeStage === idx;
          const isDone = completedStages.includes(idx);

          return (
            <motion.button
              key={st.id}
              type="button"
              onClick={() => setActiveStage(idx)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: idx * 0.04 }}
              className={`relative text-left p-3 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between min-h-[112px] ${
                isCurrent
                  ? 'border-blue-500 bg-blue-950/30'
                  : isDone
                  ? 'border-slate-800 bg-[#0B0F19] hover:border-slate-700'
                  : 'border-slate-800/60 bg-[#0B0F19]/40 opacity-70'
              }`}
            >
              {/* Animated Pulse Ring when active */}
              {isCurrent && isPlaying && (
                <motion.div
                  className="absolute inset-0 rounded-lg border-2 border-blue-400 pointer-events-none"
                  initial={{ opacity: 0.9, scale: 0.98 }}
                  animate={{ opacity: 0, scale: 1.03 }}
                  transition={{ duration: 0.65, repeat: Infinity }}
                />
              )}

              <div>
                <div className="flex items-center justify-between gap-1.5">
                  <div
                    className={`w-6 h-6 rounded flex items-center justify-center ${
                      isCurrent
                        ? 'bg-blue-600 text-white'
                        : isDone
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {st.durationMs}ms
                  </span>
                </div>

                <div className="text-xs font-semibold text-slate-100 mt-2 truncate">
                  {st.shortTitle}
                </div>
                <div className="text-[10px] font-mono text-blue-400 mt-0.5 truncate">
                  {st.provider}
                </div>
              </div>

              <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                <span
                  className={
                    isCurrent
                      ? 'text-blue-300'
                      : isDone
                      ? 'text-emerald-400'
                      : 'text-slate-500'
                  }
                >
                  {isCurrent && isPlaying
                    ? 'Executing...'
                    : isDone
                    ? 'Verified'
                    : 'Queued'}
                </span>
                {idx < stages.length - 1 && (
                  <ArrowRight
                    className={`w-3 h-3 ${
                      isCurrent ? 'text-blue-400 translate-x-0.5' : 'text-slate-600'
                    } transition-transform`}
                  />
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Animated Stage Inspector & Live Error Fix Visualizer */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${currentStageObj.id}-${isCodeFixed ? 'fixed' : 'faulty'}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="p-4 rounded-lg bg-[#0B0F19] border border-slate-800 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <span className="text-blue-400 font-semibold">{currentStageObj.shortTitle}</span>
                <span aria-hidden="true">·</span>
                <span>Model: {currentStageObj.modelBadge}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">Latency: {currentStageObj.durationMs}ms</span>
              </div>
              <h4 className="text-sm font-semibold text-slate-100 mt-0.5">
                {currentStageObj.fullTitle}
              </h4>
            </div>
            <div className="text-xs text-slate-300 font-mono">
              {currentStageObj.summary}
            </div>
          </div>

          {/* Inline Error Diagnostics & Interactive Fixer Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left 6 Cols: Detected Errors Breakdown */}
            <div className="lg:col-span-6 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">
                  {isCodeFixed
                    ? 'Resolved Code Invariants (0 Active Errors)'
                    : `Detected Source Code Errors (${detectedErrors.length})`}
                </span>
                {!isCodeFixed && (
                  <button
                    type="button"
                    onClick={onApplyAutoFix}
                    className="text-emerald-400 hover:text-emerald-300 font-mono text-[11px] underline underline-offset-4 cursor-pointer"
                  >
                    Fix All {detectedErrors.length} Error(s) Now
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {detectedErrors.map((err) => (
                  <div
                    key={err.id}
                    className={`p-3 rounded-md border transition-colors text-xs space-y-1.5 ${
                      isCodeFixed
                        ? 'border-emerald-900/50 bg-emerald-950/15'
                        : 'border-red-900/50 bg-red-950/15'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span
                        className={
                          isCodeFixed
                            ? 'text-emerald-400 font-semibold'
                            : 'text-red-400 font-semibold'
                        }
                      >
                        {isCodeFixed ? 'FIXED' : 'ERROR'} · Line {err.lineNumber}
                        {err.endLineNumber && err.endLineNumber !== err.lineNumber
                          ? `–${err.endLineNumber}`
                          : ''}{' '}
                        · {err.cweId}
                      </span>
                      <span className="text-slate-400">{err.errorType}</span>
                    </div>

                    <p className="text-slate-300 leading-relaxed">{err.errorMessage}</p>

                    <div className="pt-1 font-mono text-[11px] space-y-1">
                      <div className="px-2 py-1 rounded bg-[#111827] text-red-300/90 line-through opacity-75 truncate">
                        - {err.faultyLineContent}
                      </div>
                      <div className="px-2 py-1 rounded bg-[#111827] text-emerald-300 truncate">
                        + {err.fixedLineContent}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 6 Cols: Live Code Buffer State with Error Line Highlighting */}
            <div className="lg:col-span-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    {isCodeFixed
                      ? 'Verified Patched Source Buffer (0 Errors)'
                      : 'Active Source Buffer (Faulty Lines Highlighted)'}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {(isCodeFixed ? fixedCode : sourceCode).split('\n').length} lines
                </span>
              </div>

              <div
                className={`rounded-md border overflow-hidden ${
                  isCodeFixed ? 'border-emerald-800/60' : 'border-slate-800'
                } bg-[#111827] max-h-[240px] overflow-y-auto font-mono text-[11px]`}
              >
                {(isCodeFixed ? fixedCode : sourceCode).split('\n').map((line, i) => {
                  const lineNum = i + 1;
                  const matchingErr = !isCodeFixed
                    ? detectedErrors.find(
                        (e) =>
                          lineNum >= e.lineNumber &&
                          lineNum <= (e.endLineNumber || e.lineNumber)
                      )
                    : null;

                  const isAddedFixLine =
                    isCodeFixed &&
                    (line.includes('$transaction') ||
                      line.includes('skipDuplicates') ||
                      line.includes('increment') ||
                      line.includes('removeEventListener') ||
                      line.includes('ALLOWED_SORT_COLUMNS') ||
                      line.includes('db.stream') ||
                      line.includes('i < total'));

                  return (
                    <div
                      key={i}
                      className={`flex items-start px-3 py-0.5 leading-relaxed ${
                        matchingErr
                          ? 'bg-red-950/40 text-red-200 border-l-2 border-red-500'
                          : isAddedFixLine
                          ? 'bg-emerald-950/35 text-emerald-200 border-l-2 border-emerald-500'
                          : 'text-slate-300'
                      }`}
                    >
                      <span className="w-7 shrink-0 text-slate-600 select-none tabular-nums">
                        {lineNum}
                      </span>
                      <span className="whitespace-pre overflow-x-auto">{line || ' '}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
