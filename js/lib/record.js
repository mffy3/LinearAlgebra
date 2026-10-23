/**
 * record.js · 学习记录
 *
 * 只做两件事，而且只在「已登录」时才真的发请求：
 *   1. 打开章节页 → 记一次 visited；
 *   2. 点「先猜后验」的选项 → 记一次正确 / 错误。
 *
 * 未登录、或本地服务没启动时，它什么都不做，页面行为完全不变。
 */
(function () {
  'use strict';

  var account = window.LinearAccount;
  if (!account) return;

  var chapter = (function () {
    var name = window.location.pathname.split('/').pop().replace(/\.html$/, '');
    return /^\d{2}-[a-z-]+$/.test(name) ? name : 'page';
  })();

  var quizRecorded = false;

  account.whenReady(function (state) {
    if (!state.online || !state.user) return;

    var key = 'la-visited-' + chapter;
    var visited = false;
    try {
      visited = window.sessionStorage.getItem(key) === '1';
      window.sessionStorage.setItem(key, '1');
    } catch (error) {
      visited = false;
    }
    if (!visited) {
      account.record({ kind: 'visit', chapter: chapter });
    }
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;

    var option = target.closest('.quiz-options button');
    if (!option || quizRecorded) return;
    if (!account.state.online || !account.state.user) return;

    // 页面的答题逻辑会先一步更新反馈；等它跑完再读结果。
    window.setTimeout(function () {
      var feedback = document.getElementById('quiz-feedback');
      if (!feedback) return;
      var correct = feedback.classList.contains('is-correct');
      quizRecorded = true;
      account.record({ kind: 'quiz', chapter: chapter, correct: correct });
    }, 60);
  });
})();
