'use strict';

/**
 * tests/questions.test.js · 题库结构自检（v2）
 *
 * 运行：node tests/questions.test.js
 *
 * 每章：三档练习各 17 题（10 选择 + 5 填空 + 2 大题，合计 100 分），
 * 大测 23 题（15 选择 + 5 填空 + 3 大题，合计 200 分）。
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
const ids = ['00-vectors', '01-transform', '02-determinant', '03-rank', '04-eigenvector', '05-solve'];
const seen = new Map();

function typeOf(question) {
  if (question.type) return question.type;
  if (typeof question.n === 'number') return 'fill';
  if (question.o) return 'choice';
  return 'long';
}

function verifySet(label, list, expected) {
  if (!Array.isArray(list)) throw new Error(label + ' 不是数组');
  if (list.length !== expected.count) {
    throw new Error(label + ' 有 ' + list.length + ' 题，应为 ' + expected.count);
  }

  const counts = { choice: 0, fill: 0, long: 0 };
  let points = 0;

  list.forEach(function (question, index) {
    const where = label + '[' + index + ']';
    const type = typeOf(question);
    counts[type] += 1;
    points += Number(question.p) || 0;

    if (!question.q || typeof question.q !== 'string') throw new Error(where + ' 缺题干');
    if (!question.s) throw new Error(where + ' 缺出处');
    if (!Number.isFinite(question.p)) throw new Error(where + ' 缺分值 p');

    if (type === 'choice') {
      if (!Array.isArray(question.o) || question.o.length !== 4) throw new Error(where + ' 需要 4 个选项');
      if (!Number.isInteger(question.a) || question.a < 0 || question.a > 3) throw new Error(where + ' 答案下标非法');
      if (!question.e) throw new Error(where + ' 缺解析');
    } else if (type === 'fill') {
      if (!Number.isFinite(question.n)) throw new Error(where + ' 缺数值答案 n');
      if (!question.e) throw new Error(where + ' 缺解析');
    } else if (type === 'long') {
      if (!question.model) throw new Error(where + ' 大题缺 model');
      if (!question.steps) throw new Error(where + ' 大题缺 steps');
    } else {
      throw new Error(where + ' 未知题型 ' + type);
    }

    const key = String(question.q).replace(/\s+/g, '');
    if (seen.has(key)) throw new Error('重复题干：' + question.q + '（' + seen.get(key) + ' 与 ' + label + '）');
    seen.set(key, label);
  });

  if (counts.choice !== expected.choice || counts.fill !== expected.fill || counts.long !== expected.long) {
    throw new Error(label + ' 题型数量不对：' + JSON.stringify(counts));
  }
  if (Math.round(points) !== expected.points) {
    throw new Error(label + ' 分值合计 ' + points + '，应为 ' + expected.points);
  }
}

check('六章题库都存在', function () {
  ids.forEach(function (id) {
    if (!bank[id]) throw new Error('缺少 ' + id);
  });
});

ids.forEach(function (id) {
  const chapter = bank[id];

  ['easy', 'medium', 'hard'].forEach(function (tier) {
    check(id + ' · ' + tier + ' 17 题 / 100 分', function () {
      verifySet(id + '.' + tier, chapter.practice && chapter.practice[tier], {
        count: 17, choice: 10, fill: 5, long: 2, points: 100
      });
    });
  });

  check(id + ' · 大测 23 题 / 200 分', function () {
    verifySet(id + '.test', chapter.test, {
      count: 23, choice: 15, fill: 5, long: 3, points: 200
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
