#!/usr/bin/env node
/**
 * Local telemetry verification script and curl examples.
 *
 * Usage:
 *   1. Start local Netlify dev server:
 *      npm run dev
 *
 *   2. Run this test script:
 *      node scripts/test-telemetry.mjs
 *
 *   Or override the endpoint / admin key:
 *      TELEMETRY_BASE_URL=http://localhost:8888 TELEMETRY_ADMIN_KEY=your-key node scripts/test-telemetry.mjs
 *
 * ============================================================================
 * CURL EXAMPLES:
 * ============================================================================
 *
 * 1. OPTIONS CORS Preflight (Electron origin):
 *    curl -i -X OPTIONS http://localhost:8888/.netlify/functions/telemetry \
 *      -H "Origin: file://" \
 *      -H "Access-Control-Request-Method: POST"
 *
 * 2. Send single telemetry event (matching Meridian Strike game client):
 *    curl -i -X POST http://localhost:8888/.netlify/functions/telemetry \
 *      -H "Content-Type: application/json" \
 *      -d '{
 *        "installId": "550e8400-e29b-41d4-a716-446655440000",
 *        "timestamp": "2026-10-23T12:00:00.000Z",
 *        "event": {
 *          "type": "mission_win",
 *          "missionId": "border_signal",
 *          "rounds": 8
 *        }
 *      }'
 *
 * 3. Send batch telemetry events:
 *    curl -i -X POST http://localhost:8888/.netlify/functions/telemetry \
 *      -H "Content-Type: application/json" \
 *      -d '[
 *        {
 *          "installId": "550e8400-e29b-41d4-a716-446655440000",
 *          "timestamp": "2026-10-23T12:01:00.000Z",
 *          "name": "title_shown"
 *        },
 *        {
 *          "installId": "550e8400-e29b-41d4-a716-446655440000",
 *          "timestamp": "2026-10-23T12:05:00.000Z",
 *          "name": "deploy",
 *          "missionId": "border_signal",
 *          "isSideMission": false
 *        }
 *      ]'
 *
 * 4. Get 7-day summary (requires TELEMETRY_ADMIN_KEY):
 *    curl -i -X GET "http://localhost:8888/.netlify/functions/telemetry-summary?days=7" \
 *      -H "X-Admin-Key: dev-telemetry-admin-secret-key"
 *
 * 5. Attempt invalid event (rejected with 400):
 *    curl -i -X POST http://localhost:8888/.netlify/functions/telemetry \
 *      -H "Content-Type: application/json" \
 *      -d '{"installId":"550e8400-e29b-41d4-a716-446655440000","timestamp":"2026-10-23T12:00:00.000Z","name":"invalid_event"}'
 */

const BASE_URL = process.env.TELEMETRY_BASE_URL || 'http://localhost:8888';
const ADMIN_KEY = process.env.TELEMETRY_ADMIN_KEY || 'dev-telemetry-admin-secret-key';

async function run() {
  console.log(`Connecting to ${BASE_URL}...`);

  // Test 1: OPTIONS Preflight
  try {
    const preflight = await fetch(`${BASE_URL}/.netlify/functions/telemetry`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'file://',
        'Access-Control-Request-Method': 'POST',
      },
    });
    console.log(`1. OPTIONS Preflight: Status ${preflight.status} (expected 204)`);
    console.log(
      `   Access-Control-Allow-Origin: ${preflight.headers.get('Access-Control-Allow-Origin')}`,
    );
  } catch (err) {
    console.error(`Could not reach ${BASE_URL} (${err.message}). Ensure 'npm run dev' is running.`);
    process.exit(1);
  }

  // Test 2: Valid Single Event POST
  const installId = '770e8400-e29b-41d4-a716-446655440001';
  const postRes = await fetch(`${BASE_URL}/.netlify/functions/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      timestamp: new Date().toISOString(),
      event: {
        type: 'mission_win',
        missionId: 'border_signal',
        rounds: 6,
      },
    }),
  });
  console.log(`2. Single Event POST: Status ${postRes.status} (expected 204)`);

  // Test 3: Disallowed event name
  const invalidRes = await fetch(`${BASE_URL}/.netlify/functions/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      timestamp: new Date().toISOString(),
      name: 'cheat_activated',
    }),
  });
  console.log(`3. Disallowed Event POST: Status ${invalidRes.status} (expected 400)`);

  // Test 4: Summary unauthorized
  const unauthSummary = await fetch(`${BASE_URL}/.netlify/functions/telemetry-summary?days=7`);
  console.log(`4. Summary Unauthorized: Status ${unauthSummary.status} (expected 401)`);

  // Test 5: Summary authorized
  const authSummary = await fetch(`${BASE_URL}/.netlify/functions/telemetry-summary?days=7`, {
    headers: { 'X-Admin-Key': ADMIN_KEY },
  });
  console.log(`5. Summary Authorized: Status ${authSummary.status} (expected 200)`);
  if (authSummary.status === 200) {
    const json = await authSummary.json();
    console.log('   Summary Response:', JSON.stringify(json, null, 2));
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
