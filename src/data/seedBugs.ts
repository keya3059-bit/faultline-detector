import { PresetScenario, TrackedBug } from '../types/bug';

export const INITIAL_TRACKED_BUGS: TrackedBug[] = [
  {
    id: 'BUG-1042',
    title: 'Concurrent Stripe webhook retries trigger duplicate ledger credit entries',
    description:
      'When Stripe dispatches parallel payment_intent.succeeded webhooks within a 150ms window due to network timeout retries, the billing service credits the customer account balance twice before the idempotency key is committed to PostgreSQL.',
    stackTrace: `Error: DuplicateLedgerEntryWarning: Transaction tx_99481a committed twice within 42ms
    at WebhookProcessor.handlePaymentIntentSucceeded (src/services/billing/webhookProcessor.ts:44:15)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async BillingController.receiveWebhook (src/controllers/billingController.ts:89:7)`,
    sourceCode: `export async function handlePaymentIntentSucceeded(event: StripeEvent, db: Database) {
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
    filePath: 'src/services/billing/webhookProcessor.ts',
    language: 'TypeScript',
    component: 'Billing & Ledger',
    severity: 'Critical',
    priority: 'P0',
    category: 'Concurrency / Time-of-Check to Time-of-Use (TOCTOU)',
    cweId: 'CWE-367',
    status: 'Open',
    reporter: 'Elena Rostova',
    createdAt: '2026-10-02T14:22:00Z',
    updatedAt: '2026-10-05T09:15:00Z',
    rootCauseSummary:
      'Non-atomic read-modify-write sequence on wallet balance combined with check-then-act on webhookEvents without a serializable transaction or row-level advisory lock.',
    resolutionPatch: `export async function handlePaymentIntentSucceeded(event: StripeEvent, db: Database) {
  const { id: eventId, data } = event;
  const paymentIntent = data.object;

  return await db.$transaction(async (tx) => {
    const inserted = await tx.webhookEvents.createMany({
      data: [{ eventId, status: 'COMPLETED', processedAt: new Date() }],
      skipDuplicates: true,
    });

    if (inserted.count === 0) {
      return { skipped: true };
    }

    const updatedWallet = await tx.wallets.update({
      where: { userId: paymentIntent.metadata.userId },
      data: { balanceCents: { increment: paymentIntent.amount_received } },
    });

    return { skipped: false, balanceCents: updatedWallet.balanceCents };
  });
}`
  },
  {
    id: 'BUG-1039',
    title: 'WebSocket telemetry hook leaks event listeners and freezes UI on reconnect',
    description:
      'In the real-time cluster metrics view, every automatic WebSocket reconnection registers a new message listener using a stale closure over the metrics array. After 4-5 network drops, memory spikes and the browser tab becomes unresponsive.',
    stackTrace: `RangeError: Maximum call stack size exceeded / Main thread blocked for 3400ms
    at SocketStream.handleIncomingFrame (src/hooks/useClusterSocket.ts:38:21)
    at WebSocket.onMessage (src/hooks/useClusterSocket.ts:29:9)`,
    sourceCode: `export function useClusterSocket(endpoint: string) {
  const [frames, setFrames] = useState<MetricFrame[]>([]);
  const [reconnectCount, setReconnectCount] = useState(0);

  useEffect(() => {
    const ws = new WebSocket(endpoint);

    ws.addEventListener('message', (event) => {
      const parsed = JSON.parse(event.data);
      // Stale closure over frames & unbounded array growth
      setFrames([...frames, parsed]);
    });

    ws.addEventListener('close', () => {
      setTimeout(() => setReconnectCount(reconnectCount + 1), 1000);
    });
    // Missing cleanup return function to close ws & remove listeners!
  }, [endpoint, reconnectCount, frames]);

  return { frames, reconnectCount };
}`,
    filePath: 'src/hooks/useClusterSocket.ts',
    language: 'TypeScript',
    component: 'Realtime Telemetry UI',
    severity: 'High',
    priority: 'P1',
    category: 'Memory Leak / React Effect Lifecycle',
    cweId: 'CWE-401',
    status: 'In Progress',
    reporter: 'Marcus Vance',
    createdAt: '2026-10-01T18:05:00Z',
    updatedAt: '2026-10-04T11:40:00Z',
    rootCauseSummary:
      'Including `frames` in the useEffect dependency array causes a brand new WebSocket connection to open on every single incoming frame, while omitting the cleanup function leaves all prior sockets open.',
    resolutionPatch: `export function useClusterSocket(endpoint: string) {
  const [frames, setFrames] = useState<MetricFrame[]>([]);
  const [reconnectCount, setReconnectCount] = useState(0);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const ws = new WebSocket(endpoint);

    const onMessage = (event: MessageEvent) => {
      const parsed = JSON.parse(event.data);
      setFrames((prev) => [...prev.slice(-499), parsed]);
    };

    const onClose = () => {
      reconnectTimer = setTimeout(() => {
        setReconnectCount((c) => c + 1);
      }, 1000);
    };

    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
      ws.close();
    };
  }, [endpoint, reconnectCount]);

  return { frames, reconnectCount };
}`
  },
  {
    id: 'BUG-1035',
    title: 'Unparameterized sort column in audit log export allows SQL injection and OOM crash',
    description:
      'The compliance audit log export endpoint interpolates the `sort_by` query parameter directly into the raw SQL query and loads the entire result set into memory before streaming CSV rows.',
    stackTrace: `sqlalchemy.exc.ProgrammingError: (psycopg2.errors.SyntaxError) syntax error at or near ";"
