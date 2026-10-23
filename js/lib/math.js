/**
 * math.js · 线性代数纯函数库
 *
 * 约定
 * ----
 * 2×2 矩阵用行主序对象表示：{ a, b, c, d } 对应
 *
 *     | a  b |
 *     | c  d |
 *
 * 列向量用 { x, y } 表示。矩阵作用在列向量上：
 *
 *     A v = (a*x + b*y, c*x + d*y)
 *
 * 这个文件只做数学：不碰 DOM、不碰 Canvas、不读页面状态。
 * 浏览器中挂到 window.LinAlg；Node 中可通过 module.exports 引入测试。
 */
(function (global) {
  'use strict';

  var EPS = 1e-9;

  /* ------------------------------------------------------------------ *
   * 基础数值
   * ------------------------------------------------------------------ */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function approx(a, b, eps) {
    return Math.abs(a - b) <= (eps == null ? EPS : eps);
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function isFiniteVector(v) {
    return !!v && isFiniteNumber(v.x) && isFiniteNumber(v.y);
  }

  function isFiniteMatrix(m) {
    return !!m && isFiniteNumber(m.a) && isFiniteNumber(m.b) &&
      isFiniteNumber(m.c) && isFiniteNumber(m.d);
  }

  function parseNumber(raw, fallback) {
    var n = typeof raw === 'number' ? raw : parseFloat(raw);
    return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
  }

  /** 固定小数位，顺手把 -0.00 变成 0.00。 */
  function formatFixed(value, digits) {
    var d = digits == null ? 2 : digits;
    if (!Number.isFinite(value)) return '—';
    var text = value.toFixed(d);
    if (/^-0(\.0+)?$/.test(text)) text = text.slice(1);
    return text;
  }

  /** 智能小数：最多 digits 位，去掉末尾 0，适合标签。 */
  function formatNumber(value, digits) {
    var d = digits == null ? 2 : digits;
    if (!Number.isFinite(value)) return '—';
    var text = value.toFixed(d);
    if (text.indexOf('.') >= 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
    if (text === '-0') text = '0';
    return text;
  }

  /** 输入框展示：保留最多 2 位，去掉多余 0。 */
  function formatInput(value) {
    return formatNumber(value, 2);
  }

  /* ------------------------------------------------------------------ *
   * 向量
   * ------------------------------------------------------------------ */

  function vec(x, y) {
    return { x: x, y: y };
  }

  function addVec(u, v) {
    return { x: u.x + v.x, y: u.y + v.y };
  }

  function subVec(u, v) {
    return { x: u.x - v.x, y: u.y - v.y };
  }

  function scaleVec(v, k) {
    return { x: v.x * k, y: v.y * k };
  }

  function dot(u, v) {
    return u.x * v.x + u.y * v.y;
  }

  /** 2D 叉积的标量部分，符号表示 u 在 v 的哪一侧。 */
  function cross(u, v) {
    return u.x * v.y - u.y * v.x;
  }

  function length(v) {
    return Math.hypot(v.x, v.y);
  }

  function distance(u, v) {
    return Math.hypot(u.x - v.x, u.y - v.y);
  }

  function normalize(v) {
    var len = length(v);
    if (len < EPS) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  function angleOf(v) {
    return Math.atan2(v.y, v.x);
  }

  function angleBetween(u, v) {
    var denom = length(u) * length(v);
    if (denom < EPS) return 0;
    return Math.acos(clamp(dot(u, v) / denom, -1, 1));
  }

  function rotateVec(v, radians) {
    var c = Math.cos(radians);
    var s = Math.sin(radians);
    return { x: c * v.x - s * v.y, y: s * v.x + c * v.y };
  }

  function lerpVec(u, v, t) {
    return { x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t };
  }

  /* ------------------------------------------------------------------ *
   * 矩阵构造
   * ------------------------------------------------------------------ */

  function mat2(a, b, c, d) {
    return { a: a, b: b, c: c, d: d };
  }

  var IDENTITY = Object.freeze({ a: 1, b: 0, c: 0, d: 1 });
  var ZERO = Object.freeze({ a: 0, b: 0, c: 0, d: 0 });

  function identity() {
    return { a: 1, b: 0, c: 0, d: 1 };
  }

  function zero() {
    return { a: 0, b: 0, c: 0, d: 0 };
  }

  /** 由两个列向量拼矩阵：columns(e1, e2) = [e1 | e2]。 */
  function fromColumns(e1, e2) {
    return { a: e1.x, b: e2.x, c: e1.y, d: e2.y };
  }

  function columns(m) {
    return [{ x: m.a, y: m.c }, { x: m.b, y: m.d }];
  }

  function rows(m) {
    return [{ x: m.a, y: m.b }, { x: m.c, y: m.d }];
  }

  function rotation(radians) {
    var c = Math.cos(radians);
    var s = Math.sin(radians);
    return { a: c, b: -s, c: s, d: c };
  }

  function scaling(sx, sy) {
    return { a: sx, b: 0, c: 0, d: sy == null ? sx : sy };
  }

  /** x' = x + kx·y, y' = ky·x + y */
  function shear(kx, ky) {
    return { a: 1, b: kx, c: ky == null ? 0 : ky, d: 1 };
  }

  /** 沿单位方向 u 的正交投影矩阵。 */
  function projectionOnto(axis) {
    var u = normalize(axis);
    if (length(u) < EPS) return zero();
    return {
      a: u.x * u.x,
      b: u.x * u.y,
      c: u.x * u.y,
      d: u.y * u.y
    };
  }

  /** 沿与 x 轴夹角 radians 的直线反射。 */
  function reflection(radians) {
    var c = Math.cos(2 * radians);
    var s = Math.sin(2 * radians);
    return { a: c, b: s, c: s, d: -c };
  }

  /* ------------------------------------------------------------------ *
   * 矩阵运算
   * ------------------------------------------------------------------ */

  function addMat(m, n) {
    return { a: m.a + n.a, b: m.b + n.b, c: m.c + n.c, d: m.d + n.d };
  }

  function subMat(m, n) {
    return { a: m.a - n.a, b: m.b - n.b, c: m.c - n.c, d: m.d - n.d };
  }

  function scaleMat(m, k) {
    return { a: m.a * k, b: m.b * k, c: m.c * k, d: m.d * k };
  }

  /** 矩阵乘法：m · n，先作用 n，再作用 m。 */
  function multiplyMat(m, n) {
    return {
      a: m.a * n.a + m.b * n.c,
      b: m.a * n.b + m.b * n.d,
      c: m.c * n.a + m.d * n.c,
      d: m.c * n.b + m.d * n.d
    };
  }

  /** compose(A, B, C) = A·B·C，按参数从左到右依次作用。 */
  function compose() {
    var result = identity();
    for (var i = 0; i < arguments.length; i++) {
      result = multiplyMat(result, arguments[i]);
    }
    return result;
  }

  function applyMat(m, v) {
    return { x: m.a * v.x + m.b * v.y, y: m.c * v.x + m.d * v.y };
  }

  function applyMatXY(m, x, y) {
    return { x: m.a * x + m.b * y, y: m.c * x + m.d * y };
  }

  function trace(m) {
    return m.a + m.d;
  }

  function determinant(m) {
    return m.a * m.d - m.b * m.c;
  }

  function transpose(m) {
    return { a: m.a, b: m.c, c: m.b, d: m.d };
  }

  /** 伴随矩阵（未除以行列式）。 */
  function adjugate(m) {
    return { a: m.d, b: -m.b, c: -m.c, d: m.a };
  }

  function isSingular(m, eps) {
    return Math.abs(determinant(m)) <= (eps == null ? EPS : eps);
  }

  /** 可逆时返回逆矩阵；奇异时返回 null。 */
  function inverse(m, eps) {
    var det = determinant(m);
    if (Math.abs(det) <= (eps == null ? EPS : eps)) return null;
    var invDet = 1 / det;
    return {
      a: m.d * invDet,
      b: -m.b * invDet,
      c: -m.c * invDet,
      d: m.a * invDet
    };
  }

  function rank(m, eps) {
    var tol = eps == null ? EPS : eps;
    if (Math.abs(determinant(m)) > tol) return 2;
    var maxAbs = Math.max(Math.abs(m.a), Math.abs(m.b), Math.abs(m.c), Math.abs(m.d));
    return maxAbs > tol ? 1 : 0;
  }

  function maxAbs(m) {
    return Math.max(Math.abs(m.a), Math.abs(m.b), Math.abs(m.c), Math.abs(m.d));
  }

  function isIdentity(m, eps) {
    var tol = eps == null ? EPS : eps;
    return approx(m.a, 1, tol) && approx(m.b, 0, tol) &&
      approx(m.c, 0, tol) && approx(m.d, 1, tol);
  }

  function matrixEquals(m, n, eps) {
    var tol = eps == null ? EPS : eps;
    return approx(m.a, n.a, tol) && approx(m.b, n.b, tol) &&
      approx(m.c, n.c, tol) && approx(m.d, n.d, tol);
  }

  /** 是否为“所有方向都只被同一个倍数拉伸”的标量矩阵。 */
  function isScalar(m, eps) {
    var tol = eps == null ? EPS : eps;
    return approx(m.a, m.d, tol) && Math.abs(m.b) <= tol && Math.abs(m.c) <= tol;
  }

  function isSymmetric(m, eps) {
    return approx(m.b, m.c, eps == null ? EPS : eps);
  }

  function isOrthogonal(m, eps) {
    var tol = eps == null ? EPS : eps;
    var product = multiplyMat(transpose(m), m);
    return matrixEquals(product, identity(), tol);
  }

  function lerp(u, v, t) {
    return u + (v - u) * t;
  }

  function lerpMat(m, n, t) {
    return {
      a: lerp(m.a, n.a, t),
      b: lerp(m.b, n.b, t),
      c: lerp(m.c, n.c, t),
      d: lerp(m.d, n.d, t)
    };
  }

  function toArray(m) {
    return [m.a, m.b, m.c, m.d];
  }

  function fromArray(values) {
    return mat2(values[0], values[1], values[2], values[3]);
  }

  /* ------------------------------------------------------------------ *
   * 特征值 / 特征向量（2×2）
   * ------------------------------------------------------------------ */

  function eigenvectorFor(m, lambda, eps) {
    var tol = eps == null ? EPS : eps;

    // (A - λI)v = 0：
    //   (a-λ)x + b y = 0   →  v = (b, λ-a)
    //   c x + (d-λ)y = 0   →  v = (λ-d, c)
    var first = { x: m.b, y: lambda - m.a };
    var second = { x: lambda - m.d, y: m.c };
    var v = length(first) >= length(second) ? first : second;

    // A - λI ≈ 0：所有方向都是特征方向，返回 e₁ 作为代表。
    if (length(v) <= tol) v = { x: 1, y: 0 };

    v = normalize(v);

    // 统一符号：优先让 x > 0；x ≈ 0 时让 y > 0。
    // 方向不变，只是让页面与测试的显示结果稳定。
    if (v.x < -tol || (Math.abs(v.x) <= tol && v.y < 0)) {
      v = { x: -v.x, y: -v.y };
    }
    return v;
  }

  /**
   * 2×2 实矩阵的特征分解。
   *
   * 返回：
   * {
   *   real: boolean,
   *   values: [{ re, im }, ...],       // 两个特征值，按 λ₁ ≥ Re λ₂ 排列
   *   vectors: [{ x, y } | null, ...], // 实特征值对应单位特征向量；复特征值为 null
   *   discriminant, trace, determinant
   * }
   *
   * 重根时两个向量可能相同（缺陷矩阵），调用方需自行去重。
   * 标量矩阵（A = λI）时返回 e₁ 作为代表，调用方应提示“所有方向都是”。
   */
  function eigen2(m, eps) {
    var tol = eps == null ? EPS : eps;
    var tr = trace(m);
    var det = determinant(m);
    var discriminant = tr * tr - 4 * det;

    if (discriminant < -tol) {
      var re = tr / 2;
      var im = Math.sqrt(-discriminant) / 2;
      return {
        real: false,
        values: [{ re: re, im: im }, { re: re, im: -im }],
        vectors: [null, null],
        discriminant: discriminant,
        trace: tr,
        determinant: det
      };
    }

    var sqrtDisc = Math.sqrt(Math.max(0, discriminant));
    var lambda1 = (tr + sqrtDisc) / 2;
    var lambda2 = (tr - sqrtDisc) / 2;

    return {
      real: true,
      values: [{ re: lambda1, im: 0 }, { re: lambda2, im: 0 }],
      vectors: [
        eigenvectorFor(m, lambda1, tol),
        eigenvectorFor(m, lambda2, tol)
      ],
      discriminant: discriminant,
      trace: tr,
      determinant: det
    };
  }

  /* ------------------------------------------------------------------ *
   * 列空间 / 零空间（2×2）
   * ------------------------------------------------------------------ */

  /**
   * 列空间：矩阵两列张成的空间。
   *
   * 返回：
   * {
   *   dimension: 0 | 1 | 2,
   *   basis: [{x,y}, ...],       // 列空间的一组基
   *   direction: {x,y} | null,   // 秩 1 时的单位方向
   *   isPlane: boolean,          // 秩 2：整个平面
   *   isZero: boolean            // 秩 0：只有原点
   * }
   */
  function columnSpace2(m, eps) {
    var tol = eps == null ? EPS : eps;
    var r = rank(m, tol);
    var c1 = { x: m.a, y: m.c };
    var c2 = { x: m.b, y: m.d };

    if (r === 0) {
      return {
        dimension: 0,
        basis: [],
        direction: null,
        isPlane: false,
        isZero: true
      };
    }

    if (r === 2) {
      return {
        dimension: 2,
        basis: [c1, c2],
        direction: null,
        isPlane: true,
        isZero: false
      };
    }

    // 秩 1：取较长的一列作为方向，避免拿零向量归一化。
    var base = length(c1) >= length(c2) ? c1 : c2;
    return {
      dimension: 1,
      basis: [base],
      direction: normalize(base),
      isPlane: false,
      isZero: false
    };
  }

  /**
   * 零空间：所有满足 A x = 0 的 x 组成的空间。
   *
   * 返回结构同 columnSpace2：
   * - 秩 2：{0}，basis 为空
   * - 秩 1：一条过原点的直线，direction 为单位方向
   * - 秩 0：整个平面，basis 取 e₁、e₂
   */
  function nullSpace2(m, eps) {
    var tol = eps == null ? EPS : eps;
    var r = rank(m, tol);

    if (r === 2) {
      return {
        dimension: 0,
        basis: [],
        direction: null,
        isPlane: false,
        isZero: true
      };
    }

    if (r === 0) {
      return {
        dimension: 2,
        basis: [{ x: 1, y: 0 }, { x: 0, y: 1 }],
        direction: null,
        isPlane: true,
        isZero: false
      };
    }

    // 秩 1：零空间垂直于行空间。取较长的一行 (p, q)，法向量 (-q, p)。
    var row1 = { x: m.a, y: m.b };
    var row2 = { x: m.c, y: m.d };
    var row = length(row1) >= length(row2) ? row1 : row2;
    var direction = normalize({ x: -row.y, y: row.x });

    return {
      dimension: 1,
      basis: [direction],
      direction: direction,
      isPlane: false,
      isZero: false
    };
  }

  /* ------------------------------------------------------------------ *
   * 线性方程组 Ax = b（2×2）
   * ------------------------------------------------------------------ */

  function solveRank1Particular(m, b, tol) {
    var row1 = { a: m.a, b: m.b, rhs: b.x };
    var row2 = { a: m.c, b: m.d, rhs: b.y };
    var row = Math.hypot(row2.a, row2.b) > Math.hypot(row1.a, row1.b) ? row2 : row1;

    // 优先让 x 非零，读数更像“解”；若该行 x 的系数为 0，再解 y。
    if (Math.abs(row.a) > tol) {
      return { x: row.rhs / row.a, y: 0 };
    }
    if (Math.abs(row.b) > tol) {
      return { x: 0, y: row.rhs / row.b };
    }
    return { x: 0, y: 0 };
  }

  /**
   * 解 2×2 方程组 A x = b，并给出几何分类。
   *
   * 返回：
   * - status: 'unique' | 'none' | 'infinite'
   * - particular: 一个特解（无解时为 null）
   * - nullspace: nullSpace2 的结果（包含维数与方向）
   * - rankA / rankAugmented: 系数矩阵与增广矩阵的秩
   * - det: 系数矩阵行列式
   * - residual: A(particular) - b（用于核对）
   */
  function solve2(m, b, eps) {
    var tol = eps == null ? EPS : eps;
    var rhs = { x: b.x, y: b.y };
    var det = determinant(m);
    var rankA = rank(m, tol);
    var c1 = { x: m.a, y: m.c };
    var c2 = { x: m.b, y: m.d };
    var rankAugmented = rankA;

    if (rankA < 2) {
      var off1 = Math.abs(cross(c1, rhs));
      var off2 = Math.abs(cross(c2, rhs));
      if (off1 > tol || off2 > tol) {
        rankAugmented = 2;
      } else if (rankA === 0 && length(rhs) > tol) {
        rankAugmented = 1;
      }
    }

    var consistent = rankAugmented === rankA;
    var status = rankA === 2 ? 'unique' : (consistent ? 'infinite' : 'none');
    var particular = null;

    if (status === 'unique') {
      var inv = inverse(m, tol);
      particular = inv ? applyMat(inv, rhs) : null;
    } else if (status === 'infinite') {
      particular = rankA === 0 ? { x: 0, y: 0 } : solveRank1Particular(m, rhs, tol);
    }

    var nullspace = nullSpace2(m, tol);
    var residual = particular ? subVec(applyMat(m, particular), rhs) : null;

    return {
      status: status,
      consistent: consistent,
      unique: status === 'unique',
      particular: particular,
      solution: particular,
      nullspace: nullspace,
      freeDirection: nullspace.direction,
      dimension: nullspace.dimension,
      det: det,
      rankA: rankA,
      rankAugmented: rankAugmented,
      residual: residual
    };
  }

  /* ------------------------------------------------------------------ *
   * 多边形（用于行列式 = 面积）
   * ------------------------------------------------------------------ */

  /** 有向面积（鞋带公式）；逆时针为正。 */
  function polygonArea(points) {
    if (!points || points.length < 3) return 0;
    var sum = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var q = points[(i + 1) % points.length];
      sum += p.x * q.y - q.x * p.y;
    }
    return sum / 2;
  }

  /** 单位方格 [0,1]×[0,1] 的四个顶点。 */
  function unitSquarePoints() {
    return [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ];
  }

  function unitCirclePoints(segments) {
    var n = segments == null ? 96 : segments;
    var points = [];
    for (var i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      points.push({ x: Math.cos(t), y: Math.sin(t) });
    }
    return points;
  }

  /* ------------------------------------------------------------------ *
   * 角度
   * ------------------------------------------------------------------ */

  function toRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  function toDegrees(radians) {
    return radians * 180 / Math.PI;
  }

  function normalizeAngle(radians) {
    var twoPi = Math.PI * 2;
    var a = radians % twoPi;
    if (a > Math.PI) a -= twoPi;
    if (a < -Math.PI) a += twoPi;
    return a;
  }

  /* ------------------------------------------------------------------ *
   * 3D：mat3、旋转与透视投影（计算机 / 美术应用共用）
   * ------------------------------------------------------------------ */

  /**
   * 3×3 矩阵，行优先存成 9 个数：
   *
   *     | m0  m1  m2 |
   *     | m3  m4  m5 |
   *     | m6  m7  m8 |
   *
   * 3D 点用 { x, y, z } 表示；矩阵作用在列向量上。
   */
  function mat3(values) {
    var v = values || [1, 0, 0, 0, 1, 0, 0, 0, 1];
    return [v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]];
  }

  function identity3() {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  function multiplyMat3(a, b) {
    var out = new Array(9);
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        out[r * 3 + c] =
          a[r * 3] * b[c] +
          a[r * 3 + 1] * b[3 + c] +
          a[r * 3 + 2] * b[6 + c];
      }
    }
    return out;
  }

  function applyMat3(m, p) {
    return {
      x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
      y: m[3] * p.x + m[4] * p.y + m[5] * p.z,
      z: m[6] * p.x + m[7] * p.y + m[8] * p.z
    };
  }

  /** 三维点积；判断面朝向时用它。 */
  function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  /** 绕 x 轴旋转（右手系，角度制）。 */
  function rotationX3(degrees) {
    var t = toRadians(degrees);
    var c = Math.cos(t);
    var s = Math.sin(t);
    return [1, 0, 0, 0, c, -s, 0, s, c];
  }

  /** 绕 y 轴旋转（右手系，角度制）。 */
  function rotationY3(degrees) {
    var t = toRadians(degrees);
    var c = Math.cos(t);
    var s = Math.sin(t);
    return [c, 0, s, 0, 1, 0, -s, 0, c];
  }

  /**
   * 透视投影：相机在原点、看向 +z，物体先平移到 z + distance 再除以深度。
   * 返回的 z 是相机空间深度，<= 0 表示落在相机后面（调用方应当丢弃）。
   */
  function projectPoint3(p, distance, focal) {
    var d = distance == null ? 6 : distance;
    var f = focal == null ? 1 : focal;
    var depth = p.z + d;
    if (!Number.isFinite(depth) || Math.abs(depth) < 1e-6) {
      return { x: 0, y: 0, z: depth, behind: true };
    }
    return {
      x: f * p.x / depth,
      y: f * p.y / depth,
      z: depth,
      behind: depth <= 0
    };
  }

  /* ------------------------------------------------------------------ *
   * 导出
   * ------------------------------------------------------------------ */

  var LinAlg = {
    EPS: EPS,

    // 数值
    clamp: clamp,
    approx: approx,
    isFiniteNumber: isFiniteNumber,
    isFiniteVector: isFiniteVector,
    isFiniteMatrix: isFiniteMatrix,
    parseNumber: parseNumber,
    formatFixed: formatFixed,
    formatNumber: formatNumber,
    formatInput: formatInput,

    // 向量
    vec: vec,
    addVec: addVec,
    subVec: subVec,
    scaleVec: scaleVec,
    dot: dot,
    cross: cross,
    length: length,
    distance: distance,
    normalize: normalize,
    angleOf: angleOf,
    angleBetween: angleBetween,
    rotateVec: rotateVec,
    lerpVec: lerpVec,

    // 矩阵构造
    mat2: mat2,
    IDENTITY: IDENTITY,
    ZERO: ZERO,
    identity: identity,
    zero: zero,
    fromColumns: fromColumns,
    columns: columns,
    rows: rows,
    rotation: rotation,
    scaling: scaling,
    shear: shear,
    projectionOnto: projectionOnto,
    reflection: reflection,

    // 矩阵运算
    addMat: addMat,
    subMat: subMat,
    scaleMat: scaleMat,
    multiplyMat: multiplyMat,
    compose: compose,
    applyMat: applyMat,
    applyMatXY: applyMatXY,
    trace: trace,
    determinant: determinant,
    transpose: transpose,
    adjugate: adjugate,
    isSingular: isSingular,
    inverse: inverse,
    rank: rank,
    maxAbs: maxAbs,
    isIdentity: isIdentity,
    matrixEquals: matrixEquals,
    isScalar: isScalar,
    isSymmetric: isSymmetric,
    isOrthogonal: isOrthogonal,
    lerp: lerp,
    lerpMat: lerpMat,
    toArray: toArray,
    fromArray: fromArray,

    // 特征
    eigen2: eigen2,

    // 列空间 / 零空间
    columnSpace2: columnSpace2,
    nullSpace2: nullSpace2,

    // 线性方程组
    solve2: solve2,

    // 多边形 / 角度
    polygonArea: polygonArea,
    unitSquarePoints: unitSquarePoints,
    unitCirclePoints: unitCirclePoints,
    toRadians: toRadians,
    toDegrees: toDegrees,
    normalizeAngle: normalizeAngle,

    // 3D：mat3 与透视
    mat3: mat3,
    identity3: identity3,
    multiplyMat3: multiplyMat3,
    applyMat3: applyMat3,
    dot3: dot3,
    rotationX3: rotationX3,
    rotationY3: rotationY3,
    projectPoint3: projectPoint3
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = LinAlg;
  }
  if (global) {
    global.LinAlg = LinAlg;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
