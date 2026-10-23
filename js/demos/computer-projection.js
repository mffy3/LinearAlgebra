/**
 * computer-projection.js · 计算机 · 三维投影
 *
 * 一个立方体：先乘旋转矩阵 R = Rx(pitch)·Ry(yaw)，再做透视除法 x = f·pₓ/(p_z+d)。
 * 只负责状态与绘制；矩阵、投影都在 math.js 里。
 */
(function () {
  'use strict';

  var L = window.LinAlg;
  var K = window.CanvasKit;
  if (!L || !K) {
    console.error('[projection] 缺少 math.js 或 canvas-utils.js，页面无法初始化。');
    return;
  }

  var canvas = document.getElementById('projection-canvas');
  if (!canvas) return;

  var view = K.createViewport(canvas, { worldSpan: 2.9, padding: 34 });
  var SIZE = 1.05;

  var CUBE = [
    { x: -1, y: -1, z: -1 },
    { x: 1, y: -1, z: -1 },
    { x: 1, y: 1, z: -1 },
    { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 },
    { x: 1, y: -1, z: 1 },
    { x: 1, y: 1, z: 1 },
    { x: -1, y: 1, z: 1 }
  ];

  var EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  var FACES = [
    { idx: [0, 1, 2, 3], n: { x: 0, y: 0, z: -1 } },
    { idx: [4, 5, 6, 7], n: { x: 0, y: 0, z: 1 } },
    { idx: [0, 3, 7, 4], n: { x: -1, y: 0, z: 0 } },
    { idx: [1, 5, 6, 2], n: { x: 1, y: 0, z: 0 } },
    { idx: [0, 4, 5, 1], n: { x: 0, y: -1, z: 0 } },
    { idx: [3, 2, 6, 7], n: { x: 0, y: 1, z: 0 } }
  ];

  var INITIAL = { yaw: 35, pitch: -20, focal: 1.6, distance: 5.6 };

  var PRESETS = {
    front: { yaw: 0, pitch: 0 },
    iso: { yaw: 35, pitch: -20 },
    top: { yaw: 0, pitch: 70 }
  };

  var state = {
    yaw: INITIAL.yaw,
    pitch: INITIAL.pitch,
    focal: INITIAL.focal,
    distance: INITIAL.distance,
    dragging: null
  };

  var els = {
    yaw: document.getElementById('yaw'),
    yawRange: document.getElementById('yaw-range'),
    pitch: document.getElementById('pitch'),
    pitchRange: document.getElementById('pitch-range'),
    focal: document.getElementById('focal'),
    focalRange: document.getElementById('focal-range'),
    distance: document.getElementById('distance'),
    distanceRange: document.getElementById('distance-range'),
    status: document.getElementById('canvas-status'),
    hint: document.getElementById('projection-hint'),
    challengeCard: document.getElementById('challenge-card'),
    challengeState: document.getElementById('challenge-state'),
    challengeDistance: document.getElementById('challenge-distance'),
    challengeMeter: document.getElementById('challenge-meter'),
    challengeFill: document.getElementById('challenge-meter-fill'),
    btnReset: document.getElementById('btn-reset'),
    btnQuizApply: document.getElementById('btn-quiz-apply'),
    presets: Array.prototype.slice.call(document.querySelectorAll('[data-preset]')),
    quizOptions: Array.prototype.slice.call(document.querySelectorAll('[data-quiz-projection]')),
    quizFeedback: document.getElementById('quiz-feedback'),
    readoutYaw: document.getElementById('readout-yaw'),
    readoutPitch: document.getElementById('readout-pitch'),
    readoutFocal: document.getElementById('readout-focal'),
    readoutDepth: document.getElementById('readout-depth')
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

  function compute() {
    var rotation = L.multiplyMat3(L.rotationX3(state.pitch), L.rotationY3(state.yaw));
    var rotated = CUBE.map(function (v) {
      return L.applyMat3(rotation, { x: v.x * SIZE, y: v.y * SIZE, z: v.z * SIZE });
    });
    var projected = rotated.map(function (p) {
      return L.projectPoint3(p, state.distance, state.focal);
    });

    var minDepth = Infinity;
    var maxDepth = -Infinity;
    for (var i = 0; i < projected.length; i++) {
      minDepth = Math.min(minDepth, projected[i].z);
      maxDepth = Math.max(maxDepth, projected[i].z);
    }

    return {
      rotation: rotation,
      rotated: rotated,
      points: projected,
      minDepth: minDepth,
      maxDepth: maxDepth
    };
  }

  function visibleFaces(data) {
    var camera = { x: 0, y: 0, z: -state.distance };
    var count = 0;

    for (var i = 0; i < FACES.length; i++) {
      var face = FACES[i];
      var normal = L.applyMat3(data.rotation, face.n);
      var center = { x: 0, y: 0, z: 0 };
      for (var k = 0; k < face.idx.length; k++) {
        var vertex = data.rotated[face.idx[k]];
        center.x += vertex.x / face.idx.length;
        center.y += vertex.y / face.idx.length;
        center.z += vertex.z / face.idx.length;
      }
      var toCamera = {
        x: camera.x - center.x,
        y: camera.y - center.y,
        z: camera.z - center.z
      };
      if (L.dot3(normal, toCamera) > 1e-6) count++;
    }

    return count;
  }

  function faceDepth(data, face) {
    var sum = 0;
    for (var i = 0; i < face.idx.length; i++) sum += data.points[face.idx[i]].z;
    return sum / face.idx.length;
  }

  /* ------------------------------------------------------------------ *
   * 绘图
   * ------------------------------------------------------------------ */

  function toWorld(point) {
    return { x: point.x, y: point.y };
  }

  function drawBackdropGrid() {
    K.drawGrid(ctx, view, function (p) { return p; }, {
      range: 8,
      minor: 'rgba(46, 49, 44, 0.04)',
      major: 'rgba(46, 49, 44, 0.065)',
      lineWidth: 0.7,
      majorWidth: 0.9
    });
    K.drawAxes(ctx, view, function (p) { return p; }, {
      range: 8,
      color: 'rgba(46, 49, 44, 0.16)',
      lineWidth: 0.9,
      dash: [3, 6]
    });
  }

  function drawAxes3D(data) {
    var r = data.rotation;
    var axes = [
      { v: { x: 1, y: 0, z: 0 }, color: K.PALETTE.e1, label: 'x' },
      { v: { x: 0, y: 1, z: 0 }, color: K.PALETTE.e2, label: 'y' },
      { v: { x: 0, y: 0, z: 1 }, color: K.PALETTE.gold, label: 'z' }
    ];
    var origin = L.projectPoint3({ x: 0, y: 0, z: 0 }, state.distance, state.focal);

    for (var i = 0; i < axes.length; i++) {
      var axis = axes[i];
      var tip3 = L.applyMat3(r, {
        x: axis.v.x * 1.9,
        y: axis.v.y * 1.9,
        z: axis.v.z * 1.9
      });
      var tip = L.projectPoint3(tip3, state.distance, state.focal);
      K.drawArrowWorld(ctx, view, toWorld(origin), toWorld(tip), {
        color: axis.color,
        lineWidth: 1.6,
        head: 8,
        headWidth: 4,
        label: axis.label,
        labelColor: axis.color,
        labelOffset: { x: 8, y: -9 }
      });
    }
  }

  function shade(alpha) {
    return 'rgba(116, 134, 118, ' + alpha.toFixed(3) + ')';
  }

  function drawCube(data) {
    var order = FACES.map(function (face, index) {
      return { face: face, index: index, depth: faceDepth(data, face) };
    }).sort(function (a, b) { return b.depth - a.depth; });

    for (var i = 0; i < order.length; i++) {
      var face = order[i].face;
      var poly = face.idx.map(function (index) { return toWorld(data.points[index]); });
      var front = L.polygonArea(poly) < 0;
      var depth = order[i].depth;
      var alpha = front ? 0.16 : 0.05;
      if (depth > state.distance) alpha *= 0.6;

      K.drawWorldPolygon(ctx, view, poly, {
        closed: true,
        fill: shade(alpha),
        stroke: 'rgba(46, 49, 44, ' + (front ? 0.42 : 0.16) + ')',
        lineWidth: front ? 1.4 : 1
      });
    }

    for (var e = 0; e < EDGES.length; e++) {
      var a = toWorld(data.points[EDGES[e][0]]);
      var b = toWorld(data.points[EDGES[e][1]]);
      K.drawWorldLine(ctx, view, a, b, {
        stroke: 'rgba(46, 49, 44, 0.28)',
        lineWidth: 0.9
      });
    }
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
    drawBackdropGrid();

    var data = compute();
    drawCube(data);
    drawAxes3D(data);

    var origin = L.projectPoint3({ x: 0, y: 0, z: 0 }, state.distance, state.focal);
    K.drawPointWorld(ctx, view, toWorld(origin), {
      radius: 3,
      fill: K.PALETTE.origin
    });

    var front = Math.abs(state.yaw) <= 4 && Math.abs(state.pitch) <= 4;
    if (front) {
      drawTopLabel('正面 · 只看见一个面', K.PALETTE.accent || '#748676');
    } else if (state.distance > 9.5) {
      drawTopLabel('相机很远 · 接近正交投影', K.PALETTE.warm);
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
    var data = compute();
    var yaw = state.yaw;
    var pitch = state.pitch;

    if (els.readoutYaw) els.readoutYaw.textContent = L.formatFixed(yaw, 1) + '°';
    if (els.readoutPitch) els.readoutPitch.textContent = L.formatFixed(pitch, 1) + '°';
    if (els.readoutFocal) els.readoutFocal.textContent = L.formatFixed(state.focal, 2);
    if (els.readoutDepth) els.readoutDepth.textContent = L.formatFixed(data.minDepth, 2);

    var faces = visibleFaces(data);
    if (els.status) els.status.textContent = faces + ' / 6';

    var delta = Math.hypot(yaw, pitch);
    var achieved = delta <= 6;
    var progress = achieved ? 100 : Math.max(0, Math.min(100, 100 - delta * 1.6));

    if (els.challengeCard) els.challengeCard.classList.toggle('is-complete', achieved);
    if (els.challengeState) els.challengeState.textContent = achieved ? '达成' : (delta <= 15 ? '接近' : '进行中');
    if (els.challengeDistance) els.challengeDistance.textContent = L.formatFixed(delta, 1) + '°';
    if (els.challengeFill) els.challengeFill.style.width = progress.toFixed(1) + '%';
    if (els.challengeMeter) els.challengeMeter.setAttribute('aria-valuenow', String(Math.round(progress)));

    var note = window.LinAlgNarration ? window.LinAlgNarration.projection({
      yaw: yaw,
      pitch: pitch,
      distance: state.distance,
      faces: faces,
      depth: data.minDepth
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
      if (delta <= 6) els.hint.textContent = '正面视角：投影只剩一个面';
      else if (state.distance > 9.5) els.hint.textContent = '相机很远，透视接近平行投影';
      else els.hint.textContent = '拖动画布旋转；右侧也能调角度';
    }

    draw();
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */

  function setYaw(value) {
    state.yaw = roundTo(clamp(value, -180, 180), 1);
    syncInputs();
    updateReadouts();
  }

  function setPitch(value) {
    state.pitch = roundTo(clamp(value, -85, 85), 1);
    syncInputs();
    updateReadouts();
  }

  function setFocal(value) {
    state.focal = roundTo(clamp(value, 0.6, 2.6), 2);
    syncInputs();
    updateReadouts();
  }

  function setDistance(value) {
    state.distance = roundTo(clamp(value, 3.2, 12), 1);
    syncInputs();
    updateReadouts();
  }

  function syncInputs() {
    if (els.yaw) els.yaw.value = L.formatInput(state.yaw);
    if (els.yawRange) els.yawRange.value = String(state.yaw);
    if (els.pitch) els.pitch.value = L.formatInput(state.pitch);
    if (els.pitchRange) els.pitchRange.value = String(state.pitch);
    if (els.focal) els.focal.value = L.formatInput(state.focal);
    if (els.focalRange) els.focalRange.value = String(state.focal);
    if (els.distance) els.distance.value = L.formatInput(state.distance);
    if (els.distanceRange) els.distanceRange.value = String(state.distance);
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

  if (els.yawRange) els.yawRange.addEventListener('input', function () { setYaw(parseFloat(els.yawRange.value)); });
  if (els.yaw) els.yaw.addEventListener('input', function () { readNumber(els.yaw, setYaw); });
  if (els.pitchRange) els.pitchRange.addEventListener('input', function () { setPitch(parseFloat(els.pitchRange.value)); });
  if (els.pitch) els.pitch.addEventListener('input', function () { readNumber(els.pitch, setPitch); });
  if (els.focalRange) els.focalRange.addEventListener('input', function () { setFocal(parseFloat(els.focalRange.value)); });
  if (els.focal) els.focal.addEventListener('input', function () { readNumber(els.focal, setFocal); });
  if (els.distanceRange) els.distanceRange.addEventListener('input', function () { setDistance(parseFloat(els.distanceRange.value)); });
  if (els.distance) els.distance.addEventListener('input', function () { readNumber(els.distance, setDistance); });

  if (els.btnReset) {
    els.btnReset.addEventListener('click', function () {
      state.yaw = INITIAL.yaw;
      state.pitch = INITIAL.pitch;
      state.focal = INITIAL.focal;
      state.distance = INITIAL.distance;
      syncInputs();
      updateReadouts();
    });
  }

  els.presets.forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = PRESETS[button.getAttribute('data-preset')];
      if (!preset) return;
      state.yaw = preset.yaw;
      state.pitch = preset.pitch;
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
      yaw: state.yaw,
      pitch: state.pitch
    };
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!state.dragging || state.dragging.id !== event.pointerId) return;
    event.preventDefault();
    var dx = event.clientX - state.dragging.x;
    var dy = event.clientY - state.dragging.y;
    state.yaw = roundTo(clamp(state.dragging.yaw - dx * 0.45, -180, 180), 1);
    state.pitch = roundTo(clamp(state.dragging.pitch + dy * 0.45, -85, 85), 1);
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
    var step = event.shiftKey ? 15 : 5;
    if (event.key === 'ArrowLeft') { setYaw(state.yaw - step); event.preventDefault(); }
    else if (event.key === 'ArrowRight') { setYaw(state.yaw + step); event.preventDefault(); }
    else if (event.key === 'ArrowUp') { setPitch(state.pitch + step); event.preventDefault(); }
    else if (event.key === 'ArrowDown') { setPitch(state.pitch - step); event.preventDefault(); }
  });

  /* ------------------------------------------------------------------ *
   * 先猜后验
   * ------------------------------------------------------------------ */

  var QUIZ_FEEDBACK = {
    bigger: { correct: false, text: '深度变大，除法把同样的 x 压得更小，所以物体不会变大。' },
    smaller: { correct: true, text: '对。x′ = f·x/(z + d)，d 变大，屏幕坐标变小，立方体看起来更小。' },
    same: { correct: false, text: '只有正交（平行）投影才与距离无关；透视投影里，远处一定更小。' }
  };

  els.quizOptions.forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.getAttribute('data-quiz-projection');
      var feedback = QUIZ_FEEDBACK[answer];
      if (!feedback) return;
      els.quizOptions.forEach(function (option) {
        var value = option.getAttribute('data-quiz-projection');
        option.classList.toggle('is-correct', value === 'smaller' && answer === 'smaller');
        option.classList.toggle('is-wrong', value === answer && answer !== 'smaller');
        option.setAttribute('aria-pressed', String(value === answer));
      });
      els.quizFeedback.textContent = feedback.text;
      els.quizFeedback.classList.toggle('is-correct', feedback.correct);
      els.quizFeedback.classList.toggle('is-wrong', !feedback.correct);
    });
  });

  if (els.btnQuizApply) {
    els.btnQuizApply.addEventListener('click', function () {
      setDistance(11);
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
