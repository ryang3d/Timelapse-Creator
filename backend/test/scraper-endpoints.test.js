const test = require('node:test');
const assert = require('node:assert/strict');
const { startMockFrigate } = require('./helpers/mock-frigate');

// Must be set before requiring server.js (module-level constants).
process.env.PORT = '3997';
process.env.WS_PORT = '3996';

test('scraper endpoints: preview / status-404 / cameras-env-fallback / start-400', async () => {
  const { srv, port } = await startMockFrigate();
  process.env.FRIGATE_API_URL = `http://127.0.0.1:${port}`;

  const { app, wss, cronJob } = require('../server');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. preview: 90 s range at 30 s interval -> 4 frames (inclusive loop)
    let res = await fetch(base + '/api/scraper/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startIso: '2026-01-01T00:00:00.000Z',
        endIso: '2026-01-01T00:01:30.000Z',
        intervalSeconds: 30,
      }),
    });
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.preview.totalFrames, 4);
    assert.equal(body.preview.durationSeconds, 90);

    // 2. status for an unknown session -> 404
    res = await fetch(base + '/api/scraper/status/does-not-exist');
    assert.equal(res.status, 404);

    // 3. cameras with NO query param -> falls back to FRIGATE_API_URL env
    res = await fetch(base + '/api/scraper/cameras');
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.cameras));
    assert.ok(body.cameras.some((c) => c.name === 'front_doorbell'));

    // 4. start with missing fields -> 400
    res = await fetch(base + '/api/scraper/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera: 'cam' }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
    await new Promise((resolve) => wss.close(() => resolve()));
    cronJob.stop();
    await new Promise((resolve) => srv.close(resolve));
  }
});
