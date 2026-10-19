/**
 * level-ui.js · 把当前水平变成页面顶部的一条路线提示
 *
 * 读取 ?level= 或 localStorage；不改变页面内容，只负责解释
 * “你在哪条路线、第几站、下一站去哪”。
 */
(function () {
  'use strict';

  var P = window.LinAlgPaths;
  if (!P) return;

  var level = null;
  try {
    var params = new URLSearchParams(window.location.search);
    level = params.get('level');
    if (!P.levels[level]) level = localStorage.getItem('lin-alg-level');
    if (P.levels[level]) localStorage.setItem('lin-alg-level', level);
  } catch (error) {
    level = null;
  }
  if (!P.levels[level]) return;

  document.body.dataset.level = level;
  var data = P.levels[level];
  var key = P.pageKey(window.location.pathname);
  var index = P.indexOf(level, key);
  var inPath = index >= 0;
  var total = data.pages.length;
  var guide = (P.guides[key] && P.guides[key][level]) || null;

  if (!guide) {
    guide = {
      title: inPath ? '当前路线' : '这一站不在你的路线里',
      body: inPath
        ? '沿着这条路线继续；看不懂时再回到画布。'
        : '你可以直接回到这条路的起点。'
    };
  }

  function isApplication() {
    return window.location.pathname.indexOf('/pages/applications/') >= 0;
  }

  function isPages() {
    return window.location.pathname.indexOf('/pages/') >= 0;
  }

  function hrefFor(keyName) {
    if (!keyName) return null;
    var root;
    if (keyName === 'physics') root = 'pages/applications/physics.html';
    else if (/^(economics|computer|art|music|social)$/.test(keyName)) return null;
    else root = 'pages/' + keyName + '.html';
    var query = '?level=' + level;

    if (isApplication()) return '../../' + root + query;
    if (isPages()) return root.replace(/^pages\//, '') + query;
    return root + query;
  }

  function entryHref() {
    if (isApplication()) return '../../index.html';
    if (isPages()) return '../index.html';
    return 'index.html';
  }

  var guideEl = document.createElement('section');
  guideEl.className = 'level-guide' + (inPath ? '' : ' is-outside');
  guideEl.setAttribute('aria-label', '当前学习路线');

  var head = document.createElement('div');
  head.className = 'level-guide-head';

  var route = document.createElement('span');
  route.className = 'level-route';
  route.textContent = data.label + (inPath ? ' · 第 ' + (index + 1) + ' / ' + total + ' 站' : ' · 不在当前路线');
  head.appendChild(route);

  var change = document.createElement('a');
  change.className = 'level-change';
  change.href = entryHref();
  change.textContent = '换路线';
  head.appendChild(change);
  guideEl.appendChild(head);

  var title = document.createElement('p');
  title.className = 'level-guide-title';
  title.textContent = guide.title;
  guideEl.appendChild(title);

  var body = document.createElement('p');
  body.className = 'level-guide-body';
  body.textContent = guide.body;
  guideEl.appendChild(body);

  var actions = document.createElement('div');
  actions.className = 'level-guide-actions';

  if (inPath) {
    var next = P.nextKey(level, key);
    if (next) {
      var nextHref = hrefFor(next);
      if (nextHref) {
        var nextLink = document.createElement('a');
        nextLink.className = 'level-next';
        nextLink.href = nextHref;
        nextLink.textContent = '下一站：' + P.labels[next] + ' →';
        actions.appendChild(nextLink);
      } else {
        var soon = document.createElement('span');
        soon.className = 'level-next is-disabled';
        soon.textContent = P.labels[next] + ' · 即将开放';
        actions.appendChild(soon);
      }
    }
  } else {
    var back = document.createElement('a');
    back.className = 'level-next';
    back.href = hrefFor(data.start);
    back.textContent = '回到路线起点：' + P.labels[data.start] + ' →';
    actions.appendChild(back);
  }

  if (actions.childNodes.length) guideEl.appendChild(actions);

  var intro = document.querySelector('.lab-intro');
  if (intro && intro.parentNode) {
    intro.parentNode.insertBefore(guideEl, intro.nextSibling);
  }
})();
