/**
 * solve.js · 线性方程组展厅的讲解员
 *
 * 同一组 Ax = b，用两幅画解释：
 * - 行视角：两个方程是两条直线，解是交点；
 * - 列视角：两列向量能否组合出 b，组合系数就是解。
 *
 * 状态只有矩阵 A、右端项 b 和当前视角。数学全部交给 math.js。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[solve] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('solve-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 9.5, padding: 34 });
  var EPS = 1e-9;
  var LIMIT = 8;
  var INITIAL = {
    matrix: L.mat2(2, 1, 1, 3),
    b: { x: 3, y: 5 }
  };

  var PRESETS = {
    unique: { matrix: L.mat2(2, 1, 1, 3), b: { x: 3, y: 5 } },
    parallel: { matrix: L.mat2(1, 2, 2, 4), b: { x: 1, y: 0 } },
    coincident: { matrix: L.mat2(1, 2, 2, 4), b: { x: 1, y: 2 } },
    zero: { matrix: L.zero(), b: { x: 1, y: 1 } }
  };

  var state = {
    matrix: copyMatrix(INITIAL.matrix),
    b: copyVector(INITIAL.b),
    view: 'row',
    dragging: null
  };

  var els = {
    inputs: {
      a: document.getElementById('matrix-a'),
      b: document.getElementById('matrix-b'),
      c: document.getElementById('matrix-c'),
      d: document.getElementById('matrix-d')
    },
    rhsX: document.getElementById('rhs-x'),
    rhsY: document.getElementById('rhs-y'),
    canvasStatus: document.getElementById('canvas-status'),
    solveChip: document.getElementById('solve-chip'),
    solveHint: document.getElementById('solve-hint'),
    readoutSolution: document.getElementById('readout-solution'),
    readoutDet: document.getElementById('readout-det'),
    readoutRank: document.getElementById('readout-rank'),
    readoutStatus: document.getElementById('readout-status'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDet: document.getElementById('challenge-det'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    viewBtns: Array.prototype.slice.call(document.querySelectorAll('[data-view]')),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-solve]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var rafId = null;

  /* ------------------------------------------------------------------ *
   * 基础
   * ------------------------------------------------------------------ */

  function copyMatrix(m) {
    return L.mat2(m.a, m.b, m.c, m.d);
  }

  function copyVector(v) {
    return { x: v.x, y: v.y };
  }

  function roundTo(value, digits) {
    var p = Math.pow(10, digits);
    return Math.round(value * p) / p;
  }

  function snapZero(value) {
    return Math.abs(value) < 0.035 ? 0 : value;
  }

  function clampValue(value) {
    return L.clamp(roundTo(value, 2), -LIMIT, LIMIT);
  }

  function clampMatrix(m) {
    return L.mat2(
      clampValue(m.a),
      clampValue(m.b),
      clampValue(m.c),
      clampValue(m.d)
    );
  }

  function clampVector(v) {
    return { x: clampValue(v.x), y: clampValue(v.y) };
  }

  function statusLabel(status) {
    if (status === 'unique') return '唯一解';
    if (status === 'none') return '无解';
    return '无穷多解';
  }

  function statusClass(status) {
    if (status === 'unique') return 'is-unique';
    if (status === 'none') return 'is-none';
    return 'is-infinite';
  }

  function setStatusClass(el, status) {
    if (!el) return;
    el.classList.remove('is-unique', 'is-none', 'is-infinite');
    el.classList.add(statusClass(status));
  }

  function isReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function syncMatrixInputs(m) {
    var values = { a: m.a, b: m.b, c: m.c, d: m.d };
    Object.keys(els.inputs).forEach(function (key) {
      var input = els.inputs[key];
      if (input && document.activeElement !== input) {
        input.value = L.formatInput(values[key]);
      }
    });
  }

  function syncBInputs(b) {
    if (els.rhsX && document.activeElement !== els.rhsX) {
      els.rhsX.value = L.formatInput(b.x);
    }
    if (els.rhsY && document.activeElement !== els.rhsY) {
      els.rhsY.value = L.formatInput(b.y);
    }
  }

  /* ------------------------------------------------------------------ *
   * 读数
   * ------------------------------------------------------------------ */

  function solutionText(result) {
    if (result.status === 'unique') {
      return '(' + L.formatFixed(result.particular.x, 2) + ', ' + L.formatFixed(result.particular.y, 2) + ')';
    }
    if (result.status === 'none') return '—';
    if (result.dimension === 2) return '整个平面';
    return 'xₚ + t·v';
  }

  function updateProfessor(result) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.solve({
      status: result.status,
      rankA: result.rankA,
      rankAugmented: result.rankAugmented,
      dimension: result.dimension,
      det: result.det,
      view: state.view
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(result) {
    if (!els.solveHint) return;

    if (state.view === 'row') {
      els.solveHint.textContent = result.status === 'unique'
        ? '拖动交点 x；切到列视角，拖金色 b 的尖端'
        : '行视角里没有唯一交点；切到列视角，拖 b 试试';
    } else {
      els.solveHint.textContent = '拖动金色 b 的尖端；切到行视角，拖交点 x';
    }

    canvas.setAttribute('aria-label', state.view === 'row'
      ? '线性方程组行视角。两条约束直线，交点就是解；拖动交点可以改变 b。'
      : '线性方程组列视角。两列向量与目标 b；拖动 b 的尖端，观察它能否被两列组合出来。');
  }

  function updateReadouts() {
    var result = L.solve2(state.matrix, state.b);
    var status = result.status;

    els.canvasStatus.textContent = statusLabel(status);
    els.readoutStatus.textContent = statusLabel(status);
    els.readoutSolution.textContent = solutionText(result);
    els.readoutDet.textContent = L.formatFixed(result.det, 2);
    els.readoutRank.textContent = result.rankA + ' / ' + result.rankAugmented;

    setStatusClass(els.canvasStatus, status);
    setStatusClass(els.readoutStatus, status);
    if (els.solveChip) {
      els.solveChip.classList.remove('is-unique', 'is-none', 'is-infinite');
      els.solveChip.classList.add(statusClass(status));
    }

    // 挑战：找到“无解”。det 越大，离奇异越远，进度越低。
    var achieved = status === 'none';
    var progress = achieved
      ? 100
      : (result.rankA < 2 ? 78 : Math.max(0, Math.min(100, 100 - Math.abs(result.det) * 45)));

    els.challengeCard.classList.toggle('is-complete', achieved);
    els.challengeState.textContent = achieved ? '达成' : (result.rankA < 2 ? '接近' : '进行中');
    els.challengeDet.textContent = L.formatFixed(result.det, 2);
    els.challengeFill.style.width = progress.toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    updateHint(result);
    updateProfessor(result);
  }

  /* ------------------------------------------------------------------ *
   * 绘图工具
   * ------------------------------------------------------------------ */

  function identityMap(point) {
    return point;
  }

  function fitWorldSpan() {
    var target = view.width < 560 ? 7 : 9.5;
    if (view.worldSpan !== target) {
      view.worldSpan = target;
      view.resize();
    }
  }

  function rowLine(coefficient, range) {
    var a = coefficient.a;
    var b = coefficient.b;
    var rhs = coefficient.rhs;

    if (Math.abs(b) > EPS) {
      return [
        { x: -range, y: (rhs - a * (-range)) / b },
        { x: range, y: (rhs - a * range) / b }
      ];
    }
    if (Math.abs(a) > EPS) {
      var x = rhs / a;
      return [{ x: x, y: -range }, { x: x, y: range }];
    }
    return null;
  }

  function lineLabelPoint(line, t) {
    return {
      x: line[0].x + (line[1].x - line[0].x) * t,
      y: line[0].y + (line[1].y - line[0].y) * t
    };
  }

  function drawLineLabel(line, text, color, offsetY, preferredT) {
    if (!line) return;
    var candidates = [preferredT == null ? 0.62 : preferredT, 0.52, 0.72];
    var point = null;

    for (var i = 0; i < candidates.length; i++) {
      point = view.worldToScreen(lineLabelPoint(line, candidates[i]));
      if (view.contains(point, 72)) break;
    }
    if (!point || !view.contains(point, 56)) return;

    K.drawLabel(ctx, point.x, point.y + (offsetY || 0), text, {
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

  function drawRowView(ctx, m, b, result) {
    var rows = [
      { a: m.a, b: m.b, rhs: b.x, label: 'L₁', color: K.PALETTE.e1 },
      { a: m.c, b: m.d, rhs: b.y, label: 'L₂', color: K.PALETTE.e2 }
    ];
    var range = 10;
    var messages = [];

    rows.forEach(function (row, index) {
      var line = rowLine(row, range);

      if (!line) {
        if (Math.abs(row.rhs) <= EPS) {
          messages.push('0 = 0：整条平面');
        } else {
          messages.push('0 = 非零：无解');
        }
        return;
      }

      var coincident = result.status === 'infinite' && result.rankA === 1;
      K.drawWorldLine(ctx, view, line[0], line[1], {
        stroke: row.color,
        lineWidth: index === 0 ? 2 : 1.7,
        dash: index === 1 && coincident ? [7, 6] : null,
        alpha: index === 1 && coincident ? 0.55 : 1
      });
      drawLineLabel(line, row.label, row.color, index * 16, index === 0 ? 0.6 : 0.68);
    });

    if (result.status === 'unique' && result.particular) {
      K.drawPointWorld(ctx, view, result.particular, {
        radius: 5,
        fill: K.PALETTE.ink || '#2e312c',
        stroke: 'rgba(250, 246, 238, 0.96)',
        strokeWidth: 2
      });
      var sp = view.worldToScreen(result.particular);
      if (view.contains(sp, 40)) {
        K.drawLabel(ctx, sp.x + 12, sp.y - 14, 'x', {
          color: K.PALETTE.text,
          background: 'rgba(250, 246, 238, 0.94)',
          border: 'rgba(46, 49, 44, 0.18)',
          font: '600 12px "Cascadia Code", Consolas, monospace',
          fontSize: 13
        });
      }
    }

    if (result.status === 'infinite' && result.rankA === 1 && result.particular && result.freeDirection) {
      var dir = result.freeDirection;
      K.drawWorldLine(ctx, view,
        { x: result.particular.x - dir.x * 8, y: result.particular.y - dir.y * 8 },
        { x: result.particular.x + dir.x * 8, y: result.particular.y + dir.y * 8 },
        {
          stroke: K.PALETTE.gold,
          lineWidth: 2,
          dash: [5, 6]
        }
      );
      K.drawPointWorld(ctx, view, result.particular, {
        radius: 4,
        fill: K.PALETTE.gold,
        stroke: 'rgba(250, 246, 238, 0.96)',
        strokeWidth: 2
      });
      messages.push('解集：一整条线');
    }

    if (result.status === 'none') {
      messages.push('平行 · 无交点');
    }

    if (result.status === 'infinite' && result.rankA === 0) {
      messages.push('整个平面都是解');
    }

    messages = messages.filter(function (message, index) {
      return messages.indexOf(message) === index;
    });

    messages.forEach(function (message, index) {
      drawTopLabel(message, index === 0 ? K.PALETTE.warm : K.PALETTE.muted, index);
    });
  }

  function drawColumnsView(ctx, m, b, result) {
    var c1 = { x: m.a, y: m.c };
    var c2 = { x: m.b, y: m.d };
    var origin = { x: 0, y: 0 };
    var span = null;

    if (result.rankA === 1) {
      var base = L.length(c1) > L.length(c2) ? c1 : c2;
      if (L.length(base) > EPS) {
        span = L.normalize(base);
        K.drawWorldLine(ctx, view,
          { x: -span.x * 9, y: -span.y * 9 },
          { x: span.x * 9, y: span.y * 9 },
          {
            stroke: 'rgba(109, 112, 104, 0.32)',
            lineWidth: 1.2,
            dash: [4, 6]
          }
        );
        K.drawLabel(ctx, view.worldToScreen({ x: span.x * 5.5, y: span.y * 5.5 }).x,
          view.worldToScreen({ x: span.x * 5.5, y: span.y * 5.5 }).y,
          '列空间', {
            color: K.PALETTE.muted,
            background: 'rgba(250, 246, 238, 0.9)',
            border: 'rgba(46, 49, 44, 0.12)',
            font: '500 10px "Cascadia Code", Consolas, monospace',
            fontSize: 11
          });
      }
    }

    if (L.length(c1) > 0.01) {
      K.drawArrowWorld(ctx, view, origin, c1, {
        color: K.PALETTE.e1,
        lineWidth: 1.7,
        head: 9,
        headWidth: 4.5,
        label: 'c₁',
        labelColor: K.PALETTE.e1,
        labelOffset: { x: 10, y: -10 }
      });
    }
    if (L.length(c2) > 0.01) {
      K.drawArrowWorld(ctx, view, origin, c2, {
        color: K.PALETTE.e2,
        lineWidth: 1.7,
        head: 9,
        headWidth: 4.5,
        label: 'c₂',
        labelColor: K.PALETTE.e2,
        labelOffset: { x: 10, y: -10 }
      });
    }

    if (result.status === 'unique' && result.particular) {
      var x = result.particular.x;
      var y = result.particular.y;
      var xc1 = L.scaleVec(c1, x);
      var yc2 = L.scaleVec(c2, y);

      if (L.length(xc1) > 0.02) {
        K.drawArrowWorld(ctx, view, origin, xc1, {
          color: 'rgba(116, 134, 118, 0.28)',
          lineWidth: 1.2,
          head: 7,
          headWidth: 3.5
        });
      }
      if (L.length(yc2) > 0.02) {
        K.drawArrowWorld(ctx, view, origin, yc2, {
          color: 'rgba(176, 125, 110, 0.28)',
          lineWidth: 1.2,
          head: 7,
          headWidth: 3.5
        });
      }

      K.drawWorldLine(ctx, view, xc1, b, {
        stroke: 'rgba(46, 49, 44, 0.2)',
        lineWidth: 1.1,
        dash: [3, 5]
      });
      K.drawWorldLine(ctx, view, yc2, b, {
        stroke: 'rgba(46, 49, 44, 0.2)',
        lineWidth: 1.1,
        dash: [3, 5]
      });
    }

    if (result.status === 'none' && span) {
      var foot = L.scaleVec(span, L.dot(b, span));
      K.drawWorldLine(ctx, view, b, foot, {
        stroke: 'rgba(164, 92, 85, 0.55)',
        lineWidth: 1.3,
        dash: [4, 4]
      });
      drawTopLabel('b 不在列空间 · 无解', K.PALETTE.danger, 0);
    } else if (result.status === 'none' && result.rankA === 0) {
      drawTopLabel('b ≠ 0 · 无解', K.PALETTE.danger, 0);
    }

    if (result.status === 'infinite') {
      drawTopLabel(result.rankA === 0 ? 'b = 0 · 整个平面' : 'b 在列空间里 · 表示不唯一', K.PALETTE.warm, 0);
    }

    if (L.length(b) > 0.01) {
      K.drawArrowWorld(ctx, view, origin, b, {
        color: K.PALETTE.gold,
        lineWidth: 2.6,
        head: 11,
        headWidth: 5.5,
        label: 'b',
        labelColor: K.PALETTE.gold,
        labelOffset: { x: 12, y: -12 }
      });
    } else {
      K.drawPointWorld(ctx, view, origin, {
        radius: 4,
        fill: K.PALETTE.gold,
        stroke: 'rgba(250, 246, 238, 0.96)',
        strokeWidth: 2
      });
      drawTopLabel('b = 0', K.PALETTE.gold, 0);
    }

    K.drawPointWorld(ctx, view, origin, {
      radius: 3,
      fill: K.PALETTE.origin
    });
  }

  var ctx;

  function draw() {
    view.resize();
    fitWorldSpan();
    ctx = view.ctx;

    K.drawBackdrop(ctx, view);
    K.drawGrid(ctx, view, identityMap, {
      range: 12,
      minor: 'rgba(46, 49, 44, 0.05)',
      major: 'rgba(46, 49, 44, 0.085)',
      lineWidth: 0.8,
      majorWidth: 1
    });
    K.drawAxes(ctx, view, identityMap, {
      range: 12,
      color: 'rgba(46, 49, 44, 0.32)',
      lineWidth: 1.1
    });

    var result = L.solve2(state.matrix, state.b);
    if (state.view === 'row') {
      drawRowView(ctx, state.matrix, state.b, result);
    } else {
      drawColumnsView(ctx, state.matrix, state.b, result);
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

  function setMatrix(matrix) {
    state.matrix = clampMatrix(matrix);
    syncMatrixInputs(state.matrix);
    updateReadouts();
    requestRender();
  }

  function setB(vector) {
    state.b = clampVector(vector);
    syncBInputs(state.b);
    updateReadouts();
    requestRender();
  }

  function readMatrixInput(key, input) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;

    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;

    var matrix = copyMatrix(state.matrix);
    matrix[key] = clampValue(value);
    state.matrix = matrix;
    updateReadouts();
    requestRender();
  }

  function readBInput(axis, input) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;

    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;

    var b = copyVector(state.b);
    b[axis] = clampValue(value);
    state.b = b;
    updateReadouts();
    requestRender();
  }

  function setView(nextView) {
    if (nextView !== 'row' && nextView !== 'column') return;
    state.view = nextView;

    els.viewBtns.forEach(function (button) {
      var active = button.getAttribute('data-view') === nextView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    updateReadouts();
    requestRender();
  }

  /* ------------------------------------------------------------------ *
   * 拖动
   * ------------------------------------------------------------------ */

  function hitTarget(event) {
    var point = view.pointerPosition(event);
    var result = L.solve2(state.matrix, state.b);

    if (state.view === 'row') {
      if (result.status !== 'unique' || !result.particular) return false;
      return K.hitTestPoint(view, result.particular, point, 22);
    }
    return K.hitTestPoint(view, state.b, point, 22);
  }

  function updateFromPointer(event) {
    var screen = view.pointerPosition(event);
    var world = view.screenToWorld(screen);

    if (state.view === 'row') {
      setB(L.applyMat(state.matrix, world));
    } else {
      setB(world);
    }
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
      readMatrixInput(key, input);
    });
    input.addEventListener('blur', function () {
      input.value = L.formatInput(state.matrix[key]);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') input.blur();
    });
  });

  if (els.rhsX) {
    els.rhsX.addEventListener('input', function () {
      readBInput('x', els.rhsX);
    });
    els.rhsX.addEventListener('blur', function () {
      els.rhsX.value = L.formatInput(state.b.x);
    });
    els.rhsX.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') els.rhsX.blur();
    });
  }

  if (els.rhsY) {
    els.rhsY.addEventListener('input', function () {
      readBInput('y', els.rhsY);
    });
    els.rhsY.addEventListener('blur', function () {
      els.rhsY.value = L.formatInput(state.b.y);
    });
    els.rhsY.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') els.rhsY.blur();
    });
  }

  els.viewBtns.forEach(function (button) {
    button.addEventListener('click', function () {
      setView(button.getAttribute('data-view'));
    });
  });

  els.btnReset.addEventListener('click', function () {
    setMatrix(INITIAL.matrix);
    setB(INITIAL.b);
    setView('row');
  });

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = PRESETS[button.getAttribute('data-preset')];
      if (!preset) return;
      setMatrix(preset.matrix);
      setB(preset.b);
    });
  });

  canvas.addEventListener('pointerdown', function (event) {
    if (!hitTarget(event)) return;

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
    canvas.classList.toggle('is-grabbable', hitTarget(event));
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
      text: '对。平行线没有交点；代数上就是 rank[A|b] > rank A。'
    },
    '1': {
      correct: false,
      text: '平行线不会相交。一个解属于两条不平行的线。'
    },
    infinite: {
      correct: false,
      text: '重合才有无穷多解；平行是另一回事。'
    }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-solve');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-solve');
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
    setMatrix(PRESETS.parallel.matrix);
    setB(PRESETS.parallel.b);
    setView('row');
    if (stageCard) {
      stageCard.scrollIntoView({
        behavior: isReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  });

  /* ------------------------------------------------------------------ *
   * 小图：两条平行线
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

    K.drawWorldLine(qctx, qv, { x: -7, y: 1.1 }, { x: 7, y: 1.1 }, {
      stroke: K.PALETTE.e1,
      lineWidth: 2
    });
    K.drawWorldLine(qctx, qv, { x: -7, y: -1.1 }, { x: 7, y: -1.1 }, {
      stroke: K.PALETTE.e2,
      lineWidth: 2
    });

    K.drawLabel(qctx, qv.worldToScreen({ x: 3.6, y: 1.1 }).x,
      qv.worldToScreen({ x: 3.6, y: 1.1 }).y - 8,
      'L₁', {
        color: K.PALETTE.e1,
        background: 'rgba(250, 246, 238, 0.92)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '600 11px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
    K.drawLabel(qctx, qv.worldToScreen({ x: 3.6, y: -1.1 }).x,
      qv.worldToScreen({ x: 3.6, y: -1.1 }).y - 8,
      'L₂', {
        color: K.PALETTE.e2,
        background: 'rgba(250, 246, 238, 0.92)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '600 11px "Cascadia Code", Consolas, monospace',
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
      var rawMatrix = params.get('m');
      var rawB = params.get('b');
      var rawView = params.get('view');

      if (rawMatrix) {
        var values = rawMatrix.split(',').map(Number);
        if (values.length === 4 && values.every(Number.isFinite)) {
          state.matrix = clampMatrix(L.mat2(values[0], values[1], values[2], values[3]));
        }
      }
      if (rawB) {
        var bValues = rawB.split(',').map(Number);
        if (bValues.length === 2 && bValues.every(Number.isFinite)) {
          state.b = clampVector({ x: bValues[0], y: bValues[1] });
        }
      }
      if (rawView === 'row' || rawView === 'column') {
        state.view = rawView;
        els.viewBtns.forEach(function (button) {
          var active = button.getAttribute('data-view') === rawView;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
      }
    } catch (error) {
      // URL 参数只是增强，不影响主流程。
    }
  })();

  syncMatrixInputs(state.matrix);
  syncBInputs(state.b);
  updateReadouts();
  requestRender();
  drawQuiz();
  window.addEventListener('resize', drawQuiz);

  /* ------------------------------------------------------------------ *
   * 全屏无限空间（space-mode.js）
   * ------------------------------------------------------------------ */

  if (window.LinearSpace) {
    window.LinearSpace.attach({
      canvas: canvas,
      view: view,
      redraw: requestRender,
      hitTest: function (event) { return !!hitTarget(event); },
      landmarks: function () {
        var marks = [{ x: state.b.x, y: state.b.y, color: K.PALETTE.gold }];
        var solved = L.solve2(state.matrix, state.b);
        if (solved && solved.unique && solved.solution) {
          marks.push({ x: solved.solution.x, y: solved.solution.y, color: K.PALETTE.e1 });
        }
        return marks;
      }
    });
  }

})();
