import { getStore } from '@netlify/blobs';
import {
  parseRetentionFields,
  retentionSummary,
  matchesRetentionFilters,
  type RetentionFields,
  type RetentionFilters,
} from './telemetry-retention.ts';

export const MAX_BODY_BYTES = 16 * 1024; // 16 KB body limit
export const MAX_EVENTS_PER_INSTALL_PER_DAY = 500;
export const TELEMETRY_STORE_NAME = 'telemetry';

export const ALLOWED_EVENT_NAMES = [
  'title_shown',
  'campaign_intro',
  'tutorial_step',
  'tutorial_complete',
  'tutorial_skip',
  'deploy',
  'combat_round',
  'mission_win',
  'mission_loss',
  'hq_visit',
  'quit',
  'session_start',
  'tutorial_start',
  'tutorial_resume',
  'tutorial_restart',
  'tutorial_lesson',
  'company_founded',
  'battle_entered',
  'after_action_acknowledged',
  'repair_scheduled',
] as const;

export type TelemetryEventName = (typeof ALLOWED_EVENT_NAMES)[number];

export interface StoredTelemetryEvent extends RetentionFields {
  installId: string;
  name: TelemetryEventName;
  timestamp: string;
  missionId?: string;
  round?: number;
  step?: number;
  tab?: string;
  isSideMission?: boolean;
  rounds?: number;
  campaignId?: string;
}

export interface FunnelStepSummary {
  step: string;
  uniqueInstalls: number;
  eventCount: number;
  dropoffInstalls: number;
  conversionFromPrevious: number;
  conversionFromStart: number;
}

export interface TelemetrySummaryResponse {
  retention: ReturnType<typeof retentionSummary>;
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  totalEvents: number;
  uniqueInstalls: number;
  countsPerEvent: Record<TelemetryEventName, number>;
  funnel: FunnelStepSummary[];
  combatRoundsBeforeMissionLoss: {
    median: number | null;
    sampleCount: number;
    min: number | null;
    max: number | null;
    rounds: number[];
  };
}

export class TelemetryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelemetryValidationError';
  }
}

export class TelemetryPayloadTooLargeError extends Error {
  constructor(message = 'Payload exceeds maximum allowed size of 16 KB.') {
    super(message);
    this.name = 'TelemetryPayloadTooLargeError';
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

export function isValidInstallId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  return UUID_REGEX.test(trimmed) || SAFE_ID_REGEX.test(trimmed);
}

export function getTelemetryCorsHeaders(
  request: Request,
  allowedMethods = 'POST, OPTIONS',
): Record<string, string> {
  const origin = request.headers.get('Origin');
  // Electron renderers may send Origin null or file:// or custom scheme.
  // Return origin if present, or '*' fallback.
  const allowOrigin = origin && origin !== 'null' ? origin : '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': allowedMethods,
    'Access-Control-Allow-Headers':
      'Content-Type, Accept, Authorization, X-Admin-Key, x-admin-key, X-Telemetry-Admin-Key',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'Retry-After',
    Vary: 'Origin',
  };
}

export function corsPreflightResponse(
  request: Request,
  allowedMethods = 'POST, OPTIONS',
): Response {
  return new Response(null, {
    status: 204,
    headers: getTelemetryCorsHeaders(request, allowedMethods),
  });
}

export function jsonResponse(
  status: number,
  data: unknown,
  request?: Request,
  allowedMethods = 'GET, POST, OPTIONS',
): Response {
  const cors = request ? getTelemetryCorsHeaders(request, allowedMethods) : {};
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors,
    },
  });
}

export function noContentResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getTelemetryCorsHeaders(request, 'POST, OPTIONS'),
  });
}

export async function readBoundedTelemetryBody(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<string> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new TelemetryPayloadTooLargeError();
    }
  }

  const text = await request.text();
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > maxBytes) {
    throw new TelemetryPayloadTooLargeError();
  }
  return text;
}

