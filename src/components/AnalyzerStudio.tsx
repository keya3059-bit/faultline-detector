import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Cpu,
  Download,
  FileText,
  GitCompare,
  Loader2,
  Play,
  PlusCircle,
  RotateCcw,
  Terminal,
  Wrench,
} from 'lucide-react';
import { PRESET_SCENARIOS } from '../data/seedBugs';
import { AnimatedWorkflowPipeline } from './AnimatedWorkflowPipeline';
import type {
  BugAnalysisResult,
  CodeLineError,
  ModelEnsembleId,
  PresetScenario,
  SeverityLevel,
  TrackedBug,
} from '../types/bug';

interface AnalyzerStudioProps {
  onAnalysisComplete: (result: BugAnalysisResult) => void;
  currentResult: BugAnalysisResult | null;
  onSaveBugToTracker: (newBug: Partial<TrackedBug>) => Promise<TrackedBug | null>;
  onMarkExistingResolved: (bugId: string, patchCode: string) => Promise<void>;
  onSelectTrackedBug: (bugId: string) => void;
  initialScenario?: PresetScenario;
}

const ENSEMBLE_OPTIONS: {
  id: ModelEnsembleId;
  name: string;
  models: string;
  description: string;
}[] = [
  {
    id: 'hybrid-hf-gemini',
    name: 'Hybrid HF + Gemini 3.8 Ensemble',
    models: 'BAAI/bge-large-en-v1.5 · CodeBERT · Gemini 3.8 Flash',
    description: 'Balanced semantic duplicate search, CWE zero-shot triage, and patch synthesis',
  },
  {
    id: 'deep-code-qwen-gemini',
    name: 'Deep AST & Code Reasoning',
    models: 'Qwen2.5-Coder-32B · Gemini Embedding 2 · Gemini 3.8 Flash',
    description: 'Maximum depth for concurrency races, memory leaks, and multi-line patches',
  },
  {
    id: 'fast-triage-bart-bge',
    name: 'Fast Zero-Shot Bug Triage',
    models: 'facebook/bart-large-mnli · BAAI/bge-large-en-v1.5',
    description: 'Rapid duplicate deduplication and severity classification for high-volume queues',
  },
];

