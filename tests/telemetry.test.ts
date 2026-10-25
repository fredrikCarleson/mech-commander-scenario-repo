import { beforeEach, describe, expect, it } from 'vitest';
import { handleTelemetryRequest } from '../netlify/functions/telemetry.ts';
import { handleTelemetrySummaryRequest } from '../netlify/functions/telemetry-summary.ts';
import {
  ALLOWED_EVENT_NAMES,
  BlobStoreLike,
  MAX_BODY_BYTES,
  MAX_EVENTS_PER_INSTALL_PER_DAY,
  parseTelemetryPayload,
  calculateMedian,
} from '../netlify/functions/lib/telemetry-service.ts';

class MockBlobStore implements BlobStoreLike {
  private data = new Map<string, any>();

  async get(key: string, options?: { type?: 'text' | 'json' }): Promise<any> {
    if (!this.data.has(key)) return null;
    const val = this.data.get(key);
    if (options?.type === 'text') {
      return typeof val === 'string' ? val : JSON.stringify(val);
    }
    return val;
  }

  async set(key: string, data: string): Promise<any> {
    this.data.set(key, data);
    return { modified: true };
  }

  async setJSON(key: string, data: unknown): Promise<any> {
    this.data.set(key, JSON.parse(JSON.stringify(data)));
    return { modified: true };
  }

  async list(options?: { prefix?: string }): Promise<{ blobs: { key: string }[] }> {
    const prefix = options?.prefix || '';
    const blobs = Array.from(this.data.keys())
      .filter((k) => k.startsWith(prefix))
      .map((k) => ({ key: k }));
    return { blobs };
  }

  getAllData(): Map<string, any> {
    return this.data;
  }

  clear(): void {
    this.data.clear();
  }
}

