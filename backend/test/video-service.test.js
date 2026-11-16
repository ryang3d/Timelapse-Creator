const test = require('node:test');
const assert = require('node:assert/strict');

test('getBestCodec returns a known encoder with option arrays', () => {
  const VideoService = require('../videoService');
  const vs = new VideoService();
  const c = vs.getBestCodec();
  assert.ok(['h264_vaapi', 'libx264'].includes(c.encoder), `unexpected encoder ${c.encoder}`);
  assert.ok(Array.isArray(c.inputOptions));
  assert.ok(Array.isArray(c.outputOptions));
  assert.ok(c.type === 'hardware' || c.type === 'software');
});

test('VAAPI output options do not use -preset (h264_vaapi rejects it)', () => {
  const VideoService = require('../videoService');
  const c = new VideoService().getBestCodec();
  if (c.encoder === 'h264_vaapi') {
    assert.ok(!c.outputOptions.includes('-preset'), 'h264_vaapi outputOptions must not contain -preset');
  }
});

test('getCudaCodec is unchanged (NVENC for non-scraper sessions)', () => {
  const VideoService = require('../videoService');
  const c = new VideoService().getCudaCodec();
  assert.equal(c.encoder, 'h264_nvenc');
  assert.deepEqual(c.inputOptions, ['-hwaccel', 'cuda']);
});