export const AnalyzerStudio: React.FC<AnalyzerStudioProps> = ({
  onAnalysisComplete,
  currentResult,
  onSaveBugToTracker,
  onMarkExistingResolved,
  onSelectTrackedBug,
}) => {
  const defaultScenario = PRESET_SCENARIOS[0];

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(defaultScenario.id);
  const [title, setTitle] = useState<string>(defaultScenario.title);
  const [description, setDescription] = useState<string>(defaultScenario.description);
  const [stackTrace, setStackTrace] = useState<string>(defaultScenario.stackTrace);
  const [sourceCode, setSourceCode] = useState<string>(defaultScenario.sourceCode);
  const [originalFaultyCode, setOriginalFaultyCode] = useState<string>(defaultScenario.sourceCode);
  const [filePath, setFilePath] = useState<string>(defaultScenario.filePath);
  const [language, setLanguage] = useState<string>(defaultScenario.language);
  const [environment, setEnvironment] = useState<string>(defaultScenario.environment);
  const [ensemble, setEnsemble] = useState<ModelEnsembleId>('hybrid-hf-gemini');
  const [isCodeFixed, setIsCodeFixed] = useState<boolean>(false);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<
    'overview' | 'patch' | 'report' | 'pipeline'
  >('overview');
  const [diffMode, setDiffMode] = useState<'side-by-side' | 'unified' | 'test'>('side-by-side');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const activePreset = useMemo(
    () => PRESET_SCENARIOS.find((s) => s.id === selectedScenarioId) || PRESET_SCENARIOS[0],
    [selectedScenarioId]
  );

  const activeDetectedErrors: CodeLineError[] = useMemo(() => {
    if (currentResult?.detectedErrors && currentResult.detectedErrors.length > 0) {
      return currentResult.detectedErrors;
    }
    return activePreset.detectedErrors;
  }, [currentResult, activePreset]);

  const recommendedFixedCode = useMemo(() => {
    if (currentResult?.recommendations?.[0]?.patchedCode) {
      return currentResult.recommendations[0].patchedCode;
    }
    return activePreset.fixedSourceCode;
  }, [currentResult, activePreset]);

  const handleLoadScenario = (scenario: PresetScenario) => {
    setSelectedScenarioId(scenario.id);
    setTitle(scenario.title);
    setDescription(scenario.description);
    setStackTrace(scenario.stackTrace);
    setSourceCode(scenario.sourceCode);
    setOriginalFaultyCode(scenario.sourceCode);
    setFilePath(scenario.filePath);
    setLanguage(scenario.language);
    setEnvironment(scenario.environment);
    setIsCodeFixed(false);
    setErrorMsg(null);
    setSavedNotice(null);
  };

  const handleApplyAutoFix = async () => {
    const patchToUse = recommendedFixedCode;
    setSourceCode(patchToUse);
    setIsCodeFixed(true);

    const topDuplicate = currentResult?.duplicateMatches?.[0];
    if (topDuplicate && topDuplicate.similarityScore >= 0.65) {
      await onMarkExistingResolved(topDuplicate.bugId, patchToUse);
      setSavedNotice(
        `Fixed all ${activeDetectedErrors.length} code error(s) in ${filePath} and marked ${topDuplicate.bugId} Resolved.`
      );
    } else {
      setSavedNotice(
        `Applied verified patch to ${filePath} — 0 code errors remaining.`
      );
    }
  };

  const handleResetFaultyCode = () => {
    setSourceCode(originalFaultyCode);
    setIsCodeFixed(false);
    setSavedNotice(null);
  };

  const handleRunAnalysis = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() && !description.trim() && !sourceCode.trim()) {
      setErrorMsg('Please enter a bug description or source code snippet before running analysis.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setSavedNotice(null);

    try {
      const response = await fetch('/api/bugs/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          stackTrace,
          sourceCode: isCodeFixed ? originalFaultyCode : sourceCode,
          filePath,
          language,
          environment,
          ensemble,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Analysis request failed');
      }

      const data: BugAnalysisResult = await response.json();
      onAnalysisComplete(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to complete bug analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const formatMarkdownReport = (res: BugAnalysisResult): string => {
    const r = res.structuredReport;
    return `# [${r.reportId}] ${r.title}

**Severity:** ${r.severity} (${r.priority}) · **Category:** ${r.category} · **CWE:** ${r.cweId}
**Component:** ${r.affectedComponent} · **Environment:** ${r.environment}
**Duplicate Status:** ${
      res.isDuplicate
        ? `Potential Duplicate of ${res.duplicateMatches[0]?.bugId} (${(
            res.highestSimilarity * 100
          ).toFixed(1)}% similarity)`
        : 'Unique Issue'
    }

## Executive Summary
${r.executiveSummary}

## Steps to Reproduce
${r.stepsToReproduce.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}

## Expected vs. Actual Behavior
- **Expected:** ${r.expectedBehavior}
- **Actual:** ${r.actualBehavior}

## Root Cause Analysis
${r.rootCauseSummary}

## Recommended Fix & Patch
${r.recommendedFixSummary}

\`\`\`${language.toLowerCase()}
${res.recommendations[0]?.patchedCode || ''}
\`\`\`

## Regression Verification Plan
${r.regressionTestPlan.map((step) => `- [ ] ${step}`).join('\n')}
`;
  };

  const handleSaveStructuredBug = async (linkAsDuplicateOf?: string) => {
    if (!currentResult) return;
    const r = currentResult.structuredReport;
    const created = await onSaveBugToTracker({
      title: r.title,
      description,
      stackTrace,
      sourceCode,
      filePath,
      language,
      component: r.affectedComponent,
      severity: currentResult.severity,
      priority: currentResult.priority,
      category: currentResult.category,
      cweId: currentResult.cweId,
      status: linkAsDuplicateOf ? 'Duplicate' : isCodeFixed ? 'Resolved' : 'Open',
      duplicateOf: linkAsDuplicateOf,
      rootCauseSummary: r.rootCauseSummary,
      resolutionPatch: currentResult.recommendations[0]?.patchedCode,
      structuredReport: r,
    });

    if (created) {
      setSavedNotice(
        linkAsDuplicateOf
          ? `Logged as ${created.id} and linked as duplicate of ${linkAsDuplicateOf}`
          : `Committed structured report ${created.id} to Issue Tracker`
      );
    }
  };

  const handleApplyPatchToDuplicate = async (bugId: string) => {
    if (!currentResult || !currentResult.recommendations[0]) return;
    await onMarkExistingResolved(bugId, currentResult.recommendations[0].patchedCode);
    setSourceCode(currentResult.recommendations[0].patchedCode);
    setIsCodeFixed(true);
    setSavedNotice(`Applied recommended patch to ${bugId} and marked Resolved`);
  };

  const getSeverityTextColor = (sev: SeverityLevel) => {
    switch (sev) {
      case 'Critical':
        return 'text-red-400';
      case 'High':
        return 'text-amber-400';
      case 'Medium':
        return 'text-blue-400';
      case 'Low':
        return 'text-emerald-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Scenario & Model Selector Bar */}
      <div className="border border-slate-800 bg-[#111827] rounded-lg p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              01. Diagnostic Input & Preset Defect Scenarios
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select a scenario to inspect its line-level code errors, run the animated workflow, and auto-fix all defects.
            </p>
          </div>

          {/* Preset Scenario Segmented Controls */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#0B0F19] p-1 rounded-lg border border-slate-800">
            {PRESET_SCENARIOS.map((scen, idx) => {
              const active = selectedScenarioId === scen.id;
              return (
                <button
                  key={scen.id}
                  type="button"
                  onClick={() => handleLoadScenario(scen)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  0{idx + 1}. {scen.component} ({scen.language})
                </button>
              );
            })}
          </div>
        </div>

        {/* Model Ensemble Selection Row */}
        <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {ENSEMBLE_OPTIONS.map((opt) => {
            const isSelected = ensemble === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setEnsemble(opt.id)}
                className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-blue-500/80 bg-blue-950/25'
                    : 'border-slate-800 bg-[#0B0F19]/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100 truncate">
                    {opt.name}
                  </span>
                  <span className="text-[11px] font-mono text-blue-400 shrink-0">
                    {isSelected ? 'Active' : 'Select'}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                  {opt.models}
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-1">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive 6-Stage Animated Workflow & Line-Level Error Auto-Fixer */}
      <AnimatedWorkflowPipeline
        analysisResult={currentResult}
        sourceCode={originalFaultyCode}
        fixedCode={recommendedFixedCode}
        detectedErrors={activeDetectedErrors}
        isCodeFixed={isCodeFixed}
        onApplyAutoFix={handleApplyAutoFix}
        onResetFaultyCode={handleResetFaultyCode}
        isAnalyzingExternal={isAnalyzing}
      />

      {/* Main Split Workspace: Left = Input Form & Code Editor, Right = Multi-Model Analysis Output */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Bug Description, Stack Trace & Source Code Input (5 cols on xl) */}
        <form
          onSubmit={handleRunAnalysis}
          className="xl:col-span-5 border border-slate-800 bg-[#111827] rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Bug Description & Source Code Context
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Analyzed by Hugging Face embeddings & Gemini 3.8 AST reasoning
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!isCodeFixed ? (
                <button
                  type="button"
                  onClick={handleApplyAutoFix}
                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-4 whitespace-nowrap cursor-pointer"
                >
                  Auto-Fix Code Errors
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleResetFaultyCode}
                  className="text-xs font-medium text-amber-400 hover:text-amber-300 underline underline-offset-4 whitespace-nowrap cursor-pointer"
                >
                  Revert to Faulty
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Issue Summary / Bug Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Concurrent Stripe webhook retries trigger duplicate ledger entries"
              className="w-full px-3 py-2 text-sm bg-[#0B0F19] border border-slate-800 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Source File Path
              </label>
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0B0F19] border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F19] border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="TypeScript">TypeScript</option>
                <option value="Python">Python</option>
                <option value="Go">Go</option>
                <option value="Rust">Rust</option>
                <option value="Java">Java</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Environment
              </label>
              <input
                type="text"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F19] border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Symptom & Bug Behavior Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe observed failure behavior, frequency, and impact..."
              className="w-full px-3 py-2 text-xs leading-relaxed bg-[#0B0F19] border border-slate-800 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Exception / Stack Trace (Optional)
            </label>
            <textarea
              rows={2}
              value={stackTrace}
              onChange={(e) => setStackTrace(e.target.value)}
              placeholder="Paste runtime stack trace or error log..."
              className="w-full px-3 py-2 text-xs font-mono leading-relaxed bg-[#0B0F19] border border-slate-800 rounded-md text-red-300/90 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                Source Code Snippet ({isCodeFixed ? 'Patched & Verified' : `${activeDetectedErrors.length} Errors Detected`})
              </label>
              <span
                className={`text-[11px] font-mono tabular-nums ${
                  isCodeFixed ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isCodeFixed
                  ? '0 Errors · All Invariants Verified'
                  : `${activeDetectedErrors.length} Faulty Construct(s)`}
              </span>
            </div>
            <textarea
              rows={10}
              value={sourceCode}
              onChange={(e) => {
                setSourceCode(e.target.value);
                setOriginalFaultyCode(e.target.value);
                setIsCodeFixed(false);
              }}
              placeholder="Paste the relevant function, hook, or controller source code..."
              className={`w-full px-3 py-2.5 text-xs font-mono leading-relaxed bg-[#0B0F19] border rounded-md text-slate-100 placeholder-slate-600 focus:outline-none ${
                isCodeFixed
                  ? 'border-emerald-700/70 focus:border-emerald-500'
                  : 'border-slate-800 focus:border-blue-500'
              }`}
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-md border border-red-500/40 bg-red-950/20 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="submit"
              disabled={isAnalyzing}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 text-white text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Running AI Pipeline...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Analyze & Detect Duplicates</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleApplyAutoFix}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>
                {isCodeFixed ? 'Errors Fixed (Re-Apply)' : `Fix ${activeDetectedErrors.length} Given Error(s)`}
              </span>
            </button>
          </div>
        </form>

        {/* Right Column: Multi-Stage Analysis Output (7 cols on xl) */}
        <div className="xl:col-span-7 border border-slate-800 bg-[#111827] rounded-lg p-5 min-h-[620px] flex flex-col">
          {!currentResult && !isAnalyzing ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Terminal className="w-10 h-10 text-slate-600 mb-3" />
              <h3 className="text-base font-semibold text-slate-200">
                Ready for Multi-Model Defect Analysis
              </h3>
              <p className="text-xs text-slate-400 max-w-md mt-1.5 leading-relaxed">
                Click <span className="text-slate-200 font-medium">Analyze & Detect Duplicates</span> to run semantic vector deduplication, zero-shot severity triage, AST root-cause localization, and automated report synthesis.
              </p>
              <button
                type="button"
                onClick={() => handleRunAnalysis()}
                className="mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Analysis on Current Scenario</span>
              </button>
            </div>
          ) : isAnalyzing ? (
            <div className="flex-1 flex flex-col justify-center space-y-5 p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Executing 5-Stage Hugging Face & Gemini Diagnostic Pipeline
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Computing vector cosine similarity, zero-shot CWE classification, and unified code diff...
                  </p>
                </div>
              </div>
              <div className="space-y-3 border-t border-slate-800 pt-4">
                {[
                  'Stage 1 · BAAI/bge-large-en-v1.5 + Gemini Embedding 2: Querying issue vector index',
                  'Stage 2 · microsoft/codebert-base: Computing AST token & stack frame overlap',
                  'Stage 3 · facebook/bart-large-mnli: Zero-shot severity & CWE defect classification',
                  'Stage 4 · Qwen2.5-Coder-32B + Gemini 3.8 Flash: Pinpointing offending lines & root cause',
                  'Stage 5 · Structured Bug Report & Regression Unit Test synthesis',
                ].map((stepText, idx) => (
                  <div
                    key={idx}
                    className="h-9 px-3 rounded bg-[#0B0F19] border border-slate-800/80 flex items-center justify-between text-xs text-slate-300 animate-pulse"
                  >
                    <span className="font-mono text-[11px]">{stepText}</span>
                    <span className="text-[11px] font-mono text-blue-400">Running...</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            currentResult && (
              <div className="space-y-5 flex-1 flex flex-col">
                {/* Top Summary Banner with Zero-Pill Metadata Discipline */}
                <div className="pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className={`font-semibold ${getSeverityTextColor(currentResult.severity)}`}>
                        {currentResult.severity} Severity ({currentResult.priority})
                      </span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-300">{currentResult.cweId}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-300">{currentResult.category}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-400 tabular-nums">
                        {currentResult.isDuplicate
                          ? `Duplicate Detected (${(currentResult.highestSimilarity * 100).toFixed(1)}% match)`
                          : `Unique Issue (Max overlap ${(currentResult.highestSimilarity * 100).toFixed(1)}%)`}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-100 mt-1">
                      {currentResult.structuredReport.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSaveStructuredBug()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Save to Issue Tracker</span>
                    </button>
                  </div>
                </div>

                {savedNotice && (
                  <div className="px-3.5 py-2.5 rounded-md border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{savedNotice}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSavedNotice(null)}
                      className="text-xs text-emerald-400 hover:underline cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Result View Navigation Tabs (Interactive Segmented Controls) */}
                <div className="flex items-center gap-1 bg-[#0B0F19] p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveResultTab('overview')}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeResultTab === 'overview'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    <span>Duplicates & Root Cause ({currentResult.duplicateMatches.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveResultTab('patch')}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeResultTab === 'patch'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Recommended Patch & Tests</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveResultTab('report')}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeResultTab === 'report'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Structured Bug Report</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveResultTab('pipeline')}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeResultTab === 'pipeline'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Model Telemetry</span>
                  </button>
                </div>

                {/* TAB 1: DUPLICATES & ROOT CAUSE */}
                {activeResultTab === 'overview' && (
                  <div className="space-y-6 flex-1">
                    {/* Severity Justification */}
                    <div className="p-3.5 rounded-md bg-[#0B0F19] border border-slate-800">
                      <div className="text-xs font-semibold text-slate-200 mb-1">
                        Severity & Triage Assessment ({currentResult.severity} / {currentResult.priority})
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {currentResult.severityJustification}
                      </p>
                    </div>

                    {/* Semantic & CodeBERT Duplicate Detection Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs font-semibold text-slate-200">
                          01. Semantic Embedding & CodeBERT Duplicate Issue Detection
                        </h4>
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                          Threshold: 68.0% cosine similarity
                        </span>
                      </div>

                      {currentResult.duplicateMatches.length === 0 ? (
                        <div className="p-4 rounded-md bg-[#0B0F19] border border-slate-800 text-xs text-slate-400">
                          No similar or duplicate issues found in the repository. This appears to be a novel defect.
                        </div>
                      ) : (
                        <div className="border border-slate-800 rounded-md overflow-hidden divide-y divide-slate-800 bg-[#0B0F19]">
                          {currentResult.duplicateMatches.map((match) => {
                            const pct = (match.similarityScore * 100).toFixed(1);
                            const isHigh = match.similarityScore >= 0.68;
                            return (
                              <div key={match.bugId} className="p-3.5 space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => onSelectTrackedBug(match.bugId)}
                                      className="font-mono text-xs font-semibold text-blue-400 hover:underline shrink-0 cursor-pointer"
                                    >
                                      {match.bugId}
                                    </button>
                                    <span aria-hidden="true" className="text-slate-600">·</span>
                                    <span className="text-xs font-medium text-slate-100 truncate">
                                      {match.title}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs font-mono shrink-0 tabular-nums">
                                    <span
                                      className={
                                        isHigh
                                          ? 'text-amber-400 font-semibold'
                                          : 'text-slate-400'
                                      }
                                    >
                                      {pct}% Match ({match.matchClassification})
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
                                  <div>
                                    <span>Dense Vector (BGE/Gemini): {(match.embeddingScore * 100).toFixed(1)}%</span>
                                    <span aria-hidden="true" className="mx-1.5">·</span>
                                    <span>CodeBERT AST Overlap: {(match.astTokenScore * 100).toFixed(1)}%</span>
                                    <span aria-hidden="true" className="mx-1.5">·</span>
                                    <span>Status: {match.status}</span>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveStructuredBug(match.bugId)}
                                      className="text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer"
                                    >
                                      Link as Duplicate of {match.bugId}
                                    </button>
                                    {match.status !== 'Resolved' && (
                                      <button
                                        type="button"
                                        onClick={() => handleApplyPatchToDuplicate(match.bugId)}
                                        className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
                                      >
                                        Apply Generated Patch to {match.bugId}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {match.sharedSymbols.length > 0 && (
                                  <div className="text-[11px] font-mono text-slate-500">
                                    Shared AST Symbols: {match.sharedSymbols.join(' · ')}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Root Cause Localization Section */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200 mb-2.5">
                        02. Source Code Root Cause Localization
                      </h4>
                      <div className="space-y-3">
                        {currentResult.rootCauses.map((rc) => (
                          <div
                            key={rc.id}
                            className="p-4 rounded-md bg-[#0B0F19] border border-slate-800 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-100">
                                {rc.title}
                              </span>
                              <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                                {rc.offendingLines} · {(rc.confidence * 100).toFixed(0)}% confidence
                              </span>
                            </div>

                            <p className="text-xs text-slate-300 leading-relaxed">
                              {rc.mechanismExplanation}
                            </p>

                            {rc.codeConstruct && (
                              <pre className="p-2.5 rounded bg-[#111827] border border-slate-800/90 text-[11px] font-mono text-amber-300/90 overflow-x-auto">
                                {rc.codeConstruct}
                              </pre>
                            )}

                            <div className="text-[11px] font-mono text-slate-400 pt-1">
                              Violated Invariant: <span className="text-slate-200">{rc.invariantViolated}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: RECOMMENDED PATCH & DIFF */}
                {activeResultTab === 'patch' && (
                  <div className="space-y-4 flex-1">
                    {currentResult.recommendations.map((rec) => (
                      <div key={rec.id} className="space-y-4">
                        <div className="p-3.5 rounded-md bg-[#0B0F19] border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                              <span className="text-emerald-400 font-medium">{rec.strategyType}</span>
                              <span aria-hidden="true">·</span>
                              <span>Complexity: {rec.estimatedComplexity}</span>
                            </div>
                            <h4 className="text-sm font-semibold text-slate-100 mt-0.5">
                              {rec.title}
                            </h4>
                            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                              {rec.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyText(rec.patchedCode, rec.id)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                            >
                              {copiedId === rec.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Copied Patch</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy Patched Code</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSourceCode(rec.patchedCode);
                                setIsCodeFixed(true);
                                setSavedNotice('Loaded patched code into source editor and resolved errors.');
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer"
                            >
                              Apply Fix to Editor
                            </button>
                          </div>
                        </div>

                        {/* Diff View Mode Selector */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 bg-[#0B0F19] p-1 rounded-md border border-slate-800">
                            <button
                              type="button"
                              onClick={() => setDiffMode('side-by-side')}
                              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                                diffMode === 'side-by-side'
                                  ? 'bg-slate-800 text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Side-by-Side Comparison
                            </button>
                            <button
                              type="button"
                              onClick={() => setDiffMode('unified')}
                              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                                diffMode === 'unified'
                                  ? 'bg-slate-800 text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Unified Diff Patch
                            </button>
                            <button
                              type="button"
                              onClick={() => setDiffMode('test')}
                              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                                diffMode === 'test'
                                  ? 'bg-slate-800 text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Generated Unit Test
                            </button>
                          </div>
                          <span className="text-xs font-mono text-slate-400">{filePath}</span>
                        </div>

                        {diffMode === 'side-by-side' && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="border border-red-900/40 bg-[#0B0F19] rounded-md overflow-hidden">
                              <div className="px-3 py-1.5 bg-red-950/30 border-b border-red-900/40 text-[11px] font-mono text-red-300 flex items-center justify-between">
                                <span>Original Faulty Code</span>
                                <span>Before</span>
                              </div>
                              <pre className="p-3 text-[11px] font-mono leading-relaxed text-slate-300 overflow-x-auto max-h-[340px]">
                                {rec.originalCode || originalFaultyCode}
                              </pre>
                            </div>
                            <div className="border border-emerald-900/40 bg-[#0B0F19] rounded-md overflow-hidden">
                              <div className="px-3 py-1.5 bg-emerald-950/30 border-b border-emerald-900/40 text-[11px] font-mono text-emerald-300 flex items-center justify-between">
                                <span>Recommended Refactored Patch</span>
                                <span>After (0 Errors)</span>
                              </div>
                              <pre className="p-3 text-[11px] font-mono leading-relaxed text-emerald-100 overflow-x-auto max-h-[340px]">
                                {rec.patchedCode}
                              </pre>
                            </div>
                          </div>
                        )}

                        {diffMode === 'unified' && (
                          <div className="border border-slate-800 bg-[#0B0F19] rounded-md overflow-hidden">
                            <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400">
                              Unified Git Patch ({filePath})
                            </div>
                            <pre className="p-3.5 text-xs font-mono leading-relaxed text-slate-200 overflow-x-auto max-h-[360px]">
                              {rec.unifiedDiff}
                            </pre>
                          </div>
                        )}

                        {diffMode === 'test' && (
                          <div className="border border-slate-800 bg-[#0B0F19] rounded-md overflow-hidden">
                            <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                              <span>Automated Regression Test Suite</span>
                              <button
                                type="button"
                                onClick={() => handleCopyText(rec.verificationTestCode, 'test-copy')}
                                className="text-blue-400 hover:underline cursor-pointer"
                              >
                                {copiedId === 'test-copy' ? 'Copied' : 'Copy Test'}
                              </button>
                            </div>
                            <pre className="p-3.5 text-xs font-mono leading-relaxed text-blue-200 overflow-x-auto max-h-[360px]">
                              {rec.verificationTestCode}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 3: STRUCTURED BUG REPORT */}
                {activeResultTab === 'report' && (
                  <div className="space-y-4 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-400 font-mono">
                        Report ID: {currentResult.structuredReport.reportId} · Auto-Structured by LLM
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(formatMarkdownReport(currentResult), 'md-report')
                          }
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedId === 'md-report' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied Markdown</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Markdown</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const blob = new Blob(
                              [JSON.stringify(currentResult.structuredReport, null, 2)],
                              { type: 'application/json' }
                            );
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${currentResult.structuredReport.reportId}.json`;
                            a.click();
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export JSON</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-4 rounded-md bg-[#0B0F19] border border-slate-800 space-y-4 text-xs">
                      <div className="border-b border-slate-800 pb-3">
                        <div className="text-slate-400 font-mono text-[11px]">
                          {currentResult.structuredReport.severity} ({currentResult.structuredReport.priority}) · {currentResult.structuredReport.category} · {currentResult.structuredReport.cweId} · {currentResult.structuredReport.affectedComponent}
                        </div>
                        <h4 className="text-sm font-semibold text-slate-100 mt-1">
                          {currentResult.structuredReport.title}
                        </h4>
                        <p className="text-slate-300 mt-1.5 leading-relaxed">
                          {currentResult.structuredReport.executiveSummary}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="font-semibold text-slate-200 mb-1.5">
                            Steps to Reproduce
                          </div>
                          <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed">
                            {currentResult.structuredReport.stepsToReproduce.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </div>
                        <div className="space-y-2.5">
                          <div>
                            <span className="font-semibold text-slate-200 block mb-0.5">
                              Expected Behavior
                            </span>
                            <p className="text-slate-300 leading-relaxed">
                              {currentResult.structuredReport.expectedBehavior}
                            </p>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-200 block mb-0.5">
                              Actual Behavior
                            </span>
                            <p className="text-slate-300 leading-relaxed">
                              {currentResult.structuredReport.actualBehavior}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-800 pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="font-semibold text-slate-200 block mb-1">
                            Root Cause Breakdown
                          </span>
                          <p className="text-slate-300 leading-relaxed">
                            {currentResult.structuredReport.rootCauseSummary}
                          </p>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-200 block mb-1">
                            Verification & Regression Test Plan
                          </span>
                          <ul className="list-disc list-inside space-y-1 text-slate-300 leading-relaxed">
                            {currentResult.structuredReport.regressionTestPlan.map((plan, i) => (
                              <li key={i}>{plan}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: MULTI-MODEL EXECUTION TRACE */}
                {activeResultTab === 'pipeline' && (
                  <div className="space-y-3 flex-1">
                    <div className="text-xs text-slate-400">
                      Execution trace across Hugging Face feature-extraction/classification models and Advanced LLM code reasoning stages:
                    </div>
                    <div className="border border-slate-800 rounded-md divide-y divide-slate-800 bg-[#0B0F19]">
                      {currentResult.modelTraces.map((trace, index) => (
                        <div key={index} className="p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-100">
                              0{index + 1}. {trace.stageName}
                            </span>
                            <span className="font-mono text-slate-400 tabular-nums">
                              {trace.latencyMs}ms · {(trace.confidenceScore * 100).toFixed(0)}% conf
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-blue-400">
                            Model: {trace.modelId} · Provider: {trace.provider} · Task: {trace.taskType}
                          </div>
                          <p className="text-xs text-slate-300">{trace.outputSummary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