describe('Telemetry Service & Endpoints', () => {
  let mockStore: MockBlobStore;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockStore = new MockBlobStore();
    process.env = { ...originalEnv };
    process.env.TELEMETRY_ADMIN_KEY = 'test-secret-key-123';
  });

  describe('CORS & Preflight (Requirement 5)', () => {
    it('handles OPTIONS preflight with Origin null and responds 204', async () => {
      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'OPTIONS',
        headers: { Origin: 'null' },
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('handles OPTIONS preflight with Origin file:// and responds 204', async () => {
      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'OPTIONS',
        headers: { Origin: 'file://' },
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('file://');
    });

    it('attaches CORS headers on POST response', async () => {
      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          installId: '11111111-2222-3333-4444-555555555555',
          timestamp: new Date().toISOString(),
          event: { type: 'title_shown' },
        }),
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });
  });

  describe('Payload Parsing & Compatibility (Requirement 2 & 4)', () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';

    it('matches exact payload shape from mech-command src/platform/telemetry.ts', async () => {
      // Structure from client:
      // { installId: "...", timestamp: "...", event: { type: "mission_win", missionId: "border_signal", rounds: 8 } }
      const payload = {
        installId: validUuid,
        timestamp: '2026-10-23T09:30:00.000Z',
        event: {
          type: 'mission_win',
          missionId: 'border_signal',
          rounds: 8,
        },
      };

      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(204);

      // Verify stored event in mock store
      const allKeys = Array.from(mockStore.getAllData().keys());
      const eventKey = allKeys.find((k) => k.startsWith('events/'));
      expect(eventKey).toBeDefined();

      const storedEvents = await mockStore.get(eventKey!, { type: 'json' });
      expect(storedEvents).toHaveLength(1);
      expect(storedEvents[0]).toEqual({
        installId: validUuid,
        name: 'mission_win',
        timestamp: '2026-10-23T09:30:00.000Z',
        missionId: 'border_signal',
        rounds: 8,
      });
    });

    it('accepts batch array of events', async () => {
      const payload = [
        {
          installId: validUuid,
          timestamp: '2026-10-23T10:00:00.000Z',
          name: 'title_shown',
        },
        {
          installId: validUuid,
          timestamp: '2026-10-23T10:05:00.000Z',
          event: {
            type: 'deploy',
            missionId: 'm_alpha',
            isSideMission: false,
          },
        },
      ];

      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(204);

      const allKeys = Array.from(mockStore.getAllData().keys());
      const eventKey = allKeys.find((k) => k.startsWith('events/'));
      const storedEvents = await mockStore.get(eventKey!, { type: 'json' });
      expect(storedEvents).toHaveLength(2);
      expect(storedEvents[0].name).toBe('title_shown');
      expect(storedEvents[1].name).toBe('deploy');
      expect(storedEvents[1].missionId).toBe('m_alpha');
      expect(storedEvents[1].isSideMission).toBe(false);
    });

    it('accepts wrapped batch object { events: [...] }', async () => {
      const payload = {
        installId: validUuid,
        events: [
          {
            name: 'tutorial_step',
            timestamp: '2026-10-23T10:00:00.000Z',
            step: 3,
          },
          {
            name: 'hq_visit',
            timestamp: '2026-10-23T10:10:00.000Z',
            tab: 'barracks',
          },
        ],
      };

      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(204);
    });

    it('strips unknown fields, IP addresses, and personal information', () => {
      const dirty = {
        installId: validUuid,
        timestamp: '2026-10-23T12:00:00.000Z',
        name: 'combat_round',
        round: 4,
        missionId: 'm1',
        ipAddress: '192.168.1.1',
        clientIp: '1.2.3.4',
        userEmail: 'player@example.com',
        hardwareId: 'secret-hw-id',
        unrecognizedParam: 12345,
      };

      const parsed = parseTelemetryPayload(JSON.stringify(dirty));
      expect(parsed).toHaveLength(1);
      const clean = parsed[0];
      expect(clean).toEqual({
        installId: validUuid,
        name: 'combat_round',
        timestamp: '2026-10-23T12:00:00.000Z',
        missionId: 'm1',
        round: 4,
      });
      expect(clean).not.toHaveProperty('ipAddress');
      expect(clean).not.toHaveProperty('clientIp');
      expect(clean).not.toHaveProperty('userEmail');
      expect(clean).not.toHaveProperty('hardwareId');
      expect(clean).not.toHaveProperty('unrecognizedParam');
    });
  });

  describe('Allowed Events & Rejection Rules (Requirement 3 & 4)', () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';

    it('accepts all 11 allowed event names', async () => {
      for (const eventName of ALLOWED_EVENT_NAMES) {
        const payload = {
          installId: validUuid,
          timestamp: new Date().toISOString(),
          name: eventName,
        };
        const request = new Request('http://localhost/.netlify/functions/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const response = await handleTelemetryRequest(request, mockStore);
        expect(response.status).toBe(204);
      }
    });

    it('rejects unallowed event name with 400', async () => {
      const payload = {
        installId: validUuid,
        timestamp: new Date().toISOString(),
        event: { type: 'cheat_engine_detected' },
      };

      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Disallowed or missing event name');
    });

    it('rejects invalid or missing installId with 400', async () => {
      const payload = {
        installId: 'abc', // too short / not a valid identifier
        timestamp: new Date().toISOString(),
        name: 'title_shown',
      };

      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(400);
    });

    it('rejects invalid timestamp with 400', async () => {
      const payload = {
        installId: validUuid,
        timestamp: 'not-a-date',
        name: 'title_shown',
      };

      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(400);
    });

    it('rejects non-POST methods with 405', async () => {
      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'GET',
      });
      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(405);
    });

    it('rejects payloads exceeding 16 KB with 413', async () => {
      const hugeString = 'a'.repeat(MAX_BODY_BYTES + 100);
      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: hugeString,
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(413);
    });
  });

  describe('Abuse Protection (Requirement 8)', () => {
    const spammerId = '99999999-8888-7777-6666-555555555555';
    const today = new Date().toISOString().slice(0, 10);

    it('ignores installs that have reached 500 events in a day', async () => {
      // Seed rate-limit count to 500
      await mockStore.set(
        `rate-limit/${today}/${spammerId}`,
        String(MAX_EVENTS_PER_INSTALL_PER_DAY),
      );

      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installId: spammerId,
          timestamp: new Date().toISOString(),
          name: 'title_shown',
        }),
      });

      const response = await handleTelemetryRequest(request, mockStore);
      // Responds 204 without saving any event blob
      expect(response.status).toBe(204);

      const allKeys = Array.from(mockStore.getAllData().keys());
      const eventKeys = allKeys.filter((k) => k.startsWith('events/'));
      expect(eventKeys).toHaveLength(0);
    });

    it('allows events up to 500 and updates counter', async () => {
      // Seed rate-limit count to 498
      await mockStore.set(`rate-limit/${today}/${spammerId}`, '498');

      // Send 5 events in batch
      const batch = Array.from({ length: 5 }, (_, i) => ({
        installId: spammerId,
        timestamp: new Date().toISOString(),
        name: 'combat_round' as const,
        round: i + 1,
      }));

      const request = new Request('http://localhost/.netlify/functions/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });

      const response = await handleTelemetryRequest(request, mockStore);
      expect(response.status).toBe(204);

      // Only 2 slots were available (498 + 2 = 500)
      const allKeys = Array.from(mockStore.getAllData().keys());
      const eventKeys = allKeys.filter((k) => k.startsWith('events/'));
      expect(eventKeys).toHaveLength(1);

      const saved = await mockStore.get(eventKeys[0], { type: 'json' });
      expect(saved).toHaveLength(2); // Only 2 accepted

      const newCount = await mockStore.get(`rate-limit/${today}/${spammerId}`, { type: 'text' });
      expect(newCount).toBe('500');
    });
  });

  describe('Summary Endpoint (Requirement 7)', () => {
    it('rejects requests without admin key with 401', async () => {
      const request = new Request('http://localhost/.netlify/functions/telemetry-summary?days=7', {
        method: 'GET',
      });
      const response = await handleTelemetrySummaryRequest(request, mockStore);
      expect(response.status).toBe(401);
    });

    it('rejects requests with incorrect admin key with 401', async () => {
      const request = new Request('http://localhost/.netlify/functions/telemetry-summary?days=7', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'wrong-key' },
      });
      const response = await handleTelemetrySummaryRequest(request, mockStore);
      expect(response.status).toBe(401);
    });

    it('returns 500 if server environment lacks TELEMETRY_ADMIN_KEY', async () => {
      delete process.env.TELEMETRY_ADMIN_KEY;
      const request = new Request('http://localhost/.netlify/functions/telemetry-summary?days=7', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'anything' },
      });
      const response = await handleTelemetrySummaryRequest(request, mockStore);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('TELEMETRY_ADMIN_KEY is not configured');
    });

    it('generates correct summary, funnel, unique installs, and median loss rounds', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const userA = 'aaaaaaaa-1111-1111-1111-111111111111';
      const userB = 'bbbbbbbb-2222-2222-2222-222222222222';
      const userC = 'cccccccc-3333-3333-3333-333333333333';

      // Seed events with schemaVersion 2:
      // userA: title_shown, tutorial_step, deploy, combat_round(1..6), mission_loss(rounds: 6), quit
      // userB: title_shown, tutorial_step, deploy, combat_round(1..4), mission_win(rounds: 4), hq_visit
      // userC: title_shown, deploy, combat_round(1..10), mission_loss(rounds: 10) [skipped tutorial_step]
      const events = [
        {
          schemaVersion: 2,
          installId: userA,
          name: 'title_shown',
          timestamp: `${today}T10:00:00.000Z`,
          edition: 'full',
          build: 'b1',
        },
        {
          schemaVersion: 2,
          installId: userA,
          name: 'tutorial_step',
          step: 1,
          timestamp: `${today}T10:01:00.000Z`,
          edition: 'full',
          build: 'b1',
        },
        {
          schemaVersion: 2,
          installId: userA,
          name: 'deploy',
          missionId: 'm1',
          timestamp: `${today}T10:02:00.000Z`,
          edition: 'full',
          build: 'b1',
        },
        {
          schemaVersion: 2,
          installId: userA,
          name: 'mission_loss',
          missionId: 'm1',
          rounds: 6,
          timestamp: `${today}T10:10:00.000Z`,
          edition: 'full',
          build: 'b1',
        },
        {
          schemaVersion: 2,
          installId: userA,
          name: 'quit',
          timestamp: `${today}T10:11:00.000Z`,
          edition: 'full',
          build: 'b1',
        },

        {
          schemaVersion: 2,
          installId: userB,
          name: 'title_shown',
          timestamp: `${today}T11:00:00.000Z`,
          edition: 'demo',
          build: 'b1',
        },
        {
          schemaVersion: 2,
          installId: userB,
          name: 'tutorial_step',
          step: 1,
          timestamp: `${today}T11:02:00.000Z`,
          edition: 'demo',
          build: 'b1',
        },
        {
          schemaVersion: 2,
          installId: userB,
          name: 'deploy',
          missionId: 'm1',
          timestamp: `${today}T11:05:00.000Z`,
          edition: 'demo',
          build: 'b1',
        },
        {
          schemaVersion: 2,
          installId: userB,
          name: 'mission_win',
          missionId: 'm1',
          rounds: 4,
          timestamp: `${today}T11:15:00.000Z`,
          edition: 'demo',
          build: 'b1',
        },
        {
          schemaVersion: 2,
          installId: userB,
          name: 'hq_visit',
          tab: 'armory',
          timestamp: `${today}T11:20:00.000Z`,
          edition: 'demo',
          build: 'b1',
        },

        {
          schemaVersion: 2,
          installId: userC,
          name: 'title_shown',
          timestamp: `${today}T12:00:00.000Z`,
          edition: 'full',
          build: 'b2',
        },
        {
          schemaVersion: 2,
          installId: userC,
          name: 'deploy',
          missionId: 'm2',
          timestamp: `${today}T12:05:00.000Z`,
          edition: 'full',
          build: 'b2',
        },
        {
          schemaVersion: 2,
          installId: userC,
          name: 'mission_loss',
          missionId: 'm2',
          rounds: 10,
          timestamp: `${today}T12:15:00.000Z`,
          edition: 'full',
          build: 'b2',
        },
      ];

      await mockStore.setJSON(`events/${today}/batch1.json`, events);

      // Query summary with X-Admin-Key
      const request = new Request('http://localhost/.netlify/functions/telemetry-summary?days=7', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'test-secret-key-123' },
      });

      const response = await handleTelemetrySummaryRequest(request, mockStore);
      expect(response.status).toBe(200);

      const summary = await response.json();
      expect(summary.totalEvents).toBe(13);
      expect(summary.uniqueInstalls).toBe(3);

      // Event counts
      expect(summary.countsPerEvent.title_shown).toBe(3);
      expect(summary.countsPerEvent.tutorial_step).toBe(2);
      expect(summary.countsPerEvent.deploy).toBe(3);
      expect(summary.countsPerEvent.mission_win).toBe(1);
      expect(summary.countsPerEvent.mission_loss).toBe(2);
      expect(summary.countsPerEvent.hq_visit).toBe(1);
      expect(summary.countsPerEvent.quit).toBe(1);

      // Cohort-based funnel: userC skipped tutorial_step so cannot count for deploy
      const funnel = summary.funnel;
      expect(funnel).toHaveLength(5);
      expect(funnel[0]).toMatchObject({ step: 'title_shown', uniqueInstalls: 3 });
      expect(funnel[1]).toMatchObject({ step: 'tutorial_step', uniqueInstalls: 2 });
      expect(funnel[2]).toMatchObject({ step: 'deploy', uniqueInstalls: 2 });
      expect(funnel[2].conversionFromPrevious).toBeLessThanOrEqual(1);
      expect(funnel[3]).toMatchObject({ step: 'mission_win', uniqueInstalls: 1 });
      expect(funnel[4]).toMatchObject({ step: 'hq_visit', uniqueInstalls: 1 });

      // Rounds before loss:
      expect(summary.combatRoundsBeforeMissionLoss.median).toBe(8);
      expect(summary.combatRoundsBeforeMissionLoss.mean).toBe(8);
      expect(summary.combatRoundsBeforeMissionLoss.min).toBe(6);
      expect(summary.combatRoundsBeforeMissionLoss.max).toBe(10);
      expect(summary.combatRoundsBeforeMissionLoss.sampleCount).toBe(2);
      expect(summary.combatRoundsBeforeMissionLoss.missingCount).toBe(0);
      expect(summary.combatRoundsBeforeMissionLoss.rounds).toEqual([6, 10]);

      // Breakdowns
      expect(summary.breakdown.byEdition.full.uniqueInstalls).toBe(2);
      expect(summary.breakdown.byEdition.demo.uniqueInstalls).toBe(1);
      expect(summary.breakdown.byBuild.b1.uniqueInstalls).toBe(2);
      expect(summary.breakdown.byBuild.b2.uniqueInstalls).toBe(1);
    });

    it('enforces cohort-based funnel where each step is <= previous and conversion <= 1', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const u1 = '11111111-1111-1111-1111-111111111111';
      const u2 = '22222222-2222-2222-2222-222222222222';
      const u3 = '33333333-3333-3333-3333-333333333333';

      // u1: all steps
      // u2: title_shown, tutorial_step (drops at deploy)
      // u3: title_shown, deploy (skipped tutorial_step -> should NOT be in deploy cohort)
      const testEvents = [
        {
          schemaVersion: 2,
          installId: u1,
          name: 'title_shown',
          timestamp: `${today}T08:00:00.000Z`,
        },
        {
          schemaVersion: 2,
          installId: u1,
          name: 'tutorial_step',
          timestamp: `${today}T08:01:00.000Z`,
        },
        { schemaVersion: 2, installId: u1, name: 'deploy', timestamp: `${today}T08:02:00.000Z` },
        {
          schemaVersion: 2,
          installId: u1,
          name: 'mission_win',
          timestamp: `${today}T08:10:00.000Z`,
        },
        { schemaVersion: 2, installId: u1, name: 'hq_visit', timestamp: `${today}T08:15:00.000Z` },

        {
          schemaVersion: 2,
          installId: u2,
          name: 'title_shown',
          timestamp: `${today}T09:00:00.000Z`,
        },
        {
          schemaVersion: 2,
          installId: u2,
          name: 'tutorial_step',
          timestamp: `${today}T09:01:00.000Z`,
        },

        {
          schemaVersion: 2,
          installId: u3,
          name: 'title_shown',
          timestamp: `${today}T10:00:00.000Z`,
        },
        { schemaVersion: 2, installId: u3, name: 'deploy', timestamp: `${today}T10:05:00.000Z` },
      ];

      const store = new MockBlobStore();
      await store.setJSON(`events/${today}/cohort_test.json`, testEvents);

      const request = new Request('http://localhost/.netlify/functions/telemetry-summary?days=7', {
        headers: { 'X-Admin-Key': 'test-secret-key-123' },
      });
      const response = await handleTelemetrySummaryRequest(request, store);
      const summary = await response.json();

      const funnel = summary.funnel;
      expect(funnel[0].uniqueInstalls).toBe(3); // u1, u2, u3
      expect(funnel[1].uniqueInstalls).toBe(2); // u1, u2
      expect(funnel[2].uniqueInstalls).toBe(1); // only u1 (u3 skipped tutorial_step)
      expect(funnel[3].uniqueInstalls).toBe(1); // u1
      expect(funnel[4].uniqueInstalls).toBe(1); // u1

      for (let i = 1; i < funnel.length; i++) {
        expect(funnel[i].uniqueInstalls).toBeLessThanOrEqual(funnel[i - 1].uniqueInstalls);
        expect(funnel[i].conversionFromPrevious).toBeLessThanOrEqual(1.0);
      }
    });

    it('filters legacy builds by default and includes them when ?includeLegacy=1', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const modernUser = '44444444-4444-4444-4444-444444444444';
      const legacyUser = '55555555-5555-5555-5555-555555555555';

      const mixedEvents = [
        {
          schemaVersion: 2,
          installId: modernUser,
          name: 'title_shown',
          timestamp: `${today}T10:00:00.000Z`,
        },
        { installId: legacyUser, name: 'title_shown', timestamp: `${today}T10:05:00.000Z` }, // No schemaVersion (legacy)
      ];

      const store = new MockBlobStore();
      await store.setJSON(`events/${today}/legacy_test.json`, mixedEvents);

      // Default: only schemaVersion: 2
      const reqModern = new Request(
        'http://localhost/.netlify/functions/telemetry-summary?days=7',
        {
          headers: { 'X-Admin-Key': 'test-secret-key-123' },
        },
      );
      const resModern = await handleTelemetrySummaryRequest(reqModern, store);
      const modernSummary = await resModern.json();
      expect(modernSummary.totalEvents).toBe(1);
      expect(modernSummary.uniqueInstalls).toBe(1);

      // With ?includeLegacy=1
      const reqLegacy = new Request(
        'http://localhost/.netlify/functions/telemetry-summary?days=7&includeLegacy=1',
        {
          headers: { 'X-Admin-Key': 'test-secret-key-123' },
        },
      );
      const resLegacy = await handleTelemetrySummaryRequest(reqLegacy, store);
      const legacySummary = await resLegacy.json();
      expect(legacySummary.totalEvents).toBe(2);
      expect(legacySummary.uniqueInstalls).toBe(2);
    });

    it('excludes mission_loss without rounds from stats and tracks missingCount', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const u1 = '66666666-6666-6666-6666-666666666666';
      const u2 = '77777777-7777-7777-7777-777777777777';
      const u3 = '88888888-8888-8888-8888-888888888888';

      const lossEvents = [
        {
          schemaVersion: 2,
          installId: u1,
          name: 'mission_loss',
          rounds: 4,
          timestamp: `${today}T12:00:00.000Z`,
        },
        {
          schemaVersion: 2,
          installId: u2,
          name: 'mission_loss',
          rounds: 8,
          timestamp: `${today}T12:05:00.000Z`,
        },
        {
          schemaVersion: 2,
          installId: u3,
          name: 'mission_loss',
          timestamp: `${today}T12:10:00.000Z`,
        }, // Missing rounds!
      ];

      const store = new MockBlobStore();
      await store.setJSON(`events/${today}/loss_rounds.json`, lossEvents);

      const request = new Request('http://localhost/.netlify/functions/telemetry-summary?days=7', {
        headers: { 'X-Admin-Key': 'test-secret-key-123' },
      });
      const response = await handleTelemetrySummaryRequest(request, store);
      const summary = await response.json();

      const lossStats = summary.combatRoundsBeforeMissionLoss;
      expect(lossStats.sampleCount).toBe(2);
      expect(lossStats.missingCount).toBe(1);
      expect(lossStats.median).toBe(6); // (4 + 8) / 2
      expect(lossStats.mean).toBe(6);
      expect(lossStats.min).toBe(4);
      expect(lossStats.max).toBe(8);
      expect(lossStats.rounds).toEqual([4, 8]);
    });

    it('accepts admin key via Authorization Bearer header', async () => {
      const request = new Request('http://localhost/.netlify/functions/telemetry-summary?days=7', {
        method: 'GET',
        headers: { Authorization: 'Bearer test-secret-key-123' },
      });
      const response = await handleTelemetrySummaryRequest(request, mockStore);
      expect(response.status).toBe(200);
    });
  });

  describe('Math utility: calculateMedian', () => {
    it('handles empty, odd, and even lists', () => {
      expect(calculateMedian([])).toBeNull();
      expect(calculateMedian([5])).toBe(5);
      expect(calculateMedian([1, 7, 3])).toBe(3);
      expect(calculateMedian([1, 2, 8, 10])).toBe(5);
      expect(calculateMedian([2, 5])).toBe(3.5);
    });
  });
});
