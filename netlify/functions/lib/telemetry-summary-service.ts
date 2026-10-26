// Reporting only. Collection, request validation and authentication remain in the service.
import {
  getDefaultTelemetryStore,
  type BlobStoreLike,
  type StoredTelemetryEvent,
  type TelemetryEventName,
  type TelemetrySummaryResponse,
  type TelemetryEventMetrics,
  type FunnelStepSummary,
} from './telemetry-service.ts';
import {
  retentionSummary,
  matchesRetentionFilters,
  isVersionedTelemetryEvent,
  type RetentionFilters,
} from './telemetry-retention.ts';

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

  const selectedEvents = allEvents.filter((event) => matchesRetentionFilters(event, filters));
  return {
    retention: retentionSummary(allEvents, filters, now),
    period: { days: boundedDays, startDate, endDate },
    filters: { ...filters, schemaVersion: 2, channel: filters.channel ?? 'production' },
    ...calculateEventMetrics(selectedEvents.filter(isVersionedTelemetryEvent)),
    legacy: {
      definition:
        'Legacy/unclassified events, excluded from primary metrics and new-install retention. Explicit edition/build/channel filters still apply. Development excluded by default. No historical records are modified.',
      ...calculateEventMetrics(selectedEvents.filter((event) => !isVersionedTelemetryEvent(event))),
    },
  };
}

function calculateEventMetrics(allEvents: StoredTelemetryEvent[]): TelemetryEventMetrics {
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
    if (isCombatRound(loss.rounds)) {
      lossRounds.push(loss.rounds);
    } else if (isCombatRound(loss.round)) {
      lossRounds.push(loss.round);
    } else {
      const battleId = loss.battleId ?? loss.context?.battleId;
      if (battleId === undefined) continue;
      // A mission can be retried. Never borrow from another battle or a future event.
      const relatedCombatRounds = allEvents.filter(
        (e) =>
          e.name === 'combat_round' &&
          e.installId === loss.installId &&
          (e.battleId ?? e.context?.battleId) === battleId &&
          (!loss.missionId || e.missionId === loss.missionId) &&
          Date.parse(e.timestamp) <= Date.parse(loss.timestamp) &&
          isCombatRound(e.round),
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
      totalLosses: lossEvents.length,
      unknownCount: lossEvents.length - lossRounds.length,
    },
  };
}

function isCombatRound(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}
