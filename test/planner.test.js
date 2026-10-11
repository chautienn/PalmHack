const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

test('Planner persists, opens, updates, and removes a complete trip', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'roamwell-planner-'));
  const child = spawn(process.execPath, ['app.js'], {
    cwd: root,
    env: { ...process.env, PORT: '0', PLANNER_DATA_DIR: dataDir, GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  const started = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 5000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited (${code}): ${output}`)));
  });
  t.after(async () => {
    child.kill();
    await once(child, 'exit').catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  });

  const base = await started;
  const call = async (url, method = 'GET', body) => {
    const response = await fetch(`${base}${url}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    return { response, body: await response.json() };
  };

  const id = 'e603d3d5-5110-41ac-a9da-0a7aaed50b1d';
  const snapshot = {
    destination: 'Columbia, SC',
    origin: 'Charlotte, NC',
    startDate: '2026-11-10',
    endDate: '2026-11-13',
    budget: 1800,
    bufferPercent: 12,
    transport: { method: 'Driving', cost: 150 },
    lodging: { name: 'Downtown hotel', nightly: 170, guests: 2 },
    food: { daily: 45 },
    selectedAttractions: ['garden'],
    itinerary: [{ id: 'plan-1', day: 1, title: 'Riverwalk', cost: 0 }],
    packed: { documents: true }
  };

  let result = await call('/api/planner', 'POST', {
    id, title: snapshot.destination, snapshot
  });
  assert.equal(result.response.status, 201);
  assert.deepEqual(result.body.snapshot, snapshot);

  const secondId = '47a52b5c-faa7-4c9a-8d7a-b5836cb98230';
  const secondTrip = {
    ...snapshot,
    destination: 'Portland, OR',
    transport: {
      method: 'Driving',
      cost: 104,
      details: { driveVehicle: 'Electric', driveDistance: 260, driveChargingCost: 104 }
    }
  };
  result = await call('/api/planner', 'POST', {
    id: secondId, title: secondTrip.destination, snapshot: secondTrip
  });
  assert.equal(result.response.status, 201);

  result = await call('/api/planner');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.trips.length, 2);
  assert.deepEqual(new Set(result.body.trips.map(trip => trip.id)), new Set([id, secondId]));

  const updated = { ...snapshot, budget: 2200, itinerary: [...snapshot.itinerary, { id: 'plan-2', day: 2, title: 'Museum', cost: 20 }] };
  result = await call(`/api/planner/${id}`, 'PUT', { title: updated.destination, snapshot: updated });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.snapshot.budget, 2200);
  assert.equal(result.body.snapshot.itinerary.length, 2);

  result = await call(`/api/planner/${id}`, 'DELETE');
  assert.equal(result.response.status, 200);
  const remainingTrips = (await call('/api/planner')).body.trips;
  assert.equal(remainingTrips.length, 1);
  assert.equal(remainingTrips[0].id, secondId);
  assert.equal((await call(`/api/planner/${id}`, 'DELETE')).response.status, 404);
  assert.equal((await call(`/api/planner/${secondId}`, 'DELETE')).response.status, 200);
  assert.equal((await call('/api/planner')).body.trips.length, 0);
  assert.equal((await call('/api/planner', 'POST', { snapshot: {} })).response.status, 400);
});
