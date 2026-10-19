/**
 * transform.js · 矩阵变换展厅的讲解员
 *
 * 它只做三件事：
 * 1. 读取四个数字 / 拖动箭头，维护唯一的矩阵状态；
 * 2. 调用 math.js 算出 det、秩、特征值；
 * 3. 把结果交给 canvas-utils.js 画出来。
 *
 * 矩阵约定（与 math.js 一致）：
 *     A = | a  b |
 *         | c  d |
 * 列向量 e₁′ = (a, c)，e₂′ = (b, d)。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;

  if (!L || !K) {
    console.error('[transform] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('transform-canvas');
  var canvasWrap = document.getElementById('canvas-wrap');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10.5, padding: 34 });

  var TARGET_DET = 0.5;
  var TARGET_TOLERANCE = 0.02;
  var ELEMENT_LIMIT = 8;
  var EIGEN_EPS = 1e-9;

  var PRESETS = {
    identity: L.identity(),
    rotate90: L.rotation(Math.PI / 2),
    shear: L.shear(0.8, 0),
    'scale-half': L.scaling(0.5, 0.5),
    flip: L.mat2(-1, 0, 0, 1),
    singular: L.mat2(1, 2, 0.5, 1)
  };

  var state = {
    matrix: L.identity(),   // 输入框 / 读数对应的目标矩阵
    drawn: L.identity(),    // 画布当前实际绘制的矩阵（动画中会插值）
    animation: null,
    dragging: null,
    showGrid: true,
    showSquare: true,
    showCircle: false,
    showEigen: false,
    quizAnswer: null
  };

  var els = {
    inputs: {
      a: document.getElementById('matrix-a'),
      b: document.getElementById('matrix-b'),
      c: document.getElementById('matrix-c'),
      d: document.getElementById('matrix-d')
    },
    canvasDet: document.getElementById('canvas-det'),
    detChip: document.getElementById('canvas-det-chip'),
    readoutDet: document.getElementById('readout-det'),
    readoutArea: document.getElementById('readout-area'),
    readoutRank: document.getElementById('readout-rank'),
    readoutOrientation: document.getElementById('readout-orientation'),
    readoutE1: document.getElementById('readout-e1'),
    readoutE2: document.getElementById('readout-e2'),
    readoutEigen: document.getElementById('readout-eigen'),
    readoutEigenNote: document.getElementById('readout-eigen-note'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDet: document.getElementById('challenge-det'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    toggleGrid: document.getElementById('toggle-grid'),
    toggleSquare: document.getElementById('toggle-square'),
    toggleCircle: document.getElementById('toggle-circle'),
    toggleEigen: document.getElementById('toggle-eigen'),
    btnReplay: document.getElementById('btn-replay'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz]')),
    quizFeedback: document.getElementById('quiz-feedback')
  };

  var rafId = null;

  /* ------------------------------------------------------------------ *
   * 状态与格式化
   * ------------------------------------------------------------------ */

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

  function clampMatrix(m) {
    return L.mat2(
      clampElement(m.a),
      clampElement(m.b),
      clampElement(m.c),
      clampElement(m.d)
    );
  }

  function copyMatrix(m) {
    return L.mat2(m.a, m.b, m.c, m.d);
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

  /* ------------------------------------------------------------------ *
   * 读数与挑战
   * ------------------------------------------------------------------ */

  function setClass(el, className, on) {
    if (!el) return;
    el.classList.toggle(className, !!on);
  }

  function updateReadouts() {
    var m = state.matrix;
    var det = L.determinant(m);
    var absDet = Math.abs(det);
    var rank = L.rank(m);
    var eig = L.eigen2(m);
    var isZero = Math.abs(det) <= EIGEN_EPS;
    var isNegative = det < -EIGEN_EPS;
    var isScalar = L.isScalar(m);
    var repeated = eig.real && Math.abs(eig.values[0].re - eig.values[1].re) <= 1e-8;

    // det 浮层
    els.canvasDet.textContent = L.formatFixed(det, 2);
    setClass(els.detChip, 'is-negative', isNegative);
    setClass(els.detChip, 'is-zero', isZero);

    // 四个读数
    els.readoutDet.textContent = L.formatFixed(det, 2);
    setClass(els.readoutDet, 'is-negative', isNegative);
    setClass(els.readoutDet, 'is-zero', isZero);
    setClass(els.readoutDet, 'is-positive', !isNegative && !isZero);

    els.readoutArea.textContent = L.formatFixed(absDet, 2) + '×';
    setClass(els.readoutArea, 'is-zero', absDet <= EIGEN_EPS);

    els.readoutRank.textContent = String(rank);
    setClass(els.readoutRank, 'is-zero', rank === 0);
    setClass(els.readoutRank, 'is-rank-one', rank === 1);

    els.readoutOrientation.textContent = isZero ? '退化' : (isNegative ? '翻转' : '保持');
    setClass(els.readoutOrientation, 'is-negative', isNegative);
    setClass(els.readoutOrientation, 'is-zero', isZero);
    setClass(els.readoutOrientation, 'is-positive', !isNegative && !isZero);

    // 基向量
    els.readoutE1.textContent = '(' + L.formatFixed(m.a, 2) + ', ' + L.formatFixed(m.c, 2) + ')';
    els.readoutE2.textContent = '(' + L.formatFixed(m.b, 2) + ', ' + L.formatFixed(m.d, 2) + ')';

    // 特征值
    if (rank === 0) {
      els.readoutEigen.textContent = '0, 0';
      els.readoutEigenNote.textContent = '零矩阵：所有方向都被压成 0，没有可区分的特征方向。';
      setClass(els.readoutEigenNote, 'is-scalar', true);
      setClass(els.readoutEigenNote, 'is-complex', false);
    } else if (rank === 1) {
      els.readoutEigen.textContent = L.formatFixed(eig.values[0].re, 2) + ', ' +
        L.formatFixed(eig.values[1].re, 2);
      els.readoutEigenNote.textContent = '秩 = 1：平面被压成一条过原点的直线；λ = 0 的特征方向就是被压掉的方向（零空间）。';
      setClass(els.readoutEigenNote, 'is-complex', false);
      setClass(els.readoutEigenNote, 'is-scalar', false);
    } else if (isScalar) {
      els.readoutEigen.textContent = L.formatFixed(eig.values[0].re, 2);
      els.readoutEigenNote.textContent = '所有方向都是特征方向（λ = ' +
        L.formatFixed(eig.values[0].re, 2) + '）；每个向量都被同一个倍数缩放。';
      setClass(els.readoutEigenNote, 'is-scalar', true);
      setClass(els.readoutEigenNote, 'is-complex', false);
    } else if (!eig.real) {
      els.readoutEigen.textContent = L.formatFixed(eig.values[0].re, 2) + ' ± ' +
        L.formatFixed(Math.abs(eig.values[0].im), 2) + 'i';
      els.readoutEigenNote.textContent = '复特征值：没有实特征方向。空间在旋转，而不是沿某条线拉伸。';
      setClass(els.readoutEigenNote, 'is-complex', true);
      setClass(els.readoutEigenNote, 'is-scalar', false);
    } else {
      els.readoutEigen.textContent = L.formatFixed(eig.values[0].re, 2) + ', ' +
        L.formatFixed(eig.values[1].re, 2);
      els.readoutEigenNote.textContent = repeated
        ? '重根：只有一个独立特征方向（缺陷矩阵）。打开图层可以看到那条“不转向”的线。'
        : '实特征方向已用玫瑰色虚线标出；打开“特征方向”图层查看。';
      setClass(els.readoutEigenNote, 'is-complex', false);
      setClass(els.readoutEigenNote, 'is-scalar', false);
    }

    // 挑战
    var delta = Math.abs(det - TARGET_DET);
    var achieved = delta <= TARGET_TOLERANCE;
    var progress = achieved ? 100 : Math.max(0, Math.min(100, (1 - delta / 0.5) * 100));

    els.challengeCard.classList.toggle('is-complete', achieved);
    els.challengeState.textContent = achieved ? '达成' : (delta <= 0.15 ? '接近' : '进行中');
    els.challengeDet.textContent = L.formatFixed(det, 3);
    els.challengeFill.style.width = progress.toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));
  }

  /* ------------------------------------------------------------------ *
   * 渲染
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

  function drawGhostGrid(ctx, map) {
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

  function drawUnitSquare(ctx, map, det) {
    var original = L.unitSquarePoints();
    var transformed = original.map(map);

    // 原始方格：虚线参考
    K.drawWorldPolygon(ctx, view, original, {
      closed: true,
      stroke: 'rgba(148, 163, 184, 0.24)',
      lineWidth: 1,
      dash: [4, 5]
    });

    var negative = det < -1E-9;
    K.drawWorldPolygon(ctx, view, transformed, {
      closed: true,
      fill: negative ? 'rgba(251, 113, 133, 0.12)' : 'rgba(94, 234, 212, 0.12)',
      stroke: negative ? K.PALETTE.squareNegative : K.PALETTE.square,
      lineWidth: 1.7,
      glow: 10,
      glowColor: negative ? 'rgba(251, 113, 133, 0.45)' : 'rgba(94, 234, 212, 0.38)'
    });

    // 四个顶点，帮助看清格点去了哪里
    transformed.forEach(function (point) {
      K.drawPointWorld(ctx, view, point, {
        radius: 2.2,
        fill: negative ? K.PALETTE.squareNegative : K.PALETTE.square
      });
    });
  }

  function drawUnitCircle(ctx, map, rank) {
    var circle = L.unitCirclePoints(96);
    var transformed = circle.map(map);

    K.drawWorldPolygon(ctx, view, circle, {
      closed: true,
      stroke: 'rgba(251, 191, 36, 0.12)',
      lineWidth: 1,
      dash: [4, 6]
    });

    K.drawWorldPolygon(ctx, view, transformed, {
      closed: true,
      fill: rank === 2 ? 'rgba(251, 191, 36, 0.035)' : null,
      stroke: 'rgba(251, 191, 36, 0.5)',
      lineWidth: 1.25,
      dash: [6, 6]
    });
  }

  function drawEigenDirections(ctx, m, rank) {
    if (rank === 0 || L.isScalar(m)) return;

    var eig = L.eigen2(m);
    if (!eig.real) return;

    var used = [];
    var labels = ['λ₁', 'λ₂'];

    for (var i = 0; i < eig.vectors.length; i++) {
      var v = eig.vectors[i];
      if (!v || L.length(v) < 0.5) continue;

      var duplicate = used.some(function (u) {
        return Math.abs(L.dot(u, v)) > 0.999;
      });
      if (duplicate) continue;
      used.push(v);

      var lambda = eig.values[i].re;
      var far = L.scaleVec(v, 6.2);
      var near = L.scaleVec(v, -6.2);

      K.drawWorldLine(ctx, view, near, far, {
        stroke: 'rgba(251, 113, 133, 0.55)',
        lineWidth: 1.2,
        dash: [6, 6]
      });

      var labelPoint = L.scaleVec(v, 4.4);
      var screen = view.worldToScreen(labelPoint);
      if (view.contains(screen, 36)) {
        K.drawLabel(ctx, screen.x + 8, screen.y - 8, labels[i] + ' = ' + L.formatFixed(lambda, 2), {
          color: '#fda4af',
          background: 'rgba(7, 11, 18, 0.76)',
          border: 'rgba(251, 113, 133, 0.25)',
          font: '600 11px "Cascadia Code", Consolas, monospace',
          fontSize: 12
        });
      }
    }
  }

  function drawBasis(ctx, m) {
    var origin = { x: 0, y: 0 };
    var e1 = L.applyMat(m, { x: 1, y: 0 });
    var e2 = L.applyMat(m, { x: 0, y: 1 });

    // 原始基向量：很淡的参考
    K.drawArrowWorld(ctx, view, origin, { x: 1, y: 0 }, {
      color: 'rgba(94, 234, 212, 0.2)',
      lineWidth: 1,
      dash: [3, 4],
      head: 7,
      headWidth: 4
    });
    K.drawArrowWorld(ctx, view, origin, { x: 0, y: 1 }, {
      color: 'rgba(196, 181, 253, 0.2)',
      lineWidth: 1,
      dash: [3, 4],
      head: 7,
      headWidth: 4
    });

    // 变换后的基向量 = 矩阵的两列
    K.drawArrowWorld(ctx, view, origin, e1, {
      color: K.PALETTE.e1,
      lineWidth: 2.6,
      glow: 14,
      head: 12,
      headWidth: 6,
      label: 'e₁′',
      labelColor: K.PALETTE.e1,
      labelOffset: { x: 12, y: -13 }
    });
    K.drawArrowWorld(ctx, view, origin, e2, {
      color: K.PALETTE.e2,
      lineWidth: 2.6,
      glow: 14,
      head: 12,
      headWidth: 6,
      label: 'e₂′',
      labelColor: K.PALETTE.e2,
      labelOffset: { x: 12, y: -13 }
    });

    K.drawPointWorld(ctx, view, origin, {
      radius: 3.2,
      fill: '#e2e8f0'
    });
  }

  function fitWorldSpan() {
    var target = view.width < 560 ? 7.5 : 9.5;
    if (view.worldSpan !== target) {
      view.worldSpan = target;
      view.resize();
    }
  }

  function draw() {
    view.resize();
    fitWorldSpan();

    var ctx = view.ctx;
    var m = state.drawn;
    var det = L.determinant(m);
    var rank = L.rank(m);
    var map = function (point) {
      return L.applyMat(m, point);
    };

    K.drawBackdrop(ctx, view);

    if (state.showGrid) {
      drawGhostGrid(ctx, map);
      K.drawGrid(ctx, view, map, {
        range: computeGridRange(m),
        minor: K.PALETTE.grid,
        major: K.PALETTE.gridMajor,
        lineWidth: 1,
        majorWidth: 1.25
      });
      K.drawAxes(ctx, view, map, {
        range: computeGridRange(m),
        color: K.PALETTE.axis,
        lineWidth: 1.35
      });
    }

    if (state.showCircle) drawUnitCircle(ctx, map, rank);
    if (state.showSquare) drawUnitSquare(ctx, map, det);
    if (state.showEigen) drawEigenDirections(ctx, m, rank);

    drawBasis(ctx, m);
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
      var raw = (timestamp - animation.start) / animation.duration;
      var t = K.clamp01(raw);
      var eased = K.easeInOutCubic(t);

      state.drawn = L.lerpMat(animation.from, animation.to, eased);

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
   * 矩阵更新
   * ------------------------------------------------------------------ */

  function cancelAnimation() {
    state.animation = null;
    state.drawn = state.matrix;
  }

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

  /* ------------------------------------------------------------------ *
   * 拖动基向量
   * ------------------------------------------------------------------ */

  function currentTips() {
    return {
      e1: L.applyMat(state.drawn, { x: 1, y: 0 }),
      e2: L.applyMat(state.drawn, { x: 0, y: 1 })
    };
  }

  function hitTest(event) {
    var point = view.pointerPosition(event);
    var tips = currentTips();
    if (K.hitTestPoint(view, tips.e1, point, 18)) return 'e1';
    if (K.hitTestPoint(view, tips.e2, point, 18)) return 'e2';
    return null;
  }

  function updateFromPointer(event) {
    if (!state.dragging) return;

    var screen = view.pointerPosition(event);
    var world = view.screenToWorld(screen);
    var x = L.clamp(snapZero(roundTo(world.x, 2)), -ELEMENT_LIMIT, ELEMENT_LIMIT);
    var y = L.clamp(snapZero(roundTo(world.y, 2)), -ELEMENT_LIMIT, ELEMENT_LIMIT);

    var matrix = copyMatrix(state.matrix);
    if (state.dragging === 'e1') {
      matrix.a = x;
      matrix.c = y;
    } else {
      matrix.b = x;
      matrix.d = y;
    }

    state.animation = null;
    state.matrix = matrix;
    state.drawn = matrix;
    syncInputs(matrix);
    updateReadouts();
    requestRender();
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
   * 事件绑定
   * ------------------------------------------------------------------ */

  Object.keys(els.inputs).forEach(function (key) {
    var input = els.inputs[key];
    if (!input) return;

    input.addEventListener('input', function () {
      readInput(key, input);
    });

    input.addEventListener('change', function () {
      readInput(key, input);
    });

    input.addEventListener('blur', function () {
      input.value = L.formatInput(state.matrix[key]);
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        input.blur();
      }
    });
  });

  els.toggleGrid.addEventListener('change', function () {
    state.showGrid = els.toggleGrid.checked;
    requestRender();
  });

  els.toggleSquare.addEventListener('change', function () {
    state.showSquare = els.toggleSquare.checked;
    requestRender();
  });

  els.toggleCircle.addEventListener('change', function () {
    state.showCircle = els.toggleCircle.checked;
    requestRender();
  });

  els.toggleEigen.addEventListener('change', function () {
    state.showEigen = els.toggleEigen.checked;
    requestRender();
  });

  els.btnReset.addEventListener('click', function () {
    setMatrix(L.identity(), { animate: true });
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
    var hit = hitTest(event);
    if (!hit) return;

    event.preventDefault();
    state.animation = null;
    state.drawn = state.matrix;
    state.dragging = hit;

    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }
    canvas.classList.add('is-dragging');
    canvas.classList.remove('is-grabbable');
    updateFromPointer(event);
  });

  canvas.addEventListener('pointermove', function (event) {
    if (state.dragging) {
      event.preventDefault();
      updateFromPointer(event);
      return;
    }

    var hit = hitTest(event);
    canvas.classList.toggle('is-grabbable', !!hit);
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
    point: {
      correct: false,
      text: '只有当 A 是零矩阵时，整个平面才会被压成一个点。一般 det = 0 的矩阵秩为 1，会把平面压成一条线。'
    },
    half: {
      correct: false,
      text: '面积减半对应 |det| = 0.5，不是 0。det = 0 时单位方格的面积是 0，而不是 0.5。'
    },
    segment: {
      correct: true,
      text: '对。秩为 1 的矩阵把整个平面压到一条过原点的直线上，单位正方形也随之变成一条线段。'
    }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      state.quizAnswer = answer;

      els.quizOptions.forEach(function (option) {
        var optionAnswer = option.getAttribute('data-quiz');
        option.classList.toggle('is-correct', optionAnswer === 'segment' && answer === 'segment');
        option.classList.toggle('is-wrong', optionAnswer === answer && answer !== 'segment');
        option.setAttribute('aria-pressed', String(optionAnswer === answer));
      });

      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  els.btnQuizApply.addEventListener('click', function () {
    setMatrix(PRESETS.singular, { animate: true });
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

  // 可选：用 ?m=a,b,c,d 直接打开某个矩阵，方便课堂演示与截图。
  (function applyMatrixFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get('m');
      if (!raw) return;
      var values = raw.split(',').map(Number);
      if (values.length === 4 && values.every(Number.isFinite)) {
        setMatrix(L.mat2(values[0], values[1], values[2], values[3]));
      }
    } catch (error) {
      // URL 参数只是增强，不影响主流程。
    }
  })();

  syncInputs(state.matrix);
  updateReadouts();
  requestRender();
})();
