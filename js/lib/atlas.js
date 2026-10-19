/**
 * atlas.js · 应用地图筛选
 *
 * 只用 aria-pressed + hidden 做可访问的领域过滤。
 */
(function () {
  'use strict';

  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-domain]'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.atlas-card'));
  var count = document.getElementById('atlas-filter-count');
  var empty = document.getElementById('atlas-empty');

  if (!filters.length || !cards.length) return;

  var LABELS = {
    all: '全部',
    physics: '物理',
    economics: '经济',
    software: '软件',
    hardware: '硬件'
  };

  function apply(domain) {
    var visible = 0;
    cards.forEach(function (card) {
      var show = domain === 'all' || card.getAttribute('data-domain') === domain;
      card.hidden = !show;
      if (show) visible++;
    });

    filters.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-domain') === domain));
    });

    if (count) {
      count.textContent = domain === 'all'
        ? '显示全部 ' + visible + ' 个应用'
        : LABELS[domain] + ' · ' + visible + ' 个应用';
    }
    if (empty) empty.classList.toggle('is-visible', visible === 0);
  }

  filters.forEach(function (button) {
    button.addEventListener('click', function () {
      apply(button.getAttribute('data-domain'));
    });
  });

  var initial = 'all';
  try {
    var domain = new URLSearchParams(window.location.search).get('domain');
    if (LABELS[domain]) initial = domain;
  } catch (error) {
    initial = 'all';
  }
  apply(initial);
})();
