// Reporting only. Collection, request validation and authentication remain in the service.
import {
  getDefaultTelemetryStore,
  type BlobStoreLike,
  type StoredTelemetryEvent,
  type TelemetryEventName,
  type TelemetrySummaryResponse,
  type FunnelStepSummary,
} from './telemetry-service.ts';
import {
  retentionSummary,
  matchesEventFilters,
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

  // Calculate counts per event
  const retentionEvents = allEvents.slice();
  const selectedEvents = allEvents.filter((event) => matchesEventFilters(event, filters));
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

  // Cohort-based funnel steps: title_shown -> tutorial_step -> deploy -> mission_win -> hq_visit
  // Only installs that completed the previous step are eligible for each successive step.
  const funnelStepNames = [
    'title_shown',
    'tutorial_step',
    'deploy',
    'mission_win',
    'hq_visit',
  ] as const;

  let currentCohort = new Set<string>();
  const funnel: FunnelStepSummary[] = [];
  let firstStepCount = 0;

  for (let idx = 0; idx < funnelStepNames.length; idx++) {
    const step = funnelStepNames[idx];
    let nextCohort: Set<string>;

    if (idx === 0) {
      const stepEvents = allEvents.filter((e) => e.name === step);
      nextCohort = new Set(stepEvents.map((e) => e.installId));
      firstStepCount = nextCohort.size;
    } else {
      const stepEvents = allEvents.filter((e) => e.name === step && currentCohort.has(e.installId));
      nextCohort = new Set(stepEvents.map((e) => e.installId));
    }

    const prevCount = idx === 0 ? nextCohort.size : currentCohort.size;
    const dropoff = Math.max(0, prevCount - nextCohort.size);
    const conversionFromPrev = prevCount > 0 ? Number((nextCohort.size / prevCount).toFixed(3)) : 0;
    const conversionFromStart =
      firstStepCount > 0 ? Number((nextCohort.size / firstStepCount).toFixed(3)) : 0;

    const matchingEvents = allEvents.filter((e) => e.name === step && nextCohort.has(e.installId));

    funnel.push({
      step,
      uniqueInstalls: nextCohort.size,
      eventCount: matchingEvents.length,
      dropoffInstalls: dropoff,
      conversionFromPrevious: conversionFromPrev,
      conversionFromStart: conversionFromStart,
    });

    currentCohort = nextCohort;
  }

  // Calculate combat rounds before mission_loss
  const lossRounds: number[] = [];
  let missingCount = 0;
  const lossEvents = allEvents.filter((e) => e.name === 'mission_loss');

  for (const loss of lossEvents) {
    let roundVal: number | null = null;
    if (typeof loss.rounds === 'number' && Number.isFinite(loss.rounds)) {
      roundVal = loss.rounds;
    } else if (typeof (loss as any).round === 'number' && Number.isFinite((loss as any).round)) {
      roundVal = (loss as any).round;
    } else {
      // Look for max round in combat_round events for this installId/missionId
      const relatedCombatRounds = allEvents.filter(
        (e) =>
          e.name === 'combat_round' &&
          e.installId === loss.installId &&
          (!loss.missionId || e.missionId === loss.missionId) &&
          typeof e.round === 'number' &&
          Number.isFinite(e.round),
      );
      if (relatedCombatRounds.length > 0) {
        roundVal = Math.max(...relatedCombatRounds.map((r) => r.round as number));
      }
    }

    if (roundVal !== null && Number.isFinite(roundVal)) {
      lossRounds.push(roundVal);
    } else {
      missingCount++;
    }
  }

  const medianRounds = calculateMedian(lossRounds);
  const meanRounds =
    lossRounds.length > 0
      ? Number((lossRounds.reduce((acc, r) => acc + r, 0) / lossRounds.length).toFixed(2))
      : null;
  const minRounds = lossRounds.length > 0 ? Math.min(...lossRounds) : null;
  const maxRounds = lossRounds.length > 0 ? Math.max(...lossRounds) : null;

  // Breakdown by edition (full vs demo) and build
  const editionGroups = new Map<
    string,
    { installs: Set<string>; events: StoredTelemetryEvent[] }
  >();
  const buildGroups = new Map<string, { installs: Set<string>; events: StoredTelemetryEvent[] }>();

  for (const ev of allEvents) {
    const editionKey = ev.edition || 'unknown';
    let ed = editionGroups.get(editionKey);
    if (!ed) {
      ed = { installs: new Set(), events: [] };
      editionGroups.set(editionKey, ed);
    }
    ed.installs.add(ev.installId);
    ed.events.push(ev);

    const buildKey = ev.build || 'unknown';
    let bd = buildGroups.get(buildKey);
    if (!bd) {
      bd = { installs: new Set(), events: [] };
      buildGroups.set(buildKey, bd);
    }
    bd.installs.add(ev.installId);
    bd.events.push(ev);
  }

  function summarizeGroup(group: { installs: Set<string>; events: StoredTelemetryEvent[] }) {
    const groupCounts: Partial<Record<TelemetryEventName, number>> = {};
    for (const ev of group.events) {
      groupCounts[ev.name] = (groupCounts[ev.name] || 0) + 1;
    }
    return {
      uniqueInstalls: group.installs.size,
      totalEvents: group.events.length,
      missionWins: groupCounts.mission_win || 0,
      missionLosses: groupCounts.mission_loss || 0,
      countsPerEvent: groupCounts,
    };
  }

  const byEdition: Record<string, ReturnType<typeof summarizeGroup>> = {};
  for (const [key, group] of editionGroups.entries()) {
    byEdition[key] = summarizeGroup(group);
  }

  const byBuild: Record<string, ReturnType<typeof summarizeGroup>> = {};
  for (const [key, group] of buildGroups.entries()) {
    byBuild[key] = summarizeGroup(group);
  }

  const breakdown = { byEdition, byBuild };

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
      mean: meanRounds,
      min: minRounds,
      max: maxRounds,
      sampleCount: lossRounds.length,
      missingCount,
      rounds: lossRounds.slice(0, 50),
    },
    breakdown,
    breakdowns: breakdown,
  };
}
