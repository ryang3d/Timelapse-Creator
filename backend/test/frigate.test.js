const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  replaceRtspHost,
  parseFrigateConfig,
} = require('../frigate');

const FIX = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

test('replaceRtspHost: rewrites restream host, preserves query', () => {
  assert.equal(
    replaceRtspHost('rtsp://127.0.0.1:8554/driveway-2?timeout=15', 'frigate:8554'),
    'rtsp://frigate:8554/driveway-2?timeout=15'
  );
});

test('replaceRtspHost: localhost variant', () => {
  assert.equal(
    replaceRtspHost('rtsp://localhost:8554/cam1', 'frigate:8554'),
    'rtsp://frigate:8554/cam1'
  );
});

test('replaceRtspHost: preserves original port when rtspHost has no port', () => {
  assert.equal(
    replaceRtspHost('rtsp://127.0.0.1:9554/cam1', '192.168.1.97'),
    'rtsp://192.168.1.97:9554/cam1'
  );
});

test('replaceRtspHost: no-op for foreign hosts or empty rtspHost', () => {
  assert.equal(replaceRtspHost('rtsp://192.168.1.154:8554/360p', 'frigate:8554'),
    'rtsp://192.168.1.154:8554/360p');
  assert.equal(replaceRtspHost('rtsp://127.0.0.1:8554/cam1', ''),
    'rtsp://127.0.0.1:8554/cam1');
});

test('0.18 fixture: parses all cameras, picks record-role restreams', () => {
  const cfg = FIX('frigate-0.18.json');
  const cams = parseFrigateConfig(cfg, { rtspHost: 'frigate:8554' });
  assert.equal(cams.length, 4);
  const byName = Object.fromEntries(cams.map((c) => [c.name, c]));

  assert.equal(byName.front_doorbell.rtspUrl, 'rtsp://frigate:8554/front_doorbell');
  assert.equal(byName.front_doorbell.resolution, '720x576');
  assert.equal(byName.front_doorbell.enabled, true);

  // front_yard has a record-role restream + a detect direct stream
  assert.equal(byName.front_yard.rtspUrl, 'rtsp://frigate:8554/front_yard');

  // driveway-2: query string must survive the host rewrite
  assert.equal(byName['driveway-2'].rtspUrl, 'rtsp://frigate:8554/driveway-2?timeout=15');
});

test('0.18 fixture: resolution falls back to detect.width/height', () => {
  const cfg = FIX('frigate-0.18.json');
  const cams = parseFrigateConfig(cfg, { rtspHost: 'frigate:8554' });
  const byName = Object.fromEntries(cams.map((c) => [c.name, c]));
  assert.equal(byName.front_yard.width, 640);
  assert.equal(byName.front_yard.height, 360);
  assert.equal(byName.front_yard.resolution, '640x360');
});

test('0.19-dev fixture: strips masked credentials and flags authMasked', () => {
  const cfg = FIX('frigate-0.19-dev.json');
  const cams = parseFrigateConfig(cfg, { rtspHost: 'frigate:8554' });
  const byName = Object.fromEntries(cams.map((c) => [c.name, c]));

  assert.equal(byName.cam_masked.authMasked, true);
  assert.equal(
    byName.cam_masked.rtspUrl,
    'rtsp://192.168.1.50:554/stream1'
  );
  assert.ok(!byName.cam_masked.rtspUrl.includes('*:*@'));
});

test('0.19-dev fixture: disabled camera keeps enabled=false', () => {
  const cfg = FIX('frigate-0.19-dev.json');
  const cams = parseFrigateConfig(cfg, { rtspHost: 'frigate:8554' });
  const cam = cams.find((c) => c.name === 'cam_disabled');
  assert.equal(cam.enabled, false);
  assert.equal(cam.rtspUrl, 'rtsp://frigate:8554/cam_disabled');
});

test('0.19-dev fixture: falls back to top-level go2rtc stream array', () => {
  const cfg = FIX('frigate-0.19-dev.json');
  const cams = parseFrigateConfig(cfg, { rtspHost: 'frigate:8554' });
  const cam = cams.find((c) => c.name === 'cam_go2rtc_only');
  // first array entry is the real RTSP URL; the ffmpeg: entry is ignored
  assert.equal(
    cam.rtspUrl,
    'rtsp://192.168.1.60:554/cam?channel=1&subtype=0#timeout=30#backchannel=0'
  );
});

test('0.19-dev fixture: profile-merged camera keeps its input path and query', () => {
  const cfg = FIX('frigate-0.19-dev.json');
  const cams = parseFrigateConfig(cfg, { rtspHost: 'frigate:8554' });
  const cam = cams.find((c) => c.name === 'cam_profile');
  assert.equal(cam.rtspUrl, 'rtsp://frigate:8554/cam_profile?timeout=20');
  // resolution comes from the merged (top-level) detect, not the profile override
  assert.equal(cam.resolution, '1280x720');
});

test('parseFrigateConfig: empty/absent cameras yields []', () => {
  assert.deepEqual(parseFrigateConfig({}, { rtspHost: 'frigate:8554' }), []);
  assert.deepEqual(parseFrigateConfig(null, { rtspHost: 'frigate:8554' }), []);
});
