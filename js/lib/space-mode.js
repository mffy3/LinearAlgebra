/**
 * space-mode.js · 全屏「无限矢量空间」
 *
 * 把一个展厅画布升级成可以点进去的全屏空间：
 *   - 无限网格：底层由 canvas-utils 的视口中心 / 缩放负责，平移不会画到边界；
 *   - 右上角全局地图：显示当前视野在整个平面上的位置，地图右上角是退出键；
 *   - 正下方讲解条：镜像页面右侧的「边做边看」，跟着操作实时更新；
 *   - 电脑端 Esc 退出，手机端双指缩放、单指拖空白处平移。
 *
 * 设计约束
 * --------
 * - 不复制任何数学公式，也不改各展厅的状态；只读写 view 的 center / zoom。
 * - 没有 requestFullscreen 的浏览器（部分 iOS、file:// 预览）自动退化为
 *   固定定位铺满窗口，视觉与交互一致。
 * - 所有 UI 都插在 .canvas-wrap 里，因此和画布一起进入全屏。
 */
(function (global) {
  'use strict';

  if (!global || !global.document) return;

  var clamp = function (value, min, max) {
    return Math.min(max, Math.max(min, value));
  };

  function on(el, type, handler, options) {
    if (el) el.addEventListener(type, handler, options);
  }

  function off(el, type, handler, options) {
    if (el) el.removeEventListener(type, handler, options);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function create(options) {
    var opts = options || {};
    var canvas = opts.canvas || document.getElementById('transform-canvas');
    if (!canvas) return null;

    var view = opts.view;
    if (!view) return null;

    var wrap = opts.wrap || canvas.closest('.canvas-wrap');
    if (!wrap) return null;

    var stage = opts.stage || wrap.closest('.stage-card');
    var redraw = typeof opts.redraw === 'function' ? opts.redraw : function () { };
    var hitTest = typeof opts.hitTest === 'function' ? opts.hitTest : function () { return false; };
    var landmarks = typeof opts.landmarks === 'function' ? opts.landmarks : function () { return []; };
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () { };

    var active = false;
    var closing = false;
    var saved = null;
    var ui = null;
    var mapCanvas = null;
    var mapCtx = null;
    var dockText = null;
    var dockPrompt = null;
    var exitButton = null;
    var launchButton = null;
    var lastMapDraw = 0;
    var rafId = null;
    var hintTimer = null;

    var drag = null;
    var pointers = new Map();
    var pinch = null;

    /* ---------------------------------------------------------------- *
     * DOM
     * ---------------------------------------------------------------- */

    function buildLaunchButton() {
      var actions = stage ? stage.querySelector('.stage-actions') : null;
      if (!actions || actions.querySelector('.space-launch')) return;
      launchButton = el('button', 'btn btn-small btn-ghost space-launch');
      launchButton.type = 'button';
      launchButton.setAttribute('aria-label', '全屏进入无限矢量空间');
      launchButton.innerHTML = '全屏<span class="space-launch-icon" aria-hidden="true">⤢</span>';
      actions.insertBefore(launchButton, actions.firstChild);
      on(launchButton, 'click', function () {
        if (active) exit();
        else enter();
      });
    }

    function buildOverlay() {
      ui = el('div', 'space-ui');
      ui.hidden = true;

      var hint = el('p', 'space-hint', '拖动平移 · 滚轮 / 双指缩放 · Esc 退出');
      hint.setAttribute('aria-hidden', 'true');
      ui.appendChild(hint);

      var map = el('div', 'space-map');
      map.setAttribute('role', 'group');
      map.setAttribute('aria-label', '全局地图与退出全屏');

      mapCanvas = el('canvas', 'space-map-canvas');
      mapCanvas.setAttribute('aria-label', '当前视野在平面上的位置');
      map.appendChild(mapCanvas);

      exitButton = el('button', 'space-exit');
      exitButton.type = 'button';
      exitButton.setAttribute('aria-label', '退出全屏（Esc）');
      exitButton.innerHTML = '<span aria-hidden="true">✕</span>';
      map.appendChild(exitButton);

      var foot = el('div', 'space-map-foot');
      foot.appendChild(el('span', 'space-map-label', '全局地图'));
      var home = el('button', 'space-home', '回到原点');
      home.type = 'button';
      foot.appendChild(home);
      map.appendChild(foot);

      ui.appendChild(map);

      var zoom = el('div', 'space-zoom');
      zoom.setAttribute('role', 'group');
      zoom.setAttribute('aria-label', '缩放');
      var zin = el('button', 'space-zoom-btn', '+');
      zin.type = 'button';
      zin.setAttribute('aria-label', '放大');
      var zout = el('button', 'space-zoom-btn', '−');
      zout.type = 'button';
      zout.setAttribute('aria-label', '缩小');
      zoom.appendChild(zin);
      zoom.appendChild(zout);
      ui.appendChild(zoom);

      var dock = el('div', 'space-dock');
      dock.setAttribute('aria-live', 'polite');
      dock.appendChild(el('span', 'space-dock-seal', 'λ'));
      var dockBody = el('div', 'space-dock-body');
      dockText = el('p', 'space-dock-text', '');
      dockPrompt = el('p', 'space-dock-prompt', '');
      dockBody.appendChild(dockText);
      dockBody.appendChild(dockPrompt);
      dock.appendChild(dockBody);
      ui.appendChild(dock);

      wrap.appendChild(ui);

      on(exitButton, 'click', function () { exit(); });
      on(home, 'click', function () {
        view.center.x = 0;
        view.center.y = 0;
        view.resize();
        commit();
      });
      on(zin, 'click', function () {
        view.setZoom(view.zoom * 1.28, { x: view.width / 2, y: view.height / 2 });
        commit();
      });
      on(zout, 'click', function () {
        view.setZoom(view.zoom / 1.28, { x: view.width / 2, y: view.height / 2 });
        commit();
      });
      on(mapCanvas, 'pointerdown', function (event) {
        var rect = mapCanvas.getBoundingClientRect();
        var extent = mapExtent();
        var nx = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
        var ny = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
        view.center.x = nx * extent * 2;
        view.center.y = -ny * extent * 2;
        view.resize();
        commit();
      });
    }

    /* ---------------------------------------------------------------- *
     * 视野
     * ---------------------------------------------------------------- */

    function commit() {
      redraw();
      markMapDirty();
      onChange(view);
    }

    function fitSpaceView() {
      var pad = Math.min(view.padding, Math.min(view.width, view.height) * 0.09);
      var usable = Math.max(1, Math.min(view.width, view.height) - pad * 2);
      var desiredSpan = clamp(view.worldSpan * 1.35, 10, 18);
      var baseScale = usable / Math.max(0.0001, view.worldSpan);
      var desiredScale = usable / desiredSpan;
      view.center.x = 0;
      view.center.y = 0;
      view.zoom = clamp(desiredScale / baseScale, 0.2, 1.6);
      view.resize();
      commit();
    }

    /* ---------------------------------------------------------------- *
     * 全局地图
     * ---------------------------------------------------------------- */

    var mapDirty = true;

    function markMapDirty() {
      mapDirty = true;
    }

    function mapExtent() {
      var bounds = view.visibleBounds();
      var halfW = Math.abs(bounds.maxX - bounds.minX) / 2;
      var halfH = Math.abs(bounds.maxY - bounds.minY) / 2;
      var diagonal = Math.hypot(halfW, halfH);
      // 视野框只占地图的一半左右，剩下的留白才看得出“自己在整个平面的哪里”。
      var radius = Math.max(12, diagonal * 1.5);
      var marks = landmarks() || [];
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
        radius = Math.max(radius, Math.hypot(m.x, m.y) * 1.26);
      }
      radius = Math.max(
        radius,
        Math.abs(view.center.x) + halfW * 1.05,
        Math.abs(view.center.y) + halfH * 1.05
      );
      return clamp(radius, 6, 400);
    }

    function niceMapStep(extent, pixels) {
      var target = (extent * 2) / 5;
      var pow = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));
      var norm = target / pow;
      var step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
      return step * pow;
    }

    function drawMinimap() {
      if (!mapCanvas || ui.hidden) return;
      var cssW = mapCanvas.clientWidth || 168;
      var cssH = mapCanvas.clientHeight || 168;
      if (cssW < 4 || cssH < 4) return;

      var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      var pixelW = Math.round(cssW * dpr);
      var pixelH = Math.round(cssH * dpr);
      if (mapCanvas.width !== pixelW || mapCanvas.height !== pixelH) {
        mapCanvas.width = pixelW;
        mapCanvas.height = pixelH;
      }
      if (!mapCtx) mapCtx = mapCanvas.getContext('2d');
      var ctx = mapCtx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var extent = mapExtent();
      var scale = Math.min(cssW, cssH) / (extent * 2);
      var cx = cssW / 2;
      var cy = cssH / 2;

      function toMap(x, y) {
        return { x: cx + x * scale, y: cy - y * scale };
      }

      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = '#f7f2e8';
      ctx.fillRect(0, 0, cssW, cssH);

      // 粗略网格：让“地图”有底图感，但不要抢视线。
      var step = niceMapStep(extent, cssW);
      ctx.strokeStyle = 'rgba(46, 49, 44, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = -Math.ceil(extent / step); gx <= Math.ceil(extent / step); gx++) {
        var px = cx + gx * step * scale;
        if (px < 0 || px > cssW) continue;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, cssH);
      }
      for (var gy = -Math.ceil(extent / step); gy <= Math.ceil(extent / step); gy++) {
        var py = cy + gy * step * scale;
        if (py < 0 || py > cssH) continue;
        ctx.moveTo(0, py);
        ctx.lineTo(cssW, py);
      }
      ctx.stroke();

      // 坐标轴
      var origin = toMap(0, 0);
      ctx.strokeStyle = 'rgba(46, 49, 44, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(cssW, origin.y);
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, cssH);
      ctx.stroke();

      // 视野框
      var bounds = view.visibleBounds();
      var tl = toMap(bounds.minX, bounds.maxY);
      var br = toMap(bounds.maxX, bounds.minY);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cssW, cssH);
      ctx.clip();
      ctx.fillStyle = 'rgba(116, 134, 118, 0.13)';
      ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      ctx.strokeStyle = 'rgba(85, 102, 87, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, Math.max(1, br.x - tl.x - 1), Math.max(1, br.y - tl.y - 1));
      ctx.restore();

      // 地标：向量、目标点等
      var marks = landmarks() || [];
      for (var i = 0; i < marks.length; i++) {
        var mark = marks[i];
        if (!mark || !Number.isFinite(mark.x) || !Number.isFinite(mark.y)) continue;
        var mp = toMap(mark.x, mark.y);
        if (mp.x < -4 || mp.y < -4 || mp.x > cssW + 4 || mp.y > cssH + 4) continue;
        ctx.beginPath();
        ctx.arc(mp.x, mp.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = mark.color || '#2e312c';
        ctx.fill();
        ctx.strokeStyle = 'rgba(250, 246, 238, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 原点
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(46, 49, 44, 0.55)';
      ctx.fill();
    }

    function tick() {
      rafId = null;
      if (!active) return;
      var now = Date.now();
      if (mapDirty || now - lastMapDraw > 120) {
        drawMinimap();
        mapDirty = false;
        lastMapDraw = now;
      }
      rafId = global.requestAnimationFrame(tick);
    }

    /* ---------------------------------------------------------------- *
     * 讲解条
     * ---------------------------------------------------------------- */

    function syncDock() {
      if (!dockText) return;
      var source = document.getElementById('professor-text');
      var promptSource = document.getElementById('professor-prompt');
      var text = source ? source.textContent.trim() : '';
      var prompt = promptSource ? promptSource.textContent.trim() : '';
      if (!text) text = '拖动画面，看看这个平面能延伸多远。';
      if (dockText.textContent !== text) dockText.textContent = text;
      if (dockPrompt.textContent !== prompt) dockPrompt.textContent = prompt;
      dockPrompt.classList.toggle('is-empty', !prompt);
    }

    var dockObserver = null;

    function watchDock() {
      if (dockObserver || typeof global.MutationObserver !== 'function') return;
      var source = document.getElementById('professor-text');
      var promptSource = document.getElementById('professor-prompt');
      dockObserver = new global.MutationObserver(syncDock);
      if (source) dockObserver.observe(source, { childList: true, characterData: true, subtree: true });
      if (promptSource) dockObserver.observe(promptSource, { childList: true, characterData: true, subtree: true });
    }

    /* ---------------------------------------------------------------- *
     * 进入 / 退出
     * ---------------------------------------------------------------- */

    function isNativeFullscreen() {
      return document.fullscreenElement === wrap ||
        document.webkitFullscreenElement === wrap;
    }

    function requestNative() {
      var fn = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
      if (typeof fn !== 'function') return;
      try {
        var result = fn.call(wrap, { navigationUI: 'hide' });
        if (result && typeof result.catch === 'function') result.catch(function () { });
      } catch (err) {
        // 不支持或用户拒绝：固定定位的兜底样式已经在生效。
      }
    }

    function exitNative() {
      if (!isNativeFullscreen()) return;
      var fn = document.exitFullscreen || document.webkitExitFullscreen;
      if (typeof fn !== 'function') return;
      try {
        var result = fn.call(document);
        if (result && typeof result.catch === 'function') result.catch(function () { });
      } catch (err) {
        // 忽略：退出失败时交给 Esc / 全屏按钮。
      }
    }

    function enter() {
      if (active) return;
      active = true;
      closing = false;

      saved = {
        zoom: view.zoom,
        cx: view.center.x,
        cy: view.center.y,
        stageMinHeight: stage ? stage.style.minHeight : ''
      };

      // 画布改成 fixed 之后会脱离文档流；先给 stage 占住原来的高度，
      // 退出时再还原，页面就不会因为进入全屏而上下跳。
      if (stage) {
        stage.style.minHeight = Math.round(wrap.getBoundingClientRect().height) + 'px';
      }

      document.body.classList.add('space-open');
      wrap.classList.add('space-open');
      ui.hidden = false;
      if (launchButton) {
        launchButton.setAttribute('aria-expanded', 'true');
        launchButton.textContent = '退出全屏';
      }
      syncDock();
      watchDock();

      requestNative();

      // 等浏览器完成全屏布局，再按新尺寸定初始缩放。
      global.requestAnimationFrame(function () {
        if (!active) return;
        fitSpaceView();
        drawMinimap();
        if (!rafId) rafId = global.requestAnimationFrame(tick);
        var hint = ui.querySelector('.space-hint');
        if (hint) {
          hint.classList.add('is-visible');
          if (hintTimer) global.clearTimeout(hintTimer);
          hintTimer = global.setTimeout(function () {
            hint.classList.remove('is-visible');
          }, 5200);
        }
      });

      bindGlobalEvents(true);
      if (exitButton) {
        try { exitButton.focus({ preventScroll: true }); } catch (err) { exitButton.focus(); }
      }
    }

    function exit() {
      if (!active || closing) return;
      closing = true;

      document.body.classList.remove('space-open');
      wrap.classList.remove('space-open');
      ui.hidden = true;
      if (launchButton) {
        launchButton.setAttribute('aria-expanded', 'false');
        launchButton.textContent = '全屏';
      }

      if (saved) {
        view.zoom = saved.zoom;
        view.center.x = saved.cx;
        view.center.y = saved.cy;
        if (stage) stage.style.minHeight = saved.stageMinHeight || '';
      }
      view.resize();
      redraw();

      if (rafId) {
        global.cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (hintTimer) {
        global.clearTimeout(hintTimer);
        hintTimer = null;
      }
      drag = null;
      pinch = null;
      pointers.clear();

      bindGlobalEvents(false);
      exitNative();

      active = false;
      closing = false;
      if (launchButton && typeof launchButton.focus === 'function') {
        try { launchButton.focus({ preventScroll: true }); } catch (err) { launchButton.focus(); }
      }
    }

    /* ---------------------------------------------------------------- *
     * 交互：平移、缩放、键盘
     * ---------------------------------------------------------------- */

    function pointerDistance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function onPointerDown(event) {
      if (!active) return;
      if (event.button != null && event.button !== 0) return;
      var target = event.target;
      if (target && target.closest && target.closest('.space-map, .space-zoom, .space-dock')) return;
      if (target !== canvas) return;

      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 1) {
        var handled = false;
        try { handled = !!hitTest(event); } catch (err) { handled = false; }
        if (handled) {
          pointers.clear();
          return;
        }
        drag = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          moved: false
        };
        // 只有确定是平移时才拦截，避免抢走展厅自己的拖动。
        event.stopPropagation();
        event.preventDefault();
        wrap.classList.add('is-panning');
      } else if (pointers.size === 2) {
        drag = null;
        var pts = Array.from(pointers.values());
        pinch = {
          distance: pointerDistance(pts[0], pts[1]),
          zoom: view.zoom,
          midX: (pts[0].x + pts[1].x) / 2,
          midY: (pts[0].y + pts[1].y) / 2
        };
        event.stopPropagation();
        event.preventDefault();
      }
    }

    function onPointerMove(event) {
      if (!active) return;

      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (pinch && pointers.size >= 2) {
        var pts = Array.from(pointers.values());
        var dist = pointerDistance(pts[0], pts[1]);
        var midX = (pts[0].x + pts[1].x) / 2;
        var midY = (pts[0].y + pts[1].y) / 2;
        if (pinch.distance > 4) {
          view.setZoom(pinch.zoom * (dist / pinch.distance), { x: midX, y: midY });
        }
        view.panBy(midX - pinch.midX, midY - pinch.midY);
        pinch.midX = midX;
        pinch.midY = midY;
        commit();
        event.preventDefault();
        return;
      }

      if (!drag || drag.id !== event.pointerId) return;

      var dx = event.clientX - drag.lastX;
      var dy = event.clientY - drag.lastY;
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return;
        drag.moved = true;
        canvas.classList.add('is-panning');
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      view.panBy(dx, dy);
      commit();
      event.preventDefault();
    }

    function onPointerUp(event) {
      if (pointers.has(event.pointerId)) pointers.delete(event.pointerId);
      if (drag && drag.id === event.pointerId) {
        drag = null;
        wrap.classList.remove('is-panning');
        canvas.classList.remove('is-panning');
      }
      if (pointers.size < 2) pinch = null;
    }

    function onWheel(event) {
      if (!active) return;
      event.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var factor = Math.exp(-event.deltaY * 0.0016);
      view.setZoom(view.zoom * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      });
      commit();
    }
    function onKeyDown(event) {
      if (!active) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        exit();
        return;
      }
      if (event.key === '+' || event.key === '=') {
        view.setZoom(view.zoom * 1.2, { x: view.width / 2, y: view.height / 2 });
        commit();
        event.preventDefault();
      } else if (event.key === '-' || event.key === '_') {
        view.setZoom(view.zoom / 1.2, { x: view.width / 2, y: view.height / 2 });
        commit();
        event.preventDefault();
      } else if (event.key === '0') {
        view.center.x = 0;
        view.center.y = 0;
        view.resize();
        commit();
        event.preventDefault();
      }
    }

    function onFullscreenChange() {
      if (active && !isNativeFullscreen() && !closing) {
        // 用户按了浏览器自己的 Esc：同步收起 UI。
        exit();
      }
    }

    function bindGlobalEvents(binding) {
      if (binding) {
        on(wrap, 'pointerdown', onPointerDown, true);
        on(global, 'pointermove', onPointerMove, true);
        on(global, 'pointerup', onPointerUp, true);
        on(global, 'pointercancel', onPointerUp, true);
        on(wrap, 'wheel', onWheel, { passive: false });
        on(document, 'keydown', onKeyDown);
        on(document, 'fullscreenchange', onFullscreenChange);
        on(document, 'webkitfullscreenchange', onFullscreenChange);
      } else {
        off(wrap, 'pointerdown', onPointerDown, true);
        off(global, 'pointermove', onPointerMove, true);
        off(global, 'pointerup', onPointerUp, true);
        off(global, 'pointercancel', onPointerUp, true);
        off(wrap, 'wheel', onWheel, { passive: false });
        off(document, 'keydown', onKeyDown);
        off(document, 'fullscreenchange', onFullscreenChange);
        off(document, 'webkitfullscreenchange', onFullscreenChange);
      }
    }

    /* ---------------------------------------------------------------- *
     * 启动
     * ---------------------------------------------------------------- */

    buildLaunchButton();
    buildOverlay();
    onChange(view);

    return {
      enter: enter,
      exit: exit,
      isActive: function () { return active; },
      refresh: function () { syncDock(); markMapDirty(); },
      destroy: function () { exit(); if (ui && ui.parentNode) ui.parentNode.removeChild(ui); }
    };
  }

  var LinearSpace = {
    attach: function (options) {
      try {
        return create(options);
      } catch (err) {
        console.error('[space-mode] 初始化失败：', err);
        return null;
      }
    }
  };

  global.LinearSpace = LinearSpace;
  if (typeof module === 'object' && module.exports) {
    module.exports = LinearSpace;
  }
})(typeof window !== 'undefined' ? window : null);
