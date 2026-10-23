'use strict';

/**
 * tests/questions.test.js · 题库结构自检
 *
 * 运行：node tests/questions.test.js
 * 检查：每章 3 档各 6 题 + 大测 8 题；选择题 4 个选项、答案下标合法；
 * 数值题有 n；每题都有解析与出处；全库题干不重复。
 */

const fs = require('node:fs');
const path = require('node:path');

global.window = global;

const dir = path.join(__dirname, '..', 'js', 'lib', 'questions');
const files = fs.readdirSync(dir).filter(function (name) { return name.endsWith('.js'); }).sort();

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (error) {
    failed += 1;
    console.error('  ✗ ' + name);
    console.error('    ' + error.message);
  }
}

files.forEach(function (file) {
  require(path.join(dir, file));
});

const bank = global.LinAlgQuiz || {};
const ids = Object.keys(bank);
const seen = new Map();

check('六章题库都存在', function () {
  ['00-vectors', '01-transform', '02-determinant', '03-rank', '04-eigenvector', '05-solve']
    .forEach(function (id) {
      if (!bank[id]) throw new Error('缺少 ' + id);
    });
});

ids.forEach(function (id) {
  const chapter = bank[id];

  check(id + ' · 三档练习各 6 题', function () {
    ['easy', 'medium', 'hard'].forEach(function (tier) {
      const list = chapter.practice && chapter.practice[tier];
      if (!Array.isArray(list)) throw new Error(tier + ' 不是数组');
      if (list.length !== 6) throw new Error(tier + ' 有 ' + list.length + ' 题，应为 6');
    });
  });

  check(id + ' · 大测 8 题', function () {
    if (!Array.isArray(chapter.test)) throw new Error('test 不是数组');
    if (chapter.test.length !== 8) throw new Error('大测有 ' + chapter.test.length + ' 题，应为 8');
  });

  check(id + ' · 题目字段完整', function () {
    const lists = [];
    ['easy', 'medium', 'hard'].forEach(function (tier) { lists.push([tier, chapter.practice[tier]]); });
    lists.push(['test', chapter.test]);

    lists.forEach(function (pair) {
      const tier = pair[0];
      pair[1].forEach(function (q, index) {
        const where = tier + '[' + index + ']';
        if (!q.q || typeof q.q !== 'string') throw new Error(where + ' 缺题干');
        if (!q.e) throw new Error(where + ' 缺解析');
        if (!q.s) throw new Error(where + ' 缺出处');

        const numeric = typeof q.n === 'number';
        if (numeric) {
          if (!Number.isFinite(q.n)) throw new Error(where + ' 数值答案非法');
          if (q.o) throw new Error(where + ' 数值题不应有选项');
        } else {
          if (!Array.isArray(q.o) || q.o.length !== 4) throw new Error(where + ' 需要 4 个选项');
          if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) throw new Error(where + ' 答案下标非法');
          q.o.forEach(function (option) {
            if (!option || typeof option !== 'string') throw new Error(where + ' 选项为空');
          });
        }
      });
    });
  });

  check(id + ' · 题干不重复', function () {
    const lists = [chapter.practice.easy, chapter.practice.medium, chapter.practice.hard, chapter.test];
    lists.forEach(function (list) {
      list.forEach(function (q) {
        const key = String(q.q).replace(/\s+/g, '');
        if (seen.has(key)) throw new Error('重复题干：' + q.q + '（' + seen.get(key) + ' 与 ' + id + '）');
        seen.set(key, id);
      });
    });
  });

  check(id + ' · 有参考来源', function () {
    if (!Array.isArray(chapter.refs) || chapter.refs.length < 1) throw new Error('refs 为空');
    chapter.refs.forEach(function (ref) {
      if (!ref.label) throw new Error('refs 缺 label');
    });
  });
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exitCode = 1;
