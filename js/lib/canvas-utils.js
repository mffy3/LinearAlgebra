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
      baseScale: 1,
      scale: 1,
      zoom: 1,
      center: { x: 0, y: 0 },
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
      view.baseScale = usable / Math.max(0.0001, view.worldSpan);
      view.scale = view.baseScale * view.zoom;
      view.originX = cssW / 2 - view.center.x * view.scale;
      view.originY = cssH / 2 + view.center.y * view.scale;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      return view;
    };

    /**
     * 当前画布四条边对应的世界坐标范围（不含任何 padding）。
     * 平移、缩放、窗口尺寸变化之后都会变，所以每次绘制时现取。
     */
    view.visibleBounds = function () {
      var tl = view.screenToWorld(0, 0);
      var br = view.screenToWorld(view.width, view.height);
      return { minX: tl.x, maxX: br.x, minY: br.y, maxY: tl.y };
    };

    /** 以屏幕坐标 anchor 为锚点缩放；anchor 下的世界点保持不动。 */
    view.setZoom = function (nextZoom, anchor) {
      var z = Math.min(60, Math.max(0.06, Number(nextZoom) || 1));
      if (!anchor) {
        view.zoom = z;
        view.resize();
        return view.zoom;
      }
      var before = view.screenToWorld(anchor.x, anchor.y);
      view.zoom = z;
      view.resize();
      var after = view.screenToWorld(anchor.x, anchor.y);
      view.center.x += before.x - after.x;
      view.center.y += before.y - after.y;
      view.resize();
      return view.zoom;
    };

    /** 按屏幕像素平移画布内容（手指往右拖，内容跟着往右走）。 */
    view.panBy = function (dxScreen, dyScreen) {
      view.center.x -= dxScreen / view.scale;
      view.center.y += dyScreen / view.scale;
      view.resize();
      return view.center;
    };

    view.resetView = function () {
      view.zoom = 1;
      view.center.x = 0;
      view.center.y = 0;
      view.resize();
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
   * 读出 mapPoint 的线性部分。绝大多数展厅传进来的是矩阵映射，
   * 因此这里用三个点就能还原 M = [[ax, bx], [ay, by]] 与偏移量。
   * 不是线性映射（或含非法值）时返回 null，调用方退回固定范围。
   */
  function linearMapInfo(mapPoint) {
    if (typeof mapPoint !== 'function') return null;
    try {
      var o = mapPoint({ x: 0, y: 0 });
      var ex = mapPoint({ x: 1, y: 0 });
      var ey = mapPoint({ x: 0, y: 1 });
      if (!o || !ex || !ey) return null;
      var info = {
        ox: o.x, oy: o.y,
        ax: ex.x - o.x, ay: ex.y - o.y,
        bx: ey.x - o.x, by: ey.y - o.y
      };
      if (!Number.isFinite(info.ox) || !Number.isFinite(info.oy) ||
        !Number.isFinite(info.ax) || !Number.isFinite(info.ay) ||
        !Number.isFinite(info.bx) || !Number.isFinite(info.by)) {
        return null;
      }
      return info;
    } catch (err) {
      return null;
    }
  }

  function isIdentityMap(info) {
    if (!info) return false;
    return Math.abs(info.ox) < 1e-9 && Math.abs(info.oy) < 1e-9 &&
      Math.abs(info.ax - 1) < 1e-9 && Math.abs(info.ay) < 1e-9 &&
      Math.abs(info.bx) < 1e-9 && Math.abs(info.by - 1) < 1e-9;
  }

  /**
   * 求“当前画布”在 mapPoint 反像空间里的世界坐标包围盒。
   *
   * 这样网格就能一直铺到画布四边：平移、缩放、宽屏、手机竖屏都不用改参数。
   * 奇异矩阵（反像无界）退回一个足够大的固定范围。
   */
  function gridBounds(view, mapPoint, fallbackRange) {
    var bounds = view.visibleBounds();
    var info = linearMapInfo(mapPoint);
    var fallback = Math.max(8, Number(fallbackRange) || 10);
    var pad = Math.max(1, Math.abs(bounds.maxX - bounds.minX) * 0.04);

    if (!info || isIdentityMap(info)) {
      return {
        minX: bounds.minX - pad,
        maxX: bounds.maxX + pad,
        minY: bounds.minY - pad,
        maxY: bounds.maxY + pad
      };
    }

    var det = info.ax * info.by - info.ay * info.bx;
    if (Math.abs(det) < 1e-9) {
      return {
        minX: -Math.max(fallback, 48),
        maxX: Math.max(fallback, 48),
        minY: -Math.max(fallback, 48),
        maxY: Math.max(fallback, 48)
      };
    }

    var corners = [
      view.screenToWorld(0, 0),
      view.screenToWorld(view.width, 0),
      view.screenToWorld(view.width, view.height),
      view.screenToWorld(0, view.height)
    ];

    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;

    for (var i = 0; i < corners.length; i++) {
      var px = corners[i].x - info.ox;
      var py = corners[i].y - info.oy;
      var wx = (info.by * px - info.bx * py) / det;
      var wy = (-info.ay * px + info.ax * py) / det;
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy);
      maxY = Math.max(maxY, wy);
    }

    if (!Number.isFinite(minX) || minX === Infinity) {
      return { minX: -fallback, maxX: fallback, minY: -fallback, maxY: fallback };
    }

    return {
      minX: minX - pad,
      maxX: maxX + pad,
      minY: minY - pad,
      maxY: maxY + pad
    };
  }

  /**
   * 让网格线在屏幕上的间距保持在 18–90 px：
   * 缩得很小时自动把 step 变成 2、4、8……，放得很大时变成 0.5、0.25……
   */
  function chooseStep(view, bounds, mapScale) {
    var spanX = Math.abs(bounds.maxX - bounds.minX);
    var spanY = Math.abs(bounds.maxY - bounds.minY);
    var span = Math.max(spanX, spanY, 0.001);
    var factor = view.scale * (mapScale > 0 ? mapScale : 1);
    var step = 1;
    var guard = 0;

    while (factor * step < 18 && guard < 24) {
      step *= 2;
      guard++;
    }
    guard = 0;
    while (factor * step > 96 && guard < 24) {
      step /= 2;
      guard++;
    }
    while (span / step > 320 && guard < 40) {
      step *= 2;
      guard++;
    }
    return step;
  }

  /**
   * 画“被 mapPoint 变换后的网格”。
   *
   * 网格范围不再由 range 写死，而是由画布四边的反像决定，
   * 因此无论窗口多宽、画布多大、是否平移缩放，方格纸都会铺满整个画布。
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} view
   * @param {(p:{x:number,y:number})=>{x:number,y:number}} mapPoint
   * @param {object} options range(兜底) / minor / major / lineWidth / dash / step / adaptive
   */
  function drawGrid(ctx, view, mapPoint, options) {
    var opts = options || {};
    var minorWidth = opts.lineWidth == null ? 1 : opts.lineWidth;
    var majorWidth = opts.majorWidth == null ? 1.25 : opts.majorWidth;
    var pad = 24;

    var bounds = gridBounds(view, mapPoint, opts.range);
    var info = linearMapInfo(mapPoint);
    var mapScale = 1;
    if (info) {
      var mapDet = info.ax * info.by - info.ay * info.bx;
      if (Math.abs(mapDet) > 1e-9) mapScale = Math.sqrt(Math.abs(mapDet));
    }
    var step = opts.step || (opts.adaptive === false ? 1 : chooseStep(view, bounds, mapScale));

    var minorPath = [];
    var majorPath = [];

    function pushLine(value, horizontal) {
      var a;
      var b;
      if (horizontal) {
        a = { x: bounds.minX, y: value };
        b = { x: bounds.maxX, y: value };
      } else {
        a = { x: value, y: bounds.minY };
        b = { x: value, y: bounds.maxY };
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

      var index = Math.round(value / step);
      var target = (index % 5 === 0) ? majorPath : minorPath;
      target.push(clipped);
    }

    var kMin = Math.ceil(bounds.minX / step);
    var kMax = Math.floor(bounds.maxX / step);
    var jMin = Math.ceil(bounds.minY / step);
    var jMax = Math.floor(bounds.maxY / step);

    for (var k = kMin; k <= kMax; k++) {
      if (k === 0) continue; // 坐标轴单独画
      pushLine(k * step, false);
    }
    for (var j = jMin; j <= jMax; j++) {
      if (j === 0) continue;
      pushLine(j * step, true);
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
   *
   * 端点取自画布四边的反像，所以坐标轴同样会一直画到画布边缘；
   * 平移、缩放之后不需要重新算 range。
   */
  function drawAxes(ctx, view, mapPoint, options) {
    var opts = options || {};
    var color = opts.color || PALETTE.axis;
    var width = opts.lineWidth == null ? 1.35 : opts.lineWidth;
    var pad = 24;

    var bounds = gridBounds(view, mapPoint, opts.range);
    var axes = [
      { a: { x: bounds.minX, y: 0 }, b: { x: bounds.maxX, y: 0 } },
      { a: { x: 0, y: bounds.minY }, b: { x: 0, y: bounds.maxY } }
    ];

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    if (opts.dash) ctx.setLineDash(opts.dash);
    ctx.beginPath();

    for (var i = 0; i < axes.length; i++) {
      var a;
      var b;
      try {
        a = mapPoint(axes[i].a);
        b = mapPoint(axes[i].b);
      } catch (err) {
        continue;
      }
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
