/**
 * Automated QA & Security Audit Suite for Hermes 3D Spatial Studio Telemetry API
 * 
 * Verifies:
 * 1. Endpoint response status and valid JSON format (telemetry, kanban, cron, health, auth).
 * 2. Schema integrity of each agent: id, name, role, state ('WORKING'|'IDLE'),
 *    targetZone ('WORKSTATION'|'LOUNGE'), activeLeasesCount, activityText, workDesk {x, y}, idleSpot {x, y}.
 * 3. Zero crashes when SQLite files are read concurrently under high stress load.
 * 4. Reporting of exact test execution metrics.
 */

const assert = require('assert');
const path = require('path');
const Database = require('better-sqlite3');
const { createSessionToken } = require('./sso-guard');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3500';
const HERMES_ROOT = '/home/yes/.hermes';
const KANBAN_DB_PATH = path.join(HERMES_ROOT, 'kanban/boards/ai-studio/kanban.db');
const STATE_DB_PATH = path.join(HERMES_ROOT, 'state.db');

// Test statistics tracker
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  suites: 0,
  failures: []
};

function pass(testName) {
  stats.total++;
  stats.passed++;
  console.log(`  \x1b[32m✔\x1b[0m ${testName}`);
}

function fail(testName, error) {
  stats.total++;
  stats.failed++;
  stats.failures.push({ testName, error: error.message || error });
  console.log(`  \x1b[31m✖\x1b[0m ${testName}`);
  console.log(`    \x1b[33mError: ${error.message || error}\x1b[0m`);
}

function suite(suiteName) {
  stats.suites++;
  console.log(`\n\x1b[1m\x1b[36m▶ [Suite ${stats.suites}] ${suiteName}\x1b[0m`);
}

// Generate valid Superadmin Session Token
const adminToken = createSessionToken({
  userId: 'qa-security-auditor',
  email: 'auditor@aistudio.corp',
  name: 'Lead QA Auditor',
  role: 'SUPERADMIN'
});

const authHeaders = {
  'Authorization': `Bearer ${adminToken}`,
  'Content-Type': 'application/json'
};

