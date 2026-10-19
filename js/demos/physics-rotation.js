/**
 * physics-rotation.js · 物理应用 02：刚体旋转
 *
 * R(θ) 是正交矩阵：保长、保角、det = 1。
 * 切到普通矩阵 R(θ)S 后，圆会被压成椭圆。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[physics-rotation] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('rotation-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10.5, padding: 34 });
  var LEVEL_FACTOR = window.LinAlgLevel ? window.LinAlgLevel.factor : 1;
  var TARGET_ANGLE = 90;
  var TARGET_TOL = 2.5 * LEVEL_FACTOR;
  var S = L.mat2(1.6, 0, 0, 0.7);

  var state = {
    angle: 30,
    mode: 'orthogonal',
    showOriginal: true,
    dragging: false
  };

  var els = {
    angleRange: document.getElementById('angle-range'),
    angle: document.getElementById('angle'),
    modeBtns: Array.prototype.slice.call(document.querySelectorAll('[data-mode]')),
    toggleOriginal: document.getElementById('toggle-original'),
    theta: document.getElementById('readout-theta'),
    det: document.getElementById('readout-det'),
    length: document.getElementById('readout-length'),
    ortho: document.getElementById('readout-ortho'),
    status: document.getElementById('canvas-status'),
    chip: document.getElementById('rotation-chip'),
    hint: document.getElementById('rotation-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-rotation]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var rafId = null;
  var ctx = null;

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
    var radians = state.angle * Math.PI / 180;
    var R = L.rotation(radians);
    var M = state.mode === 'general' ? L.multiplyMat(R, S) : R;
    var det = L.determinant(M);
    var e1 = L.applyMat(M, { x: 1, y: 0 });
    var len = L.length(e1);
    var gram = L.multiplyMat(L.transpose(M), M);
    var orthoError = L.maxAbs(L.subMat(gram, L.identity()));
    var targetDelta = Math.abs((((state.angle - TARGET_ANGLE + 180) % 360) + 360) % 360 - 180);

    return {
      R: R,
      M: M,
      det: det,
      e1: e1,
      len: len,
      orthoError: orthoError,
      targetDelta: targetDelta,
      achieved: targetDelta <= TARGET_TOL,
      orthogonal: state.mode === 'orthogonal'
    };
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.rotation({
      mode: state.mode,
      angle: state.angle,
      det: data.det,
      orthoError: data.orthoError,
      length: data.len
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    if (data.orthogonal) {
      els.hint.textContent = '拖动圆周上的手柄，或调整 θ';
    } else {
      els.hint.textContent = '普通矩阵会把圆压成椭圆；切回正交旋转看看';
    }
  }

  function updateReadouts() {
    var data = compute();
    var status = data.orthogonal ? '正交 · 保长' : '普通 · 会拉伸';

    els.theta.textContent = data.achieved ? '90.0°' : state.angle.toFixed(1) + '°';
    els.det.textContent = L.formatFixed(data.det, 2);
    els.length.textContent = L.formatFixed(data.len, 2);
    els.ortho.textContent = L.formatFixed(data.orthoError, 2);
    els.status.textContent = status;

    els.status.classList.remove('is-unique', 'is-none', 'is-infinite');
    els.status.classList.add(data.orthogonal ? 'is-unique' : 'is-infinite');
    if (els.chip) {
      els.chip.classList.remove('is-unique', 'is-none', 'is-infinite');
      els.chip.classList.add(data.orthogonal ? 'is-unique' : 'is-infinite');
    }

    var progress = data.achieved
      ? 100
      : Math.max(0, Math.min(100, 100 - data.targetDelta / 180 * 100));

    els.challengeCard.classList.toggle('is-complete', data.achieved);
    els.challengeState.textContent = data.achieved ? '达成' : (data.targetDelta < 10 ? '接近' : '进行中');
    els.challengeDistance.textContent = data.targetDelta.toFixed(1) + '°';
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
    var target = view.width < 560 ? 6.5 : 7.5;
    if (view.worldSpan !== target) {
      view.worldSpan = target;
      view.resize();
    }
  }

  function circlePoints(M, radius, count) {
    var points = [];
    var n = count || 96;
    for (var i = 0; i < n; i++) {
      var t = i / n * Math.PI * 2;
      var p = { x: Math.cos(t) * radius, y: Math.sin(t) * radius };
      points.push(M ? L.applyMat(M, p) : p);
    }
    return points;
  }

  function bodyPoints(M) {
    var base = [
      { x: 1.6, y: -0.5 },
      { x: 2.4, y: -0.5 },
      { x: 2.4, y: 0.5 },
      { x: 1.6, y: 0.5 }
    ];
    return base.map(function (p) {
      return M ? L.applyMat(M, p) : p;
    });
  }

  function drawAngleArc(data) {
    var origin = view.worldToScreen({ x: 0, y: 0 });
    var endAngle = -state.angle * Math.PI / 180;
    ctx.save();
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.32)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 54, 0, endAngle, true);
    ctx.stroke();
    ctx.restore();

    var mid = endAngle / 2;
    K.drawLabel(ctx, origin.x + Math.cos(mid) * 145, origin.y + Math.sin(mid) * 145,
      state.angle.toFixed(0) + '°', {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.9)',
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
    K.drawGrid(ctx, view, identityMap, {
      range: 12,
      minor: 'rgba(46, 49, 44, 0.045)',
      major: 'rgba(46, 49, 44, 0.08)',
      lineWidth: 0.8,
      majorWidth: 1
    });
    K.drawAxes(ctx, view, identityMap, {
      range: 12,
      color: 'rgba(46, 49, 44, 0.26)',
      lineWidth: 1.1
    });

    var data = compute();
    var origin = { x: 0, y: 0 };

    if (state.showOriginal) {
      K.drawWorldPolygon(ctx, view, circlePoints(null, 1), {
        fill: 'rgba(46, 49, 44, 0.015)',
        stroke: 'rgba(46, 49, 44, 0.2)',
        lineWidth: 1.2,
        dash: [5, 6]
      });
      K.drawWorldPolygon(ctx, view, bodyPoints(null), {
        stroke: 'rgba(46, 49, 44, 0.18)',
        lineWidth: 1,
        dash: [4, 5]
      });
    }

    K.drawWorldPolygon(ctx, view, circlePoints(data.M, 1), {
      fill: data.orthogonal ? 'rgba(116, 134, 118, 0.07)' : 'rgba(176, 125, 110, 0.07)',
      stroke: data.orthogonal ? K.PALETTE.e1 : K.PALETTE.e2,
      lineWidth: 2
    });

    K.drawWorldPolygon(ctx, view, bodyPoints(data.M), {
      fill: 'rgba(191, 163, 106, 0.12)',
      stroke: K.PALETTE.gold,
      lineWidth: 1.8
    });

    K.drawArrowWorld(ctx, view, origin, { x: 1, y: 0 }, {
      color: 'rgba(116, 134, 118, 0.6)',
      lineWidth: 1.5,
      head: 8,
      headWidth: 4,
      label: 'e₁',
      labelColor: K.PALETTE.e1,
      labelOffset: { x: 10, y: -16 }
    });

    K.drawArrowWorld(ctx, view, origin, data.e1, {
      color: K.PALETTE.gold,
      lineWidth: 2.4,
      head: 10,
      headWidth: 5,
      label: data.orthogonal ? 'R e₁' : 'M e₁',
      labelColor: K.PALETTE.gold,
      labelOffset: { x: 14, y: 22 }
    });

    K.drawPointWorld(ctx, view, data.e1, {
      radius: 6,
      fill: K.PALETTE.gold,
      stroke: 'rgba(250, 246, 238, 0.96)',
      strokeWidth: 2
    });

    drawAngleArc(data);

    K.drawPointWorld(ctx, view, origin, {
      radius: 3,
      fill: K.PALETTE.origin
    });

    if (!data.orthogonal) {
      K.drawLabel(ctx, 22, 26, 'R(θ)S · 圆被压成椭圆', {
        color: K.PALETTE.warm,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.15)',
        font: '500 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
      });
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
   * 状态与输入
   * ------------------------------------------------------------------ */

  function setAngle(value) {
    state.angle = normalizeAngle(value);
    if (els.angleRange) els.angleRange.value = String(Math.round(state.angle));
    if (els.angle && document.activeElement !== els.angle) {
      els.angle.value = L.formatInput(state.angle);
    }
    updateReadouts();
  }

  function readAngle(input) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    state.angle = normalizeAngle(value);
    if (els.angleRange) els.angleRange.value = String(Math.round(state.angle));
    updateReadouts();
  }

  function setMode(mode) {
    if (mode !== 'orthogonal' && mode !== 'general') return;
    state.mode = mode;
    els.modeBtns.forEach(function (button) {
      var active = button.getAttribute('data-mode') === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateReadouts();
  }

  /* ------------------------------------------------------------------ *
   * 拖动
   * ------------------------------------------------------------------ */

  function hitHandle(event) {
    var point = view.pointerPosition(event);
    var data = compute();
    return K.hitTestPoint(view, data.e1, point, 22);
  }

  function updateFromPointer(event) {
    var world = view.screenToWorld(view.pointerPosition(event));
    var angle = Math.atan2(world.y, world.x) * 180 / Math.PI;
    setAngle(angle);
  }

  function endDrag(event) {
    state.dragging = false;
    canvas.classList.remove('is-dragging');
    canvas.classList.remove('is-grabbable');
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  /* ------------------------------------------------------------------ *
   * 事件
   * ------------------------------------------------------------------ */

  if (els.angleRange) {
    els.angleRange.addEventListener('input', function () {
      setAngle(parseFloat(els.angleRange.value));
    });
  }
  if (els.angle) {
    els.angle.addEventListener('input', function () { readAngle(els.angle); });
    els.angle.addEventListener('blur', function () { els.angle.value = L.formatInput(state.angle); });
  }

  els.modeBtns.forEach(function (button) {
    button.addEventListener('click', function () {
      setMode(button.getAttribute('data-mode'));
    });
  });

  if (els.toggleOriginal) {
    els.toggleOriginal.addEventListener('change', function () {
      state.showOriginal = els.toggleOriginal.checked;
      requestRender();
    });
  }

  els.btnReset.addEventListener('click', function () {
    state.angle = 30;
    state.mode = 'orthogonal';
    state.showOriginal = true;
    if (els.angleRange) els.angleRange.value = '30';
    if (els.angle) els.angle.value = '30';
    if (els.toggleOriginal) els.toggleOriginal.checked = true;
    els.modeBtns.forEach(function (button) {
      var active = button.getAttribute('data-mode') === 'orthogonal';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateReadouts();
  });

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = button.getAttribute('data-preset');
      if (preset === 'general') {
        setMode('general');
        setAngle(30);
      } else {
        setMode('orthogonal');
        setAngle(parseFloat(preset));
      }
    });
  });

  canvas.addEventListener('pointerdown', function (event) {
    if (!hitHandle(event)) return;
    event.preventDefault();
    state.dragging = true;
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
    canvas.classList.toggle('is-grabbable', hitHandle(event));
  });

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', function () {
    if (!state.dragging) canvas.classList.remove('is-grabbable');
  });

  canvas.addEventListener('keydown', function (event) {
    var direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 :
      (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0);
    if (!direction) return;
    event.preventDefault();
    setAngle(state.angle + direction * (event.shiftKey ? 5 : 1));
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    '0': { correct: false, text: 'det = 0 表示空间被压扁；旋转不会压扁任何方向。' },
    '1': { correct: true, text: '对。旋转保面积、保定向，det R = cos²θ + sin²θ = 1。' },
    '-1': { correct: false, text: 'det = −1 是反射：保长，但把定向翻了过来。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-rotation');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-rotation');
        option.classList.toggle('is-correct', value === '1' && answer === '1');
        option.classList.toggle('is-wrong', value === answer && answer !== '1');
        option.setAttribute('aria-pressed', String(value === answer));
      });

      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  els.btnQuizApply.addEventListener('click', function () {
    setMode('orthogonal');
    setAngle(90);
    if (stageCard) {
      stageCard.scrollIntoView({
        behavior: isReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  });

  /* ------------------------------------------------------------------ *
   * 小图：圆与椭圆
   * ------------------------------------------------------------------ */

  function drawQuiz() {
    var q = els.quizCanvas;
    if (!q) return;
    var qv = K.createViewport(q, { worldSpan: 5, padding: 18 });
    qv.resize();
    var qctx = qv.ctx;

    K.drawBackdrop(qctx, qv);
    K.drawGrid(qctx, qv, identityMap, {
      range: 6,
      minor: 'rgba(46, 49, 44, 0.045)',
      major: 'rgba(46, 49, 44, 0.08)',
      lineWidth: 0.7,
      majorWidth: 0.9
    });
    K.drawAxes(qctx, qv, identityMap, {
      range: 6,
      color: 'rgba(46, 49, 44, 0.25)',
      lineWidth: 1
    });

    var points = [];
    for (var i = 0; i < 72; i++) {
      var t = i / 72 * Math.PI * 2;
      points.push({ x: Math.cos(t) * 1.7, y: Math.sin(t) * 1.1 });
    }
    K.drawWorldPolygon(qctx, qv, points, {
      fill: 'rgba(116, 134, 118, 0.08)',
      stroke: K.PALETTE.e1,
      lineWidth: 1.8
    });
    K.drawArrowWorld(qctx, qv, { x: 0, y: 0 }, { x: 1.7, y: 0 }, {
      color: K.PALETTE.gold,
      lineWidth: 2,
      head: 9,
      headWidth: 4.5,
      label: 'R',
      labelColor: K.PALETTE.gold,
      labelOffset: { x: 8, y: -10 }
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
      var rawAngle = params.get('angle');
      var rawMode = params.get('mode');
      if (rawAngle) {
        var angle = parseFloat(rawAngle);
        if (Number.isFinite(angle)) state.angle = normalizeAngle(angle);
      }
      if (rawMode === 'general' || rawMode === 'orthogonal') {
        state.mode = rawMode;
        els.modeBtns.forEach(function (button) {
          var active = button.getAttribute('data-mode') === rawMode;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
      }
    } catch (error) {
      // URL 参数只是增强，不影响主流程。
    }
  })();

  if (els.angleRange) els.angleRange.value = String(Math.round(state.angle));
  if (els.angle) els.angle.value = L.formatInput(state.angle);
  updateReadouts();
  requestRender();
  drawQuiz();
})();
