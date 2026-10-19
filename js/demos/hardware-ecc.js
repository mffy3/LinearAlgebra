/**
 * hardware-ecc.js · 计算机硬件应用 02：GF(2) 纠错码
 *
 * Hamming(7,4)：
 *   H c = 0 (mod 2)
 *   s = H r
 * syndrome 的二进制值 = 单比特错误位置。
 */
(function () {
  'use strict';

  var K = window.CanvasKit;
  if (!K) {
    console.error('[hardware-ecc] 缺少 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('ecc-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10, padding: 0 });

  // 列 1…7 依次是 001、010、011、100、101、110、111。
  var H = [
    [0, 0, 0, 1, 1, 1, 1],
    [0, 1, 1, 0, 0, 1, 1],
    [1, 0, 1, 0, 1, 0, 1]
  ];

  var state = {
    message: [1, 0, 1, 1],
    received: [],
    wasCorrected: false,
    nextError: 0,
    lastCorrection: null,
    keyboardIndex: 0,
    keyboardFocused: false
  };

  var els = {
    messageBits: Array.prototype.slice.call(document.querySelectorAll('[data-msg-bit]')),
    messagePresets: Array.prototype.slice.call(document.querySelectorAll('[data-msg-preset]')),
    syndrome: document.getElementById('readout-syndrome'),
    error: document.getElementById('readout-error'),
    status: document.getElementById('readout-status'),
    distance: document.getElementById('readout-distance'),
    canvasStatus: document.getElementById('canvas-status'),
    hint: document.getElementById('ecc-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnInject: document.getElementById('btn-inject'),
    btnCorrect: document.getElementById('btn-correct'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-ecc]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    quizCanvas: document.getElementById('quiz-canvas')
  };

  var rafId = null;
  var ctx = null;
  var bitRects = [];

  function xor() {
    var result = 0;
    for (var i = 0; i < arguments.length; i++) result ^= arguments[i];
    return result;
  }

  function encode(message) {
    var d1 = message[0];
    var d2 = message[1];
    var d3 = message[2];
    var d4 = message[3];
    var p1 = xor(d1, d2, d4);
    var p2 = xor(d1, d3, d4);
    var p3 = xor(d2, d3, d4);
    return [p1, p2, d1, p3, d2, d3, d4];
  }

  function syndromeOf(received) {
    return [
      xor(received[3], received[4], received[5], received[6]),
      xor(received[1], received[2], received[5], received[6]),
      xor(received[0], received[2], received[4], received[6])
    ];
  }

  function syndromeValue(bits) {
    return bits[0] * 4 + bits[1] * 2 + bits[2];
  }

  function diffIndices(a, b) {
    var result = [];
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) result.push(i);
    }
    return result;
  }

  function compute() {
    var code = encode(state.message);
    var received = state.received.slice();
    var sBits = syndromeOf(received);
    var sValue = syndromeValue(sBits);
    var diff = diffIndices(received, code);
    return {
      code: code,
      received: received,
      syndromeBits: sBits,
      syndromeValue: sValue,
      diff: diff,
      errorIndex: sValue > 0 ? sValue - 1 : -1
    };
  }

  function resetReceived() {
    state.received = encode(state.message).slice();
    state.wasCorrected = false;
    state.lastCorrection = null;
    state.nextError = 0;
    updateReadouts();
  }

  function updateMessageButtons() {
    els.messageBits.forEach(function (button, index) {
      var value = state.message[index];
      button.querySelector('b').textContent = String(value);
      button.classList.toggle('is-on', value === 1);
      button.setAttribute('aria-pressed', String(value === 1));
    });
    els.messagePresets.forEach(function (button) {
      var preset = button.getAttribute('data-msg-preset');
      button.classList.toggle('is-active', preset === state.message.join(''));
    });
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.ecc({
      syndrome: data.syndromeValue,
      diff: data.diff.length,
      corrected: state.wasCorrected
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    if (state.wasCorrected) {
      els.hint.textContent = '已纠正；再换一位试试，syndrome 会变成新的地址';
    } else if (data.diff.length > 0) {
      els.hint.textContent = 'syndrome 非零：点“纠正”看它指向哪一位';
    } else {
      els.hint.textContent = '点码字位翻转；键盘 ←→ 选择，空格翻转';
    }
  }

  function updateReadouts() {
    var data = compute();
    var diff = data.diff.length;

    els.syndrome.textContent = data.syndromeBits.join('');
    els.error.textContent = data.syndromeValue > 0 ? String(data.syndromeValue) : '—';
    els.distance.textContent = String(diff);

    if (state.wasCorrected && diff === 0) {
      els.status.textContent = '已纠正';
    } else if (data.syndromeValue === 0 && diff === 0) {
      els.status.textContent = '无错误';
    } else if (data.syndromeValue === 0) {
      els.status.textContent = '非原码字';
    } else if (diff === 1) {
      els.status.textContent = '单比特错误';
    } else {
      els.status.textContent = diff + ' 位不同';
    }
    els.canvasStatus.textContent = state.wasCorrected && diff === 0
      ? '已纠正 · Hc = 0'
      : (diff === 0 ? '无错误 · Hc = 0' : 'syndrome ≠ 0');

    var progress = 0;
    if (state.wasCorrected && diff === 0) progress = 100;
    else if (diff === 1) progress = 60;

    els.challengeCard.classList.toggle('is-complete', progress === 100);
    els.challengeState.textContent = progress === 100 ? '达成' : (diff === 1 ? '待纠正' : '进行中');
    els.challengeDistance.textContent = progress === 100 ? '已纠正' : (diff === 1 ? '1 位错误' : '未开始');
    els.challengeFill.style.width = progress + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(progress));

    updateMessageButtons();
    updateHint(data);
    updateProfessor(data);
    draw();
  }

  /* ------------------------------------------------------------------ *
   * 绘图
   * ------------------------------------------------------------------ */

  var LABELS = ['p₁', 'p₂', 'd₁', 'p₃', 'd₂', 'd₃', 'd₄'];
  var PARITY = [true, true, false, true, false, false, false];

  function layout() {
    var W = view.width;
    var Hh = view.height;
    return {
      bitsY: Hh * 0.22,
      bitsX: W * 0.08,
      bitsW: W * 0.84,
      synY: Hh * 0.50
    };
  }

  function drawBits(data, layoutData) {
    var step = layoutData.bitsW / 7;
    var size = Math.min(step * 0.68, 62);
    var y = layoutData.bitsY;
    bitRects = [];

    for (var i = 0; i < 7; i++) {
      var cx = layoutData.bitsX + step * (i + 0.5);
      var x = cx - size / 2;
      var rect = { x: x, y: y - size / 2, w: size, h: size, index: i };
      bitRects.push(rect);

      var wrong = data.diff.indexOf(i) >= 0;
      var candidate = data.errorIndex === i && data.syndromeValue > 0;
      ctx.save();
      ctx.fillStyle = wrong
        ? 'rgba(176, 125, 110, 0.16)'
        : (PARITY[i] ? 'rgba(116, 134, 118, 0.12)' : 'rgba(191, 163, 106, 0.1)');
      ctx.strokeStyle = wrong ? K.PALETTE.e2 : 'rgba(46, 49, 44, 0.2)';
      ctx.lineWidth = wrong ? 2 : 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y - size / 2, size, size, 12);
      } else {
        ctx.rect(x, y - size / 2, size, size);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (candidate) {
        ctx.save();
        ctx.strokeStyle = K.PALETTE.gold;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cx, y, size * 0.65, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (state.keyboardFocused && state.keyboardIndex === i) {
        ctx.save();
        ctx.strokeStyle = K.PALETTE.e1;
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(cx, y, size * 0.78, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      K.drawLabel(ctx, cx, y - size * 0.68, LABELS[i], {
        color: PARITY[i] ? K.PALETTE.e1 : K.PALETTE.gold,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 9px "Cascadia Code", Consolas, monospace',
        fontSize: 10,
        align: 'center'
      });

      K.drawLabel(ctx, cx, y, String(data.received[i]), {
        color: wrong ? K.PALETTE.e2 : K.PALETTE.ink,
        background: 'transparent',
        border: null,
        font: '600 17px "Cascadia Code", Consolas, monospace',
        fontSize: 18,
        align: 'center'
      });
    }

    K.drawLabel(ctx, layoutData.bitsX + layoutData.bitsW / 2, y - 52,
      '接收到的 7 位码字 r · 点一位翻转', {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
  }

  function drawSyndrome(data, layoutData) {
    var W = view.width;
    var center = W / 2;
    var y = layoutData.synY;
    var size = 40;
    var gap = 8;

    K.drawLabel(ctx, center, y - 62, 'syndrome = H r', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.12)',
      font: '500 10px "Cascadia Code", Consolas, monospace',
      fontSize: 11
    });

    data.syndromeBits.forEach(function (bit, index) {
      var x = center - (size * 3 + gap * 2) / 2 + index * (size + gap);
      ctx.save();
      ctx.fillStyle = bit
        ? 'rgba(176, 125, 110, 0.18)'
        : 'rgba(250, 246, 238, 0.6)';
      ctx.strokeStyle = bit ? K.PALETTE.e2 : 'rgba(46, 49, 44, 0.2)';
      ctx.lineWidth = 1.2;
      if (ctx.roundRect) ctx.roundRect(x, y, size, size, 9);
      else ctx.rect(x, y, size, size);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      K.drawLabel(ctx, x + size / 2, y + size / 2, String(bit), {
        color: bit ? K.PALETTE.e2 : K.PALETTE.ink,
        background: 'transparent',
        border: null,
        font: '600 15px "Cascadia Code", Consolas, monospace',
        fontSize: 16,
        align: 'center'
      });
    });

    var text = data.syndromeValue === 0
      ? 's = 000 → 无错误'
      : 's = ' + data.syndromeBits.join('') + '₂ = ' + data.syndromeValue + ' → 第 ' + data.syndromeValue + ' 位';
    K.drawLabel(ctx, center, y + 72, text, {
      color: data.syndromeValue === 0 ? K.PALETTE.e1 : K.PALETTE.e2,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.12)',
      font: '500 10px "Cascadia Code", Consolas, monospace',
      fontSize: 11
    });

    if (data.syndromeValue > 0 && bitRects[data.syndromeValue - 1]) {
      var target = bitRects[data.syndromeValue - 1];
      ctx.save();
      ctx.strokeStyle = 'rgba(191, 163, 106, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(center, y - 4);
      ctx.lineTo(target.x + target.w / 2, target.y + target.h + 8);
      ctx.stroke();
      ctx.restore();
    }
  }

  function draw() {
    view.resize();
    ctx = view.ctx;
    K.drawBackdrop(ctx, view);

    var layoutData = layout();
    var data = compute();
    drawSyndrome(data, layoutData);
    drawBits(data, layoutData);

    K.drawLabel(ctx, 22, 26, 'Hc = 0', {
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
   * 交互
   * ------------------------------------------------------------------ */

  function hitBit(event) {
    var p = view.pointerPosition(event);
    for (var i = 0; i < bitRects.length; i++) {
      var r = bitRects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        return i;
      }
    }
    return -1;
  }

  function flipBit(index) {
    state.received[index] ^= 1;
    state.wasCorrected = false;
    state.lastCorrection = null;
    updateReadouts();
  }

  canvas.addEventListener('pointerdown', function (event) {
    var index = hitBit(event);
    if (index < 0) return;
    event.preventDefault();
    flipBit(index);
  });

  canvas.addEventListener('pointermove', function (event) {
    canvas.classList.toggle('is-grabbable', hitBit(event) >= 0);
  });

  canvas.addEventListener('pointerleave', function () {
    canvas.classList.remove('is-grabbable');
  });

  canvas.addEventListener('focus', function () {
    state.keyboardFocused = true;
    requestRender();
  });

  canvas.addEventListener('blur', function () {
    state.keyboardFocused = false;
    requestRender();
  });

  canvas.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      state.keyboardIndex = (state.keyboardIndex +
        (event.key === 'ArrowLeft' ? 6 : 1)) % 7;
      requestRender();
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      flipBit(state.keyboardIndex);
      return;
    }
    if (event.key === 'c' || event.key === 'C') {
      event.preventDefault();
      els.btnCorrect.click();
    }
  });

  els.messageBits.forEach(function (button, index) {
    button.addEventListener('click', function () {
      state.message[index] ^= 1;
      resetReceived();
    });
  });

  els.messagePresets.forEach(function (button) {
    button.addEventListener('click', function () {
      state.message = button.getAttribute('data-msg-preset').split('').map(Number);
      resetReceived();
    });
  });

  els.btnInject.addEventListener('click', function () {
    var index = state.nextError;
    state.nextError = (state.nextError + 1) % 7;
    if (state.received[index] === encode(state.message)[index]) {
      state.received[index] ^= 1;
    }
    state.wasCorrected = false;
    state.lastCorrection = null;
    updateReadouts();
  });

  els.btnCorrect.addEventListener('click', function () {
    var data = compute();
    var s = data.syndromeValue;
    if (s === 0) {
      state.wasCorrected = false;
      updateReadouts();
      return;
    }

    var index = s - 1;
    state.received[index] ^= 1;
    var after = compute();
    state.wasCorrected = after.diff.length === 0;
    state.lastCorrection = state.wasCorrected ? index + 1 : null;
    updateReadouts();
  });

  els.btnReset.addEventListener('click', function () {
    state.message = [1, 0, 1, 1];
    state.nextError = 0;
    resetReceived();
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    a: { correct: false, text: 'syndrome 是错误签名，不是原始信息本身。' },
    b: { correct: true, text: '对。H 的每一列对应一个位置；单比特错误的 syndrome 就是那一列。' },
    c: { correct: false, text: '这里不涉及传输速度；syndrome 是校验结果。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-ecc');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-ecc');
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
    var data = compute();
    if (data.diff.length === 0) {
      state.received[2] ^= 1;
      state.wasCorrected = false;
      updateReadouts();
    }
    if (stageCard) {
      stageCard.scrollIntoView({
        behavior: 'smooth',
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

    var gap = 5;
    var size = Math.min((qv.width * 0.78 - gap * 6) / 7, qv.height * 0.18);
    var total = size * 7 + gap * 6;
    var startX = (qv.width - total) / 2;
    var y = qv.height * 0.37;

    K.drawLabel(qctx, qv.width / 2, y - 28, 'syndrome = H r → 错误位置', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.92)',
      border: 'rgba(46, 49, 44, 0.1)',
      font: '500 9px "Cascadia Code", Consolas, monospace',
      fontSize: 10,
      align: 'center'
    });

    for (var i = 0; i < 7; i++) {
      var x = startX + i * (size + gap);
      qctx.save();
      qctx.fillStyle = i === 2
        ? 'rgba(176, 125, 110, 0.26)'
        : 'rgba(46, 49, 44, 0.1)';
      qctx.strokeStyle = i === 2 ? K.PALETTE.e2 : 'rgba(46, 49, 44, 0.16)';
      qctx.lineWidth = i === 2 ? 1.5 : 1;
      qctx.beginPath();
      if (qctx.roundRect) qctx.roundRect(x, y, size, size * 1.35, 5);
      else qctx.rect(x, y, size, size * 1.35);
      qctx.fill();
      qctx.stroke();
      qctx.restore();

      K.drawLabel(qctx, x + size / 2, y + size * 0.7, String(i + 1), {
        color: i === 2 ? K.PALETTE.e2 : K.PALETTE.ink,
        background: 'transparent',
        border: null,
        font: '600 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12,
        align: 'center'
      });
    }

    K.drawLabel(qctx, qv.width / 2, y + size * 2.05, 's = 011 → 第 3 位', {
      color: K.PALETTE.e2,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.12)',
      font: '500 10px "Cascadia Code", Consolas, monospace',
      fontSize: 10,
      align: 'center'
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

  state.received = encode(state.message).slice();
  updateReadouts();
  requestRender();
  drawQuiz();
})();
