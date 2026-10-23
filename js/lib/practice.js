/**
 * practice.js · 三档练习与章节大测
 *
 * 数据来自 js/lib/questions/*.js（每题：q 题干 / o 选项 / a 正确选项下标 /
 * n 数值答案 / tol 容差 / e 解析 / s 出处）。
 *
 * 流程：选模式 → 答题（限时则倒计时 + 每 25 分钟鼓励一次）→ 交卷 →
 * 判分 / 只对答案 → 记录（登录时）→ 可下载原题与答案解析。
 */
(function () {
  'use strict';

  var bank = window.LinAlgQuiz || {};
  var account = window.LinearAccount;

  var CHAPTERS = {
    '00-vectors': { title: '向量与组合', page: '00-vectors.html' },
    '01-transform': { title: '矩阵变换', page: '01-transform.html' },
    '02-determinant': { title: '行列式', page: '02-determinant.html' },
    '03-rank': { title: '秩与零空间', page: '03-rank.html' },
    '04-eigenvector': { title: '特征向量', page: '04-eigenvector.html' },
    '05-solve': { title: '线性方程组', page: '05-solve.html' }
  };

  var TIERS = {
    easy: '简单',
    medium: '进阶',
    hard: '挑战'
  };

  var MODES = [
    { id: 'timed-graded', label: '限时测试（打分）', desc: '倒计时；交卷后给分数，登录时会记录。', timed: true, graded: true },
    { id: 'timed-answer', label: '限时测试（只对答案）', desc: '倒计时；交卷后只显示答案与解析，不判分。', timed: true, graded: false },
    { id: 'untimed-graded', label: '不限时（打分）', desc: '不设倒计时；交卷后给分数，登录时会记录。', timed: false, graded: true },
    { id: 'untimed-answer', label: '不限时（不打分）', desc: '不设倒计时；交卷后只显示答案与解析。', timed: false, graded: false },
    { id: 'skip', label: '跳过', desc: '这次不做，直接回到章节。', timed: false, graded: false }
  ];

  var MINUTES = { practice: 90, test: 150 };
  var ENCOURAGE = [
    '已经 25 分钟了。停下来喝口水，再继续。',
    '50 分钟。做对这一题，比做完这一页更重要。',
    '75 分钟。手酸了就甩两下，慢慢来。',
    '100 分钟。剩下的题先捡会做的。',
    '125 分钟。快到头了，稳住。'
  ];

  var params = new URLSearchParams(window.location.search);
  var chapterId = params.get('chapter') || '00-vectors';
  var kind = params.get('kind') === 'test' ? 'test' : 'practice';
  var tier = TIERS[params.get('tier')] ? params.get('tier') : 'easy';

  var chapter = CHAPTERS[chapterId] || CHAPTERS['00-vectors'];
  var data = bank[chapterId] || null;

  var root = document.getElementById('practice-root');
  var titleEl = document.getElementById('practice-title');
  var eyebrowEl = document.getElementById('practice-eyebrow');
  var ledeEl = document.getElementById('practice-lede');
  var backEl = document.getElementById('practice-back');

  var state = {
    mode: null,
    questions: [],
    answers: [],
    index: 0,
    submitted: false,
    startAt: 0,
    endsAt: 0,
    timerId: null,
    encouraged: 0,
    toastTimer: null
  };

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clearRoot() {
    while (root.firstChild) root.removeChild(root.firstChild);
  }

  function setHeader() {
    var isTest = kind === 'test';
    var label = isTest ? '章节大测' : '本节练习 · ' + (TIERS[tier] || '简单');
    titleEl.textContent = chapter.title + ' · ' + label;
    eyebrowEl.textContent = isTest ? 'CHAPTER TEST · 200 分 · 约 2.5 小时' : 'PRACTICE · 百分制 · 约 1.5 小时';
    ledeEl.textContent = isTest
      ? '覆盖整章：8 题，满分 200。先选一种测试方式，再开始。'
      : '对应本章知识点：6 题，百分制。先选一种练习方式，再开始。';
    backEl.href = chapter.page;
    backEl.textContent = '← 回到「' + chapter.title + '」';
    document.title = chapter.title + ' · ' + label + ' · Linear Algebra';
  }

  function currentSet() {
    if (!data) return [];
    if (kind === 'test') return data.test || [];
    return (data.practice && data.practice[tier]) || [];
  }

  function totalPoints() {
    return kind === 'test' ? 200 : 100;
  }

  function pointsPerQuestion() {
    var n = state.questions.length || 1;
    return totalPoints() / n;
  }

  function isCorrect(question, answer) {
    if (!question) return false;
    if (typeof question.n === 'number') {
      var value = Number(answer);
      if (!Number.isFinite(value)) return false;
      return Math.abs(value - question.n) <= (question.tol == null ? 0.01 : question.tol);
    }
    return answer === question.a;
  }

  function answerLabel(question, answer) {
    if (answer === null || answer === undefined || answer === '') return '未作答';
    if (typeof question.n === 'number') return String(answer);
    var index = Number(answer);
    if (!Number.isFinite(index) || !question.o || !question.o[index]) return '未作答';
    return question.o[index];
  }

  function correctLabel(question) {
    if (typeof question.n === 'number') return String(question.n);
    return question.o && question.o[question.a] != null ? question.o[question.a] : '';
  }

  function formatTime(seconds) {
    var s = Math.max(0, Math.round(seconds));
    var m = Math.floor(s / 60);
    var rest = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (rest < 10 ? '0' : '') + rest;
  }

  /* ------------------------------------------------------------------ *
   * 提示条
   * ------------------------------------------------------------------ */

  function toast(message, duration) {
    var node = document.querySelector('.practice-toast');
    if (!node) {
      node = el('div', 'practice-toast');
      node.setAttribute('role', 'status');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('is-visible');
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      node.classList.remove('is-visible');
    }, duration || 7000);
  }

  /* ------------------------------------------------------------------ *
   * 模式选择
   * ------------------------------------------------------------------ */

  function renderModes() {
    clearRoot();

    if (!data || !currentSet().length) {
      var empty = el('div', 'practice-empty');
      empty.appendChild(el('p', null, '这一档暂时还没有题目。'));
      var link = el('a', 'btn btn-small btn-ghost', '回到章节');
      link.href = chapter.page;
      empty.appendChild(link);
      root.appendChild(empty);
      return;
    }

    var grid = el('div', 'mode-grid');
    MODES.forEach(function (mode) {
      var card = el('button', 'mode-card' + (mode.id === 'skip' ? ' is-skip' : ''));
      card.type = 'button';
      card.appendChild(el('strong', null, mode.label));
      card.appendChild(el('span', null, mode.desc));
      card.addEventListener('click', function () {
        if (mode.id === 'skip') {
          window.location.href = chapter.page;
          return;
        }
        startExam(mode);
      });
      grid.appendChild(card);
    });
    root.appendChild(grid);

    var hint = el('p', 'mode-hint');
    hint.textContent = kind === 'test'
      ? '限时 150 分钟 · 满分 200 · 交卷后可下载原题与答案解析'
      : '限时 90 分钟 · 满分 100 · 交卷后可下载原题与答案解析';
    root.appendChild(hint);
  }

  /* ------------------------------------------------------------------ *
   * 考试
   * ------------------------------------------------------------------ */

  function startExam(mode) {
    state.mode = mode;
    state.questions = currentSet().slice();
    state.answers = state.questions.map(function () { return null; });
    state.index = 0;
    state.submitted = false;
    state.startAt = Date.now();
    state.encouraged = 0;

    if (mode.timed) {
      state.endsAt = state.startAt + MINUTES[kind] * 60 * 1000;
      startTimer();
    }

    renderExam();
  }

  function stopTimer() {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    state.timerId = window.setInterval(function () {
      if (state.submitted) return;
      var remaining = (state.endsAt - Date.now()) / 1000;
      var chip = document.querySelector('.exam-timer b');
      if (chip) chip.textContent = formatTime(remaining);
      var timer = document.querySelector('.exam-timer');
      if (timer) timer.classList.toggle('is-low', remaining <= 300);

      var elapsed = (Date.now() - state.startAt) / 1000;
      var milestones = Math.floor(elapsed / (25 * 60));
      if (milestones > state.encouraged && milestones < ENCOURAGE.length) {
        state.encouraged = milestones;
        toast(ENCOURAGE[milestones - 1]);
      }

      if (remaining <= 0) {
        toast('时间到，自动交卷。', 4000);
        submit(true);
      }
    }, 500);
  }

  function renderExam() {
    clearRoot();
    var question = state.questions[state.index];

    var exam = el('div', 'exam');

    var head = el('div', 'exam-head');
    var meta = el('div', 'exam-meta');
    var kicker = el('span', 'exam-kicker');
    kicker.textContent = kind === 'test' ? '章节大测 · 200 分' : '练习 · ' + (TIERS[tier] || '简单');
    var progress = el('span', 'exam-progress');
    progress.textContent = '第 ' + (state.index + 1) + ' / ' + state.questions.length + ' 题';
    meta.appendChild(kicker);
    meta.appendChild(progress);
    head.appendChild(meta);

    if (state.mode.timed) {
      var timer = el('div', 'exam-timer');
      timer.appendChild(el('span', null, '剩余'));
      var b = el('b');
      b.textContent = formatTime((state.endsAt - Date.now()) / 1000);
      timer.appendChild(b);
      head.appendChild(timer);
    } else {
      var free = el('div', 'exam-timer');
      free.appendChild(el('span', null, '不限时'));
      head.appendChild(free);
    }
    exam.appendChild(head);

    var body = el('div', 'question');
    var h2 = el('h2');
    h2.appendChild(el('span', 'question-index', String(state.index + 1).padStart(2, '0')));
    h2.appendChild(document.createTextNode(question.q || '题目'));
    body.appendChild(h2);

    if (typeof question.n === 'number') {
      var wrap = el('div', 'number-answer');
      var input = el('input');
      input.type = 'number';
      input.step = 'any';
      input.setAttribute('inputmode', 'decimal');
      input.setAttribute('aria-label', '填写数值答案');
      input.value = state.answers[state.index] == null ? '' : String(state.answers[state.index]);
      input.addEventListener('input', function () {
        state.answers[state.index] = input.value === '' ? null : input.value;
        updateDots();
      });
      wrap.appendChild(input);
      wrap.appendChild(el('span', null, '填数值，保留两位小数即可'));
      body.appendChild(wrap);
    } else {
      var options = el('div', 'options');
      (question.o || []).forEach(function (text, optionIndex) {
        var button = el('button', 'option');
        button.type = 'button';
        button.appendChild(el('b', null, String.fromCharCode(65 + optionIndex)));
        button.appendChild(el('span', null, text));
        if (String(state.answers[state.index]) === String(optionIndex)) {
          button.classList.add('is-selected');
        }
        button.addEventListener('click', function () {
          state.answers[state.index] = optionIndex;
          Array.prototype.forEach.call(options.children, function (child) {
            child.classList.remove('is-selected');
          });
          button.classList.add('is-selected');
          updateDots();
        });
        options.appendChild(button);
      });
      body.appendChild(options);
    }
    exam.appendChild(body);

    var dots = el('div', 'exam-dots');
    state.questions.forEach(function (q, index) {
      var dot = el('button', 'exam-dot');
      dot.type = 'button';
      dot.textContent = String(index + 1);
      if (state.answers[index] !== null && state.answers[index] !== '') dot.classList.add('is-answered');
      if (index === state.index) dot.classList.add('is-current');
      dot.addEventListener('click', function () {
        state.index = index;
        renderExam();
      });
      dots.appendChild(dot);
    });
    exam.appendChild(dots);

    var foot = el('div', 'exam-foot');
    var nav = el('div', 'exam-nav');
    var prev = el('button', 'btn btn-small btn-ghost', '上一题');
    prev.type = 'button';
    prev.disabled = state.index === 0;
    prev.addEventListener('click', function () {
      if (state.index > 0) {
        state.index -= 1;
        renderExam();
      }
    });
    var next = el('button', 'btn btn-small btn-ghost', '下一题');
    next.type = 'button';
    next.disabled = state.index >= state.questions.length - 1;
    next.addEventListener('click', function () {
      if (state.index < state.questions.length - 1) {
        state.index += 1;
        renderExam();
      }
    });
    nav.appendChild(prev);
    nav.appendChild(next);
    foot.appendChild(nav);

    var submitBtn = el('button', 'btn btn-primary', '交卷');
    submitBtn.type = 'button';
    submitBtn.addEventListener('click', function () { confirmSubmit(); });
    foot.appendChild(submitBtn);
    exam.appendChild(foot);

    root.appendChild(exam);
  }

  function updateDots() {
    var dots = document.querySelectorAll('.exam-dot');
    for (var i = 0; i < dots.length; i++) {
      var value = state.answers[i];
      dots[i].classList.toggle('is-answered', value !== null && value !== '');
    }
  }

  function confirmSubmit() {
    var unanswered = state.answers.filter(function (value) {
      return value === null || value === '';
    }).length;
    if (unanswered > 0 && !window.confirm('还有 ' + unanswered + ' 题没答，确定交卷吗？')) return;
    submit(false);
  }

  /* ------------------------------------------------------------------ *
   * 交卷与结果
   * ------------------------------------------------------------------ */

  function submit(auto) {
    if (state.submitted) return;
    state.submitted = true;
    stopTimer();

    var correct = 0;
    state.questions.forEach(function (question, index) {
      if (isCorrect(question, state.answers[index])) correct += 1;
    });

    var graded = state.mode.graded;
    var score = graded ? Math.round(correct * pointsPerQuestion()) : null;
    var duration = Math.round((Date.now() - state.startAt) / 1000);

    recordAttempt(graded, score, correct, duration);
    renderResult({ correct: correct, score: score, graded: graded, duration: duration, auto: auto });
  }

  function recordAttempt(graded, score, correct, duration) {
    if (!account) return;
    var passes = {
      kind: kind,
      chapter: chapterId,
      tier: kind === 'practice' ? tier : undefined,
      mode: state.mode.id,
      duration: duration
    };
    if (graded) {
      passes.score = score;
      passes.total = totalPoints();
      passes.correctCount = correct;
      passes.questionCount = state.questions.length;
    }
    account.record(passes);
  }

  function renderResult(result) {
    clearRoot();

    var card = el('div', 'result-card');
    card.appendChild(el('span', 'result-label', result.graded ? (kind === 'test' ? 'CHAPTER TEST' : 'PRACTICE') : 'ANSWER KEY ONLY'));

    var score = el('strong', 'result-score');
    if (result.graded) {
      score.appendChild(document.createTextNode(String(result.score)));
      score.appendChild(el('small', null, ' / ' + totalPoints()));
    } else {
      score.appendChild(document.createTextNode('未判分'));
    }
    card.appendChild(score);

    var note = el('p', 'result-note');
    if (result.graded) {
      note.textContent = '答对 ' + result.correct + ' / ' + state.questions.length + ' 题，用时 '
        + formatTime(result.duration) + '。' + (result.auto ? '（时间到，自动交卷）' : '');
    } else {
      note.textContent = '你选了「只对答案」：这里只给答案与解析，不给分数，也不计入正确率。';
    }
    card.appendChild(note);

    if (result.graded) {
      var meter = el('div', 'result-meter');
      var fill = el('span');
      fill.style.width = Math.round((result.score / totalPoints()) * 100) + '%';
      meter.appendChild(fill);
      card.appendChild(meter);
    }

    var actions = el('div', 'result-actions');
    var again = el('button', 'btn btn-small btn-ghost', '再做一次');
    again.type = 'button';
    again.addEventListener('click', function () { window.location.reload(); });
    actions.appendChild(again);

    var download = el('button', 'btn btn-small', '下载原题与答案解析');
    download.type = 'button';
    download.addEventListener('click', downloadPaper);
    actions.appendChild(download);

    var back = el('a', 'btn btn-small btn-ghost', '回到章节');
    back.href = chapter.page;
    actions.appendChild(back);

    if (account && account.state && account.state.online && account.state.user) {
      var dash = el('a', 'btn btn-small btn-ghost', '数据面板');
      dash.href = 'dashboard.html';
      actions.appendChild(dash);
    }
    card.appendChild(actions);

    if (!account || !account.state || !account.state.user) {
      var privacy = el('p', 'result-note');
      privacy.textContent = '未登录：这次成绩不会记录，但可以下载原题与答案解析。登录后才会写进数据面板。';
      card.appendChild(privacy);
    }

    root.appendChild(card);

    // 解析
    var review = el('div', 'review');
    review.appendChild(el('h2', null, '逐题解析'));
    state.questions.forEach(function (question, index) {
      var ok = isCorrect(question, state.answers[index]);
      var item = el('div', 'review-item ' + (result.graded ? (ok ? 'is-correct' : 'is-wrong') : 'is-open'));

      var head = el('div', 'review-head');
      head.appendChild(el('b', null, '第 ' + (index + 1) + ' 题'));
      head.appendChild(el('span', null, result.graded ? (ok ? '答对' : '答错') : '答案'));
      item.appendChild(head);

      item.appendChild(el('p', 'review-q', question.q || ''));

      var your = el('p', 'review-line');
      your.innerHTML = '你的答案：<b>' + escapeHtml(answerLabel(question, state.answers[index])) + '</b>';
      item.appendChild(your);

      var right = el('p', 'review-line');
      right.innerHTML = '正确答案：<b>' + escapeHtml(correctLabel(question)) + '</b>';
      item.appendChild(right);

      if (question.e) item.appendChild(el('p', 'review-explain', question.e));

      if (question.s) {
        var source = el('p', 'review-source');
        source.textContent = '参考：' + question.s;
        item.appendChild(source);
      }

      review.appendChild(item);
    });

    if (data && data.refs && data.refs.length) {
      var refs = el('div', 'review-source');
      refs.textContent = '本章参考：' + data.refs.map(function (ref) { return ref.label; }).join('；');
      review.appendChild(refs);
    }

    root.appendChild(review);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  /* ------------------------------------------------------------------ *
   * 下载原题与答案
   * ------------------------------------------------------------------ */

  function downloadPaper() {
    var title = chapter.title + ' · ' + (kind === 'test' ? '章节大测（200 分）' : '练习 · ' + (TIERS[tier] || '简单'));
    var lines = [];
    lines.push('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">');
    lines.push('<title>' + escapeHtml(title) + ' · 原题与答案解析</title>');
    lines.push('<style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7;max-width:760px;margin:40px auto;padding:0 20px;color:#2e312c}');
    lines.push('h1{font-size:22px}h2{font-size:17px;margin-top:28px}li{margin:4px 0}.ans{color:#556657}.exp{color:#6d7068;font-size:14px}');
    lines.push('.src{color:#96988e;font-size:12px}hr{border:0;border-top:1px solid #ddd8ce;margin:22px 0}</style></head><body>');
    lines.push('<h1>' + escapeHtml(title) + ' · 原题与答案解析</h1>');
    lines.push('<p class="src">来自 Linear Algebra 开源项目 · 仅供个人学习</p>');

    lines.push('<h2>题目</h2><ol>');
    state.questions.forEach(function (question) {
      lines.push('<li>' + escapeHtml(question.q || '') + '</li>');
      if (question.o) {
        lines.push('<ul>');
        question.o.forEach(function (option, index) {
          lines.push('<li>' + String.fromCharCode(65 + index) + '. ' + escapeHtml(option) + '</li>');
        });
        lines.push('</ul>');
      }
    });
    lines.push('</ol>');

    lines.push('<h2>答案解析</h2><ol>');
    state.questions.forEach(function (question) {
      lines.push('<li><b class="ans">答案：' + escapeHtml(correctLabel(question)) + '</b>');
      if (question.e) lines.push('<div class="exp">' + escapeHtml(question.e) + '</div>');
      if (question.s) lines.push('<div class="src">参考：' + escapeHtml(question.s) + '</div>');
      lines.push('</li>');
    });
    lines.push('</ol>');

    if (data && data.refs && data.refs.length) {
      lines.push('<h2>本章参考</h2><ul>');
      data.refs.forEach(function (ref) {
        lines.push('<li>' + escapeHtml(ref.label) + (ref.url ? ' — <a href="' + escapeHtml(ref.url) + '">' + escapeHtml(ref.url) + '</a>' : '') + '</li>');
      });
      lines.push('</ul>');
    }
    lines.push('</body></html>');

    var blob = new Blob([lines.join('\n')], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = chapterId + '-' + kind + '.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('已生成原题与答案解析，检查浏览器的下载。', 5000);
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  setHeader();
  renderModes();

  window.addEventListener('beforeunload', function () {
    stopTimer();
  });
})();