[SQL: SELECT id, actor_id, action, created_at FROM audit_logs WHERE org_id = 'org_88' ORDER BY created_at; DROP TABLE temp_exports;-- DESC]
    File "app/api/routes/audit_export.py", line 27, in export_organization_logs`,
    sourceCode: `async def export_organization_logs(db: AsyncSession, org_id: str, sort_by: str = "created_at", direction: str = "DESC"):
    # Vulnerable raw string interpolation in ORDER BY clause
    raw_query = f"""
        SELECT id, actor_id, action, payload, created_at
        FROM audit_logs
        WHERE org_id = '{org_id}'
        ORDER BY {sort_by} {direction}
    """
    result = await db.execute(text(raw_query))
    all_rows = result.fetchall()  # Loads millions of rows into worker RAM
    return [dict(row._mapping) for row in all_rows]`,
    filePath: 'app/api/routes/audit_export.py',
    language: 'Python',
    component: 'Audit & Compliance API',
    severity: 'Critical',
    priority: 'P0',
    category: 'SQL Injection & Unbounded Memory Allocation',
    cweId: 'CWE-89',
    status: 'Resolved',
    reporter: 'Priya Nair',
    createdAt: '2026-09-28T10:12:00Z',
    updatedAt: '2026-09-30T16:50:00Z',
    rootCauseSummary:
      'Direct f-string formatting of `org_id`, `sort_by`, and `direction` into SQL text bypasses bind parameterization, and `fetchall()` materializes unbounded rows in memory.',
    resolutionPatch: `ALLOWED_SORT_COLUMNS = {"created_at", "actor_id", "action", "id"}

