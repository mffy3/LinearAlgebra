/**
 * social-opinion.js · 社会科学 · 意见演化
 *
 * 两个群体：每一轮有 α 的 A 转向 B、β 的 B 转向 A。
 * 写成矩阵 M = [[1−α, β], [α, 1−β]]，反复乘，分布收敛到 λ = 1 的特征向量。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[opinion] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('opinion-canvas');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 8, padding: 0 });
  var STEPS = 30;

  var INITIAL = { alpha: 0.3, beta: 0.1, start: 0.7 };

  var state = {
    alpha: INITIAL.alpha,
    beta: INITIAL.beta,
    start: INITIAL.start,
    current: { x: INITIAL.start, y: 1 - INITIAL.start },
    step: 0,
    playing: false,
    lastTick: 0
  };

  var els = {
    alpha: document.getElementById('alpha'),
    alphaRange: document.getElementById('alpha-range'),
    beta: document.getElementById('beta'),
    betaRange: document.getElementById('beta-range'),
    start: document.getElementById('start'),
    startRange: document.getElementById('start-range'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('opinion-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnStep: document.getElementById('btn-step'),
    btnPlay: document.getElementById('btn-play'),
    btnRewind: document.getElementById('btn-rewind'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-opinion]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    readoutCurrent: document.getElementById('readout-current'),
    readoutSteady: document.getElementById('readout-steady'),
    readoutStep: document.getElementById('readout-step'),
    readoutLambda: document.getElementById('readout-lambda')
  };

  var ctx = null;
  var rafId = null;

  /* ------------------------------------------------------------------ *
   * 计算
   * ------------------------------------------------------------------ */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundTo(value, digits) {
    var p = Math.pow(10, digits);
    return Math.round(value * p) / p;
  }

  function transitionMatrix() {
    return L.mat2(1 - state.alpha, state.beta, state.alpha, 1 - state.beta);
  }

  function steadyA() {
    var sum = state.alpha + state.beta;
    if (sum < 1e-9) return state.start;
    return state.beta / sum;
  }

  function secondEigenvalue() {
    return 1 - state.alpha - state.beta;
  }

  function trajectory() {
    var m = transitionMatrix();
    var point = { x: state.start, y: 1 - state.start };
    var out = [point.x];
    for (var i = 0; i < STEPS; i++) {
      point = L.applyMat(m, point);
      out.push(point.x);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 绘图（CSS 像素）
   * ------------------------------------------------------------------ */

  function layout() {
    var h = view.height;
    var top = 54;
    var base = Math.round(h * 0.4);
    return {
      top: top,
      base: base,
      curveTop: Math.max(base + 60, Math.round(h * 0.56)),
      curveBottom: h - 38
    };
  }

  function drawBars() {
    var w = view.width;
    var box = layout();
    var top = box.top;
    var base = box.base;
    var maxHeight = base - top;
    var values = [state.current.x, state.current.y];
    var colors = [K.PALETTE.e1, K.PALETTE.e2];
    var names = ['A', 'B'];
    var steady = [steadyA(), 1 - steadyA()];

    var centers = [w * 0.3, w * 0.7];
    var barW = Math.min(110, w * 0.16);

    for (var i = 0; i < 2; i++) {
      var cx = centers[i];
      var barH = Math.max(2, values[i] * maxHeight);
      var barX = cx - barW / 2;
      var barY = base - barH;

      ctx.save();
      ctx.fillStyle = K.withAlpha(colors[i], 0.22);
      ctx.strokeStyle = K.withAlpha(colors[i], 0.85);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.rect(barX, barY, barW, barH);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 稳态刻度
      var steadyY = base - steady[i] * maxHeight;
      ctx.save();
      ctx.strokeStyle = K.withAlpha(colors[i], 0.6);
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(barX - 14, steadyY);
      ctx.lineTo(barX + barW + 14, steadyY);
      ctx.stroke();
      ctx.restore();

      K.drawLabel(ctx, cx, barY - 14, (values[i] * 100).toFixed(0) + '%', {
        color: K.PALETTE.ink,
        font: '600 13px "Cascadia Code", Consolas, monospace',
        fontSize: 14,
        align: 'center'
      });

      K.drawLabel(ctx, cx, base + 16, '群体 ' + names[i], {
        color: K.PALETTE.muted,
        font: '500 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12,
        align: 'center'
      });
    }

    K.drawLabel(ctx, Math.max(28, w * 0.05), top - 18, '当前分布 · 虚线是稳态', {
      color: K.PALETTE.muted,
      font: '500 11px "Cascadia Code", Consolas, monospace',
      fontSize: 12
    });

    ctx.save();
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, base);
    ctx.lineTo(w * 0.9, base);
    ctx.stroke();
    ctx.restore();
  }

  function drawCurve() {
    var w = view.width;
    var box = layout();
    var left = Math.max(56, w * 0.08);
    var right = w - Math.max(28, w * 0.05);
    var top = box.curveTop;
    var bottom = box.curveBottom;
    var curve = trajectory();
    var steady = steadyA();

    function toX(index) {
      return left + (index / STEPS) * (right - left);
    }
    function toY(value) {
      return bottom - value * (bottom - top);
    }

    // 纵轴刻度 0 / 50% / 100%
    var ticks = [0, 0.5, 1];
    for (var i = 0; i < ticks.length; i++) {
      ctx.save();
      ctx.strokeStyle = 'rgba(46, 49, 44, 0.09)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(left, toY(ticks[i]));
      ctx.lineTo(right, toY(ticks[i]));
      ctx.stroke();
      ctx.restore();
      K.drawLabel(ctx, left - 8, toY(ticks[i]), (ticks[i] * 100).toFixed(0) + '%', {
        color: K.PALETTE.faint,
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11,
        align: 'right'
      });
    }

    // 稳态线
    ctx.save();
    ctx.strokeStyle = 'rgba(191, 163, 106, 0.85)';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(left, toY(steady));
    ctx.lineTo(right, toY(steady));
    ctx.stroke();
    ctx.restore();

    // 曲线
    ctx.save();
    ctx.strokeStyle = K.PALETTE.e1;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var k = 0; k < curve.length; k++) {
      var px = toX(k);
      var py = toY(curve[k]);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // 当前点
    var cx = toX(Math.min(state.step, STEPS));
    var cy = toY(curve[Math.min(state.step, STEPS)]);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = K.PALETTE.e1;
    ctx.fill();
    ctx.strokeStyle = 'rgba(250, 246, 238, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    K.drawLabel(ctx, left, top - 16, 'A 的占比随轮数变化', {
      color: K.PALETTE.muted,
      font: '500 11px "Cascadia Code", Consolas, monospace',
      fontSize: 12
    });
    K.drawLabel(ctx, right, bottom + 16, '轮数 t →', {
      color: K.PALETTE.faint,
      font: '500 10px "Cascadia Code", Consolas, monospace',
      fontSize: 11,
      align: 'right'
    });
  }

  function draw() {
    view.resize();
    ctx = view.ctx;

    K.drawBackdrop(ctx, view);
    drawBars();
    drawCurve();
  }

  function requestRender() {
    if (rafId == null) rafId = window.requestAnimationFrame(frame);
  }

  function frame(timestamp) {
    rafId = null;
    if (state.playing) {
      if (!state.lastTick) state.lastTick = timestamp;
      if (timestamp - state.lastTick > 240) {
        state.lastTick = timestamp;
        stepOnce();
        if (state.step >= 24 || Math.abs(state.current.x - steadyA()) < 0.002) {
          stopPlay();
        }
      }
      if (state.playing) rafId = window.requestAnimationFrame(frame);
    }
    draw();
  }

  /* ------------------------------------------------------------------ *
   * 演化
   * ------------------------------------------------------------------ */

  function stepOnce() {
    if (state.step >= 999) return;
    state.current = L.applyMat(transitionMatrix(), state.current);
    state.step += 1;
    updateReadouts();
  }

  function startPlay() {
    if (state.playing) return;
    if (Math.abs(state.current.x - steadyA()) < 0.002 || state.step >= 24) rewind();
    state.playing = true;
    state.lastTick = 0;
    if (els.btnPlay) els.btnPlay.textContent = '暂停';
    if (!rafId) rafId = window.requestAnimationFrame(frame);
    updateReadouts();
  }

  function stopPlay() {
    state.playing = false;
    if (els.btnPlay) els.btnPlay.textContent = '连续演化';
    updateReadouts();
  }

  function rewind() {
    state.playing = false;
    if (els.btnPlay) els.btnPlay.textContent = '连续演化';
    state.current = { x: state.start, y: 1 - state.start };
    state.step = 0;
    updateReadouts();
  }

  /* ------------------------------------------------------------------ *
   * 读数与旁白
   * ------------------------------------------------------------------ */

  function updateReadouts() {
    var steady = steadyA();
    var spread = Math.abs(state.current.x - steady);

    if (els.readoutCurrent) els.readoutCurrent.textContent = state.current.x.toFixed(3);
    if (els.readoutSteady) els.readoutSteady.textContent = steady.toFixed(3);
    if (els.readoutStep) els.readoutStep.textContent = String(state.step);
    if (els.readoutLambda) els.readoutLambda.textContent = secondEigenvalue().toFixed(2);

    if (els.status) {
      if (state.playing) els.status.textContent = '演化中';
      else if (spread < 0.002) els.status.textContent = '已收敛';
      else els.status.textContent = '第 ' + state.step + ' 步';
    }

    var gap = Math.abs(state.alpha - state.beta);
    var achieved = gap <= 0.01;
    var progress = achieved ? 100 : Math.max(0, Math.min(100, 100 - gap * 220));
    if (els.challengeCard) els.challengeCard.classList.toggle('is-complete', achieved);
    if (els.challengeState) els.challengeState.textContent = achieved ? '达成' : (gap <= 0.1 ? '接近' : '进行中');
    if (els.challengeDistance) els.challengeDistance.textContent = gap.toFixed(2);
    if (els.challengeFill) els.challengeFill.style.width = progress.toFixed(1) + '%';
    if (els.challengeMeter) els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    var note = window.LinAlgNarration ? window.LinAlgNarration.opinion({
      alpha: state.alpha,
      beta: state.beta,
      mixing: state.alpha + state.beta,
      spread: spread
    }) : null;
    if (note) {
      var textEl = document.getElementById('professor-text');
      var promptEl = document.getElementById('professor-prompt');
      var stripText = document.getElementById('professor-strip-text');
      var stripPrompt = document.getElementById('professor-strip-prompt');
      if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
      if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
      if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
      if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
    }

    if (els.hint) {
      if (state.playing) els.hint.textContent = '正在逐轮演化……';
      else if (spread < 0.002) els.hint.textContent = '已收敛：再乘矩阵也不会变';
      else els.hint.textContent = '用右侧按钮走一步或连续演化';
    }

    draw();
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */

  function setAlpha(value) {
    state.alpha = roundTo(clamp(value, 0, 0.5), 2);
    syncInputs();
    rewind();
  }

  function setBeta(value) {
    state.beta = roundTo(clamp(value, 0, 0.5), 2);
    syncInputs();
    rewind();
  }

  function setStart(value) {
    state.start = roundTo(clamp(value, 0, 1), 2);
    syncInputs();
    rewind();
  }

  function syncInputs() {
    if (els.alpha) els.alpha.value = String(state.alpha);
    if (els.alphaRange) els.alphaRange.value = String(state.alpha);
    if (els.beta) els.beta.value = String(state.beta);
    if (els.betaRange) els.betaRange.value = String(state.beta);
    if (els.start) els.start.value = String(state.start);
    if (els.startRange) els.startRange.value = String(state.start);
  }

  function readNumber(input, setter) {
    if (!input) return;
    var raw = input.value.trim();
    if (raw === '' || raw === '.' || raw === '-') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    setter(value);
  }

  /* ------------------------------------------------------------------ *
   * 事件
   * ------------------------------------------------------------------ */

  if (els.alphaRange) els.alphaRange.addEventListener('input', function () { setAlpha(parseFloat(els.alphaRange.value)); });
  if (els.alpha) els.alpha.addEventListener('input', function () { readNumber(els.alpha, setAlpha); });
  if (els.betaRange) els.betaRange.addEventListener('input', function () { setBeta(parseFloat(els.betaRange.value)); });
  if (els.beta) els.beta.addEventListener('input', function () { readNumber(els.beta, setBeta); });
  if (els.startRange) els.startRange.addEventListener('input', function () { setStart(parseFloat(els.startRange.value)); });
  if (els.start) els.start.addEventListener('input', function () { readNumber(els.start, setStart); });

  if (els.btnReset) {
    els.btnReset.addEventListener('click', function () {
      state.alpha = INITIAL.alpha;
      state.beta = INITIAL.beta;
      state.start = INITIAL.start;
      syncInputs();
      rewind();
    });
  }

  if (els.btnStep) {
    els.btnStep.addEventListener('click', function () {
      if (state.playing) stopPlay();
      stepOnce();
    });
  }

  if (els.btnPlay) {
    els.btnPlay.addEventListener('click', function () {
      if (state.playing) stopPlay(); else startPlay();
    });
  }

  if (els.btnRewind) {
    els.btnRewind.addEventListener('click', rewind);
  }

  canvas.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowRight') { stepOnce(); event.preventDefault(); }
    else if (event.key === 'ArrowLeft') { rewind(); event.preventDefault(); }
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    half: { correct: false, text: '一半一半需要 α = β；互不影响时，矩阵是单位矩阵，什么都不会被拉平。' },
    stay: { correct: true, text: '对。α = β = 0 时 M = I，每一步都原样返回；稳态就是初始分布。' },
    allA: { correct: false, text: '要让所有人变成 A，需要 β 把 B 不断拉过来；互不影响时不会发生。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-opinion');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;
      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-opinion');
        option.classList.toggle('is-correct', value === 'stay' && answer === 'stay');
        option.classList.toggle('is-wrong', value === answer && answer !== 'stay');
        option.setAttribute('aria-pressed', String(value === answer));
      });
      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  if (els.btnQuizApply) {
    els.btnQuizApply.addEventListener('click', function () {
      setAlpha(0);
      setBeta(0);
      if (document.getElementById('stage-card')) {
        document.getElementById('stage-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  function handleResize() {
    view.resize();
    requestRender();
  }

  if (window.ResizeObserver) {
    new ResizeObserver(handleResize).observe(canvas.parentElement || canvas);
  } else {
    window.addEventListener('resize', handleResize);
  }
  window.addEventListener('orientationchange', handleResize);

  syncInputs();
  updateReadouts();
  requestRender();
  /* ------------------------------------------------------------------ *
   * 全屏观看（space-mode.js）：应用页只放大画布，不改变各页自己的拖动
   * ------------------------------------------------------------------ */

  if (window.LinearSpace) {
    window.LinearSpace.attach({
      canvas: canvas,
      view: view,
      redraw: requestRender,
      panZoom: false,
      minimap: false,
      reserveDock: true
    });
  }

})();
