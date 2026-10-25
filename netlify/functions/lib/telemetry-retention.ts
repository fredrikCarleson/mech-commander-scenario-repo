// Versioned game-client metadata and cohort reporting. Never stores arbitrary payload fields.
import { z } from 'zod';
import type { StoredTelemetryEvent } from './telemetry-service.ts';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const fieldsSchema = z
  .object({
    schemaVersion: z.literal(2).optional(),
    eventId: z.uuid().optional(),
    sessionId: z.uuid().optional(),
    version: z.string().min(1).max(64).optional(),
    build: z.string().min(1).max(64).optional(),
    edition: z.enum(['full', 'demo']).optional(),
    channel: z.enum(['steam', 'standalone', 'development']).optional(),
    opposition: z.enum(['classical', 'adaptive']).optional(),
    elapsedMs: count.optional(),
    context: z
      .object({
        difficulty: z.enum(['story', 'veteran', 'iron']).optional(),
        battleMode: z.enum(['campaign', 'training', 'custom', 'sideMission']).optional(),
        battleId: z.union([z.string().min(1).max(128), z.number().finite()]).optional(),
      })
      .optional(),
    lessonId: z.string().min(1).max(100).optional(),
    stage: z.enum(['entered', 'completed']).optional(),
    entry: z.enum(['newCampaign', 'replay', 'deploy', 'resume']).optional(),
    priorAttempts: count.optional(),
    firstSession: z.boolean().optional(),
    firstSeenAt: z.iso.datetime().nullable().optional(),
    jobs: count.optional(),
    outcome: z.enum(['victory', 'defeat']).optional(),
    battleId: z.union([z.string().min(1).max(128), z.number().finite()]).optional(),
  })
  .superRefine((data, context) => {
    if (
      data.schemaVersion === 2 &&
      (!data.eventId ||
        !data.sessionId ||
        !data.edition ||
        !data.channel ||
        !data.build ||
        !data.version ||
        data.elapsedMs === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Version 2 requires identity, build, edition, channel and timing metadata.',
      });
    }
  });
export const CURRENT_SCHEMA_VERSION = 2;

export type RetentionFields = z.infer<typeof fieldsSchema>;
export function parseRetentionFields(
  raw: Record<string, unknown>,
  fail: (message: string) => never,
): RetentionFields {
  const result = fieldsSchema.safeParse(raw);
  if (!result.success) return fail('Invalid retention metadata.');
  return result.data;
}
export interface RetentionFilters {
  edition?: 'full' | 'demo';
  build?: string;
  channel?: 'steam' | 'standalone' | 'development';
  includeLegacy?: boolean;
}
export function matchesRetentionFilters(event: StoredTelemetryEvent, filters: RetentionFilters) {
  return (
    (!filters.edition || event.edition === filters.edition) &&
    (!filters.build || event.build === filters.build) &&
    (!filters.channel || event.channel === filters.channel)
  );
}
export function matchesEventFilters(
  event: StoredTelemetryEvent,
  filters: RetentionFilters,
): boolean {
  if (!filters.includeLegacy && event.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return false;
  }
  return matchesRetentionFilters(event, filters);
}
export function retentionSummary(
  input: StoredTelemetryEvent[],
  filters: RetentionFilters,
  now: Date,
) {
  const unique = new Map<string, StoredTelemetryEvent>();
  for (const event of input) {
    if (
      event.schemaVersion !== 2 ||
      !event.eventId ||
      !matchesRetentionFilters(event, { ...filters, build: undefined })
    )
      continue;
    if (!filters.channel && event.channel === 'development') continue;
    unique.set(event.eventId, event);
  }
  const events = [...unique.values()].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const starts = new Map<string, StoredTelemetryEvent>();
  for (const event of events) {
    if (
      event.name === 'session_start' &&
      event.firstSession &&
      (!filters.build || event.build === filters.build) &&
      !starts.has(event.installId)
    )
      starts.set(event.installId, event);
  }
  const names = [
    'first_session',
    'company_founded',
    'first_battle',
    'battle_finished',
    'returned_to_hq',
    'second_battle',
  ];
  const counts = names.map(() => 0);
  for (const [id, start] of starts) {
    const journey = events.filter(
      (event) => event.installId === id && event.timestamp >= start.timestamp,
    );
    let stage = 0;
    let firstBattle: string | number | undefined;
    counts[0]++;
    for (const event of journey) {
      const campaignBattle =
        event.name === 'battle_entered' &&
        event.context?.battleMode !== 'training' &&
        event.context?.battleMode !== 'custom';
      const completedStage =
        stage === 0
          ? event.name === 'company_founded'
          : stage === 1
            ? campaignBattle && event.entry === 'deploy'
            : stage === 2
              ? (event.name === 'mission_win' || event.name === 'mission_loss') &&
                (event.battleId ?? event.context?.battleId) === firstBattle
              : stage === 3
                ? event.name === 'after_action_acknowledged'
                : stage === 4
                  ? campaignBattle &&
                    event.entry === 'deploy' &&
                    (event.priorAttempts ?? 0) >= 1 &&
                    event.battleId !== firstBattle
                  : false;
      if (!completedStage) continue;
      if (stage === 1) firstBattle = event.battleId;
      stage++;
      counts[stage]++;
      if (stage === 5) break;
    }
  }
  const funnel = names.map((step, index) => ({
    step,
    uniqueInstalls: counts[index],
    conversionFromStart: counts[0] ? counts[index] / counts[0] : null,
    conversionFromPrevious:
      index && counts[index - 1]
        ? counts[index] / counts[index - 1]
        : index
          ? null
          : counts[0]
            ? 1
            : null,
  }));
  const lessonEvents = events.filter((event) => !filters.build || event.build === filters.build);
  const lessonIds = [
    ...new Set(
      lessonEvents
        .filter((event) => event.name === 'tutorial_lesson')
        .map((event) => event.lessonId)
        .filter((id): id is string => !!id),
    ),
  ];
  const lessons = lessonIds.map((lessonId) => ({
    lessonId,
    enteredInstalls: new Set(
      lessonEvents
        .filter((event) => event.lessonId === lessonId && event.stage === 'entered')
        .map((event) => event.installId),
    ).size,
    completedInstalls: new Set(
      lessonEvents
        .filter((event) => event.lessonId === lessonId && event.stage === 'completed')
        .map((event) => event.installId),
    ).size,
  }));
  const dayMs = 86_400_000;
  const returns = [1, 7].map((day) => {
    let eligible = 0,
      returned = 0;
    for (const [id, first] of starts) {
      if (!first.firstSeenAt) continue;
      const firstDay = Date.parse(first.firstSeenAt.slice(0, 10));
      const target = firstDay + day * dayMs;
      if (now.getTime() < target + dayMs) continue; // Follow-up day must be complete.
      eligible++;
      if (
        events.some(
          (event) =>
            event.installId === id &&
            event.name === 'session_start' &&
            Date.parse(event.timestamp) >= target &&
            Date.parse(event.timestamp) < target + dayMs,
        )
      )
        returned++;
    }
    return {
      day,
      eligibleInstalls: eligible,
      returnedInstalls: returned,
      rate: eligible ? returned / eligible : null,
    };
  });
  return {
    schemaVersion: 2,
    filters: { ...filters, channel: filters.channel ?? 'production' },
    observedEvents: events.length,
    cohortInstalls: starts.size,
    funnel,
    lessons,
    returns,
    definition:
      'Anonymous installations; UTC calendar-day returns with complete follow-up days. Development excluded by default. Legacy installs without a known first session are excluded from the new-install cohort.',
  };
}
