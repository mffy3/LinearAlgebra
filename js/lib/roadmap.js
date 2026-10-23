/**
 * roadmap.js · 学习路线图（地图海报）
 *
 * 画一张 1600×1000 的地图：六个章节站 + 七个应用区 + 城市街区。
 * 进度只影响站点描边；宠物与小屋是登录用户自己放的装饰，不看成绩。
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var data = window.LinearRoadmap;
  var pets = window.RoadmapPets;
  var account = window.LinearAccount;

  var svg = document.getElementById('map-svg');
  var panel = document.getElementById('map-panel');
  var panelBody = document.getElementById('map-panel-body');
  var panelClose = document.getElementById('map-panel-close');
  var petCard = document.getElementById('map-pet');
  var hint = document.getElementById('map-hint');
  var saveState = document.getElementById('map-save');

  var state = {
    progress: {},
    user: null,
    online: false,
    decor: [],
    decorKind: null,
    decorOn: false,
    saveTimer: null,
    saving: false
  };

  /* ------------------------------------------------------------------ *
   * SVG 小工具
   * ------------------------------------------------------------------ */

  function node(tag, attrs, parent) {
    var element = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      element.setAttribute(key, attrs[key]);
    });
    if (parent) parent.appendChild(element);
    return element;
  }

  function text(parent, x, y, content, className, anchor) {
    var element = node('text', { x: x, y: y, class: className || '' }, parent);
    if (anchor) element.setAttribute('text-anchor', anchor);
    element.textContent = content;
    return element;
  }

  function pointFromEvent(event) {
    var pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    var matrix = svg.getScreenCTM();
    if (!matrix) return { x: 800, y: 500 };
    var point = pt.matrixTransform(matrix.inverse());
    return { x: Math.max(20, Math.min(1580, point.x)), y: Math.max(20, Math.min(980, point.y)) };
  }

  /* ------------------------------------------------------------------ *
   * 路线与背景
   * ------------------------------------------------------------------ */

  function routePoints() {
    var points = data.chapters.map(function (chapter) { return [chapter.x, chapter.y]; });
    data.districts.forEach(function (district) {
      points.push([district.x, district.y - 6]);
    });
    return points;
  }

  function smoothPath(points) {
    if (points.length < 2) return '';
    var d = 'M ' + points[0][0] + ' ' + points[0][1];
    for (var i = 0; i < points.length - 1; i++) {
      var p0 = points[i - 1] || points[i];
      var p1 = points[i];
      var p2 = points[i + 1];
      var p3 = points[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6;
      var c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6;
      var c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + p2[0] + ' ' + p2[1];
    }
    return d;
  }

  function drawCity(parent) {
    var g = node('g', { class: 'map-city' }, parent);

    var blocks = [
      [618, 78, 92, 44], [726, 100, 64, 30], [980, 76, 108, 48], [1104, 106, 56, 32],
      [616, 588, 78, 38], [708, 610, 56, 28], [900, 588, 88, 42], [1002, 612, 64, 26],
      [250, 540, 66, 32], [342, 560, 48, 24], [1358, 372, 70, 34], [1440, 396, 52, 26]
    ];
    blocks.forEach(function (box) {
      node('rect', { x: box[0], y: box[1], width: box[2], height: box[3], rx: 6, class: 'map-block' }, g);
    });

    // 星形广场 + 放射街道
    var plaza = node('g', { class: 'map-plaza', transform: 'translate(1390, 288)' }, g);
    node('circle', { r: 13, class: 'plaza-core' }, plaza);
    for (var i = 0; i < 8; i++) {
      var angle = (Math.PI / 4) * i;
      var x1 = Math.cos(angle) * 20;
      var y1 = Math.sin(angle) * 20;
      var x2 = Math.cos(angle) * 62;
      var y2 = Math.sin(angle) * 62;
      node('line', { x1: x1, y1: y1, x2: x2, y2: y2, class: 'plaza-street' }, plaza);
      node('rect', {
        x: x2 - 5, y: y2 - 4, width: 10, height: 8, rx: 2, class: 'plaza-block',
        transform: 'rotate(' + (i * 45) + ' ' + x2 + ' ' + y2 + ')'
      }, plaza);
    }
  }

  function drawBackground() {
    var g = node('g', { class: 'map-bg' }, svg);

    node('rect', { x: 0, y: 0, width: 1600, height: 1000, class: 'map-paper' }, g);
    drawCity(g);

    for (var i = 0; i < 7; i++) {
      var y = 120 + i * 130;
      node('path', {
        d: 'M -40 ' + y + ' C 300 ' + (y - 40) + ', 700 ' + (y + 50) + ', 1640 ' + (y - 10),
        class: 'map-contour'
      }, g);
    }

    node('path', {
      d: 'M -20 600 C 260 540, 520 660, 800 600 C 1060 545, 1280 640, 1620 570',
      class: 'map-river'
    }, g);
    node('path', {
      d: 'M -20 600 C 260 540, 520 660, 800 600 C 1060 545, 1280 640, 1620 570',
      class: 'map-river-line'
    }, g);

    text(g, 60, 940, '比例尺 —— 一格 = 一个知识点', 'map-scale');
    node('line', { x1: 60, y1: 952, x2: 220, y2: 952, class: 'map-scale-line' }, g);
    node('line', { x1: 60, y1: 946, x2: 60, y2: 958, class: 'map-scale-line' }, g);
    node('line', { x1: 220, y1: 946, x2: 220, y2: 958, class: 'map-scale-line' }, g);

    drawCompass(g);
    drawCartouche(g);
  }

  function drawCompass(parent) {
    var g = node('g', { class: 'map-compass', transform: 'translate(1532, 116)' }, parent);
    node('circle', { r: 30, class: 'compass-ring' }, g);
    node('path', { d: 'M 0 -22 L 7 5 L 0 0 L -7 5 Z', class: 'compass-needle' }, g);
    text(g, 0, -40, 'N', 'compass-label', 'middle');
  }

  function drawCartouche(parent) {
    var g = node('g', { class: 'map-title' }, parent);
    node('rect', { x: 56, y: 48, width: 540, height: 118, rx: 18, class: 'title-box' }, g);
    text(g, 84, 96, data.copy.title, 'title-main');
    text(g, 84, 124, data.copy.subtitle.slice(0, 18), 'title-sub');
    if (data.copy.subtitle.length > 18) {
      text(g, 84, 144, data.copy.subtitle.slice(18), 'title-sub');
    }
  }

  function drawRoute() {
    var g = node('g', { class: 'map-route' }, svg);
    var d = smoothPath(routePoints());
    node('path', { d: d, class: 'route-shadow' }, g);
    node('path', { d: d, class: 'route-line' }, g);
  }

  /* ------------------------------------------------------------------ *
   * 站点
   * ------------------------------------------------------------------ */

  function statusOf(id) {
    return state.progress[id] || 'new';
  }

  function statusLabel(status) {
    return { new: '未开始', visited: '已访问', practiced: '已练习', tested: '已测试' }[status] || '未开始';
  }

  function drawStations() {
    data.chapters.forEach(function (chapter) {
      var status = statusOf(chapter.id);
      var g = node('g', {
        class: 'station station-' + status,
        transform: 'translate(' + chapter.x + ',' + chapter.y + ')',
        tabindex: '0',
        role: 'button',
        'aria-label': chapter.num + ' ' + chapter.title + '，' + statusLabel(status)
      }, svg);
      g.dataset.kind = 'chapter';
      g.dataset.id = chapter.id;
      g.style.setProperty('--station-color', chapter.color);

      node('circle', { r: 46, class: 'station-halo' }, g);
      node('circle', { r: 30, class: 'station-ring' }, g);
      text(g, 0, 5, chapter.num, 'station-num', 'middle');

      var chips = node('g', { class: 'station-chips', transform: 'translate(0, 58)' }, g);
      drawChip(chips, -38, '练习', 'practice.html?chapter=' + chapter.id + '&tier=easy');
      drawChip(chips, 38, '大测', 'practice.html?chapter=' + chapter.id + '&kind=test');

      text(g, 0, 96, chapter.title, 'station-title', 'middle');
    });
  }

  function drawChip(parent, x, label, href) {
    var g = node('g', { class: 'station-chip', transform: 'translate(' + x + ',0)' }, parent);
    var a = node('a', { href: href, 'aria-label': label }, g);
    node('rect', { x: -19, y: -10, width: 38, height: 20, rx: 10, class: 'chip-bg' }, a);
    text(a, 0, 4, label, 'chip-text', 'middle');
    g.addEventListener('click', function (event) { event.stopPropagation(); });
    return g;
  }

  /* ------------------------------------------------------------------ *
   * 应用区
   * ------------------------------------------------------------------ */

  function drawDistricts() {
    data.districts.forEach(function (district) {
      var g = node('g', {
        class: 'district',
        transform: 'translate(' + district.x + ',' + (district.y + 12) + ')',
        tabindex: '0',
        role: 'button',
        'aria-label': district.title + '，' + district.apps.length + ' 个应用'
      }, svg);
      g.dataset.kind = 'district';
      g.dataset.id = district.id;

      node('rect', { x: -88, y: 0, width: 176, height: 150, rx: 16, class: 'district-box' }, g);
      text(g, 0, 26, district.title, 'district-title', 'middle');
      node('line', { x1: -66, y1: 34, x2: 66, y2: 34, class: 'district-rule' }, g);

      district.apps.forEach(function (app, index) {
        var y = 52 + index * 32;
        var link = node('a', { href: app.href, 'aria-label': app.label }, g);
        node('rect', { x: -72, y: y, width: 144, height: 26, rx: 8, class: 'app-chip' }, link);
        text(link, 0, y + 17, app.label, 'app-text', 'middle');
        link.addEventListener('click', function (event) { event.stopPropagation(); });
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 装饰层（宠物 / 小屋）
   * ------------------------------------------------------------------ */

  function drawDecor() {
    var layer = node('g', { class: 'decor-layer' + (state.decorOn ? ' is-editing' : '') }, svg);
    state.decor.forEach(function (item, index) {
      var g = pets.draw(layer, item.kind, item.x, item.y, 1);
      g.dataset.index = index;
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', '拿掉这个装饰');
    });
  }

  function addDecor(x, y) {
    if (!state.decorOn || !state.decorKind) return;
    if (state.decor.length >= 40) {
      showSave('装饰有点多了，先拿走几个。');
      return;
    }
    state.decor.push({ kind: state.decorKind, x: Math.round(x), y: Math.round(y) });
    refreshDecor();
    queueSave();
  }

  function removeDecor(index) {
    if (!state.decorOn) return;
    state.decor.splice(index, 1);
    refreshDecor();
    queueSave();
  }

  function refreshDecor() {
    var layer = svg.querySelector('.decor-layer');
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    state.decor.forEach(function (item, index) {
      var g = pets.draw(layer, item.kind, item.x, item.y, 1);
      g.dataset.index = index;
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', '拿掉这个装饰');
    });
    var count = state.decor.filter(function (item) { return item.kind === 'house'; }).length;
    var total = state.decor.length;
    var countEl = document.getElementById('decor-count');
    if (countEl) countEl.textContent = '已放 ' + total + ' 个装饰，其中 ' + count + ' 座小屋。';
  }

  function showSave(message) {
    if (!saveState) return;
    saveState.textContent = message;
  }

  function queueSave() {
    if (!state.user) return;
    if (state.saveTimer) window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(saveDecor, 600);
  }

  function saveDecor() {
    if (!state.user) return;
    if (state.saving) return;
    state.saving = true;
    fetch('/api/decor', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: state.decor })
    }).then(function (response) {
      state.saving = false;
      if (response.ok) {
        showSave('已保存到你的账号。');
      } else if (response.status === 401) {
        showSave('登录状态过期了，刷新后再试。');
      } else {
        showSave('保存失败，稍后再试。');
      }
    }).catch(function () {
      state.saving = false;
      showSave('网络不通，装饰只留在这一页。');
    });
  }

  function setDecorKind(kind) {
    state.decorKind = kind;
    try { window.localStorage.setItem('la-pet', kind); } catch (error) { /* 无痕模式忽略 */ }
    state.decorOn = true;
    Array.prototype.forEach.call(document.querySelectorAll('.pet-palette button'), function (button) {
      button.classList.toggle('is-active', button.dataset.kind === kind);
    });
    var layer = svg.querySelector('.decor-layer');
    if (layer) layer.classList.add('is-editing');
    showSave('点地图上的空位放下；点已放的可以拿走。');
  }

  function clearDecor() {
    if (!state.decor.length) return;
    if (!window.confirm('把地图上的装饰全部拿走？')) return;
    state.decor = [];
    refreshDecor();
    queueSave();
  }

  /* ------------------------------------------------------------------ *
   * 面板
   * ------------------------------------------------------------------ */

  function panelOpen() {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
  }

  function panelCloseFn() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  }

  function showChapter(chapter) {
    var status = statusOf(chapter.id);
    var html = '<p class="panel-kicker">CHAPTER ' + chapter.num + ' · ' + statusLabel(status) + '</p>'
      + '<h2>' + chapter.title + '</h2>'
      + '<p class="panel-blurb">' + chapter.blurb + '</p>'
      + '<div class="panel-links">'
      + '<a class="btn btn-primary" href="' + chapter.id + '.html">进入本章</a>'
      + '<a class="btn btn-small btn-ghost" href="practice.html?chapter=' + chapter.id + '&tier=easy">简单</a>'
      + '<a class="btn btn-small btn-ghost" href="practice.html?chapter=' + chapter.id + '&tier=medium">进阶</a>'
      + '<a class="btn btn-small btn-ghost" href="practice.html?chapter=' + chapter.id + '&tier=hard">挑战</a>'
      + '<a class="btn btn-small" href="practice.html?chapter=' + chapter.id + '&kind=test">章节大测</a>'
      + '</div>';
    panelBody.innerHTML = html;
    panelOpen();
  }

  function showDistrict(district) {
    var html = '<p class="panel-kicker">APPLICATIONS</p>'
      + '<h2>' + district.title + '</h2>'
      + '<p class="panel-blurb">这里把线性代数放进真实场景。点一个应用进去看。</p>'
      + '<div class="panel-apps">';
    district.apps.forEach(function (app) {
      html += '<a class="panel-app" href="' + app.href + '">' + app.label + '<span>→</span></a>';
    });
    html += '</div>';
    panelBody.innerHTML = html;
    panelOpen();
  }

  /* ------------------------------------------------------------------ *
   * 宠物卡
   * ------------------------------------------------------------------ */

  function nextChapter() {
    for (var i = 0; i < data.chapters.length; i++) {
      if (statusOf(data.chapters[i].id) !== 'tested') return data.chapters[i];
    }
    return null;
  }

  function updatePetCard() {
    if (!petCard) return;
    if (!state.user) {
      petCard.innerHTML = '<p class="pet-kicker">我的地图</p>'
        + '<p class="pet-line">登录后可以在地图上养宠物、搭房子：随便放，不看成绩。</p>'
        + '<button class="btn btn-small" id="pet-login">登录 / 注册</button>';
      var login = document.getElementById('pet-login');
      if (login && account) login.addEventListener('click', function () { account.openDialog(); });
      return;
    }

    var houses = state.decor.filter(function (item) { return item.kind === 'house'; }).length;
    var next = nextChapter();
    var html = '<p class="pet-kicker">我的地图 · 布置</p>'
      + '<p class="pet-line">点一个种类，再点地图空位；点已放的可以拿走。</p>'
      + '<div class="pet-palette">'
      + pets.kinds.map(function (kind) {
        return '<button type="button" data-kind="' + kind.id + '" title="' + kind.name + '">'
          + '<span>' + kind.emoji + '</span>' + kind.name + '</button>';
      }).join('')
      + '</div>'
      + '<p class="pet-line" id="decor-count"></p>'
      + (next ? '<p class="pet-line pet-next">下一站：' + next.title + '</p>' : '<p class="pet-line pet-next">六章都走完了，去应用区逛逛。</p>')
      + '<button class="btn btn-small btn-ghost" id="decor-clear" type="button">清空装饰</button>';

    petCard.innerHTML = html;

    Array.prototype.forEach.call(petCard.querySelectorAll('.pet-palette button'), function (button) {
      button.addEventListener('click', function () { setDecorKind(button.dataset.kind); });
    });
    var clear = document.getElementById('decor-clear');
    if (clear) clear.addEventListener('click', clearDecor);

    var count = state.decor.filter(function (item) { return item.kind === 'house'; }).length;
    var countEl = document.getElementById('decor-count');
    if (countEl) countEl.textContent = '已放 ' + state.decor.length + ' 个装饰，其中 ' + count + ' 座小屋。';
  }

  /* ------------------------------------------------------------------ *
   * 交互与数据
   * ------------------------------------------------------------------ */

  function applyStats(stats) {
    state.progress = {};
    (stats.progress || []).forEach(function (row) {
      state.progress[row.chapter] = row.status;
    });
    redrawMap();
  }

  function redrawMap() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    drawBackground();
    drawRoute();
    drawDistricts();
    drawStations();
    drawDecor();
    updatePetCard();
  }

  function bindMap() {
    svg.addEventListener('click', function (event) {
      var item = event.target.closest ? event.target.closest('.decor-item') : null;
      if (state.decorOn) {
        if (item) {
          removeDecor(Number(item.dataset.index));
        } else if (event.target.closest && !event.target.closest('.station, .district, a')) {
          var point = pointFromEvent(event);
          addDecor(point.x, point.y);
        }
        return;
      }
      if (item) return;

      var target = event.target.closest ? event.target.closest('[data-kind]') : null;
      if (!target) return;
      if (target.dataset.kind === 'chapter') {
        var chapter = findChapter(target.dataset.id);
        if (chapter) showChapter(chapter);
      } else if (target.dataset.kind === 'district') {
        var district = findDistrict(target.dataset.id);
        if (district) showDistrict(district);
      }
    });

    svg.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var target = event.target.closest ? event.target.closest('[data-kind]') : null;
      if (!target) return;
      event.preventDefault();
      if (target.dataset.kind === 'chapter') {
        var chapter = findChapter(target.dataset.id);
        if (chapter) showChapter(chapter);
      } else if (target.dataset.kind === 'district') {
        var district = findDistrict(target.dataset.id);
        if (district) showDistrict(district);
      }
    });

    panelClose.addEventListener('click', panelCloseFn);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') panelCloseFn();
    });
  }

  function findChapter(id) {
    return data.chapters.filter(function (item) { return item.id === id; })[0];
  }

  function findDistrict(id) {
    return data.districts.filter(function (item) { return item.id === id; })[0];
  }

  function loadDecor() {
    return fetch('/api/decor', { credentials: 'same-origin' })
      .then(function (response) { return response.ok ? response.json() : { items: [] }; })
      .then(function (payload) {
        state.decor = Array.isArray(payload.items) ? payload.items : [];
      })
      .catch(function () { state.decor = []; });
  }

  function load() {
    if (!account) return;
    account.init().then(function () {
      state.user = account.state.user;
      state.online = account.state.online;
      if (!state.user) {
        redrawMap();
        if (hint) hint.textContent = '未登录也能看、能点、能进；登录后可以布置宠物与小屋。';
        return;
      }
      if (hint) hint.textContent = '已登录：站点颜色是进度，宠物与小屋由你布置。';
      loadDecor().then(function () {
        if (account.stats) {
          account.stats().then(applyStats).catch(function () { redrawMap(); });
        } else {
          redrawMap();
        }
      });
    });
  }

  redrawMap();
  bindMap();
  load();
})();
