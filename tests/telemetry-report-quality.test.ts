import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  generateTelemetrySummary,
  parseTelemetryPayload,
  type BlobStoreLike,
  type StoredTelemetryEvent,
} from '../netlify/functions/lib/telemetry-service.ts';
import { handleTelemetryRequest } from '../netlify/functions/telemetry.ts';

const day = '2026-10-26';
const installId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
function payload(type: string, props: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    installId,
    eventId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    timestamp: `${day}T10:00:00.000Z`,
    version: '0.1.17',
    build: 'release-a',
    edition: 'full',
    channel: 'steam',
    elapsedMs: 0,
    event: { type, ...props },
  };
}
function event(name: string, extra: Partial<StoredTelemetryEvent> = {}): StoredTelemetryEvent {
  return { ...parseTelemetryPayload(JSON.stringify(payload(name)))[0], ...extra };
}
function memoryStore(events: StoredTelemetryEvent[] = []) {
  const data = new Map<string, unknown>([[`events/${day}/fixture.json`, events]]);
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
function mixedTraffic() {
  const steam = [
    event('title_shown'),
    event('deploy'),
    event('mission_loss', { rounds: 9 }),
    event('hq_visit'),
  ];
  const demo = [event('title_shown'), event('mission_loss', { rounds: 3 })].map((item) => ({
    ...item,
    installId: 'demo-install',
    edition: 'demo' as const,
    build: 'release-b',
  }));
  const standalone = [event('title_shown'), event('mission_loss', { rounds: 5 })].map((item) => ({
    ...item,
    installId: 'standalone-install',
    channel: 'standalone' as const,
  }));
  const development = [
    event('title_shown'),
    event('deploy'),
    event('mission_loss', { rounds: 99 }),
    event('hq_visit'),
    event('tutorial_lesson', { lessonId: 'r1_queue_move', stage: 'entered' }),
    event('session_start', { firstSession: true, firstSeenAt: `${day}T10:00:00.000Z` }),
  ].map((item) => ({ ...item, installId: 'dev-install', channel: 'development' as const }));
  const legacy = [event('title_shown'), event('mission_loss', { rounds: 1 })].map((item) => ({
    ...item,
    installId: 'legacy-install',
    schemaVersion: undefined,
    channel: undefined,
    build: undefined,
    edition: undefined,
  }));
  return [...steam, ...demo, ...standalone, ...development, ...legacy];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${day}T12:00:00.000Z`));
});
afterEach(() => {
  vi.useRealTimers();
});

it('excludes development from every default metric and keeps legacy data in its own section without rewriting records', async () => {
  const events = mixedTraffic();
  const snapshot = JSON.stringify(events);
  const { store, data } = memoryStore(events);
  const report = await generateTelemetrySummary(7, store);
  expect(report.filters).toEqual({ schemaVersion: 2, channel: 'production' });
  expect(report.totalEvents).toBe(8);
  expect(report.uniqueInstalls).toBe(3);
  expect(report.countsPerEvent).toMatchObject({
    title_shown: 3,
    deploy: 1,
    mission_loss: 3,
    hq_visit: 1,
  });
  expect(report.funnel.map((step) => step.uniqueInstalls)).toEqual([3, 0, 0, 0, 0]);
  expect(report.combatRoundsBeforeMissionLoss).toMatchObject({
    median: 5,
    rounds: [9, 3, 5],
    totalLosses: 3,
    unknownCount: 0,
  });
  expect(report.retention.lessons).toEqual([]);
  expect(report.retention.cohortInstalls).toBe(0);
  expect(report.legacy.totalEvents).toBe(2);
  expect(report.legacy.uniqueInstalls).toBe(1);
  expect(report.legacy.countsPerEvent).toMatchObject({ title_shown: 1, mission_loss: 1 });
  expect(report.legacy.combatRoundsBeforeMissionLoss.median).toBe(1);
  expect(report.breakdown.byEdition.full.totalEvents).toBe(6);
  expect(report.breakdown.byEdition.demo.totalEvents).toBe(2);
  expect(report.breakdown.byBuild['release-a'].totalEvents).toBe(6);
  expect(JSON.stringify(data.get(`events/${day}/fixture.json`))).toBe(snapshot);
});

it('preserves explicit legacy inclusion for the admin page while still excluding development', async () => {
  const { store } = memoryStore(mixedTraffic());
  const report = await generateTelemetrySummary(7, store, { includeLegacy: true });
  expect(report.filters).toMatchObject({ schemaVersion: 'all', includeLegacy: true });
  expect(report.totalEvents).toBe(10);
  expect(report.uniqueInstalls).toBe(4);
  expect(report.countsPerEvent.mission_loss).toBe(4);
  expect(report.legacy.totalEvents).toBe(2);
  expect(report.breakdown.byEdition.unknown.totalEvents).toBe(2);
  expect(report.combatRoundsBeforeMissionLoss.missingCount).toBe(
    report.combatRoundsBeforeMissionLoss.unknownCount,
  );
});

it('makes development diagnostics available only through an explicit channel filter', async () => {
  const { store } = memoryStore(mixedTraffic());
  const report = await generateTelemetrySummary(7, store, { channel: 'development' });
  expect(report.totalEvents).toBe(6);
  expect(report.uniqueInstalls).toBe(1);
  expect(report.countsPerEvent.mission_loss).toBe(1);
  expect(report.combatRoundsBeforeMissionLoss.rounds).toEqual([99]);
  expect(report.retention.cohortInstalls).toBe(1);
  expect(report.retention.lessons).toEqual([
    { lessonId: 'r1_queue_move', enteredInstalls: 1, completedInstalls: 0 },
  ]);
  expect(report.legacy.totalEvents).toBe(0);
});

it.each([
  [{ edition: 'demo' as const, channel: 'steam' as const, build: 'release-b' }, 2, 3],
  [{ edition: 'full' as const, channel: 'steam' as const, build: 'release-a' }, 4, 9],
  [{ channel: 'standalone' as const }, 2, 5],
])(
  'honours the same explicit edition/build/channel filters in all sections: %j',
  async (filters, count, rounds) => {
    const { store } = memoryStore(mixedTraffic());
    const report = await generateTelemetrySummary(7, store, filters);
    expect(report.totalEvents).toBe(count);
    expect(report.combatRoundsBeforeMissionLoss.rounds).toEqual([rounds]);
    expect(report.legacy.totalEvents).toBe(0);
    expect(report.filters).toMatchObject(filters);
  },
);

it('treats incomplete schema-2 metadata as unclassified rather than production', async () => {
  const { store } = memoryStore([event('mission_loss', { channel: undefined, rounds: 1 })]);
  const report = await generateTelemetrySummary(7, store);
  expect(report.totalEvents).toBe(0);
  expect(report.retention.observedEvents).toBe(0);
  expect(report.legacy.totalEvents).toBe(1);
});

it('uses direct outcome counts first and infers missing rounds only within the same installation, mission and battle before the loss', async () => {
  const before = `${day}T09:59:00.000Z`;
  const events = [
    event('combat_round', {
      missionId: 'm1',
      round: 12,
      context: { battleId: 'attempt-a' },
      timestamp: before,
    }),
    event('combat_round', {
      missionId: 'm1',
      round: 3,
      context: { battleId: 'attempt-b' },
      timestamp: before,
    }),
    event('combat_round', {
      installId: 'another-install',
      missionId: 'm1',
      round: 20,
      context: { battleId: 'attempt-b' },
      timestamp: before,
    }),
    event('combat_round', { missionId: 'm1', round: 99, battleId: 'attempt-d', timestamp: before }),
    event('combat_round', {
      missionId: 'm1',
      round: 4,
      context: { battleId: 'attempt-f' },
      timestamp: before,
    }),
    event('combat_round', {
      missionId: 'another-mission',
      round: 17,
      battleId: 'attempt-f',
      timestamp: before,
    }),
    event('combat_round', {
      missionId: 'm1',
      round: 7,
      battleId: 'attempt-g',
      timestamp: `${day}T10:01:00.000Z`,
    }),
    event('mission_loss', { missionId: 'm1', battleId: 'attempt-b' }),
    event('mission_loss', { missionId: 'm1' }),
    event('mission_loss', { missionId: 'm1', battleId: 'attempt-d', rounds: 9, round: 1 }),
    event('mission_loss', { missionId: 'm1', battleId: 'attempt-e', round: 6 }),
    event('mission_loss', { missionId: 'm1', context: { battleId: 'attempt-f' } }),
    event('mission_loss', { missionId: 'm1', battleId: 'attempt-g' }),
    event('mission_loss', { missionId: 'm1', battleId: 'attempt-h', rounds: 0 }),
  ];
  const { store } = memoryStore(events);
  const report = await generateTelemetrySummary(7, store);
  expect(report.combatRoundsBeforeMissionLoss).toEqual({
    rounds: [3, 9, 6, 4],
    median: 5,
    mean: 5.5,
    min: 3,
    max: 9,
    sampleCount: 4,
    totalLosses: 7,
    unknownCount: 3,
    missingCount: 3,
  });
});

it('reports an unknown loss count explicitly when no attempt can be established', async () => {
  const { store } = memoryStore([event('mission_loss')]);
  expect((await generateTelemetrySummary(7, store)).combatRoundsBeforeMissionLoss).toEqual({
    median: null,
    mean: null,
    min: null,
    max: null,
    sampleCount: 0,
    rounds: [],
    totalLosses: 1,
    unknownCount: 1,
    missingCount: 1,
  });
});

it('collects and stores mechsLost through the public handler while stripping unrelated fields', async () => {
  const { store, data } = memoryStore();
  const body = payload('mission_loss', {
    missionId: 'border_signal',
    battleId: 'battle-nine',
    rounds: 9,
    round: 9,
    mechsLost: 2,
    playerName: 'private',
  });
  const response = await handleTelemetryRequest(
    new Request('https://example.test/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4175' },
      body: JSON.stringify(body),
    }),
    store,
  );
  expect(response.status).toBe(204);
  const saved = data.get(`events/${day}/${installId}-${body.eventId}.json`);
  expect(saved).toEqual([
    expect.objectContaining({
      name: 'mission_loss',
      missionId: 'border_signal',
      battleId: 'battle-nine',
      rounds: 9,
      round: 9,
      mechsLost: 2,
      channel: 'steam',
    }),
  ]);
  expect(JSON.stringify(saved)).not.toContain('private');
  expect((await generateTelemetrySummary(7, store)).combatRoundsBeforeMissionLoss.rounds).toEqual([
    9,
  ]);
});

it.each(['mission_win', 'mission_loss'])(
  'accepts zero or positive integer mechsLost on %s',
  (name) => {
    for (const mechsLost of [0, 2]) {
      expect(parseTelemetryPayload(JSON.stringify(payload(name, { mechsLost })))[0].mechsLost).toBe(
        mechsLost,
      );
    }
  },
);
it.each([-1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid mechsLost: %j',
  (mechsLost) => {
    expect(() =>
      parseTelemetryPayload(JSON.stringify(payload('mission_loss', { mechsLost }))),
    ).toThrow('Invalid retention metadata');
  },
);
