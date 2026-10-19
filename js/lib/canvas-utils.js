/**
 * canvas-utils.js · Canvas 2D 绘图工具箱
 *
 * 职责边界
 * --------
 * - 这里只处理：DPR、世界坐标 ↔ 屏幕坐标、网格、坐标轴、箭头、
 *   多边形、标签、线段裁剪、缓动。
 * - 这里不写矩阵公式、不读页面状态、不操作输入框。
 *
 * 地图隐喻：math.js 负责“算出城市在哪”，本文件负责“把城市画到纸上”。
 */
(function (global) {
  'use strict';

  var PALETTE = {
    bg: '#faf6ee',
    grid: 'rgba(46, 49, 44, 0.075)',
    gridMajor: 'rgba(46, 49, 44, 0.13)',
    gridGhost: 'rgba(46, 49, 44, 0.035)',
    axis: 'rgba(46, 49, 44, 0.38)',
    axisGhost: 'rgba(46, 49, 44, 0.07)',
    e1: '#748676',
    e2: '#b07d6e',
    square: '#748676',
    squareNegative: '#a45c55',
    circle: '#b78d6e',
    gold: '#bfa36a',
    eigen: '#a45c55',
    danger: '#a45c55',
    warm: '#b07d6e',
    ink: '#2e312c',
    blue: '#77879a',
    text: '#2e312c',
    muted: '#6d7068',
    origin: '#2e312c'
  };

  /* ------------------------------------------------------------------ *
   * 数值与缓动
   * ------------------------------------------------------------------ */

  function clamp01(t) {
    return Math.min(1, Math.max(0, t));
  }

  function easeInOutCubic(t) {
    var x = clamp01(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    var x = clamp01(t);
    return 1 - Math.pow(1 - x, 3);
  }

  function easeInOutQuad(t) {
    var x = clamp01(t);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  /** 把 #rgb / #rrggbb 转成 rgba；已经是颜色字符串则原样返回。 */
  function withAlpha(color, alpha) {
    if (typeof color !== 'string' || color.charAt(0) !== '#') return color;
    var hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    }
    if (hex.length !== 6) return color;
    var r = parseInt(hex.slice(0, 2), 16);
    var g = parseInt(hex.slice(2, 4), 16);
    var b = parseInt(hex.slice(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  /* ------------------------------------------------------------------ *
   * 视口：世界坐标 ↔ 屏幕坐标
   * ------------------------------------------------------------------ */

  function createViewport(canvas, options) {
    var opts = options || {};
    var ctx = canvas.getContext('2d');

    var view = {
      canvas: canvas,
      ctx: ctx,
      width: 1,
      height: 1,
      dpr: 1,
      scale: 1,
      originX: 0,
      originY: 0,
      worldSpan: opts.worldSpan == null ? 12 : opts.worldSpan,
      padding: opts.padding == null ? 28 : opts.padding,
      maxDpr: opts.maxDpr == null ? 2.5 : opts.maxDpr
    };

    view.resize = function () {
      var rect = canvas.getBoundingClientRect();
      var cssW = rect.width || canvas.clientWidth || 1;
      var cssH = rect.height || canvas.clientHeight || 1;
      cssW = Math.max(1, Math.round(cssW));
      cssH = Math.max(1, Math.round(cssH));

      var dpr = Math.min(global.devicePixelRatio || 1, view.maxDpr);
      var pixelW = Math.round(cssW * dpr);
      var pixelH = Math.round(cssH * dpr);

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }

      view.width = cssW;
      view.height = cssH;
      view.dpr = dpr;

      var pad = Math.min(view.padding, Math.min(cssW, cssH) * 0.09);
      var usable = Math.max(1, Math.min(cssW, cssH) - pad * 2);
      view.scale = usable / view.worldSpan;
      view.originX = cssW / 2;
      view.originY = cssH / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      return view;
    };

    view.worldToScreen = function (x, y) {
      if (typeof x === 'object' && x !== null) {
        y = x.y;
        x = x.x;
      }
      return {
        x: view.originX + x * view.scale,
        y: view.originY - y * view.scale
      };
    };

    view.screenToWorld = function (x, y) {
      if (typeof x === 'object' && x !== null) {
        y = x.y;
        x = x.x;
      }
      return {
        x: (x - view.originX) / view.scale,
        y: (view.originY - y) / view.scale
      };
    };

    /** 鼠标/触摸事件 → 画布内 CSS 像素坐标。 */
    view.pointerPosition = function (event) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    };

    view.contains = function (point, margin) {
      var m = margin == null ? 0 : margin;
      return point.x >= -m && point.y >= -m &&
        point.x <= view.width + m && point.y <= view.height + m;
    };

    view.resize();
    return view;
  }

  /* ------------------------------------------------------------------ *
   * 裁剪：把任意长的线段裁到画布内
   * ------------------------------------------------------------------ */

  /**
   * Liang–Barsky 线段裁剪。
   * 返回 { x1, y1, x2, y2 }；完全在框外返回 null。
   */
  function clipSegment(x0, y0, x1, y1, minX, minY, maxX, maxY) {
    if (!Number.isFinite(x0) || !Number.isFinite(y0) ||
      !Number.isFinite(x1) || !Number.isFinite(y1)) {
      return null;
    }

    var dx = x1 - x0;
    var dy = y1 - y0;
    var t0 = 0;
    var t1 = 1;
    var p = [-dx, dx, -dy, dy];
    var q = [x0 - minX, maxX - x0, y0 - minY, maxY - y0];

    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-12) {
        if (q[i] < 0) return null;
      } else {
        var r = q[i] / p[i];
        if (p[i] < 0) {
          if (r > t1) return null;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return null;
          if (r < t1) t1 = r;
        }
      }
    }

    if (t0 > t1) return null;
    return {
      x1: x0 + t0 * dx,
      y1: y0 + t0 * dy,
      x2: x0 + t1 * dx,
      y2: y0 + t1 * dy
    };
  }

  /* ------------------------------------------------------------------ *
   * 背景
   * ------------------------------------------------------------------ */

  function drawBackdrop(ctx, view) {
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, view.width, view.height);

    var cx = view.originX;
    var cy = view.originY;
    var radius = Math.max(view.width, view.height) * 0.78;
    var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(116, 134, 118, 0.05)');
    gradient.addColorStop(0.55, 'rgba(176, 125, 110, 0.02)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * 网格与坐标轴
   * ------------------------------------------------------------------ */

  /**
   * 画“被 mapPoint 变换后的网格”。
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} view
   * @param {(p:{x:number,y:number})=>{x:number,y:number}} mapPoint
   * @param {object} options range / minor / major / lineWidth / dash / skipAxes
   */
  function drawGrid(ctx, view, mapPoint, options) {
    var opts = options || {};
    var range = opts.range == null ? 10 : Math.max(2, Math.round(opts.range));
    var minorWidth = opts.lineWidth == null ? 1 : opts.lineWidth;
    var majorWidth = opts.majorWidth == null ? 1.25 : opts.majorWidth;
    var pad = 24;

    var minorPath = [];
    var majorPath = [];

    function pushLine(k, horizontal) {
      var a;
      var b;
      if (horizontal) {
        a = { x: -range, y: k };
        b = { x: range, y: k };
      } else {
        a = { x: k, y: -range };
        b = { x: k, y: range };
      }

      var pa;
      var pb;
      try {
        pa = mapPoint(a);
        pb = mapPoint(b);
      } catch (err) {
        return;
      }
      if (!pa || !pb || !Number.isFinite(pa.x) || !Number.isFinite(pa.y) ||
        !Number.isFinite(pb.x) || !Number.isFinite(pb.y)) {
        return;
      }

      var sa = view.worldToScreen(pa);
      var sb = view.worldToScreen(pb);
      var clipped = clipSegment(sa.x, sa.y, sb.x, sb.y, -pad, -pad, view.width + pad, view.height + pad);
      if (!clipped) return;

      var target = (k % 5 === 0) ? majorPath : minorPath;
      target.push(clipped);
    }

    for (var k = -range; k <= range; k++) {
      if (k === 0) continue; // 坐标轴单独画
      pushLine(k, true);
      pushLine(k, false);
    }

    function strokePath(segments, color, width) {
      if (!segments.length) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'butt';
      if (opts.dash) ctx.setLineDash(opts.dash);
      ctx.beginPath();
      for (var i = 0; i < segments.length; i++) {
        var s = segments[i];
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
      }
      ctx.stroke();
      ctx.restore();
    }

    strokePath(minorPath, opts.minor || PALETTE.grid, minorWidth);
    strokePath(majorPath, opts.major || PALETTE.gridMajor, majorWidth);
  }

  /**
   * 画被 mapPoint 变换后的两条坐标轴。
   */
  function drawAxes(ctx, view, mapPoint, options) {
    var opts = options || {};
    var range = opts.range == null ? 10 : Math.max(2, Math.round(opts.range));
    var color = opts.color || PALETTE.axis;
    var width = opts.lineWidth == null ? 1.35 : opts.lineWidth;
    var pad = 24;

    var axes = [
      { a: { x: -range, y: 0 }, b: { x: range, y: 0 } },
      { a: { x: 0, y: -range }, b: { x: 0, y: range } }
    ];

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    if (opts.dash) ctx.setLineDash(opts.dash);
    ctx.beginPath();

    for (var i = 0; i < axes.length; i++) {
      var a = mapPoint(axes[i].a);
      var b = mapPoint(axes[i].b);
      if (!a || !b) continue;
      var sa = view.worldToScreen(a);
      var sb = view.worldToScreen(b);
      var clipped = clipSegment(sa.x, sa.y, sb.x, sb.y, -pad, -pad, view.width + pad, view.height + pad);
      if (!clipped) continue;
      ctx.moveTo(clipped.x1, clipped.y1);
      ctx.lineTo(clipped.x2, clipped.y2);
    }

    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * 折线 / 多边形 / 点
   * ------------------------------------------------------------------ */

  function pathWorldPoints(ctx, view, points, closed) {
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      var s = view.worldToScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    if (closed) ctx.closePath();
    return true;
  }

  /**
   * 画多边形（点必须是“已经被矩阵变换过”的世界坐标）。
   */
  function drawWorldPolygon(ctx, view, points, style) {
    if (!points || points.length < 2) return;
    var s = style || {};
    var closed = s.closed !== false;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (s.dash) ctx.setLineDash(s.dash);

    var ok = pathWorldPoints(ctx, view, points, closed);
    if (!ok) {
      ctx.restore();
      return;
    }

    if (s.fill && closed) {
      ctx.fillStyle = s.fill;
      ctx.fill();
    }
    if (s.stroke) {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.lineWidth == null ? 1.5 : s.lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorldLine(ctx, view, a, b, style) {
    if (!a || !b) return;
    var s = style || {};
    var sa = view.worldToScreen(a);
    var sb = view.worldToScreen(b);
    var clipped = clipSegment(sa.x, sa.y, sb.x, sb.y, -20, -20, view.width + 20, view.height + 20);
    if (!clipped) return;

    ctx.save();
    ctx.strokeStyle = s.stroke || PALETTE.muted;
    ctx.lineWidth = s.lineWidth == null ? 1.2 : s.lineWidth;
    ctx.lineCap = s.lineCap || 'round';
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.beginPath();
    ctx.moveTo(clipped.x1, clipped.y1);
    ctx.lineTo(clipped.x2, clipped.y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPointWorld(ctx, view, point, style) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    var s = style || {};
    var p = view.worldToScreen(point);
    if (!view.contains(p, 12)) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, s.radius == null ? 3.5 : s.radius, 0, Math.PI * 2);
    ctx.fillStyle = s.fill || PALETTE.origin;
    ctx.fill();
    if (s.stroke) {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.lineWidth == null ? 1.5 : s.lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * 箭头
   * ------------------------------------------------------------------ */

  /**
   * 从 a 到 b 画箭头（世界坐标）。箭头头部在屏幕空间绘制，不会被矩阵拉变形。
   */
  function drawArrowWorld(ctx, view, a, b, style) {
    if (!a || !b) return;
    var s = style || {};
    var color = s.color || PALETTE.e1;
    var sa = view.worldToScreen(a);
    var sb = view.worldToScreen(b);
    var padded = 30;

    var clipped = clipSegment(sa.x, sa.y, sb.x, sb.y,
      -padded, -padded, view.width + padded, view.height + padded);

    if (clipped) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = s.lineWidth == null ? 2.4 : s.lineWidth;
      ctx.lineCap = 'round';
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.beginPath();
      ctx.moveTo(clipped.x1, clipped.y1);
      ctx.lineTo(clipped.x2, clipped.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 箭头头部：只在尖端接近画布时绘制。
    var tipVisible = sb.x >= -padded && sb.x <= view.width + padded &&
      sb.y >= -padded && sb.y <= view.height + padded;
    if (!tipVisible) return;

    var dx = sb.x - sa.x;
    var dy = sb.y - sa.y;
    var len = Math.hypot(dx, dy);
    if (len < 0.5) return;

    var ux = dx / len;
    var uy = dy / len;
    var head = s.head == null ? 11 : s.head;
    var half = s.headWidth == null ? 5.5 : s.headWidth;

    // 线太短时缩小箭头，避免头部盖住整条线。
    var scale = Math.min(1, len / (head * 1.4));
    head *= scale;
    half *= scale;

    var bx = sb.x - ux * head;
    var by = sb.y - uy * head;
    var nx = -uy;
    var ny = ux;

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sb.x, sb.y);
    ctx.lineTo(bx + nx * half, by + ny * half);
    ctx.lineTo(bx - nx * half, by - ny * half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (s.label) {
      var offset = s.labelOffset || { x: 12, y: -12 };
      drawLabel(ctx, sb.x + offset.x, sb.y + offset.y, s.label, {
        color: s.labelColor || color,
        background: s.labelBackground === false ? null : 'rgba(250, 246, 238, 0.94)',
        border: s.labelBorder === false ? null : withAlpha(color, 0.22),
        font: s.labelFont || '600 13px "Segoe UI", "Microsoft YaHei", sans-serif',
        align: offset.x < 0 ? 'right' : 'left'
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * 文本标签
   * ------------------------------------------------------------------ */

  function roundRectPath(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * 在屏幕坐标画标签，带可选半透明底。
   */
  function drawLabel(ctx, x, y, text, style) {
    if (!text) return;
    var s = style || {};
    var font = s.font || '600 12px "Segoe UI", "Microsoft YaHei", sans-serif';
    var paddingX = s.paddingX == null ? 6 : s.paddingX;
    var paddingY = s.paddingY == null ? 4 : s.paddingY;
    var align = s.align || 'left';
    var baseline = s.baseline || 'middle';

    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;

    var metrics = ctx.measureText(String(text));
    var textW = metrics.width;
    var textH = s.fontSize || 14;

    if (s.background) {
      var boxX = x - paddingX;
      if (align === 'center') boxX = x - textW / 2 - paddingX;
      if (align === 'right') boxX = x - textW - paddingX;
      var boxY = y - textH / 2 - paddingY;
      var boxW = textW + paddingX * 2;
      var boxH = textH + paddingY * 2;

      roundRectPath(ctx, boxX, boxY, boxW, boxH, s.radius == null ? 6 : s.radius);
      ctx.fillStyle = s.background;
      ctx.fill();
      if (s.border) {
        ctx.strokeStyle = s.border;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.fillStyle = s.color || PALETTE.text;
    ctx.fillText(String(text), x, y);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * 命中检测
   * ------------------------------------------------------------------ */

  function hitTestPoint(view, worldPoint, screenPoint, radius) {
    if (!worldPoint) return false;
    var p = view.worldToScreen(worldPoint);
    var r = radius == null ? 14 : radius;
    return Math.hypot(p.x - screenPoint.x, p.y - screenPoint.y) <= r;
  }

  /* ------------------------------------------------------------------ *
   * 导出
   * ------------------------------------------------------------------ */

  var CanvasKit = {
    PALETTE: PALETTE,
    createViewport: createViewport,
    clipSegment: clipSegment,
    drawBackdrop: drawBackdrop,
    drawGrid: drawGrid,
    drawAxes: drawAxes,
    drawWorldPolygon: drawWorldPolygon,
    drawWorldLine: drawWorldLine,
    drawPointWorld: drawPointWorld,
    drawArrowWorld: drawArrowWorld,
    drawLabel: drawLabel,
    hitTestPoint: hitTestPoint,
    withAlpha: withAlpha,
    easeInOutCubic: easeInOutCubic,
    easeOutCubic: easeOutCubic,
    easeInOutQuad: easeInOutQuad,
    clamp01: clamp01
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = CanvasKit;
  }
  if (global) {
    global.CanvasKit = CanvasKit;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
