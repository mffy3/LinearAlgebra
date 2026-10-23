/**
 * physics-force.js · 物理应用 01：受力分解
 *
 * 场景：一个重物由两根绳子悬挂。
 * 已知两根绳子的方向 u、v，求张力 T1、T2，使
 *
 *     T1 u + T2 v = -W
 *
 * 这就是一个 2×2 方程组；矩阵的两列就是两根绳子的方向。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[physics-force] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('physics-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 12, padding: 34 });
  var EPS = 1e-9;
  var LEVEL_FACTOR = window.LinAlgLevel ? window.LinAlgLevel.factor : 1;
  var SLACK_TOL = 0.06 * LEVEL_FACTOR;
  var INITIAL = {
    A: { x: -4.2, y: 5.2 },
    B: { x: 4.2, y: 5.2 },
    weight: 5
  };

  var PRESETS = {
    symmetric: { A: { x: -4.2, y: 5.2 }, B: { x: 4.2, y: 5.2 }, weight: 5 },
    offset: { A: { x: -2.0, y: 5.4 }, B: { x: 4.6, y: 4.3 }, weight: 5.5 },
    slack: { A: { x: 0, y: 5.2 }, B: { x: 4.6, y: 4.8 }, weight: 5 },
    collinear: { A: { x: -4.2, y: 5.2 }, B: { x: -2.1, y: 2.6 }, weight: 5 }
  };

  var state = {
    anchors: {
      A: copyPoint(INITIAL.A),
      B: copyPoint(INITIAL.B)
    },
    weight: INITIAL.weight,
    showDecompose: true,
    dragging: null,
    keyboardAnchor: 'A',
    keyboardFocused: false
  };

  var els = {
    canvasStatus: document.getElementById('canvas-status'),
    chip: document.getElementById('physics-chip'),
    hint: document.getElementById('physics-hint'),
    t1: document.getElementById('readout-t1'),
    t2: document.getElementById('readout-t2'),
    weight: document.getElementById('readout-weight'),
    det: document.getElementById('readout-det'),
    status: document.getElementById('readout-status'),
    weightRange: document.getElementById('weight-range'),
    weightInput: document.getElementById('weight'),
    toggleDecompose: document.getElementById('toggle-decompose'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDet: document.getElementById('challenge-det'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-physics]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var rafId = null;
  var ctx = null;

  /* ------------------------------------------------------------------ *
   * 基础
   * ------------------------------------------------------------------ */

  function copyPoint(p) {
    return { x: p.x, y: p.y };
  }

  function roundTo(value, digits) {
    var p = Math.pow(10, digits);
    return Math.round(value * p) / p;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampAnchor(p) {
    return {
      x: clamp(roundTo(p.x, 2), -6.2, 6.2),
      y: clamp(roundTo(p.y, 2), 1.2, 5.6)
    };
  }

  function clampWeight(value) {
    return clamp(roundTo(value, 2), 1, 10);
  }

  function statusLabel(data) {
    if (data.result.status === 'none') return '无平衡';
    if (data.result.status === 'infinite') return '张力不唯一';
    if (data.negative) return '需要推力';
    if (data.slack) return '单绳平衡';
    return '唯一平衡';
  }

  function statusClass(data) {
    if (data.result.status === 'none' || data.negative) return 'is-none';
    if (data.result.status === 'infinite' || data.slack) return 'is-infinite';
    return 'is-unique';
  }

  function setStatusClass(el, className) {
    if (!el) return;
    el.classList.remove('is-unique', 'is-none', 'is-infinite');
    el.classList.add(className);
  }

  function isReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function syncWeightInputs(weight) {
    if (els.weightRange && document.activeElement !== els.weightRange) {
      els.weightRange.value = String(weight);
    }
    if (els.weightInput && document.activeElement !== els.weightInput) {
      els.weightInput.value = L.formatInput(weight);
    }
  }

  /* ------------------------------------------------------------------ *
   * 几何与求解
   * ------------------------------------------------------------------ */

  function compute() {
    var u = L.normalize(state.anchors.A);
    var v = L.normalize(state.anchors.B);
    var basis = L.mat2(u.x, v.x, u.y, v.y);
    var support = { x: 0, y: state.weight };
    var result = L.solve2(basis, support);
    var t1 = result.unique ? result.particular.x : null;
    var t2 = result.unique ? result.particular.y : null;
    var negative = result.unique && (t1 < -0.03 || t2 < -0.03);
    var slack = result.unique && !negative &&
      (Math.abs(t1) <= SLACK_TOL || Math.abs(t2) <= SLACK_TOL) &&
      Math.max(Math.abs(t1), Math.abs(t2)) > 0.1;
    var symmetric = Math.abs(state.anchors.A.x + state.anchors.B.x) < 0.05 &&
      Math.abs(state.anchors.A.y - state.anchors.B.y) < 0.05;
    var angle = L.angleBetween(u, v) * 180 / Math.PI;
    var det = L.determinant(basis);

    return {
      u: u,
      v: v,
      basis: basis,
      support: support,
      result: result,
      t1: t1,
      t2: t2,
      det: det,
      angle: angle,
      negative: negative,
      slack: slack,
      symmetric: symmetric
    };
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.physics({
      status: data.result.status,
      t1: data.t1,
      t2: data.t2,
      weight: state.weight,
      angle: data.angle,
      negative: data.negative,
      slack: data.slack,
      symmetric: data.symmetric
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    if (data.result.status === 'none') {
      els.hint.textContent = '两根绳子共线了；拖开一个锚点，让方向重新张开';
    } else if (data.negative) {
      els.hint.textContent = '出现了负张力：把在错误一侧的锚点拖到另一边';
    } else {
      els.hint.textContent = '拖动锚点 A / B，或拖动金色重物改变重量';
    }
  }

  function updateReadouts() {
    var data = compute();
    var label = statusLabel(data);
    var cls = statusClass(data);

    els.t1.textContent = data.t1 == null ? '—' : L.formatFixed(data.t1, 2);
    els.t2.textContent = data.t2 == null ? '—' : L.formatFixed(data.t2, 2);
    els.weight.textContent = L.formatFixed(state.weight, 2);
    els.det.textContent = L.formatFixed(data.det, 2);
    els.status.textContent = label;
    els.canvasStatus.textContent = label;

    [els.t1, els.t2].forEach(function (el, index) {
      el.classList.remove('is-unique', 'is-none', 'is-infinite', 'is-negative', 'is-zero');
      var value = index === 0 ? data.t1 : data.t2;
      if (value == null) return;
      if (value < -0.03) el.classList.add('is-negative');
      else if (Math.abs(value) <= 0.06) el.classList.add('is-zero');
      else el.classList.add('is-positive');
    });

    setStatusClass(els.status, cls);
    setStatusClass(els.canvasStatus, cls);
    if (els.chip) {
      els.chip.classList.remove('is-unique', 'is-none', 'is-infinite');
      els.chip.classList.add(cls);
    }

    var minT = data.t1 == null ? null : Math.min(Math.abs(data.t1), Math.abs(data.t2));
    var achieved = data.slack;
    var progress = 0;
    if (achieved) {
      progress = 100;
    } else if (minT != null) {
      progress = Math.max(0, Math.min(100, 100 - minT * 20));
    }

    els.challengeCard.classList.toggle('is-complete', achieved);
    els.challengeState.textContent = achieved ? '达成' : (minT != null && minT < 0.5 ? '接近' : '进行中');
    els.challengeDet.textContent = minT == null ? '—' : L.formatFixed(minT, 2);
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
    var target = 12;
    if (view.worldSpan !== target) {
      view.worldSpan = target;
      view.resize();
    }
  }

  function drawLabelAt(worldPoint, text, color, offsetX, offsetY) {
    var p = view.worldToScreen(worldPoint);
    if (!view.contains(p, 30)) return;
    K.drawLabel(ctx, p.x + (offsetX || 0), p.y + (offsetY || 0), text, {
      color: color,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.15)',
      font: '500 11px "Cascadia Code", Consolas, monospace',
      fontSize: 12
    });
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

  function drawCeiling() {
    K.drawWorldLine(ctx, view, { x: -7, y: 5.8 }, { x: 7, y: 5.8 }, {
      stroke: 'rgba(46, 49, 44, 0.22)',
      lineWidth: 1.2
    });

    [state.anchors.A, state.anchors.B].forEach(function (anchor) {
      K.drawWorldLine(ctx, view, anchor, { x: anchor.x, y: 5.8 }, {
        stroke: 'rgba(46, 49, 44, 0.2)',
        lineWidth: 1,
        dash: [3, 4]
      });
    });
  }

  function drawRopes() {
    K.drawWorldLine(ctx, view, { x: 0, y: 0 }, state.anchors.A, {
      stroke: 'rgba(46, 49, 44, 0.32)',
      lineWidth: 1.4
    });
    K.drawWorldLine(ctx, view, { x: 0, y: 0 }, state.anchors.B, {
      stroke: 'rgba(46, 49, 44, 0.32)',
      lineWidth: 1.4
    });
  }

  function drawAnchors() {
    var anchorColors = [K.PALETTE.e1, K.PALETTE.e2];
    [state.anchors.A, state.anchors.B].forEach(function (anchor, index) {
      K.drawPointWorld(ctx, view, anchor, {
        radius: 6,
        fill: anchorColors[index],
        stroke: 'rgba(250, 246, 238, 0.96)',
        strokeWidth: 2
      });
      if (state.keyboardFocused && state.keyboardAnchor === (index === 0 ? 'A' : 'B')) {
        var screen = view.worldToScreen(anchor);
        ctx.save();
        ctx.strokeStyle = 'rgba(191, 163, 106, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      drawLabelAt(anchor, index === 0 ? 'A' : 'B', anchorColors[index], 9, -12);
    });
  }

  function drawWeight(data) {
    var weightTip = { x: 0, y: -state.weight };
    K.drawArrowWorld(ctx, view, { x: 0, y: 0 }, weightTip, {
      color: K.PALETTE.gold,
      lineWidth: 2.6,
      head: 11,
      headWidth: 5.5,
      label: 'W',
      labelColor: K.PALETTE.gold,
      labelOffset: { x: 12, y: 13 }
    });

    // 金色拖拽手柄。
    K.drawPointWorld(ctx, view, weightTip, {
      radius: 5,
      fill: K.PALETTE.gold,
      stroke: 'rgba(250, 246, 238, 0.96)',
      strokeWidth: 2
    });

    // 平衡力 -W：只作为分解目标，不抢重力的主箭头。
    if (data.result.unique) {
      K.drawArrowWorld(ctx, view, { x: 0, y: 0 }, { x: 0, y: state.weight }, {
        color: 'rgba(46, 49, 44, 0.34)',
        lineWidth: 1.3,
        head: 8,
        headWidth: 4,
        dash: [5, 5],
        label: '−W',
        labelColor: 'rgba(46, 49, 44, 0.55)',
        labelOffset: { x: 11, y: -12 }
      });
    }
  }

  function drawTensions(data) {
    if (!data.result.unique) return;

    var t1 = data.t1;
    var t2 = data.t2;
    var tip1 = L.scaleVec(data.u, t1);
    var tip2 = L.scaleVec(data.v, t2);

    if (Math.abs(t1) > 0.015) {
      K.drawArrowWorld(ctx, view, { x: 0, y: 0 }, tip1, {
        color: t1 < 0 ? K.PALETTE.danger : K.PALETTE.e1,
        lineWidth: 2.3,
        head: 10,
        headWidth: 5,
        label: t1 < 0 ? 'T₁ < 0' : 'T₁',
        labelColor: t1 < 0 ? K.PALETTE.danger : K.PALETTE.e1,
        labelOffset: { x: 10, y: -12 }
      });
    }

    if (Math.abs(t2) > 0.015) {
      K.drawArrowWorld(ctx, view, { x: 0, y: 0 }, tip2, {
        color: t2 < 0 ? K.PALETTE.danger : K.PALETTE.e2,
        lineWidth: 2.3,
        head: 10,
        headWidth: 5,
        label: t2 < 0 ? 'T₂ < 0' : 'T₂',
        labelColor: t2 < 0 ? K.PALETTE.danger : K.PALETTE.e2,
        labelOffset: { x: 10, y: -12 }
      });
    }

    if (state.showDecompose) {
      var support = { x: 0, y: state.weight };
      K.drawWorldPolygon(ctx, view, [
        { x: 0, y: 0 },
        tip1,
        support,
        tip2
      ], {
        fill: 'rgba(191, 163, 106, 0.08)',
        stroke: 'rgba(46, 49, 44, 0.2)',
        lineWidth: 1,
        dash: [4, 5]
      });

      K.drawWorldLine(ctx, view, tip1, support, {
        stroke: 'rgba(116, 134, 118, 0.4)',
        lineWidth: 1,
        dash: [3, 5]
      });
      K.drawWorldLine(ctx, view, tip2, support, {
        stroke: 'rgba(176, 125, 110, 0.4)',
        lineWidth: 1,
        dash: [3, 5]
      });
      drawLabelAt(support, 'T₁u + T₂v', K.PALETTE.muted, 10, -12);
    }
  }

  function drawAngle(data) {
    if (state.anchors.A.x > 0 || state.anchors.B.x < 0) return;
    if (data.angle < 8 || data.angle > 172) return;

    var origin = view.worldToScreen({ x: 0, y: 0 });
    var angleU = Math.atan2(-data.u.y, data.u.x);
    var angleV = Math.atan2(-data.v.y, data.v.x);
    var start = Math.min(angleU, angleV);
    var end = Math.max(angleU, angleV);
    if (end - start > Math.PI) {
      var temp = start;
      start = end;
      end = temp + Math.PI * 2;
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 54, start, end);
    ctx.stroke();
    ctx.restore();

    var mid = (start + end) / 2;
    K.drawLabel(ctx, origin.x + Math.cos(mid) * 72, origin.y + Math.sin(mid) * 72,
      L.formatFixed(data.angle, 0) + '°', {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
  }

  function drawObject() {
    K.drawPointWorld(ctx, view, { x: 0, y: 0 }, {
      radius: 7,
      fill: K.PALETTE.surface || '#f5efe4',
      stroke: K.PALETTE.ink || '#2e312c',
      strokeWidth: 2
    });
    K.drawPointWorld(ctx, view, { x: 0, y: 0 }, {
      radius: 2.5,
      fill: K.PALETTE.ink || '#2e312c'
    });
    drawLabelAt({ x: 0, y: 0 }, '灯', K.PALETTE.ink, 10, 16);
  }

  function drawStateLabel(data) {
    if (data.result.status === 'none') {
      drawTopLabel('绳索共线 · 无平衡', K.PALETTE.danger, 0);
      return;
    }
    if (data.result.status === 'infinite') {
      drawTopLabel('共线 · 张力不唯一', K.PALETTE.warm, 0);
      return;
    }
    if (data.negative) {
      drawTopLabel('负张力 · 需要撑杆', K.PALETTE.danger, 0);
      return;
    }
    if (data.slack) {
      drawTopLabel('一根绳松弛 · T = 0', K.PALETTE.warm, 0);
      return;
    }
    if (data.symmetric) {
      drawTopLabel('对称 · T₁ = T₂', K.PALETTE.accent || '#748676', 0);
    }
  }

  function draw() {
    view.resize();
    fitWorldSpan();
    ctx = view.ctx;

    K.drawBackdrop(ctx, view);
    K.drawGrid(ctx, view, identityMap, {
      range: 13,
      minor: 'rgba(46, 49, 44, 0.04)',
      major: 'rgba(46, 49, 44, 0.075)',
      lineWidth: 0.7,
      majorWidth: 0.95
    });
    K.drawAxes(ctx, view, identityMap, {
      range: 13,
      color: 'rgba(46, 49, 44, 0.25)',
      lineWidth: 1
    });

    var data = compute();
    drawCeiling();
    drawRopes();
    drawAngle(data);
    drawTensions(data);
    drawWeight(data);
    drawAnchors();
    drawObject();
    drawStateLabel(data);
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

  function setAnchors(A, B) {
    state.anchors.A = clampAnchor(A);
    state.anchors.B = clampAnchor(B);
    updateReadouts();
  }

  function setWeight(value) {
    state.weight = clampWeight(value);
    syncWeightInputs(state.weight);
    updateReadouts();
  }

  function readWeight(input) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    state.weight = clampWeight(value);
    syncWeightInputs(state.weight);
    updateReadouts();
  }

  /* ------------------------------------------------------------------ *
   * 拖动
   * ------------------------------------------------------------------ */

  function hitTest(event) {
    var point = view.pointerPosition(event);
    var weightTip = { x: 0, y: -state.weight };

    if (K.hitTestPoint(view, weightTip, point, 22)) return 'weight';
    if (K.hitTestPoint(view, state.anchors.A, point, 22)) return 'A';
    if (K.hitTestPoint(view, state.anchors.B, point, 22)) return 'B';
    return null;
  }

  function updateFromPointer(event) {
    var world = view.screenToWorld(view.pointerPosition(event));

    if (state.dragging === 'weight') {
      setWeight(-world.y);
      return;
    }

    var anchor = { x: world.x, y: world.y };
    if (state.dragging === 'A') {
      state.anchors.A = clampAnchor(anchor);
    } else if (state.dragging === 'B') {
      state.anchors.B = clampAnchor(anchor);
    }
    updateReadouts();
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

  if (els.weightRange) {
    els.weightRange.addEventListener('input', function () {
      setWeight(parseFloat(els.weightRange.value));
    });
  }

  if (els.weightInput) {
    els.weightInput.addEventListener('input', function () {
      readWeight(els.weightInput);
    });
    els.weightInput.addEventListener('blur', function () {
      els.weightInput.value = L.formatInput(state.weight);
    });
    els.weightInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') els.weightInput.blur();
    });
  }

  if (els.toggleDecompose) {
    els.toggleDecompose.addEventListener('change', function () {
      state.showDecompose = els.toggleDecompose.checked;
      requestRender();
    });
  }

  els.btnReset.addEventListener('click', function () {
    setAnchors(INITIAL.A, INITIAL.B);
    setWeight(INITIAL.weight);
  });

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = PRESETS[button.getAttribute('data-preset')];
      if (!preset) return;
      setAnchors(preset.A, preset.B);
      setWeight(preset.weight);
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

  canvas.addEventListener('focus', function () {
    state.keyboardFocused = true;
    updateReadouts();
  });

  canvas.addEventListener('blur', function () {
    state.keyboardFocused = false;
    updateReadouts();
  });

  canvas.addEventListener('keydown', function (event) {
    if (event.key === '1' || event.key === '2') {
      event.preventDefault();
      state.keyboardAnchor = event.key === '1' ? 'A' : 'B';
      updateReadouts();
      return;
    }
    var dx = 0;
    var dy = 0;
    if (event.key === 'ArrowLeft') dx = -0.25;
    else if (event.key === 'ArrowRight') dx = 0.25;
    else if (event.key === 'ArrowUp') dy = 0.25;
    else if (event.key === 'ArrowDown') dy = -0.25;
    else return;
    event.preventDefault();
    var anchor = state.anchors[state.keyboardAnchor];
    state.anchors[state.keyboardAnchor] = clampAnchor({
      x: anchor.x + dx,
      y: anchor.y + dy
    });
    updateReadouts();
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    yes: {
      correct: false,
      text: '不对。两列共线，矩阵不可逆；除非重力也正好在绳线上，否则无解。'
    },
    no: {
      correct: true,
      text: '对。两列共线，det = 0；张力不能唯一确定。若重力也在绳线上，甚至有无穷多组分配。'
    },
    none: {
      correct: false,
      text: '不一定。若重力正好在绳线上，会有无穷多组张力；只有重力不在线上时才无解。'
    }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-physics');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-physics');
        option.classList.toggle('is-correct', value === 'no' && answer === 'no');
        option.classList.toggle('is-wrong', value === answer && answer !== 'no');
        option.setAttribute('aria-pressed', String(value === answer));
      });

      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  els.btnQuizApply.addEventListener('click', function () {
    setAnchors(PRESETS.collinear.A, PRESETS.collinear.B);
    setWeight(PRESETS.collinear.weight);
    if (stageCard) {
      stageCard.scrollIntoView({
        behavior: isReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  });

  /* ------------------------------------------------------------------ *
   * 小图：共线绳索
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

    K.drawWorldLine(qctx, qv, { x: -5, y: -3 }, { x: 5, y: 3 }, {
      stroke: K.PALETTE.e1,
      lineWidth: 2
    });
    K.drawArrowWorld(qctx, qv, { x: 0, y: 0 }, { x: 3.4, y: 2.1 }, {
      color: K.PALETTE.e1,
      lineWidth: 2,
      head: 9,
      headWidth: 4.5,
      label: 'u',
      labelColor: K.PALETTE.e1,
      labelOffset: { x: 8, y: -10 }
    });
    K.drawArrowWorld(qctx, qv, { x: 0, y: 0 }, { x: 2.2, y: 1.35 }, {
      color: K.PALETTE.e2,
      lineWidth: 2,
      head: 9,
      headWidth: 4.5,
      label: 'v',
      labelColor: K.PALETTE.e2,
      labelOffset: { x: 8, y: 12 }
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
      var rawA = params.get('a');
      var rawB = params.get('b');
      var rawW = params.get('w');

      if (rawA) {
        var av = rawA.split(',').map(Number);
        if (av.length === 2 && av.every(Number.isFinite)) {
          state.anchors.A = clampAnchor({ x: av[0], y: av[1] });
        }
      }
      if (rawB) {
        var bv = rawB.split(',').map(Number);
        if (bv.length === 2 && bv.every(Number.isFinite)) {
          state.anchors.B = clampAnchor({ x: bv[0], y: bv[1] });
        }
      }
      if (rawW) {
        var w = parseFloat(rawW);
        if (Number.isFinite(w)) state.weight = clampWeight(w);
      }
    } catch (error) {
      // URL 参数只是增强，不影响主流程。
    }
  })();

  syncWeightInputs(state.weight);
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