export function parseRawEventItem(item: unknown, fallbackInstallId?: string): StoredTelemetryEvent {
  if (!item || typeof item !== 'object') {
    throw new TelemetryValidationError('Event item must be a JSON object.');
  }

  const raw = item as Record<string, unknown>;

  // installId can be at root or inherited
  const installIdCandidate = raw.installId || fallbackInstallId;
  if (!isValidInstallId(installIdCandidate)) {
    throw new TelemetryValidationError(
      'Missing or invalid installId (must be a UUID or valid identifier).',
    );
  }
  const installId = (installIdCandidate as string).trim();

  // Timestamp
  const timestamp = raw.timestamp;
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    throw new TelemetryValidationError(
      'Missing or invalid timestamp (must be an ISO date string).',
    );
  }
  const parsedDate = new Date(timestamp);
  const normalizedTimestamp = parsedDate.toISOString();

  // Event Name extraction
  // Handles:
  // 1) { event: { type: "mission_win", ... } } (client src/platform/telemetry.ts)
  // 2) { event: "mission_win" }
  // 3) { name: "mission_win" }
  // 4) { type: "mission_win" }
  let nameCandidate: unknown;
  let propsSource: Record<string, unknown> = {};

  if (typeof raw.event === 'object' && raw.event !== null) {
    const subEvent = raw.event as Record<string, unknown>;
    nameCandidate = subEvent.type || subEvent.name;
    propsSource = { ...subEvent };
  } else if (typeof raw.event === 'string') {
    nameCandidate = raw.event;
  } else if (typeof raw.name === 'string') {
    nameCandidate = raw.name;
  } else if (typeof raw.type === 'string') {
    nameCandidate = raw.type;
  }

  if (typeof raw.props === 'object' && raw.props !== null) {
    propsSource = { ...propsSource, ...(raw.props as Record<string, unknown>) };
  }

  const mergedProps = { ...raw, ...propsSource };

  if (
    typeof nameCandidate !== 'string' ||
    !ALLOWED_EVENT_NAMES.includes(nameCandidate as TelemetryEventName)
  ) {
    throw new TelemetryValidationError(
      `Disallowed or missing event name: "${String(nameCandidate)}". Allowed events: ${ALLOWED_EVENT_NAMES.join(', ')}.`,
    );
  }
  const name = nameCandidate as TelemetryEventName;

  // Build clean stored object with ONLY whitelisted fields (strip unknown fields, IPs, personal info)
  const stored: StoredTelemetryEvent = {
    ...parseRetentionFields(mergedProps, (message) => {
      throw new TelemetryValidationError(message);
    }),
    installId,
    name,
    timestamp: normalizedTimestamp,
  };

  if (
    'missionId' in mergedProps &&
    mergedProps.missionId !== undefined &&
    mergedProps.missionId !== null
  ) {
    if (typeof mergedProps.missionId !== 'string') {
      throw new TelemetryValidationError('missionId must be a string.');
    }
    stored.missionId = mergedProps.missionId.slice(0, 100);
  }

  if ('round' in mergedProps && mergedProps.round !== undefined && mergedProps.round !== null) {
    if (
      typeof mergedProps.round !== 'number' ||
      !Number.isFinite(mergedProps.round) ||
      mergedProps.round < 0
    ) {
      throw new TelemetryValidationError('round must be a non-negative number.');
    }
    stored.round = Math.floor(mergedProps.round);
  }

  if ('rounds' in mergedProps && mergedProps.rounds !== undefined && mergedProps.rounds !== null) {
    if (
      typeof mergedProps.rounds !== 'number' ||
      !Number.isFinite(mergedProps.rounds) ||
      mergedProps.rounds < 0
    ) {
      throw new TelemetryValidationError('rounds must be a non-negative number.');
    }
    stored.rounds = Math.floor(mergedProps.rounds);
  }

  if ('step' in mergedProps && mergedProps.step !== undefined && mergedProps.step !== null) {
    if (
      typeof mergedProps.step !== 'number' ||
      !Number.isFinite(mergedProps.step) ||
      mergedProps.step < 0
    ) {
      throw new TelemetryValidationError('step must be a non-negative number.');
    }
    stored.step = Math.floor(mergedProps.step);
  }

  if ('tab' in mergedProps && mergedProps.tab !== undefined && mergedProps.tab !== null) {
    if (typeof mergedProps.tab !== 'string') {
      throw new TelemetryValidationError('tab must be a string.');
    }
    stored.tab = mergedProps.tab.slice(0, 100);
  }

  if (
    'isSideMission' in mergedProps &&
    mergedProps.isSideMission !== undefined &&
    mergedProps.isSideMission !== null
  ) {
    if (typeof mergedProps.isSideMission !== 'boolean') {
      throw new TelemetryValidationError('isSideMission must be a boolean.');
    }
    stored.isSideMission = mergedProps.isSideMission;
  }

  if (
    'campaignId' in mergedProps &&
    mergedProps.campaignId !== undefined &&
    mergedProps.campaignId !== null
  ) {
    if (typeof mergedProps.campaignId !== 'string') {
      throw new TelemetryValidationError('campaignId must be a string.');
    }
    stored.campaignId = mergedProps.campaignId.slice(0, 100);
  }

  return stored;
}

