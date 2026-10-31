// Frigate API client + config parser.
// Compatible with Frigate 0.14 through 0.19-dev.
//
// Discovery strategy, in priority order:
//   1. cameras.<name>.ffmpeg.inputs[]  -> prefer roles containing "record"
//   2. cameras.<name>.rtsp (pre-0.14 legacy direct URL)
//   3. go2rtc.streams.<name>          (top-level, 0.14+; string or array)
//   4. cameras.<name>.go2rtc.streams  (pre-0.14 per-camera)
const http = require('http');
const https = require('https');

// Frigate's clean_camera_user_pass() masks stream-URL userinfo as literal
// asterisks in both 0.18.2 and 0.19-dev: rtsp://user:pass@host -> rtsp://*:*@host
const MASKED_USERINFO = /:\/\/\*:\*@/;

/**
 * Replace 127.0.0.1 / localhost in an RTSP URL with rtspHost.
 * Query strings (?timeout=15 etc.) and fragments are preserved.
 * @param {string} rtspUrl
 * @param {string} rtspHost  e.g. "frigate:8554" or "192.168.1.97"
 */
function replaceRtspHost(rtspUrl, rtspHost) {
  if (!rtspUrl || !rtspHost) return rtspUrl;

  let replacedUrl = rtspUrl;

  // rtsp://127.0.0.1:port/path -> rtsp://<rtspHost>[.origport]/path
  // (Character class matches the original inline implementation; the path
  // capture stops at "?", so URL queries survive after the replaced host.)
  const rtspPattern = /rtsp:\/\/(?:127\.0\.0\.1|localhost)(?::(\d+))?([/][^?\s]*)?/gi;
  replacedUrl = replacedUrl.replace(rtspPattern, (match, port, p) => {
    if (rtspHost.includes(':')) {
      return `rtsp://${rtspHost}${p || ''}`;
    }
    return `rtsp://${rtspHost}${port ? ':' + port : ''}${p || ''}`;
  });

  // Bare 127.0.0.1 / localhost without rtsp:// prefix (go2rtc stream refs).
  replacedUrl = replacedUrl.replace(/127\.0\.0\.1(?::(\d+))?/g, (m, port) => {
    return rtspHost.includes(':') ? rtspHost : port ? `${rtspHost}:${port}` : rtspHost;
  });
  replacedUrl = replacedUrl.replace(/localhost(?::(\d+))?/g, (m, port) => {
    return rtspHost.includes(':') ? rtspHost : port ? `${rtspHost}:${port}` : rtspHost;
  });

  return replacedUrl;
}

/**
 * Pick the best RTSP URL for a camera out of a Frigate resolved config.
 * @returns {string|null} raw URL (before host rewrite)
 */
function pickCameraRtspUrl(name, camera, frigateConfig) {
  const inputs = (camera && camera.ffmpeg && camera.ffmpeg.inputs) || [];
  if (Array.isArray(inputs) && inputs.length > 0) {
    const record = inputs.find(
      (i) => i && Array.isArray(i.roles) && i.roles.includes('record') && i.path
    );
    if (record) return record.path;
    // No record role: fall back to the last input (historically the
    // higher-resolution restream in dual-input setups).
    for (let i = inputs.length - 1; i >= 0; i--) {
      if (inputs[i] && inputs[i].path) return inputs[i].path;
    }
  }

  // Legacy pre-0.14 direct URL.
  if (camera && typeof camera.rtsp === 'string') return camera.rtsp;

  // 0.14+: top-level go2rtc streams; values may be strings or arrays.
  const go2rtcStreams =
    (frigateConfig && frigateConfig.go2rtc && frigateConfig.go2rtc.streams) || {};
  const entries = go2rtcStreams[name];
  if (Array.isArray(entries)) {
    const real = entries.find((s) => typeof s === 'string' && s.startsWith('rtsp://'));
    if (real) return real;
  } else if (typeof entries === 'string' && entries.startsWith('rtsp://')) {
    return entries;
  }

  // Pre-0.14 per-camera go2rtc (strings only).
  const perCam = camera && camera.go2rtc && camera.go2rtc.streams;
  if (perCam) {
    if (typeof perCam.main === 'string') return perCam.main;
    if (typeof perCam.sub === 'string') return perCam.sub;
    const first = Object.values(perCam).find((v) => typeof v === 'string');
    if (first) return first;
  }

  return null;
}

