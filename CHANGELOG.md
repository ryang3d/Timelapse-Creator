# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
