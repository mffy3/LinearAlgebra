'use strict';

/**
 * server/app.js · 本地后端
 *
 * 只用 Node 自带模块：http / fs / path / url / crypto / node:sqlite。
 * 只监听 127.0.0.1，数据留在本机；同时把静态站点也托管在同一个端口，
 * 这样页面与 /api 同源，登录 cookie 才能生效。
 *
 * 启动：node server/app.js  →  http://127.0.0.1:4173/
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { stmts } = require('./db');
const auth = require('./auth');

const ROOT = path.join(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const VERSION = '1.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const BLOCKED_DIRS = new Set(['server', 'data', '.git', '.github', 'node_modules']);
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 40 };
const rateBuckets = new Map();

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function sendJson(res, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, extraHeaders || {}));
  res.end(body);
}

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      if (!chunks.length) return resolve({});
      try {
        const text = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
        resolve(JSON.parse(text));
      } catch (err) {
        reject(new Error('bad-json'));
      }
    });
    req.on('error', reject);
  });
}

function tooManyRequests(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.reset < now) {
    rateBuckets.set(ip, { count: 1, reset: now + RATE_LIMIT.windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT.max;
}

function sessionOf(req) {
  const cookies = auth.parseCookies(req.headers.cookie);
  const token = cookies[auth.COOKIE_NAME];
  if (!token) return null;
  const row = stmts.sessionByToken.get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    stmts.deleteSession.run(token);
    return null;
  }
  return row;
}

function userOf(req) {
  const session = sessionOf(req);
  if (!session) return null;
  return stmts.userById.get(session.user_id) || null;
}

function isValidChapter(chapter) {
  return typeof chapter === 'string' && /^[a-z0-9-]{1,32}$/i.test(chapter);
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

async function handleRegister(req, res) {
  if (tooManyRequests(req.socket.remoteAddress || 'local')) {
    return sendJson(res, 429, { error: '尝试太频繁，请过几分钟再试。' });
  }

  let body;
  try {
    body = await readBody(req, 16 * 1024);
  } catch (err) {
    return sendJson(res, 400, { error: '请求格式不正确。' });
  }

  const problem = auth.validateCredentials(body.username, body.password);
  if (problem) return sendJson(res, 400, { error: problem });

  const name = String(body.username).trim();
  if (stmts.userByName.get(name)) {
    return sendJson(res, 409, { error: '这个用户名已经被注册了，换一个或直接登录。' });
  }

  const salt = auth.newSalt();
  const hash = auth.hashPassword(body.password, salt);
  const createdAt = new Date().toISOString();
  const result = stmts.insertUser.run(name, hash, salt, createdAt);
  const userId = Number(result.lastInsertRowid);

  const token = auth.newSessionToken();
  stmts.insertSession.run(token, userId, createdAt, auth.sessionExpiry());

  return sendJson(res, 201, {
    user: { id: userId, username: name, created_at: createdAt }
  }, {
    'Set-Cookie': auth.sessionCookie(token, auth.SESSION_DAYS * 24 * 60 * 60)
  });
}

async function handleLogin(req, res) {
  if (tooManyRequests(req.socket.remoteAddress || 'local')) {
    return sendJson(res, 429, { error: '尝试太频繁，请过几分钟再试。' });
  }

  let body;
  try {
    body = await readBody(req, 16 * 1024);
  } catch (err) {
    return sendJson(res, 400, { error: '请求格式不正确。' });
  }

  const name = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!name || !password) return sendJson(res, 400, { error: '请输入用户名和密码。' });

  const user = stmts.userByName.get(name);
  if (!user || !auth.verifyPassword(password, user.salt, user.pass_hash)) {
    return sendJson(res, 401, { error: '用户名或密码不对。' });
  }

  const token = auth.newSessionToken();
  const now = new Date().toISOString();
  stmts.insertSession.run(token, user.id, now, auth.sessionExpiry());

  return sendJson(res, 200, {
    user: { id: user.id, username: user.username, created_at: user.created_at }
  }, {
    'Set-Cookie': auth.sessionCookie(token, auth.SESSION_DAYS * 24 * 60 * 60)
  });
}

function handleLogout(req, res) {
  const session = sessionOf(req);
  if (session) stmts.deleteSession.run(session.token);
  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
}

function handleMe(req, res) {
  const user = userOf(req);
  return sendJson(res, 200, user
    ? { user: { id: user.id, username: user.username, created_at: user.created_at } }
    : { user: null });
}

async function handleEvent(req, res) {
  const user = userOf(req);
  if (!user) return sendJson(res, 401, { error: '需要登录才能记录。' });

  let body;
  try {
    body = await readBody(req, 8 * 1024);
  } catch (err) {
    return sendJson(res, 400, { error: '请求格式不正确。' });
  }

  const kind = body.kind;
  if (kind !== 'quiz' && kind !== 'practice' && kind !== 'test' && kind !== 'visit') {
    return sendJson(res, 400, { error: '未知的记录类型。' });
  }
  if (!isValidChapter(body.chapter)) {
    return sendJson(res, 400, { error: '章节标识不合法。' });
  }

  const correct = body.correct === null || body.correct === undefined
    ? null
    : (body.correct ? 1 : 0);
  const score = Number.isFinite(body.score) ? Number(body.score) : null;
  const total = Number.isFinite(body.total) ? Number(body.total) : null;
  const duration = Number.isFinite(body.duration) ? Math.max(0, Math.round(body.duration)) : null;
  const tier = typeof body.tier === 'string' && /^[a-z]{2,12}$/.test(body.tier) ? body.tier : null;
  const mode = typeof body.mode === 'string' && body.mode.length <= 24 ? body.mode : null;
  const createdAt = new Date().toISOString();

  stmts.insertAttempt.run(
    user.id, kind, body.chapter, tier, correct, score, total, mode, duration, createdAt
  );

  const status = kind === 'test' ? 'tested' : kind === 'practice' ? 'practiced' : 'visited';
  stmts.upsertProgress.run(user.id, body.chapter, status, createdAt);

  return sendJson(res, 201, { ok: true });
}

function handleStats(req, res) {
  const user = userOf(req);
  if (!user) return sendJson(res, 401, { error: '需要登录才能查看。' });

  const totals = stmts.totals.get(user.id);
  const byChapter = stmts.byChapter.all(user.id);
  const scores = stmts.scores.all(user.id);
  const progress = stmts.progressRows.all(user.id);
  const timeline = stmts.timeline.all(user.id).reverse();

  const graded = Number(totals.graded) || 0;
  const correct = Number(totals.correct) || 0;

  return sendJson(res, 200, {
    user: { id: user.id, username: user.username, created_at: user.created_at },
    totals: {
      records: Number(totals.records) || 0,
      attempts: Number(totals.attempts) || 0,
      graded: graded,
      correct: correct,
      accuracy: graded ? correct / graded : null
    },
    byChapter: byChapter.map(function (row) {
      const g = Number(row.graded) || 0;
      return {
        chapter: row.chapter,
        attempts: Number(row.attempts) || 0,
        graded: g,
        correct: Number(row.correct) || 0,
        accuracy: g ? (Number(row.correct) || 0) / g : null
      };
    }),
    scores: scores.map(function (row) {
      return {
        at: row.created_at,
        kind: row.kind,
        chapter: row.chapter,
        score: Number(row.score),
        total: Number(row.total)
      };
    }),
    progress: progress.map(function (row) {
      return { chapter: row.chapter, status: row.status, updatedAt: row.updated_at };
    }),
    timeline: timeline.map(function (row) {
      return { day: row.day, count: Number(row.n) };
    })
  });
}

async function handleDeleteAccount(req, res) {
  const user = userOf(req);
  if (!user) return sendJson(res, 401, { error: '需要登录。' });

  let body;
  try {
    body = await readBody(req, 8 * 1024);
  } catch (err) {
    return sendJson(res, 400, { error: '请求格式不正确。' });
  }

  const full = stmts.userByName.get(user.username);
  if (!full || !auth.verifyPassword(String(body.password || ''), full.salt, full.pass_hash)) {
    return sendJson(res, 403, { error: '密码不对，数据没有删除。' });
  }

  stmts.deleteAllSessions.run(user.id);
  stmts.deleteAttempts.run(user.id);
  stmts.deleteProgress.run(user.id);
  stmts.deleteUser.run(user.id);

  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
}

/* ------------------------------------------------------------------ *
 * 静态文件
 * ------------------------------------------------------------------ */

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (err) {
    return sendJson(res, 400, { error: '路径不合法。' });
  }

  const relative = decoded.replace(/^\/+/, '');
  const first = relative.split('/')[0];
  if (BLOCKED_DIRS.has(first) || relative.split('/').some(function (p) { return p.startsWith('.'); })) {
    return sendJson(res, 404, { error: 'not found' });
  }

  let filePath = path.resolve(ROOT, relative || 'index.html');
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return sendJson(res, 403, { error: 'forbidden' });
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return sendJson(res, 404, { error: 'not found' });
  }

  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    try {
      stat = fs.statSync(filePath);
    } catch (err) {
      return sendJson(res, 404, { error: 'not found' });
    }
  }

  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });

  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