export function parseTelemetryPayload(rawBody: string): StoredTelemetryEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new TelemetryValidationError('Invalid JSON syntax in request body.');
  }

  if (!parsed) {
    throw new TelemetryValidationError('Body cannot be null or empty.');
  }

  let items: unknown[] = [];
  let fallbackInstallId: string | undefined;

  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.events)) {
      items = obj.events;
      if (typeof obj.installId === 'string') fallbackInstallId = obj.installId;
    } else if (Array.isArray(obj.batch)) {
      items = obj.batch;
      if (typeof obj.installId === 'string') fallbackInstallId = obj.installId;
    } else {
      items = [obj];
    }
  } else {
    throw new TelemetryValidationError('Payload must be a JSON object or array.');
  }

  if (items.length === 0) {
    throw new TelemetryValidationError('No telemetry events found in payload.');
  }

  return items.map((it) => parseRawEventItem(it, fallbackInstallId));
}

export interface BlobStoreLike {
  get(key: string, options?: { type?: 'text' | 'json' }): Promise<any>;
  set(key: string, data: string): Promise<any>;
  setJSON(key: string, data: unknown): Promise<any>;
  list(options?: {
    prefix?: string;
    paginate?: boolean;
  }): Promise<{ blobs: { key: string }[] }> | AsyncIterable<{ blobs: { key: string }[] }>;
}

export function getDefaultTelemetryStore(): BlobStoreLike {
  return getStore({
    name: TELEMETRY_STORE_NAME,
    consistency: 'strong',
  });
}

export async function processAndStoreEvents(
  events: StoredTelemetryEvent[],
  store: BlobStoreLike = getDefaultTelemetryStore(),
): Promise<{ accepted: number; ignored: number }> {
  if (events.length === 0) return { accepted: 0, ignored: 0 };

  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  let acceptedTotal = 0;
  let ignoredTotal = 0;

  // Group events by installId
  const byInstall = new Map<string, StoredTelemetryEvent[]>();
  const seenIds = new Set<string>();
  for (const ev of events) {
    if (ev.eventId) {
      const key = `events/${ev.timestamp.slice(0, 10)}/${ev.installId}-${ev.eventId}.json`;
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      const existing = await store.get(key, { type: 'json' });
      if (existing) continue; // Retries must not consume the daily budget again.
    }
    const list = byInstall.get(ev.installId) || [];
    list.push(ev);
    byInstall.set(ev.installId, list);
  }

  for (const [installId, installEvents] of byInstall.entries()) {
    const countKey = `rate-limit/${todayStr}/${installId}`;
    let currentDailyCount = 0;
    try {
      const rawCount = await store.get(countKey, { type: 'text' });
      if (rawCount) {
        currentDailyCount = parseInt(rawCount, 10) || 0;
      }
    } catch {
      currentDailyCount = 0;
    }

    if (currentDailyCount >= MAX_EVENTS_PER_INSTALL_PER_DAY) {
      ignoredTotal += installEvents.length;
      continue;
    }

    const availableSlots = Math.max(0, MAX_EVENTS_PER_INSTALL_PER_DAY - currentDailyCount);
    const toAccept = installEvents.slice(0, availableSlots);
    const toIgnore = installEvents.length - toAccept.length;

    acceptedTotal += toAccept.length;
    ignoredTotal += toIgnore;

    if (toAccept.length > 0) {
      const legacy = toAccept.filter((event) => !event.eventId);
      if (legacy.length)
        await store.setJSON(`events/${todayStr}/${crypto.randomUUID()}.json`, legacy);
      for (const event of toAccept.filter((item) => item.eventId)) {
        await store.setJSON(
          `events/${event.timestamp.slice(0, 10)}/${event.installId}-${event.eventId}.json`,
          [event],
        );
      }

      // Update rate limit counter
      await store.set(countKey, String(currentDailyCount + toAccept.length));
    }
  }

  return { accepted: acceptedTotal, ignored: ignoredTotal };
}

