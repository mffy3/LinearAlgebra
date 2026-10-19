/**
 * hardware-audio.js · 计算机硬件应用 01：音频 FIR 滤波
 *
 * y[n] = Σ h[k] x[n−k]
 */
(function () {
  'use strict';

  var K = window.CanvasKit;
  if (!K) {
    console.error('[hardware-audio] 缺少 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('audio-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10, padding: 0 });
  var N = 96;
  var PEAK_TARGET = 0.8;

  var FILTERS = {
    identity: { name: '直通', taps: [1, 0, 0, 0, 0] },
    smooth: { name: '平滑', taps: [0.2, 0.2, 0.2, 0.2, 0.2] },
    lowpass: { name: '低通', taps: [0.1, 0.2, 0.4, 0.2, 0.1] },
    highpass: { name: '差分', taps: [-0.1, -0.2, 0.6, -0.2, -0.1] }
  };

  var state = {
    filter: 'identity',
    taps: FILTERS.identity.taps.slice(),
    playhead: 48,
    noise: 0.12,
    dragging: null,
    dragTap: 0
  };

  var els = {
    noiseRange: document.getElementById('noise-range'),
    noise: document.getElementById('noise'),
    sample: document.getElementById('readout-sample'),
    x: document.getElementById('readout-x'),
    y: document.getElementById('readout-y'),
    sum: document.getElementById('readout-sum'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('audio-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    filterButtons: Array.prototype.slice.call(document.querySelectorAll('[data-filter]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-audio]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var rafId = null;
  var ctx = null;
  var waveRect = null;
  var kernelRect = null;
  var kernelBaseline = 0;
  var kernelScale = 1;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function makeSignal(noiseLevel) {
    var seed = 20261020;
    function rand() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    var data = [];
    for (var n = 0; n < N; n++) {
      var low = 0.55 * Math.sin(2 * Math.PI * 4 * n / N);
      var high = 0.24 * Math.sin(2 * Math.PI * 23 * n / N);
      var noise = (rand() * 2 - 1) * noiseLevel;
      data.push(low + high + noise);
    }
    return data;
  }

  var signal = makeSignal(state.noise);

  function maxAbs(values) {
    var max = 0;
    values.forEach(function (value) {
      max = Math.max(max, Math.abs(value));
    });
    return max;
  }

  function compute() {
    var out = [];
    for (var n = 0; n < N; n++) {
      var sum = 0;
      for (var k = 0; k < 5; k++) {
        if (n - k >= 0) sum += state.taps[k] * signal[n - k];
      }
      out.push(sum);
    }

    var inputPeak = Math.max(1e-9, maxAbs(signal));
    var outputPeak = maxAbs(out);
    var ratio = outputPeak / inputPeak;
    var index = clamp(Math.round(state.playhead), 0, N - 1);

    return {
      out: out,
      index: index,
      inputPeak: inputPeak,
      outputPeak: outputPeak,
      ratio: ratio,
      tapsSum: state.taps.reduce(function (a, b) { return a + b; }, 0),
      smoothing: Math.abs(state.taps.reduce(function (a, b) { return a + b; }, 0) - 1) < 0.1,
      achieved: ratio <= PEAK_TARGET && Math.abs(state.taps.reduce(function (a, b) { return a + b; }, 0) - 1) < 0.1
    };
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.audio({
      filter: state.filter,
      ratio: data.ratio,
      tapsSum: data.tapsSum
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    if (data.achieved) {
      els.hint.textContent = '峰值已经压到 80% 以下；看看平滑核怎样削弱高频';
    } else {
      els.hint.textContent = '拖动播放头，或上下拖下方 tap';
    }
  }

  function updateReadouts() {
    var data = compute();
    var x = signal[data.index];
    var y = data.out[data.index];

    els.sample.textContent = String(data.index);
    els.x.textContent = x.toFixed(2);
    els.y.textContent = y.toFixed(2);
    els.sum.textContent = data.tapsSum.toFixed(2);
    els.status.textContent = data.achieved ? '平滑 · 峰值压低' : '5 taps · 局部线性';

    var progress = data.achieved
      ? 100
      : (data.smoothing
        ? clamp((1 - data.ratio) / (1 - PEAK_TARGET) * 100, 0, 99)
        : clamp(40 - Math.abs(data.tapsSum - 1) * 20, 0, 50));
    els.challengeCard.classList.toggle('is-complete', data.achieved);
    els.challengeState.textContent = data.achieved ? '达成' : (progress > 65 ? '接近' : '进行中');
    els.challengeDistance.textContent = Math.round(data.ratio * 100) + '%';
    els.challengeFill.style.width = progress.toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

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
    return {
      wave: { x: W * 0.055, y: H * 0.07, w: W * 0.89, h: H * 0.36 },
      kernel: { x: W * 0.10, y: H * 0.50, w: W * 0.80, h: H * 0.30 }
    };
  }

  function sampleX(n) {
    return waveRect.x + n / (N - 1) * waveRect.w;
  }

  function sampleY(value) {
    var center = waveRect.y + waveRect.h / 2;
    return center - value * waveRect.h * 0.36;
  }

  function drawWave(data) {
    var rect = waveRect;

    ctx.save();
    ctx.fillStyle = 'rgba(250, 246, 238, 0.48)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    var center = rect.y + rect.h / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x, center);
    ctx.lineTo(rect.x + rect.w, center);
    ctx.stroke();

    // 当前 5 个采样的窗口
    var start = Math.max(0, data.index - 4);
    ctx.fillStyle = 'rgba(191, 163, 106, 0.09)';
    ctx.fillRect(sampleX(start), rect.y, Math.max(8, sampleX(data.index) - sampleX(start)), rect.h);
    ctx.restore();

    function line(values, color, width) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      values.forEach(function (value, n) {
        var x = sampleX(n);
        var y = sampleY(value);
        if (n === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    line(signal, 'rgba(46, 49, 44, 0.34)', 1.4);
    line(data.out, K.PALETTE.gold, 1.9);

    var x = sampleX(data.index);
    ctx.save();
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, rect.y + rect.h);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = K.PALETTE.gold;
    ctx.beginPath();
    ctx.arc(x, sampleY(data.out[data.index]), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = K.PALETTE.muted;
    ctx.beginPath();
    ctx.arc(x, sampleY(signal[data.index]), 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    K.drawLabel(ctx, rect.x + 6, rect.y + 16, '输入', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(46, 49, 44, 0.1)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });
    K.drawLabel(ctx, rect.x + 6, rect.y + 34, '输出', {
      color: K.PALETTE.gold,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(46, 49, 44, 0.1)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });
    K.drawLabel(ctx, rect.x + rect.w - 6, rect.y + 16, 'n = ' + data.index, {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(46, 49, 44, 0.1)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });
  }

  function drawKernel(data) {
    var rect = kernelRect;
    var baseline = kernelBaseline;
    var scale = kernelScale;

    ctx.save();
    ctx.fillStyle = 'rgba(250, 246, 238, 0.4)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.strokeStyle = 'rgba(46, 49, 44, 0.2)';
    ctx.beginPath();
    ctx.moveTo(rect.x, baseline);
    ctx.lineTo(rect.x + rect.w, baseline);
    ctx.stroke();
    ctx.restore();

    var band = rect.w / 5;
    state.taps.forEach(function (value, index) {
      var cx = rect.x + band * (index + 0.5);
      var y = baseline - value * scale;
      var color = value >= 0 ? K.PALETTE.e1 : K.PALETTE.e2;

      ctx.save();
      ctx.fillStyle = value >= 0 ? 'rgba(116, 134, 118, 0.28)' : 'rgba(176, 125, 110, 0.26)';
      ctx.fillRect(cx - 13, Math.min(baseline, y), 26, Math.max(2, Math.abs(y - baseline)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx - 13, Math.min(baseline, y), 26, Math.max(2, Math.abs(y - baseline)));
      ctx.restore();

      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(250, 246, 238, 0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      K.drawLabel(ctx, cx, y - 16, 'h' + index, {
        color: color,
        background: 'rgba(250, 246, 238, 0.92)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10
      });
      K.drawLabel(ctx, cx, baseline + 24, value.toFixed(2), {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.85)',
        border: 'rgba(46, 49, 44, 0.08)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 9
      });
    });

    K.drawLabel(ctx, rect.x + 4, rect.y - 10, '5 个 tap · 上下拖动', {
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
    waveRect = layoutData.wave;
    kernelRect = layoutData.kernel;
    kernelBaseline = kernelRect.y + kernelRect.h * 0.58;
    kernelScale = kernelRect.h * 0.34;

    var data = compute();
    drawWave(data);
    drawKernel(data);

    K.drawLabel(ctx, 22, 26, 'y[n] = Σ h[k]x[n−k]', {
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
   * 拖动
   * ------------------------------------------------------------------ */

  function pointInRect(p, rect) {
    return p.x >= rect.x && p.x <= rect.x + rect.w &&
      p.y >= rect.y && p.y <= rect.y + rect.h;
  }

  function tapIndexAt(p) {
    var band = kernelRect.w / 5;
    return clamp(Math.floor((p.x - kernelRect.x) / band), 0, 4);
  }

  function setTap(index, value) {
    state.taps[index] = clamp(value, -1, 1.5);
    updateReadouts();
  }

  function setPlayhead(value) {
    state.playhead = clamp(Math.round(value), 0, N - 1);
    updateReadouts();
  }

  function startDrag(event) {
    var p = view.pointerPosition(event);
    if (pointInRect(p, kernelRect)) {
      state.dragging = 'tap';
      state.dragTap = tapIndexAt(p);
      state.taps[state.dragTap] = clamp((kernelBaseline - p.y) / kernelScale, -1, 1.5);
      updateReadouts();
      return true;
    }
    if (pointInRect(p, waveRect)) {
      state.dragging = 'playhead';
      setPlayhead((p.x - waveRect.x) / waveRect.w * (N - 1));
      return true;
    }
    return false;
  }

  function updateDrag(event) {
    var p = view.pointerPosition(event);
    if (state.dragging === 'tap') {
      state.taps[state.dragTap] = clamp((kernelBaseline - p.y) / kernelScale, -1, 1.5);
      updateReadouts();
    } else if (state.dragging === 'playhead') {
      setPlayhead((p.x - waveRect.x) / waveRect.w * (N - 1));
    }
  }

  function stopDrag(event) {
    state.dragging = null;
    canvas.classList.remove('is-dragging');
    canvas.classList.remove('is-grabbable');
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener('pointerdown', function (event) {
    if (!startDrag(event)) return;
    event.preventDefault();
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    canvas.classList.remove('is-grabbable');
  });

  canvas.addEventListener('pointermove', function (event) {
    if (state.dragging) {
      event.preventDefault();
      updateDrag(event);
      return;
    }
    var p = view.pointerPosition(event);
    canvas.classList.toggle('is-grabbable',
      pointInRect(p, kernelRect) || pointInRect(p, waveRect));
  });

  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
  canvas.addEventListener('pointerleave', function () {
    if (!state.dragging) canvas.classList.remove('is-grabbable');
  });

  /* ------------------------------------------------------------------ *
   * 控件
   * ------------------------------------------------------------------ */

  function setFilter(name) {
    if (!FILTERS[name]) return;
    state.filter = name;
    state.taps = FILTERS[name].taps.slice();
    els.filterButtons.forEach(function (button) {
      var active = button.getAttribute('data-filter') === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateReadouts();
  }

  els.filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setFilter(button.getAttribute('data-filter'));
    });
  });

  function setNoise(value) {
    state.noise = clamp(value, 0, 0.4);
    signal = makeSignal(state.noise);
    updateReadouts();
  }

  if (els.noiseRange) {
    els.noiseRange.addEventListener('input', function () {
      setNoise(parseFloat(els.noiseRange.value));
    });
  }
  if (els.noise) {
    els.noise.addEventListener('input', function () {
      var raw = els.noise.value.trim();
      if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
      var value = parseFloat(raw);
      if (Number.isFinite(value)) setNoise(value);
    });
    els.noise.addEventListener('blur', function () {
      els.noise.value = state.noise.toFixed(2);
    });
  }

  els.btnReset.addEventListener('click', function () {
    state.filter = 'identity';
    state.taps = FILTERS.identity.taps.slice();
    state.playhead = 48;
    state.noise = 0.12;
    signal = makeSignal(state.noise);
    if (els.noiseRange) els.noiseRange.value = '0.12';
    if (els.noise) els.noise.value = '0.12';
    els.filterButtons.forEach(function (button) {
      var active = button.getAttribute('data-filter') === 'identity';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateReadouts();
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    a: { correct: false, text: '直通核确实只用 x[n]，但 5 个 tap 的 FIR 会回看更早的采样。' },
    b: { correct: true, text: '对。5 个 tap 让 y[n] 用到 x[n] 到 x[n−4]，共 5 个采样。' },
    c: { correct: false, text: 'FIR 是局部的：每个输出只看有限窗口，不是整段信号。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-audio');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-audio');
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
    setFilter('smooth');
    state.playhead = 48;
    updateReadouts();
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

    var startX = qv.width * 0.12;
    var y = qv.height * 0.42;
    var cell = Math.min(qv.width * 0.105, qv.height * 0.18);

    for (var i = 0; i < 5; i++) {
      qctx.fillStyle = 'rgba(46, 49, 44, 0.12)';
      qctx.fillRect(startX + i * cell, y, cell - 3, cell);
      K.drawLabel(qctx, startX + i * cell + cell / 2, y + cell / 2,
        'x[n−' + (4 - i) + ']', {
          color: K.PALETTE.muted,
          background: 'transparent',
          border: null,
          font: '500 8px "Cascadia Code", Consolas, monospace',
          fontSize: 9
        });
    }

    var arrowX = startX + cell * 5.2;
    qctx.save();
    qctx.strokeStyle = K.PALETTE.gold;
    qctx.lineWidth = 2;
    qctx.beginPath();
    qctx.moveTo(arrowX, y + cell / 2);
    qctx.lineTo(arrowX + qv.width * 0.13, y + cell / 2);
    qctx.stroke();
    qctx.restore();

    K.drawLabel(qctx, arrowX + qv.width * 0.07, y - 18, 'Σ h[k]', {
      color: K.PALETTE.gold,
      background: 'rgba(250, 246, 238, 0.9)',
      border: 'rgba(191, 163, 106, 0.25)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10
    });

    var outX = arrowX + qv.width * 0.2;
    qctx.fillStyle = 'rgba(116, 134, 118, 0.28)';
    qctx.fillRect(outX, y + cell * 0.18, cell * 0.9, cell * 0.65);
    K.drawLabel(qctx, outX + cell * 0.45, y - 18, 'y[n]', {
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
      var filter = params.get('filter');
      var n = parseInt(params.get('n'), 10);
      if (FILTERS[filter]) {
        state.filter = filter;
        state.taps = FILTERS[filter].taps.slice();
        els.filterButtons.forEach(function (button) {
          var active = button.getAttribute('data-filter') === filter;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
      }
      if (Number.isFinite(n)) state.playhead = clamp(n, 0, N - 1);
    } catch (error) {
      // URL 参数只做增强。
    }
  })();

  updateReadouts();
  requestRender();
  drawQuiz();
})();
