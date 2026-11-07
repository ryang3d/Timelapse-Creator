# Contributing to Timelapse Creator

Thanks for helping. The bar for a mergeable PR is small: tests pass, it works
in Docker, and the docs match reality.

## Prerequisites

- Node.js 18+ and npm
- Docker with the Compose plugin

## Repository layout

- `backend/` — Express API + WebSocket server
  - `server.js` — all routes, capture logic, FFmpeg jobs (large; keep new
    behavior in small, named functions)
  - `frigate.js` — Frigate camera discovery (pure functions, well tested)
  - `db.js` — SQLite (better-sqlite3) schema and migrations
  - `test/` — node:test suites, fixtures in `test/fixtures/`
- `frontend/` — React (CRA) + Tailwind; single-page app in `src/App.js`,
  served by nginx in production
- `docker-compose.yml` — the end-user deployment file (keep it runnable on a
  clean machine: no external networks, no host-specific paths)
- `docker-compose.advanced.yml` — optional hardware / Frigate-network overrides

## Development loop

Backend:

    cd backend
    npm install
    npm run dev        # nodemon on :3001 (API) and :3002 (WS)

Frontend:

    cd frontend
    npm install
    echo 'REACT_APP_API_URL=http://localhost:3001' > .env.local
    npm start          # CRA dev server on :3000

## Tests

    cd backend && npm test

Backend tests use the built-in `node:test` runner against fixture files in
`backend/test/fixtures/`. Tests must not require a running Frigate, camera,
or database: set `PORT`/`WS_PORT` to unused values before `require('../server')`
and close the handles you open (see `test/health.test.js`).

## Container build / smoke test

    docker compose up -d --build
    curl -s localhost:3001/health     # {"status":"ok","version":"dev",...}
    curl -sI localhost:3011           # HTTP/1.1 200

## Commit and PR guidelines

- Small, single-purpose commits with imperative subjects
  (`feat:`, `fix:`, `docs:`, `chore:` prefixes are fine but not required).
- PRs: link the issue if there is one, say what changed and why, include
  test output or a Docker smoke test result for user-facing changes.
- If you change user-facing configuration (env vars, ports, files), update
  `README.md` and `.env.example` in the same PR, and add a line under
  `[Unreleased]` in `CHANGELOG.md`.
- Style: follow the existing code (2-space indent, semicolons, single quotes).
  No new runtime dependencies without saying so in the PR description.

## Versioning

Releases are SemVer git tags on `main` (`vX.Y.Z`), built and published to GHCR
by `.github/workflows/release.yml`. `patch` for fixes, `minor` for features,
`major` for breaking changes (port changes, data layout changes).