export function calculateMedian(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

export async function fetchAllKeysForPrefix(
  store: BlobStoreLike,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  try {
    const listResult: any = store.list({ prefix, paginate: true });
    if (listResult && typeof listResult[Symbol.asyncIterator] === 'function') {
      for await (const page of listResult) {
        if (page && Array.isArray(page.blobs)) {
          for (const b of page.blobs) {
            keys.push(b.key);
          }
        }
      }
      return keys;
    }
  } catch {
    // paginate may not be supported or mocked in tests
  }

  try {
    const regularResult: any = await store.list({ prefix });
    if (regularResult && Array.isArray(regularResult.blobs)) {
      for (const b of regularResult.blobs) {
        keys.push(b.key);
      }
    }
  } catch {
    // Empty
  }

  return keys;
}

export async function generateTelemetrySummary(
  days = 7,
  store: BlobStoreLike = getDefaultTelemetryStore(),
  filters: RetentionFilters = {},
): Promise<TelemetrySummaryResponse> {
  const boundedDays = Math.max(1, Math.min(90, Math.floor(days)));
  const now = new Date();

  // Generate target dates: [today, today-1, ..., today-(boundedDays-1)]
  const dateStrings: string[] = [];
  for (let i = 0; i < boundedDays; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dateStrings.push(d.toISOString().slice(0, 10));
  }
  const startDate = dateStrings[dateStrings.length - 1];
  const endDate = dateStrings[0];

  // List all event blob keys for these dates
  const keyPromises = dateStrings.map((dateStr) =>
    fetchAllKeysForPrefix(store, `events/${dateStr}/`),
  );
  const keyArrays = await Promise.all(keyPromises);
  const allKeys = keyArrays.flat();

  // Fetch all blob contents
  const allEvents: StoredTelemetryEvent[] = [];
  const chunkSize = 25;
  for (let i = 0; i < allKeys.length; i += chunkSize) {
    const chunk = allKeys.slice(i, i + chunkSize);
    const chunkData = await Promise.all(
      chunk.map(async (k) => {
        try {
          return await store.get(k, { type: 'json' });
        } catch {
          return null;
        }
      }),
    );

    for (const item of chunkData) {
      if (Array.isArray(item)) {
        for (const ev of item) {
          if (ev && typeof ev === 'object' && ev.name) {
            allEvents.push(ev as StoredTelemetryEvent);
          }
        }
      } else if (item && typeof item === 'object' && (item as any).name) {
        allEvents.push(item as StoredTelemetryEvent);
      }
    }
  }

  // Calculate counts per event
  const retentionEvents = allEvents.slice();
  const selectedEvents = allEvents.filter((event) => matchesRetentionFilters(event, filters));
  allEvents.splice(0, allEvents.length, ...selectedEvents);
  const countsPerEvent: Record<TelemetryEventName, number> = {
    session_start: 0,
    tutorial_start: 0,
    tutorial_resume: 0,
    tutorial_restart: 0,
    tutorial_lesson: 0,
    company_founded: 0,
    battle_entered: 0,
    after_action_acknowledged: 0,
    repair_scheduled: 0,
    title_shown: 0,
    campaign_intro: 0,
    tutorial_step: 0,
    tutorial_complete: 0,
    tutorial_skip: 0,
    deploy: 0,
    combat_round: 0,
    mission_win: 0,
    mission_loss: 0,
    hq_visit: 0,
    quit: 0,
  };

  const uniqueInstallIds = new Set<string>();

  for (const ev of allEvents) {
    uniqueInstallIds.add(ev.installId);
    if (ev.name in countsPerEvent) {
      countsPerEvent[ev.name]++;
    }
  }

  // Funnel steps: title_shown -> tutorial_step -> deploy -> mission_win -> hq_visit
  const funnelStepNames = [
    'title_shown',
    'tutorial_step',
    'deploy',
    'mission_win',
    'hq_visit',
  ] as const;
  const funnelInstalls = funnelStepNames.map((step) => {
    const matching = allEvents.filter((e) => e.name === step);
    const uniqueForStep = new Set(matching.map((e) => e.installId)).size;
    return {
      step,
      uniqueInstalls: uniqueForStep,
      eventCount: matching.length,
    };
  });

  const firstStepCount = funnelInstalls[0]?.uniqueInstalls || 0;
  const funnel: FunnelStepSummary[] = funnelInstalls.map((s, idx) => {
    const prevInstalls = idx === 0 ? s.uniqueInstalls : funnelInstalls[idx - 1].uniqueInstalls;
    const dropoff = Math.max(0, prevInstalls - s.uniqueInstalls);
    const conversionFromPrev =
      prevInstalls > 0 ? Number((s.uniqueInstalls / prevInstalls).toFixed(3)) : 0;
    const conversionFromStart =
      firstStepCount > 0 ? Number((s.uniqueInstalls / firstStepCount).toFixed(3)) : 0;

    return {
      step: s.step,
      uniqueInstalls: s.uniqueInstalls,
      eventCount: s.eventCount,
      dropoffInstalls: dropoff,
      conversionFromPrevious: conversionFromPrev,
      conversionFromStart: conversionFromStart,
    };
  });

  // Calculate median combat rounds before mission_loss
  const lossRounds: number[] = [];
  const lossEvents = allEvents.filter((e) => e.name === 'mission_loss');

  for (const loss of lossEvents) {
    if (typeof loss.rounds === 'number' && Number.isFinite(loss.rounds)) {
      lossRounds.push(loss.rounds);
    } else {
      // Look for max round in combat_round events for this installId/missionId
      const relatedCombatRounds = allEvents.filter(
        (e) =>
          e.name === 'combat_round' &&
          e.installId === loss.installId &&
          (!loss.missionId || e.missionId === loss.missionId) &&
          typeof e.round === 'number',
      );
      if (relatedCombatRounds.length > 0) {
        const maxR = Math.max(...relatedCombatRounds.map((r) => r.round as number));
        lossRounds.push(maxR);
      }
    }
  }

  const medianRounds = calculateMedian(lossRounds);
  const minRounds = lossRounds.length > 0 ? Math.min(...lossRounds) : null;
  const maxRounds = lossRounds.length > 0 ? Math.max(...lossRounds) : null;

  return {
    retention: retentionSummary(retentionEvents, filters, now),
    period: {
      days: boundedDays,
      startDate,
      endDate,
    },
    totalEvents: allEvents.length,
    uniqueInstalls: uniqueInstallIds.size,
    countsPerEvent,
    funnel,
    combatRoundsBeforeMissionLoss: {
      median: medianRounds,
      sampleCount: lossRounds.length,
      min: minRounds,
      max: maxRounds,
      rounds: lossRounds,
    },
  };
}

export function verifyAdminKey(request: Request): boolean {
  const configuredKey = process.env.TELEMETRY_ADMIN_KEY?.trim();
  if (!configuredKey) return false;

  const headerKey =
    request.headers.get('x-admin-key') ||
    request.headers.get('x-telemetry-admin-key') ||
    request.headers.get('authorization');

  if (!headerKey) return false;

  const candidate = headerKey.trim();
  if (/^bearer\s+/i.test(candidate)) {
    return candidate.replace(/^bearer\s+/i, '').trim() === configuredKey;
  }

  return candidate === configuredKey;
}
