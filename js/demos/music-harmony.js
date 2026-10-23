/**
 * music-harmony.js · 音乐 · 和弦与频谱
 *
 * 三条正弦按振幅相加；频谱柱画的就是这三个系数。
 * 波形直接在 CSS 像素里画，不借用世界坐标网格。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[harmony] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('harmony-canvas');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 8, padding: 0 });

  var NOTES = [
    { name: 'C', freq: 261.63, color: '#748676', label: '根音' },
    { name: 'E', freq: 329.63, color: '#b07d6e', label: '三度' },
    { name: 'G', freq: 392.00, color: '#bfa36a', label: '五度' }
  ];

  var INITIAL = { a1: 1, a2: 0.7, a3: 0.6 };
  var PRESETS = {
    major: { a1: 1, a2: 0.7, a3: 0.6 },
    single: { a1: 1, a2: 0, a3: 0 },
    fifth: { a1: 0.9, a2: 0, a3: 0.8 }
  };

  var state = { a1: INITIAL.a1, a2: INITIAL.a2, a3: INITIAL.a3 };

  var els = {
    a1: document.getElementById('a1'),
    a1Range: document.getElementById('a1-range'),
    a2: document.getElementById('a2'),
    a2Range: document.getElementById('a2-range'),
    a3: document.getElementById('a3'),
    a3Range: document.getElementById('a3-range'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('harmony-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-harmony]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    readoutA1: document.getElementById('readout-a1'),
    readoutA2: document.getElementById('readout-a2'),
    readoutA3: document.getElementById('readout-a3'),
    readoutEnergy: document.getElementById('readout-energy')
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

  function amplitudes() {
    return [state.a1, state.a2, state.a3];
  }

  function sumAt(time) {
    var total = 0;
    for (var i = 0; i < NOTES.length; i++) {
      total += amplitudes()[i] * Math.sin(2 * Math.PI * NOTES[i].freq * time);
    }
    return total;
  }

  function activeCount() {
    var count = 0;
    var amps = amplitudes();
    for (var i = 0; i < amps.length; i++) if (amps[i] > 0.02) count++;
    return count;
  }

  /* ------------------------------------------------------------------ *
   * 绘图（CSS 像素）
   * ------------------------------------------------------------------ */

  function drawPanel(x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  function drawWave() {
    var w = view.width;
    var h = view.height;
    var left = Math.max(28, w * 0.05);
    var right = w - Math.max(28, w * 0.05);
    var top = 56;
    var bottom = Math.round(h * 0.50);
    var mid = (top + bottom) / 2;
    var halfHeight = (bottom - top) / 2 - 6;

    drawPanel(left, top, right - left, bottom - top);

    // 中线
    ctx.save();
    ctx.strokeStyle = 'rgba(46, 49, 44, 0.16)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(left, mid);
    ctx.lineTo(right, mid);
    ctx.stroke();
    ctx.restore();

    var span = 3 / NOTES[0].freq; // 根音的三个周期
    var samples = 640;
    var scale = halfHeight / 3.2;
    var amps = amplitudes();

    // 三条分音
    for (var i = 0; i < NOTES.length; i++) {
      if (amps[i] < 0.01) continue;
      ctx.save();
      ctx.strokeStyle = K.withAlpha(NOTES[i].color, 0.32);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var s = 0; s <= samples; s++) {
        var t = (s / samples) * span;
        var x = left + (s / samples) * (right - left);
        var y = mid - Math.sin(2 * Math.PI * NOTES[i].freq * t) * amps[i] * scale;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 叠加后的总波形
    ctx.save();
    ctx.strokeStyle = K.PALETTE.ink;
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var k = 0; k <= samples; k++) {
      var time = (k / samples) * span;
      var px = left + (k / samples) * (right - left);
      var py = mid - sumAt(time) * scale;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    K.drawLabel(ctx, left + 8, top + 15, '波形 · 三个根音周期', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.86)',
      font: '500 11px "Cascadia Code", Consolas, monospace',
      fontSize: 12
    });
  }

  function drawSpectrum() {
    var w = view.width;
    var h = view.height;
    var top = Math.round(h * 0.56);
    var bottom = h - 22;
    var left = Math.max(28, w * 0.05);
    var right = w - Math.max(28, w * 0.05);
    var amps = amplitudes();
    var barTop = top + 46;
    var maxBar = Math.max(8, bottom - 18 - barTop);

    drawPanel(left, top, right - left, bottom - top);

    var slot = (right - left) / 3;
    for (var i = 0; i < NOTES.length; i++) {
      var cx = left + slot * (i + 0.5);
      var barW = Math.min(58, slot * 0.42);
      var barH = Math.max(2, amps[i] * maxBar);
      var barX = cx - barW / 2;
      var barY = bottom - 20 - barH;

      ctx.save();
      ctx.fillStyle = K.withAlpha(NOTES[i].color, amps[i] > 0.02 ? 0.55 : 0.15);
      ctx.strokeStyle = K.withAlpha(NOTES[i].color, 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(barX, barY, barW, barH);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      K.drawLabel(ctx, cx, barY - 9, amps[i].toFixed(2), {
        color: K.PALETTE.ink,
        font: '600 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12,
        align: 'center'
      });

      K.drawLabel(ctx, cx, bottom - 7, NOTES[i].name + ' · ' + NOTES[i].freq.toFixed(1) + ' Hz', {
        color: K.PALETTE.muted,
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11,
        align: 'center'
      });
    }

    K.drawLabel(ctx, left + 8, top + 15, '频谱 · 三个系数', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.86)',
      font: '500 11px "Cascadia Code", Consolas, monospace',
      fontSize: 12
    });
  }

  function draw() {
    view.resize();
    ctx = view.ctx;

    K.drawBackdrop(ctx, view);
    drawWave();
    drawSpectrum();
  }

  function requestRender() {
    if (rafId == null) rafId = window.requestAnimationFrame(frame);
  }

  function frame() {
    rafId = null;
    draw();
  }

  /* ------------------------------------------------------------------ *
   * 读数与旁白
   * ------------------------------------------------------------------ */

  function updateReadouts() {
    var energy = state.a1 * state.a1 + state.a2 * state.a2 + state.a3 * state.a3;
    var active = activeCount();

    if (els.readoutA1) els.readoutA1.textContent = state.a1.toFixed(2);
    if (els.readoutA2) els.readoutA2.textContent = state.a2.toFixed(2);
    if (els.readoutA3) els.readoutA3.textContent = state.a3.toFixed(2);
    if (els.readoutEnergy) els.readoutEnergy.textContent = energy.toFixed(2);

    if (els.status) {
      els.status.textContent = active >= 3 ? '三个分音' : active === 2 ? '两个分音' : active === 1 ? '单音' : '静音';
    }

    var achieved = state.a2 <= 0.02;
    var progress = Math.max(0, Math.min(100, (1 - state.a2) * 100));
    if (els.challengeCard) els.challengeCard.classList.toggle('is-complete', achieved);
    if (els.challengeState) els.challengeState.textContent = achieved ? '达成' : (state.a2 <= 0.2 ? '接近' : '进行中');
    if (els.challengeDistance) els.challengeDistance.textContent = state.a2.toFixed(2);
    if (els.challengeFill) els.challengeFill.style.width = progress.toFixed(1) + '%';
    if (els.challengeMeter) els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    var note = window.LinAlgNarration ? window.LinAlgNarration.harmony({
      active: active,
      major: state.a2 >= 0.3 && state.a3 >= 0.3,
      a1: state.a1,
      a2: state.a2,
      a3: state.a3
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
      if (achieved) els.hint.textContent = '三度归零：只剩根音与五度两条正弦';
      else if (active <= 1) els.hint.textContent = '单音：波形是一条纯正弦';
      else els.hint.textContent = '调右侧三个振幅，波形与频谱会一起变';
    }

    draw();
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */

  function setAmplitude(index, value) {
    var next = roundTo(clamp(value, 0, 1), 2);
    if (index === 1) state.a1 = next;
    else if (index === 2) state.a2 = next;
    else state.a3 = next;
    syncInputs();
    updateReadouts();
  }

  function syncInputs() {
    if (els.a1) els.a1.value = String(state.a1);
    if (els.a1Range) els.a1Range.value = String(state.a1);
    if (els.a2) els.a2.value = String(state.a2);
    if (els.a2Range) els.a2Range.value = String(state.a2);
    if (els.a3) els.a3.value = String(state.a3);
    if (els.a3Range) els.a3Range.value = String(state.a3);
  }

  function readNumber(input, index) {
    if (!input) return;
    var raw = input.value.trim();
    if (raw === '' || raw === '.' || raw === '-') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    setAmplitude(index, value);
  }

  /* ------------------------------------------------------------------ *
   * 事件
   * ------------------------------------------------------------------ */

  if (els.a1Range) els.a1Range.addEventListener('input', function () { setAmplitude(1, parseFloat(els.a1Range.value)); });
  if (els.a1) els.a1.addEventListener('input', function () { readNumber(els.a1, 1); });
  if (els.a2Range) els.a2Range.addEventListener('input', function () { setAmplitude(2, parseFloat(els.a2Range.value)); });
  if (els.a2) els.a2.addEventListener('input', function () { readNumber(els.a2, 2); });
  if (els.a3Range) els.a3Range.addEventListener('input', function () { setAmplitude(3, parseFloat(els.a3Range.value)); });
  if (els.a3) els.a3.addEventListener('input', function () { readNumber(els.a3, 3); });

  if (els.btnReset) {
    els.btnReset.addEventListener('click', function () {
      state.a1 = INITIAL.a1;
      state.a2 = INITIAL.a2;
      state.a3 = INITIAL.a3;
      syncInputs();
      updateReadouts();
    });
  }

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = PRESETS[button.getAttribute('data-preset')];
      if (!preset) return;
      state.a1 = preset.a1;
      state.a2 = preset.a2;
      state.a3 = preset.a3;
      syncInputs();
      updateReadouts();
    });
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    sine: { correct: false, text: '只有把五度也关掉，才会回到纯正弦；少一个系数不等于只剩一个基。' },
    two: { correct: true, text: '对。三个系数变成一个 0，频谱少一根柱，波形仍是根音与五度两条正弦的叠加。' },
    silent: { correct: false, text: '根音和五度还在响。系数为 0 只说明这一根基不参与，不是整体静音。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-harmony');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;
      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-harmony');
        option.classList.toggle('is-correct', value === 'two' && answer === 'two');
        option.classList.toggle('is-wrong', value === answer && answer !== 'two');
        option.setAttribute('aria-pressed', String(value === answer));
      });
      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  if (els.btnQuizApply) {
    els.btnQuizApply.addEventListener('click', function () {
      setAmplitude(2, 0);
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
})();
