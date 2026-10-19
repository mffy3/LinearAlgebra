/**
 * software-pca.js · 计算机软件应用 02：PCA 主成分分析
 *
 * 中心化 → 协方差矩阵 → 最大特征向量 = PC1
 * 投影坐标 t = (x − x̄) · v₁
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[software-pca] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('pca-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 11, padding: 34 });
  var MEAN = { x: 0.1, y: -0.1 };
  var TARGET_EXPLAINED = 0.9;

  function makeBase() {
    var seed = 20261019;
    function rand() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    function gauss() {
      return rand() + rand() + rand() + rand() + rand() + rand() - 3;
    }
    var points = [];
    for (var i = 0; i < 64; i++) {
      points.push({ x: gauss() * 0.82, y: gauss() * 0.72 });
    }
    return points;
  }

  var BASE = makeBase();

  var state = {
    theta: 30,
    stretch: 2.2,
    showProjection: true,
    dragging: false,
    dragStartAngle: 0,
    dragStartTheta: 30
  };

  var els = {
    thetaRange: document.getElementById('theta-range'),
    theta: document.getElementById('theta'),
    stretchRange: document.getElementById('stretch-range'),
    stretch: document.getElementById('stretch'),
    toggleProjection: document.getElementById('toggle-projection'),
    thetaOut: document.getElementById('readout-theta'),
    stretchOut: document.getElementById('readout-stretch'),
    eigenOut: document.getElementById('readout-eigen'),
    explainedOut: document.getElementById('readout-explained'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('pca-hint'),
    matrixSigma: document.getElementById('matrix-sigma'),
    matrixPc1: document.getElementById('matrix-pc1'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-pca]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var rafId = null;
  var ctx = null;
  var axisTip = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeHalfTurn(value) {
    var a = value % 180;
    return a < 0 ? a + 180 : a;
  }

  function isReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function transformedPoints() {
    var rad = state.theta * Math.PI / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    return BASE.map(function (p) {
      var u = state.stretch * p.x;
      var v = p.y;
      return {
        x: MEAN.x + u * cos - v * sin,
        y: MEAN.y + u * sin + v * cos
      };
    });
  }

  function compute() {
    var points = transformedPoints();
    var n = points.length;
    var sx = 0;
    var sy = 0;
    points.forEach(function (p) {
      sx += p.x;
      sy += p.y;
    });
    var mean = { x: sx / n, y: sy / n };

    var sxx = 0;
    var syy = 0;
    var sxy = 0;
    points.forEach(function (p) {
      var dx = p.x - mean.x;
      var dy = p.y - mean.y;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    });
    sxx /= (n - 1);
    syy /= (n - 1);
    sxy /= (n - 1);

    var sigma = L.mat2(sxx, sxy, sxy, syy);
    var eigen = L.eigen2(sigma);
    var pairs = eigen.values.map(function (value, index) {
      return {
        value: value.re,
        vector: L.normalize(eigen.vectors[index] || { x: 1, y: 0 })
      };
    }).sort(function (a, b) { return b.value - a.value; });

    var lambda1 = Math.max(0, pairs[0].value);
    var lambda2 = Math.max(0, pairs[1].value);
    var total = lambda1 + lambda2;
    var explained = total > 1e-12 ? lambda1 / total : 0;
    var v1 = pairs[0].vector;
    var v2 = pairs[1].vector;

    var projections = points.map(function (p) {
      var dx = p.x - mean.x;
      var dy = p.y - mean.y;
      var t = dx * v1.x + dy * v1.y;
      return {
        t: t,
        x: mean.x + t * v1.x,
        y: mean.y + t * v1.y
      };
    });

    return {
      points: points,
      mean: mean,
      sigma: sigma,
      lambda1: lambda1,
      lambda2: lambda2,
      explained: explained,
      v1: v1,
      v2: v2,
      projections: projections
    };
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.pca({
      theta: state.theta,
      stretch: state.stretch,
      explained: data.explained
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    if (data.explained >= TARGET_EXPLAINED) {
      els.hint.textContent = '一条线已经保留 90% 以上的方差；投影点几乎重合';
    } else {
      els.hint.textContent = '拖动金色主轴端点旋转点云，或调整拉伸';
    }
  }

  function updateReadouts() {
    var data = compute();
    var explainedPercent = data.explained * 100;

    els.thetaOut.textContent = state.theta.toFixed(1) + '°';
    els.stretchOut.textContent = state.stretch.toFixed(2) + '×';
    els.eigenOut.textContent = data.lambda1.toFixed(3) + ' / ' + data.lambda2.toFixed(3);
    els.explainedOut.textContent = explainedPercent.toFixed(1) + '%';
    els.status.textContent = data.explained >= TARGET_EXPLAINED
      ? '一条线 · 高解释'
      : '中心化 · 主方向';

    els.matrixSigma.textContent =
      '[[' + data.sigma.a.toFixed(3) + ', ' + data.sigma.b.toFixed(3) + '], [' +
      data.sigma.c.toFixed(3) + ', ' + data.sigma.d.toFixed(3) + ']]';
    els.matrixPc1.textContent =
      '(' + data.v1.x.toFixed(2) + ', ' + data.v1.y.toFixed(2) + ')';

    var progress = clamp((data.explained - 0.5) / (TARGET_EXPLAINED - 0.5) * 100, 0, 100);
    var achieved = data.explained >= TARGET_EXPLAINED;
    if (achieved) progress = 100;

    els.challengeCard.classList.toggle('is-complete', achieved);
    els.challengeState.textContent = achieved ? '达成' : (explainedPercent > 82 ? '接近' : '进行中');
    els.challengeDistance.textContent = explainedPercent.toFixed(1) + '%';
    els.challengeFill.style.width = progress.toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    updateHint(data);
    updateProfessor(data);
    draw();
  }

  /* ------------------------------------------------------------------ *
   * 绘图
   * ------------------------------------------------------------------ */

  function ellipsePoints(mean, lambda1, lambda2, v1, v2) {
    var r1 = Math.sqrt(Math.max(0, lambda1)) * 2.2;
    var r2 = Math.sqrt(Math.max(0, lambda2)) * 2.2;
    var points = [];
    for (var i = 0; i < 80; i++) {
      var t = i / 80 * Math.PI * 2;
      points.push({
        x: mean.x + Math.cos(t) * r1 * v1.x + Math.sin(t) * r2 * v2.x,
        y: mean.y + Math.cos(t) * r1 * v1.y + Math.sin(t) * r2 * v2.y
      });
    }
    return points;
  }

  function draw() {
    view.resize();
    ctx = view.ctx;
    var data = compute();

    K.drawBackdrop(ctx, view);
    K.drawGrid(ctx, view, function (p) { return p; }, {
      range: 12,
      minor: 'rgba(46, 49, 44, 0.045)',
      major: 'rgba(46, 49, 44, 0.08)',
      lineWidth: 0.8,
      majorWidth: 1
    });
    K.drawAxes(ctx, view, function (p) { return p; }, {
      range: 12,
      color: 'rgba(46, 49, 44, 0.24)',
      lineWidth: 1.1
    });

    K.drawWorldPolygon(ctx, view, ellipsePoints(data.mean, data.lambda1, data.lambda2, data.v1, data.v2), {
      fill: 'rgba(116, 134, 118, 0.045)',
      stroke: 'rgba(116, 134, 118, 0.22)',
      lineWidth: 1,
      dash: [4, 6]
    });

    // 一维投影线
    K.drawWorldLine(ctx, view,
      { x: data.mean.x - data.v1.x * 4.2, y: data.mean.y - data.v1.y * 4.2 },
      { x: data.mean.x + data.v1.x * 4.2, y: data.mean.y + data.v1.y * 4.2 }, {
        stroke: 'rgba(191, 163, 106, 0.38)',
        lineWidth: 1.4,
        dash: [5, 6]
      });

    if (state.showProjection) {
      data.points.forEach(function (point, index) {
        var projection = data.projections[index];
        K.drawWorldLine(ctx, view, point, projection, {
          stroke: 'rgba(46, 49, 44, 0.08)',
          lineWidth: 0.8
        });
        K.drawPointWorld(ctx, view, projection, {
          radius: 2.2,
          fill: 'rgba(191, 163, 106, 0.55)'
        });
      });
    }

    data.points.forEach(function (point) {
      K.drawPointWorld(ctx, view, point, {
        radius: 2.7,
        fill: K.PALETTE.muted,
        stroke: 'rgba(250, 246, 238, 0.55)',
        strokeWidth: 0.8
      });
    });

    K.drawPointWorld(ctx, view, data.mean, {
      radius: 4,
      fill: K.PALETTE.ink,
      stroke: 'rgba(250, 246, 238, 0.96)',
      strokeWidth: 2
    });

    var tip = {
      x: data.mean.x + data.v1.x * 3.15,
      y: data.mean.y + data.v1.y * 3.15
    };
    axisTip = tip;

    K.drawArrowWorld(ctx, view, data.mean, tip, {
      color: K.PALETTE.gold,
      lineWidth: 2.4,
      head: 10,
      headWidth: 5,
      label: 'PC1',
      labelColor: K.PALETTE.gold,
      labelOffset: { x: 12, y: -14 }
    });

    K.drawArrowWorld(ctx, view, data.mean, {
      x: data.mean.x + data.v2.x * 2.0,
      y: data.mean.y + data.v2.y * 2.0
    }, {
      color: 'rgba(116, 134, 118, 0.72)',
      lineWidth: 1.6,
      head: 8,
      headWidth: 4,
      label: 'PC2',
      labelColor: K.PALETTE.e1,
      labelOffset: { x: 10, y: -10 }
    });

    ctx.save();
    ctx.strokeStyle = 'rgba(191, 163, 106, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    var screenTip = view.worldToScreen(tip);
    ctx.arc(screenTip.x, screenTip.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    K.drawPointWorld(ctx, view, tip, {
      radius: 5,
      fill: K.PALETTE.gold,
      stroke: 'rgba(250, 246, 238, 0.96)',
      strokeWidth: 2
    });

    K.drawLabel(ctx, 22, 26, 'Σv = λv', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.12)',
      font: '500 10px "Cascadia Code", Consolas, monospace',
      fontSize: 11
    });

    if (state.showProjection) {
      K.drawLabel(ctx, 22, 52, '投影点 = 一维坐标', {
        color: K.PALETTE.gold,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(191, 163, 106, 0.25)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10
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
    if (els.stretchRange) els.stretchRange.value = String(state.stretch);
    if (els.theta && document.activeElement !== els.theta) els.theta.value = L.formatInput(state.theta);
    if (els.stretch && document.activeElement !== els.stretch) els.stretch.value = state.stretch.toFixed(2);
  }

  function setTheta(value) {
    state.theta = normalizeHalfTurn(value);
    syncInputs();
    updateReadouts();
  }

  function setStretch(value) {
    state.stretch = clamp(value, 0.6, 3);
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
   * 拖动主轴
   * ------------------------------------------------------------------ */

  function hitAxisHandle(event) {
    if (!axisTip) return false;
    var p = view.pointerPosition(event);
    var s = view.worldToScreen(axisTip);
    var dx = p.x - s.x;
    var dy = p.y - s.y;
    return Math.sqrt(dx * dx + dy * dy) <= 26;
  }

  function pointerAngle(event) {
    var world = view.screenToWorld(view.pointerPosition(event));
    return Math.atan2(world.y - MEAN.y, world.x - MEAN.x) * 180 / Math.PI;
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
    if (!hitAxisHandle(event)) return;
    event.preventDefault();
    state.dragging = true;
    state.dragStartAngle = pointerAngle(event);
    state.dragStartTheta = state.theta;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    canvas.classList.remove('is-grabbable');
  });

  canvas.addEventListener('pointermove', function (event) {
    if (state.dragging) {
      event.preventDefault();
      var delta = pointerAngle(event) - state.dragStartAngle;
      setTheta(state.dragStartTheta + delta);
      return;
    }
    canvas.classList.toggle('is-grabbable', hitAxisHandle(event));
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
      setStretch(state.stretch + (event.key === 'ArrowUp' ? 0.05 : -0.05));
    }
  });

  /* ------------------------------------------------------------------ *
   * 控件
   * ------------------------------------------------------------------ */

  if (els.thetaRange) {
    els.thetaRange.addEventListener('input', function () {
      setTheta(parseFloat(els.thetaRange.value));
    });
  }
  if (els.stretchRange) {
    els.stretchRange.addEventListener('input', function () {
      setStretch(parseFloat(els.stretchRange.value));
    });
  }
  if (els.theta) {
    els.theta.addEventListener('input', function () {
      readNumber(els.theta, 0, 180, setTheta);
    });
    els.theta.addEventListener('blur', function () {
      els.theta.value = L.formatInput(state.theta);
    });
  }
  if (els.stretch) {
    els.stretch.addEventListener('input', function () {
      readNumber(els.stretch, 0.6, 3, setStretch);
    });
    els.stretch.addEventListener('blur', function () {
      els.stretch.value = state.stretch.toFixed(2);
    });
  }
  if (els.toggleProjection) {
    els.toggleProjection.addEventListener('change', function () {
      state.showProjection = els.toggleProjection.checked;
      requestRender();
    });
  }

  els.btnReset.addEventListener('click', function () {
    state.theta = 30;
    state.stretch = 2.2;
    state.showProjection = true;
    syncInputs();
    if (els.toggleProjection) els.toggleProjection.checked = true;
    updateReadouts();
  });

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = button.getAttribute('data-preset');
      if (preset === 'diagonal') {
        setStretch(2.2);
        setTheta(30);
      } else if (preset === 'horizontal') {
        setStretch(2.6);
        setTheta(0);
      } else if (preset === 'vertical') {
        setStretch(2.4);
        setTheta(90);
      } else if (preset === 'round') {
        setStretch(1);
        setTheta(0);
      }
    });
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    a: { correct: false, text: '最小特征值方向是投影后方差最小的方向，不是 PC1。' },
    b: { correct: true, text: '对。最大特征值方向让投影后的点散得最开，所以它是 PC1。' },
    c: { correct: false, text: '不同特征向量对应不同方差；PC1 特指最大特征值方向。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-pca');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-pca');
        option.classList.toggle('is-correct', value === 'b' && answer === 'b');
        option.classList.toggle('is-wrong', value === answer && answer !== 'b');
        option.setAttribute('aria-pressed', String(value === answer));
      });

      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  els.btnQuizApply.addEventListener('click', function () {
    setStretch(3);
    setTheta(30);
    if (stageCard) {
      stageCard.scrollIntoView({
        behavior: isReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }
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

    var cx = qv.width * 0.45;
    var cy = qv.height * 0.54;
    var angle = -0.4;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);

    qctx.save();
    qctx.strokeStyle = K.PALETTE.gold;
    qctx.lineWidth = 2;
    qctx.beginPath();
    qctx.moveTo(cx - cos * 110, cy + sin * 110);
    qctx.lineTo(cx + cos * 110, cy - sin * 110);
    qctx.stroke();
    qctx.restore();

    for (var i = 0; i < 18; i++) {
      var t = (i / 17 - 0.5) * 2.4;
      var bump = ((i * 7) % 5 - 2) * 0.08;
      var px = cx + cos * t * 46 - sin * bump * 46;
      var py = cy - sin * t * 46 - cos * bump * 46;
      qctx.save();
      qctx.fillStyle = K.PALETTE.muted;
      qctx.beginPath();
      qctx.arc(px, py, 2.4, 0, Math.PI * 2);
      qctx.fill();
      qctx.restore();
    }

    K.drawLabel(qctx, cx, cy + 76, 'PC1 = 最大方差方向', {
      color: K.PALETTE.gold,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(191, 163, 106, 0.25)',
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
      var rawTheta = params.get('theta');
      var rawStretch = params.get('stretch');
      if (rawTheta) {
        var theta = parseFloat(rawTheta);
        if (Number.isFinite(theta)) state.theta = normalizeHalfTurn(theta);
      }
      if (rawStretch) {
        var stretch = parseFloat(rawStretch);
        if (Number.isFinite(stretch)) state.stretch = clamp(stretch, 0.6, 3);
      }
    } catch (error) {
      // URL 参数只做增强。
    }
  })();

  syncInputs();
  updateReadouts();
  requestRender();
  drawQuiz();
})();
