import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileCode,
  Loader2,
  Play,
  Terminal,
} from 'lucide-react';
import { PRESET_SCENARIOS } from '../data/seedBugs';

interface PythonRuntimeStatus {
  status: string;
  pythonVersion: string;
  implementation: string;
  platform: string;
  modules: string[];
  hfModelsConfigured: string[];
}

interface PythonAnalysisResult {
  engine: string;
  latencyMs: number;
  astAnalysis: {
    pythonAstParsed: boolean;
    syntaxNote: string | null;
    nodeSummary: Record<string, number>;
    astFindings: {
      line: number;
      astNode: string;
      cweId: string;
      severity: string;
      message: string;
    }[];
  };
  similarityScore: number;
  sharedAstTokens: string[];
  zeroShotClassification: {
    topLabel: string;
    topScore: number;
    distribution: { label: string; score: number }[];
  };
  unifiedDiff: string;
}

export const PythonBackendView: React.FC = () => {
  const pythonScenario = PRESET_SCENARIOS[2]; // Python / FastAPI SQL Injection & OOM scenario

  const [runtime, setRuntime] = useState<PythonRuntimeStatus | null>(null);
  const [backendFiles, setBackendFiles] = useState<Record<string, string>>({});
  const [selectedFileTab, setSelectedFileTab] = useState<string>('backend/main.py');

  const [sourceCode, setSourceCode] = useState<string>(pythonScenario.sourceCode);
  const [patchedCode, setPatchedCode] = useState<string>(pythonScenario.fixedSourceCode);
  const [description, setDescription] = useState<string>(pythonScenario.description);
  const [filePath, setFilePath] = useState<string>(pythonScenario.filePath);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [pyResult, setPyResult] = useState<PythonAnalysisResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/python/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.runtime) setRuntime(data.runtime);
        if (data.files) setBackendFiles(data.files);
      })
      .catch((err) => console.error('Failed to load Python backend status:', err));

    // Automatically run initial Python AST & difflib analysis on mount
    handleExecutePythonEngine(
      pythonScenario.sourceCode,
      pythonScenario.fixedSourceCode,
      pythonScenario.description,
      pythonScenario.filePath
    );
  }, []);

  const handleExecutePythonEngine = async (
    src = sourceCode,
    patch = patchedCode,
    desc = description,
    fp = filePath
  ) => {
    setIsRunning(true);
    try {
      const res = await fetch('/api/python/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCode: src,
          patchedCode: patch,
          description: desc,
          filePath: fp,
        }),
      });
      if (res.ok) {
        const data: PythonAnalysisResult = await res.json();
        setPyResult(data);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace('backend/', '');
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Top Python Runtime Status Banner */}
      <div className="border border-slate-800 bg-[#111827] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="text-emerald-400 font-semibold">
              Python Backend Active ({runtime ? `Python ${runtime.pythonVersion}` : 'Python 3.10'})
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-slate-300">
              FastAPI + Native `ast` & `difflib` + Hugging Face Inference
            </span>
            {runtime?.platform && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400">{runtime.platform}</span>
              </>
            )}
          </div>
          <h2 className="text-base font-semibold text-slate-100 mt-1">
            Python 3 Backend Service (`backend/main.py` & `backend/bug_analyzer.py`)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Executes real Python `ast.parse()` static security tree traversal, `difflib.unified_diff()` patch synthesis, and Hugging Face model orchestration on the backend.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => handleExecutePythonEngine()}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Executing Python 3 Engine...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Execute Python 3 AST & Diff Analyzer</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Python 3 AST & Difflib Interactive Execution Studio */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 5 Cols: Python Input Code & Target Patch */}
        <div className="xl:col-span-5 border border-slate-800 bg-[#111827] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Python AST & Diff Input Buffer
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Sent to `python3 backend/bug_analyzer.py` via `/api/python/analyze`
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {PRESET_SCENARIOS.map((scen, idx) => (
                <button
                  key={scen.id}
                  type="button"
                  onClick={() => {
                    setSourceCode(scen.sourceCode);
                    setPatchedCode(scen.fixedSourceCode);
                    setDescription(scen.description);
                    setFilePath(scen.filePath);
                    handleExecutePythonEngine(
                      scen.sourceCode,
                      scen.fixedSourceCode,
                      scen.description,
                      scen.filePath
                    );
                  }}
                  className={`px-2 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
                    filePath === scen.filePath
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#0B0F19] text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  S0{idx + 1} ({scen.language})
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Target File Path
            </label>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0B0F19] border border-slate-800 rounded-md text-slate-200"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Faulty Source Code (Parsed by Python `ast.parse`)
            </label>
            <textarea
              rows={8}
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              className="w-full p-2.5 text-xs font-mono bg-[#0B0F19] border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Refactored Patch Code (Compared by Python `difflib.unified_diff`)
            </label>
            <textarea
              rows={8}
              value={patchedCode}
              onChange={(e) => setPatchedCode(e.target.value)}
              className="w-full p-2.5 text-xs font-mono bg-[#0B0F19] border border-slate-800 rounded-md text-emerald-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Right 7 Cols: Live Output from Python 3 Process */}
        <div className="xl:col-span-7 border border-slate-800 bg-[#111827] rounded-lg p-5 space-y-4 min-h-[540px]">
          {!pyResult ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Click "Execute Python 3 AST & Diff Analyzer" to inspect live Python 3 output.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  <span className="text-slate-100 font-semibold">{pyResult.engine}</span>
                </div>
                <div className="text-slate-400 tabular-nums">
                  Execution Time: {pyResult.latencyMs}ms · AST Valid:{' '}
                  <span
                    className={
                      pyResult.astAnalysis.pythonAstParsed
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }
                  >
                    {pyResult.astAnalysis.pythonAstParsed
                      ? 'Yes (Native Python AST)'
                      : 'Multi-Lang Structural Lexer'}
                  </span>
                </div>
              </div>

              {/* Python AST Node Frequency Breakdown */}
              {Object.keys(pyResult.astAnalysis.nodeSummary || {}).length > 0 && (
                <div className="p-3.5 rounded-md bg-[#0B0F19] border border-slate-800 space-y-2">
                  <div className="text-xs font-semibold text-slate-200">
                    Python `ast.walk()` Node Distribution
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-slate-300 tabular-nums">
                    {Object.entries(pyResult.astAnalysis.nodeSummary).map(([nodeName, count]) => (
                      <span key={nodeName}>
                        <span className="text-blue-400">{nodeName}</span>: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AST Findings */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-200">
                  Python AST Security & Reliability Findings ({pyResult.astAnalysis.astFindings.length})
                </div>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-md bg-[#0B0F19]">
                  {pyResult.astAnalysis.astFindings.map((finding, idx) => (
                    <div key={idx} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-red-400 font-semibold">
                          Line {finding.line} · {finding.cweId} ({finding.severity})
                        </span>
                        <span className="text-blue-400">{finding.astNode}</span>
                      </div>
                      <p className="text-slate-300">{finding.message}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Python difflib.unified_diff Output */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Python `difflib.unified_diff` Output
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(pyResult.unifiedDiff, 'py-diff')}
                    className="text-xs font-mono text-blue-400 hover:underline cursor-pointer"
                  >
                    {copiedKey === 'py-diff' ? 'Copied Diff' : 'Copy Unified Diff'}
                  </button>
                </div>
                <pre className="p-3 rounded-md bg-[#0B0F19] border border-slate-800 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-[210px]">
                  {pyResult.unifiedDiff || 'No diff differences (source matches patched code).'}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Complete Python Backend Source Files Explorer (`backend/main.py`, `backend/bug_analyzer.py`, `backend/requirements.txt`) */}
      <div className="border border-slate-800 bg-[#111827] rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Python Backend Source Files (`/backend`)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspect, copy, or download the complete FastAPI + Hugging Face + Gemini Python backend implementation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-[#0B0F19] p-1 rounded-lg border border-slate-800">
              {(['backend/main.py', 'backend/bug_analyzer.py', 'backend/requirements.txt'] as const).map(
                (fileKey) => (
                  <button
                    key={fileKey}
                    type="button"
                    onClick={() => setSelectedFileTab(fileKey)}
                    className={`px-3 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                      selectedFileTab === fileKey
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {fileKey}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                handleCopy(backendFiles[selectedFileTab] || '', selectedFileTab)
              }
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copiedKey === selectedFileTab ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy File</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                handleDownloadFile(selectedFileTab, backendFiles[selectedFileTab] || '')
              }
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        <pre className="p-4 rounded-md bg-[#0B0F19] border border-slate-800 text-xs font-mono leading-relaxed text-slate-200 overflow-x-auto max-h-[420px]">
          {backendFiles[selectedFileTab] || 'Loading Python source file...'}
        </pre>
      </div>
    </div>
  );
};
