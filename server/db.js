'use strict';

/**
 * server/db.js · SQLite 存档
 *
 * 只用 Node 自带的 node:sqlite，不装任何依赖。数据库文件放在项目根的 data/
 * 下，已在 .gitignore 里排除；删掉 data/ 就等于清空所有账号与记录。
 */

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.LA_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'linear-algebra.db');
const db = new DatabaseSync(DB_FILE);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    chapter TEXT NOT NULL,
    tier TEXT,
    correct INTEGER,
    score REAL,
    total REAL,
    mode TEXT,
    duration INTEGER,
    correct_count INTEGER,
    question_count INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL,
    chapter TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, chapter),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts (user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);
`);

// 旧库升级：补上练习/测试的“对几题 / 共几题”两列。
(function migrateAttempts() {
  const columns = db.prepare('PRAGMA table_info(attempts)').all().map(function (row) { return row.name; });
  if (columns.indexOf('correct_count') < 0) db.exec('ALTER TABLE attempts ADD COLUMN correct_count INTEGER');
  if (columns.indexOf('question_count') < 0) db.exec('ALTER TABLE attempts ADD COLUMN question_count INTEGER');
})();

const stmts = {
  insertUser: db.prepare(
    'INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)'
  ),
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT id, username, created_at FROM users WHERE id = ?'),
  userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),

  insertSession: db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ),
  sessionByToken: db.prepare('SELECT * FROM sessions WHERE token = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),

  insertAttempt: db.prepare(
    `INSERT INTO attempts (user_id, kind, chapter, tier, correct, score, total, mode, duration, correct_count, question_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  upsertProgress: db.prepare(
    `INSERT INTO progress (user_id, chapter, status, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, chapter) DO UPDATE SET
       status = CASE WHEN progress.status = 'tested' THEN 'tested' ELSE excluded.status END,
       updated_at = excluded.updated_at`
  ),

  totals: db.prepare(
    `SELECT
       COUNT(*) AS records,
       COALESCE(SUM(CASE WHEN kind != 'visit' THEN 1 ELSE 0 END), 0) AS attempts,
       COALESCE(SUM(COALESCE(question_count, CASE WHEN correct IS NOT NULL THEN 1 ELSE 0 END)), 0) AS graded,
       COALESCE(SUM(COALESCE(correct_count, CASE WHEN correct = 1 THEN 1 ELSE 0 END)), 0) AS correct
     FROM attempts WHERE user_id = ?`
  ),
  byChapter: db.prepare(
    `SELECT chapter,
       COUNT(*) AS attempts,
       COALESCE(SUM(COALESCE(question_count, CASE WHEN correct IS NOT NULL THEN 1 ELSE 0 END)), 0) AS graded,
       COALESCE(SUM(COALESCE(correct_count, CASE WHEN correct = 1 THEN 1 ELSE 0 END)), 0) AS correct
     FROM attempts WHERE user_id = ?
     GROUP BY chapter ORDER BY chapter`
  ),
  scores: db.prepare(
    `SELECT created_at, kind, chapter, score, total
     FROM attempts WHERE user_id = ? AND score IS NOT NULL
     ORDER BY created_at ASC LIMIT 60`
  ),
  progressRows: db.prepare(
    'SELECT chapter, status, updated_at FROM progress WHERE user_id = ? ORDER BY chapter'
  ),
  timeline: db.prepare(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n
     FROM attempts WHERE user_id = ?
     GROUP BY day ORDER BY day DESC LIMIT 14`
  ),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  deleteAllSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  deleteAttempts: db.prepare('DELETE FROM attempts WHERE user_id = ?'),
  deleteProgress: db.prepare('DELETE FROM progress WHERE user_id = ?')
};

module.exports = {
  db,
  DB_FILE,
  stmts
};
