const test = require('node:test');
const assert = require('node:assert/strict');

// Use non-default ports so the test never collides with a dev stack
// running on 3001/3002. Must be set before requiring server.js.
process.env.PORT = '3999';
process.env.WS_PORT = '3998';

const { app, wss, cronJob } = require('../server');

test('GET /health returns ok, version, and timestamp', async () => {
  const srv = app.listen(0);
  await new Promise((resolve) => srv.once('listening', resolve));
  const { port } = srv.address();
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.version, 'string');
  assert.ok(body.version.length > 0);
  assert.ok(typeof body.timestamp === 'string');
  srv.close();
  await new Promise((resolve) => wss.close(() => resolve()));
  cronJob.stop();
});
