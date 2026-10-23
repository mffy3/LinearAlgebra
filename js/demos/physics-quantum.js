/**
 * physics-quantum.js · 物理应用 03：量子态叠加
 *
 * |ψ⟩ = α|0⟩ + β|1⟩
 * α = cosθ，β = sinθ·e^{iφ}
 * p(0) = |α|²，p(1) = |β|²
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[physics-quantum] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('quantum-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 11, padding: 30 });
  var LEVEL_FACTOR = window.LinAlgLevel ? window.LinAlgLevel.factor : 1;
  var TARGET_THETA = 45;
  var TARGET_TOL = 2.5 * LEVEL_FACTOR;

  var state = {
    theta: 30,
    phase: 0,
    dragging: null
  };

  var els = {
    thetaRange: document.getElementById('theta-range'),
    theta: document.getElementById('theta'),
    phaseRange: document.getElementById('phase-range'),
    phase: document.getElementById('phase'),
    thetaOut: document.getElementById('readout-theta'),
    phaseOut: document.getElementById('readout-phase'),
    p0: document.getElementById('readout-p0'),
    p1: document.getElementById('readout-p1'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('quantum-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-quantum]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var rafId = null;
  var ctx = null;

  var PLANES = {
    alpha: { x: -2.5, y: 1.2, radius: 1.6 },
    beta: { x: 2.5, y: 1.2, radius: 1.6 }
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeAngle(value) {
    var a = value % 360;
    return a < 0 ? a + 360 : a;
  }

  function isReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function compute() {
    var thetaRad = state.theta * Math.PI / 180;
    var phaseRad = state.phase * Math.PI / 180;
    var a = Math.cos(thetaRad);
    var bLen = Math.sin(thetaRad);
    var bRe = bLen * Math.cos(phaseRad);
    var bIm = bLen * Math.sin(phaseRad);
    var p0 = a * a;
    var p1 = bRe * bRe + bIm * bIm;
    var delta = Math.abs(state.theta - TARGET_THETA);

    return {
      a: a,
      bLen: bLen,
      bRe: bRe,
      bIm: bIm,
      p0: p0,
      p1: p1,
      delta: delta,
      achieved: delta <= TARGET_TOL,
      alphaPoint: { x: PLANES.alpha.x + a * PLANES.alpha.radius, y: PLANES.alpha.y },
      betaPoint: {
        x: PLANES.beta.x + bRe * PLANES.beta.radius,
        y: PLANES.beta.y + bIm * PLANES.beta.radius
      }
    };
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.quantum({
      theta: state.theta,
      phase: state.phase,
      p0: data.p0,
      p1: data.p1
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    if (data.achieved) {
      els.hint.textContent = '等概率叠加；转动 φ 不改变概率，只改变相位';
    } else {
      els.hint.textContent = '拖动 α 或 β 的箭头，或调整 θ、φ';
    }
  }

  function updateReadouts() {
    var data = compute();

    els.thetaOut.textContent = state.theta.toFixed(1) + '°';
    els.phaseOut.textContent = state.phase.toFixed(1) + '°';
    els.p0.textContent = L.formatFixed(data.p0, 2);
    els.p1.textContent = L.formatFixed(data.p1, 2);
    els.status.textContent = data.achieved ? '等概率 · 各 50%' : '归一化 · 概率和 1';

    var progress = data.achieved
      ? 100
      : Math.max(0, Math.min(100, 100 - data.delta / 45 * 100));

    els.challengeCard.classList.toggle('is-complete', data.achieved);
    els.challengeState.textContent = data.achieved ? '达成' : (data.delta <= 8 ? '接近' : '进行中');
    els.challengeDistance.textContent = L.formatFixed(Math.abs(data.p0 - data.p1), 2);
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

  function fillWorldRect(context, vp, rect) {
    var a = vp.worldToScreen({ x: rect.x, y: rect.y });
    var b = vp.worldToScreen({ x: rect.x + rect.w, y: rect.y + rect.h });
    context.fillRect(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(b.x - a.x),
      Math.abs(b.y - a.y)
    );
  }

  function fitWorldSpan() {
    var target = view.width < 560 ? 8.5 : 11;
    if (view.worldSpan !== target) {
      view.worldSpan = target;
      view.resize();
    }
  }

  function circlePoints(cx, cy, radius, count) {
    var points = [];
    var n = count || 72;
    for (var i = 0; i < n; i++) {
      var t = i / n * Math.PI * 2;
      points.push({ x: cx + Math.cos(t) * radius, y: cy + Math.sin(t) * radius });
    }
    return points;
  }

  function drawPlaneFrame(plane, label, valueLabel, color) {
    var cx = plane.x;
    var cy = plane.y;
    var radius = plane.radius;

    K.drawWorldPolygon(ctx, view, circlePoints(cx, cy, radius, 80), {
      fill: 'rgba(250, 246, 238, 0.16)',
      stroke: 'rgba(46, 49, 44, 0.18)',
      lineWidth: 1.1,
      dash: [4, 6]
    });

    K.drawWorldLine(ctx, view, { x: cx - radius, y: cy }, { x: cx + radius, y: cy }, {
      stroke: 'rgba(46, 49, 44, 0.24)',
      lineWidth: 1
    });
    K.drawWorldLine(ctx, view, { x: cx, y: cy - radius }, { x: cx, y: cy + radius }, {
      stroke: 'rgba(46, 49, 44, 0.24)',
      lineWidth: 1
    });

    K.drawLabel(ctx, view.worldToScreen({ x: cx, y: cy + radius + 0.36 }).x,
      view.worldToScreen({ x: cx, y: cy + radius + 0.36 }).y, label, {
        color: color,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.15)',
        font: '600 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
      });

    K.drawLabel(ctx, view.worldToScreen({ x: cx, y: cy - radius - 0.36 }).x,
      view.worldToScreen({ x: cx, y: cy - radius - 0.36 }).y, valueLabel, {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
  }

  function drawAxisArrow(plane, point, color, label, labelOffset) {
    K.drawArrowWorld(ctx, view, { x: plane.x, y: plane.y }, point, {
      color: color,
      lineWidth: 2.4,
      head: 10,
      headWidth: 5,
      label: label,
      labelColor: color,
      labelOffset: labelOffset
    });
    K.drawPointWorld(ctx, view, point, {
      radius: 6,
      fill: color,
      stroke: 'rgba(250, 246, 238, 0.96)',
      strokeWidth: 2
    });
  }

  function drawPhaseArc(data) {
    var plane = PLANES.beta;
    var origin = view.worldToScreen({ x: plane.x, y: plane.y });
    var theta = -state.phase * Math.PI / 180;
    ctx.save();
    ctx.strokeStyle = 'rgba(176, 125, 110, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 28, 0, theta, true);
    ctx.stroke();
    ctx.restore();
  }

  function drawProbabilityBars(data) {
    var y0 = -2.5;
    var barWidth = 3.4;
    var x0 = -3.8;
    var gap = 0.42;
    var h = 0.42;

    var p0End = x0 + barWidth * data.p0;
    var p1Start = x0 + barWidth + gap;
    var p1End = p1Start + barWidth * data.p1;

    ctx.save();
    ctx.fillStyle = 'rgba(46, 49, 44, 0.06)';
    fillWorldRect(ctx, view, { x: x0, y: y0, w: barWidth, h: h });
    fillWorldRect(ctx, view, { x: p1Start, y: y0, w: barWidth, h: h });
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(116, 134, 118, 0.72)';
    fillWorldRect(ctx, view, { x: x0, y: y0, w: Math.max(0, barWidth * data.p0), h: h });
    ctx.fillStyle = 'rgba(176, 125, 110, 0.72)';
    fillWorldRect(ctx, view, { x: p1Start, y: y0, w: Math.max(0, barWidth * data.p1), h: h });
    ctx.restore();

    K.drawLabel(ctx, view.worldToScreen({ x: x0, y: y0 + 0.32 }).x,
      view.worldToScreen({ x: x0, y: y0 + 0.32 }).y, 'p(0) = ' + L.formatFixed(data.p0, 2), {
        color: K.PALETTE.e1,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });

    K.drawLabel(ctx, view.worldToScreen({ x: p1Start, y: y0 + 0.32 }).x,
      view.worldToScreen({ x: p1Start, y: y0 + 0.32 }).y, 'p(1) = ' + L.formatFixed(data.p1, 2), {
        color: K.PALETTE.e2,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
  }

  function draw() {
    view.resize();
    fitWorldSpan();
    ctx = view.ctx;

    K.drawBackdrop(ctx, view);

    // 两个复平面之间只留一条很淡的分隔线。
    K.drawWorldLine(ctx, view, { x: 0, y: -0.6 }, { x: 0, y: 3.1 }, {
      stroke: 'rgba(46, 49, 44, 0.08)',
      lineWidth: 1,
      dash: [3, 7]
    });

    var data = compute();
    drawPlaneFrame(PLANES.alpha, 'α', 'α = ' + L.formatFixed(data.a, 2), K.PALETTE.e1);
    drawPlaneFrame(PLANES.beta, 'β', 'β = sinθ · e^{iφ}', K.PALETTE.e2);

    drawAxisArrow(PLANES.alpha, data.alphaPoint, K.PALETTE.e1, 'α', { x: 10, y: -14 });
    drawAxisArrow(PLANES.beta, data.betaPoint, K.PALETTE.e2, 'β', { x: 10, y: -14 });

    drawPhaseArc(data);
    drawProbabilityBars(data);

    K.drawLabel(ctx, 22, 26, '|α|² + |β|² = 1', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.12)',
      font: '500 10px "Cascadia Code", Consolas, monospace',
      fontSize: 11
    });

    if (data.achieved) {
      K.drawLabel(ctx, 22, 52, '等概率叠加 · p(0) = p(1)', {
        color: K.PALETTE.accent,
        background: 'rgba(227, 232, 221, 0.95)',
        border: 'rgba(116, 134, 118, 0.3)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
    }
  }

  function requestRender() {
    if (rafId == null) rafId = window.requestAnimationFrame(function () {
      rafId = null;
      draw();
    });
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */

  function syncInputs() {
    if (els.thetaRange) els.thetaRange.value = String(Math.round(state.theta));
    if (els.phaseRange) els.phaseRange.value = String(Math.round(state.phase));
    if (els.theta && document.activeElement !== els.theta) {
      els.theta.value = L.formatInput(state.theta);
    }
    if (els.phase && document.activeElement !== els.phase) {
      els.phase.value = L.formatInput(state.phase);
    }
  }

  function setTheta(value) {
    state.theta = clamp(value, 0, 90);
    syncInputs();
    updateReadouts();
  }

  function setPhase(value) {
    state.phase = normalizeAngle(value);
    syncInputs();
    updateReadouts();
  }

  function readNumber(input, min, max, setter) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    setter(clamp(value, min, max));
  }

  /* ------------------------------------------------------------------ *
   * 拖动
   * ------------------------------------------------------------------ */

  function hitTest(event) {
    var point = view.pointerPosition(event);
    var data = compute();
    if (K.hitTestPoint(view, data.alphaPoint, point, 24)) return 'alpha';
    if (K.hitTestPoint(view, data.betaPoint, point, 24)) return 'beta';
    return null;
  }

  function updateFromPointer(event) {
    if (!state.dragging) return;
    var world = view.screenToWorld(view.pointerPosition(event));
    if (state.dragging === 'alpha') {
      var dx = world.x - PLANES.alpha.x;
      var dy = world.y - PLANES.alpha.y;
      var radius = Math.sqrt(dx * dx + dy * dy);
      var a = clamp(radius / PLANES.alpha.radius, 0, 1);
      state.theta = Math.acos(a) * 180 / Math.PI;
    } else if (state.dragging === 'beta') {
      var bx = world.x - PLANES.beta.x;
      var by = world.y - PLANES.beta.y;
      var br = Math.sqrt(bx * bx + by * by);
      var b = clamp(br / PLANES.beta.radius, 0, 1);
      state.theta = Math.asin(b) * 180 / Math.PI;
      state.phase = normalizeAngle(Math.atan2(by, bx) * 180 / Math.PI);
    }
    syncInputs();
    updateReadouts();
  }

  function endDrag(event) {
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

  if (els.thetaRange) {
    els.thetaRange.addEventListener('input', function () {
      setTheta(parseFloat(els.thetaRange.value));
    });
  }
  if (els.phaseRange) {
    els.phaseRange.addEventListener('input', function () {
      setPhase(parseFloat(els.phaseRange.value));
    });
  }
  if (els.theta) {
    els.theta.addEventListener('input', function () {
      readNumber(els.theta, 0, 90, setTheta);
    });
    els.theta.addEventListener('blur', function () {
      els.theta.value = L.formatInput(state.theta);
    });
  }
  if (els.phase) {
    els.phase.addEventListener('input', function () {
      readNumber(els.phase, 0, 360, setPhase);
    });
    els.phase.addEventListener('blur', function () {
      els.phase.value = L.formatInput(state.phase);
    });
  }

  els.btnReset.addEventListener('click', function () {
    state.theta = 30;
    state.phase = 0;
    syncInputs();
    updateReadouts();
  });

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = button.getAttribute('data-preset');
      if (preset === 'zero') {
        setTheta(0);
        setPhase(0);
      } else if (preset === 'one') {
        setTheta(90);
        setPhase(0);
      } else if (preset === 'plus') {
        setTheta(45);
        setPhase(0);
      } else if (preset === 'minus') {
        setTheta(45);
        setPhase(180);
      }
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

  canvas.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setTheta(state.theta + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 5 : 1));
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      setPhase(state.phase + (event.key === 'ArrowUp' ? 5 : -5) * (event.shiftKey ? 4 : 1));
    }
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    '0': { correct: false, text: 'p(0) = 0 只发生在 θ = 90°，也就是 |1⟩。' },
    '0.5': { correct: true, text: '对。θ = 45° 时 α = β = 1/√2，所以 p(0) = p(1) = 0.5。' },
    '1': { correct: false, text: 'p(0) = 1 只发生在 θ = 0°，也就是 |0⟩。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-quantum');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-quantum');
        option.classList.toggle('is-correct', value === '0.5' && answer === '0.5');
        option.classList.toggle('is-wrong', value === answer && answer !== '0.5');
        option.setAttribute('aria-pressed', String(value === answer));
      });

      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  els.btnQuizApply.addEventListener('click', function () {
    setTheta(45);
    setPhase(0);
    if (stageCard) {
      stageCard.scrollIntoView({
        behavior: isReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  });

  /* ------------------------------------------------------------------ *
   * 小图：等概率条
   * ------------------------------------------------------------------ */

  function drawQuiz() {
    var q = els.quizCanvas;
    if (!q) return;
    var qv = K.createViewport(q, { worldSpan: 5, padding: 20 });
    qv.resize();
    var qctx = qv.ctx;

    K.drawBackdrop(qctx, qv);

    var base = { x: 0, y: -1.2, w: 1.1, h: 2.8 };
    qctx.fillStyle = 'rgba(46, 49, 44, 0.055)';
    fillWorldRect(qctx, qv, { x: base.x, y: base.y, w: base.w, h: base.h });
    fillWorldRect(qctx, qv, { x: 1.5, y: base.y, w: base.w, h: base.h });

    qctx.fillStyle = 'rgba(116, 134, 118, 0.72)';
    fillWorldRect(qctx, qv, { x: base.x, y: base.y, w: base.w, h: base.h * 0.5 });
    qctx.fillStyle = 'rgba(176, 125, 110, 0.72)';
    fillWorldRect(qctx, qv, { x: 1.5, y: base.y, w: base.w, h: base.h * 0.5 });

    K.drawLabel(qctx, qv.worldToScreen({ x: base.x + 0.55, y: base.y - 0.3 }).x,
      qv.worldToScreen({ x: base.x + 0.55, y: base.y - 0.3 }).y, 'p(0)', {
        color: K.PALETTE.e1,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
    K.drawLabel(qctx, qv.worldToScreen({ x: 2.05, y: base.y - 0.3 }).x,
      qv.worldToScreen({ x: 2.05, y: base.y - 0.3 }).y, 'p(1)', {
        color: K.PALETTE.e2,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
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
      var rawTheta = params.get('theta');
      var rawPhase = params.get('phase');
      if (rawTheta) {
        var t = parseFloat(rawTheta);
        if (Number.isFinite(t)) state.theta = clamp(t, 0, 90);
      }
      if (rawPhase) {
        var p = parseFloat(rawPhase);
        if (Number.isFinite(p)) state.phase = normalizeAngle(p);
      }
    } catch (error) {
      // URL 参数只做增强。
    }
  })();

  syncInputs();
  updateReadouts();
  requestRender();
  drawQuiz();
  /* ------------------------------------------------------------------ *
   * 全屏观看（space-mode.js）：应用页只放大画布，不改变各页自己的拖动
   * ------------------------------------------------------------------ */

  if (window.LinearSpace) {
    window.LinearSpace.attach({
      canvas: canvas,
      view: view,
      redraw: requestRender,
      panZoom: false,
      minimap: false
    });
  }

})();