const server = http.createServer(function (req, res) {
  const parsed = new URL(req.url, 'http://' + HOST + ':' + PORT);
  const pathname = parsed.pathname;

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'method not allowed' });
    }
    return serveStatic(req, res, pathname);
  }

  const route = req.method + ' ' + pathname;

  Promise.resolve().then(function () {
    switch (route) {
      case 'GET /api/health':
        return sendJson(res, 200, { ok: true, version: VERSION, auth: true });
      case 'GET /api/me':
        return handleMe(req, res);
      case 'POST /api/register':
        return handleRegister(req, res);
      case 'POST /api/login':
        return handleLogin(req, res);
      case 'POST /api/logout':
        return handleLogout(req, res);
      case 'POST /api/events':
        return handleEvent(req, res);
      case 'GET /api/stats':
        return handleStats(req, res);
      case 'POST /api/account/delete':
        return handleDeleteAccount(req, res);
      default:
        return sendJson(res, 404, { error: 'not found' });
    }
  }).catch(function (err) {
    console.error('[api]', err);
    if (!res.headersSent) sendJson(res, 500, { error: '服务器出错了。' });
  });
});

server.listen(PORT, HOST, function () {
  stmts.deleteExpiredSessions.run(new Date().toISOString());
  console.log('');
  console.log('  Linear Algebra · 本地服务已启动');
  console.log('  http://' + HOST + ':' + PORT + '/');
  console.log('');
  console.log('  数据保存在 data/linear-algebra.db，只在本机。');
  console.log('  按 Ctrl+C 停止服务。');
  console.log('');

  if (process.argv.indexOf('--open') >= 0) {
    const opener = process.platform === 'win32'
      ? 'start "" "http://' + HOST + ':' + PORT + '/"'
      : (process.platform === 'darwin' ? 'open' : 'xdg-open') + ' "http://' + HOST + ':' + PORT + '/"';
    require('node:child_process').exec(opener, function () { });
  }
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用：可能服务已经在运行，或换一个端口：');
    console.error('  set PORT=4174 && node server/app.js');
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
