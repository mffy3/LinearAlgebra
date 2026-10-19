/**
 * entry-scene.js · 入口页的 2D / 3D 空间
 *
 * 纯 Canvas 2D 手写透视投影：一张倾斜的平面、第二张平行平面、
 * 三条坐标轴和一组基向量。没有 WebGL、没有依赖。
 *
 * 交互：指针视差、拖拽旋转、选择水平后轻微推近。
 */
(function () {
  'use strict';

  var canvas = document.getElementById('entry-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var state = {
    width: 1,
    height: 1,
    dpr: 1,
    yaw: -0.58,
    pitch: 0.3,
    baseYaw: -0.58,
    targetYaw: -0.58,
    targetPitch: 0.3,
    pointerX: 0,
    pointerY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    dragX: 0,
    level: null,
    levelT: 0,
    raf: null,
    lastTime: 0
  };

  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var COLORS = {
    ink: 'rgba(46, 49, 44, 0.72)',
    faint: 'rgba(46, 49, 44, 0.18)',
    grid: 'rgba(46, 49, 44, 0.085)',
    sage: '#748676',
    clay: '#b07d6e',
    gold: '#bfa36a',
    paper: '#efeae1'
  };

  // 平面的两条基向量：一张倾斜的 2D 平面，嵌在 3D 里。
  var U = { x: 2.9, y: 0, z: 0.7 };
  var V = { x: 0, y: 2.9, z: 1.3 };

  function resize() {
    var rect = canvas.getBoundingClientRect();
    state.width = Math.max(1, Math.round(rect.width));
    state.height = Math.max(1, Math.round(rect.height));
    state.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function project(point) {
    var cy = Math.cos(state.yaw);
    var sy = Math.sin(state.yaw);
    var cp = Math.cos(state.pitch);
    var sp = Math.sin(state.pitch);

    var x1 = cy * point.x + sy * point.y;
    var y1 = -sy * point.x + cy * point.y;
    var z1 = point.z;

    var y2 = cp * y1 - sp * z1;
    var z2 = sp * y1 + cp * z1;

    var depth = z2 + 15;
    var focal = 1500;
    var scale = focal / Math.max(3, depth);
    var cx = state.width * (state.width > 900 ? 0.7 : 0.57);
    var cy0 = state.height * 0.48;

    return {
      x: cx + x1 * scale,
      y: cy0 - y2 * scale,
      scale: scale,
      depth: depth
    };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function normalize(v) {
    var len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  function line(a, b, color, width, dash) {
    var pa = project(a);
    var pb = project(b);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width == null ? 1 : width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.restore();
  }

  function polygon(points, fill, stroke, width, dash) {
    ctx.save();
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach(function (point, index) {
      var p = project(point);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width == null ? 1 : width;
      ctx.stroke();
    }
    ctx.restore();
  }

  function label(point, text, color, dx, dy) {
    var p = project(point);
    ctx.save();
    ctx.font = '500 11px "Cascadia Code", Consolas, monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, p.x + (dx || 0), p.y + (dy || 0));
    ctx.restore();
  }

  function arrow(a, b, color, width, labelText) {
    var pa = project(a);
    var pb = project(b);
    var dx = pb.x - pa.x;
    var dy = pb.y - pa.y;
    var len = Math.hypot(dx, dy);
    if (len < 1) return;

    var ux = dx / len;
    var uy = dy / len;
    var head = Math.min(10, len * 0.22);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width == null ? 2 : width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x - ux * head, pb.y - uy * head);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pb.x, pb.y);
    ctx.lineTo(pb.x - ux * head - uy * head * 0.45, pb.y - uy * head + ux * head * 0.45);
    ctx.lineTo(pb.x - ux * head + uy * head * 0.45, pb.y - uy * head - ux * head * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (labelText) label(b, labelText, color, 12, -12);
  }

  function drawGridPlane(offset, color, alpha, divisions) {
    var n = divisions;
    var extent = 2;
    for (var i = -n; i <= n; i++) {
      var t = (i / n) * extent;
      var p1 = add(scale(U, t), scale(V, -extent));
      var p2 = add(scale(U, t), scale(V, extent));
      var q1 = add(scale(V, t), scale(U, -extent));
      var q2 = add(scale(V, t), scale(U, extent));
      line(add(p1, offset), add(p2, offset), color, 0.8);
      line(add(q1, offset), add(q2, offset), color, 0.8);
    }

    var corners = [
      add(add(scale(U, -extent), scale(V, -extent)), offset),
      add(add(scale(U, extent), scale(V, -extent)), offset),
      add(add(scale(U, extent), scale(V, extent)), offset),
      add(add(scale(U, -extent), scale(V, extent)), offset)
    ];
    polygon(corners, 'rgba(116, 134, 118, ' + alpha + ')', 'rgba(46, 49, 44, 0.22)', 1);
    return corners;
  }

  function drawAxes() {
    line({ x: -6, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, 'rgba(116, 134, 118, 0.55)', 1.3);
    line({ x: 0, y: -6, z: 0 }, { x: 0, y: 6, z: 0 }, 'rgba(176, 125, 110, 0.55)', 1.3);
    line({ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 4.5 }, 'rgba(191, 163, 106, 0.55)', 1.3);

    label({ x: 6.2, y: 0, z: 0 }, 'x', COLORS.sage, 8, 8);
    label({ x: 0, y: 6.2, z: 0 }, 'y', COLORS.clay, 8, 8);
    label({ x: 0, y: 0, z: 4.7 }, 'z', COLORS.gold, 8, -8);
  }

  function drawScene() {
    if (!state.width) return;
    ctx.clearRect(0, 0, state.width, state.height);

    var levelColor = state.level === 'some' ? COLORS.clay :
      state.level === 'learned' ? COLORS.gold : COLORS.sage;
    var levelAlpha = 0.055 + state.levelT * 0.035;

    var normal = normalize(cross(U, V));
    var lift = scale(normal, 2.2);

    // 第二张平面：更远、更淡，用来说明“平面在空间里”。
    var topCorners = drawGridPlane(lift, 'rgba(46, 49, 44, 0.065)', 0.018, 4);
    var baseCorners = drawGridPlane({ x: 0, y: 0, z: 0 }, 'rgba(46, 49, 44, 0.1)', levelAlpha, 4);

    // 连接两张平面的四个角，制造体积感。
    for (var i = 0; i < baseCorners.length; i++) {
      line(baseCorners[i], topCorners[i], 'rgba(46, 49, 44, 0.13)', 1, [4, 5]);
    }

    drawAxes();

    // 平面上的单位方格。
    polygon([
      { x: 0, y: 0, z: 0 },
      U,
      add(U, V),
      V
    ], 'rgba(191, 163, 106, 0.09)', levelColor, 1.4);

    // 两个基方向 + 它们的和。
    arrow({ x: 0, y: 0, z: 0 }, U, COLORS.sage, 2, 'u');
    arrow({ x: 0, y: 0, z: 0 }, V, COLORS.clay, 2, 'v');
    arrow({ x: 0, y: 0, z: 0 }, add(U, V), levelColor, 1.6, 'u + v');

    // 原点。
    var origin = project({ x: 0, y: 0, z: 0 });
    ctx.save();
    ctx.fillStyle = 'rgba(46, 49, 44, 0.8)';
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 一些稀疏的深度点，增加“空间”而不是“平面”的感觉。
    for (var gx = -4; gx <= 4; gx += 2) {
      for (var gy = -4; gy <= 4; gy += 2) {
        var p = project({ x: gx, y: gy, z: 0 });
        ctx.save();
        ctx.fillStyle = 'rgba(46, 49, 44, 0.16)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function tick(time) {
    state.raf = null;
    var dt = state.lastTime ? Math.min(40, time - state.lastTime) : 16;
    state.lastTime = time;

    if (!reducedMotion && !state.dragging) {
      state.baseYaw += dt * 0.000035;
    }

    state.targetYaw = state.baseYaw + state.pointerX * 0.22 + state.dragX;
    state.targetPitch = 0.3 + state.pointerY * 0.12;
    state.yaw += (state.targetYaw - state.yaw) * 0.08;
    state.pitch += (state.targetPitch - state.pitch) * 0.08;
    state.levelT += ((state.level ? 1 : 0) - state.levelT) * 0.06;

    drawScene();
    state.raf = window.requestAnimationFrame(tick);
  }

  function start() {
    if (state.raf == null) {
      state.lastTime = 0;
      state.raf = window.requestAnimationFrame(tick);
    }
  }

  window.addEventListener('pointermove', function (event) {
    state.pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    state.pointerY = event.clientY / Math.max(1, window.innerHeight) - 0.5;
  }, { passive: true });

  canvas.addEventListener('pointerdown', function (event) {
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    canvas.classList.add('is-dragging');
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!state.dragging) return;
    var dx = event.clientX - state.lastX;
    var dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.dragX = Math.max(-0.8, Math.min(0.8, state.dragX + dx * 0.004));
    state.targetPitch = Math.max(-0.1, Math.min(0.7, state.targetPitch + dy * 0.003));
  });

  function endDrag(event) {
    state.dragging = false;
    canvas.classList.remove('is-dragging');
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', function () {
    if (!state.dragging) canvas.classList.remove('is-dragging');
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      resize();
    }).observe(canvas);
  } else {
    window.addEventListener('resize', resize);
  }

  window.EntryScene = {
    setLevel: function (level) {
      state.level = level;
    },
    reset: function () {
      state.level = null;
      state.dragX = 0;
      state.baseYaw = -0.58;
    }
  };

  resize();
  start();
})();