async def export_organization_logs(
    db: AsyncSession,
    org_id: str,
    sort_by: str = "created_at",
    direction: str = "DESC",
    limit: int = 5000,
):
    safe_col = sort_by if sort_by in ALLOWED_SORT_COLUMNS else "created_at"
    safe_dir = "ASC" if direction.upper() == "ASC" else "DESC"

    stmt = text(f"""
        SELECT id, actor_id, action, payload, created_at
        FROM audit_logs
        WHERE org_id = :org_id
        ORDER BY {safe_col} {safe_dir}
        LIMIT :limit
    """)
    result = await db.stream(stmt, {"org_id": org_id, "limit": min(limit, 10000)})
    rows = []
    async for row in result.mappings():
        rows.append(dict(row))
    return rows`
  },
  {
    id: 'BUG-1031',
    title: 'JWT refresh rotation race condition invalidates active multi-tab sessions',
    description:
      'When a user has multiple browser tabs open and the access token expires, both tabs simultaneously send the same refresh token to `/api/auth/refresh`. The second request triggers reuse detection and revokes the entire session family.',
    stackTrace: `AuthTokenReuseError: Refresh token rt_019283a has already been rotated. Revoking token family fam_7721.
    at TokenRotationService.rotateRefreshToken (src/auth/tokenRotation.ts:62:11)
    at AuthController.refresh (src/auth/authController.ts:34:18)`,
    sourceCode: `export async function rotateRefreshToken(tokenHash: string, redis: RedisClient) {
  const tokenRecord = await redis.hgetall(\`rt:\${tokenHash}\`);
  if (!tokenRecord || !tokenRecord.familyId) {
    throw new Error('Invalid refresh token');
  }

  if (tokenRecord.consumed === 'true') {
    // Immediate revocation without grace window for concurrent tab requests
    await redis.del(\`family:\${tokenRecord.familyId}\`);
    throw new Error('Refresh token reuse detected. Session family revoked.');
  }

  await redis.hset(\`rt:\${tokenHash}\`, 'consumed', 'true');
  const nextToken = generateSecureToken();
  await redis.hset(\`rt:\${nextToken.hash}\`, {
    familyId: tokenRecord.familyId,
    userId: tokenRecord.userId,
    consumed: 'false'
  });

  return nextToken;
}`,
    filePath: 'src/auth/tokenRotation.ts',
    language: 'TypeScript',
    component: 'Identity & Auth Service',
    severity: 'High',
    priority: 'P1',
    category: 'Distributed State / Session Race Condition',
    cweId: 'CWE-362',
    status: 'Open',
    reporter: 'Devon Brooks',
    createdAt: '2026-09-25T08:45:00Z',
    updatedAt: '2026-10-03T12:10:00Z',
    rootCauseSummary:
      'Strict single-use refresh token rotation lacks a short idempotency grace window (e.g., 10 seconds) or cached successor token for concurrent tab requests.',
    resolutionPatch: `export async function rotateRefreshToken(tokenHash: string, redis: RedisClient) {
  const tokenRecord = await redis.hgetall(\`rt:\${tokenHash}\`);
  if (!tokenRecord || !tokenRecord.familyId) {
    throw new Error('Invalid refresh token');
  }

  if (tokenRecord.consumed === 'true') {
    const elapsedMs = Date.now() - Number(tokenRecord.consumedAt || 0);
    if (elapsedMs <= 10000 && tokenRecord.successorToken) {
      return JSON.parse(tokenRecord.successorToken);
    }
    await redis.del(\`family:\${tokenRecord.familyId}\`);
    throw new Error('Refresh token reuse outside grace window. Session family revoked.');
  }

  const nextToken = generateSecureToken();
  await redis.hset(\`rt:\${tokenHash}\`, {
    consumed: 'true',
    consumedAt: String(Date.now()),
    successorToken: JSON.stringify(nextToken),
  });
  await redis.hset(\`rt:\${nextToken.hash}\`, {
    familyId: tokenRecord.familyId,
    userId: tokenRecord.userId,
    consumed: 'false',
  });

  return nextToken;
}`
  },
  {
    id: 'BUG-1028',
    title: 'Worker pool slice boundary panic when batch size evenly divides payload length',
    description:
      'In the Go telemetry ingestion worker, when a batch contains an exact multiple of the chunk size plus trailing empty metadata, an off-by-one index calculation causes an out-of-bounds slice panic.',
    stackTrace: `panic: runtime error: slice bounds out of range [128:120]
goroutine 42 [running]:
github.com/faultline/ingest/pkg/batcher.SplitPayloads(0xc000218000, 0x78, 0x80, 0x20)
    /workspace/pkg/batcher/splitter.go:24 +0x14b`,
    sourceCode: `func SplitPayloads(items []Record, chunkSize int) [][]Record {
    if chunkSize <= 0 {
        return nil
    }
    var batches [][]Record
    total := len(items)
    for i := 0; i <= total; i += chunkSize {
        end := i + chunkSize
        if end > total {
            end = total - 1 // Off-by-one truncation and panic when i == total
        }
        batches = append(batches, items[i:end])
    }
    return batches
}`,
    filePath: 'pkg/batcher/splitter.go',
    language: 'Go',
    component: 'Ingestion Pipeline',
    severity: 'High',
    priority: 'P1',
    category: 'Off-by-One / Slice Bounds Violation',
    cweId: 'CWE-193',
    status: 'Open',
    reporter: 'Kenji Takahashi',
    createdAt: '2026-09-22T19:30:00Z',
    updatedAt: '2026-09-29T15:00:00Z',
    rootCauseSummary:
      'Loop condition `i <= total` allows `i` to reach `total`, and clamping `end = total - 1` makes `end < i`, triggering a runtime slice bounds panic `items[total : total-1]`.',
    resolutionPatch: `func SplitPayloads(items []Record, chunkSize int) [][]Record {
    if chunkSize <= 0 || len(items) == 0 {
        return nil
    }
    total := len(items)
    batches := make([][]Record, 0, (total+chunkSize-1)/chunkSize)
    for i := 0; i < total; i += chunkSize {
        end := i + chunkSize
        if end > total {
            end = total
        }
        batches = append(batches, items[i:end])
    }
    return batches
}`
  },
  {
    id: 'BUG-1024',
    title: 'Double invoice charge when checkout confirmation webhook arrives twice concurrently',
    description:
      'Customers report seeing two identical charges on their account ledger when payment gateway webhooks are delivered simultaneously during peak traffic. The handler checks webhook status before updating wallet balance without a database lock.',
    stackTrace: `Error: LedgerIntegrityException: Duplicate credit posted for event evt_3Q91k2L
    at processGatewayCallback (src/services/billing/webhookProcessor.ts:39:11)
    at async Router.post (/src/routes/webhooks.ts:22:5)`,
    sourceCode: `export async function processGatewayCallback(payload: WebhookPayload, db: Database) {
  const record = await db.webhookEvents.findUnique({ where: { eventId: payload.id } });
  if (record?.status === 'COMPLETED') return;

  const account = await db.wallets.findUnique({ where: { userId: payload.userId } });
  await db.wallets.update({
    where: { userId: payload.userId },
    data: { balanceCents: account.balanceCents + payload.amountCents }
  });

  await db.webhookEvents.create({
    data: { eventId: payload.id, status: 'COMPLETED', processedAt: new Date() }
  });
}`,
    filePath: 'src/services/billing/webhookProcessor.ts',
    language: 'TypeScript',
    component: 'Billing & Ledger',
    severity: 'Critical',
    priority: 'P0',
    category: 'Concurrency / Time-of-Check to Time-of-Use (TOCTOU)',
    cweId: 'CWE-367',
    status: 'Open',
    reporter: 'Liam O’Connor',
    createdAt: '2026-09-19T11:20:00Z',
    updatedAt: '2026-09-24T17:05:00Z',
    rootCauseSummary:
      'Duplicate of BUG-1042: Missing transactional isolation and atomic increment during concurrent webhook execution.',
    resolutionPatch: `export async function processGatewayCallback(payload: WebhookPayload, db: Database) {
  return await db.$transaction(async (tx) => {
    const claim = await tx.webhookEvents.createMany({
      data: [{ eventId: payload.id, status: 'COMPLETED', processedAt: new Date() }],
      skipDuplicates: true,
    });
    if (claim.count === 0) return;

    await tx.wallets.update({
      where: { userId: payload.userId },
      data: { balanceCents: { increment: payload.amountCents } },
    });
  });
}`
  },
  {
    id: 'BUG-1019',
    title: 'Floating-point precision drift in multi-currency tax proration calculator',
    description:
      'When prorating annual enterprise subscriptions across 12 monthly billing periods with VAT applied, IEEE-754 floating point arithmetic accumulates a $0.01 to $0.04 discrepancy compared to invoice totals.',
    stackTrace: `AssertionError: Invoice line sum (1199.9900000000002) does not match total (1200.00)
    at InvoiceValidator.verifyLineItems (src/billing/proration.ts:51:13)`,
    sourceCode: `export function calculateProratedInstallments(totalAmount: number, months: number, taxRate: number): number[] {
  const monthlyBase = totalAmount / months;
  const installments: number[] = [];
  for (let i = 0; i < months; i++) {
    const withTax = monthlyBase * (1 + taxRate);
    installments.push( Number(withTax.toFixed(2)) );
  }
  return installments;
}`,
    filePath: 'src/billing/proration.ts',
    language: 'TypeScript',
    component: 'Billing & Ledger',
    severity: 'Medium',
    priority: 'P2',
    category: 'Numeric Precision / IEEE-754 Rounding Drift',
    cweId: 'CWE-682',
    status: 'Resolved',
    reporter: 'Elena Rostova',
    createdAt: '2026-09-14T15:00:00Z',
    updatedAt: '2026-09-16T10:30:00Z',
    rootCauseSummary:
      'Dividing currency floats before rounding each installment loses remainder cents; currency math must operate in integer minor units (cents) with deterministic remainder allocation.',
    resolutionPatch: `export function calculateProratedInstallments(totalAmount: number, months: number, taxRate: number): number[] {
  const totalWithTaxCents = Math.round(totalAmount * (1 + taxRate) * 100);
  const baseInstallmentCents = Math.floor(totalWithTaxCents / months);
  const remainderCents = totalWithTaxCents % months;

  return Array.from({ length: months }, (_, i) => {
    const cents = baseInstallmentCents + (i < remainderCents ? 1 : 0);
    return cents / 100;
  });
}`
  }
];

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'scenario-webhook-race',
    label: 'Scenario 01 · Payment Webhook TOCTOU Race',
    subtitle: 'TypeScript · High similarity to BUG-1042 & BUG-1024',
    title: 'Parallel Stripe payment_intent webhook deliveries credit customer wallet balance twice',
    description:
      'During high-latency gateway retries, two identical `payment_intent.succeeded` webhook requests arrive within 50ms. Both requests pass the initial `findUnique` check before either writes `COMPLETED` to `webhookEvents`, resulting in the user wallet balance being incremented twice and losing ledger consistency.',
    stackTrace: `Error: DuplicateLedgerEntryWarning: Wallet balance updated twice for event evt_49102b
    at WebhookProcessor.handlePaymentIntentSucceeded (src/services/billing/webhookProcessor.ts:44:15)
    at async BillingController.receiveWebhook (src/controllers/billingController.ts:89:7)`,
    filePath: 'src/services/billing/webhookProcessor.ts',
    language: 'TypeScript',
    component: 'Billing & Ledger',
    environment: 'Node.js 22.4 · PostgreSQL 16 (Read Committed) · Prisma 5.19',
    sourceCode: `export async function handlePaymentIntentSucceeded(event: StripeEvent, db: Database) {
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
    fixedSourceCode: `export async function handlePaymentIntentSucceeded(event: StripeEvent, db: Database) {
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
      data: { balanceCents: { increment: paymentIntent.amount_received } },
    });

    return { skipped: false, balanceCents: updatedWallet.balanceCents };
  });
}`,
    detectedErrors: [
      {
        id: 'ERR-101',
        lineNumber: 6,
        endLineNumber: 9,
        errorType: 'TOCTOU Race Condition',
        cweId: 'CWE-367',
        severity: 'Critical',
        faultyLineContent: `const existing = await db.webhookEvents.findUnique({ where: { eventId } });`,
        errorMessage:
          'Non-atomic check-then-act: concurrent webhook retries both pass `findUnique` before `upsert` executes.',
        fixedLineContent: `const claim = await tx.webhookEvents.createMany({ data: [{ eventId, status: 'COMPLETED' }], skipDuplicates: true });`,
      },
      {
        id: 'ERR-102',
        lineNumber: 12,
        endLineNumber: 17,
        errorType: 'Lost Update / Non-Atomic Read-Modify-Write',
        cweId: 'CWE-362',
        severity: 'Critical',
        faultyLineContent: `const updatedBalance = wallet.balanceCents + paymentIntent.amount_received;`,
        errorMessage:
          'In-memory balance addition overwrites concurrent credits. Use SQL atomic `{ increment }` inside `db.$transaction`.',
        fixedLineContent: `data: { balanceCents: { increment: paymentIntent.amount_received } }`,
      },
    ],
  },
  {
    id: 'scenario-websocket-leak',
    label: 'Scenario 02 · React WebSocket Listener Leak',
    subtitle: 'React / TypeScript · Matches BUG-1039',
    title: 'Live telemetry dashboard tab freezes after WebSocket reconnects and leaks socket listeners',
    description:
      'Every incoming WebSocket metric frame triggers a state update to `frames`, which is listed in the `useEffect` dependency array. This re-runs the effect on every message without closing the previous WebSocket instance, creating hundreds of zombie sockets and exponential message duplication.',
    stackTrace: `RangeError: Maximum call stack size exceeded / Main thread blocked for 3400ms
    at SocketStream.handleIncomingFrame (src/hooks/useClusterSocket.ts:38:21)
    at WebSocket.onMessage (src/hooks/useClusterSocket.ts:29:9)`,
    filePath: 'src/hooks/useClusterSocket.ts',
    language: 'TypeScript',
    component: 'Realtime Telemetry UI',
    environment: 'React 19.0 · Chrome 130 · Vite 8',
    sourceCode: `export function useClusterSocket(endpoint: string) {
  const [frames, setFrames] = useState<MetricFrame[]>([]);
  const [reconnectCount, setReconnectCount] = useState(0);

  useEffect(() => {
    const ws = new WebSocket(endpoint);

    ws.addEventListener('message', (event) => {
      const parsed = JSON.parse(event.data);
      // Stale closure over frames & unbounded array growth
      setFrames([...frames, parsed]);
    });

    ws.addEventListener('close', () => {
      setTimeout(() => setReconnectCount(reconnectCount + 1), 1000);
    });
  }, [endpoint, reconnectCount, frames]);

  return { frames, reconnectCount };
}`,
    fixedSourceCode: `export function useClusterSocket(endpoint: string) {
  const [frames, setFrames] = useState<MetricFrame[]>([]);
  const [reconnectCount, setReconnectCount] = useState(0);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const ws = new WebSocket(endpoint);

    const onMessage = (event: MessageEvent) => {
      const parsed = JSON.parse(event.data);
      setFrames((prev) => [...prev.slice(-499), parsed]);
    };

    const onClose = () => {
      reconnectTimer = setTimeout(() => {
        setReconnectCount((c) => c + 1);
      }, 1000);
    };

    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
      ws.close();
    };
  }, [endpoint, reconnectCount]);

  return { frames, reconnectCount };
}`,
    detectedErrors: [
      {
        id: 'ERR-201',
        lineNumber: 11,
        endLineNumber: 11,
        errorType: 'Stale Closure & Unbounded Buffer Growth',
        cweId: 'CWE-400',
        severity: 'High',
        faultyLineContent: `setFrames([...frames, parsed]);`,
        errorMessage:
          'Direct reference to `frames` inside listener requires `frames` in dependency array and grows memory without bound.',
        fixedLineContent: `setFrames((prev) => [...prev.slice(-499), parsed]);`,
      },
      {
        id: 'ERR-202',
        lineNumber: 17,
        endLineNumber: 17,
        errorType: 'Missing Effect Cleanup & Zombie Socket Leak',
        cweId: 'CWE-401',
        severity: 'High',
        faultyLineContent: `}, [endpoint, reconnectCount, frames]);`,
        errorMessage:
          'Including `frames` re-opens a new WebSocket on every message without calling `ws.close()` in a cleanup return function.',
        fixedLineContent: `return () => { ws.removeEventListener('message', onMessage); ws.close(); }; }, [endpoint, reconnectCount]);`,
      },
    ],
  },
  {
    id: 'scenario-sql-oom',
    label: 'Scenario 03 · SQL Injection & Unbounded Cursor OOM',
    subtitle: 'Python / FastAPI · Critical Security & Resource Exhaustion',
    title: 'Audit log export endpoint crashes worker with OOM and permits SQL injection via sort_by',
    description:
      'When exporting compliance logs for enterprise organizations, passing custom `sort_by` parameters executes unescaped SQL statements. Additionally, calling `fetchall()` on unpaginated audit tables consumes >4GB RAM per worker process.',
    stackTrace: `sqlalchemy.exc.ProgrammingError: (psycopg2.errors.SyntaxError) syntax error at or near ";"
