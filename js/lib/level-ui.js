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

  var active = P.levels[level] ? level : 'some';
  window.LinAlgLevel = {
    name: active,
    factor: active === 'zero' ? 1.8 : (active === 'learned' ? 0.55 : 1),
    challengeLabel: active === 'zero' ? '先试一下' : (active === 'learned' ? '进阶挑战' : '小挑战')
  };

  if (!P.levels[level]) return;

  document.body.dataset.level = level;
  var data = P.levels[level];
  var key = P.pageKey(window.location.pathname);
  if (key !== 'physics' && key !== 'physics-rotation' && key !== 'physics-quantum' && key !== 'economics-leontief' && key !== 'economics-portfolio' && key !== 'software-convolution') document.body.classList.add('level-core');
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
    else if (keyName === 'physics-rotation') root = 'pages/applications/physics-rotation.html';
    else if (keyName === 'physics-quantum') root = 'pages/applications/physics-quantum.html';
    else if (keyName === 'economics-leontief') root = 'pages/applications/economics-leontief.html';
    else if (keyName === 'economics-portfolio') root = 'pages/applications/economics-portfolio.html';
    else if (keyName === 'software-convolution') root = 'pages/applications/software-convolution.html';
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

  var checklist = P.checklists[level];
  if (checklist) {
    var listWrap = document.createElement('div');
    listWrap.className = 'level-checklist';
    var listLabel = document.createElement('span');
    listLabel.className = 'level-checklist-label';
    listLabel.textContent = '这一站怎么学';
    listWrap.appendChild(listLabel);
    checklist.forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'level-check-item';
      chip.textContent = item;
      listWrap.appendChild(chip);
    });
    guideEl.appendChild(listWrap);
  }

  // 零基础先不给公式；略有了解 / 有扎实的基础直接把式子摆出来。
  if (level !== 'zero' && P.formulas[key]) {
    var formula = document.createElement('p');
    formula.className = 'level-formula';
    formula.textContent = P.formulas[key];
    guideEl.appendChild(formula);
  }

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

  var quizEyebrow = document.querySelector('.quiz-section .eyebrow');
  if (quizEyebrow) {
    quizEyebrow.textContent = level === 'zero' ? '基础检查' : (level === 'some' ? '方法检查' : '应用检查');
  }

  var challengeLabel = document.querySelector('.challenge-head > span:first-child');
  if (challengeLabel && window.LinAlgLevel) {
    challengeLabel.textContent = window.LinAlgLevel.challengeLabel;
  }

  if (level === 'zero') {
    var quizOptions = document.querySelector('.quiz-options');
    if (quizOptions && quizOptions.parentNode) {
      var hint = document.createElement('p');
      hint.className = 'level-quiz-hint';
      hint.textContent = '提示：先看画布，再选；不确定就回到上面的图。';
      quizOptions.parentNode.insertBefore(hint, quizOptions);
    }
  }

  var intro = document.querySelector('.lab-intro');
  if (intro && intro.parentNode) {
    intro.parentNode.insertBefore(guideEl, intro.nextSibling);
  }
})();
