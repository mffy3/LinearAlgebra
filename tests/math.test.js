/**
 * tests/math.test.js · 数学库基准测试
 *
 * 运行：node tests/math.test.js
 * 不依赖测试框架；失败会以非零退出码结束。
 */
'use strict';

const assert = require('node:assert/strict');
const L = require('../js/lib/math.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

function close(actual, expected, eps = 1e-9, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${label || 'value'}: expected ${expected}, got ${actual}`
  );
}

function closeVec(actual, expected, eps = 1e-9, label = '') {
  close(actual.x, expected.x, eps, `${label}.x`);
  close(actual.y, expected.y, eps, `${label}.y`);
}

function closeMat(actual, expected, eps = 1e-9, label = '') {
  close(actual.a, expected.a, eps, `${label}.a`);
  close(actual.b, expected.b, eps, `${label}.b`);
  close(actual.c, expected.c, eps, `${label}.c`);
  close(actual.d, expected.d, eps, `${label}.d`);
}

function closeIdentity(m, eps = 1e-9, label = '') {
  closeMat(m, L.identity(), eps, label);
}

// 确定性伪随机，保证测试可复现。
let seed = 20261019;
function random() {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
}
function randomMatrix(scale = 3) {
  return L.mat2(
    (random() * 2 - 1) * scale,
    (random() * 2 - 1) * scale,
    (random() * 2 - 1) * scale,
    (random() * 2 - 1) * scale
  );
}

console.log('\nmath.js tests\n');

/* ------------------------------------------------------------------ */
console.log('基础运算');

test('单位矩阵不改变向量', () => {
  closeVec(L.applyMat(L.identity(), { x: 2.5, y: -1.25 }), { x: 2.5, y: -1.25 });
});

test('旋转 90° 把 e₁ 送到 (0,1)、e₂ 送到 (-1,0)', () => {
  const r = L.rotation(L.toRadians(90));
  closeVec(L.applyMat(r, { x: 1, y: 0 }), { x: 0, y: 1 });
  closeVec(L.applyMat(r, { x: 0, y: 1 }), { x: -1, y: 0 });
  close(L.determinant(r), 1);
  assert.equal(L.isOrthogonal(r), true);
});

test('旋转 90° 四次回到单位矩阵', () => {
  const r = L.rotation(Math.PI / 2);
  const four = L.compose(r, r, r, r);
  closeIdentity(four);
});

test('缩放矩阵的行列式 = 面积倍数', () => {
  const s = L.scaling(0.5, 2);
  close(L.determinant(s), 1);
  const s2 = L.scaling(0.5, 0.5);
  close(L.determinant(s2), 0.25);
});

test('剪切保持面积不变', () => {
  const h = L.shear(0.8, 0);
  close(L.determinant(h), 1);
  closeVec(L.applyMat(h, { x: 0, y: 1 }), { x: 0.8, y: 1 });
});

test('矩阵复合顺序：compose(A,B) 先作用 B', () => {
  const r = L.rotation(Math.PI / 2);
  const s = L.scaling(2, 1);
  const composed = L.compose(r, s);
  closeVec(L.applyMat(composed, { x: 1, y: 0 }), { x: 0, y: 2 });
  closeVec(L.applyMat(L.multiplyMat(r, s), { x: 1, y: 0 }), { x: 0, y: 2 });
});

test('转置与 trace', () => {
  const m = L.mat2(1, 2, 3, 4);
  closeMat(L.transpose(m), L.mat2(1, 3, 2, 4));
  close(L.trace(m), 5);
});

test('由列向量拼矩阵并可还原', () => {
  const m = L.fromColumns({ x: 2, y: 3 }, { x: -1, y: 4 });
  closeMat(m, L.mat2(2, -1, 3, 4));
  const cols = L.columns(m);
  closeVec(cols[0], { x: 2, y: 3 });
  closeVec(cols[1], { x: -1, y: 4 });
});

/* ------------------------------------------------------------------ */
console.log('\n逆矩阵与秩');

test('奇异矩阵不可逆，秩为 1', () => {
  const singular = L.mat2(1, 2, 0.5, 1);
  close(L.determinant(singular), 0);
  assert.equal(L.rank(singular), 1);
  assert.equal(L.inverse(singular), null);
});

test('零矩阵秩为 0，不可逆', () => {
  assert.equal(L.rank(L.zero()), 0);
  assert.equal(L.inverse(L.zero()), null);
});

test('可逆矩阵满足 A⁻¹A ≈ I（随机 200 例）', () => {
  for (let i = 0; i < 200; i++) {
    const m = randomMatrix(2);
    if (Math.abs(L.determinant(m)) < 0.05) continue;
    const inv = L.inverse(m);
    assert.ok(inv, `case ${i} should be invertible`);
    closeIdentity(L.multiplyMat(inv, m), 1e-8, `case ${i}`);
    closeIdentity(L.multiplyMat(m, inv), 1e-8, `case ${i}`);
  }
});

test('det(AB) = det(A)det(B)（随机 100 例）', () => {
  for (let i = 0; i < 100; i++) {
    const a = randomMatrix(2);
    const b = randomMatrix(2);
    close(
      L.determinant(L.multiplyMat(a, b)),
      L.determinant(a) * L.determinant(b),
      1e-8,
      `case ${i}`
    );
  }
});

test('接近奇异的矩阵按容差降秩', () => {
  const almost = L.mat2(1, 1, 1, 1 + 1e-12);
  assert.equal(L.determinant(almost) > 0, true);
  assert.equal(L.rank(almost, 1e-9), 1);
});

/* ------------------------------------------------------------------ */
console.log('\n行列式与面积');

test('单位方格有向面积 = 1', () => {
  close(L.polygonArea(L.unitSquarePoints()), 1);
});

test('变换后单位方格有向面积 = det(A)', () => {
  const cases = [
    L.rotation(0.7),
    L.scaling(2, 0.5),
    L.shear(0.8, 0),
    L.mat2(-1, 0, 0, 1),
    L.mat2(1, 2, 2, 4),
    L.mat2(0.3, -1.2, 0.7, 2.1)
  ];
  for (const m of cases) {
    const transformed = L.unitSquarePoints().map((p) => L.applyMat(m, p));
    close(L.polygonArea(transformed), L.determinant(m), 1e-9, 'area');
  }
});

/* ------------------------------------------------------------------ */
console.log('\n特征值 / 特征向量');

test('对称矩阵 [[2,1],[1,2]] 的特征值为 3 和 1', () => {
  const m = L.mat2(2, 1, 1, 2);
  const eig = L.eigen2(m);
  assert.equal(eig.real, true);
  close(eig.values[0].re, 3);
  close(eig.values[1].re, 1);
  closeVec(eig.vectors[0], { x: Math.SQRT1_2, y: Math.SQRT1_2 }, 1e-9, 'λ=3');
  closeVec(eig.vectors[1], { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, 1e-9, 'λ=1');
});

test('特征向量回代 Av = λv', () => {
  const matrices = [
    L.mat2(2, 1, 1, 2),
    L.mat2(3, 0, 0, 1),
    L.mat2(1, 1, 0, 1),
    L.mat2(-2, 0, 0, 0.5)
  ];
  for (const m of matrices) {
    const eig = L.eigen2(m);
    assert.equal(eig.real, true);
    for (let i = 0; i < 2; i++) {
      const lambda = eig.values[i].re;
      const v = eig.vectors[i];
      const av = L.applyMat(m, v);
      close(av.x, lambda * v.x, 1e-8, `Av.x ${i}`);
      close(av.y, lambda * v.y, 1e-8, `Av.y ${i}`);
    }
  }
});

test('旋转 90° 没有实特征方向', () => {
  const eig = L.eigen2(L.rotation(Math.PI / 2));
  assert.equal(eig.real, false);
  close(eig.values[0].re, 0);
  close(Math.abs(eig.values[0].im), 1);
  assert.equal(eig.vectors[0], null);
});

test('剪切矩阵只有一条独立特征方向', () => {
  const eig = L.eigen2(L.mat2(1, 1, 0, 1));
  assert.equal(eig.real, true);
  close(eig.values[0].re, 1);
  close(eig.values[1].re, 1);
  closeVec(eig.vectors[0], { x: 1, y: 0 }, 1e-9);
  closeVec(eig.vectors[1], { x: 1, y: 0 }, 1e-9);
});

test('对角矩阵的特征方向是坐标轴', () => {
  const eig = L.eigen2(L.mat2(3, 0, 0, -2));
  close(eig.values[0].re, 3);
  close(eig.values[1].re, -2);
  closeVec(eig.vectors[0], { x: 1, y: 0 });
  closeVec(eig.vectors[1], { x: 0, y: 1 });
});

test('标量矩阵：所有方向都是特征方向', () => {
  const m = L.mat2(2.5, 0, 0, 2.5);
  const eig = L.eigen2(m);
  assert.equal(L.isScalar(m), true);
  close(eig.values[0].re, 2.5);
  close(eig.values[1].re, 2.5);
});

test('零矩阵的特征值为 0，代表向量非零', () => {
  const eig = L.eigen2(L.zero());
  assert.equal(eig.real, true);
  close(eig.values[0].re, 0);
  close(eig.values[1].re, 0);
  assert.ok(L.length(eig.vectors[0]) > 0.5);
});

/* ------------------------------------------------------------------ */
console.log('\n投影、反射与向量');

test('投影到 x 轴：幂等且压掉 y', () => {
  const p = L.projectionOnto({ x: 1, y: 0 });
  closeMat(p, L.mat2(1, 0, 0, 0));
  closeVec(L.applyMat(p, { x: 3, y: -4 }), { x: 3, y: 0 });
  closeMat(L.multiplyMat(p, p), p);
  close(L.determinant(p), 0);
});

test('沿 x 轴反射：y 变号、行列式为 -1、两次回到原位', () => {
  const r = L.reflection(0);
  closeVec(L.applyMat(r, { x: 2, y: 3 }), { x: 2, y: -3 });
  close(L.determinant(r), -1);
  closeMat(L.multiplyMat(r, r), L.identity());
});

test('向量长度、点积、夹角、旋转', () => {
  close(L.length({ x: 3, y: 4 }), 5);
  close(L.dot({ x: 1, y: 2 }, { x: 3, y: -1 }), 1);
  close(L.angleBetween({ x: 1, y: 0 }, { x: 0, y: 1 }), Math.PI / 2);
  closeVec(L.rotateVec({ x: 1, y: 0 }, Math.PI / 2), { x: 0, y: 1 });
  closeVec(L.normalize({ x: 0, y: 0 }), { x: 0, y: 0 });
});

test('插值端点与中点', () => {
  const a = L.mat2(0, 1, 2, 3);
  const b = L.mat2(2, 3, 4, 5);
  closeMat(L.lerpMat(a, b, 0), a);
  closeMat(L.lerpMat(a, b, 1), b);
  closeMat(L.lerpMat(a, b, 0.5), L.mat2(1, 2, 3, 4));
});

/* ------------------------------------------------------------------ */
console.log('\n格式化与工具');

test('formatFixed 不输出 -0.00', () => {
  assert.equal(L.formatFixed(-0.0000001, 2), '0.00');
  assert.equal(L.formatFixed(1.005, 2), '1.00');
  assert.equal(L.formatFixed(1.234, 2), '1.23');
});

test('formatInput 去掉多余 0', () => {
  assert.equal(L.formatInput(1), '1');
  assert.equal(L.formatInput(0.5), '0.5');
  assert.equal(L.formatInput(0.1 + 0.2), '0.3');
  assert.equal(L.formatInput(-2.5), '-2.5');
});

test('parseNumber 对非法值回退', () => {
  assert.equal(L.parseNumber('abc', 7), 7);
  assert.equal(L.parseNumber('2.5', 0), 2.5);
  assert.equal(L.parseNumber('', 3), 3);
});

test('approx 使用容差', () => {
  assert.equal(L.approx(1, 1 + 1e-12), true);
  assert.equal(L.approx(1, 1.01, 1e-9), false);
});

test('矩阵与向量的有限性检查', () => {
  assert.equal(L.isFiniteMatrix(L.mat2(1, 2, 3, 4)), true);
  assert.equal(L.isFiniteMatrix(L.mat2(NaN, 2, 3, 4)), false);
  assert.equal(L.isFiniteVector({ x: 1, y: Infinity }), false);
});

test('角度转换', () => {
  close(L.toRadians(180), Math.PI);
  close(L.toDegrees(Math.PI / 2), 90);
  close(L.normalizeAngle(3 * Math.PI), Math.PI);
});

/* ------------------------------------------------------------------ */
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