[SQL: SELECT id, actor_id, action, created_at FROM audit_logs WHERE org_id = 'org_88' ORDER BY created_at; -- DESC]
    File "app/api/routes/audit_export.py", line 27, in export_organization_logs`,
    filePath: 'app/api/routes/audit_export.py',
    language: 'Python',
    component: 'Audit & Compliance API',
    environment: 'Python 3.12 · FastAPI 0.115 · SQLAlchemy 2.0 Async · PostgreSQL 16',
    sourceCode: `async def export_organization_logs(db: AsyncSession, org_id: str, sort_by: str = "created_at", direction: str = "DESC"):
    # Vulnerable raw string interpolation in ORDER BY clause
    raw_query = f"""
        SELECT id, actor_id, action, payload, created_at
        FROM audit_logs
        WHERE org_id = '{org_id}'
        ORDER BY {sort_by} {direction}
    """
    result = await db.execute(text(raw_query))
    all_rows = result.fetchall()
    return [dict(row._mapping) for row in all_rows]`,
    fixedSourceCode: `ALLOWED_SORT_COLUMNS = {"created_at", "actor_id", "action", "id"}

async def export_organization_logs(
    db: AsyncSession,
    org_id: str,
    sort_by: str = "created_at",
    direction: str = "DESC",
    limit: int = 5000,
):
    safe_col = sort_by if sort_by in ALLOWED_SORT_COLUMNS else "created_at"
    safe_dir = "ASC" if direction.upper() == "ASC" else "DESC"

    stmt = text(f"""
        SELECT id, actor_id, action, payload, created_at
        FROM audit_logs
        WHERE org_id = :org_id
        ORDER BY {safe_col} {safe_dir}
        LIMIT :limit
    """)
    result = await db.stream(stmt, {"org_id": org_id, "limit": min(limit, 10000)})
    rows = []
    async for row in result.mappings():
        rows.append(dict(row))
    return rows`,
    detectedErrors: [
      {
        id: 'ERR-301',
        lineNumber: 6,
        endLineNumber: 7,
        errorType: 'SQL Injection via f-String Interpolation',
        cweId: 'CWE-89',
        severity: 'Critical',
        faultyLineContent: `WHERE org_id = '{org_id}' ORDER BY {sort_by} {direction}`,
        errorMessage:
          'Direct string interpolation of `org_id` and `sort_by` into raw SQL permits arbitrary query injection.',
        fixedLineContent: `WHERE org_id = :org_id ORDER BY {safe_col} {safe_dir} LIMIT :limit`,
      },
      {
        id: 'ERR-302',
        lineNumber: 10,
        endLineNumber: 10,
        errorType: 'Unbounded Cursor Materialization (OOM)',
        cweId: 'CWE-770',
        severity: 'High',
        faultyLineContent: `all_rows = result.fetchall()`,
        errorMessage:
          'Materializing millions of audit log rows in worker memory causes Out-Of-Memory crashes. Use async streaming (`db.stream`) with a bounded limit.',
        fixedLineContent: `result = await db.stream(stmt, {"org_id": org_id, "limit": min(limit, 10000)})`,
      },
    ],
  },
  {
    id: 'scenario-go-slice-panic',
    label: 'Scenario 04 · Go Worker Off-by-One Slice Panic',
    subtitle: 'Go · Matches BUG-1028 in Ingestion Pipeline',
    title: 'Go ingestion worker crashes with slice bounds out of range when payload length equals batch multiple',
    description:
      'When the ingestion batcher splits a slice of records whose length is an exact multiple of `chunkSize`, the final loop iteration sets `i = total` and clamps `end = total - 1`, causing a fatal runtime panic `slice bounds out of range [128:127]`.',
    stackTrace: `panic: runtime error: slice bounds out of range [128:127]
