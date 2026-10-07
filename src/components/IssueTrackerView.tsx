import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react';
import type { BugStatus, SeverityLevel, TrackedBug } from '../types/bug';

interface IssueTrackerViewProps {
  bugs: TrackedBug[];
  selectedBugId: string | null;
  onSelectBug: (id: string) => void;
  onUpdateBugStatus: (id: string, status: BugStatus) => Promise<void>;
  onResolveAllOpenBugs: () => Promise<void>;
}

export const IssueTrackerView: React.FC<IssueTrackerViewProps> = ({
  bugs,
  selectedBugId,
  onSelectBug,
  onUpdateBugStatus,
  onResolveAllOpenBugs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'All' | SeverityLevel>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | BugStatus>('All');
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);

  const openCount = useMemo(
    () => bugs.filter((b) => b.status === 'Open' || b.status === 'In Progress').length,
    [bugs]
  );

  const handleBatchResolve = async () => {
    await onResolveAllOpenBugs();
    setBatchSuccessMsg('Applied verified AI patches to all open repository issues and linked duplicate BUG-1024 → BUG-1042.');
  };

  const filteredBugs = useMemo(() => {
    return bugs.filter((bug) => {
      const matchesSeverity = severityFilter === 'All' || bug.severity === severityFilter;
      const matchesStatus = statusFilter === 'All' || bug.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        bug.id.toLowerCase().includes(q) ||
        bug.title.toLowerCase().includes(q) ||
        bug.component.toLowerCase().includes(q) ||
        bug.category.toLowerCase().includes(q) ||
        bug.cweId.toLowerCase().includes(q) ||
        bug.filePath.toLowerCase().includes(q);
      return matchesSeverity && matchesStatus && matchesSearch;
    });
  }, [bugs, searchQuery, severityFilter, statusFilter]);

  const activeBug = useMemo(() => {
    return bugs.find((b) => b.id === selectedBugId) || filteredBugs[0] || null;
  }, [bugs, selectedBugId, filteredBugs]);

  const getSeverityColor = (sev: SeverityLevel) => {
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

  const getStatusColor = (status: BugStatus) => {
    switch (status) {
      case 'Open':
        return 'text-red-400';
      case 'In Progress':
        return 'text-amber-400';
      case 'Resolved':
        return 'text-emerald-400';
      case 'Duplicate':
        return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter & Search Bar */}
      <div className="border border-slate-800 bg-[#111827] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by Bug ID, CWE, title, file path, or subsystem..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0B0F19] border border-slate-800 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Interactive Severity Filter Controls */}
          <div className="flex items-center gap-1 bg-[#0B0F19] p-1 rounded-lg border border-slate-800">
            {(['All', 'Critical', 'High', 'Medium', 'Low'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  severityFilter === sev
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          {/* Interactive Status Filter Controls */}
          <div className="flex items-center gap-1 bg-[#0B0F19] p-1 rounded-lg border border-slate-800">
            {(['All', 'Open', 'In Progress', 'Resolved', 'Duplicate'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === st
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {openCount > 0 && (
            <button
              type="button"
              onClick={handleBatchResolve}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Fix & Resolve All Open ({openCount})</span>
            </button>
          )}
        </div>
      </div>

      {batchSuccessMsg && (
        <div className="px-4 py-2.5 rounded-md border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{batchSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setBatchSuccessMsg(null)}
            className="text-emerald-400 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Split Grid: High-Density Table + Detailed Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: High-Density Bug Table */}
        <div className="xl:col-span-7 border border-slate-800 bg-[#111827] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              Repository Issue Ledger
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              Showing {filteredBugs.length} of {bugs.length} issues
            </span>
          </div>

          {filteredBugs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-slate-400">
                No tracked issues match the active search or filter criteria.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSeverityFilter('All');
                  setStatusFilter('All');
                }}
                className="mt-3 px-3 py-1.5 bg-slate-800 text-slate-200 text-xs rounded-md hover:bg-slate-700"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0B0F19]/60 text-[11px] font-mono text-slate-400">
                    <th className="py-2.5 px-4 font-medium">ID</th>
                    <th className="py-2.5 px-4 font-medium">Issue Summary & File</th>
                    <th className="py-2.5 px-4 font-medium">Severity</th>
                    <th className="py-2.5 px-4 font-medium">CWE</th>
                    <th className="py-2.5 px-4 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {filteredBugs.map((bug) => {
                    const isSelected = activeBug?.id === bug.id;
                    return (
                      <tr
                        key={bug.id}
                        onClick={() => onSelectBug(bug.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-950/30'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-blue-400 whitespace-nowrap tabular-nums">
                          {bug.id}
                        </td>
                        <td className="py-3 px-4 min-w-[240px]">
                          <div className="font-medium text-slate-100 line-clamp-1">
                            {bug.title}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {bug.component} · {bug.filePath}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono whitespace-nowrap">
                          <span className={getSeverityColor(bug.severity)}>
                            {bug.severity} · {bug.priority}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap tabular-nums">
                          {bug.cweId}
                        </td>
                        <td className="py-3 px-4 font-mono text-right whitespace-nowrap">
                          <span className={getStatusColor(bug.status)}>
                            {bug.status}
                            {bug.duplicateOf ? ` (${bug.duplicateOf})` : ''}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right 5 Cols: Active Issue Deep Inspector */}
        <div className="xl:col-span-5 border border-slate-800 bg-[#111827] rounded-lg p-5 space-y-4">
          {activeBug ? (
            <>
              <div className="border-b border-slate-800 pb-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-blue-400 font-semibold">{activeBug.id}</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className={getSeverityColor(activeBug.severity)}>
                      {activeBug.severity} ({activeBug.priority})
                    </span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-slate-300">{activeBug.cweId}</span>
                  </div>

                  {/* Status Transition Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    {(['Open', 'In Progress', 'Resolved'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => onUpdateBugStatus(activeBug.id, st)}
                        className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                          activeBug.status === st
                            ? 'bg-blue-600 text-white'
                            : 'bg-[#0B0F19] text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-slate-100 mt-2">
                  {activeBug.title}
                </h3>
                <div className="text-[11px] text-slate-400 font-mono mt-1">
                  {activeBug.component} · {activeBug.filePath} · Reported by {activeBug.reporter}
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="font-semibold text-slate-200 mb-1">Issue Description</div>
                  <p className="text-slate-300 leading-relaxed">{activeBug.description}</p>
                </div>

                <div className="p-3 rounded-md bg-[#0B0F19] border border-slate-800">
                  <div className="font-semibold text-slate-200 mb-1">
                    AI Root Cause Diagnosis ({activeBug.category})
                  </div>
                  <p className="text-slate-300 leading-relaxed">{activeBug.rootCauseSummary}</p>
                </div>

                {activeBug.stackTrace && (
                  <div>
                    <div className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-slate-400" />
                      <span>Stack Trace</span>
                    </div>
                    <pre className="p-2.5 rounded-md bg-[#0B0F19] border border-slate-800 text-[11px] font-mono text-red-300/90 overflow-x-auto">
                      {activeBug.stackTrace}
                    </pre>
                  </div>
                )}

                <div>
                  <div className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Faulty Source Code ({activeBug.filePath})</span>
                  </div>
                  <pre className="p-3 rounded-md bg-[#0B0F19] border border-slate-800 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-[220px]">
                    {activeBug.sourceCode}
                  </pre>
                </div>

                {activeBug.resolutionPatch && (
                  <div>
                    <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified Resolution Patch</span>
                    </div>
                    <pre className="p-3 rounded-md bg-[#0B0F19] border border-emerald-900/50 text-[11px] font-mono text-emerald-200 overflow-x-auto max-h-[220px]">
                      {activeBug.resolutionPatch}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              Select an issue from the repository ledger to inspect its source code, root cause, and patch.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
