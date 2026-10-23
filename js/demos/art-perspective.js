/**
 * art-perspective.js · 美术 · 一点透视
 *
 * 地面上一张方格网：世界坐标 (X, 0, Z) 除以深度之后落到画面上。
 * 所有平行于 Z 轴的线都汇到同一个消失点 vₚ，它的高度就是地平线。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[perspective] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('perspective-canvas');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 3.6, padding: 30 });
  var NEAR = 0.9;

  var INITIAL = { eye: 1.6, focal: 1.2, vpX: 0, vpY: 0.12 };

  var PRESETS = {
    street: { eye: 1.6, focal: 1.2, vpX: 0, vpY: 0.12 },
    low: { eye: 0.55, focal: 1.2, vpX: 0, vpY: 0.02 },
    high: { eye: 2.7, focal: 1.35, vpX: 0, vpY: 0.42 }
  };

  var state = {
    eye: INITIAL.eye,
    focal: INITIAL.focal,
    vpX: INITIAL.vpX,
    vpY: INITIAL.vpY,
    dragging: null
  };

  var els = {
    eye: document.getElementById('eye'),
    eyeRange: document.getElementById('eye-range'),
    focal: document.getElementById('focal'),
    focalRange: document.getElementById('focal-range'),
    vpX: document.getElementById('vp-x'),
    vpXRange: document.getElementById('vp-x-range'),
    vpY: document.getElementById('vp-y'),
    vpYRange: document.getElementById('vp-y-range'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('perspective-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-perspective]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    readoutEye: document.getElementById('readout-eye'),
    readoutFocal: document.getElementById('readout-focal'),
    readoutVp: document.getElementById('readout-vp'),
    readoutHorizon: document.getElementById('readout-horizon')
  };

  var ctx = null;
  var rafId = null;

  /* ------------------------------------------------------------------ *
   * 投影
   * ------------------------------------------------------------------ */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundTo(value, digits) {
    var p = Math.pow(10, digits);
    return Math.round(value * p) / p;
  }

  /**
   * 世界 (X, Y, Z) → 画面坐标。
   * 相机在 Y = eye 的高度；Z 轴正方向朝画面里；vp 是画面平移量。
   */
  function project(X, Y, Z) {
    var depth = Z + NEAR;
    return {
      x: state.focal * X / depth + state.vpX,
      y: state.focal * (Y - state.eye) / depth + state.vpY
    };
  }

  /* ------------------------------------------------------------------ *
   * 绘图
   * ------------------------------------------------------------------ */

  function drawGround() {
    var i;
    var z;

    // 朝消失点收拢的纵线
    for (i = -10; i <= 10; i++) {
      var X = i * 1.6;
      var a = project(X, 0, 0.6);
      var b = project(X, 0, 60);
      K.drawWorldLine(ctx, view, a, b, {
        stroke: 'rgba(46, 49, 44, 0.13)',
        lineWidth: 0.9
      });
    }

    // 越远越密的横线
    var depths = [1, 2, 3, 4, 5, 6, 7.5, 9, 11, 13.5, 16, 20, 25, 31, 39, 48];
    for (i = 0; i < depths.length; i++) {
      z = depths[i];
      var left = project(-16, 0, z);
      var right = project(16, 0, z);
      K.drawWorldLine(ctx, view, left, right, {
        stroke: 'rgba(46, 49, 44, 0.11)',
        lineWidth: 0.9
      });
    }
  }

  function drawPosts() {
    var posts = [
      { x: -3.2, z: 5 }, { x: -3.2, z: 11 }, { x: -3.2, z: 20 },
      { x: 3.2, z: 5 }, { x: 3.2, z: 11 }, { x: 3.2, z: 20 }
    ];
    var height = 3.1;

    for (var i = 0; i < posts.length; i++) {
      var bottom = project(posts[i].x, 0, posts[i].z);
      var top = project(posts[i].x, height, posts[i].z);
      K.drawWorldLine(ctx, view, bottom, top, {
        stroke: 'rgba(46, 49, 44, 0.42)',
        lineWidth: 1.6
      });
      var capLeft = project(posts[i].x - 0.5, height, posts[i].z);
      var capRight = project(posts[i].x + 0.5, height, posts[i].z);
      K.drawWorldLine(ctx, view, capLeft, capRight, {
        stroke: 'rgba(46, 49, 44, 0.34)',
        lineWidth: 1.2
      });
    }
  }

  function drawHorizon() {
    K.drawWorldLine(ctx, view, { x: -20, y: state.vpY }, { x: 20, y: state.vpY }, {
      stroke: 'rgba(46, 49, 44, 0.42)',
      lineWidth: 1.2,
      dash: [6, 6]
    });
  }

  function drawVanishingPoint() {
    var p = { x: state.vpX, y: state.vpY };
    K.drawPointWorld(ctx, view, p, {
      radius: 7,
      fill: 'rgba(191, 163, 106, 0.2)',
      stroke: K.PALETTE.gold,
      lineWidth: 1.6
    });
    K.drawPointWorld(ctx, view, p, { radius: 2.6, fill: K.PALETTE.gold });

    var screen = view.worldToScreen(p);
    K.drawLabel(ctx, screen.x + 13, screen.y + 17, 'V', {
      color: K.PALETTE.gold,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(191, 163, 106, 0.3)',
      font: '600 11px "Cascadia Code", Consolas, monospace',
      fontSize: 12
    });
  }

  function drawTopLabel(text, color) {
    K.drawLabel(ctx, 22, 26, text, {
      color: color,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.15)',
      font: '500 11px "Cascadia Code", Consolas, monospace',
      fontSize: 12
    });
  }

  function draw() {
    view.resize();
    ctx = view.ctx;

    K.drawBackdrop(ctx, view);
    drawGround();
    drawHorizon();
    drawPosts();
    drawVanishingPoint();

    if (state.eye < 0.8) {
      drawTopLabel('低机位 · 地砖被压扁', K.PALETTE.warm);
    } else if (Math.abs(state.vpX) < 0.06 && Math.abs(state.vpY) < 0.06) {
      drawTopLabel('消失点居中 · 左右对称', K.PALETTE.accent || '#748676');
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
   * 读数与旁白
   * ------------------------------------------------------------------ */

  function updateReadouts() {
    if (els.readoutEye) els.readoutEye.textContent = L.formatFixed(state.eye, 2);
    if (els.readoutFocal) els.readoutFocal.textContent = L.formatFixed(state.focal, 2);
    if (els.readoutVp) {
      els.readoutVp.textContent = L.formatFixed(state.vpX, 2) + ', ' + L.formatFixed(state.vpY, 2);
    }
    if (els.readoutHorizon) els.readoutHorizon.textContent = L.formatFixed(state.vpY, 2);

    var offset = Math.hypot(state.vpX, state.vpY);
    var centered = Math.abs(state.vpX) < 0.08 && Math.abs(state.vpY) < 0.08;
    if (els.status) {
      els.status.textContent = centered ? '居中' : Math.abs(state.vpX) > Math.abs(state.vpY)
        ? (state.vpX > 0 ? '偏右' : '偏左')
        : (state.vpY > 0 ? '偏上' : '偏下');
    }

    var achieved = offset <= 0.06;
    var progress = achieved ? 100 : Math.max(0, Math.min(100, 100 - offset * 220));
    if (els.challengeCard) els.challengeCard.classList.toggle('is-complete', achieved);
    if (els.challengeState) els.challengeState.textContent = achieved ? '达成' : (offset <= 0.25 ? '接近' : '进行中');
    if (els.challengeDistance) els.challengeDistance.textContent = L.formatFixed(offset, 2);
    if (els.challengeFill) els.challengeFill.style.width = progress.toFixed(1) + '%';
    if (els.challengeMeter) els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    var note = window.LinAlgNarration ? window.LinAlgNarration.perspective({
      eyeHeight: state.eye,
      vx: state.vpX,
      vy: state.vpY
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
      if (achieved) els.hint.textContent = '消失点居中：左右地砖完全对称';
      else if (state.eye < 0.8) els.hint.textContent = '低机位：地砖被压成一条条薄带';
      else els.hint.textContent = '拖动画面移动消失点；右侧也能调视高';
    }

    draw();
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */

  function setEye(value) {
    state.eye = roundTo(clamp(value, 0.4, 3), 2);
    syncInputs();
    updateReadouts();
  }

  function setFocal(value) {
    state.focal = roundTo(clamp(value, 0.5, 2.4), 2);
    syncInputs();
    updateReadouts();
  }

  function setVpX(value) {
    state.vpX = roundTo(clamp(value, -2.2, 2.2), 2);
    syncInputs();
    updateReadouts();
  }

  function setVpY(value) {
    state.vpY = roundTo(clamp(value, -0.9, 1.1), 2);
    syncInputs();
    updateReadouts();
  }

  function syncInputs() {
    if (els.eye) els.eye.value = L.formatInput(state.eye);
    if (els.eyeRange) els.eyeRange.value = String(state.eye);
    if (els.focal) els.focal.value = L.formatInput(state.focal);
    if (els.focalRange) els.focalRange.value = String(state.focal);
    if (els.vpX) els.vpX.value = L.formatInput(state.vpX);
    if (els.vpXRange) els.vpXRange.value = String(state.vpX);
    if (els.vpY) els.vpY.value = L.formatInput(state.vpY);
    if (els.vpYRange) els.vpYRange.value = String(state.vpY);
  }

  function readNumber(input, setter) {
    if (!input) return;
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    setter(value);
  }

  /* ------------------------------------------------------------------ *
   * 事件
   * ------------------------------------------------------------------ */

  if (els.eyeRange) els.eyeRange.addEventListener('input', function () { setEye(parseFloat(els.eyeRange.value)); });
  if (els.eye) els.eye.addEventListener('input', function () { readNumber(els.eye, setEye); });
  if (els.focalRange) els.focalRange.addEventListener('input', function () { setFocal(parseFloat(els.focalRange.value)); });
  if (els.focal) els.focal.addEventListener('input', function () { readNumber(els.focal, setFocal); });
  if (els.vpXRange) els.vpXRange.addEventListener('input', function () { setVpX(parseFloat(els.vpXRange.value)); });
  if (els.vpX) els.vpX.addEventListener('input', function () { readNumber(els.vpX, setVpX); });
  if (els.vpYRange) els.vpYRange.addEventListener('input', function () { setVpY(parseFloat(els.vpYRange.value)); });
  if (els.vpY) els.vpY.addEventListener('input', function () { readNumber(els.vpY, setVpY); });

  if (els.btnReset) {
    els.btnReset.addEventListener('click', function () {
      state.eye = INITIAL.eye;
      state.focal = INITIAL.focal;
      state.vpX = INITIAL.vpX;
      state.vpY = INITIAL.vpY;
      syncInputs();
      updateReadouts();
    });
  }

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = PRESETS[button.getAttribute('data-preset')];
      if (!preset) return;
      state.eye = preset.eye;
      state.focal = preset.focal;
      state.vpX = preset.vpX;
      state.vpY = preset.vpY;
      syncInputs();
      updateReadouts();
    });
  });

  canvas.addEventListener('pointerdown', function (event) {
    event.preventDefault();
    state.dragging = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      vpX: state.vpX,
      vpY: state.vpY
    };
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!state.dragging || state.dragging.id !== event.pointerId) return;
    event.preventDefault();
    var dx = (event.clientX - state.dragging.x) / view.scale;
    var dy = (event.clientY - state.dragging.y) / view.scale;
    state.vpX = roundTo(clamp(state.dragging.vpX + dx, -2.2, 2.2), 2);
    state.vpY = roundTo(clamp(state.dragging.vpY - dy, -0.9, 1.1), 2);
    syncInputs();
    updateReadouts();
  });

  function endDrag(event) {
    if (!state.dragging) return;
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    state.dragging = null;
    canvas.classList.remove('is-dragging');
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('keydown', function (event) {
    var step = event.shiftKey ? 0.2 : 0.05;
    if (event.key === 'ArrowLeft') { setVpX(state.vpX - step); event.preventDefault(); }
    else if (event.key === 'ArrowRight') { setVpX(state.vpX + step); event.preventDefault(); }
    else if (event.key === 'ArrowUp') { setVpY(state.vpY + step); event.preventDefault(); }
    else if (event.key === 'ArrowDown') { setVpY(state.vpY - step); event.preventDefault(); }
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    parallel: { correct: false, text: '那是平行投影（正交投影）。透视里，深度会让两条轨道越走越近。' },
    meet: { correct: true, text: '对。两条铁轨的方向相同，Z → ∞ 时投影点都落到同一个消失点。' },
    cross: { correct: false, text: '它们只在消失点相遇，不会穿过去再分开——否则画面里会出现两条“越走越远”的铁轨。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-perspective');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;
      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-perspective');
        option.classList.toggle('is-correct', value === 'meet' && answer === 'meet');
        option.classList.toggle('is-wrong', value === answer && answer !== 'meet');
        option.setAttribute('aria-pressed', String(value === answer));
      });
      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  if (els.btnQuizApply) {
    els.btnQuizApply.addEventListener('click', function () {
      setVpX(0);
      setVpY(0);
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
      dragPan: false,
      reserveDock: true,
      keepScale: true
    });
  }

})();
