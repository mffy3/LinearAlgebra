/**
 * rank.js · 秩与零空间展厅的讲解员
 *
 * 这一页回答两个问题：
 * 1. 矩阵的输出还剩下几个独立方向？（秩 / 列空间）
 * 2. 哪些输入方向被压成了 0？（零空间）
 *
 * 页面状态只有两份：矩阵 A 和探测向量 x。
 * 所有维数、方向、像向量都由 math.js 计算，绘图只负责把它们画出来。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;

  if (!L || !K) {
    console.error('[rank] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('rank-canvas');
  var canvasWrap = document.getElementById('canvas-wrap');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10.5, padding: 34 });

  var ELEMENT_LIMIT = 8;
  var PROBE_LIMIT = 6;
  var EPS = 1e-9;
  var LEVEL_FACTOR = window.LinAlgLevel ? window.LinAlgLevel.factor : 1;
  var NULL_TOL = 0.01 * LEVEL_FACTOR;
  var INITIAL_MATRIX = L.mat2(1, 2, 0.5, 1);
  var INITIAL_PROBE = { x: 1, y: 1 };

  var PRESETS = {
    full: L.identity(),
    'rank-one': L.mat2(1, 3, 2, 6),
    projection: L.mat2(1, 0, 0, 0),
    shear: L.shear(1, 0),
    zero: L.zero()
  };

  var state = {
    matrix: copyMatrix(INITIAL_MATRIX),
    drawn: copyMatrix(INITIAL_MATRIX),
    probe: { x: INITIAL_PROBE.x, y: INITIAL_PROBE.y },
    animation: null,
    dragging: null,
    showGrid: true,
    showColumn: true,
    showNull: true,
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
    canvasRank: document.getElementById('canvas-rank'),
    canvasNullity: document.getElementById('canvas-nullity'),
    rankChip: document.getElementById('canvas-rank-chip'),
    readoutRank: document.getElementById('readout-rank'),
    readoutNullity: document.getElementById('readout-nullity'),
    readoutDet: document.getElementById('readout-det'),
    readoutImage: document.getElementById('readout-image'),
    readoutSum: document.getElementById('readout-sum'),
    readoutCs: document.getElementById('readout-cs'),
    calcRank: document.getElementById('calc-rank'),
    calcNullity: document.getElementById('calc-nullity'),
    calcImage: document.getElementById('calc-image'),
    footRank: document.getElementById('foot-rank'),
    footNullity: document.getElementById('foot-nullity'),
    footImage: document.getElementById('foot-image'),
    footProbe: document.getElementById('foot-probe'),
    spaceNote: document.getElementById('space-note'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeImage: document.getElementById('challenge-image'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    toggleGrid: document.getElementById('toggle-grid'),
    toggleColumn: document.getElementById('toggle-column'),
    toggleNull: document.getElementById('toggle-null'),
    toggleBasis: document.getElementById('toggle-basis'),
    btnReplay: document.getElementById('btn-replay'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-null]')),
    quizFeedback: document.getElementById('quiz-feedback')
  };

  var rafId = null;

  /* ------------------------------------------------------------------ *
   * 数值与状态
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
   * 读数
   * ------------------------------------------------------------------ */

  function updateProfessor(rank, nullity, imageLength, probeLength) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    if (!textEl || !promptEl || !window.LinAlgNarration) return;

    var note = window.LinAlgNarration.rank({
      rank: rank,
      nullity: nullity,
      imageLength: imageLength,
      probeLength: probeLength,
      probeInNullspace: probeLength > 0.1 && imageLength < NULL_TOL
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
    var cs = L.columnSpace2(m);
    var ns = L.nullSpace2(m);
    var det = L.determinant(m);
    var image = L.applyMat(m, state.probe);
    var imageLength = L.length(image);
    var probeLength = L.length(state.probe);
    var rank = cs.dimension;
    var nullity = ns.dimension;
    var sum = rank + nullity;

    var csLabel = rank === 2 ? '整个平面' : (rank === 1 ? '一条线' : '{0}');
    var rankText = String(rank);
    var nullityText = String(nullity);

    els.canvasRank.textContent = rankText;
    els.canvasNullity.textContent = nullityText;
    els.readoutRank.textContent = rankText;
    els.readoutNullity.textContent = nullityText;
    els.readoutDet.textContent = L.formatFixed(det, 2);
    els.readoutImage.textContent = L.formatFixed(imageLength, 2);
    els.readoutSum.textContent = String(sum);
    els.readoutCs.textContent = csLabel;

    els.calcRank.textContent = rankText;
    els.calcNullity.textContent = nullityText;
    els.calcImage.textContent = L.formatFixed(imageLength, 2);

    els.footRank.textContent = rankText;
    els.footNullity.textContent = nullityText;
    els.footImage.textContent = L.formatFixed(imageLength, 2);
    els.footProbe.textContent = '(' + L.formatFixed(state.probe.x, 2) + ', ' + L.formatFixed(state.probe.y, 2) + ')';

    setClass(els.readoutRank, 'is-zero', rank === 0);
    setClass(els.readoutRank, 'is-rank-one', rank === 1);
    setClass(els.readoutRank, 'is-positive', rank === 2);
    setClass(els.readoutNullity, 'is-zero', nullity === 0);
    setClass(els.readoutNullity, 'is-rank-one', nullity === 1);
    setClass(els.readoutNullity, 'is-positive', nullity === 2);
    setClass(els.readoutDet, 'is-zero', Math.abs(det) <= EPS);
    setClass(els.readoutDet, 'is-positive', Math.abs(det) > EPS);
    setClass(els.readoutImage, 'is-zero', imageLength <= 0.01);
    setClass(els.readoutSum, 'is-positive', true);
    setClass(els.rankChip, 'is-zero', rank === 0);

    if (rank === 2) {
      els.spaceNote.textContent = '满秩：平面没有被压扁；Col(A) 是整个平面，Null(A) 只有零向量。';
    } else if (rank === 1) {
      els.spaceNote.textContent = '秩 1：平面被压成 Col(A) 这条线；Null(A) 是那条被压掉的方向。';
    } else {
      els.spaceNote.textContent = '零矩阵：整个平面都被压到原点；Col(A) = {0}，Null(A) 是整个平面。';
    }

    // 挑战：秩 1 时，把非零探测向量拖进零空间。
    var achieved = rank === 1 && probeLength > 0.1 && imageLength < NULL_TOL;
    var progress = 0;
    if (rank === 1 && probeLength > 0.1) {
      var denom = Math.max(0.5, L.maxAbs(m) * Math.max(probeLength, 0.5));
      progress = Math.max(0, Math.min(100, (1 - imageLength / denom) * 100));
    }
    if (achieved) progress = 100;

    els.challengeCard.classList.toggle('is-complete', achieved);
    els.challengeState.textContent = achieved ? '达成' : (rank === 1 && imageLength < 0.1 ? '接近' : '进行中');
    els.challengeImage.textContent = L.formatFixed(imageLength, 3);
    els.challengeFill.style.width = progress.toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    updateProfessor(rank, nullity, imageLength, probeLength);
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

  function drawLineWithLabel(ctx, direction, color, label, dash) {
    if (!direction) return;

    var far = L.scaleVec(direction, 7);
    var near = L.scaleVec(direction, -7);
    K.drawWorldLine(ctx, view, near, far, {
      stroke: color,
      lineWidth: dash ? 1.8 : 2.1,
      dash: dash,
      glow: 8,
      glowColor: K.withAlpha(color, 0.35)
    });

    var labelPoint = L.scaleVec(direction, 4.1);
    var screen = view.worldToScreen(labelPoint);
    if (view.contains(screen, 44)) {
      K.drawLabel(ctx, screen.x, screen.y, label, {
        color: color,
        background: 'rgba(250, 246, 238, 0.8)',
        border: K.withAlpha(color, 0.3),
        align: 'center',
        font: '600 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
      });
    }
  }

  function drawSpaces(ctx, m) {
    var cs = L.columnSpace2(m);
    var ns = L.nullSpace2(m);

    if (state.showColumn && cs.dimension === 1) {
      drawLineWithLabel(ctx, cs.direction, K.PALETTE.e1, 'Col(A)', false);
    }

    if (state.showNull && ns.dimension === 1) {
      drawLineWithLabel(ctx, ns.direction, K.PALETTE.eigen, 'Null(A)', [7, 6]);
    }

    // 秩 0 时两个空间都退化了，用一个原点标记说明“只剩 0”。
    if (state.showColumn && cs.dimension === 0) {
      K.drawPointWorld(ctx, view, { x: 0, y: 0 }, {
        radius: 5,
        fill: 'rgba(116, 134, 118, 0.16)',
        stroke: K.PALETTE.e1,
        lineWidth: 1.4
      });
    }
  }

  function drawBasis(ctx, m) {
    var origin = { x: 0, y: 0 };
    var e1 = L.applyMat(m, { x: 1, y: 0 });
    var e2 = L.applyMat(m, { x: 0, y: 1 });

    K.drawArrowWorld(ctx, view, origin, e1, {
      color: 'rgba(116, 134, 118, 0.5)',
      lineWidth: 1.5,
      head: 9,
      headWidth: 5,
      label: 'e₁′',
      labelColor: 'rgba(116, 134, 118, 0.8)',
      labelOffset: { x: 10, y: -11 }
    });
    K.drawArrowWorld(ctx, view, origin, e2, {
      color: 'rgba(176, 125, 110, 0.5)',
      lineWidth: 1.5,
      head: 9,
      headWidth: 5,
      label: 'e₂′',
      labelColor: 'rgba(176, 125, 110, 0.8)',
      labelOffset: { x: 10, y: -11 }
    });
  }

  function drawProbe(ctx, m) {
    var origin = { x: 0, y: 0 };
    var image = L.applyMat(m, state.probe);
    var imageLength = L.length(image);
    var probeLength = L.length(state.probe);

    if (probeLength > 0.05) {
      K.drawArrowWorld(ctx, view, origin, state.probe, {
        color: K.PALETTE.circle,
        lineWidth: 2.3,
        glow: 10,
        head: 11,
        headWidth: 5.5,
        label: 'x',
        labelColor: K.PALETTE.circle,
        labelOffset: { x: 12, y: -12 }
      });
    }

    if (imageLength > 0.03) {
      K.drawArrowWorld(ctx, view, origin, image, {
        color: K.PALETTE.blue,
        lineWidth: 2.4,
        glow: 12,
        head: 11,
        headWidth: 5.5,
        label: 'Ax',
        labelColor: K.PALETTE.blue,
        labelOffset: { x: 12, y: 12 }
      });
    } else {
      // 像向量归零：画一个蓝色小环，表示“被压到原点”。
      var p = view.worldToScreen(origin);
      ctx.save();
      ctx.strokeStyle = K.PALETTE.blue;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      K.drawLabel(ctx, p.x + 14, p.y + 14, 'Ax = 0', {
        color: K.PALETTE.blue,
        background: 'rgba(250, 246, 238, 0.8)',
        border: K.withAlpha(K.PALETTE.blue, 0.3),
        font: '600 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
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

    drawSpaces(ctx, m);
    if (state.showBasis) drawBasis(ctx, m);
    drawProbe(ctx, m);
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
   * 状态更新
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
   * 拖动探测向量
   * ------------------------------------------------------------------ */

  function hitTestProbe(event) {
    if (L.length(state.probe) < 0.05) return false;
    var point = view.pointerPosition(event);
    return K.hitTestPoint(view, state.probe, point, 20);
  }

  function updateProbeFromPointer(event) {
    var screen = view.pointerPosition(event);
    var world = view.screenToWorld(screen);
    var x = clampProbe(snapZero(world.x));
    var y = clampProbe(snapZero(world.y));
    setProbe(x, y);
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

  els.toggleColumn.addEventListener('change', function () {
    state.showColumn = els.toggleColumn.checked;
    requestRender();
  });

  els.toggleNull.addEventListener('change', function () {
    state.showNull = els.toggleNull.checked;
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
      correct: false,
      text: '秩 = 1，不是满秩；零空间不是 {0}，而是至少一条线。'
    },
    '1': {
      correct: true,
      text: '对。两列平行，秩为 1；rank + nullity = 2，所以零空间维数 = 1。'
    },
    '2': {
      correct: false,
      text: '零空间是整个平面只发生在零矩阵；这个矩阵秩为 1，所以 nullity = 1。'
    }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-null');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-null');
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
    setMatrix(L.mat2(1, 3, 2, 6), { animate: true });
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
      var rawProbe = params.get('x');
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

  /* ------------------------------------------------------------------ *
   * 全屏无限空间（space-mode.js）
   * ------------------------------------------------------------------ */

  if (window.LinearSpace) {
    window.LinearSpace.attach({
      canvas: canvas,
      view: view,
      redraw: requestRender,
      hitTest: function (event) { return !!hitTestProbe(event); },
      landmarks: function () {
        var mapped = L.applyMat(state.drawn, state.probe);
        return [
          { x: state.probe.x, y: state.probe.y, color: K.PALETTE.warm },
          { x: mapped.x, y: mapped.y, color: K.PALETTE.e1 }
        ];
      }
    });
  }

})();
