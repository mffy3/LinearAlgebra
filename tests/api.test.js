'use strict';

/**
 * tests/api.test.js · 本地后端接口自检
 *
 * 启动一个临时数据目录的服务实例，跑完整的注册 / 登录 / 记录 / 统计 / 删除流程。
 * 运行：node tests/api.test.js
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const PORT = 4181;
const BASE = 'http://127.0.0.1:' + PORT;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'la-api-test-'));
const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function ok(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(function () {
      passed += 1;
      console.log('  ✓ ' + name);
    })
    .catch(function (error) {
      failed += 1;
      console.error('  ✗ ' + name);
      console.error('    ' + error.message);
    });
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function waitForServer(child) {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error('server exited early');
    try {
      const res = await fetch(BASE + '/api/health');
      if (res.ok) return;
    } catch (error) {
      // 还没起来
    }
    await sleep(100);
  }
  throw new Error('server did not start');
}

function jar() {
  return { cookie: '' };
}

async function call(state, method, url, body) {
  const headers = {};
  if (state.cookie) headers.Cookie = state.cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(BASE + url, {
    method: method,
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (setCookie.length) {
    state.cookie = setCookie[0].split(';')[0];
  }

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (error) { data = text; }
  return { status: res.status, data: data };
}

async function main() {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT), LA_DATA_DIR: DATA_DIR }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', function (chunk) { stderr += chunk.toString(); });

  try {
    await waitForServer(child);

    const a = jar();
    const b = jar();

    await ok('健康检查', async function () {
      const res = await call(a, 'GET', '/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.data.ok, true);
    });

    await ok('注册新用户并返回 cookie', async function () {
      const res = await call(a, 'POST', '/api/register', { username: 'tester', password: 'pass12345' });
      assert.equal(res.status, 201);
      assert.equal(res.data.user.username, 'tester');
      assert.ok(a.cookie.startsWith('la_session='));
    });

    await ok('重复用户名被拒绝', async function () {
      const res = await call(b, 'POST', '/api/register', { username: 'tester', password: 'pass12345' });
      assert.equal(res.status, 409);
    });

    await ok('弱密码被拒绝', async function () {
      const res = await call(b, 'POST', '/api/register', { username: 'weak', password: 'short' });
      assert.equal(res.status, 400);
    });

    await ok('未登录时 /api/me 返回 null', async function () {
      const res = await call(b, 'GET', '/api/me');
      assert.equal(res.status, 200);
      assert.equal(res.data.user, null);
    });

    await ok('登录后 /api/me 返回用户', async function () {
      const res = await call(a, 'GET', '/api/me');
      assert.equal(res.data.user.username, 'tester');
    });

    await ok('错误密码登录失败', async function () {
      const res = await call(b, 'POST', '/api/login', { username: 'tester', password: 'wrongpass1' });
      assert.equal(res.status, 401);
    });

    await ok('记录答题与测试', async function () {
      const q1 = await call(a, 'POST', '/api/events', { kind: 'quiz', chapter: '00-vectors', correct: true });
      const q2 = await call(a, 'POST', '/api/events', { kind: 'quiz', chapter: '00-vectors', correct: false });
      const t1 = await call(a, 'POST', '/api/events', {
        kind: 'test', chapter: '01-transform', score: 180, total: 200, mode: 'timed', duration: 5400
      });
      assert.equal(q1.status, 201);
      assert.equal(q2.status, 201);
      assert.equal(t1.status, 201);
    });

    await ok('非法记录被拒绝', async function () {
      const res = await call(a, 'POST', '/api/events', { kind: 'whatever', chapter: '00-vectors' });
      assert.equal(res.status, 400);
    });

    await ok('统计正确聚合', async function () {
      const res = await call(a, 'GET', '/api/stats');
      assert.equal(res.status, 200);
      assert.equal(res.data.totals.attempts, 3);
      assert.equal(res.data.totals.graded, 2);
      assert.equal(res.data.totals.correct, 1);
      assert.equal(res.data.totals.accuracy, 0.5);
      assert.deepEqual(res.data.progress.map(function (p) { return p.chapter; }), ['00-vectors', '01-transform']);
      assert.equal(res.data.scores.length, 1);
      assert.equal(res.data.scores[0].score, 180);
    });

    await ok('未登录时统计被拒绝', async function () {
      const res = await call(b, 'GET', '/api/stats');
      assert.equal(res.status, 401);
    });

    await ok('退出登录后会话失效', async function () {
      const out = await call(a, 'POST', '/api/logout');
      assert.equal(out.status, 200);
      const me = await call(a, 'GET', '/api/me');
      assert.equal(me.data.user, null);
    });

    await ok('重新登录并删除账号', async function () {
      await call(a, 'POST', '/api/login', { username: 'tester', password: 'pass12345' });
      const wrong = await call(a, 'POST', '/api/account/delete', { password: 'nope-nope' });
      assert.equal(wrong.status, 403);
      const res = await call(a, 'POST', '/api/account/delete', { password: 'pass12345' });
      assert.equal(res.status, 200);
      const me = await call(a, 'GET', '/api/me');
      assert.equal(me.data.user, null);
    });

    await ok('静态页面可访问且拒绝越界路径', async function () {
      const page = await fetch(BASE + '/pages/00-vectors.html');
      assert.equal(page.status, 200);
      const db = await fetch(BASE + '/data/linear-algebra.db');
      assert.equal(db.status, 404);
      const escape = await fetch(BASE + '/..%2F..%2FWindows%2Fwin.ini');
      assert.notEqual(escape.status, 200);
    });
  } finally {
    child.kill();
    await sleep(200);
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (error) { /* ignore */ }
    if (stderr.trim()) console.error(stderr.trim());
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exitCode = 1;
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
