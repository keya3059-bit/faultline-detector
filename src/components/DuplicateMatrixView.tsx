import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  GitCompare,
  GitMerge,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { PairwiseDuplicateCluster, TrackedBug } from '../types/bug';

interface DuplicateMatrixViewProps {
  bugs: TrackedBug[];
  onLinkDuplicatePair: (duplicateBugId: string, canonicalBugId: string) => Promise<void>;
  onSelectTrackedBug: (bugId: string) => void;
}

export const DuplicateMatrixView: React.FC<DuplicateMatrixViewProps> = ({
  bugs,
  onLinkDuplicatePair,
  onSelectTrackedBug,
}) => {
  const [clusters, setClusters] = useState<PairwiseDuplicateCluster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<'all' | 'high'>('all');
  const [mergeFeedback, setMergeFeedback] = useState<string | null>(null);

  const fetchClusters = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bugs/duplicates');
      if (res.ok) {
        const data = await res.json();
        setClusters(data.clusters || []);
        if (data.clusters?.length > 0 && !selectedPairId) {
          setSelectedPairId(data.clusters[0].pairId);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClusters();
  }, [bugs]);

  const filteredClusters = clusters.filter((c) =>
    threshold === 'high' ? c.combinedSimilarity >= 0.55 : true
  );

  const activeCluster =
    filteredClusters.find((c) => c.pairId === selectedPairId) || filteredClusters[0] || null;

  const sourceBug = bugs.find((b) => b.id === activeCluster?.sourceBugId);
  const targetBug = bugs.find((b) => b.id === activeCluster?.targetBugId);

  const handleConfirmDuplicate = async (dupId: string, canonicalId: string) => {
    await onLinkDuplicatePair(dupId, canonicalId);
    setMergeFeedback(`Linked ${dupId} as a confirmed duplicate of ${canonicalId}`);
    await fetchClusters();
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="border border-slate-800 bg-[#111827] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Repository-Wide Semantic & AST Duplicate Detection Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Pairwise cosine similarity across issue descriptions (BGE-Large / Gemini Embedding) and source code AST tokens (CodeBERT).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-[#0B0F19] p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setThreshold('all')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                threshold === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Overlaps (&ge;25%)
            </button>
            <button
              type="button"
              onClick={() => setThreshold('high')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                threshold === 'high'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              High Similarity (&ge;55%)
            </button>
          </div>

          <button
            type="button"
            onClick={fetchClusters}
            className="px-3 py-1.5 bg-[#0B0F19] hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Recompute Matrix</span>
          </button>
        </div>
      </div>

      {mergeFeedback && (
        <div className="px-4 py-2.5 rounded-md border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{mergeFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setMergeFeedback(null)}
            className="text-emerald-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 6 Cols: Pairwise Similarity Table */}
        <div className="xl:col-span-6 border border-slate-800 bg-[#111827] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              Detected Issue Overlap Pairs
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {filteredClusters.length} pairs identified
            </span>
          </div>

          {loading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span>Computing pairwise vector & AST similarity matrix...</span>
            </div>
          ) : filteredClusters.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No duplicate clusters above the selected similarity threshold.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filteredClusters.map((pair) => {
                const isSelected = activeCluster?.pairId === pair.pairId;
                const pct = (pair.combinedSimilarity * 100).toFixed(1);
                return (
                  <div
                    key={pair.pairId}
                    onClick={() => setSelectedPairId(pair.pairId)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-950/30' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="font-semibold text-blue-400">{pair.sourceBugId}</span>
                        <GitCompare className="w-3.5 h-3.5 text-slate-500" />
                        <span className="font-semibold text-blue-400">{pair.targetBugId}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-slate-400">{pair.component}</span>
                      </div>
                      <div className="text-xs font-mono tabular-nums">
                        <span
                          className={
                            pair.combinedSimilarity >= 0.65
                              ? 'text-amber-400 font-semibold'
                              : 'text-slate-300'
                          }
                        >
                          {pct}% Combined
                        </span>
                        <span aria-hidden="true" className="mx-1.5 text-slate-600">·</span>
                        <span
                          className={
                            pair.status === 'Confirmed Duplicate'
                              ? 'text-emerald-400'
                              : 'text-slate-400'
                          }
                        >
                          {pair.status}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 space-y-1 text-xs">
                      <div className="text-slate-200 truncate">
                        A: {pair.sourceTitle}
                      </div>
                      <div className="text-slate-400 truncate">
                        B: {pair.targetTitle}
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 tabular-nums">
                      <div>
                        <span>Semantic Vector: {(pair.semanticScore * 100).toFixed(1)}%</span>
                        <span aria-hidden="true" className="mx-1.5">·</span>
                        <span>CodeBERT AST: {(pair.codeAstScore * 100).toFixed(1)}%</span>
                      </div>
                      {pair.sharedTokens.length > 0 && (
                        <div className="text-slate-500 truncate max-w-[260px]">
                          Tokens: {pair.sharedTokens.slice(0, 4).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 6 Cols: Side-by-Side Pair Comparison & Deduplication Action */}
        <div className="xl:col-span-6 border border-slate-800 bg-[#111827] rounded-lg p-5 space-y-4">
          {activeCluster && sourceBug && targetBug ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div>
                  <div className="text-xs font-mono text-slate-400 tabular-nums">
                    Pairwise Comparison · {(activeCluster.combinedSimilarity * 100).toFixed(1)}% Total Similarity
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100 mt-0.5">
                    {sourceBug.id} vs. {targetBug.id} ({activeCluster.component})
                  </h3>
                </div>

                {activeCluster.status !== 'Confirmed Duplicate' ? (
                  <button
                    type="button"
                    onClick={() => handleConfirmDuplicate(targetBug.id, sourceBug.id)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>Mark {targetBug.id} Duplicate of {sourceBug.id}</span>
                  </button>
                ) : (
                  <span className="text-xs font-mono text-emerald-400">
                    Confirmed Duplicate Linked
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-md bg-[#0B0F19] border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <button
                      type="button"
                      onClick={() => onSelectTrackedBug(sourceBug.id)}
                      className="text-blue-400 font-semibold hover:underline"
                    >
                      {sourceBug.id} (Primary)
                    </button>
                    <span className="text-slate-400">
                      {sourceBug.severity} · {sourceBug.status}
                    </span>
                  </div>
                  <div className="font-semibold text-slate-100">{sourceBug.title}</div>
                  <p className="text-slate-400 leading-relaxed">{sourceBug.description}</p>
                  <div className="text-[11px] font-mono text-slate-500 pt-1">
                    File: {sourceBug.filePath}
                  </div>
                  <pre className="p-2.5 rounded bg-[#111827] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-[200px]">
                    {sourceBug.sourceCode}
                  </pre>
                </div>

                <div className="p-3.5 rounded-md bg-[#0B0F19] border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <button
                      type="button"
                      onClick={() => onSelectTrackedBug(targetBug.id)}
                      className="text-blue-400 font-semibold hover:underline"
                    >
                      {targetBug.id} (Candidate)
                    </button>
                    <span className="text-slate-400">
                      {targetBug.severity} · {targetBug.status}
                    </span>
                  </div>
                  <div className="font-semibold text-slate-100">{targetBug.title}</div>
                  <p className="text-slate-400 leading-relaxed">{targetBug.description}</p>
                  <div className="text-[11px] font-mono text-slate-500 pt-1">
                    File: {targetBug.filePath}
                  </div>
                  <pre className="p-2.5 rounded bg-[#111827] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-[200px]">
                    {targetBug.sourceCode}
                  </pre>
                </div>
              </div>

              <div className="p-3.5 rounded-md bg-[#0B0F19] border border-slate-800 space-y-1.5 text-xs">
                <div className="font-semibold text-slate-200">
                  Shared AST Identifiers & Defect Signatures
                </div>
                <div className="font-mono text-slate-400 text-[11px]">
                  {activeCluster.sharedTokens.join(' · ') || 'No shared tokens'}
                </div>
                <p className="text-slate-400 text-xs pt-1">
                  Both issues touch <span className="text-slate-200 font-mono">{sourceBug.filePath}</span> and exhibit matching <span className="text-slate-200">{sourceBug.category}</span> patterns.
                </p>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              Select a pair from the similarity matrix to compare source code and link duplicates.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
