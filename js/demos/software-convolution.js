/**
 * software-convolution.js · 计算机软件应用 01：图像卷积
 *
 * y[i,j] = Σ k[r,c] · x[i+r, j+c]
 * 同一个 3×3 核作用到 7×7 输入图的每个窗口，得到 5×5 输出图。
 */
(function () {
  'use strict';

  var K = window.CanvasKit;
  if (!K) {
    console.error('[software-convolution] 缺少 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('conv-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10, padding: 0 });
  var LEVEL_FACTOR = window.LinAlgLevel ? window.LinAlgLevel.factor : 1;
  var EDGE_TARGET = 0.85;

  var KERNELS = {
    identity: {
      name: '恒等',
      values: [0, 0, 0, 0, 1, 0, 0, 0, 0]
    },
    blur: {
      name: '模糊',
      values: [1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9]
    },
    edge: {
      name: '边缘',
      values: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    },
    sharpen: {
      name: '锐化',
      values: [0, -1, 0, -1, 5, -1, 0, -1, 0]
    },
    emboss: {
      name: '浮雕',
      values: [-2, -1, 0, -1, 1, 1, 0, 1, 2]
    }
  };

  // 7×7 输入图：左侧暗、右侧亮，中间是一条竖直边缘；再加两个亮点。
  var IMAGE = (function () {
    var data = [];
    for (var y = 0; y < 7; y++) {
      var row = [];
      for (var x = 0; x < 7; x++) {
        var value = x < 3 ? 0.2 + y * 0.018 : 0.68 - y * 0.012;
        if (x === 1 && y === 1) value = 0.94;
        if (x === 5 && y === 5) value = 0.12;
        row.push(value);
      }
      data.push(row);
    }
    return data;
  })();

  var state = {
    kernel: 'edge',
    window: { x: 0, y: 2 },
    dragging: false,
    dragOffset: { x: 1, y: 1 }
  };

  var els = {
    kernelGrid: document.getElementById('kernel-grid'),
    kernelCells: Array.prototype.slice.call(document.querySelectorAll('[data-kernel-cell]')),
    kernelButtons: Array.prototype.slice.call(document.querySelectorAll('[data-kernel]')),
    output: document.getElementById('readout-output'),
    window: document.getElementById('readout-window'),
    kernelName: document.getElementById('readout-kernel'),
    range: document.getElementById('readout-range'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('conv-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-conv]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var rafId = null;
  var ctx = null;
  var sourceRect = null;
  var sourceCell = 1;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function kernelValues() {
    return KERNELS[state.kernel].values;
  }

  function outputAt(wx, wy) {
    var k = kernelValues();
    var sum = 0;
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        sum += k[r * 3 + c] * IMAGE[wy + r][wx + c];
      }
    }
    return sum;
  }

  function compute() {
    var out = [];
    var min = Infinity;
    var max = -Infinity;
    var maxAbs = 0;
    for (var y = 0; y < 5; y++) {
      var row = [];
      for (var x = 0; x < 5; x++) {
        var value = outputAt(x, y);
        row.push(value);
        min = Math.min(min, value);
        max = Math.max(max, value);
        maxAbs = Math.max(maxAbs, Math.abs(value));
      }
      out.push(row);
    }

    var current = out[state.window.y][state.window.x];
    var progress = maxAbs > 1e-9 ? Math.abs(current) / maxAbs * 100 : 0;

    return {
      out: out,
      min: min,
      max: max,
      maxAbs: maxAbs,
      current: current,
      progress: progress,
      achieved: maxAbs > 0.15 && progress >= EDGE_TARGET * 100
    };
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.convolution({
      kernel: state.kernel,
      value: data.current,
      maxAbs: data.maxAbs,
      progress: data.progress
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    if (data.achieved) {
      els.hint.textContent = '找到强边缘了；换个核，看看同一个窗口会变成什么';
    } else {
      els.hint.textContent = '拖动金色窗口，或用方向键移动';
    }
  }

  function formatKernel(value) {
    if (Math.abs(value) < 1e-9) return '0';
    if (Math.abs(value - 1) < 1e-9) return '1';
    if (Math.abs(value + 1) < 1e-9) return '−1';
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('-0.', '−0.');
  }

  function updateKernelCells() {
    var k = kernelValues();
    els.kernelCells.forEach(function (cell, index) {
      var value = k[index];
      cell.textContent = formatKernel(value);
      cell.classList.toggle('is-negative', value < -1e-9);
      cell.classList.toggle('is-center', index === 4);
    });
    els.kernelButtons.forEach(function (button) {
      var active = button.getAttribute('data-kernel') === state.kernel;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    els.kernelName.textContent = KERNELS[state.kernel].name;
  }

  function updateReadouts() {
    var data = compute();

    els.output.textContent = (Math.abs(data.current) < 0.005 ? 0 : data.current).toFixed(2);
    els.window.textContent = '(' + (state.window.y + 1) + ', ' + (state.window.x + 1) + ')';
    els.range.textContent = data.min.toFixed(2) + ' … ' + data.max.toFixed(2);
    els.status.textContent = data.achieved ? '强边缘 · 高响应' : '局部线性映射';

    els.challengeCard.classList.toggle('is-complete', data.achieved);
    els.challengeState.textContent = data.achieved ? '达成' : (data.progress > 70 ? '接近' : '进行中');
    els.challengeDistance.textContent = Math.round(data.progress) + '%';
    els.challengeFill.style.width = clamp(data.progress, 0, 100).toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(clamp(data.progress, 0, 100))));

    updateKernelCells();
    updateHint(data);
    updateProfessor(data);
    draw();
  }

  /* ------------------------------------------------------------------ *
   * 绘图
   * ------------------------------------------------------------------ */

  function layout() {
    var W = view.width;
    var H = view.height;
    if (W >= 620) {
      return {
        source: { x: W * 0.05, y: H * 0.15, w: W * 0.42, h: H * 0.68 },
        output: { x: W * 0.61, y: H * 0.24, w: W * 0.33, h: H * 0.52 }
      };
    }
    return {
      source: { x: W * 0.08, y: H * 0.08, w: W * 0.84, h: H * 0.36 },
      output: { x: W * 0.20, y: H * 0.54, w: W * 0.60, h: H * 0.34 }
    };
  }

  function imageColor(value) {
    var v = clamp(value, 0, 1);
    return 'rgba(46, 49, 44, ' + (0.08 + v * 0.58).toFixed(3) + ')';
  }

  function drawSource(layoutData, data) {
    var rect = layoutData.source;
    var cell = Math.min(rect.w / 7, rect.h / 7);
    var width = cell * 7;
    var height = cell * 7;
    var x0 = rect.x + (rect.w - width) / 2;
    var y0 = rect.y + (rect.h - height) / 2;
    sourceRect = { x: x0, y: y0, cell: cell };
    sourceCell = cell;

    ctx.save();
    ctx.fillStyle = 'rgba(250, 246, 238, 0.6)';
    ctx.fillRect(x0, y0, width, height);
    ctx.restore();

    for (var y = 0; y < 7; y++) {
      for (var x = 0; x < 7; x++) {
        ctx.fillStyle = imageColor(IMAGE[y][x]);
        ctx.fillRect(x0 + x * cell, y0 + y * cell, cell - 1, cell - 1);
      }
    }

    // 网格
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 246, 238, 0.55)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 7; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + i * cell, y0);
      ctx.lineTo(x0 + i * cell, y0 + height);
      ctx.moveTo(x0, y0 + i * cell);
      ctx.lineTo(x0 + width, y0 + i * cell);
      ctx.stroke();
    }
    ctx.restore();

    // 当前 3×3 窗口
    var wx = x0 + state.window.x * cell;
    var wy = y0 + state.window.y * cell;
    ctx.save();
    ctx.fillStyle = 'rgba(191, 163, 106, 0.1)';
    ctx.fillRect(wx, wy, cell * 3, cell * 3);
    ctx.strokeStyle = K.PALETTE.gold;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(wx + 1, wy + 1, cell * 3 - 2, cell * 3 - 2);
    ctx.restore();

    K.drawLabel(ctx, x0 + width / 2, y0 - 18,
      '输入 7×7 · 窗口 (' + (state.window.y + 1) + ',' + (state.window.x + 1) + ')', {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });

    K.drawLabel(ctx, wx + cell * 1.5, wy - 12, '3×3', {
      color: K.PALETTE.gold,
      background: 'rgba(250, 246, 238, 0.95)',
      border: 'rgba(191, 163, 106, 0.3)',
      font: '500 10px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });

    // 窗口中心的输入值，帮助把“窗口”与“输出”对上
    K.drawLabel(ctx, x0 + width / 2, y0 + height + 18,
      '当前中心像素 ' + IMAGE[state.window.y + 1][state.window.x + 1].toFixed(2), {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10
      });

    return { x: x0, y: y0, cell: cell, width: width, height: height };
  }

  function drawOutput(layoutData, data) {
    var rect = layoutData.output;
    var cell = Math.min(rect.w / 5, rect.h / 5);
    var width = cell * 5;
    var height = cell * 5;
    var x0 = rect.x + (rect.w - width) / 2;
    var y0 = rect.y + (rect.h - height) / 2;
    var maxAbs = Math.max(1e-9, data.maxAbs);

    ctx.save();
    ctx.fillStyle = 'rgba(250, 246, 238, 0.55)';
    ctx.fillRect(x0, y0, width, height);
    ctx.restore();

    data.out.forEach(function (row, y) {
      row.forEach(function (value, x) {
        var ratio = Math.abs(value) / maxAbs;
        ctx.fillStyle = value >= 0
          ? 'rgba(116, 134, 118, ' + (0.08 + ratio * 0.62).toFixed(3) + ')'
          : 'rgba(176, 125, 110, ' + (0.08 + ratio * 0.62).toFixed(3) + ')';
        ctx.fillRect(x0 + x * cell, y0 + y * cell, cell - 1, cell - 1);

        if (cell >= 32) {
          K.drawLabel(ctx, x0 + x * cell + cell / 2, y0 + y * cell + cell / 2,
            value.toFixed(1), {
              color: ratio > 0.55 ? 'rgba(250, 246, 238, 0.92)' : K.PALETTE.muted,
              background: 'transparent',
              border: null,
              font: '500 9px "Cascadia Code", Consolas, monospace',
              fontSize: 10
            });
        }
      });
    });

    ctx.save();
    ctx.strokeStyle = 'rgba(250, 246, 238, 0.55)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + i * cell, y0);
      ctx.lineTo(x0 + i * cell, y0 + height);
      ctx.moveTo(x0, y0 + i * cell);
      ctx.lineTo(x0 + width, y0 + i * cell);
      ctx.stroke();
    }
    ctx.restore();

    var sx = x0 + state.window.x * cell;
    var sy = y0 + state.window.y * cell;
    ctx.save();
    ctx.strokeStyle = K.PALETTE.gold;
    ctx.lineWidth = 2.2;
    ctx.strokeRect(sx + 1, sy + 1, cell - 2, cell - 2);
    ctx.restore();

    K.drawLabel(ctx, x0 + width / 2, y0 - 18,
      '输出 5×5 · 当前 ' + data.current.toFixed(2), {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });

    K.drawLabel(ctx, x0 + width / 2, y0 + height + 20,
      '每个格子 = 一次 3×3 点积', {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10
      });
  }

  function draw() {
    view.resize();
    ctx = view.ctx;
    K.drawBackdrop(ctx, view);

    var layoutData = layout();
    var data = compute();
    drawSource(layoutData, data);
    drawOutput(layoutData, data);

    K.drawLabel(ctx, 22, 26, 'y = Σ kᵢⱼxᵢⱼ', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.12)',
      font: '500 10px "Cascadia Code", Consolas, monospace',
      fontSize: 11
    });
  }

  function requestRender() {
    if (rafId == null) rafId = window.requestAnimationFrame(function () {
      rafId = null;
      draw();
    });
  }

  /* ------------------------------------------------------------------ *
   * 拖动窗口
   * ------------------------------------------------------------------ */

  function sourceCellAt(event) {
    if (!sourceRect) return null;
    var p = view.pointerPosition(event);
    var cx = Math.floor((p.x - sourceRect.x) / sourceRect.cell);
    var cy = Math.floor((p.y - sourceRect.y) / sourceRect.cell);
    if (cx < 0 || cx >= 7 || cy < 0 || cy >= 7) return null;
    return { x: cx, y: cy };
  }

  function updateWindowFromPointer(event) {
    var cell = sourceCellAt(event);
    if (!cell) return;
    var x = clamp(cell.x - state.dragOffset.x, 0, 4);
    var y = clamp(cell.y - state.dragOffset.y, 0, 4);
    if (x === state.window.x && y === state.window.y) return;
    state.window.x = x;
    state.window.y = y;
    updateReadouts();
  }

  function endDrag(event) {
    state.dragging = false;
    canvas.classList.remove('is-dragging');
    canvas.classList.remove('is-grabbable');
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener('pointerdown', function (event) {
    var cell = sourceCellAt(event);
    if (!cell) return;
    event.preventDefault();
    state.dragging = true;
    state.dragOffset = {
      x: cell.x - state.window.x,
      y: cell.y - state.window.y
    };
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    canvas.classList.remove('is-grabbable');
    updateWindowFromPointer(event);
  });

  canvas.addEventListener('pointermove', function (event) {
    if (state.dragging) {
      event.preventDefault();
      updateWindowFromPointer(event);
      return;
    }
    canvas.classList.toggle('is-grabbable', !!sourceCellAt(event));
  });

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', function () {
    if (!state.dragging) canvas.classList.remove('is-grabbable');
  });

  canvas.addEventListener('keydown', function (event) {
    var dx = 0;
    var dy = 0;
    if (event.key === 'ArrowLeft') dx = -1;
    else if (event.key === 'ArrowRight') dx = 1;
    else if (event.key === 'ArrowUp') dy = -1;
    else if (event.key === 'ArrowDown') dy = 1;
    else return;
    event.preventDefault();
    state.window.x = clamp(state.window.x + dx, 0, 4);
    state.window.y = clamp(state.window.y + dy, 0, 4);
    updateReadouts();
  });

  /* ------------------------------------------------------------------ *
   * 预设核
   * ------------------------------------------------------------------ */

  els.kernelButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var kernel = button.getAttribute('data-kernel');
      if (!KERNELS[kernel]) return;
      state.kernel = kernel;
      updateReadouts();
    });
  });

  els.btnReset.addEventListener('click', function () {
    state.kernel = 'edge';
    state.window = { x: 0, y: 2 };
    updateReadouts();
  });

  els.btnQuizApply.addEventListener('click', function () {
    state.kernel = 'edge';
    state.window = { x: 0, y: 2 };
    updateReadouts();
    if (stageCard) {
      stageCard.scrollIntoView({
        behavior: isReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    a: { correct: false, text: '不是取最大；卷积核会把 9 个像素都按权重算进去。' },
    b: { correct: true, text: '对。9 个输入像素 × 9 个核权重，再求和，得到一个输出。' },
    c: { correct: false, text: '这里没有旋转操作；改变的是权重，不是窗口的方向。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-conv');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-conv');
        option.classList.toggle('is-correct', value === 'b' && answer === 'b');
        option.classList.toggle('is-wrong', value === answer && answer !== 'b');
        option.setAttribute('aria-pressed', String(value === answer));
      });

      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  /* ------------------------------------------------------------------ *
   * 小图
   * ------------------------------------------------------------------ */

  function drawQuiz() {
    var q = els.quizCanvas;
    if (!q) return;
    var qv = K.createViewport(q, { worldSpan: 5, padding: 20 });
    qv.resize();
    var qctx = qv.ctx;

    K.drawBackdrop(qctx, qv);

    var startX = qv.width * 0.14;
    var startY = qv.height * 0.3;
    var cell = Math.min(qv.width * 0.11, qv.height * 0.16);

    for (var y = 0; y < 3; y++) {
      for (var x = 0; x < 3; x++) {
        qctx.fillStyle = x === 1 && y === 1
          ? 'rgba(191, 163, 106, 0.28)'
          : 'rgba(46, 49, 44, 0.12)';
        qctx.fillRect(startX + x * cell, startY + y * cell, cell - 2, cell - 2);
      }
    }

    K.drawLabel(qctx, startX + cell * 1.5, startY - 16, '3×3 输入', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(46, 49, 44, 0.1)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });

    var arrowX = startX + cell * 3.4;
    var arrowY = startY + cell * 1.5;
    qctx.save();
    qctx.strokeStyle = K.PALETTE.gold;
    qctx.lineWidth = 2;
    qctx.beginPath();
    qctx.moveTo(arrowX, arrowY);
    qctx.lineTo(arrowX + qv.width * 0.18, arrowY);
    qctx.stroke();
    qctx.restore();

    K.drawLabel(qctx, arrowX + qv.width * 0.09, arrowY - 16, '9 → 1', {
      color: K.PALETTE.gold,
      background: 'rgba(250, 246, 238, 0.92)',
      border: 'rgba(191, 163, 106, 0.25)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });

    var outX = arrowX + qv.width * 0.26;
    qctx.fillStyle = 'rgba(116, 134, 118, 0.3)';
    qctx.fillRect(outX, arrowY - cell * 0.6, cell * 1.2, cell * 1.2);
    K.drawLabel(qctx, outX + cell * 0.6, arrowY - cell * 1.0, 'y', {
      color: K.PALETTE.e1,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(46, 49, 44, 0.1)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
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
      var kernel = params.get('kernel');
      var x = parseInt(params.get('x'), 10);
      var y = parseInt(params.get('y'), 10);
      if (KERNELS[kernel]) state.kernel = kernel;
      if (Number.isFinite(x)) state.window.x = clamp(x, 0, 4);
      if (Number.isFinite(y)) state.window.y = clamp(y, 0, 4);
    } catch (error) {
      // URL 参数只做增强。
    }
  })();

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
