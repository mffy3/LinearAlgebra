'use strict';

/**
 * tests/local-account.test.js · 本机账号（不依赖本地服务）
 *
 * 运行：node tests/local-account.test.js
 * 用内存里的 localStorage 模拟浏览器，验证注册 / 登录 / 记录 / 统计 / 装饰 / 删除。
 */

const assert = require('node:assert');
const store = new Map();

global.window = global;
global.localStorage = {
  getItem: function (key) { return store.has(key) ? store.get(key) : null; },
  setItem: function (key, value) { store.set(String(key), String(value)); },
  removeItem: function (key) { store.delete(key); }
};

require('../js/lib/local-account.js');
const Local = global.LocalAccount;

let passed = 0;
let failed = 0;

async function ok(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (error) {
    failed += 1;
    console.error('  ✗ ' + name);
    console.error('    ' + error.message);
  }
}

(async function main() {
  await ok('本机账号可用', function () {
    assert.equal(Local.available(), true);
    assert.equal(Local.currentUser(), null);
  });

  await ok('注册并自动登录', async function () {
    const user = await Local.register('小明', 'password123');
    assert.equal(user.username, '小明');
    assert.equal(user.local, true);
    assert.equal(Local.currentUser().username, '小明');
  });

  await ok('重复用户名被拒绝', async function () {
    await assert.rejects(Local.register('小明', 'password456'), /已经注册/);
  });

  await ok('弱密码被拒绝', async function () {
    await assert.rejects(Local.register('alice', '1234567'), /8–128/);
  });

  await ok('密码错误被拒绝', async function () {
    await assert.rejects(Local.login('小明', 'wrongpass'), /密码不对/);
  });

  await ok('退出后重新登录', async function () {
    await Local.logout();
    assert.equal(Local.currentUser(), null);
    const user = await Local.login('小明', 'password123');
    assert.equal(user.username, '小明');
    assert.equal(Local.currentUser().username, '小明');
  });

  await ok('记录访问、答题、练习与测试', async function () {
    await Local.record({ kind: 'visit', chapter: '00-vectors' });
    await Local.record({ kind: 'quiz', chapter: '00-vectors', correct: true });
    await Local.record({ kind: 'quiz', chapter: '00-vectors', correct: false });
    await Local.record({ kind: 'practice', chapter: '00-vectors', tier: 'easy', score: 84, total: 100, correctCount: 14, questionCount: 17 });
    await Local.record({ kind: 'test', chapter: '01-transform', score: 168, total: 200, correctCount: 19, questionCount: 23 });
  });

  await ok('统计口径与后端一致', async function () {
    const stats = await Local.stats();
    assert.equal(stats.totals.attempts, 4);
    assert.equal(stats.totals.graded, 1 + 1 + 17 + 23);
    assert.equal(stats.totals.correct, 1 + 0 + 14 + 19);
    assert.equal(Math.round(stats.totals.accuracy * 1000) / 1000, Math.round((34 / 42) * 1000) / 1000);
    assert.equal(stats.scores.length, 2);
    const progress = {};
    stats.progress.forEach(function (row) { progress[row.chapter] = row.status; });
    assert.equal(progress['00-vectors'], 'practiced');
    assert.equal(progress['01-transform'], 'tested');
    assert.equal(stats.timeline.length, 14);
  });

  await ok('路线图装饰按账号保存', async function () {
    await Local.putDecor([{ kind: 'cat', x: 100, y: 200 }, { kind: 'house', x: 300, y: 400 }]);
    const payload = await Local.getDecor();
    assert.equal(payload.items.length, 2);
    assert.equal(payload.items[0].kind, 'cat');
  });

  await ok('删除账号会清掉记录与装饰', async function () {
    await assert.rejects(Local.deleteAccount('wrongpass'), /密码不对/);
    const result = await Local.deleteAccount('password123');
    assert.equal(result.ok, true);
    assert.equal(Local.currentUser(), null);
    await assert.rejects(Local.stats(), /offline/);
    const payload = await Local.getDecor();
    assert.equal(payload.items.length, 0);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exitCode = 1;
})();
