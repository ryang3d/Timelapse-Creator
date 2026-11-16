# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-11-15

### Added

- **Frigate Historical Scraper** - build timelapses from Frigate NVR
  recordings: pick a camera, time range, and interval; frames are fetched
  from Frigate's recordings API (with fuzzy +/-N s retry when an exact
  timestamp misses), a progress bar tracks the scrape in real time, and the
  timelapse video renders automatically when the scrape completes.
  Ported from @nm3210's fork (nm3210/Timelapse-Creator, issue #1) with bug
  fixes; thanks to nm3210 for the original implementation and commits.
- Same-origin WebSocket at `/ws` (proxied by the frontend nginx), so the
  whole app works through a single published port (3011).
- Scraper renders use Intel VAAPI hardware encoding when available
  (`/dev/dri/renderD128` + `h264_vaapi`), with an automatic software
  (libx264) fallback on failure.
- Per-session progress tracking in the database
  (`progress_current` / `progress_total`, database schema v3).

### Changed

- Frontend WebSocket default is now same-origin `/ws`;
  `REACT_APP_WS_URL` still overrides it for advanced setups.
- Backend exposes `/output` as an alias of `/videos` (used by the scraper
  status API).
- Database auto-migrates v1 -> v3 on next start; existing sessions and
  files are preserved.
- Scraper sessions render to a stable `<sessionId>.mp4` filename; other
  sessions keep unique `timelapse-<...>` filenames.

## [Unreleased]

## [1.0.0] - 2026-11-07

### Added

- Capture from RTSP, HTTP, RTMP, USB camera, capture card, and screen sources
  with real-time WebSocket preview
- Photo upload, video upload with frame extraction, and network path import
- MQTT-triggered capture (1-to-0 transitions)
- Frigate camera discovery (0.14+, verified against 0.18.x and 0.19-dev)
- MP4 (optional NVIDIA NVENC) and GIF timelapse generation
- Session management, storage quotas, and hourly automatic cleanup
- Official versioned Docker images on GHCR
  (`ghcr.io/ryang3d/timelapse-creator-backend`, `ghcr.io/ryang3d/timelapse-creator-frontend`)
- CI (backend tests + frontend build) and tag-driven multi-arch release pipeline
- `/health` endpoint reporting the running version
