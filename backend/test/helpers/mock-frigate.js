const http = require('http');
const fs = require('fs');
const path = require('path');

// Minimal valid 16x16 JPEG (generated with ffmpeg, verified magic 0xFFD8).
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gARTGF2YzU4LjEzNC4xMDAA/9sAQwAIBAQEBAQFBQUFBQUGBgYGBgYGBgYGBgYGBwcHCAgIBwcHBgYHBwgICAgJCQkICAgICQkKCgoMDAsLDg4OEREU/8QATAABAQAAAAAAAAAAAAAAAAAAAAYBAQEAAAAAAAAAAAAAAAAAAAYHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAEAAQAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AiwBRf3//2Q==',
  'base64'
);

// Mock Frigate server for tests:
//  - GET /api/config -> serves backend/test/fixtures/frigate-0.18.json
//    (the fixture our frigate.js tests are already known to parse: 4 cameras,
//     first is front_doorbell)
//  - GET /api/cam/recordings/<ts>/snapshot.jpg -> 200 with TINY_JPEG when ts is
//    odd, 404 when even. The even->odd asymmetry forces the +1s spiral retry
//    path in ScraperService.runScrape to actually execute.
function startMockFrigate({ delayMs = 0 } = {}) {
  const fixture = path.join(__dirname, '..', 'fixtures', 'frigate-0.18.json');
  const fixtureBody = fs.readFileSync(fixture, 'utf8');
  const requested = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/api/config') {
      res.setHeader('Content-Type', 'application/json');
      res.end(fixtureBody);
      return;
    }
    const m = u.pathname.match(/^\/api\/cam\/recordings\/(\d+)\/snapshot\.jpg$/);
    if (m) {
      const ts = parseInt(m[1], 10);
      requested.push(ts);
      const ok = ts % 2 === 1;
      const send = () => {
        if (ok) {
          res.setHeader('Content-Type', 'image/jpeg');
          res.end(TINY_JPEG);
        } else {
          res.statusCode = 404;
          res.end('not found');
        }
      };
      if (delayMs > 0) setTimeout(send, delayMs); else send();
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((resolve) =>
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, requested }))
  );
}

module.exports = { startMockFrigate, TINY_JPEG };
