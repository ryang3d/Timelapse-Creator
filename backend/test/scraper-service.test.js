const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startMockFrigate } = require('./helpers/mock-frigate');

function cleanupDb(tmpDb) {
  for (const s of ['', '-wal', '-shm']) {
    const p = tmpDb + s;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

test('runScrape downloads frames with spiral retry, records progress, completes session', async () => {
  const DatabaseManager = require('../db');
  const ScraperService = require('../scraperService');

  const tmpDb = path.join(os.tmpdir(), `tlc-scr-test-${process.pid}-${Date.now()}.db`);
  const tmpSnap = fs.mkdtempSync(path.join(os.tmpdir(), 'tlc-scr-snap-'));
  const { srv, port, requested } = await startMockFrigate();
  const events = [];
  let generatedFor = null;

  const mgr = new DatabaseManager(tmpDb);
  mgr.createSession({ id: 'scr-test-1', source_type: 'frigate_scraper', interval_seconds: 5 });

  const svc = new ScraperService(mgr, tmpSnap, (m) => events.push(m), (sid) => { generatedFor = sid; });

  try {
    await svc.runScrape({
      sessionId: 'scr-test-1',
      camera: 'cam',
      startIso: '2026-01-01T00:00:00.000Z',
      endIso: '2026-01-01T00:00:55.000Z',
      intervalSeconds: 5,
      frigateApiUrl: `http://127.0.0.1:${port}`,
      timezone: 'UTC',
    });

    // 12 frames at t=0,5,...,55 (unix 1735689600..1735689655)
    const files = fs.readdirSync(path.join(tmpSnap, 'scr-test-1'))
      .filter((f) => f.endsWith('.jpg'))
      .sort();
    assert.deepEqual(
      files,
      Array.from({ length: 12 }, (_, i) => `frame_${String(i + 1).padStart(4, '0')}.jpg`)
    );

    // Spiral search actually happened: even timestamps 404 at the exact second
    // and the +1s odd timestamp was requested instead.
    const baseTs = Date.UTC(2026, 0, 1, 0, 0, 0) / 1000; // 1735689600, even
    assert.ok(requested.includes(baseTs + 1), 'spiral +1 retry requested for 404 timestamp');

    const snaps = mgr.db
      .prepare('SELECT * FROM snapshots WHERE session_id = ? ORDER BY id')
      .all('scr-test-1');
    assert.equal(snaps.length, 12);

    const session = mgr.getSession('scr-test-1');
    assert.equal(session.active, false);
    assert.ok(session.completed_at);
    assert.equal(session.progress_total, 12);

    assert.ok(events.some((e) => e.type === 'snapshot' && e.progress), 'progress broadcast emitted');
    assert.equal(generatedFor, 'scr-test-1');
  } finally {
    mgr.db.close();
    await new Promise((r) => srv.close(r));
    fs.rmSync(tmpSnap, { recursive: true, force: true });
    cleanupDb(tmpDb);
  }
});

test('stopScrape halts an active scrape and marks the session inactive', async () => {
  const DatabaseManager = require('../db');
  const ScraperService = require('../scraperService');

  const tmpDb = path.join(os.tmpdir(), `tlc-scr-stop-${process.pid}-${Date.now()}.db`);
  const tmpSnap = fs.mkdtempSync(path.join(os.tmpdir(), 'tlc-scr-stop-snap-'));
  // 300 ms per snapshot so the first batch takes ~300 ms and we can stop
  // mid-run deterministically.
  const { srv, port } = await startMockFrigate({ delayMs: 300 });

  const mgr = new DatabaseManager(tmpDb);
  mgr.createSession({ id: 'scr-stop-1', source_type: 'frigate_scraper', interval_seconds: 5 });
  const svc = new ScraperService(mgr, tmpSnap, () => {}, null);

  try {
    // 41 frames: t=0,5,...,200
    const runP = svc.runScrape({
      sessionId: 'scr-stop-1',
      camera: 'cam',
      startIso: '2026-01-01T00:00:00.000Z',
      endIso: '2026-01-01T00:03:20.000Z',
      intervalSeconds: 5,
      frigateApiUrl: `http://127.0.0.1:${port}`,
      timezone: 'UTC',
    });

    // Wait until the first batch (10 frames) has landed, then stop.
    const deadline = Date.now() + 20000;
    let count = 0;
    while (Date.now() < deadline) {
      count = fs.readdirSync(path.join(tmpSnap, 'scr-stop-1'))
        .filter((f) => f.endsWith('.jpg')).length;
      if (count >= 10) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(count >= 10, `expected >=10 frames before stop, got ${count}`);

    assert.equal(svc.stopScrape('scr-stop-1'), true);
    await runP;

    const finalCount = fs.readdirSync(path.join(tmpSnap, 'scr-stop-1'))
      .filter((f) => f.endsWith('.jpg')).length;
    assert.ok(finalCount < 41, `expected <41 frames after stop, got ${finalCount}`);
    assert.equal(mgr.getSession('scr-stop-1').active, false);
  } finally {
    mgr.db.close();
    await new Promise((r) => srv.close(r));
    fs.rmSync(tmpSnap, { recursive: true, force: true });
    cleanupDb(tmpDb);
  }
});

test('calculatePreview matches the inclusive runScrape loop', () => {
  const ScraperService = require('../scraperService');
  const svc = new ScraperService(null, null, () => {}, null);
  // 900 s range at 30 s: frames at t=0,30,...,900 -> 31 frames (his ceil() says 30).
  const p = svc.calculatePreview('2026-01-01T00:00:00.000Z', '2026-01-01T00:15:00.000Z', 30);
  assert.equal(p.totalFrames, 31);
  assert.equal(p.durationSeconds, 900);
  assert.equal(p.estimatedVideoDuration, 1); // round(31/30)
});

test('getFrigateCameras uses the shared Frigate client', async () => {
  const ScraperService = require('../scraperService');
  const { srv, port } = await startMockFrigate();
  const svc = new ScraperService(null, null, () => {}, null);
  try {
    const cams = await svc.getFrigateCameras(`http://127.0.0.1:${port}`);
    assert.equal(cams.length, 4); // fixture has 4 cameras
    assert.ok(cams.every((c) => typeof c.name === 'string' && typeof c.enabled === 'boolean'));
    assert.ok(cams.some((c) => c.name === 'front_doorbell'));
  } finally {
    await new Promise((r) => srv.close(r));
  }
});
