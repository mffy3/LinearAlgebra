/**
 * chapter-globe.js · 可拖动的章节“地球仪”
 *
 * 四个章节图标沿一个透视椭圆轨道排布。拖动图标区域会旋转轨道，
 * 越靠近前方的图标越大、越清晰；指针悬停时图标单独放大。
 *
 * 这是一个纯展示组件：不读数学状态，不依赖任何外部库。
 */
(function () {
  'use strict';

  var globe = document.getElementById('chapter-globe');
  if (!globe) return;

  var items = Array.prototype.slice.call(globe.querySelectorAll('.globe-item'));
  if (!items.length) return;

  var rotation = 0;
  var targetRotation = 0;
  var rafId = null;
  var dragging = false;
  var suppressClick = false;
  var pointerId = null;
  var startX = 0;
  var startRotation = 0;
  var moved = 0;

  function layout() {
    var width = globe.clientWidth;
    var height = globe.clientHeight;
    if (!width || !height) return;

    var rx = Math.max(84, width * 0.33);
    var ry = Math.max(66, height * 0.29);

    items.forEach(function (item, index) {
      var angle = Math.PI / 2 + index * (Math.PI / 2) + rotation;
      var x = Math.cos(angle) * rx;
      var y = Math.sin(angle) * ry;
      var depth = (Math.sin(angle) + 1) / 2; // 1 = 前方，0 = 后方
      var scale = 0.74 + 0.34 * depth;

      item.style.transform =
        'translate(-50%, -50%) translate(' + x.toFixed(2) + 'px, ' + y.toFixed(2) + 'px) scale(' + scale.toFixed(3) + ')';
      item.style.opacity = (0.55 + 0.45 * depth).toFixed(3);
      item.style.zIndex = String(10 + Math.round(depth * 100));
    });
  }

  function animate() {
    rafId = null;
    var delta = targetRotation - rotation;
    if (Math.abs(delta) < 0.0005) {
      rotation = targetRotation;
      layout();
      return;
    }
    rotation += delta * 0.16;
    layout();
    rafId = window.requestAnimationFrame(animate);
  }

  function requestFrame() {
    if (rafId == null) rafId = window.requestAnimationFrame(animate);
  }

  globe.addEventListener('pointerdown', function (event) {
    if (event.button != null && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startRotation = targetRotation;
    moved = 0;
    dragging = false;
    globe.classList.add('is-grabbing');
    try {
      if (globe.setPointerCapture) globe.setPointerCapture(pointerId);
    } catch (error) {
      // 合成事件或已释放的指针，不影响真实拖动。
    }
  });

  globe.addEventListener('pointermove', function (event) {
    if (pointerId == null || event.pointerId !== pointerId) return;

    var dx = event.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));

    if (Math.abs(dx) > 4) {
      dragging = true;
      event.preventDefault();
      targetRotation = startRotation + dx * 0.011;
      requestFrame();
    }
  });

  function endDrag(event) {
    if (pointerId == null) return;
    try {
      if (event && globe.hasPointerCapture && globe.hasPointerCapture(pointerId)) {
        globe.releasePointerCapture(pointerId);
      }
    } catch (error) {
      // 指针已经释放时忽略。
    }
    pointerId = null;
    globe.classList.remove('is-grabbing');
    if (dragging) {
      suppressClick = true;
      window.setTimeout(function () {
        suppressClick = false;
      }, 60);
    }
    dragging = false;
  }

  globe.addEventListener('pointerup', endDrag);
  globe.addEventListener('pointercancel', endDrag);
  globe.addEventListener('pointerleave', function () {
    if (pointerId == null) globe.classList.remove('is-grabbing');
  });

  globe.addEventListener('click', function (event) {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
      return;
    }
    // 没有拖动时，把点击交给普通链接。
  }, true);

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      layout();
    }).observe(globe);
  } else {
    window.addEventListener('resize', layout);
  }

  layout();
})();
