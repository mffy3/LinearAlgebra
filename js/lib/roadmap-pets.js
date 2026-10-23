/**
 * roadmap-pets.js · 路线图上的宠物与小屋
 *
 * 只画形状，不管交互与存储：
 *   RoadmapPets.kinds     可选种类（含中文名与 emoji）
 *   RoadmapPets.draw(g, kind, x, y, scale)  在 SVG 组里画一个，坐标以 (x,y) 为中心
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var KINDS = [
    { id: 'cat', name: '猫', emoji: '🐱' },
    { id: 'dog', name: '狗', emoji: '🐶' },
    { id: 'lion', name: '狮子', emoji: '🦁' },
    { id: 'tiger', name: '老虎', emoji: '🐯' },
    { id: 'spider', name: '蜘蛛', emoji: '🕷️' },
    { id: 'dino', name: '恐龙', emoji: '🦖' },
    { id: 'house', name: '小屋', emoji: '🏠' }
  ];

  function el(tag, attrs, parent) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function body(g, fill) {
    el('ellipse', { cx: 0, cy: 6, rx: 12, ry: 9, class: 'pet-body', fill: fill }, g);
  }

  function eyes(g, cx, cy) {
    el('circle', { cx: cx - 3, cy: cy, r: 1.2, class: 'pet-eye' }, g);
    el('circle', { cx: cx + 3, cy: cy, r: 1.2, class: 'pet-eye' }, g);
  }

  function cat(g, color) {
    body(g, color);
    el('circle', { cx: 10, cy: -6, r: 8, class: 'pet-head', fill: color }, g);
    el('path', { d: 'M 4 -12 L 6 -19 L 11 -13 Z', class: 'pet-ear', fill: color }, g);
    el('path', { d: 'M 14 -12 L 16 -19 L 20 -13 Z', class: 'pet-ear', fill: color }, g);
    eyes(g, 10, -7);
    el('path', { d: 'M -11 2 C -22 -2, -23 11, -14 12', class: 'pet-tail' }, g);
  }

  function dog(g, color) {
    body(g, color);
    el('circle', { cx: 9, cy: -6, r: 8, class: 'pet-head', fill: color }, g);
    el('ellipse', { cx: 2, cy: -5, rx: 3, ry: 6, class: 'pet-ear', fill: color }, g);
    el('ellipse', { cx: 16, cy: -5, rx: 3, ry: 6, class: 'pet-ear', fill: color }, g);
    eyes(g, 9, -8);
    el('path', { d: 'M -11 2 C -21 0, -22 10, -14 12', class: 'pet-tail' }, g);
  }

  function lion(g, color) {
    el('circle', { cx: 10, cy: -6, r: 11, class: 'pet-mane', fill: color, opacity: '0.45' }, g);
    body(g, color);
    el('circle', { cx: 10, cy: -6, r: 8, class: 'pet-head', fill: color }, g);
    eyes(g, 10, -7);
  }

  function tiger(g, color) {
    body(g, color);
    for (var i = -1; i <= 1; i++) {
      el('path', { d: 'M ' + (i * 5) + ' 0 L ' + (i * 5) + ' 8', class: 'pet-stripe' }, g);
    }
    el('circle', { cx: 10, cy: -6, r: 8, class: 'pet-head', fill: color }, g);
    el('path', { d: 'M 5 -12 L 6 -17 L 9 -13 Z', class: 'pet-ear', fill: color }, g);
    el('path', { d: 'M 12 -12 L 14 -17 L 16 -13 Z', class: 'pet-ear', fill: color }, g);
    eyes(g, 10, -7);
  }

  function spider(g, color) {
    el('circle', { cx: 0, cy: 0, r: 9, class: 'pet-body', fill: color }, g);
    el('circle', { cx: 0, cy: -10, r: 6, class: 'pet-head', fill: color }, g);
    for (var i = 0; i < 4; i++) {
      var y = -4 + i * 4;
      el('path', { d: 'M -8 ' + y + ' L -18 ' + (y - 6), class: 'pet-leg' }, g);
      el('path', { d: 'M 8 ' + y + ' L 18 ' + (y - 6), class: 'pet-leg' }, g);
    }
    eyes(g, 0, -11);
  }

  function dino(g, color) {
    el('ellipse', { cx: 0, cy: 4, rx: 13, ry: 8, class: 'pet-body', fill: color }, g);
    el('path', { d: 'M 6 -2 C 8 -12, 14 -14, 16 -8', class: 'pet-neck' }, g);
    el('circle', { cx: 17, cy: -10, r: 6, class: 'pet-head', fill: color }, g);
    el('path', { d: 'M -12 2 C -20 8, -14 16, -6 14', class: 'pet-tail' }, g);
    el('path', { d: 'M -4 -4 L 0 -9 L 4 -4', class: 'pet-spike', fill: color }, g);
    eyes(g, 19, -11);
  }

  function house(g, color) {
    el('rect', { x: -12, y: -2, width: 24, height: 18, rx: 2, class: 'house-wall', fill: '#f6f1e7', stroke: color }, g);
    el('path', { d: 'M -16 -2 L 0 -16 L 16 -2 Z', class: 'house-roof', fill: color }, g);
    el('rect', { x: -3, y: 6, width: 6, height: 10, rx: 1, class: 'house-door', fill: color }, g);
  }

  var DRAW = { cat: cat, dog: dog, lion: lion, tiger: tiger, spider: spider, dino: dino, house: house };

  var COLORS = {
    cat: '#b08968', dog: '#a98f6f', lion: '#c2a05f', tiger: '#c08a5a',
    spider: '#7c7f86', dino: '#7e8c6e', house: '#a98f6f'
  };

  function draw(parent, kind, x, y, scale) {
    var drawFn = DRAW[kind] || DRAW.cat;
    var g = el('g', {
      class: 'decor-item decor-' + kind,
      transform: 'translate(' + x + ',' + y + ') scale(' + (scale || 1) + ')'
    }, parent);
    drawFn(g, COLORS[kind] || COLORS.cat);
    return g;
  }

  window.RoadmapPets = { kinds: KINDS, draw: draw, color: function (kind) { return COLORS[kind] || COLORS.cat; } };
})();
