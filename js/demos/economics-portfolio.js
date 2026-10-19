/**
 * economics-portfolio.js · 经济应用 02：投资组合
 *
 * μp = wᵀμ
 * σp² = wᵀΣw
 * Σ = QΛQᵀ
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[economics-portfolio] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('portfolio-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10, padding: 0 });
  var LEVEL_FACTOR = window.LinAlgLevel ? window.LinAlgLevel.factor : 1;
  var WEIGHT_TOL = 0.02 * LEVEL_FACTOR;

  var ASSETS = {
    a: { mu: 0.08, sigma: 0.15, label: 'A · 稳健' },
    b: { mu: 0.12, sigma: 0.25, label: 'B · 高波动' }
  };
  var RISK_MIN = 0.10;
  var RISK_MAX = 0.30;
  var RET_MIN = 0.06;
  var RET_MAX = 0.14;

  var state = {
    weight: 0.5,
    rho: 0.25,
    dragging: false,
    dragMode: null,
    dragStartX: 0,
    dragStartRho: 0.25
  };

  var els = {
    weightRange: document.getElementById('weight-range'),
    weight: document.getElementById('weight'),
    rhoRange: document.getElementById('rho-range'),
    rho: document.getElementById('rho'),
    weightOut: document.getElementById('readout-weight'),
    returnOut: document.getElementById('readout-return'),
    riskOut: document.getElementById('readout-risk'),
    rhoOut: document.getElementById('readout-rho'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('portfolio-hint'),
    matrixSigma: document.getElementById('matrix-sigma'),
    matrixEigen: document.getElementById('matrix-eigen'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-portfolio]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var rafId = null;
  var ctx = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function covariance(rho) {
    var sa = ASSETS.a.sigma;
    var sb = ASSETS.b.sigma;
    var cross = rho * sa * sb;
    return L.mat2(sa * sa, cross, cross, sb * sb);
  }

  function minVarianceWeight(rho) {
    var sa = ASSETS.a.sigma;
    var sb = ASSETS.b.sigma;
    var denom = sa * sa + sb * sb - 2 * rho * sa * sb;
    if (Math.abs(denom) < 1e-12) return 0.5;
    return clamp((sb * sb - rho * sa * sb) / denom, 0, 1);
  }

  function portfolioAt(w, rho) {
    var sa = ASSETS.a.sigma;
    var sb = ASSETS.b.sigma;
    var w2 = 1 - w;
    var variance = w * w * sa * sa + 2 * w * w2 * rho * sa * sb + w2 * w2 * sb * sb;
    return {
      weight: w,
      return: w * ASSETS.a.mu + w2 * ASSETS.b.mu,
      variance: Math.max(0, variance),
      risk: Math.sqrt(Math.max(0, variance))
    };
  }

  function compute() {
    var sigma = covariance(state.rho);
    var eigen = L.eigen2(sigma);
    var current = portfolioAt(state.weight, state.rho);
    var star = minVarianceWeight(state.rho);
    var minPortfolio = portfolioAt(star, state.rho);
    var delta = Math.abs(state.weight - star);

    return {
      sigma: sigma,
      eigen: eigen,
      current: current,
      star: star,
      minPortfolio: minPortfolio,
      delta: delta,
      achieved: delta <= WEIGHT_TOL
    };
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.portfolio({
      weight: state.weight,
      rho: state.rho,
      risk: data.current.risk,
      ret: data.current.return,
      star: data.star
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    if (data.achieved) {
      els.hint.textContent = '最小风险组合：再降 ρ，看看它还能往左走多少';
    } else {
      els.hint.textContent = '拖金点调权重；左右拖协方差椭圆调 ρ';
    }
  }

  function updateReadouts() {
    var data = compute();
    var sigma = data.sigma;
    var eigen = data.eigen.values;

    els.weightOut.textContent = Math.round(state.weight * 100) + '%';
    els.returnOut.textContent = (data.current.return * 100).toFixed(1) + '%';
    els.riskOut.textContent = (data.current.risk * 100).toFixed(1) + '%';
    els.rhoOut.textContent = state.rho.toFixed(2);

    if (data.achieved) {
      els.status.textContent = '最小风险 · 最优权重';
    } else if (state.weight <= 0.001 || state.weight >= 0.999) {
      els.status.textContent = '单资产 · 无分散';
    } else {
      els.status.textContent = '正权重 · 可分散';
    }

    els.matrixSigma.textContent =
      '[[' + sigma.a.toFixed(4) + ', ' + sigma.b.toFixed(4) + '], [' +
      sigma.c.toFixed(4) + ', ' + sigma.d.toFixed(4) + ']]';
    els.matrixEigen.textContent =
      eigen[0].re.toFixed(4) + ' / ' + eigen[1].re.toFixed(4);

    var progress = data.achieved
      ? 100
      : Math.max(0, Math.min(100, 100 - data.delta / 0.5 * 100));

    els.challengeCard.classList.toggle('is-complete', data.achieved);
    els.challengeState.textContent = data.achieved ? '达成' : (data.delta < 0.06 ? '接近' : '进行中');
    els.challengeDistance.textContent = (data.delta * 100).toFixed(1) + '%';
    els.challengeFill.style.width = progress.toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    updateHint(data);
    updateProfessor(data);
    draw();
  }

  /* ------------------------------------------------------------------ *
   * 绘图
   * ------------------------------------------------------------------ */

  function drawPointAt(context, x, y, style) {
    var s = style || {};
    context.save();
    context.beginPath();
    context.arc(x, y, s.radius == null ? 3.5 : s.radius, 0, Math.PI * 2);
    context.fillStyle = s.fill || K.PALETTE.origin;
    context.fill();
    if (s.stroke) {
      context.strokeStyle = s.stroke;
      context.lineWidth = s.strokeWidth == null ? 1 : s.strokeWidth;
      context.stroke();
    }
    context.restore();
  }

  function plotLayout() {
    var W = view.width;
    var H = view.height;
    if (W >= 620) {
      return {
        plot: { x: W * 0.065, y: H * 0.16, w: W * 0.48, h: H * 0.70 },
        ellipse: { cx: W * 0.77, cy: H * 0.50, rx: W * 0.17, ry: H * 0.22 }
      };
    }
    return {
      plot: { x: W * 0.08, y: H * 0.13, w: W * 0.84, h: H * 0.36 },
      ellipse: { cx: W * 0.50, cy: H * 0.69, rx: W * 0.27, ry: H * 0.16 }
    };
  }

  function riskToX(risk, plot) {
    return plot.x + (risk - RISK_MIN) / (RISK_MAX - RISK_MIN) * plot.w;
  }

  function retToY(ret, plot) {
    return plot.y + plot.h - (ret - RET_MIN) / (RET_MAX - RET_MIN) * plot.h;
  }

  function drawGrid(plot) {
    ctx.save();
    ctx.lineWidth = 0.8;

    [0.10, 0.15, 0.20, 0.25, 0.30].forEach(function (risk) {
      var x = riskToX(risk, plot);
      ctx.strokeStyle = 'rgba(46, 49, 44, 0.07)';
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();

      K.drawLabel(ctx, x, plot.y + plot.h + 20, (risk * 100).toFixed(0) + '%', {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10
      });
    });

    [0.06, 0.08, 0.10, 0.12, 0.14].forEach(function (ret) {
      var y = retToY(ret, plot);
      ctx.strokeStyle = 'rgba(46, 49, 44, 0.07)';
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();

      K.drawLabel(ctx, plot.x - 12, y, (ret * 100).toFixed(0) + '%', {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10
      });
    });

    ctx.strokeStyle = 'rgba(46, 49, 44, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.stroke();
    ctx.restore();

    K.drawLabel(ctx, plot.x + plot.w - 6, plot.y + plot.h + 20, '风险 σ', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(46, 49, 44, 0.1)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });
    K.drawLabel(ctx, plot.x + 2, plot.y - 8, '收益 E[r]', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(46, 49, 44, 0.1)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });
  }

  function drawFrontier(plot, data) {
    var points = [];
    for (var i = 0; i <= 120; i++) {
      var w = i / 120;
      var p = portfolioAt(w, state.rho);
      points.push({
        x: riskToX(p.risk, plot),
        y: retToY(p.return, plot)
      });
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(116, 134, 118, 0.8)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    points.forEach(function (p, index) {
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();

    // 两个单资产点
    [ASSETS.a, ASSETS.b].forEach(function (asset) {
      var x = riskToX(asset.sigma, plot);
      var y = retToY(asset.mu, plot);
      drawPointAt(ctx, x, y, {
        radius: 5,
        fill: K.PALETTE.bg,
        stroke: 'rgba(46, 49, 44, 0.45)',
        strokeWidth: 1.4
      });
      K.drawLabel(ctx, x + 16, y - 10, asset.label, {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10
      });
    });

    // 最小方差点
    var minX = riskToX(data.minPortfolio.risk, plot);
    var minY = retToY(data.minPortfolio.return, plot);
    drawPointAt(ctx, minX, minY, {
      radius: 4,
      fill: 'rgba(116, 134, 118, 0.55)',
      stroke: K.PALETTE.e1,
      strokeWidth: 1
    });
    K.drawLabel(ctx, minX - 6, minY - 18, '最小风险', {
      color: K.PALETTE.e1,
      background: 'rgba(227, 232, 221, 0.92)',
      border: 'rgba(116, 134, 118, 0.25)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });

    // 当前组合
    var x = riskToX(data.current.risk, plot);
    var y = retToY(data.current.return, plot);
    ctx.save();
    ctx.strokeStyle = 'rgba(191, 163, 106, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, plot.y + plot.h);
    ctx.lineTo(x, y);
    ctx.lineTo(plot.x, y);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(191, 163, 106, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawPointAt(ctx, x, y, {
      radius: 7,
      fill: K.PALETTE.gold,
      stroke: 'rgba(250, 246, 238, 0.96)',
      strokeWidth: 2
    });
    K.drawLabel(ctx, x + 14, y + 18,
      'w₁=' + Math.round(state.weight * 100) + '%', {
        color: K.PALETTE.gold,
        background: 'rgba(250, 246, 238, 0.95)',
        border: 'rgba(191, 163, 106, 0.3)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10
      });

    K.drawLabel(ctx, plot.x + 6, plot.y + 18, '可行域', {
      color: K.PALETTE.e1,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(46, 49, 44, 0.1)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });
  }

  function drawEllipse(layout, data) {
    var cx = layout.cx;
    var cy = layout.cy;
    var rx = layout.rx;
    var ry = layout.ry;
    var eigen = data.eigen;
    var lambda1 = Math.max(1e-9, eigen.values[0].re);
    var lambda2 = Math.max(1e-9, eigen.values[1].re);
    var u1 = eigen.vectors[0] || { x: 1, y: 0 };
    var u2 = eigen.vectors[1] || { x: 0, y: 1 };
    var r1 = Math.sqrt(lambda1);
    var r2 = Math.sqrt(lambda2);
    var scale = Math.min(rx / r1, ry / r1);

    ctx.save();
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - rx - 8, cy);
    ctx.lineTo(cx + rx + 8, cy);
    ctx.moveTo(cx, cy - ry - 8);
    ctx.lineTo(cx, cy + ry + 8);
    ctx.stroke();

    ctx.fillStyle = 'rgba(116, 134, 118, 0.08)';
    ctx.strokeStyle = 'rgba(116, 134, 118, 0.65)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (var i = 0; i <= 96; i++) {
      var t = i / 96 * Math.PI * 2;
      var x = cx + (Math.cos(t) * r1 * u1.x + Math.sin(t) * r2 * u2.x) * scale;
      var y = cy - (Math.cos(t) * r1 * u1.y + Math.sin(t) * r2 * u2.y) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    function arrow(vec, radius, color, label) {
      var x = cx + vec.x * radius;
      var y = cy - vec.y * radius;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
      var angle = Math.atan2(y - cy, x - cx);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(angle - 0.42) * 8, y - Math.sin(angle - 0.42) * 8);
      ctx.lineTo(x - Math.cos(angle + 0.42) * 8, y - Math.sin(angle + 0.42) * 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      K.drawLabel(ctx, x + 10, y - 10, label, {
        color: color,
        background: 'rgba(250, 246, 238, 0.92)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10
      });
    }

    arrow(u1, r1 * scale, K.PALETTE.e2, 'λ₁');
    arrow(u2, r2 * scale, K.PALETTE.e1, 'λ₂');

    K.drawLabel(ctx, cx, cy + ry + 22, '协方差椭圆 · 左右拖动调 ρ', {
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

    var layout = plotLayout();
    var data = compute();
    drawGrid(layout.plot);
    drawFrontier(layout.plot, data);
    drawEllipse(layout.ellipse, data);

    K.drawLabel(ctx, 22, 26, 'σp² = wᵀΣw', {
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
   * 状态
   * ------------------------------------------------------------------ */

  function syncInputs() {
    if (els.weightRange) els.weightRange.value = String(Math.round(state.weight * 100));
    if (els.weight && document.activeElement !== els.weight) {
      els.weight.value = String(Math.round(state.weight * 100));
    }
    if (els.rhoRange) els.rhoRange.value = String(Math.round(state.rho * 100));
    if (els.rho && document.activeElement !== els.rho) {
      els.rho.value = state.rho.toFixed(2);
    }
  }

  function setWeight(value) {
    state.weight = clamp(value, 0, 1);
    syncInputs();
    updateReadouts();
  }

  function setRho(value) {
    state.rho = clamp(value, -0.8, 0.8);
    syncInputs();
    updateReadouts();
  }

  function readNumber(input, setter) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    setter(value);
  }

  /* ------------------------------------------------------------------ *
   * 事件
   * ------------------------------------------------------------------ */

  if (els.weightRange) {
    els.weightRange.addEventListener('input', function () {
      setWeight(parseFloat(els.weightRange.value) / 100);
    });
  }
  if (els.rhoRange) {
    els.rhoRange.addEventListener('input', function () {
      setRho(parseFloat(els.rhoRange.value) / 100);
    });
  }
  if (els.weight) {
    els.weight.addEventListener('input', function () {
      readNumber(els.weight, function (value) {
        setWeight(value / 100);
      });
    });
    els.weight.addEventListener('blur', function () {
      els.weight.value = String(Math.round(state.weight * 100));
    });
  }
  if (els.rho) {
    els.rho.addEventListener('input', function () {
      readNumber(els.rho, setRho);
    });
    els.rho.addEventListener('blur', function () {
      els.rho.value = state.rho.toFixed(2);
    });
  }

  els.btnReset.addEventListener('click', function () {
    state.weight = 0.5;
    state.rho = 0.25;
    syncInputs();
    updateReadouts();
  });

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = button.getAttribute('data-preset');
      if (preset === 'a') setWeight(1);
      else if (preset === 'b') setWeight(0);
      else if (preset === 'half') setWeight(0.5);
      else if (preset === 'min') setWeight(minVarianceWeight(state.rho));
    });
  });

  /* ------------------------------------------------------------------ *
   * 拖动图上的组合点
   * ------------------------------------------------------------------ */

  function currentScreenPoint() {
    var plot = plotLayout().plot;
    var data = compute();
    return {
      x: riskToX(data.current.risk, plot),
      y: retToY(data.current.return, plot)
    };
  }

  function hitCurrent(event) {
    var p = view.pointerPosition(event);
    var c = currentScreenPoint();
    var dx = p.x - c.x;
    var dy = p.y - c.y;
    return Math.sqrt(dx * dx + dy * dy) <= 26;
  }

  function hitPlot(event) {
    var p = view.pointerPosition(event);
    var plot = plotLayout().plot;
    return p.x >= plot.x && p.x <= plot.x + plot.w &&
      p.y >= plot.y && p.y <= plot.y + plot.h;
  }

  function hitEllipse(event) {
    var p = view.pointerPosition(event);
    var layout = plotLayout().ellipse;
    var data = compute();
    var eigen = data.eigen;
    var lambda1 = Math.max(1e-9, eigen.values[0].re);
    var lambda2 = Math.max(1e-9, eigen.values[1].re);
    var u1 = eigen.vectors[0] || { x: 1, y: 0 };
    var u2 = eigen.vectors[1] || { x: 0, y: 1 };
    var r1 = Math.sqrt(lambda1);
    var r2 = Math.sqrt(lambda2);
    var scale = Math.min(layout.rx / r1, layout.ry / r1);
    var dx = p.x - layout.cx;
    var dy = layout.cy - p.y;
    var u = (dx * u1.x + dy * u1.y) / (r1 * scale);
    var v = (dx * u2.x + dy * u2.y) / (r2 * scale);
    return u * u + v * v <= 1.45;
  }

  function nearestWeight(event) {
    var p = view.pointerPosition(event);
    var plot = plotLayout().plot;
    var best = state.weight;
    var bestDist = Infinity;
    for (var i = 0; i <= 200; i++) {
      var w = i / 200;
      var q = portfolioAt(w, state.rho);
      var x = riskToX(q.risk, plot);
      var y = retToY(q.return, plot);
      var dx = p.x - x;
      var dy = p.y - y;
      var dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = w;
      }
    }
    return best;
  }

  function endDrag(event) {
    state.dragging = false;
    state.dragMode = null;
    canvas.classList.remove('is-dragging');
    canvas.classList.remove('is-grabbable');
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener('pointerdown', function (event) {
    var mode = hitEllipse(event) ? 'ellipse' :
      ((hitCurrent(event) || hitPlot(event)) ? 'plot' : null);
    if (!mode) return;
    event.preventDefault();
    state.dragging = true;
    state.dragMode = mode;
    state.dragStartX = event.clientX;
    state.dragStartRho = state.rho;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    canvas.classList.remove('is-grabbable');
    if (mode === 'plot') setWeight(nearestWeight(event));
  });

  canvas.addEventListener('pointermove', function (event) {
    if (state.dragging) {
      event.preventDefault();
      if (state.dragMode === 'ellipse') {
        var next = state.dragStartRho + (event.clientX - state.dragStartX) / 180 * 1.6;
        setRho(next);
      } else {
        setWeight(nearestWeight(event));
      }
      return;
    }
    canvas.classList.toggle('is-grabbable',
      hitEllipse(event) || hitCurrent(event) || hitPlot(event));
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
    a: { correct: false, text: '预期收益是 μ，不是协方差矩阵的特征向量。' },
    b: { correct: true, text: '对。对称矩阵 Σ 的特征向量给出一组互不相关的方向，特征值是它们的方差。' },
    c: { correct: false, text: '价格不是线性代数里的特征方向；这里只讨论收益和风险。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-portfolio');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-portfolio');
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
    setWeight(minVarianceWeight(state.rho));
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
    var cx = qv.width * 0.5;
    var cy = qv.height * 0.52;
    var rx = qv.width * 0.3;
    var ry = qv.height * 0.3;

    K.drawBackdrop(qctx, qv);
    qctx.save();
    qctx.strokeStyle = 'rgba(116, 134, 118, 0.7)';
    qctx.fillStyle = 'rgba(116, 134, 118, 0.1)';
    qctx.lineWidth = 1.6;
    qctx.beginPath();
    qctx.ellipse(cx, cy, rx, ry, -0.35, 0, Math.PI * 2);
    qctx.fill();
    qctx.stroke();
    qctx.strokeStyle = 'rgba(176, 125, 110, 0.7)';
    qctx.beginPath();
    qctx.moveTo(cx, cy);
    qctx.lineTo(cx + rx * 0.9, cy - ry * 0.35);
    qctx.stroke();
    qctx.restore();
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
      var rawW = params.get('w');
      var rawRho = params.get('rho');
      if (rawW) {
        var w = parseFloat(rawW);
        if (Number.isFinite(w)) state.weight = clamp(w > 1 ? w / 100 : w, 0, 1);
      }
      if (rawRho) {
        var r = parseFloat(rawRho);
        if (Number.isFinite(r)) state.rho = clamp(r, -0.8, 0.8);
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
