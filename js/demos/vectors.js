/**
 * vectors.js · 零基础第 0 课
 *
 * 两个箭头 u、v；系数 α、β；金色箭头 αu + βv。
 * 只使用向量加法与数乘，不引入矩阵。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[vectors] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('vectors-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 9.5, padding: 34 });
  var EPS = 1e-9;
  var LIMIT = 6;
  var TARGET = { x: 3.2, y: 2.4 };
  var LEVEL_FACTOR = window.LinAlgLevel ? window.LinAlgLevel.factor : 1;
  var REACH_TOL = 0.08 * LEVEL_FACTOR;

  var INITIAL = {
    u: { x: 2, y: 0 },
    v: { x: 0, y: 2 },
    alpha: 1,
    beta: 1
  };

  var PRESETS = {
    orthogonal: { u: { x: 2, y: 0 }, v: { x: 0, y: 2 }, alpha: 1, beta: 1 },
    collinear: { u: { x: 2, y: 1 }, v: { x: 4, y: 2 }, alpha: 1, beta: 0.5 },
    opposite: { u: { x: 2, y: 0 }, v: { x: -2, y: 0 }, alpha: 1, beta: 1 }
  };

  var state = {
    u: copyVector(INITIAL.u),
    v: copyVector(INITIAL.v),
    alpha: INITIAL.alpha,
    beta: INITIAL.beta,
    showSpan: true,
    dragging: null
  };

  var els = {
    ux: document.getElementById('u-x'),
    uy: document.getElementById('u-y'),
    vx: document.getElementById('v-x'),
    vy: document.getElementById('v-y'),
    alphaRange: document.getElementById('alpha-range'),
    alpha: document.getElementById('alpha'),
    betaRange: document.getElementById('beta-range'),
    beta: document.getElementById('beta'),
    toggleSpan: document.getElementById('toggle-span'),
    combo: document.getElementById('readout-combo'),
    uLen: document.getElementById('readout-u'),
    vLen: document.getElementById('readout-v'),
    distance: document.getElementById('readout-distance'),
    canvasStatus: document.getElementById('canvas-status'),
    chip: document.getElementById('vectors-chip'),
    hint: document.getElementById('vectors-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-vectors]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var ctx = null;
  var rafId = null;

  /* ------------------------------------------------------------------ *
   * 基础
   * ------------------------------------------------------------------ */

  function copyVector(v) {
    return { x: v.x, y: v.y };
  }

  function roundTo(value, digits) {
    var p = Math.pow(10, digits);
    return Math.round(value * p) / p;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampVector(v) {
    return {
      x: clamp(roundTo(v.x, 2), -LIMIT, LIMIT),
      y: clamp(roundTo(v.y, 2), -LIMIT, LIMIT)
    };
  }

  function clampCoefficient(value) {
    return clamp(roundTo(value, 2), -2, 2);
  }

  function isReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function syncVectorInputs() {
    if (els.ux) els.ux.value = L.formatInput(state.u.x);
    if (els.uy) els.uy.value = L.formatInput(state.u.y);
    if (els.vx) els.vx.value = L.formatInput(state.v.x);
    if (els.vy) els.vy.value = L.formatInput(state.v.y);
  }

  function syncCoefficientInputs() {
    if (els.alphaRange) els.alphaRange.value = String(state.alpha);
    if (els.alpha) els.alpha.value = L.formatInput(state.alpha);
    if (els.betaRange) els.betaRange.value = String(state.beta);
    if (els.beta) els.beta.value = L.formatInput(state.beta);
  }

  /* ------------------------------------------------------------------ *
   * 计算
   * ------------------------------------------------------------------ */

  function compute() {
    var alphaU = L.scaleVec(state.u, state.alpha);
    var betaV = L.scaleVec(state.v, state.beta);
    var w = L.addVec(alphaU, betaV);
    var uLen = L.length(state.u);
    var vLen = L.length(state.v);
    var cross = L.cross(state.u, state.v);
    var collinear = (uLen < 0.01 || vLen < 0.01) ||
      Math.abs(cross) <= 0.02 * uLen * vLen;
    var distance = L.distance(w, TARGET);

    return {
      alphaU: alphaU,
      betaV: betaV,
      w: w,
      uLen: uLen,
      vLen: vLen,
      cross: cross,
      collinear: collinear,
      distance: distance,
      reached: distance <= REACH_TOL
    };
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.combination({
      reached: data.reached,
      collinear: data.collinear,
      alpha: state.alpha,
      beta: state.beta
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    if (data.collinear) {
      els.hint.textContent = '两个箭头共线了；把其中一个拖出直线';
    } else if (data.reached) {
      els.hint.textContent = '命中目标；换一组 α、β 或拖动箭头再试';
    } else {
      els.hint.textContent = '拖动 u / v 的尖端，或调整 α、β';
    }
  }

  function updateReadouts() {
    var data = compute();
    var status = data.collinear ? '一条线' : '铺满平面';
    if (data.uLen < 0.01 || data.vLen < 0.01) status = '一个点';

    els.combo.textContent = '(' + L.formatFixed(data.w.x, 2) + ', ' + L.formatFixed(data.w.y, 2) + ')';
    els.uLen.textContent = L.formatFixed(data.uLen, 2);
    els.vLen.textContent = L.formatFixed(data.vLen, 2);
    els.distance.textContent = L.formatFixed(data.distance, 2);
    els.canvasStatus.textContent = status;

    els.canvasStatus.classList.remove('is-unique', 'is-none', 'is-infinite');
    els.canvasStatus.classList.add(data.collinear ? 'is-infinite' : 'is-unique');

    var achieved = data.reached;
    var progress = achieved ? 100 : Math.max(0, Math.min(100, 100 - data.distance * 22));

    els.challengeCard.classList.toggle('is-complete', achieved);
    els.challengeState.textContent = achieved ? '达成' : (data.distance < 0.5 ? '接近' : '进行中');
    els.challengeDistance.textContent = L.formatFixed(data.distance, 2);
    els.challengeFill.style.width = progress.toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    updateHint(data);
    updateProfessor(data);
    draw();
  }

  /* ------------------------------------------------------------------ *
   * 绘图
   * ------------------------------------------------------------------ */

  function identityMap(point) {
    return point;
  }

  function fitWorldSpan() {
    var target = view.width < 560 ? 7.5 : 9.5;
    if (view.worldSpan !== target) {
      view.worldSpan = target;
      view.resize();
    }
  }

  function drawTopLabel(text, color, index) {
    K.drawLabel(ctx, 22, 26 + (index || 0) * 23, text, {
      color: color,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.15)',
      font: '500 11px "Cascadia Code", Consolas, monospace',
      fontSize: 12
    });
  }

  function drawSpan(data) {
    if (!state.showSpan) return;

    var extent = 2.4;

    if (data.collinear) {
      K.drawWorldLine(ctx, view,
        L.scaleVec(state.u, -4),
        L.scaleVec(state.u, 4), {
          stroke: 'rgba(176, 125, 110, 0.28)',
          lineWidth: 1.2,
          dash: [5, 6]
        });
      return;
    }

    // 在 u、v 张成的平面上画一层稀疏的斜格与交点。
    for (var i = -3; i <= 3; i++) {
      var a = L.addVec(L.scaleVec(state.u, i), L.scaleVec(state.v, -extent));
      var b = L.addVec(L.scaleVec(state.u, i), L.scaleVec(state.v, extent));
      K.drawWorldLine(ctx, view, a, b, {
        stroke: 'rgba(46, 49, 44, 0.16)',
        lineWidth: 0.9
      });

      var c = L.addVec(L.scaleVec(state.v, i), L.scaleVec(state.u, -extent));
      var d = L.addVec(L.scaleVec(state.v, i), L.scaleVec(state.u, extent));
      K.drawWorldLine(ctx, view, c, d, {
        stroke: 'rgba(46, 49, 44, 0.16)',
        lineWidth: 0.9
      });
    }

    for (var gi = -3; gi <= 3; gi++) {
      for (var gj = -3; gj <= 3; gj++) {
        var p = L.addVec(L.scaleVec(state.u, gi), L.scaleVec(state.v, gj));
        var s = view.worldToScreen(p);
        if (!view.contains(s, 8)) continue;
        ctx.save();
        ctx.fillStyle = 'rgba(46, 49, 44, 0.26)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    K.drawWorldPolygon(ctx, view, [
      L.addVec(L.scaleVec(state.u, -extent), L.scaleVec(state.v, -extent)),
      L.addVec(L.scaleVec(state.u, extent), L.scaleVec(state.v, -extent)),
      L.addVec(L.scaleVec(state.u, extent), L.scaleVec(state.v, extent)),
      L.addVec(L.scaleVec(state.u, -extent), L.scaleVec(state.v, extent))
    ], {
      fill: 'rgba(191, 163, 106, 0.055)',
      stroke: 'rgba(46, 49, 44, 0.18)',
      lineWidth: 1,
      dash: [4, 6]
    });
  }

  function drawArrow(a, b, color, labelText, width) {
    K.drawArrowWorld(ctx, view, a, b, {
      color: color,
      lineWidth: width == null ? 2.2 : width,
      head: 10,
      headWidth: 5,
      label: labelText,
      labelColor: color,
      labelOffset: { x: 10, y: -12 }
    });
  }

  function drawComponents(data) {
    var origin = { x: 0, y: 0 };

    if (L.length(data.alphaU) > 0.02) {
      drawArrow(origin, data.alphaU, 'rgba(116, 134, 118, 0.35)', null, 1.3);
    }
    if (L.length(data.betaV) > 0.02) {
      drawArrow(origin, data.betaV, 'rgba(176, 125, 110, 0.35)', null, 1.3);
    }

    if (!data.collinear) {
      K.drawWorldPolygon(ctx, view, [
        origin,
        data.alphaU,
        data.w,
        data.betaV
      ], {
        fill: 'rgba(191, 163, 106, 0.06)',
        stroke: 'rgba(46, 49, 44, 0.16)',
        lineWidth: 1,
        dash: [4, 5]
      });
    }
  }

  function drawTarget(data) {
    K.drawPointWorld(ctx, view, TARGET, {
      radius: 8,
      fill: 'rgba(191, 163, 106, 0.18)',
      stroke: K.PALETTE.gold,
      strokeWidth: 1.6
    });
    K.drawPointWorld(ctx, view, TARGET, {
      radius: 3,
      fill: K.PALETTE.gold
    });

    var s = view.worldToScreen(TARGET);
    if (view.contains(s, 30)) {
      K.drawLabel(ctx, s.x + 13, s.y + 17, 'T', {
        color: K.PALETTE.gold,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(191, 163, 106, 0.3)',
        font: '600 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
      });
    }

    if (data.distance > 0.04) {
      K.drawWorldLine(ctx, view, data.w, TARGET, {
        stroke: 'rgba(176, 125, 110, 0.45)',
        lineWidth: 1.1,
        dash: [3, 4]
      });
    }
  }

  function draw() {
    view.resize();
    fitWorldSpan();
    ctx = view.ctx;

    K.drawBackdrop(ctx, view);
    K.drawGrid(ctx, view, identityMap, {
      range: 11,
      minor: 'rgba(46, 49, 44, 0.05)',
      major: 'rgba(46, 49, 44, 0.085)',
      lineWidth: 0.8,
      majorWidth: 1
    });
    K.drawAxes(ctx, view, identityMap, {
      range: 11,
      color: 'rgba(46, 49, 44, 0.28)',
      lineWidth: 1.1
    });

    var data = compute();
    var origin = { x: 0, y: 0 };

    drawSpan(data);
    drawComponents(data);

    drawArrow(origin, state.u, K.PALETTE.e1, 'u', 2.3);
    drawArrow(origin, state.v, K.PALETTE.e2, 'v', 2.3);
    K.drawArrowWorld(ctx, view, origin, data.w, {
      color: K.PALETTE.gold,
      lineWidth: 2.5,
      head: 11,
      headWidth: 5.5,
      label: 'αu + βv',
      labelColor: K.PALETTE.gold,
      labelOffset: { x: -10, y: -14 }
    });
    drawTarget(data);

    K.drawPointWorld(ctx, view, origin, {
      radius: 3.2,
      fill: K.PALETTE.origin
    });

    if (data.collinear) {
      drawTopLabel('共线 · 只能拼出一条线', K.PALETTE.warm, 0);
    } else if (data.reached) {
      drawTopLabel('命中目标 · α 和 β 找到了', K.PALETTE.accent || '#748676', 0);
    }
  }

  function requestRender() {
    if (rafId == null) rafId = window.requestAnimationFrame(frame);
  }

  function frame() {
    rafId = null;
    draw();
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */

  function setU(v) {
    state.u = clampVector(v);
    syncVectorInputs();
    updateReadouts();
  }

  function setV(v) {
    state.v = clampVector(v);
    syncVectorInputs();
    updateReadouts();
  }

  function setCoefficient(which, value) {
    var next = clampCoefficient(value);
    if (which === 'alpha') state.alpha = next;
    else state.beta = next;
    syncCoefficientInputs();
    updateReadouts();
  }

  function readVectorInput(axis, input, which) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;

    var vector = copyVector(which === 'u' ? state.u : state.v);
    vector[axis] = clamp(roundTo(value, 2), -LIMIT, LIMIT);
    if (which === 'u') state.u = vector;
    else state.v = vector;
    updateReadouts();
  }

  function readCoefficient(which, input) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    setCoefficient(which, value);
  }

  /* ------------------------------------------------------------------ *
   * 拖动
   * ------------------------------------------------------------------ */

  function hitTest(event) {
    var point = view.pointerPosition(event);
    if (K.hitTestPoint(view, state.u, point, 22)) return 'u';
    if (K.hitTestPoint(view, state.v, point, 22)) return 'v';
    return null;
  }

  function updateFromPointer(event) {
    var world = view.screenToWorld(view.pointerPosition(event));
    if (state.dragging === 'u') setU(world);
    else if (state.dragging === 'v') setV(world);
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

  if (els.ux) {
    els.ux.addEventListener('input', function () { readVectorInput('x', els.ux, 'u'); });
    els.ux.addEventListener('blur', function () { els.ux.value = L.formatInput(state.u.x); });
  }
  if (els.uy) {
    els.uy.addEventListener('input', function () { readVectorInput('y', els.uy, 'u'); });
    els.uy.addEventListener('blur', function () { els.uy.value = L.formatInput(state.u.y); });
  }
  if (els.vx) {
    els.vx.addEventListener('input', function () { readVectorInput('x', els.vx, 'v'); });
    els.vx.addEventListener('blur', function () { els.vx.value = L.formatInput(state.v.x); });
  }
  if (els.vy) {
    els.vy.addEventListener('input', function () { readVectorInput('y', els.vy, 'v'); });
    els.vy.addEventListener('blur', function () { els.vy.value = L.formatInput(state.v.y); });
  }

  if (els.alphaRange) {
    els.alphaRange.addEventListener('input', function () {
      setCoefficient('alpha', parseFloat(els.alphaRange.value));
    });
  }
  if (els.alpha) {
    els.alpha.addEventListener('input', function () { readCoefficient('alpha', els.alpha); });
    els.alpha.addEventListener('blur', function () { els.alpha.value = L.formatInput(state.alpha); });
  }
  if (els.betaRange) {
    els.betaRange.addEventListener('input', function () {
      setCoefficient('beta', parseFloat(els.betaRange.value));
    });
  }
  if (els.beta) {
    els.beta.addEventListener('input', function () { readCoefficient('beta', els.beta); });
    els.beta.addEventListener('blur', function () { els.beta.value = L.formatInput(state.beta); });
  }

  if (els.toggleSpan) {
    els.toggleSpan.addEventListener('change', function () {
      state.showSpan = els.toggleSpan.checked;
      requestRender();
    });
  }

  els.btnReset.addEventListener('click', function () {
    state.u = copyVector(INITIAL.u);
    state.v = copyVector(INITIAL.v);
    state.alpha = INITIAL.alpha;
    state.beta = INITIAL.beta;
    syncVectorInputs();
    syncCoefficientInputs();
    updateReadouts();
  });

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = PRESETS[button.getAttribute('data-preset')];
      if (!preset) return;
      state.u = copyVector(preset.u);
      state.v = copyVector(preset.v);
      state.alpha = preset.alpha;
      state.beta = preset.beta;
      syncVectorInputs();
      syncCoefficientInputs();
      updateReadouts();
    });
  });

  canvas.addEventListener('pointerdown', function (event) {
    var target = hitTest(event);
    if (!target) return;
    event.preventDefault();
    state.dragging = target;
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
    point: { correct: false, text: '一个点对应 α = β = 0；只要允许 α、β 变化，结果就不止一个点。' },
    line: { correct: false, text: '一条线是两个箭头共线时的结果；不共线时，组合会铺满平面。' },
    plane: { correct: true, text: '对。两个不共线的方向张成整个平面；α、β 取遍实数，就能到达平面上任意一点。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-vectors');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-vectors');
        option.classList.toggle('is-correct', value === 'plane' && answer === 'plane');
        option.classList.toggle('is-wrong', value === answer && answer !== 'plane');
        option.setAttribute('aria-pressed', String(value === answer));
      });

      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  els.btnQuizApply.addEventListener('click', function () {
    state.u = copyVector(PRESETS.orthogonal.u);
    state.v = copyVector(PRESETS.orthogonal.v);
    state.alpha = 1;
    state.beta = 1;
    syncVectorInputs();
    syncCoefficientInputs();
    updateReadouts();
    if (stageCard) {
      stageCard.scrollIntoView({
        behavior: isReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  });

  /* ------------------------------------------------------------------ *
   * 小图：两个方向张成平面
   * ------------------------------------------------------------------ */

  function drawQuiz() {
    var q = els.quizCanvas;
    if (!q) return;
    var qv = K.createViewport(q, { worldSpan: 6, padding: 18 });
    qv.resize();
    var qctx = qv.ctx;

    K.drawBackdrop(qctx, qv);
    K.drawGrid(qctx, qv, identityMap, {
      range: 7,
      minor: 'rgba(46, 49, 44, 0.045)',
      major: 'rgba(46, 49, 44, 0.08)',
      lineWidth: 0.7,
      majorWidth: 0.9
    });
    K.drawAxes(qctx, qv, identityMap, {
      range: 7,
      color: 'rgba(46, 49, 44, 0.25)',
      lineWidth: 1
    });

    for (var i = -3; i <= 3; i++) {
      for (var j = -3; j <= 3; j++) {
        var p = qv.worldToScreen({ x: i * 1.1, y: j * 1.1 });
        qctx.save();
        qctx.fillStyle = 'rgba(46, 49, 44, 0.12)';
        qctx.beginPath();
        qctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
        qctx.fill();
        qctx.restore();
      }
    }

    K.drawArrowWorld(qctx, qv, { x: 0, y: 0 }, { x: 2.6, y: 0.3 }, {
      color: K.PALETTE.e1,
      lineWidth: 2,
      head: 9,
      headWidth: 4.5,
      label: 'u',
      labelColor: K.PALETTE.e1,
      labelOffset: { x: 8, y: -10 }
    });
    K.drawArrowWorld(qctx, qv, { x: 0, y: 0 }, { x: 0.6, y: 2.4 }, {
      color: K.PALETTE.e2,
      lineWidth: 2,
      head: 9,
      headWidth: 4.5,
      label: 'v',
      labelColor: K.PALETTE.e2,
      labelOffset: { x: 8, y: 10 }
    });
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  function handleResize() {
    view.resize();
    requestRender();
    drawQuiz();
  }

  if (window.ResizeObserver) {
    new ResizeObserver(handleResize).observe(canvas.parentElement || canvas);
  } else {
    window.addEventListener('resize', handleResize);
  }
  window.addEventListener('orientationchange', handleResize);

  (function applyFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var rawU = params.get('u');
      var rawV = params.get('v');
      var rawA = params.get('a');
      var rawB = params.get('b');

      if (rawU) {
        var uv = rawU.split(',').map(Number);
        if (uv.length === 2 && uv.every(Number.isFinite)) state.u = clampVector({ x: uv[0], y: uv[1] });
      }
      if (rawV) {
        var vv = rawV.split(',').map(Number);
        if (vv.length === 2 && vv.every(Number.isFinite)) state.v = clampVector({ x: vv[0], y: vv[1] });
      }
      if (rawA) {
        var a = parseFloat(rawA);
        if (Number.isFinite(a)) state.alpha = clampCoefficient(a);
      }
      if (rawB) {
        var b = parseFloat(rawB);
        if (Number.isFinite(b)) state.beta = clampCoefficient(b);
      }
    } catch (error) {
      // URL 参数只是增强，不影响主流程。
    }
  })();

  syncVectorInputs();
  syncCoefficientInputs();
  updateReadouts();
  requestRender();
  drawQuiz();
})();
