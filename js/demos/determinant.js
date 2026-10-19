/**
 * determinant.js · 行列式展厅的讲解员
 *
 * 这一页只回答一件事：矩阵把单位正方形的面积放大了几倍？
 *
 * 数学约定（与 math.js 一致）：
 *     A = | a  b |
 *         | c  d |
 * 列向量 e₁′ = (a, c)，e₂′ = (b, d)；det(A) = ad − bc。
 *
 * 绘图只负责把“原来的单位方格”“变换后的平行四边形”“底和高”画出来；
 * 所有面积、长度、投影都由 math.js 计算。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;

  if (!L || !K) {
    console.error('[determinant] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('determinant-canvas');
  var canvasWrap = document.getElementById('canvas-wrap');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10.5, padding: 34 });

  var TARGET_AREA = 2;
  var TARGET_TOLERANCE = 0.02;
  var ELEMENT_LIMIT = 8;
  var EPS = 1e-9;

  var PRESETS = {
    identity: L.identity(),
    scale2: L.scaling(2, 2),
    shear: L.shear(1, 0),
    rotate30: L.rotation(Math.PI / 6),
    flip: L.mat2(-1, 0, 0, 1),
    collapse: L.mat2(1, 2, 0.5, 1)
  };

  var state = {
    matrix: L.identity(),
    drawn: L.identity(),
    animation: null,
    dragging: null,
    showGrid: true,
    showOriginal: true,
    showHeight: true
  };

  var els = {
    inputs: {
      a: document.getElementById('matrix-a'),
      b: document.getElementById('matrix-b'),
      c: document.getElementById('matrix-c'),
      d: document.getElementById('matrix-d')
    },
    canvasDet: document.getElementById('canvas-det'),
    canvasArea: document.getElementById('canvas-area'),
    detChip: document.getElementById('canvas-det-chip'),
    readoutDet: document.getElementById('readout-det'),
    readoutArea: document.getElementById('readout-area'),
    readoutBase: document.getElementById('readout-base'),
    readoutHeight: document.getElementById('readout-height'),
    readoutOrientation: document.getElementById('readout-orientation'),
    readoutRank: document.getElementById('readout-rank'),
    footBase: document.getElementById('foot-base'),
    footHeight: document.getElementById('foot-height'),
    footArea: document.getElementById('foot-area'),
    footOrientation: document.getElementById('foot-orientation'),
    calcDet: document.getElementById('calc-det'),
    calcArea: document.getElementById('calc-area'),
    calcBase: document.getElementById('calc-base'),
    calcHeight: document.getElementById('calc-height'),
    calcProduct: document.getElementById('calc-product'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeArea: document.getElementById('challenge-area'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    toggleGrid: document.getElementById('toggle-grid'),
    toggleOriginal: document.getElementById('toggle-original'),
    toggleHeight: document.getElementById('toggle-height'),
    btnReplay: document.getElementById('btn-replay'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-area]')),
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

  function setClass(el, className, on) {
    if (!el) return;
    el.classList.toggle(className, !!on);
  }

  /* ------------------------------------------------------------------ *
   * 几何：底、高、面积
   * ------------------------------------------------------------------ */

  function computeGeometry(m) {
    var c1 = L.applyMat(m, { x: 1, y: 0 });
    var c2 = L.applyMat(m, { x: 0, y: 1 });
    var det = L.determinant(m);
    var area = Math.abs(det);
    var len1 = L.length(c1);
    var len2 = L.length(c2);

    // 取较长的一条列向量作底，另一个向量用来量高。
    var baseIsFirst = len1 >= len2;
    var baseVec = baseIsFirst ? c1 : c2;
    var otherVec = baseIsFirst ? c2 : c1;
    var base = L.length(baseVec);
    var height = base > EPS ? area / base : 0;

    var projection = { x: 0, y: 0 };
    if (base > EPS) {
      var baseSq = L.dot(baseVec, baseVec);
      projection = L.scaleVec(baseVec, L.dot(otherVec, baseVec) / baseSq);
    }

    var square = L.unitSquarePoints().map(function (point) {
      return L.applyMat(m, point);
    });
    var signedArea = L.polygonArea(square);
    var centroid = L.scaleVec(L.addVec(c1, c2), 0.5);

    var isZero = Math.abs(det) <= 1e-9;
    var isNegative = det < -1e-9;
    var accent = isZero ? K.PALETTE.circle : (isNegative ? K.PALETTE.squareNegative : K.PALETTE.square);

    return {
      c1: c1,
      c2: c2,
      det: det,
      area: area,
      signedArea: signedArea,
      base: base,
      height: height,
      baseVec: baseVec,
      otherVec: otherVec,
      projection: projection,
      baseIsFirst: baseIsFirst,
      baseLabel: baseIsFirst ? 'e₁′' : 'e₂′',
      centroid: centroid,
      square: square,
      accent: accent,
      isZero: isZero,
      isNegative: isNegative,
      rank: L.rank(m)
    };
  }

  /* ------------------------------------------------------------------ *
   * 读数
   * ------------------------------------------------------------------ */

  function updateReadouts() {
    var m = state.matrix;
    var geometry = computeGeometry(m);
    var det = geometry.det;
    var area = geometry.area;
    var rank = geometry.rank;
    var orientation = geometry.isZero ? '退化' : (geometry.isNegative ? '翻转' : '保持');

    var detText = L.formatFixed(det, 2);
    var areaText = L.formatFixed(area, 2);
    var baseText = L.formatFixed(geometry.base, 2);
    var heightText = L.formatFixed(geometry.height, 2);
    var productText = L.formatFixed(geometry.base * geometry.height, 2);

    els.canvasDet.textContent = detText;
    els.canvasArea.textContent = areaText;
    els.detChip.classList.toggle('is-negative', geometry.isNegative);
    els.detChip.classList.toggle('is-zero', geometry.isZero);

    els.readoutDet.textContent = detText;
    els.readoutArea.textContent = areaText;
    els.readoutBase.textContent = baseText;
    els.readoutHeight.textContent = heightText;
    els.readoutOrientation.textContent = orientation;
    els.readoutRank.textContent = String(rank);

    setClass(els.readoutDet, 'is-negative', geometry.isNegative);
    setClass(els.readoutDet, 'is-zero', geometry.isZero);
    setClass(els.readoutDet, 'is-positive', !geometry.isNegative && !geometry.isZero);
    setClass(els.readoutArea, 'is-zero', area <= 1e-9);
    setClass(els.readoutOrientation, 'is-negative', geometry.isNegative);
    setClass(els.readoutOrientation, 'is-zero', geometry.isZero);
    setClass(els.readoutOrientation, 'is-positive', !geometry.isNegative && !geometry.isZero);
    setClass(els.readoutRank, 'is-zero', rank === 0);
    setClass(els.readoutRank, 'is-rank-one', rank === 1);

    els.footBase.textContent = baseText;
    els.footHeight.textContent = heightText;
    els.footArea.textContent = areaText;
    els.footOrientation.textContent = orientation;

    els.calcDet.textContent = detText;
    els.calcArea.textContent = areaText;
    els.calcBase.textContent = baseText;
    els.calcHeight.textContent = heightText;
    els.calcProduct.textContent = productText;

    // 挑战：让面积落在 2 附近
    var delta = Math.abs(area - TARGET_AREA);
    var achieved = delta <= TARGET_TOLERANCE;
    var progress = achieved ? 100 : Math.max(0, Math.min(100, (1 - delta / TARGET_AREA) * 100));

    els.challengeCard.classList.toggle('is-complete', achieved);
    els.challengeState.textContent = achieved ? '达成' : (delta <= 0.2 ? '接近' : '进行中');
    els.challengeArea.textContent = L.formatFixed(area, 3);
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

  function drawOriginalSquare(ctx) {
    K.drawWorldPolygon(ctx, view, L.unitSquarePoints(), {
      closed: true,
      stroke: 'rgba(29, 29, 31, 0.3)',
      lineWidth: 1.1,
      dash: [4, 5]
    });
  }

  function drawParallelogram(ctx, geometry) {
    K.drawWorldPolygon(ctx, view, geometry.square, {
      closed: true,
      fill: geometry.isNegative ? 'rgba(180, 35, 24, 0.16)' : (geometry.isZero ? 'rgba(180, 83, 9, 0.1)' : 'rgba(0, 102, 204, 0.16)'),
      stroke: geometry.accent,
      lineWidth: 2,
      glow: 14,
      glowColor: geometry.isNegative ? 'rgba(180, 35, 24, 0.42)' : (geometry.isZero ? 'rgba(180, 83, 9, 0.32)' : 'rgba(0, 102, 204, 0.42)')
    });

    // 四个顶点，帮助看清“角去了哪里”
    geometry.square.forEach(function (point) {
      K.drawPointWorld(ctx, view, point, {
        radius: 2.4,
        fill: geometry.accent
      });
    });
  }

  function drawRightAngle(ctx, geometry) {
    var foot = view.worldToScreen(geometry.projection);
    var baseScreen = view.worldToScreen(geometry.baseVec);
    var otherScreen = view.worldToScreen(geometry.otherVec);

    var ux = baseScreen.x;
    var uy = baseScreen.y;
    var ulen = Math.hypot(ux, uy);
    if (ulen < 1e-6) return;
    ux /= ulen;
    uy /= ulen;

    var nx = -uy;
    var ny = ux;
    if ((otherScreen.x - foot.x) * nx + (otherScreen.y - foot.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }

    var size = 9;
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 83, 9, 0.62)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(foot.x + ux * size, foot.y + uy * size);
    ctx.lineTo(foot.x + ux * size + nx * size, foot.y + uy * size + ny * size);
    ctx.lineTo(foot.x + nx * size, foot.y + ny * size);
    ctx.stroke();
    ctx.restore();
  }

  function drawHeight(ctx, geometry) {
    if (!state.showHeight || geometry.base <= EPS || geometry.area <= EPS) return;

    K.drawWorldLine(ctx, view, geometry.otherVec, geometry.projection, {
      stroke: 'rgba(180, 83, 9, 0.72)',
      lineWidth: 1.5,
      dash: [6, 5]
    });
    drawRightAngle(ctx, geometry);

    // 手机画布空间有限：保留高度线，隐藏底/高文字标签，读数在下方 stage-foot。
    if (view.width < 460) return;

    var mid = L.lerpVec(geometry.otherVec, geometry.projection, 0.55);
    var screen = view.worldToScreen(mid);
    if (view.contains(screen, 40)) {
      K.drawLabel(ctx, screen.x + 9, screen.y - 7, 'h', {
        color: '#b45309',
        background: 'rgba(255, 255, 255, 0.86)',
        border: 'rgba(180, 83, 9, 0.18)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
    }

    // 底边标签
    var baseMid = L.scaleVec(geometry.baseVec, 0.5);
    var baseNormal = L.normalize({ x: -geometry.baseVec.y, y: geometry.baseVec.x });
    var labelPoint = L.addVec(baseMid, L.scaleVec(baseNormal, -0.14));
    var baseScreen = view.worldToScreen(labelPoint);
    if (view.contains(baseScreen, 40)) {
      K.drawLabel(ctx, baseScreen.x, baseScreen.y, 'b', {
        color: '#b45309',
        background: 'rgba(255, 255, 255, 0.86)',
        border: 'rgba(180, 83, 9, 0.18)',
        align: 'center',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
    }
  }

  function drawBasis(ctx, geometry) {
    var origin = { x: 0, y: 0 };

    K.drawArrowWorld(ctx, view, origin, { x: 1, y: 0 }, {
      color: 'rgba(0, 102, 204, 0.18)',
      lineWidth: 1,
      dash: [3, 4],
      head: 7,
      headWidth: 4
    });
    K.drawArrowWorld(ctx, view, origin, { x: 0, y: 1 }, {
      color: 'rgba(191, 72, 0, 0.18)',
      lineWidth: 1,
      dash: [3, 4],
      head: 7,
      headWidth: 4
    });

    K.drawArrowWorld(ctx, view, origin, geometry.c1, {
      color: K.PALETTE.e1,
      lineWidth: 2.5,
      glow: 12,
      head: 12,
      headWidth: 6,
      label: 'e₁′',
      labelColor: K.PALETTE.e1,
      labelOffset: { x: 12, y: -13 }
    });
    K.drawArrowWorld(ctx, view, origin, geometry.c2, {
      color: K.PALETTE.e2,
      lineWidth: 2.5,
      glow: 12,
      head: 12,
      headWidth: 6,
      label: 'e₂′',
      labelColor: K.PALETTE.e2,
      labelOffset: { x: 12, y: -13 }
    });

    K.drawPointWorld(ctx, view, origin, {
      radius: 3.2,
      fill: '#1d1d1f'
    });
  }

  function draw() {
    view.resize();
    fitWorldSpan();

    var ctx = view.ctx;
    var m = state.drawn;
    var geometry = computeGeometry(m);
    var map = function (point) {
      return L.applyMat(m, point);
    };

    K.drawBackdrop(ctx, view);

    if (state.showGrid) {
      drawGhostGrid(ctx);
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

    if (state.showOriginal) drawOriginalSquare(ctx);
    drawParallelogram(ctx, geometry);
    drawHeight(ctx, geometry);
    drawBasis(ctx, geometry);
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
   * 矩阵更新
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
      if (event.key === 'Enter') input.blur();
    });
  });

  els.toggleGrid.addEventListener('change', function () {
    state.showGrid = els.toggleGrid.checked;
    requestRender();
  });

  els.toggleOriginal.addEventListener('change', function () {
    state.showOriginal = els.toggleOriginal.checked;
    requestRender();
  });

  els.toggleHeight.addEventListener('change', function () {
    state.showHeight = els.toggleHeight.checked;
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

    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
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
    canvas.classList.toggle('is-grabbable', !!hitTest(event));
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
    '1': {
      correct: false,
      text: 'det = 2×1 − 1×0 = 2，面积是 2；剪切分量不会把面积变成 1。'
    },
    '2': {
      correct: true,
      text: '对。底为 2、高为 1，面积 = 2；行列式也是 2。'
    },
    '3': {
      correct: false,
      text: 'det = 2，不是 3；矩阵 [[2,1],[0,1]] 的第二列只是把图形推斜，没有改变底和高。'
    }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-area');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-area');
        option.classList.toggle('is-correct', value === '2' && answer === '2');
        option.classList.toggle('is-wrong', value === answer && answer !== '2');
        option.setAttribute('aria-pressed', String(value === answer));
      });

      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  els.btnQuizApply.addEventListener('click', function () {
    setMatrix(L.mat2(2, 1, 0, 1), { animate: true });
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