/**
 * Strip Frigate's masked userinfo ("*:*@") from a stream URL.
 * Returns [url, wasMasked].
 */
function stripMaskedCredential(url) {
  if (url && MASKED_USERINFO.test(url)) {
    return [url.replace(MASKED_USERINFO, '://'), true];
  }
  return [url, false];
}

/**
 * Parse a Frigate resolved-config JSON (the GET /api/config body) into the
 * camera list shape the app's API and frontend expect:
 * { name, enabled, rtspUrl, resolution, width, height, authMasked }
 */
function parseFrigateConfig(frigateConfig, { rtspHost = '' } = {}) {
  if (!frigateConfig || typeof frigateConfig.cameras !== 'object') {
    return [];
  }
  const cameras = [];
  for (const [name, camera] of Object.entries(frigateConfig.cameras)) {
    const entry = {
      name,
      enabled: camera.enabled !== false,
      rtspUrl: null,
      width: null,
      height: null,
      resolution: null,
      authMasked: false,
    };

    let rawUrl = pickCameraRtspUrl(name, camera, frigateConfig);
    if (rawUrl) {
      const [unmasked, wasMasked] = stripMaskedCredential(rawUrl);
      entry.authMasked = wasMasked;
      entry.rtspUrl = replaceRtspHost(unmasked, rtspHost);
    }

    // Resolution: prefer explicit record output_args, else detect dims.
    const recordArgs =
      (camera.ffmpeg && camera.ffmpeg.output_args && camera.ffmpeg.output_args.record) || '';
    const wMatch = recordArgs.match(/-width\s+(\d+)/);
    const hMatch = recordArgs.match(/-height\s+(\d+)/);
    if (wMatch) entry.width = parseInt(wMatch[1], 10);
    if (hMatch) entry.height = parseInt(hMatch[1], 10);
    if ((!entry.width || !entry.height) && camera.detect) {
      if (camera.detect.width) entry.width = camera.detect.width;
      if (camera.detect.height) entry.height = camera.detect.height;
    }
    if (entry.width && entry.height) {
      entry.resolution = `${entry.width}x${entry.height}`;
    }

    cameras.push(entry);
  }
  return cameras;
}

/**
 * Fetch and parse cameras from a Frigate instance.
 * @param {string} apiUrl  base URL, e.g. "http://frigate:5000"
 * @param {object} [opts]  { rtspHost = '', token = '' }
 */
function fetchFrigateCameras(apiUrl, { rtspHost = '', token = '' } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(apiUrl);
    } catch (error) {
      return reject(new Error(`Invalid Frigate API URL: ${error.message}`));
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(new Error(`Frigate API URL must be http(s): ${apiUrl}`));
    }
    const client = url.protocol === 'https:' ? https : http;

    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/api/config',
        method: 'GET',
        headers,
        // Self-hosted Frigate public ports (e.g. 8971) commonly serve a
        // self-signed certificate; the internal 5000 path is the default.
        rejectUnauthorized: url.protocol === 'https:' ? false : undefined,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode === 401) {
              return reject(
                new Error(
                  'Frigate API rejected the request (401). If using the public ' +
                    'API port (8971), set FRIGATE_API_TOKEN to a Frigate auth ' +
                    'token; the internal port (5000) needs no token.'
                )
              );
            }
            if (res.statusCode !== 200) {
              return reject(
                new Error(`Frigate API returned status ${res.statusCode}`)
              );
            }
            resolve(parseFrigateConfig(JSON.parse(data), { rtspHost }));
          } catch (parseError) {
            reject(
              new Error(`Failed to parse Frigate config: ${parseError.message}`)
            );
          }
        });
      }
    );

    req.on('error', (error) => {
      reject(new Error(`Failed to connect to Frigate API: ${error.message}`));
    });
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Frigate API request timeout'));
    });
    req.end();
  });
}

module.exports = {
  replaceRtspHost,
  parseFrigateConfig,
  fetchFrigateCameras,
  MASKED_USERINFO,
};
