import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Plus,
} from 'lucide-react';
import { AnalyzerStudio } from './components/AnalyzerStudio';
import { IssueTrackerView } from './components/IssueTrackerView';
import { DuplicateMatrixView } from './components/DuplicateMatrixView';
import { ModelsPipelineView } from './components/ModelsPipelineView';
import { PythonBackendView } from './components/PythonBackendView';
import type {
  BugAnalysisResult,
  BugStatus,
  TrackedBug,
} from './types/bug';

const INITIAL_DEMO_ANALYSIS: BugAnalysisResult = {
  analysisId: 'ANL-849201',
  timestamp: '2026-10-06T20:58:00.000Z',
  ensembleUsed: 'hybrid-hf-gemini',
  severity: 'Critical',
  priority: 'P0',
  severityJustification:
    'Classified as Critical (P0) because concurrent Stripe webhook retries bypass the non-transactional idempotency check and double-credit customer financial ledger balances in production.',
  category: 'Concurrency / Time-of-Check to Time-of-Use (TOCTOU)',
  cweId: 'CWE-367',
  affectedComponent: 'Billing & Ledger',
  isDuplicate: true,
  highestSimilarity: 0.942,
  duplicateMatches: [
    {
      bugId: 'BUG-1042',
      title: 'Concurrent Stripe webhook retries trigger duplicate ledger credit entries',
      status: 'Open',
      severity: 'Critical',
      component: 'Billing & Ledger',
      similarityScore: 0.942,
      embeddingScore: 0.951,
      astTokenScore: 0.932,
      matchClassification: 'Exact Duplicate',
      sharedSymbols: [
        'handlepaymentintentsucceeded',
        'webhookevents',
        'balancecents',
        'paymentintent',
        'findunique',
      ],
      existingResolutionSummary:
        'Non-atomic read-modify-write sequence on wallet balance combined with check-then-act on webhookEvents without a serializable transaction or row-level advisory lock.',
    },
    {
      bugId: 'BUG-1024',
      title: 'Double invoice charge when checkout confirmation webhook arrives twice concurrently',
      status: 'Open',
      severity: 'Critical',
      component: 'Billing & Ledger',
      similarityScore: 0.784,
      embeddingScore: 0.812,
      astTokenScore: 0.755,
      matchClassification: 'Exact Duplicate',
      sharedSymbols: ['webhookevents', 'balancecents', 'wallets', 'completed', 'findunique'],
      existingResolutionSummary:
        'Duplicate of BUG-1042: Missing transactional isolation and atomic increment during concurrent webhook execution.',
    },
  ],
  rootCauses: [
    {
      id: 'RC-01',
      title: 'Unguarded Check-Then-Act Race on `db.webhookEvents` (Lines 6–9 & 20–24)',
      confidence: 0.97,
      offendingLines: 'Lines 6–24',
      codeConstruct: `const existing = await db.webhookEvents.findUnique({ where: { eventId } });
if (existing && existing.status === 'COMPLETED') return { skipped: true };
// ... non-transactional window where parallel request passes check ...
const wallet = await db.wallets.findUnique({ where: { userId: paymentIntent.metadata.userId } });`,
      mechanismExplanation:
        'Two concurrent `payment_intent.succeeded` deliveries execute `db.webhookEvents.findUnique` before either reaches `db.webhookEvents.upsert`. Because Read Committed isolation does not lock non-existent rows, both handlers proceed to increment the wallet balance.',
      invariantViolated: 'Idempotent Webhook Execution & Atomic Ledger Balance Mutation',
    },
    {
      id: 'RC-02',
      title: 'Lost Update via Read-Modify-Write on `wallet.balanceCents` (Lines 12–17)',
      confidence: 0.93,
      offendingLines: 'Lines 12–17',
      codeConstruct: `const wallet = await db.wallets.findUnique({ where: { userId } });
const updatedBalance = wallet.balanceCents + paymentIntent.amount_received;
await db.wallets.update({ where: { userId }, data: { balanceCents: updatedBalance } });`,
      mechanismExplanation:
        'Computing `wallet.balanceCents + paymentIntent.amount_received` in application memory rather than using an atomic database `increment` operation exposes the ledger to concurrent write overwrites.',
      invariantViolated: 'Linearizable Account Balance Increment Invariant',
    },
  ],
  recommendations: [
    {
      id: 'REC-01',
      title: 'Enforce Interactive Database Transaction with Unique Idempotency Insert & Atomic Increment',
      strategyType: 'Immediate Hotfix',
      description:
        'Wrap the idempotency claim and wallet balance update inside a single `db.$transaction`. Claim the `eventId` first using `createMany({ skipDuplicates: true })` so concurrent deliveries immediately abort if `count === 0`, and use `{ increment }` for the ledger credit.',
      originalCode: `export async function handlePaymentIntentSucceeded(event: StripeEvent, db: Database) {
  const { id: eventId, data } = event;
  const paymentIntent = data.object;

  // Check if webhook was already processed
  const existing = await db.webhookEvents.findUnique({ where: { eventId } });
  if (existing && existing.status === 'COMPLETED') {
    return { skipped: true };
  }

  // Credit user wallet balance
  const wallet = await db.wallets.findUnique({ where: { userId: paymentIntent.metadata.userId } });
  const updatedBalance = wallet.balanceCents + paymentIntent.amount_received;

  await db.wallets.update({
    where: { userId: paymentIntent.metadata.userId },
    data: { balanceCents: updatedBalance }
  });

  // Record webhook completion
  await db.webhookEvents.upsert({
    where: { eventId },
    create: { eventId, status: 'COMPLETED', processedAt: new Date() },
    update: { status: 'COMPLETED', processedAt: new Date() }
  });

  return { skipped: false, balanceCents: updatedBalance };
}`,
      patchedCode: `export async function handlePaymentIntentSucceeded(event: StripeEvent, db: Database) {
  const { id: eventId, data } = event;
  const paymentIntent = data.object;

  return await db.$transaction(async (tx) => {
    // 1. Atomically claim idempotency lock via unique constraint on eventId
    const claim = await tx.webhookEvents.createMany({
      data: [{ eventId, status: 'COMPLETED', processedAt: new Date() }],
      skipDuplicates: true,
    });

    if (claim.count === 0) {
      return { skipped: true };
    }

    // 2. Atomically increment wallet balance in SQL without in-memory read race
    const updatedWallet = await tx.wallets.update({
      where: { userId: paymentIntent.metadata.userId },
      data: {
        balanceCents: { increment: paymentIntent.amount_received },
      },
    });

    return { skipped: false, balanceCents: updatedWallet.balanceCents };
  });
}`,
      unifiedDiff: `--- a/src/services/billing/webhookProcessor.ts
+++ b/src/services/billing/webhookProcessor.ts
@@ -4,23 +4,21 @@ export async function handlePaymentIntentSucceeded(event: StripeEvent, db: Datab
-  // Check if webhook was already processed
-  const existing = await db.webhookEvents.findUnique({ where: { eventId } });
-  if (existing && existing.status === 'COMPLETED') {
-    return { skipped: true };
-  }
-
-  // Credit user wallet balance
-  const wallet = await db.wallets.findUnique({ where: { userId: paymentIntent.metadata.userId } });
-  const updatedBalance = wallet.balanceCents + paymentIntent.amount_received;
-
-  await db.wallets.update({
-    where: { userId: paymentIntent.metadata.userId },
-    data: { balanceCents: updatedBalance }
-  });
-
-  // Record webhook completion
-  await db.webhookEvents.upsert({
-    where: { eventId },
-    create: { eventId, status: 'COMPLETED', processedAt: new Date() },
-    update: { status: 'COMPLETED', processedAt: new Date() }
-  });
-
-  return { skipped: false, balanceCents: updatedBalance };
+  return await db.$transaction(async (tx) => {
+    const claim = await tx.webhookEvents.createMany({
+      data: [{ eventId, status: 'COMPLETED', processedAt: new Date() }],
+      skipDuplicates: true,
+    });
+
+    if (claim.count === 0) {
+      return { skipped: true };
+    }
+
+    const updatedWallet = await tx.wallets.update({
+      where: { userId: paymentIntent.metadata.userId },
+      data: { balanceCents: { increment: paymentIntent.amount_received } },
+    });
+
+    return { skipped: false, balanceCents: updatedWallet.balanceCents };
+  });`,
      verificationTestCode: `import { describe, it, expect } from 'vitest';
import { handlePaymentIntentSucceeded } from './webhookProcessor';

describe('handlePaymentIntentSucceeded Concurrency & Idempotency', () => {
  it('credits wallet exactly once when 5 identical webhook deliveries arrive in parallel', async () => {
    const event = {
      id: 'evt_concurrent_991',
      data: { object: { amount_received: 5000, metadata: { userId: 'usr_101' } } },
    };

    const deliveries = await Promise.all(
      Array.from({ length: 5 }, () => handlePaymentIntentSucceeded(event, db))
    );

    const processedCount = deliveries.filter((res) => !res.skipped).length;
    const skippedCount = deliveries.filter((res) => res.skipped).length;

    expect(processedCount).toBe(1);
    expect(skippedCount).toBe(4);
  });
});`,
      estimatedComplexity: 'Low',
    },
  ],
  structuredReport: {
    reportId: 'REP-4812',
    title: 'TOCTOU Race Condition in `handlePaymentIntentSucceeded` Causes Duplicate Customer Wallet Credits',
    executiveSummary:
      'Parallel delivery of identical Stripe `payment_intent.succeeded` webhooks bypasses the unguarded `findUnique` check in `src/services/billing/webhookProcessor.ts`, resulting in duplicate wallet balance increments. Semantically matches existing open issues BUG-1042 (94.2%) and BUG-1024 (78.4%).',
    severity: 'Critical',
    priority: 'P0',
    category: 'Concurrency / Time-of-Check to Time-of-Use (TOCTOU)',
    cweId: 'CWE-367',
    affectedComponent: 'Billing & Ledger',
    environment: 'Node.js 22.4 · PostgreSQL 16 (Read Committed) · Prisma 5.19',
    stepsToReproduce: [
      'Dispatch two concurrent POST requests to `/api/webhooks/stripe` carrying the same `event.id` (`evt_49102b`) within a 50ms window.',
      'Observe both requests pass `db.webhookEvents.findUnique` before either commits the `COMPLETED` state.',
      'Query `wallets` table for `userId` and observe `balanceCents` incremented twice.',
    ],
    expectedBehavior:
      'Exactly one webhook delivery should increment `balanceCents`; all concurrent or subsequent retries carrying the same `eventId` must be idempotently skipped.',
    actualBehavior:
      'Both concurrent webhook handlers execute the wallet balance update, crediting the customer twice for a single payment.',
    rootCauseSummary:
      'Non-transactional check-then-act pattern on `webhookEvents` paired with an in-memory read-modify-write calculation on `wallet.balanceCents`.',
    recommendedFixSummary:
      'Execute `tx.webhookEvents.createMany({ skipDuplicates: true })` and `tx.wallets.update({ data: { balanceCents: { increment } } })` inside a single atomic database transaction.',
    regressionTestPlan: [
      'Run parallel `Promise.all` webhook stress test with 10 simultaneous identical events.',
      'Verify unique index constraint on `webhook_events(event_id)` in PostgreSQL schema.',
      'Confirm ledger reconciliation audit job reports zero duplicate credits.',
    ],
  },
  modelTraces: [
    {
      stageName: 'Semantic Vector & AST Token Similarity',
      modelId: 'BAAI/bge-large-en-v1.5 + gemini-embedding-2-preview',
      provider: 'Hugging Face',
      taskType: 'Dense Embedding & Duplicate Issue Detection',
      latencyMs: 64,
      confidenceScore: 0.97,
      outputSummary: 'Scanned 7 tracked issues; top match BUG-1042 (94.2%) & BUG-1024 (78.4%)',
    },
    {
      stageName: 'Zero-Shot Defect & CWE Classification',
      modelId: 'microsoft/codebert-base + facebook/bart-large-mnli',
      provider: 'Hugging Face',
      taskType: 'Defect Taxonomy & Severity Classification',
      latencyMs: 118,
      confidenceScore: 0.95,
      outputSummary: 'Critical (P0) · Concurrency / Time-of-Check to Time-of-Use (TOCTOU) · CWE-367',
    },
    {
      stageName: 'Root Cause AST Reasoning & Patch Synthesis',
      modelId: 'Qwen/Qwen2.5-Coder-32B-Instruct + gemini-3.8-flash',
      provider: 'Advanced LLM',
      taskType: 'Fault Localization, Unified Diff & Structured Bug Report',
      latencyMs: 482,
      confidenceScore: 0.96,
      outputSummary: 'Identified 2 root causes and synthesized transactional patch with Vitest regression suite',
    },
  ],
};

