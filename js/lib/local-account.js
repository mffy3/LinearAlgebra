/**
 * local-account.js · 本机账号（不依赖本地服务）
 *
 * 当页面直接打开（file://）或部署在纯静态托管上时，没有 /api 可用。
 * 这个模块用浏览器的 localStorage 提供一套等价的账号能力：
 *   - 注册 / 登录 / 退出（密码用 WebCrypto PBKDF2-SHA256 加盐哈希，明文不落盘）
 *   - 记录访问、答题、练习与测试
 *   - 统计（与 /api/stats 同结构）
 *   - 路线图装饰
 *
 * 限制：账号只存在当前浏览器；清除站点数据会一起丢失；不跨设备同步。
 */
(function (global) {
  'use strict';

  if (!global) return;

  var ITERATIONS = 210000;
  var KEYS = {
    users: 'la-local-users-v1',
    events: 'la-local-events-v1',
    decor: 'la-local-decor-v1',
    session: 'la-local-session-v1'
  };
  var MAX_EVENTS = 5000;
  var failed = {};

  function read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      throw new Error('浏览器不允许本地存储，换一个浏览器或打开站点数据权限。');
    }
  }

  function available() {
    try {
      if (!global.localStorage || !global.crypto || !global.crypto.subtle || !global.TextEncoder) return false;
      var probe = '__la_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (error) {
      return false;
    }
  }

  function toBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return global.btoa(binary);
  }

  function fromBase64(text) {
    var binary = global.atob(text);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomSalt() {
    var bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    return toBase64(bytes);
  }

  function derive(password, salt) {
    var encoder = new global.TextEncoder();
    return global.crypto.subtle.importKey(
      'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
    ).then(function (key) {
      return global.crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: fromBase64(salt),
        iterations: ITERATIONS,
        hash: 'SHA-256'
      }, key, 256);
    }).then(function (bits) {
      return toBase64(new Uint8Array(bits));
    });
  }

  function equal(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function normalize(name) {
    return String(name || '').trim().toLowerCase();
  }

  function validate(username, password) {
    var name = String(username || '').trim();
    if (!/^[A-Za-z0-9_\u4e00-\u9fa5-]{2,24}$/.test(name)) {
      return '用户名只能是 2–24 个字母、数字、下划线、连字符或汉字。';
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return '密码长度需要在 8–128 个字符之间。';
    }
    return null;
  }

  function users() {
    return read(KEYS.users, {});
  }

  function publicUser(row) {
    return { username: row.username, created_at: row.created_at, local: true };
  }

  function currentUser() {
    var key = read(KEYS.session, null);
    if (!key) return null;
    var row = users()[key];
    return row ? publicUser(row) : null;
  }

  function register(username, password) {
    var problem = validate(username, password);
    if (problem) return Promise.reject(new Error(problem));

    var key = normalize(username);
    var table = users();
    if (table[key]) return Promise.reject(new Error('这个用户名已经注册过了，直接登录吧。'));

    var salt = randomSalt();
    return derive(password, salt).then(function (hash) {
      table[key] = {
        username: String(username).trim(),
        salt: salt,
        hash: hash,
        iterations: ITERATIONS,
        created_at: new Date().toISOString()
      };
      write(KEYS.users, table);
      write(KEYS.session, key);
      return publicUser(table[key]);
    });
  }

  function login(username, password) {
    var key = normalize(username);
    var table = users();
    var row = table[key];
    if (!row) return Promise.reject(new Error('没有找到这个本机账号，先注册一个吧。'));

    var attempts = failed[key] || 0;
    if (attempts >= 5) {
      return Promise.reject(new Error('试错次数有点多，等 10 秒再试。'));
    }

    return derive(password, row.salt).then(function (hash) {
      if (!equal(hash, row.hash)) {
        failed[key] = attempts + 1;
        global.setTimeout(function () { failed[key] = 0; }, 10000);
        throw new Error('密码不对。');
      }
      failed[key] = 0;
      write(KEYS.session, key);
      return publicUser(row);
    });
  }

  function logout() {
    try {
      global.localStorage.removeItem(KEYS.session);
    } catch (error) { /* 忽略 */ }
    return Promise.resolve();
  }

  function record(event) {
    var user = currentUser();
    if (!user || !event) return Promise.resolve(null);

    var list = read(KEYS.events, []);
    list.push({
      username: normalize(user.username),
      kind: event.kind || 'visit',
      chapter: event.chapter || '',
      tier: event.tier || null,
      correct: event.correct === undefined || event.correct === null ? null : (event.correct ? 1 : 0),
      score: Number.isFinite(event.score) ? Number(event.score) : null,
      total: Number.isFinite(event.total) ? Number(event.total) : null,
      mode: event.mode || null,
      duration: Number.isFinite(event.duration) ? Number(event.duration) : null,
      correctCount: Number.isFinite(event.correctCount) ? Number(event.correctCount) : null,
      questionCount: Number.isFinite(event.questionCount) ? Number(event.questionCount) : null,
      at: new Date().toISOString()
    });
    if (list.length > MAX_EVENTS) list = list.slice(list.length - MAX_EVENTS);
    write(KEYS.events, list);
    return Promise.resolve({ ok: true });
  }

  function rank(status) {
    return { visited: 1, practiced: 2, tested: 3 }[status] || 0;
  }

  function dayKey(iso) {
    var d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function stats() {
    var user = currentUser();
    if (!user) return Promise.reject(new Error('offline'));

    var key = normalize(user.username);
    var events = read(KEYS.events, []).filter(function (row) { return row.username === key; });

    var attempts = 0;
    var graded = 0;
    var correct = 0;
    var byChapter = {};
    var progress = {};
    var scores = [];
    var timeline = {};

    events.forEach(function (row) {
      if (row.kind === 'visit') {
        if (!progress[row.chapter] || rank(progress[row.chapter]) < 1) {
          progress[row.chapter] = 'visited';
        }
        return;
      }

      attempts += 1;
      var questions = Number.isFinite(row.questionCount)
        ? row.questionCount
        : (row.correct === null || row.correct === undefined ? 0 : 1);
      var rights = Number.isFinite(row.correctCount)
        ? row.correctCount
        : (row.correct ? 1 : 0);
      graded += questions;
      correct += rights;

      var bucket = byChapter[row.chapter] || (byChapter[row.chapter] = { chapter: row.chapter, attempts: 0, graded: 0, correct: 0 });
      bucket.attempts += 1;
      bucket.graded += questions;
      bucket.correct += rights;

      if (row.score !== null && row.total) {
        scores.push({ at: row.at, kind: row.kind, chapter: row.chapter, score: row.score, total: row.total });
      }

      var status = row.kind === 'test' ? 'tested' : row.kind === 'practice' ? 'practiced' : 'visited';
      if (rank(status) > rank(progress[row.chapter])) progress[row.chapter] = status;

      var day = dayKey(row.at);
      timeline[day] = (timeline[day] || 0) + 1;
    });

    var days = [];
    var now = new Date();
    for (var i = 13; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var dk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      days.push({ day: dk, count: timeline[dk] || 0 });
    }

    scores.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });

    return Promise.resolve({
      totals: {
        attempts: attempts,
        graded: graded,
        correct: correct,
        accuracy: graded ? correct / graded : null
      },
      byChapter: Object.keys(byChapter).map(function (id) {
        var row = byChapter[id];
        return {
          chapter: row.chapter,
          attempts: row.attempts,
          graded: row.graded,
          correct: row.correct,
          accuracy: row.graded ? row.correct / row.graded : null
        };
      }).sort(function (a, b) { return a.chapter < b.chapter ? -1 : 1; }),
      scores: scores,
      progress: Object.keys(progress).map(function (id) {
        return { chapter: id, status: progress[id] };
      }).sort(function (a, b) { return a.chapter < b.chapter ? -1 : 1; }),
      timeline: days
    });
  }

  function getDecor() {
    var user = currentUser();
    if (!user) return Promise.resolve({ items: [] });
    var table = read(KEYS.decor, {});
    return Promise.resolve({ items: table[normalize(user.username)] || [] });
  }

  function putDecor(items) {
    var user = currentUser();
    if (!user) return Promise.reject(new Error('未登录'));
    var list = Array.isArray(items) ? items.slice(0, 60) : [];
    var table = read(KEYS.decor, {});
    table[normalize(user.username)] = list.map(function (item) {
      return { kind: String(item.kind || 'cat'), x: Number(item.x) || 0, y: Number(item.y) || 0 };
    });
    write(KEYS.decor, table);
    return Promise.resolve({ ok: true, count: list.length });
  }

  function deleteAccount(password) {
    var user = currentUser();
    if (!user) return Promise.reject(new Error('未登录'));
    var key = normalize(user.username);
    var row = users()[key];
    if (!row) return Promise.reject(new Error('账号不存在'));

    return derive(String(password || ''), row.salt).then(function (hash) {
      if (!equal(hash, row.hash)) throw new Error('密码不对。');

      var table = users();
      delete table[key];
      write(KEYS.users, table);

      var events = read(KEYS.events, []).filter(function (item) { return item.username !== key; });
      write(KEYS.events, events);

      var decor = read(KEYS.decor, {});
      delete decor[key];
      write(KEYS.decor, decor);

      write(KEYS.session, null);
      try { global.localStorage.removeItem(KEYS.session); } catch (error) { /* 忽略 */ }
      return { ok: true };
    });
  }

  global.LocalAccount = {
    available: available,
    currentUser: currentUser,
    register: register,
    login: login,
    logout: logout,
    record: record,
    stats: stats,
    getDecor: getDecor,
    putDecor: putDecor,
    deleteAccount: deleteAccount
  };
})(typeof window !== 'undefined' ? window : null);