async function fetchJson(urlPath, options = {}) {
  const url = `${BASE_URL}${urlPath}`;
  const res = await fetch(url, options);
  let json = null;
  const rawText = await res.text();
  try {
    json = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Invalid JSON returned from ${urlPath} (HTTP ${res.status}): ${rawText.slice(0, 120)}...`);
  }
  return { status: res.status, headers: res.headers, body: json };
}

async function runAudit() {
  console.log(`\x1b[1m=================================================================\x1b[0m`);
  console.log(`\x1b[1m  Hermes 3D Spatial Studio Telemetry API - QA & Security Audit Suite  \x1b[0m`);
  console.log(`\x1b[1m  Target: ${BASE_URL}                                            \x1b[0m`);
  console.log(`\x1b[1m=================================================================\x1b[0m`);

  // ------------------------------------------------------------------------
  // SUITE 1: Endpoint Response Status & JSON Format
  // ------------------------------------------------------------------------
  suite('Endpoint Response Status & Valid JSON Format');

  // Test 1.1: Public Health Check
  try {
    const res = await fetchJson('/api/health');
    assert.strictEqual(res.status, 200, 'Health endpoint must return 200');
    assert.strictEqual(res.body.status, 'ok', 'Status must be "ok"');
    assert.strictEqual(res.body.port, 3500, 'Port must be 3500');
    pass('GET /api/health returns 200 OK and valid JSON');
  } catch (err) {
    fail('GET /api/health returns 200 OK and valid JSON', err);
  }

  // Test 1.2: Unauthenticated Access Control (Security Gate)
  for (const ep of ['/api/telemetry', '/api/kanban', '/api/cron']) {
    try {
      const res = await fetchJson(ep);
      assert.strictEqual(res.status, 401, `${ep} must return 401 Unauthorized without credentials`);
      assert.strictEqual(res.body.success, false, 'success flag must be false');
      assert.strictEqual(res.body.authenticated, false, 'authenticated flag must be false');
      assert.ok(res.body.loginUrl, 'loginUrl must be present in 401 response');
      pass(`GET ${ep} correctly enforces 401 Unauthorized when unauthenticated`);
    } catch (err) {
      fail(`GET ${ep} correctly enforces 401 Unauthorized when unauthenticated`, err);
    }
  }

  // Test 1.3: GET /api/telemetry (Authenticated)
  let telemetryData = null;
  try {
    const res = await fetchJson('/api/telemetry', { headers: authHeaders });
    assert.strictEqual(res.status, 200, '/api/telemetry must return 200 OK');
    assert.strictEqual(res.body.success, true, 'success must be true');
    assert.ok(typeof res.body.timestamp === 'string', 'timestamp must be ISO string');
    assert.ok(res.body.summary && typeof res.body.summary === 'object', 'summary must be an object');
    assert.strictEqual(typeof res.body.summary.totalAgents, 'number', 'summary.totalAgents must be number');
    assert.strictEqual(typeof res.body.summary.workingCount, 'number', 'summary.workingCount must be number');
    assert.strictEqual(typeof res.body.summary.idleCount, 'number', 'summary.idleCount must be number');
    assert.strictEqual(
      res.body.summary.workingCount + res.body.summary.idleCount,
      res.body.summary.totalAgents,
      'workingCount + idleCount must equal totalAgents'
    );
    assert.ok(Array.isArray(res.body.agents), 'agents must be an array');
    assert.ok(res.body.kanban && typeof res.body.kanban === 'object', 'kanban summary must be present');
    assert.ok(res.body.cron && typeof res.body.cron === 'object', 'cron summary must be present');
    telemetryData = res.body;
    pass('GET /api/telemetry returns 200 OK with valid top-level schema');
  } catch (err) {
    fail('GET /api/telemetry returns 200 OK with valid top-level schema', err);
  }

  // Test 1.4: GET /api/kanban (Authenticated)
  try {
    const res = await fetchJson('/api/kanban', { headers: authHeaders });
    assert.strictEqual(res.status, 200, '/api/kanban must return 200 OK');
    assert.strictEqual(res.body.success, true, 'success must be true');
    assert.strictEqual(typeof res.body.activeBoard, 'string', 'activeBoard must be string');
    assert.ok(res.body.summary && typeof res.body.summary === 'object', 'summary must be object');
    assert.strictEqual(typeof res.body.summary.total, 'number', 'summary.total must be number');
    assert.strictEqual(typeof res.body.summary.done, 'number', 'summary.done must be number');
    assert.ok(Array.isArray(res.body.recentTasks), 'recentTasks must be an array');
    pass('GET /api/kanban returns 200 OK with activeBoard, summary, and recentTasks');
  } catch (err) {
    fail('GET /api/kanban returns 200 OK with activeBoard, summary, and recentTasks', err);
  }

  // Test 1.5: GET /api/cron (Authenticated)
  try {
    const res = await fetchJson('/api/cron', { headers: authHeaders });
    assert.strictEqual(res.status, 200, '/api/cron must return 200 OK');
    assert.strictEqual(res.body.success, true, 'success must be true');
    assert.ok(['RUNNING', 'IDLE', 'UNKNOWN'].includes(res.body.schedulerStatus), 'schedulerStatus must be RUNNING/IDLE/UNKNOWN');
    assert.ok(res.body.lastHeartbeatAgoSec === null || typeof res.body.lastHeartbeatAgoSec === 'number', 'lastHeartbeatAgoSec must be null or number');
    assert.ok(Array.isArray(res.body.recentExecutions), 'recentExecutions must be an array');
    pass('GET /api/cron returns 200 OK with schedulerStatus, heartbeat, and recentExecutions');
  } catch (err) {
    fail('GET /api/cron returns 200 OK with schedulerStatus, heartbeat, and recentExecutions', err);
  }

  // Test 1.6: GET /api/agents (Backward Compatibility Alias)
  try {
    const res = await fetchJson('/api/agents', { headers: authHeaders });
    assert.strictEqual(res.status, 200, '/api/agents must return 200 OK');
    assert.strictEqual(res.body.success, true, 'success must be true');
    assert.ok(Array.isArray(res.body.agents), 'agents must be an array');
    assert.ok(typeof res.body.currentActivity === 'string', 'currentActivity must be present for canvas');
    pass('GET /api/agents returns 200 OK backward compatibility payload');
  } catch (err) {
    fail('GET /api/agents returns 200 OK backward compatibility payload', err);
  }

  // ------------------------------------------------------------------------
  // SUITE 2: Schema Integrity of Multi-Agent Telemetry
  // ------------------------------------------------------------------------
  suite('Agent Schema Integrity & Coordinate Contract Verification');

  const EXPECTED_AGENT_IDS = ['default', 'agent-d', 'agent-a', 'agent-b', 'agent-c'];
  const agents = telemetryData?.agents || [];

  try {
    assert.strictEqual(agents.length, 5, 'Must contain exactly 5 agents');
    const returnedIds = agents.map(a => a.id);
    assert.deepStrictEqual(returnedIds.sort(), [...EXPECTED_AGENT_IDS].sort(), 'All 5 specific agent profiles must exist');
    pass('Telemetry contains all 5 expected agent profiles (default, agent-d, agent-a, agent-b, agent-c)');
  } catch (err) {
    fail('Telemetry contains all 5 expected agent profiles', err);
  }

  for (const agent of agents) {
    const prefix = `[Agent: ${agent.id} (${agent.name})]`;

    // 2.1 Identity & Metadata fields
    try {
      assert.ok(typeof agent.id === 'string' && agent.id.length > 0, `${prefix} id must be non-empty string`);
      assert.ok(typeof agent.name === 'string' && agent.name.length > 0, `${prefix} name must be non-empty string`);
      assert.ok(typeof agent.role === 'string' && agent.role.length > 0, `${prefix} role must be non-empty string`);
      pass(`${prefix} id, name, and role are non-empty strings`);
    } catch (err) {
      fail(`${prefix} id, name, and role validation`, err);
    }

    // 2.2 State & Zone Contract
    try {
      assert.ok(['WORKING', 'IDLE'].includes(agent.state), `${prefix} state must be 'WORKING' | 'IDLE', got: ${agent.state}`);
      assert.ok(['WORKSTATION', 'LOUNGE'].includes(agent.targetZone), `${prefix} targetZone must be 'WORKSTATION' | 'LOUNGE', got: ${agent.targetZone}`);

      // Logical relationship
      if (agent.state === 'WORKING') {
        assert.strictEqual(agent.targetZone, 'WORKSTATION', `${prefix} WORKING agents must target WORKSTATION`);
      } else {
        assert.strictEqual(agent.targetZone, 'LOUNGE', `${prefix} IDLE agents must target LOUNGE`);
      }
      pass(`${prefix} state (${agent.state}) and targetZone (${agent.targetZone}) strictly match contract`);
    } catch (err) {
      fail(`${prefix} state and targetZone contract validation`, err);
    }

    // 2.3 Leases count & Activity text
    try {
      assert.ok(Number.isInteger(agent.activeLeasesCount) && agent.activeLeasesCount >= 0, `${prefix} activeLeasesCount must be integer >= 0`);
      assert.ok(typeof agent.activityText === 'string' && agent.activityText.length > 0, `${prefix} activityText must be non-empty string`);
      pass(`${prefix} activeLeasesCount (${agent.activeLeasesCount}) and activityText ('${agent.activityText.slice(0, 30)}...') valid`);
    } catch (err) {
      fail(`${prefix} activeLeasesCount and activityText validation`, err);
    }

    // 2.4 Work Desk coordinates
    try {
      assert.ok(agent.workDesk && typeof agent.workDesk === 'object', `${prefix} workDesk must be an object`);
      assert.ok(typeof agent.workDesk.x === 'number' && !isNaN(agent.workDesk.x), `${prefix} workDesk.x must be numeric`);
      assert.ok(typeof agent.workDesk.y === 'number' && !isNaN(agent.workDesk.y), `${prefix} workDesk.y must be numeric`);
      pass(`${prefix} workDesk coordinates { x: ${agent.workDesk.x}, y: ${agent.workDesk.y} } are valid numbers`);
    } catch (err) {
      fail(`${prefix} workDesk coordinates validation`, err);
    }

    // 2.5 Idle Spot coordinates
    try {
      assert.ok(agent.idleSpot && typeof agent.idleSpot === 'object', `${prefix} idleSpot must be an object`);
      assert.ok(typeof agent.idleSpot.x === 'number' && !isNaN(agent.idleSpot.x), `${prefix} idleSpot.x must be numeric`);
      assert.ok(typeof agent.idleSpot.y === 'number' && !isNaN(agent.idleSpot.y), `${prefix} idleSpot.y must be numeric`);
      pass(`${prefix} idleSpot coordinates { x: ${agent.idleSpot.x}, y: ${agent.idleSpot.y} } are valid numbers`);
    } catch (err) {
      fail(`${prefix} idleSpot coordinates validation`, err);
    }

    // 2.6 Target coordinates alignment
    try {
      assert.ok(agent.targetCoords && typeof agent.targetCoords === 'object', `${prefix} targetCoords must be present`);
      if (agent.state === 'WORKING') {
        assert.strictEqual(agent.targetCoords.x, agent.workDesk.x, `${prefix} targetCoords.x must match workDesk.x when WORKING`);
        assert.strictEqual(agent.targetCoords.y, agent.workDesk.y, `${prefix} targetCoords.y must match workDesk.y when WORKING`);
      } else {
        assert.strictEqual(agent.targetCoords.x, agent.idleSpot.x, `${prefix} targetCoords.x must match idleSpot.x when IDLE`);
        assert.strictEqual(agent.targetCoords.y, agent.idleSpot.y, `${prefix} targetCoords.y must match idleSpot.y when IDLE`);
      }
      pass(`${prefix} targetCoords { x: ${agent.targetCoords.x}, y: ${agent.targetCoords.y} } correctly aligned with zone`);
    } catch (err) {
      fail(`${prefix} targetCoords alignment validation`, err);
    }
  }

  // ------------------------------------------------------------------------
  // SUITE 3: Concurrency & SQLite Crash-Resilience Stress Test
  // ------------------------------------------------------------------------
  suite('SQLite High-Concurrency & Stress Resilience (Zero Crashes)');

  const CONCURRENT_HTTP_REQUESTS = 60;
  const CONCURRENT_DB_READS = 40;

  console.log(`  Spawning ${CONCURRENT_HTTP_REQUESTS} concurrent HTTP API queries and ${CONCURRENT_DB_READS} direct SQLite read transactions...`);

  const startTime = Date.now();
  let httpSuccessCount = 0;
  let dbSuccessCount = 0;

  // Array of endpoints to hammer
  const endpoints = ['/api/telemetry', '/api/kanban', '/api/cron'];

  const httpPromises = Array.from({ length: CONCURRENT_HTTP_REQUESTS }, async (_, i) => {
    const ep = endpoints[i % endpoints.length];
    const res = await fetchJson(ep, { headers: authHeaders });
    if (res.status === 200 && res.body.success === true) {
      httpSuccessCount++;
    } else {
      throw new Error(`Concurrent HTTP request ${i} to ${ep} returned ${res.status}`);
    }
  });

  const dbPromises = Array.from({ length: CONCURRENT_DB_READS }, async (_, i) => {
    // Alternate reading kanban.db and state.db
    const targetDb = i % 2 === 0 ? KANBAN_DB_PATH : STATE_DB_PATH;
    const db = new Database(targetDb, { readonly: true, timeout: 3000 });
    try {
      if (i % 2 === 0) {
        const rows = db.prepare('SELECT id, status, assignee FROM tasks LIMIT 10').all();
        assert.ok(Array.isArray(rows), 'kanban rows must be array');
      } else {
        const rows = db.prepare('SELECT id, title, model FROM sessions LIMIT 5').all();
        assert.ok(Array.isArray(rows), 'sessions rows must be array');
      }
      dbSuccessCount++;
    } finally {
      db.close();
    }
  });

  try {
    await Promise.all([...httpPromises, ...dbPromises]);
    const durationMs = Date.now() - startTime;
    assert.strictEqual(httpSuccessCount, CONCURRENT_HTTP_REQUESTS, 'All concurrent HTTP queries must succeed');
    assert.strictEqual(dbSuccessCount, CONCURRENT_DB_READS, 'All direct concurrent DB queries must succeed');
    pass(`Executed ${CONCURRENT_HTTP_REQUESTS} concurrent HTTP requests + ${CONCURRENT_DB_READS} SQLite transactions in ${durationMs}ms with ZERO crashes`);
  } catch (err) {
    fail('High-concurrency SQLite stress test failed', err);
  }

  // Test 3.2: Verify Server is still responsive after load
  try {
    const res = await fetchJson('/api/telemetry', { headers: authHeaders });
    assert.strictEqual(res.status, 200, 'Post-stress health check must return 200');
    assert.strictEqual(res.body.success, true, 'Post-stress health check must be successful');
    pass('Post-stress health check confirmed server remains healthy and responsive');
  } catch (err) {
    fail('Post-stress health check failed', err);
  }

  // ------------------------------------------------------------------------
  // AUDIT SUMMARY REPORT
  // ------------------------------------------------------------------------
  console.log(`\n\x1b[1m=================================================================\x1b[0m`);
  console.log(`\x1b[1m                        AUDIT SUMMARY REPORT                     \x1b[0m`);
  console.log(`\x1b[1m=================================================================\x1b[0m`);
  console.log(`  Total Checks Executed : ${stats.total}`);
  console.log(`  Checks Passed         : \x1b[32m${stats.passed}\x1b[0m`);
  console.log(`  Checks Failed         : ${stats.failed > 0 ? `\x1b[31m${stats.failed}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);
  console.log(`  Pass Rate             : \x1b[1m${((stats.passed / stats.total) * 100).toFixed(1)}%\x1b[0m`);

  if (stats.failed > 0) {
    console.log(`\n\x1b[31mFailed Assertions:\x1b[0m`);
    stats.failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.testName}]: ${f.error}`);
    });
    console.log(`\x1b[1m=================================================================\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\n\x1b[32m\x1b[1m✔ ALL QA & SECURITY AUDIT CRITERIA SATISFIED WITH 100% SUCCESS.\x1b[0m`);
    console.log(`\x1b[1m=================================================================\x1b[0m\n`);
    process.exit(0);
  }
}

runAudit().catch(err => {
  console.error('\x1b[31mFatal unhandled audit error:\x1b[0m', err);
  process.exit(1);
});
