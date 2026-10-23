/**
 * practice.js · 三档练习与章节大测（v2）
 *
 * 支持三种题型：
 *   choice 选择题（o / a）
 *   fill   填空题（n / tol）
 *   long   大题（model / steps，交卷后按参考答案自评）
 *
 * 流程：选模式 → 答题（限时倒计时 + 每 25 分钟提醒）→ 交卷 →
 * 自动判分（大题自评）→ 保存成绩（登录时记录）→ 下载原题与答案。
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

  var TIERS = { easy: '简单', medium: '进阶', hard: '挑战' };

  var MODES = [
    { id: 'timed-graded', label: '限时测试（打分）', desc: '倒计时；交卷后判分，大题按参考答案自评。', timed: true, graded: true },
    { id: 'timed-answer', label: '限时测试（只对答案）', desc: '倒计时；交卷后只显示答案与解析，不判分。', timed: true, graded: false },
    { id: 'untimed-graded', label: '不限时（打分）', desc: '不设倒计时；交卷后判分并记录。', timed: false, graded: true },
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

  var SYMBOLS = [
    { cmd: 'alpha', ch: 'α' }, { cmd: 'beta', ch: 'β' }, { cmd: 'gamma', ch: 'γ' },
    { cmd: 'theta', ch: 'θ' }, { cmd: 'lambda', ch: 'λ' }, { cmd: 'mu', ch: 'μ' },
    { cmd: 'pi', ch: 'π' }, { cmd: 'sigma', ch: 'σ' }, { cmd: 'Sigma', ch: 'Σ' },
    { cmd: 'sqrt', ch: '√' }, { cmd: 'int', ch: '∫' }, { cmd: 'infty', ch: '∞' },
    { cmd: 'le', ch: '≤' }, { cmd: 'ge', ch: '≥' }, { cmd: 'ne', ch: '≠' },
    { cmd: 'approx', ch: '≈' }, { cmd: 'to', ch: '→' }, { cmd: 'times', ch: '×' },
    { cmd: 'cdot', ch: '·' }, { cmd: 'pm', ch: '±' }, { cmd: 'in', ch: '∈' },
    { cmd: 'R', ch: 'ℝ' }, { cmd: '^2', ch: '²' }, { cmd: '^3', ch: '³' },
    { cmd: '^-1', ch: '⁻¹' }
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
    selfGrades: [],
    index: 0,
    submitted: false,
    saved: false,
    startAt: 0,
    endsAt: 0,
    timerId: null,
    encouraged: 0,
    toastTimer: null,
    refreshScore: null
  };

  /* ------------------------------------------------------------------ *
   * 工具
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

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function typeOf(question) {
    if (question.type) return question.type;
    if (typeof question.n === 'number') return 'fill';
    if (question.o) return 'choice';
    return 'long';
  }

  function pointsOf(question) {
    if (typeof question.p === 'number') return question.p;
    var n = state.questions.length || 1;
    return (kind === 'test' ? 200 : 100) / n;
  }

  function totalPoints() {
    return state.questions.reduce(function (sum, question) {
      return sum + pointsOf(question);
    }, 0);
  }

  function formatTime(seconds) {
    var s = Math.max(0, Math.round(seconds));
    var m = Math.floor(s / 60);
    var rest = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (rest < 10 ? '0' : '') + rest;
  }

  function correctLabel(question) {
    var type = typeOf(question);
    if (type === 'fill') return String(question.n);
    if (type === 'long') return question.model || '';
    return question.o && question.o[question.a] != null ? question.o[question.a] : '';
  }

  function answerLabel(question, answer) {
    if (answer === null || answer === undefined || answer === '') return '未作答';
    var type = typeOf(question);
    if (type === 'fill') return String(answer);
    if (type === 'long') return String(answer);
    var index = Number(answer);
    if (!Number.isFinite(index) || !question.o || !question.o[index]) return '未作答';
    return question.o[index];
  }

  /* ------------------------------------------------------------------ *
   * 提示
   * ------------------------------------------------------------------ */

  function toast(message, duration) {
    var node = document.querySelector('.practice-toast');
    if (!node) {
      node = el('div', 'practice-toast');
      node.setAttribute('role', 'status');
      document.body.appendChild(node);
    }
    var petKind = null;
    try { petKind = window.localStorage.getItem('la-pet'); } catch (error) { petKind = null; }
    node.textContent = '';
    if (petKind) {
      var petEmoji = { cat: '🐱', dog: '🐶', lion: '🦁', tiger: '🐯', spider: '🕷️', dino: '🦖' }[petKind];
      if (petEmoji) node.appendChild(el('span', 'toast-pet', petEmoji));
    }
    node.appendChild(document.createTextNode(message));
    node.classList.add('is-visible');
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      node.classList.remove('is-visible');
    }, duration || 7000);
  }

  /* ------------------------------------------------------------------ *
   * 公式输入框
   * ------------------------------------------------------------------ */

  function insertAtCursor(field, text) {
    var start = field.selectionStart || 0;
    var end = field.selectionEnd || 0;
    var value = field.value;
    field.value = value.slice(0, start) + text + value.slice(end);
    var caret = start + text.length;
    field.setSelectionRange(caret, caret);
    field.focus();
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function createMathField(initial, onChange) {
    var wrap = el('div', 'math-field');

    var toolbar = el('div', 'math-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', '数学符号');
    SYMBOLS.forEach(function (symbol) {
      var button = el('button', 'math-symbol', symbol.ch);
      button.type = 'button';
      button.title = '\\' + symbol.cmd;
      button.addEventListener('click', function () {
        insertAtCursor(area, symbol.ch);
      });
      toolbar.appendChild(button);
    });
    wrap.appendChild(toolbar);

    var area = el('textarea', 'math-area');
    area.rows = 4;
    area.value = initial || '';
    area.placeholder = '在这里写推导。输入 \\alpha 会变成 α，空格或 Tab 补全。';
    area.setAttribute('aria-label', '大题作答');
    area.addEventListener('input', function () {
      onChange(area.value);
      showSuggestions();
    });
    area.addEventListener('keydown', function (event) {
      if (!suggestBox.hidden && (event.key === 'Tab' || event.key === 'Enter')) {
        event.preventDefault();
        applySuggestion(suggestions[0]);
        return;
      }
      if (event.key === 'Escape' && !suggestBox.hidden) {
        suggestBox.hidden = true;
      }
    });
    wrap.appendChild(area);

    var suggestBox = el('div', 'math-suggest');
    suggestBox.hidden = true;
    wrap.appendChild(suggestBox);

    var hint = el('p', 'math-hint', '快捷键：\\alpha → α，\\sqrt → √，\\le → ≤；Tab / Enter 补全，工具栏可直接点。');
    wrap.appendChild(hint);

    var suggestions = [];

    function currentCommand() {
      var before = area.value.slice(0, area.selectionStart);
      var match = before.match(/\\[a-zA-Z^0-9-]*$/);
      return match ? match[0] : null;
    }

    function showSuggestions() {
      var token = currentCommand();
      if (!token) {
        suggestBox.hidden = true;
        return;
      }
      var query = token.slice(1).toLowerCase();
      suggestions = SYMBOLS.filter(function (symbol) {
        return symbol.cmd.toLowerCase().indexOf(query) === 0;
      }).slice(0, 6);
      if (!suggestions.length) {
        suggestBox.hidden = true;
        return;
      }
      suggestBox.innerHTML = '';
      suggestions.forEach(function (symbol, index) {
        var item = el('button', 'math-suggest-item');
        item.type = 'button';
        item.innerHTML = '<b>' + symbol.ch + '</b><span>\\' + symbol.cmd + '</span>' + (index === 0 ? '<i>Tab</i>' : '');
        item.addEventListener('mousedown', function (event) {
          event.preventDefault();
          applySuggestion(symbol);
        });
        suggestBox.appendChild(item);
      });
      suggestBox.hidden = false;
    }

    function applySuggestion(symbol) {
      if (!symbol) return;
      var token = currentCommand();
      if (!token) return;
      var start = area.selectionStart - token.length;
      var value = area.value;
      area.value = value.slice(0, start) + symbol.ch + value.slice(area.selectionStart);
      var caret = start + symbol.ch.length;
      area.setSelectionRange(caret, caret);
      suggestBox.hidden = true;
      area.focus();
      onChange(area.value);
    }

    area.addEventListener('keyup', function (event) {
      if (event.key === ' ') expandCommand();
    });

    function expandCommand() {
      var before = area.value.slice(0, area.selectionStart);
      var match = before.match(/\\[a-zA-Z^0-9-]+$/);
      if (!match) return;
      var cmd = match[0].slice(1);
      var found = SYMBOLS.filter(function (symbol) { return symbol.cmd === cmd; })[0];
      if (!found) return;
      var start = area.selectionStart - match[0].length;
      area.value = area.value.slice(0, start) + found.ch + area.value.slice(area.selectionStart);
      var caret = start + found.ch.length;
      area.setSelectionRange(caret, caret);
      onChange(area.value);
    }

    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * 页面头部与模式
   * ------------------------------------------------------------------ */

  function setHeader() {
    var isTest = kind === 'test';
    var label = isTest ? '章节大测' : '本节练习 · ' + (TIERS[tier] || '简单');
    titleEl.textContent = chapter.title + ' · ' + label;
    eyebrowEl.textContent = isTest ? 'CHAPTER TEST · 200 分 · 约 2.5 小时' : 'PRACTICE · 百分制 · 约 1.5 小时';
    ledeEl.textContent = isTest
      ? '覆盖整章：23 题，满分 200。选择、填空、大题都有，先选一种测试方式。'
      : '对应本章知识点：17 题，百分制，含选择、填空与需要写推导的大题。';
    backEl.href = chapter.page;
    backEl.textContent = '← 回到「' + chapter.title + '」';
    document.title = chapter.title + ' · ' + label + ' · Linear Algebra';
  }

  function currentSet() {
    if (!data) return [];
    if (kind === 'test') return data.test || [];
    return (data.practice && data.practice[tier]) || [];
  }

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
    hint.textContent = (kind === 'test' ? '限时 150 分钟' : '限时 90 分钟')
      + ' · 满分 ' + (kind === 'test' ? 200 : 100)
      + ' · 共 ' + currentSet().length + ' 题 · 交卷后可下载原题与答案解析';
    root.appendChild(hint);
  }

  /* ------------------------------------------------------------------ *
   * 答题
   * ------------------------------------------------------------------ */

  function startExam(mode) {
    state.mode = mode;
    state.questions = currentSet().slice();
    state.answers = state.questions.map(function () { return null; });
    state.selfGrades = state.questions.map(function () { return null; });
    state.index = 0;
    state.submitted = false;
    state.saved = false;
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
    var type = typeOf(question);

    var exam = el('div', 'exam');

    var head = el('div', 'exam-head');
    var meta = el('div', 'exam-meta');
    var kicker = el('span', 'exam-kicker');
    kicker.textContent = (kind === 'test' ? '章节大测 · 200 分' : '练习 · ' + (TIERS[tier] || '简单'))
      + ' · 本题 ' + pointsOf(question) + ' 分';
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

    if (type === 'choice') {
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
    } else if (type === 'fill') {
      var fillWrap = el('div', 'number-answer');
      var input = el('input');
      input.type = 'text';
      input.setAttribute('inputmode', 'decimal');
      input.setAttribute('aria-label', '填写数值答案');
      input.value = state.answers[state.index] == null ? '' : String(state.answers[state.index]);
      input.addEventListener('input', function () {
        state.answers[state.index] = input.value === '' ? null : input.value;
        updateDots();
      });
      fillWrap.appendChild(input);
      fillWrap.appendChild(el('span', null, '填数值即可，误差 ±0.01 内算对'));
      body.appendChild(fillWrap);
    } else {
      body.appendChild(createMathField(state.answers[state.index] || '', function (value) {
        state.answers[state.index] = value;
        updateDots();
      }));
    }

    exam.appendChild(body);

    var dots = el('div', 'exam-dots');
    state.questions.forEach(function (item, index) {
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
      if (state.index > 0) { state.index -= 1; renderExam(); }
    });
    var next = el('button', 'btn btn-small btn-ghost', '下一题');
    next.type = 'button';
    next.disabled = state.index >= state.questions.length - 1;
    next.addEventListener('click', function () {
      if (state.index < state.questions.length - 1) { state.index += 1; renderExam(); }
    });
    nav.appendChild(prev);
    nav.appendChild(next);
    foot.appendChild(nav);

    var submitBtn = el('button', 'btn btn-primary', '交卷');
    submitBtn.type = 'button';
    submitBtn.addEventListener('click', confirmSubmit);
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
   * 判分
   * ------------------------------------------------------------------ */

  function autoCorrect(question, answer) {
    var type = typeOf(question);
    if (type === 'fill') {
      var value = Number(answer);
      return Number.isFinite(value) && Math.abs(value - question.n) <= (question.tol == null ? 0.01 : question.tol);
    }
    if (type === 'choice') return Number(answer) === question.a;
    return false;
  }

  function gradeOf(question, index) {
    var type = typeOf(question);
    if (type !== 'long') return autoCorrect(question, state.answers[index]) ? 1 : 0;
    return state.selfGrades[index];
  }

  function computeScore() {
    var earned = 0;
    var full = 0;
    state.questions.forEach(function (question, index) {
      var grade = gradeOf(question, index);
      if (grade === 1) { earned += pointsOf(question); full += 1; }
      else if (grade === 0.5) { earned += pointsOf(question) / 2; }
    });
    return { earned: Math.round(earned), full: full };
  }

  function submit(auto) {
    if (state.submitted) return;
    state.submitted = true;
    stopTimer();
    var duration = Math.round((Date.now() - state.startAt) / 1000);
    renderResult({ auto: auto, duration: duration });
    if (!state.mode.graded) recordAttempt(duration);
  }

  function recordAttempt(duration) {
    if (!account) return;
    var payload = {
      kind: kind,
      chapter: chapterId,
      tier: kind === 'practice' ? tier : undefined,
      mode: state.mode.id,
      duration: duration
    };
    if (state.mode.graded) {
      var result = computeScore();
      payload.score = result.earned;
      payload.total = Math.round(totalPoints());
      payload.correctCount = result.full;
      payload.questionCount = state.questions.length;
    }
    account.record(payload);
  }

  function saveScore(duration) {
    if (!state.mode.graded || state.saved) return;
    recordAttempt(duration);
    state.saved = true;
    var button = document.querySelector('.save-score');
    if (button) {
      button.disabled = true;
      button.textContent = '已保存';
    }
    toast('成绩已保存到数据面板。', 4000);
  }

  /* ------------------------------------------------------------------ *
   * 结果与解析
   * ------------------------------------------------------------------ */

  function countLong() {
    return state.questions.filter(function (question) { return typeOf(question) === 'long'; }).length;
  }

  function renderResult(meta) {
    clearRoot();
    var graded = state.mode.graded;
    var autoCount = state.questions.length - countLong();

    var card = el('div', 'result-card');
    card.appendChild(el('span', 'result-label', graded
      ? (kind === 'test' ? 'CHAPTER TEST' : 'PRACTICE')
      : 'ANSWER KEY ONLY'));

    var score = el('strong', 'result-score');
    var scoreText = el('span', 'result-score-value');
    score.appendChild(scoreText);
    if (graded) score.appendChild(el('small', null, ' / ' + Math.round(totalPoints())));
    card.appendChild(score);

    var note = el('p', 'result-note');
    card.appendChild(note);

    var actions = el('div', 'result-actions');

    var fill = null;
    var gradeNote = null;

    if (graded) {
      var meter = el('div', 'result-meter');
      fill = el('span');
      meter.appendChild(fill);
      card.appendChild(meter);

      gradeNote = el('p', 'result-note grade-note');
      card.appendChild(gradeNote);

      var save = el('button', 'btn btn-primary save-score', '保存成绩');
      save.type = 'button';
      save.addEventListener('click', function () { saveScore(meta.duration); });
      actions.appendChild(save);

      state.refreshScore = function () {
        var result = computeScore();
        scoreText.textContent = String(result.earned);
        fill.style.width = Math.round((result.earned / Math.max(1, totalPoints())) * 100) + '%';
        var pending = state.questions.filter(function (question, index) {
          return typeOf(question) === 'long' && state.selfGrades[index] === null;
        }).length;
        note.textContent = '自动判分 ' + autoCount + ' 题，大题自评 '
          + (countLong() - pending) + ' / ' + countLong() + ' 题。'
          + (meta.auto ? '（时间到，自动交卷）' : '');
        gradeNote.textContent = pending
          ? '还有 ' + pending + ' 道大题没自评；保存前按 0 分计算。'
          : '全部大题已自评，可以保存成绩。';
      };
      state.refreshScore();
    } else {
      note.textContent = '你选了「只对答案」：这里只给答案与解析，不给分数，也不计入正确率。';
    }

    card.appendChild(actions);

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

    if (!account || !account.state || !account.state.user) {
      card.appendChild(el('p', 'result-note', '未登录：成绩不会记录，但可以下载原题与答案解析。'));
    }

    root.appendChild(card);

    var review = el('div', 'review');
    review.appendChild(el('h2', null, '逐题解析'));

    state.questions.forEach(function (question, index) {
      var type = typeOf(question);
      var grade = gradeOf(question, index);
      var status = grade === 1 ? 'is-correct' : grade === 0.5 ? 'is-partial' : (type === 'long' && grade === null ? 'is-open' : 'is-wrong');
      var item = el('div', 'review-item ' + (graded ? status : 'is-open'));

      var head = el('div', 'review-head');
      head.appendChild(el('b', null, '第 ' + (index + 1) + ' 题 · ' + pointsOf(question) + ' 分'));
      head.appendChild(el('span', null, graded
        ? (grade === 1 ? '答对' : grade === 0.5 ? '部分' : (type === 'long' && grade === null ? '待自评' : '答错'))
        : '答案'));
      item.appendChild(head);

      item.appendChild(el('p', 'review-q', question.q || ''));

      if (type === 'long') {
        var your = el('div', 'review-answer');
        your.innerHTML = '<b>你的作答</b><pre>' + escapeHtml(answerLabel(question, state.answers[index])) + '</pre>';
        item.appendChild(your);
      } else {
        var yourLine = el('p', 'review-line');
        yourLine.innerHTML = '你的答案：<b>' + escapeHtml(answerLabel(question, state.answers[index])) + '</b>';
        item.appendChild(yourLine);
      }

      var right = el('p', 'review-line');
      right.innerHTML = '参考答案：<b>' + escapeHtml(correctLabel(question)) + '</b>';
      item.appendChild(right);

      if (question.steps) item.appendChild(el('p', 'review-explain', question.steps));
      else if (question.e) item.appendChild(el('p', 'review-explain', question.e));

      if (type === 'long' && graded) {
        var self = el('div', 'self-grade');
        self.appendChild(el('span', null, '对照参考答案自评：'));
        [[1, '答对'], [0.5, '部分对'], [0, '答错']].forEach(function (pair) {
          var button = el('button', 'self-btn', pair[1]);
          button.type = 'button';
          if (state.selfGrades[index] === pair[0]) button.classList.add('is-active');
          button.addEventListener('click', function () {
            state.selfGrades[index] = pair[0];
            Array.prototype.forEach.call(self.querySelectorAll('.self-btn'), function (other) {
              other.classList.remove('is-active');
            });
            button.classList.add('is-active');
            item.className = 'review-item ' + (pair[0] === 1 ? 'is-correct' : pair[0] === 0.5 ? 'is-partial' : 'is-wrong');
            if (state.refreshScore) state.refreshScore();
          });
          self.appendChild(button);
        });
        item.appendChild(self);
      }

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

  /* ------------------------------------------------------------------ *
   * 下载
   * ------------------------------------------------------------------ */

  function downloadPaper() {
    var title = chapter.title + ' · ' + (kind === 'test' ? '章节大测（200 分）' : '练习 · ' + (TIERS[tier] || '简单'));
    var lines = [];
    lines.push('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">');
    lines.push('<title>' + escapeHtml(title) + ' · 原题与答案解析</title>');
    lines.push('<style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7;max-width:780px;margin:40px auto;padding:0 20px;color:#2e312c}');
    lines.push('h1{font-size:22px}h2{font-size:17px;margin-top:28px}li{margin:6px 0}.ans{color:#556657}.exp{color:#6d7068;font-size:14px}');
    lines.push('.src{color:#96988e;font-size:12px}pre{white-space:pre-wrap;background:#f6f1e7;padding:10px;border-radius:8px}</style></head><body>');
    lines.push('<h1>' + escapeHtml(title) + ' · 原题与答案解析</h1>');
    lines.push('<p class="src">来自 Linear Algebra 开源项目 · 仅供个人学习</p>');

    lines.push('<h2>题目</h2><ol>');
    state.questions.forEach(function (question) {
      lines.push('<li>' + escapeHtml(question.q || '') + '（' + pointsOf(question) + ' 分）</li>');
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
      if (question.steps) lines.push('<div class="exp">' + escapeHtml(question.steps) + '</div>');
      else if (question.e) lines.push('<div class="exp">' + escapeHtml(question.e) + '</div>');
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
