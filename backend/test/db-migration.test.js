const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Uses the same dev DB path as the rest of the app (backend/data/timelapse.db,
// gitignored). Cleans up before/after so dev state is deterministic.
const DB_PATH = path.join(__dirname, '..', 'data', 'timelapse.db');

function cleanDevDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = DB_PATH + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

// Rebuild the pre-port v1 schema exactly as current main creates it.
function createV1Db() {
  cleanDevDb();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL DEFAULT 'rtsp' CHECK (source_type IN (
        'rtsp',
        'usb_camera',
        'capture_card',
        'http_stream',
        'rtmp_stream',
        'screen_capture',
        'video_file',
        'upload',
        'import',
        'mqtt'
      )),
      source_config TEXT,
      rtsp_url TEXT,
      interval_seconds INTEGER NOT NULL,
      duration_seconds INTEGER,
      use_timer BOOLEAN DEFAULT 0,
      active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      retention_days INTEGER DEFAULT 7
    );
    CREATE TABLE snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      width INTEGER,
      height INTEGER,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE TABLE videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      fps INTEGER NOT NULL,
      format TEXT NOT NULL DEFAULT 'mp4',
      duration_seconds REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    INSERT INTO settings (key, value) VALUES ('db_version', '1');
    INSERT INTO sessions (id, source_type, interval_seconds, rtsp_url)
      VALUES ('legacy-session-1', 'rtsp', 30, 'rtsp://legacy');
  `);
  db.close();
}

test('v1 DB migrates to v3 with frigate_scraper + progress columns, data intact', () => {
  createV1Db();
  const DatabaseManager = require('../db');
  const mgr = new DatabaseManager();
  try {
    const sql = mgr.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).get().sql;
    assert.ok(sql.includes('frigate_scraper'), 'CHECK constraint includes frigate_scraper');

    const cols = mgr.db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
    assert.ok(cols.includes('progress_current'));
    assert.ok(cols.includes('progress_total'));

    const legacy = mgr.db.prepare('SELECT * FROM sessions WHERE id = ?').get('legacy-session-1');
    assert.equal(legacy.source_type, 'rtsp');
    assert.equal(legacy.rtsp_url, 'rtsp://legacy');
    assert.equal(legacy.progress_current, 0);

    const version = mgr.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('db_version').value;
    assert.equal(version, '3');

    // frigate_scraper sessions are now insertable
    mgr.db.prepare(
      "INSERT INTO sessions (id, source_type, interval_seconds) VALUES ('scr-1', 'frigate_scraper', 30)"
    ).run();
    assert.equal(
      mgr.db.prepare('SELECT source_type FROM sessions WHERE id = ?').get('scr-1').source_type,
      'frigate_scraper'
    );
  } finally {
    mgr.db.close();
  }
});

test('fresh DB is created directly at v3 schema', () => {
  cleanDevDb();
  const DatabaseManager = require('../db');
  const mgr = new DatabaseManager();
  try {
    const sql = mgr.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).get().sql;
    assert.ok(sql.includes('frigate_scraper'));
    const cols = mgr.db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
    assert.ok(cols.includes('progress_total'));
    const version = mgr.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('db_version').value;
    assert.equal(version, '3');
  } finally {
    mgr.db.close();
  }
});

test('reopening a v3 DB is a no-op (idempotent migrations)', () => {
  const DatabaseManager = require('../db');
  const mgr = new DatabaseManager(); // reuses the v3 DB left by the previous test
  try {
    const version = mgr.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('db_version').value;
    assert.equal(version, '3');
  } finally {
    mgr.db.close();
  }
});