goroutine 42 [running]:
github.com/faultline/ingest/pkg/batcher.SplitPayloads(0xc000218000, 0x80, 0x80, 0x20)
    /workspace/pkg/batcher/splitter.go:24 +0x14b`,
    filePath: 'pkg/batcher/splitter.go',
    language: 'Go',
    component: 'Ingestion Pipeline',
    environment: 'Go 1.23.2 linux/amd64 · Kubernetes Worker Pool',
    sourceCode: `func SplitPayloads(items []Record, chunkSize int) [][]Record {
    if chunkSize <= 0 {
        return nil
    }
    var batches [][]Record
    total := len(items)
    for i := 0; i <= total; i += chunkSize {
        end := i + chunkSize
        if end > total {
            end = total - 1
        }
        batches = append(batches, items[i:end])
    }
    return batches
}`,
    fixedSourceCode: `func SplitPayloads(items []Record, chunkSize int) [][]Record {
    if chunkSize <= 0 || len(items) == 0 {
        return nil
    }
    total := len(items)
    batches := make([][]Record, 0, (total+chunkSize-1)/chunkSize)
    for i := 0; i < total; i += chunkSize {
        end := i + chunkSize
        if end > total {
            end = total
        }
        batches = append(batches, items[i:end])
    }
    return batches
}`,
    detectedErrors: [
      {
        id: 'ERR-401',
        lineNumber: 7,
        endLineNumber: 10,
        errorType: 'Off-by-One Loop & Slice Upper-Bound Panic',
        cweId: 'CWE-193',
        severity: 'High',
        faultyLineContent: `for i := 0; i <= total; i += chunkSize { ... end = total - 1 }`,
        errorMessage:
          'Condition `i <= total` executes when `i == total`, and clamping `end = total - 1` produces `items[total : total-1]`, causing a fatal runtime panic.',
        fixedLineContent: `for i := 0; i < total; i += chunkSize { ... if end > total { end = total } }`,
      },
    ],
  }
];
