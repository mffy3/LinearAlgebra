/**
 * eigenvector.js · 特征向量展厅的讲解员
 *
 * 这一页回答：哪些方向经过矩阵之后，方向不变、只改变长度？
 *
 * 状态只有矩阵 A 和探测向量 v。特征值、特征向量、夹角、叉积
 * 都由 math.js 计算；绘图只负责把“不转向”的几何关系画出来。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;

  if (!L || !K) {
    console.error('[eigenvector] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('eigen-canvas');
  var canvasWrap = document.getElementById('canvas-wrap');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10.5, padding: 34 });

  var ELEMENT_LIMIT = 8;
  var PROBE_LIMIT = 6;
  var EPS = 1e-9;
  var COLLINEAR_SIN = 0.02; // 约 1.15°
  var INITIAL_MATRIX = L.mat2(2, 1, 1, 2);
  var INITIAL_PROBE = { x: 1, y: 0 };

  var PRESETS = {
    symmetric: L.mat2(2, 1, 1, 2),
    rotate90: L.rotation(Math.PI / 2),
    shear: L.shear(1, 0),
    diagonal: L.mat2(3, 0, 0, -2),
    projection: L.mat2(0.5, 0.5, 0.5, 0.5),
    reflection: L.mat2(0, 1, 1, 0),
    identity: L.identity()
  };

  var state = {
    matrix: copyMatrix(INITIAL_MATRIX),
    drawn: copyMatrix(INITIAL_MATRIX),
    probe: { x: INITIAL_PROBE.x, y: INITIAL_PROBE.y },
    animation: null,
    dragging: null,
    showGrid: true,
    showEigen: false,
    showBasis: false
  };

  var els = {
    inputs: {
      a: document.getElementById('matrix-a'),
      b: document.getElementById('matrix-b'),
      c: document.getElementById('matrix-c'),
      d: document.getElementById('matrix-d')
    },
    probeX: document.getElementById('probe-x'),
    probeY: document.getElementById('probe-y'),
    canvasEigen: document.getElementById('canvas-eigen'),
    readoutEigen1: document.getElementById('readout-eigen1'),
    readoutEigen2: document.getElementById('readout-eigen2'),
    readoutAngle: document.getElementById('readout-angle'),
    readoutRatio: document.getElementById('readout-ratio'),
    readoutDet: document.getElementById('readout-det'),
    readoutTrace: document.getElementById('readout-trace'),
    footProbe: document.getElementById('foot-probe'),
    footImage: document.getElementById('foot-image'),
    footRatio: document.getElementById('foot-ratio'),
    footStatus: document.getElementById('foot-status'),
    calcV: document.getElementById('calc-v'),
    calcAv: document.getElementById('calc-av'),
    calcRatio: document.getElementById('calc-ratio'),
    calcCross: document.getElementById('calc-cross'),
    eigenNote: document.getElementById('eigen-note'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeAngle: document.getElementById('challenge-angle'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    toggleGrid: document.getElementById('toggle-grid'),
    toggleEigen: document.getElementById('toggle-eigen'),
    toggleBasis: document.getElementById('toggle-basis'),
    btnReplay: document.getElementById('btn-replay'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-eigen]')),
    quizFeedback: document.getElementById('quiz-feedback')
  };

  var rafId = null;

  /* ------------------------------------------------------------------ *
   * 基础
   * ------------------------------------------------------------------ */

  function copyMatrix(m) {
    return L.mat2(m.a, m.b, m.c, m.d);
  }

  function roundTo(value, digits) {
    var p = Math.pow(10, digits);
    return Math.round(value * p) / p;
  }

  function snapZero(value) {
    return Math.abs(value) < 0.035 ? 0 : value;
  }

  function clampElement(value) {
    return L.clamp(roundTo(value, 2), -ELEMENT_LIMIT, ELEMENT_LIMIT);
  }

  function clampProbe(value) {
    return L.clamp(roundTo(value, 2), -PROBE_LIMIT, PROBE_LIMIT);
  }

  function clampMatrix(m) {
    return L.mat2(
      clampElement(m.a),
      clampElement(m.b),
      clampElement(m.c),
      clampElement(m.d)
    );
  }

  function isReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function syncInputs(m) {
    var values = { a: m.a, b: m.b, c: m.c, d: m.d };
    Object.keys(els.inputs).forEach(function (key) {
      var input = els.inputs[key];
      if (input && document.activeElement !== input) {
        input.value = L.formatInput(values[key]);
      }
    });
  }

  function syncProbeInputs(probe) {
    if (els.probeX && document.activeElement !== els.probeX) {
      els.probeX.value = L.formatInput(probe.x);
    }
    if (els.probeY && document.activeElement !== els.probeY) {
      els.probeY.value = L.formatInput(probe.y);
    }
  }

  function setClass(el, className, on) {
    if (!el) return;
    el.classList.toggle(className, !!on);
  }

  /* ------------------------------------------------------------------ *
   * 几何
   * ------------------------------------------------------------------ */

  function computeGeometry(m) {
    var eig = L.eigen2(m);
    var c1 = L.applyMat(m, { x: 1, y: 0 });
    var c2 = L.applyMat(m, { x: 0, y: 1 });
    var det = L.determinant(m);
    var trace = L.trace(m);
    var rank = L.rank(m);
    var isScalar = L.isScalar(m);
    var isZero = rank === 0;

    var v = state.probe;
    var vLen = L.length(v);
    var image = L.applyMat(m, v);
    var imageLen = L.length(image);
    var dot = L.dot(v, image);
    var cross = L.cross(v, image);
    var sin = (vLen > EPS && imageLen > EPS) ? Math.abs(cross) / (vLen * imageLen) : 0;
    var cos = (vLen > EPS && imageLen > EPS) ? L.clamp(dot / (vLen * imageLen), -1, 1) : 1;
    var angle = imageLen > EPS ? Math.acos(cos) * 180 / Math.PI : null;
    var ratio = vLen > 0.05 ? imageLen / vLen : null;
    var collinear = vLen > 0.1 && (imageLen < 0.01 || sin < COLLINEAR_SIN);
    var minAngle = angle == null ? null : Math.min(angle, 180 - angle);

    return {
      eig: eig,
      c1: c1,
      c2: c2,
      det: det,
      trace: trace,
      rank: rank,
      isScalar: isScalar,
      isZero: isZero,
      vLen: vLen,
      image: image,
      imageLen: imageLen,
      dot: dot,
      cross: cross,
      angle: angle,
      minAngle: minAngle,
      ratio: ratio,
      collinear: collinear
    };
  }

  function eigenValueText(eig, index) {
    if (!eig.real) {
      var value = eig.values[index];
      var sign = value.im >= 0 ? '+' : '−';
      return L.formatFixed(value.re, 2) + ' ' + sign + ' ' + L.formatFixed(Math.abs(value.im), 2) + 'i';
    }
    return L.formatFixed(eig.values[index].re, 2);
  }

  function eigenSummary(eig, rank, isScalar) {
    if (rank === 0) return '0';
    if (!eig.real) {
      return L.formatFixed(eig.values[0].re, 2) + ' ± ' + L.formatFixed(Math.abs(eig.values[0].im), 2) + 'i';
    }
    if (isScalar) {
      return L.formatFixed(eig.values[0].re, 2);
    }
    return L.formatFixed(eig.values[0].re, 2) + ', ' + L.formatFixed(eig.values[1].re, 2);
  }

  /* ------------------------------------------------------------------ *
   * 读数
   * ------------------------------------------------------------------ */

  function updateProfessor(g, repeated) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    if (!textEl || !promptEl || !window.LinAlgNarration) return;

    var note = window.LinAlgNarration.eigen({
      collinear: g.collinear,
      real: g.eig.real,
      zero: g.isZero,
      scalar: g.isScalar,
      repeated: repeated,
      ratio: g.ratio || 0,
      negative: g.dot < 0,
      lambda: g.eig.values[0].re
    });

    if (textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;

    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateReadouts() {
    var m = state.matrix;
    var g = computeGeometry(m);
    var eig = g.eig;
    var real = eig.real;
    var repeated = real && Math.abs(eig.values[0].re - eig.values[1].re) <= 1e-8;

    var e1Text = eigenValueText(eig, 0);
    var e2Text = eigenValueText(eig, 1);
    var angleText = g.imageLen < 0.01 ? 'Av = 0' : (g.angle == null ? '—' : L.formatFixed(g.angle, 1) + '°');
    var ratioText = g.ratio == null ? '—' : L.formatFixed(g.ratio, 2);

    els.canvasEigen.textContent = eigenSummary(eig, g.rank, g.isScalar);
    els.readoutEigen1.textContent = e1Text;
    els.readoutEigen2.textContent = e2Text;
    els.readoutAngle.textContent = angleText;
    els.readoutRatio.textContent = ratioText;
    els.readoutDet.textContent = L.formatFixed(g.det, 2);
    els.readoutTrace.textContent = L.formatFixed(g.trace, 2);

    els.footProbe.textContent = '(' + L.formatFixed(state.probe.x, 2) + ', ' + L.formatFixed(state.probe.y, 2) + ')';
    els.footImage.textContent = '(' + L.formatFixed(g.image.x, 2) + ', ' + L.formatFixed(g.image.y, 2) + ')';
    els.footRatio.textContent = ratioText;
    els.footStatus.textContent = g.collinear ? '共线（特征方向）' : '未对齐';
    setClass(els.footStatus, 'is-positive', g.collinear);

    els.calcV.textContent = '(' + L.formatFixed(state.probe.x, 2) + ', ' + L.formatFixed(state.probe.y, 2) + ')';
    els.calcAv.textContent = '(' + L.formatFixed(g.image.x, 2) + ', ' + L.formatFixed(g.image.y, 2) + ')';
    els.calcRatio.textContent = ratioText;
    els.calcCross.textContent = L.formatFixed(g.cross, 2);

    // 只给实特征值上颜色；复特征值保持中性。
    if (real) {
      setClass(els.readoutEigen1, 'is-negative', eig.values[0].re < -EPS);
      setClass(els.readoutEigen1, 'is-zero', Math.abs(eig.values[0].re) <= EPS);
      setClass(els.readoutEigen1, 'is-positive', eig.values[0].re > EPS);
      setClass(els.readoutEigen2, 'is-negative', eig.values[1].re < -EPS);
      setClass(els.readoutEigen2, 'is-zero', Math.abs(eig.values[1].re) <= EPS);
      setClass(els.readoutEigen2, 'is-positive', eig.values[1].re > EPS);
    } else {
      setClass(els.readoutEigen1, 'is-negative', false);
      setClass(els.readoutEigen1, 'is-zero', false);
      setClass(els.readoutEigen1, 'is-positive', false);
      setClass(els.readoutEigen2, 'is-negative', false);
      setClass(els.readoutEigen2, 'is-zero', false);
      setClass(els.readoutEigen2, 'is-positive', false);
    }
    setClass(els.readoutDet, 'is-zero', Math.abs(g.det) <= EPS);
    setClass(els.readoutDet, 'is-negative', g.det < -EPS);
    setClass(els.readoutDet, 'is-positive', g.det > EPS);

    var note = '';
    if (g.isZero) {
      note = '零矩阵：所有方向都被压成 0；每个非零方向都是特征向量（λ = 0）。';
    } else if (g.isScalar) {
      note = '所有方向都是特征方向（λ = ' + L.formatFixed(eig.values[0].re, 2) + '）；整个平面被同一个倍数缩放。';
    } else if (!eig.real) {
      note = '复特征值：没有实特征方向。空间在旋转，而不是沿某条线拉伸。';
    } else {
      note = repeated
        ? '重根：只有一个独立特征方向（缺陷矩阵）。打开图层可以看到那条“不转向”的线。'
        : '有两条实特征方向。打开图层查看，或拖动 v 自己找。';
    }
    els.eigenNote.textContent = note;
    setClass(els.eigenNote, 'is-complex', !eig.real && !g.isZero);
    setClass(els.eigenNote, 'is-scalar', g.isScalar || g.isZero);

    // 挑战：找到共线方向
    var achieved = g.collinear;
    var progress = 0;
    if (achieved) {
      progress = 100;
    } else if (g.minAngle != null) {
      progress = Math.max(0, Math.min(100, 100 - g.minAngle * 5));
    }

    els.challengeCard.classList.toggle('is-complete', achieved);
    els.challengeState.textContent = achieved ? '达成' : (g.minAngle != null && g.minAngle < 5 ? '接近' : '进行中');
    els.challengeAngle.textContent = g.imageLen < 0.01 ? 'Av = 0' : (g.angle == null ? '—' : L.formatFixed(g.angle, 1) + '°');
    els.challengeFill.style.width = progress.toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    updateProfessor(g, repeated);
  }

  /* ------------------------------------------------------------------ *
   * 绘图
   * ------------------------------------------------------------------ */

  function identityMap(point) {
    return point;
  }

  function computeGridRange(m) {
    var rank = L.rank(m);
    if (rank < 2) return 18;

    var col1 = Math.hypot(m.a, m.c);
    var col2 = Math.hypot(m.b, m.d);
    var minCol = Math.min(col1, col2);

    if (!Number.isFinite(minCol) || minCol < 0.02) return 24;
    return Math.max(10, Math.min(110, Math.ceil(8 / minCol) + 2));
  }

  function fitWorldSpan() {
    var target = view.width < 560 ? 7 : 8.8;
    if (view.worldSpan !== target) {
      view.worldSpan = target;
      view.resize();
    }
  }

  function drawGhostGrid(ctx) {
    K.drawGrid(ctx, view, identityMap, {
      range: 11,
      minor: K.PALETTE.gridGhost,
      major: K.PALETTE.gridGhost,
      lineWidth: 0.8,
      majorWidth: 0.9,
      dash: [3, 6]
    });
    K.drawAxes(ctx, view, identityMap, {
      range: 12,
      color: K.PALETTE.axisGhost,
      lineWidth: 1,
      dash: [3, 6]
    });
  }

  function drawEigenLine(ctx, direction, lambda, index) {
    var far = L.scaleVec(direction, 7);
    var near = L.scaleVec(direction, -7);
    K.drawWorldLine(ctx, view, near, far, {
      stroke: 'rgba(164, 92, 85, 0.55)',
      lineWidth: 1.6,
      dash: [7, 6]
    });

    var labelPoint = L.scaleVec(direction, 4.2);
    var screen = view.worldToScreen(labelPoint);
    if (view.contains(screen, 44)) {
      K.drawLabel(ctx, screen.x, screen.y, 'λ' + (index === 0 ? '₁' : '₂') + ' = ' + L.formatFixed(lambda, 2), {
        color: '#a45c55',
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(164, 92, 85, 0.22)',
        align: 'center',
        font: '500 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
      });
    }
  }

  function drawEigenDirections(ctx, m, g) {
    if (!state.showEigen) return;

    if (g.isZero || g.isScalar) {
      var note = g.isZero ? '所有方向 → 0' : '所有方向都是特征方向';
      K.drawLabel(ctx, 22, 24, note, {
        color: '#a45c55',
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(164, 92, 85, 0.22)',
        font: '500 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
      });
      return;
    }

    if (!g.eig.real) {
      K.drawLabel(ctx, 22, 24, '无实特征方向', {
        color: '#a45c55',
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(164, 92, 85, 0.22)',
        font: '500 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
      });
      return;
    }

    var used = [];
    for (var i = 0; i < g.eig.vectors.length; i++) {
      var vector = g.eig.vectors[i];
      if (!vector || L.length(vector) < 0.5) continue;
      var duplicate = used.some(function (u) {
        return Math.abs(L.dot(u, vector)) > 0.999;
      });
      if (duplicate) continue;
      used.push(vector);
      drawEigenLine(ctx, vector, g.eig.values[i].re, i);
    }
  }

  function drawBasis(ctx, m) {
    var origin = { x: 0, y: 0 };
    var e1 = L.applyMat(m, { x: 1, y: 0 });
    var e2 = L.applyMat(m, { x: 0, y: 1 });

    K.drawArrowWorld(ctx, view, origin, e1, {
      color: 'rgba(116, 134, 118, 0.45)',
      lineWidth: 1.4,
      head: 9,
      headWidth: 5,
      label: 'e₁′',
      labelColor: 'rgba(116, 134, 118, 0.8)',
      labelOffset: { x: 10, y: -11 }
    });
    K.drawArrowWorld(ctx, view, origin, e2, {
      color: 'rgba(176, 125, 110, 0.45)',
      lineWidth: 1.4,
      head: 9,
      headWidth: 5,
      label: 'e₂′',
      labelColor: 'rgba(176, 125, 110, 0.8)',
      labelOffset: { x: 10, y: -11 }
    });
  }

  function drawProbe(ctx, m, g) {
    var origin = { x: 0, y: 0 };

    if (g.vLen > 0.05) {
      K.drawArrowWorld(ctx, view, origin, state.probe, {
        color: K.PALETTE.circle,
        lineWidth: 2.3,
        head: 11,
        headWidth: 5.5,
        label: 'v',
        labelColor: K.PALETTE.circle,
        labelOffset: { x: 12, y: -12 }
      });
    }

    if (g.imageLen > 0.03) {
      K.drawArrowWorld(ctx, view, origin, g.image, {
        color: K.PALETTE.blue,
        lineWidth: 2.4,
        head: 11,
        headWidth: 5.5,
        label: 'Av',
        labelColor: K.PALETTE.blue,
        labelOffset: { x: 12, y: 13 }
      });
    } else {
      var p = view.worldToScreen(origin);
      ctx.save();
      ctx.strokeStyle = K.PALETTE.blue;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      K.drawLabel(ctx, p.x + 14, p.y + 14, 'Av = 0', {
        color: K.PALETTE.blue,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(116, 134, 118, 0.22)',
        font: '500 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
      });
    }

    // 找到共线方向时，给一条很淡的红色参考线（图层关闭时也不抢戏）。
    if (g.collinear && !state.showEigen && g.vLen > 0.1) {
      var dir = L.normalize(state.probe);
      K.drawWorldLine(ctx, view, L.scaleVec(dir, -7), L.scaleVec(dir, 7), {
        stroke: 'rgba(164, 92, 85, 0.2)',
        lineWidth: 1.2,
        dash: [2, 7]
      });
    }

    K.drawPointWorld(ctx, view, origin, {
      radius: 3.2,
      fill: '#2e312c'
    });
  }

  function draw() {
    view.resize();
    fitWorldSpan();

    var ctx = view.ctx;
    var m = state.drawn;
    var g = computeGeometry(m);
    var map = function (point) {
      return L.applyMat(m, point);
    };

    K.drawBackdrop(ctx, view);

    if (state.showGrid) {
      drawGhostGrid(ctx);
      K.drawGrid(ctx, view, map, {
        range: computeGridRange(m),
        minor: 'rgba(46, 49, 44, 0.055)',
        major: 'rgba(46, 49, 44, 0.09)',
        lineWidth: 0.8,
        majorWidth: 1.05
      });
      K.drawAxes(ctx, view, map, {
        range: computeGridRange(m),
        color: 'rgba(46, 49, 44, 0.32)',
        lineWidth: 1.15
      });
    }

    drawEigenDirections(ctx, m, g);
    if (state.showBasis) drawBasis(ctx, m);
    drawProbe(ctx, m, g);
  }

  function requestRender() {
    if (rafId == null) {
      rafId = window.requestAnimationFrame(frame);
    }
  }

  function frame(timestamp) {
    rafId = null;

    if (state.animation) {
      var animation = state.animation;
      var t = K.clamp01((timestamp - animation.start) / animation.duration);
      state.drawn = L.lerpMat(animation.from, animation.to, K.easeInOutCubic(t));

      if (t >= 1) {
        state.drawn = animation.to;
        state.animation = null;
      }

      draw();
      if (state.animation) requestRender();
      return;
    }

    draw();
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */

  function setMatrix(matrix, options) {
    var opts = options || {};
    var target = clampMatrix(matrix);
    state.matrix = target;
    syncInputs(target);

    if (opts.animate && !isReducedMotion()) {
      state.animation = {
        from: opts.from ? clampMatrix(opts.from) : state.drawn,
        to: target,
        start: performance.now(),
        duration: opts.duration == null ? 720 : opts.duration
      };
    } else {
      state.drawn = target;
      state.animation = null;
    }

    updateReadouts();
    requestRender();
  }

  function setProbe(x, y) {
    state.probe = { x: clampProbe(x), y: clampProbe(y) };
    syncProbeInputs(state.probe);
    updateReadouts();
    requestRender();
  }

  function animateFrom(from, to) {
    var target = clampMatrix(to);
    state.matrix = target;
    syncInputs(target);

    if (isReducedMotion()) {
      state.drawn = target;
      state.animation = null;
    } else {
      state.animation = {
        from: clampMatrix(from),
        to: target,
        start: performance.now(),
        duration: 760
      };
    }

    updateReadouts();
    requestRender();
  }

  function readInput(key, input) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;

    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;

    var matrix = copyMatrix(state.matrix);
    matrix[key] = clampElement(value);

    state.animation = null;
    state.matrix = matrix;
    state.drawn = matrix;
    updateReadouts();
    requestRender();
  }

  function readProbeAxis(axis, input) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;

    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;

    var probe = { x: state.probe.x, y: state.probe.y };
    probe[axis] = clampProbe(value);
    state.probe = probe;
    updateReadouts();
    requestRender();
  }

  /* ------------------------------------------------------------------ *
   * 拖动
   * ------------------------------------------------------------------ */

  function hitTestProbe(event) {
    if (L.length(state.probe) < 0.05) return false;
    var point = view.pointerPosition(event);
    return K.hitTestPoint(view, state.probe, point, 20);
  }

  function updateProbeFromPointer(event) {
    var screen = view.pointerPosition(event);
    var world = view.screenToWorld(screen);
    setProbe(snapZero(world.x), snapZero(world.y));
  }

  function endDrag(event) {
    if (!state.dragging) return;
    state.dragging = null;
    canvas.classList.remove('is-dragging');
    canvas.classList.remove('is-grabbable');
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  /* ------------------------------------------------------------------ *
   * 事件
   * ------------------------------------------------------------------ */

  Object.keys(els.inputs).forEach(function (key) {
    var input = els.inputs[key];
    if (!input) return;

    input.addEventListener('input', function () {
      readInput(key, input);
    });

    input.addEventListener('blur', function () {
      input.value = L.formatInput(state.matrix[key]);
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') input.blur();
    });
  });

  if (els.probeX) {
    els.probeX.addEventListener('input', function () {
      readProbeAxis('x', els.probeX);
    });
    els.probeX.addEventListener('blur', function () {
      els.probeX.value = L.formatInput(state.probe.x);
    });
    els.probeX.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') els.probeX.blur();
    });
  }

  if (els.probeY) {
    els.probeY.addEventListener('input', function () {
      readProbeAxis('y', els.probeY);
    });
    els.probeY.addEventListener('blur', function () {
      els.probeY.value = L.formatInput(state.probe.y);
    });
    els.probeY.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') els.probeY.blur();
    });
  }

  els.toggleGrid.addEventListener('change', function () {
    state.showGrid = els.toggleGrid.checked;
    requestRender();
  });

  els.toggleEigen.addEventListener('change', function () {
    state.showEigen = els.toggleEigen.checked;
    requestRender();
  });

  els.toggleBasis.addEventListener('change', function () {
    state.showBasis = els.toggleBasis.checked;
    requestRender();
  });

  els.btnReset.addEventListener('click', function () {
    setMatrix(INITIAL_MATRIX, { animate: true });
    setProbe(INITIAL_PROBE.x, INITIAL_PROBE.y);
  });

  els.btnReplay.addEventListener('click', function () {
    animateFrom(L.identity(), state.matrix);
  });

  document.querySelectorAll('[data-preset]').forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = PRESETS[button.getAttribute('data-preset')];
      if (preset) setMatrix(preset, { animate: true });
    });
  });

  canvas.addEventListener('pointerdown', function (event) {
    if (!hitTestProbe(event)) return;

    event.preventDefault();
    state.dragging = 'probe';
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    canvas.classList.remove('is-grabbable');
    updateProbeFromPointer(event);
  });

  canvas.addEventListener('pointermove', function (event) {
    if (state.dragging) {
      event.preventDefault();
      updateProbeFromPointer(event);
      return;
    }
    canvas.classList.toggle('is-grabbable', hitTestProbe(event));
  });

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', function () {
    if (!state.dragging) canvas.classList.remove('is-grabbable');
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    '0': {
      correct: true,
      text: '对。旋转 90° 把每个方向都转过 90°，没有非零向量留在原方向；λ = ±i。'
    },
    '1': {
      correct: false,
      text: '旋转 90° 连一个实特征方向都没有，不是一条。λ = ±i，没有实方向。'
    },
    '2': {
      correct: false,
      text: '两个实特征方向属于实特征值不同的矩阵；旋转 90° 的特征值是 ±i。'
    }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-eigen');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-eigen');
        option.classList.toggle('is-correct', value === '0' && answer === '0');
        option.classList.toggle('is-wrong', value === answer && answer !== '0');
        option.setAttribute('aria-pressed', String(value === answer));
      });

      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  els.btnQuizApply.addEventListener('click', function () {
    setMatrix(L.rotation(Math.PI / 2), { animate: true });
    if (stageCard) {
      stageCard.scrollIntoView({
        behavior: isReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  });

  /* ------------------------------------------------------------------ *
   * 自适应与启动
   * ------------------------------------------------------------------ */

  function handleResize() {
    view.resize();
    requestRender();
  }

  if (window.ResizeObserver) {
    var observer = new ResizeObserver(handleResize);
    observer.observe(canvasWrap || canvas);
  } else {
    window.addEventListener('resize', handleResize);
  }

  window.addEventListener('orientationchange', handleResize);

  (function applyFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var rawMatrix = params.get('m');
      if (rawMatrix) {
        var values = rawMatrix.split(',').map(Number);
        if (values.length === 4 && values.every(Number.isFinite)) {
          setMatrix(L.mat2(values[0], values[1], values[2], values[3]));
        }
      }
      var rawProbe = params.get('v');
      if (rawProbe) {
        var probe = rawProbe.split(',').map(Number);
        if (probe.length === 2 && probe.every(Number.isFinite)) {
          state.probe = { x: clampProbe(probe[0]), y: clampProbe(probe[1]) };
        }
      }
    } catch (error) {
      // URL 参数只是增强，不影响主流程。
    }
  })();

  syncInputs(state.matrix);
  syncProbeInputs(state.probe);
  updateReadouts();
  requestRender();
})();