export default function App() {
  const [activeNav, setActiveNav] = useState<
    'analyze' | 'tracker' | 'duplicates' | 'python' | 'models'
  >('analyze');
  const [bugs, setBugs] = useState<TrackedBug[]>([]);
  const [selectedBugId, setSelectedBugId] = useState<string | null>('BUG-1042');
  const [currentAnalysis, setCurrentAnalysis] = useState<BugAnalysisResult | null>(
    INITIAL_DEMO_ANALYSIS
  );

  // Fetch initial tracked bugs from backend
  useEffect(() => {
    fetch('/api/bugs')
      .then((res) => res.json())
      .then((data) => {
        if (data.bugs) {
          setBugs(data.bugs);
        }
      })
      .catch((err) => console.error('Failed to load bugs:', err));
  }, []);

  // Metrics calculated from live repository state
  const repoStats = useMemo(() => {
    const total = bugs.length;
    const criticalCount = bugs.filter((b) => b.severity === 'Critical').length;
    const openCount = bugs.filter((b) => b.status === 'Open' || b.status === 'In Progress').length;
    const resolvedOrDupCount = bugs.filter(
      (b) => b.status === 'Resolved' || b.status === 'Duplicate'
    ).length;
    return { total, criticalCount, openCount, resolvedOrDupCount };
  }, [bugs]);

  const handleSaveBugToTracker = async (
    newBug: Partial<TrackedBug>
  ): Promise<TrackedBug | null> => {
    try {
      const res = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBug),
      });
      if (!res.ok) return null;
      const data = await res.json();
      setBugs((prev) => [data.bug, ...prev]);
      return data.bug;
    } catch {
      return null;
    }
  };

  const handleUpdateBugStatus = async (id: string, status: BugStatus) => {
    try {
      const res = await fetch(`/api/bugs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setBugs((prev) => prev.map((b) => (b.id === id ? data.bug : b)));
      }
    } catch (err) {
      console.error('Failed to update bug status:', err);
    }
  };

  const handleMarkExistingResolved = async (bugId: string, patchCode: string) => {
    try {
      const res = await fetch(`/api/bugs/${bugId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Resolved',
          resolutionPatch: patchCode,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBugs((prev) => prev.map((b) => (b.id === bugId ? data.bug : b)));
      }
    } catch (err) {
      console.error('Failed to apply patch:', err);
    }
  };

  const handleResolveAllOpenBugs = async () => {
    try {
      const res = await fetch('/api/bugs/resolve-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.bugs) {
          setBugs(data.bugs);
        }
      }
    } catch (err) {
      console.error('Failed to resolve all open bugs:', err);
    }
  };

  const handleLinkDuplicatePair = async (
    duplicateBugId: string,
    canonicalBugId: string
  ) => {
    try {
      const res = await fetch(`/api/bugs/${duplicateBugId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Duplicate',
          duplicateOf: canonicalBugId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBugs((prev) => prev.map((b) => (b.id === duplicateBugId ? data.bug : b)));
      }
    } catch (err) {
      console.error('Failed to link duplicate pair:', err);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'ID',
      'Title',
      'Severity',
      'Priority',
      'Category',
      'CWE',
      'Component',
      'FilePath',
      'Status',
      'DuplicateOf',
    ];
    const rows = bugs.map((b) => [
      b.id,
      `"${b.title.replace(/"/g, '""')}"`,
      b.severity,
      b.priority,
      `"${b.category}"`,
      b.cweId,
      `"${b.component}"`,
      b.filePath,
      b.status,
      b.duplicateOf || '',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'faultline_issue_ledger.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F19] text-[#F8FAFC]">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0B0F19]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#analyze"
          onClick={(e) => {
            e.preventDefault();
            setActiveNav('analyze');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap"
        >
          FaultLine
        </a>

        {/* Zone 2: 4 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <a
            href="#analyze"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('analyze');
            }}
            className={`transition-colors whitespace-nowrap hover:underline underline-offset-8 ${
              activeNav === 'analyze' ? 'text-white underline' : 'hover:text-slate-200'
            }`}
          >
            Analyze & Resolve
          </a>
          <a
            href="#tracker"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('tracker');
            }}
            className={`transition-colors whitespace-nowrap hover:underline underline-offset-8 ${
              activeNav === 'tracker' ? 'text-white underline' : 'hover:text-slate-200'
            }`}
          >
            Issue Tracker
          </a>
          <a
            href="#duplicates"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('duplicates');
            }}
            className={`transition-colors whitespace-nowrap hover:underline underline-offset-8 ${
              activeNav === 'duplicates' ? 'text-white underline' : 'hover:text-slate-200'
            }`}
          >
            Duplicate Matrix
          </a>
          <a
            href="#python"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('python');
            }}
            className={`transition-colors whitespace-nowrap hover:underline underline-offset-8 ${
              activeNav === 'python' ? 'text-white underline' : 'hover:text-slate-200'
            }`}
          >
            Python Backend
          </a>
          <a
            href="#models"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('models');
            }}
            className={`transition-colors whitespace-nowrap hover:underline underline-offset-8 ${
              activeNav === 'models' ? 'text-white underline' : 'hover:text-slate-200'
            }`}
          >
            Model Pipeline
          </a>
        </nav>

        {/* Zone 3: 2 Primary Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-[#111827] border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveNav('analyze');
              setCurrentAnalysis(null);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Bug Triage</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar (visible only below md) */}
      <div className="flex md:hidden items-center gap-2 px-4 py-2 border-b border-slate-800 bg-[#111827] overflow-x-auto">
        {(
          [
            { id: 'analyze', label: 'Analyze & Resolve' },
            { id: 'tracker', label: 'Issue Tracker' },
            { id: 'duplicates', label: 'Duplicate Matrix' },
            { id: 'python', label: 'Python Backend' },
            { id: 'models', label: 'Model Pipeline' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveNav(tab.id)}
            className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeNav === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Container (1440px Desktop Presence) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 space-y-6">
        {/* Contextual Workspace Header & Live Repository Metrics Strip */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="text-xs font-mono text-slate-400">
              AI-Powered Bug Detection & Resolution Assistant · Hugging Face + Gemini 3.8 Ensemble
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1">
              {activeNav === 'analyze' && 'Defect Root Cause, Duplicate & Patch Studio'}
              {activeNav === 'tracker' && 'Engineering Issue Repository & Triage Ledger'}
              {activeNav === 'duplicates' && 'Semantic Vector & AST Duplicate Cluster Matrix'}
              {activeNav === 'python' && 'Python 3 FastAPI, Native AST & Difflib Backend Service'}
              {activeNav === 'models' && 'Multi-Model Architecture & Live Embedding Sandbox'}
            </h1>
          </div>

          {/* Unboxed Tabular Summary Metrics */}
          <div className="flex flex-wrap items-center gap-6 text-xs font-mono tabular-nums">
            <div>
              <span className="text-slate-400 block">Tracked Issues</span>
              <span className="text-base font-semibold text-slate-100">{repoStats.total}</span>
            </div>
            <div className="h-7 w-px bg-slate-800" aria-hidden="true" />
            <div>
              <span className="text-slate-400 block">Critical (P0)</span>
              <span className="text-base font-semibold text-red-400">
                {repoStats.criticalCount}
              </span>
            </div>
            <div className="h-7 w-px bg-slate-800" aria-hidden="true" />
            <div>
              <span className="text-slate-400 block">Open / Active</span>
              <span className="text-base font-semibold text-amber-400">
                {repoStats.openCount}
              </span>
            </div>
            <div className="h-7 w-px bg-slate-800" aria-hidden="true" />
            <div>
              <span className="text-slate-400 block">Resolved & Deduplicated</span>
              <span className="text-base font-semibold text-emerald-400">
                {repoStats.resolvedOrDupCount}
              </span>
            </div>
          </div>
        </div>

        {/* Active View Content */}
        {activeNav === 'analyze' && (
          <AnalyzerStudio
            currentResult={currentAnalysis}
            onAnalysisComplete={(res) => setCurrentAnalysis(res)}
            onSaveBugToTracker={handleSaveBugToTracker}
            onMarkExistingResolved={handleMarkExistingResolved}
            onSelectTrackedBug={(bugId) => {
              setSelectedBugId(bugId);
              setActiveNav('tracker');
            }}
          />
        )}

        {activeNav === 'tracker' && (
          <IssueTrackerView
            bugs={bugs}
            selectedBugId={selectedBugId}
            onSelectBug={(id) => setSelectedBugId(id)}
            onUpdateBugStatus={handleUpdateBugStatus}
            onResolveAllOpenBugs={handleResolveAllOpenBugs}
          />
        )}

        {activeNav === 'duplicates' && (
          <DuplicateMatrixView
            bugs={bugs}
            onLinkDuplicatePair={handleLinkDuplicatePair}
            onSelectTrackedBug={(bugId) => {
              setSelectedBugId(bugId);
              setActiveNav('tracker');
            }}
          />
        )}

        {activeNav === 'python' && <PythonBackendView />}

        {activeNav === 'models' && <ModelsPipelineView />}
      </main>

      {/* Clean Minimal Footer (No Fake Telemetry Tickers) */}
      <footer className="border-t border-slate-800/80 py-4 px-6 mt-12">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            FaultLine · AI-Powered Bug Detection, Duplicate Deduplication & Automated Patch Resolution
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveNav('analyze')}
              className="hover:text-slate-300 transition-colors"
            >
              Analyzer Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('tracker')}
              className="hover:text-slate-300 transition-colors"
            >
              Issue Ledger
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('models')}
              className="hover:text-slate-300 transition-colors"
            >
              Model Sandbox
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
