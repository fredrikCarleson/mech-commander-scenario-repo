import { afterEach, expect, it, vi } from 'vitest';
import { retentionSummary } from '../netlify/functions/lib/telemetry-retention.ts';
import {
  parseTelemetryPayload,
  processAndStoreEvents,
  type BlobStoreLike,
  type StoredTelemetryEvent,
} from '../netlify/functions/lib/telemetry-service.ts';
import { handleTelemetryRequest } from '../netlify/functions/telemetry.ts';
import { handleTelemetrySummaryRequest } from '../netlify/functions/telemetry-summary.ts';

const installId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
function payload(type = 'session_start', extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    installId,
    eventId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    timestamp: '2026-10-01T12:00:00.000Z',
    version: '0.1.17',
    build: 'abc1234',
    edition: 'full',
    channel: 'steam',
    opposition: 'classical',
    elapsedMs: 0,
    event: { type, firstSession: true, firstSeenAt: '2026-10-01T12:00:00.000Z' },
    ...extra,
  };
}
function event(
  name = 'session_start',
  extra: Partial<StoredTelemetryEvent> = {},
): StoredTelemetryEvent {
  return { ...parseTelemetryPayload(JSON.stringify(payload(name)))[0], ...extra };
}
function memoryStore() {
  const data = new Map<string, unknown>();
  const store: BlobStoreLike = {
    get: async (key, options) =>
      options?.type === 'text' && data.has(key) ? String(data.get(key)) : (data.get(key) ?? null),
    set: async (key, value) => {
      data.set(key, value);
    },
    setJSON: async (key, value) => {
      data.set(key, value);
    },
    list: async (options) => ({
      blobs: [...data.keys()]
        .filter((key) => key.startsWith(options?.prefix ?? ''))
        .map((key) => ({ key })),
    }),
  };
  return { store, data };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('accepts game-client v2 metadata and strips arbitrary identifying fields', () => {
  const result = parseTelemetryPayload(
    JSON.stringify(
      payload('tutorial_lesson', {
        playerName: 'private',
        event: {
          type: 'tutorial_lesson',
          lessonId: 'r1_queue_move',
          stage: 'completed',
          email: 'private',
        },
        context: {
          difficulty: 'story',
          battleMode: 'training',
          battleId: 99,
          companyName: 'private',
        },
      }),
    ),
  )[0];
  expect(result).toMatchObject({
    schemaVersion: 2,
    edition: 'full',
    lessonId: 'r1_queue_move',
    stage: 'completed',
    context: { difficulty: 'story', battleMode: 'training', battleId: 99 },
  });
  expect(JSON.stringify(result)).not.toContain('private');
  expect(() =>
    parseTelemetryPayload(JSON.stringify(payload('session_start', { eventId: undefined }))),
  ).toThrow('Invalid retention metadata');
});
it('deduplicates retried and same-batch events without consuming the budget twice, including late delivery', async () => {
  const { store, data } = memoryStore();
  const saved = event();
  expect(await processAndStoreEvents([saved, saved], store)).toEqual({ accepted: 1, ignored: 0 });
  expect(await processAndStoreEvents([saved], store)).toEqual({ accepted: 0, ignored: 0 });
  const keys = [...data.keys()];
  expect(keys.filter((key) => key.startsWith('events/'))).toEqual([
    `events/2026-10-01/${installId}-${saved.eventId}.json`,
  ]);
  expect(data.get(keys.find((key) => key.startsWith('rate-limit/'))!)).toBe('1');
});
it('returns retryable 429 for a v2 event over budget rather than silently acknowledging its loss', async () => {
  const { store } = memoryStore();
  await store.set(`rate-limit/${new Date().toISOString().slice(0, 10)}/${installId}`, '500');
  const response = await handleTelemetryRequest(
    new Request('https://example.test/telemetry', {
      method: 'POST',
      body: JSON.stringify(payload()),
    }),
    store,
  );
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('3600');
});
it('counts an ordered new-install journey through a loss, HQ acknowledgement and a distinct second battle', () => {
  const journey = [
    event(),
    event('company_founded'),
    event('battle_entered', {
      battleId: 101,
      entry: 'deploy',
      context: { battleMode: 'campaign' },
    }),
    event('mission_loss', { battleId: 101 }),
    event('after_action_acknowledged'),
    event('battle_entered', {
      battleId: 102,
      entry: 'deploy',
      priorAttempts: 1,
      context: { battleMode: 'campaign' },
    }),
  ];
  const summary = retentionSummary(journey, {}, new Date('2026-10-10'));
  expect(summary.funnel.map((step) => step.uniqueInstalls)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(summary.funnel[5].conversionFromStart).toBe(1);
});
it('excludes replays, resumes, wrong battle outcomes and out-of-order events from conversion', () => {
  const summary = retentionSummary(
    [
      event(),
      event('mission_win'),
      event('company_founded'),
      event('battle_entered', {
        entry: 'deploy',
        battleId: 1,
        context: { battleMode: 'training' },
      }),
      event('battle_entered', {
        entry: 'resume',
        battleId: 2,
        context: { battleMode: 'campaign' },
      }),
      event('battle_entered', {
        entry: 'deploy',
        battleId: 3,
        context: { battleMode: 'campaign' },
      }),
      event('mission_win', { battleId: 2 }),
      event('after_action_acknowledged'),
    ],
    {},
    new Date('2026-10-10'),
  );
  expect(summary.funnel.map((step) => step.uniqueInstalls)).toEqual([1, 1, 1, 0, 0, 0]);
});
it('separates Demo and Full, excludes development by default, and deduplicates lesson progress', () => {
  const lesson = event('tutorial_lesson', { lessonId: 'r1_queue_move', stage: 'entered' });
  const input = [
    event(),
    event('session_start', { installId: 'demo-install', edition: 'demo' }),
    event('session_start', { installId: 'dev-install', channel: 'development' }),
    lesson,
    lesson,
    event('tutorial_lesson', { lessonId: 'r1_queue_move', stage: 'completed' }),
    event('session_start', { installId: 'legacy-install', schemaVersion: undefined }),
  ];
  expect(retentionSummary(input, {}, new Date()).cohortInstalls).toBe(2);
  expect(retentionSummary(input, { edition: 'full' }, new Date()).cohortInstalls).toBe(1);
  expect(retentionSummary(input, { channel: 'development' }, new Date()).cohortInstalls).toBe(1);
  expect(retentionSummary(input, {}, new Date()).lessons).toEqual([
    { lessonId: 'r1_queue_move', enteredInstalls: 1, completedInstalls: 1 },
  ]);
});
it('uses only mature UTC D1/D7 cohorts, counts later builds as returns, and excludes unknown legacy first sessions', () => {
  const input = [
    event(),
    event('session_start', {
      timestamp: '2026-10-02T09:00:00.000Z',
      firstSession: false,
      build: 'updated',
    }),
    event('session_start', {
      timestamp: '2026-10-08T09:00:00.000Z',
      firstSession: false,
      build: 'updated',
    }),
    event('session_start', {
      installId: 'young-install',
      timestamp: '2026-10-08T08:00:00.000Z',
      firstSeenAt: '2026-10-08T08:00:00.000Z',
    }),
    event('session_start', { installId: 'old-unknown', firstSession: false, firstSeenAt: null }),
  ];
  const summary = retentionSummary(
    input,
    { build: 'abc1234' },
    new Date('2026-10-09T00:00:00.000Z'),
  );
  expect(summary.returns).toEqual([
    { day: 1, eligibleInstalls: 1, returnedInstalls: 1, rate: 1 },
    { day: 7, eligibleInstalls: 1, returnedInstalls: 1, rate: 1 },
  ]);
  expect(
    retentionSummary([event()], {}, new Date('2026-10-02T23:59:59Z')).returns[0].rate,
  ).toBeNull();
});
it('serves cohort filters behind existing admin authentication', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  vi.stubEnv('TELEMETRY_ADMIN_KEY', 'test-only');
  const { store } = memoryStore();
  await processAndStoreEvents([event()], store);
  const url = 'https://example.test/telemetry-summary?days=14&edition=full&build=abc1234';
  expect((await handleTelemetrySummaryRequest(new Request(url), store)).status).toBe(401);
  const response = await handleTelemetrySummaryRequest(
    new Request(url, { headers: { 'X-Admin-Key': 'test-only' } }),
    store,
  );
  expect(response.status).toBe(200);
  expect((await response.json()).retention.cohortInstalls).toBe(1);
  expect(
    (
      await handleTelemetrySummaryRequest(
        new Request(url + '&channel=unknown', { headers: { 'X-Admin-Key': 'test-only' } }),
        store,
      )
    ).status,
  ).toBe(400);
});
