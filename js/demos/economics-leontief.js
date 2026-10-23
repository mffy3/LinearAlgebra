/**
 * economics-leontief.js · 经济应用 01：列昂惕夫投入产出
 *
 * x = Ax + d
 * (I − A)x = d
 * x = (I − A)⁻¹ d
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[economics-leontief] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('economics-canvas');
  var stageCard = document.getElementById('stage-card');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 10.5, padding: 32 });
  var LEVEL_FACTOR = window.LinAlgLevel ? window.LinAlgLevel.factor : 1;
  var TARGET_X2 = 50;
  var TARGET_TOL = 0.7 * LEVEL_FACTOR;

  var A = L.mat2(0.2, 0.3, 0.1, 0.2);
  var I = L.identity();
  var M = L.subMat(I, A);
  var M_INV = L.inverse(M);

  var NODES = {
    agri: { x: -2.7, y: 1.35, radius: 1.05, label: '农业', color: K.PALETTE.e1 },
    manufacturing: { x: 2.7, y: 1.35, radius: 1.05, label: '制造', color: K.PALETTE.e2 }
  };

  var state = {
    d1: 30,
    d2: 20,
    dragging: null
  };

  var els = {
    d1Range: document.getElementById('d1-range'),
    d2Range: document.getElementById('d2-range'),
    d1: document.getElementById('d1'),
    d2: document.getElementById('d2'),
    x1: document.getElementById('readout-x1'),
    x2: document.getElementById('readout-x2'),
    d1Out: document.getElementById('readout-d1'),
    d2Out: document.getElementById('readout-d2'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('economics-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-economics]')),
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

  function compute() {
    var d = { x: state.d1, y: state.d2 };
    var solved = L.solve2(M, d);
    var x = solved && solved.solution ? solved.solution : { x: NaN, y: NaN };
    var intermediate = L.applyMat(A, x);
    var delta = Math.abs(x.y - TARGET_X2);

    return {
      d: d,
      x: x,
      intermediate: intermediate,
      delta: delta,
      achieved: delta <= TARGET_TOL
    };
  }

  function updateProfessor(data) {
    var textEl = document.getElementById('professor-text');
    var promptEl = document.getElementById('professor-prompt');
    var stripText = document.getElementById('professor-strip-text');
    var stripPrompt = document.getElementById('professor-strip-prompt');
    if (!window.LinAlgNarration) return;

    var note = window.LinAlgNarration.economics({
      d1: state.d1,
      d2: state.d2,
      x1: data.x.x,
      x2: data.x.y
    });

    if (textEl && textEl.textContent !== note.text) textEl.textContent = note.text;
    if (promptEl && promptEl.textContent !== note.prompt) promptEl.textContent = note.prompt;
    if (stripText && stripText.textContent !== note.text) stripText.textContent = note.text;
    if (stripPrompt && stripPrompt.textContent !== note.prompt) stripPrompt.textContent = note.prompt;
  }

  function updateHint(data) {
    if (!els.hint) return;
    els.hint.textContent = data.achieved
      ? '制造业达到 50；农业的产出也跟着变了'
      : '左右拖动需求框里的金点，或调 d₁、d₂';
  }

  function updateReadouts() {
    var data = compute();

    els.x1.textContent = L.formatFixed(data.x.x, 1);
    els.x2.textContent = L.formatFixed(data.x.y, 1);
    els.d1Out.textContent = L.formatFixed(state.d1, 0);
    els.d2Out.textContent = L.formatFixed(state.d2, 0);
    els.status.textContent = data.achieved ? '目标产出 · x₂ = 50' : '正产出 · 均衡';

    var progress = data.achieved
      ? 100
      : Math.max(0, Math.min(100, 100 - data.delta / 30 * 100));

    els.challengeCard.classList.toggle('is-complete', data.achieved);
    els.challengeState.textContent = data.achieved ? '达成' : (data.delta < 4 ? '接近' : '进行中');
    els.challengeDistance.textContent = L.formatFixed(data.delta, 1);
    els.challengeFill.style.width = progress.toFixed(1) + '%';
    els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    updateHint(data);
    updateProfessor(data);
    draw();
  }

  /* ------------------------------------------------------------------ *
   * 绘图
   * ------------------------------------------------------------------ */

  function fitWorldSpan() {
    var target = view.width < 560 ? 8.5 : 10.5;
    if (view.worldSpan !== target) {
      view.worldSpan = target;
      view.resize();
    }
  }

  function fillWorldRect(context, vp, rect) {
    var a = vp.worldToScreen({ x: rect.x, y: rect.y });
    var b = vp.worldToScreen({ x: rect.x + rect.w, y: rect.y + rect.h });
    context.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y),
      Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }

  function strokeWorldRect(context, vp, rect, color, dash) {
    var points = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h }
    ];
    K.drawWorldPolygon(context, vp, points, {
      stroke: color,
      lineWidth: 1.2,
      dash: dash || null
    });
  }

  function circlePoints(cx, cy, radius, count) {
    var points = [];
    var n = count || 80;
    for (var i = 0; i < n; i++) {
      var t = i / n * Math.PI * 2;
      points.push({ x: cx + Math.cos(t) * radius, y: cy + Math.sin(t) * radius });
    }
    return points;
  }

  function drawNode(node, value, fill) {
    K.drawWorldPolygon(ctx, view, circlePoints(node.x, node.y, node.radius), {
      fill: fill,
      stroke: node.color,
      lineWidth: 2
    });

    K.drawLabel(ctx, view.worldToScreen({ x: node.x, y: node.y + 0.24 }).x,
      view.worldToScreen({ x: node.x, y: node.y + 0.24 }).y, node.label, {
        color: K.PALETTE.ink,
        background: 'rgba(250, 246, 238, 0.92)',
        border: 'rgba(46, 49, 44, 0.14)',
        font: '600 11px "Cascadia Code", Consolas, monospace',
        fontSize: 12
      });

    K.drawLabel(ctx, view.worldToScreen({ x: node.x, y: node.y - 0.28 }).x,
      view.worldToScreen({ x: node.x, y: node.y - 0.28 }).y,
      (node === NODES.agri ? 'x₁ = ' : 'x₂ = ') + L.formatFixed(value, 1), {
        color: node.color,
        background: 'rgba(250, 246, 238, 0.92)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
  }

  function drawFlow(data) {
    var agri = NODES.agri;
    var mfg = NODES.manufacturing;
    var agToMfg = A.b * data.x.y;
    var mfgToAg = A.c * data.x.x;

    // 农业 → 制造：制造业每 1 元产出需要农业 a₁₂ 元。
    K.drawArrowWorld(ctx, view,
      { x: agri.x + 0.95, y: agri.y + 0.52 },
      { x: mfg.x - 0.95, y: mfg.y + 0.52 }, {
        color: 'rgba(116, 134, 118, 0.72)',
        lineWidth: 2,
        head: 9,
        headWidth: 4.5
      });

    // 制造 → 农业：农业每 1 元产出需要制造 a₂₁ 元。
    K.drawArrowWorld(ctx, view,
      { x: mfg.x - 0.95, y: mfg.y - 0.52 },
      { x: agri.x + 0.95, y: agri.y - 0.52 }, {
        color: 'rgba(176, 125, 110, 0.72)',
        lineWidth: 2,
        head: 9,
        headWidth: 4.5
      });

    K.drawLabel(ctx, view.worldToScreen({ x: 0, y: 2.28 }).x,
      view.worldToScreen({ x: 0, y: 2.28 }).y,
      'a₁₂x₂ = ' + L.formatFixed(agToMfg, 1), {
        color: K.PALETTE.e1,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });

    K.drawLabel(ctx, view.worldToScreen({ x: 0, y: 0.38 }).x,
      view.worldToScreen({ x: 0, y: 0.38 }).y,
      'a₂₁x₁ = ' + L.formatFixed(mfgToAg, 1), {
        color: K.PALETTE.e2,
        background: 'rgba(250, 246, 238, 0.94)',
        border: 'rgba(46, 49, 44, 0.12)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
  }

  function demandBoxes() {
    return [
      { key: 'd1', node: NODES.agri, x: NODES.agri.x - 1.1, y: -1.3, w: 2.2, h: 0.9, label: 'd₁', value: state.d1, color: K.PALETTE.e1 },
      { key: 'd2', node: NODES.manufacturing, x: NODES.manufacturing.x - 1.1, y: -1.3, w: 2.2, h: 0.9, label: 'd₂', value: state.d2, color: K.PALETTE.e2 }
    ];
  }

  function drawDemand() {
    var boxes = demandBoxes();

    boxes.forEach(function (box) {
      ctx.save();
      ctx.fillStyle = 'rgba(250, 246, 238, 0.56)';
      fillWorldRect(ctx, view, box);
      ctx.restore();
      strokeWorldRect(ctx, view, box, 'rgba(46, 49, 44, 0.18)');

      K.drawLabel(ctx, view.worldToScreen({ x: box.x + box.w / 2, y: box.y - 0.28 }).x,
        view.worldToScreen({ x: box.x + box.w / 2, y: box.y - 0.28 }).y,
        box.label + ' = ' + L.formatFixed(box.value, 0), {
          color: box.color,
          background: 'rgba(250, 246, 238, 0.94)',
          border: 'rgba(46, 49, 44, 0.12)',
          font: '500 10px "Cascadia Code", Consolas, monospace',
          fontSize: 11
        });

      K.drawArrowWorld(ctx, view,
        { x: box.node.x, y: box.node.y - box.node.radius },
        { x: box.node.x, y: box.y + box.h + 0.18 }, {
          color: 'rgba(191, 163, 106, 0.65)',
          lineWidth: 1.6,
          head: 7,
          headWidth: 4
        });

      // 需求框里的横向滑点，拖它直接改 d。
      var trackX = box.x + 0.28;
      var trackW = box.w - 0.56;
      var knobX = trackX + (box.value / 60) * trackW;
      var knob = view.worldToScreen({ x: knobX, y: box.y + box.h / 2 });
      ctx.save();
      ctx.strokeStyle = 'rgba(46, 49, 44, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(view.worldToScreen({ x: trackX, y: box.y + box.h / 2 }).x, knob.y);
      ctx.lineTo(view.worldToScreen({ x: trackX + trackW, y: box.y + box.h / 2 }).x, knob.y);
      ctx.stroke();
      ctx.fillStyle = K.PALETTE.gold;
      ctx.strokeStyle = 'rgba(250, 246, 238, 0.96)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(knob.x, knob.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  function draw() {
    view.resize();
    fitWorldSpan();
    ctx = view.ctx;

    K.drawBackdrop(ctx, view);
    K.drawGrid(ctx, view, function (p) { return p; }, {
      range: 10,
      minor: 'rgba(46, 49, 44, 0.04)',
      major: 'rgba(46, 49, 44, 0.075)',
      lineWidth: 0.8,
      majorWidth: 1
    });

    var data = compute();

    K.drawLabel(ctx, 22, 26, 'Ax + d = x', {
      color: K.PALETTE.muted,
      background: 'rgba(250, 246, 238, 0.94)',
      border: 'rgba(46, 49, 44, 0.12)',
      font: '500 10px "Cascadia Code", Consolas, monospace',
      fontSize: 11
    });

    drawFlow(data);
    drawNode(NODES.agri, data.x.x, 'rgba(116, 134, 118, 0.12)');
    drawNode(NODES.manufacturing, data.x.y, 'rgba(176, 125, 110, 0.1)');
    drawDemand();

    K.drawLabel(ctx, view.worldToScreen({ x: 0, y: -0.65 }).x,
      view.worldToScreen({ x: 0, y: -0.65 }).y, '最终需求', {
        color: K.PALETTE.muted,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 10
      });

    if (data.achieved) {
      K.drawLabel(ctx, 22, 52, '目标产出 · x₂ = 50', {
        color: K.PALETTE.accent,
        background: 'rgba(227, 232, 221, 0.95)',
        border: 'rgba(116, 134, 118, 0.3)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
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
    if (els.d1Range) els.d1Range.value = String(Math.round(state.d1));
    if (els.d2Range) els.d2Range.value = String(Math.round(state.d2));
    if (els.d1 && document.activeElement !== els.d1) els.d1.value = L.formatInput(state.d1);
    if (els.d2 && document.activeElement !== els.d2) els.d2.value = L.formatInput(state.d2);
  }

  function setDemand(d1, d2) {
    state.d1 = clamp(d1, 0, 60);
    state.d2 = clamp(d2, 0, 60);
    syncInputs();
    updateReadouts();
  }

  function readNumber(input, setter) {
    var raw = input.value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    var value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    setter(clamp(value, 0, 60));
  }

  /* ------------------------------------------------------------------ *
   * 事件
   * ------------------------------------------------------------------ */

  if (els.d1Range) {
    els.d1Range.addEventListener('input', function () {
      setDemand(parseFloat(els.d1Range.value), state.d2);
    });
  }
  if (els.d2Range) {
    els.d2Range.addEventListener('input', function () {
      setDemand(state.d1, parseFloat(els.d2Range.value));
    });
  }
  if (els.d1) {
    els.d1.addEventListener('input', function () {
      readNumber(els.d1, function (value) {
        setDemand(value, state.d2);
      });
    });
    els.d1.addEventListener('blur', function () {
      els.d1.value = L.formatInput(state.d1);
    });
  }
  if (els.d2) {
    els.d2.addEventListener('input', function () {
      readNumber(els.d2, function (value) {
        setDemand(state.d1, value);
      });
    });
    els.d2.addEventListener('blur', function () {
      els.d2.value = L.formatInput(state.d2);
    });
  }

  els.btnReset.addEventListener('click', function () {
    setDemand(30, 20);
  });

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = button.getAttribute('data-preset');
      if (preset === 'balanced') setDemand(30, 20);
      else if (preset === 'agri') setDemand(45, 12);
      else if (preset === 'manufacturing') setDemand(12, 45);
    });
  });

  /* ------------------------------------------------------------------ *
   * 拖动需求框
   * ------------------------------------------------------------------ */

  function hitDemand(event) {
    var p = view.pointerPosition(event);
    var boxes = demandBoxes();
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var a = view.worldToScreen({ x: box.x, y: box.y });
      var b = view.worldToScreen({ x: box.x + box.w, y: box.y + box.h });
      if (p.x >= Math.min(a.x, b.x) - 6 && p.x <= Math.max(a.x, b.x) + 6 &&
          p.y >= Math.min(a.y, b.y) - 6 && p.y <= Math.max(a.y, b.y) + 6) {
        return box.key;
      }
    }
    return null;
  }

  function updateDemandFromPointer(event) {
    if (!state.dragging) return;
    var world = view.screenToWorld(view.pointerPosition(event));
    var boxes = demandBoxes();
    var box = boxes[0];
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].key === state.dragging) box = boxes[i];
    }
    var trackX = box.x + 0.28;
    var trackW = box.w - 0.56;
    var value = clamp((world.x - trackX) / trackW * 60, 0, 60);
    if (state.dragging === 'd1') setDemand(value, state.d2);
    else setDemand(state.d1, value);
  }

  function endDemandDrag(event) {
    state.dragging = null;
    canvas.classList.remove('is-dragging');
    canvas.classList.remove('is-grabbable');
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener('pointerdown', function (event) {
    var box = hitDemand(event);
    if (!box) return;
    event.preventDefault();
    state.dragging = box;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    canvas.classList.remove('is-grabbable');
    updateDemandFromPointer(event);
  });

  canvas.addEventListener('pointermove', function (event) {
    if (state.dragging) {
      event.preventDefault();
      updateDemandFromPointer(event);
      return;
    }
    canvas.classList.toggle('is-grabbable', !!hitDemand(event));
  });

  canvas.addEventListener('pointerup', endDemandDrag);
  canvas.addEventListener('pointercancel', endDemandDrag);
  canvas.addEventListener('pointerleave', function () {
    if (!state.dragging) canvas.classList.remove('is-grabbable');
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    a: { correct: false, text: '把 Ax 移到左边应该是 x − Ax = (I − A)x，不是加号。' },
    b: { correct: true, text: '对。x − Ax = (I − A)x = d，所以 x = (I − A)⁻¹d。' },
    c: { correct: false, text: 'Ax = d 漏掉了“总产出里还要留一部分给中间投入”。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-economics');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;

      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-economics');
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
    setDemand(25, 35);
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
    qctx.fillStyle = 'rgba(46, 49, 44, 0.055)';
    fillWorldRect(qctx, qv, { x: -1.8, y: -1.4, w: 3.6, h: 2.8 });

    qctx.fillStyle = 'rgba(116, 134, 118, 0.7)';
    fillWorldRect(qctx, qv, { x: -1.3, y: -1.4, w: 0.9, h: 2.8 });
    qctx.fillStyle = 'rgba(176, 125, 110, 0.7)';
    fillWorldRect(qctx, qv, { x: 0.4, y: -1.4, w: 0.9, h: 2.8 });

    K.drawLabel(qctx, qv.worldToScreen({ x: -0.85, y: 1.62 }).x,
      qv.worldToScreen({ x: -0.85, y: 1.62 }).y, 'x₁', {
        color: K.PALETTE.e1,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
        fontSize: 11
      });
    K.drawLabel(qctx, qv.worldToScreen({ x: 0.85, y: 1.62 }).x,
      qv.worldToScreen({ x: 0.85, y: 1.62 }).y, 'x₂', {
        color: K.PALETTE.e2,
        background: 'rgba(250, 246, 238, 0.9)',
        border: 'rgba(46, 49, 44, 0.1)',
        font: '500 10px "Cascadia Code", Consolas, monospace',
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
      var rawD1 = params.get('d1');
      var rawD2 = params.get('d2');
      if (rawD1) {
        var v1 = parseFloat(rawD1);
        if (Number.isFinite(v1)) state.d1 = clamp(v1, 0, 60);
      }
      if (rawD2) {
        var v2 = parseFloat(rawD2);
        if (Number.isFinite(v2)) state.d2 = clamp(v2, 0, 60);
      }
    } catch (error) {
      // URL 参数只做增强。
    }
  })();

  syncInputs();
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
