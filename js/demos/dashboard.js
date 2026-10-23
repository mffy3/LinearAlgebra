/**
 * dashboard.js · 数据面板
 *
 * 从 /api/stats 取数据，用纯 Canvas 画柱状图、饼状图、折线图。
 * 不引入任何图表库：每张图都是几十行 2D 绘制。
 */
(function () {
  'use strict';

  var account = window.LinearAccount;
  if (!account) return;

  var CHAPTERS = [
    { id: '00-vectors', name: '向量与组合', short: '向量' },
    { id: '01-transform', name: '矩阵变换', short: '变换' },
    { id: '02-determinant', name: '行列式', short: '行列式' },
    { id: '03-rank', name: '秩与零空间', short: '秩' },
    { id: '04-eigenvector', name: '特征向量', short: '特征' },
    { id: '05-solve', name: '线性方程组', short: '方程' }
  ];

  var P = {
    ink: '#2e312c',
    muted: '#6d7068',
    faint: '#96988e',
    hairline: 'rgba(46, 49, 44, 0.12)',
    grid: 'rgba(46, 49, 44, 0.08)',
    sage: '#748676',
    sageSoft: 'rgba(116, 134, 118, 0.22)',
    clay: '#b07d6e',
    gold: '#bfa36a',
    danger: '#a45c55'
  };

  var els = {
    offline: document.getElementById('dash-offline'),
    login: document.getElementById('dash-login'),
    loginBtn: document.getElementById('dash-login-btn'),
    content: document.getElementById('dash-content'),
    account: document.getElementById('dash-account'),
    attempts: document.getElementById('kpi-attempts'),
    accuracy: document.getElementById('kpi-accuracy'),
    accuracyNote: document.getElementById('kpi-accuracy-note'),
    chapters: document.getElementById('kpi-chapters'),
    tests: document.getElementById('kpi-tests'),
    progress: document.getElementById('dash-progress-list'),
    logout: document.getElementById('btn-logout'),
    del: document.getElementById('btn-delete'),
    dialog: document.getElementById('delete-dialog'),
    form: document.getElementById('delete-form'),
    password: document.getElementById('delete-password'),
    error: document.getElementById('delete-error'),
    charts: {
      accuracy: document.getElementById('chart-accuracy'),
      pie: document.getElementById('chart-pie'),
      timeline: document.getElementById('chart-timeline'),
      scores: document.getElementById('chart-scores')
    }
  };

  var current = null;

  /* ------------------------------------------------------------------ *
   * 画布工具
   * ------------------------------------------------------------------ */

  function prepare(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var width = Math.max(1, Math.round(rect.width));
    var height = Math.max(1, Math.round(rect.height));
    var pixelW = Math.round(width * dpr);
    var pixelH = Math.round(height * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, w: width, h: height };
  }

  function text(ctx, value, x, y, options) {
    var opts = options || {};
    ctx.save();
    ctx.fillStyle = opts.color || P.muted;
    ctx.font = opts.font || '500 10px "Cascadia Code", Consolas, monospace';
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'middle';
    ctx.fillText(String(value), x, y);
    ctx.restore();
  }

  function empty(ctx, w, h, message) {
    text(ctx, message, w / 2, h / 2, {
      align: 'center',
      color: P.faint,
      font: '500 11px "Cascadia Code", Consolas, monospace'
    });
  }

  /* ------------------------------------------------------------------ *
   * 图表
   * ------------------------------------------------------------------ */

  function drawAccuracy(stats) {
    var surface = prepare(els.charts.accuracy);
    if (!surface) return;
    var ctx = surface.ctx;
    var w = surface.w;
    var h = surface.h;
    var pad = { left: 34, right: 10, top: 16, bottom: 40 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var rows = CHAPTERS.map(function (chapter) {
      var found = (stats.byChapter || []).filter(function (row) { return row.chapter === chapter.id; })[0];
      return {
        chapter: chapter,
        accuracy: found && found.accuracy !== null ? found.accuracy : null,
        graded: found ? found.graded : 0
      };
    });

    if (!rows.some(function (row) { return row.accuracy !== null; })) {
      empty(ctx, w, h, '还没有判过分的记录');
      return;
    }

    ctx.save();
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      var y = pad.top + plotH * (1 - t);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      text(ctx, Math.round(t * 100) + '%', pad.left - 6, y, { align: 'right', color: P.faint });
    });
    ctx.restore();

    var slot = plotW / rows.length;
    var barW = Math.min(44, slot * 0.5);

    rows.forEach(function (row, index) {
      var cx = pad.left + slot * (index + 0.5);
      if (row.accuracy === null) {
        text(ctx, '—', cx, pad.top + plotH - 8, { align: 'center', color: P.faint });
        return;
      }
      var barH = Math.max(3, row.accuracy * plotH);
      var y = pad.top + plotH - barH;
      ctx.save();
      ctx.fillStyle = P.sageSoft;
      ctx.strokeStyle = P.sage;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(cx - barW / 2, y, barW, barH);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      text(ctx, Math.round(row.accuracy * 100) + '%', cx, y - 9, { align: 'center', color: P.ink, font: '600 10px "Cascadia Code", Consolas, monospace' });
      text(ctx, row.graded + ' 题', cx, pad.top + plotH + 13, { align: 'center', color: P.faint });
    });

    rows.forEach(function (row, index) {
      var cx = pad.left + slot * (index + 0.5);
      text(ctx, row.chapter.short, cx, h - 8, { align: 'center', color: P.muted });
    });
  }

  function drawPie(stats) {
    var surface = prepare(els.charts.pie);
    if (!surface) return;
    var ctx = surface.ctx;
    var w = surface.w;
    var h = surface.h;
    var graded = stats.totals.graded || 0;
    var correct = stats.totals.correct || 0;
    var wrong = graded - correct;

    var cx = w / 2;
    var cy = h / 2 - 6;
    var radius = Math.max(30, Math.min(w, h) * 0.3);

    if (!graded) {
      ctx.save();
      ctx.strokeStyle = P.hairline;
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      empty(ctx, w, h, '还没有作答记录');
      return;
    }

    var start = -Math.PI / 2;
    [[correct, P.sage], [wrong, P.clay]].forEach(function (part) {
      var share = part[0] / graded;
      if (share <= 0) return;
      var end = start + share * Math.PI * 2;
      ctx.save();
      ctx.fillStyle = part[1];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      start = end;
    });

    ctx.save();
    ctx.fillStyle = '#faf6ee';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.56, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    text(ctx, Math.round((correct / graded) * 100) + '%', cx, cy - 2, {
      align: 'center', color: P.ink, font: '600 18px "Cascadia Code", Consolas, monospace'
    });
    text(ctx, '正确率', cx, cy + 16, { align: 'center', color: P.muted });

    text(ctx, '对 ' + correct, cx - radius, h - 6, { color: P.sage });
    text(ctx, '错 ' + wrong, cx + radius, h - 6, { align: 'right', color: P.clay });
  }

  function drawTimeline(stats) {
    var surface = prepare(els.charts.timeline);
    if (!surface) return;
    var ctx = surface.ctx;
    var w = surface.w;
    var h = surface.h;
    var pad = { left: 30, right: 12, top: 16, bottom: 24 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var days = [];
    var today = new Date();
    for (var i = 13; i >= 0; i--) {
      var d = new Date(today.getTime() - i * 86400000);
      var key = d.toISOString().slice(0, 10);
      var found = (stats.timeline || []).filter(function (row) { return row.day === key; })[0];
      days.push({ key: key, label: (d.getMonth() + 1) + '/' + d.getDate(), count: found ? found.count : 0 });
    }

    var max = Math.max.apply(null, days.map(function (d) { return d.count; }).concat([1]));

    ctx.save();
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach(function (t) {
      var y = pad.top + plotH * (1 - t);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      text(ctx, Math.round(t * max), pad.left - 6, y, { align: 'right', color: P.faint });
    });
    ctx.restore();

    var stepX = plotW / (days.length - 1);

    ctx.save();
    ctx.beginPath();
    days.forEach(function (day, index) {
      var x = pad.left + stepX * index;
      var y = pad.top + plotH * (1 - day.count / max);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(116, 134, 118, 0.14)';
    ctx.fill();

    ctx.beginPath();
    days.forEach(function (day, index) {
      var x = pad.left + stepX * index;
      var y = pad.top + plotH * (1 - day.count / max);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = P.sage;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    days.forEach(function (day, index) {
      var x = pad.left + stepX * index;
      var y = pad.top + plotH * (1 - day.count / max);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = P.sage;
      ctx.fill();
      ctx.restore();
      if (index % 3 === 0 || index === days.length - 1) {
        text(ctx, day.label, x, h - 8, { align: 'center', color: P.faint });
      }
    });
  }

  function drawScores(stats) {
    var surface = prepare(els.charts.scores);
    if (!surface) return;
    var ctx = surface.ctx;
    var w = surface.w;
    var h = surface.h;
    var pad = { left: 34, right: 12, top: 16, bottom: 24 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var points = (stats.scores || []).filter(function (row) {
      return row.total > 0;
    });

    if (!points.length) {
      empty(ctx, w, h, '还没有测试记录');
      return;
    }

    ctx.save();
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach(function (t) {
      var y = pad.top + plotH * (1 - t);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      text(ctx, Math.round(t * 100) + '%', pad.left - 6, y, { align: 'right', color: P.faint });
    });
    ctx.restore();

    var stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

    ctx.save();
    ctx.beginPath();
    points.forEach(function (point, index) {
      var ratio = point.score / point.total;
      var x = pad.left + (points.length > 1 ? stepX * index : plotW / 2);
      var y = pad.top + plotH * (1 - ratio);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    points.forEach(function (point, index) {
      var ratio = point.score / point.total;
      var x = pad.left + (points.length > 1 ? stepX * index : plotW / 2);
      var y = pad.top + plotH * (1 - ratio);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = P.gold;
      ctx.fill();
      ctx.strokeStyle = 'rgba(250, 246, 238, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });

    text(ctx, points.length + ' 次', pad.left + plotW, h - 8, { align: 'right', color: P.faint });
  }

  /* ------------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------------ */

  function renderAccount(state) {
    if (!els.account) return;
    els.account.innerHTML = '';

    if (state.mode === 'offline') {
      var p = document.createElement('p');
      p.innerHTML = '<strong>离线</strong>';
      els.account.appendChild(p);
      var hint = document.createElement('p');
      hint.textContent = '这个浏览器不允许本地存储，账号与记录暂时不可用。';
      els.account.appendChild(hint);
      return;
    }

    if (!state.user) {
      var p2 = document.createElement('p');
      p2.innerHTML = '<strong>未登录</strong>';
      els.account.appendChild(p2);
      var hint2 = document.createElement('p');
      hint2.textContent = '登录后才有记录；不登录也能用全部内容。';
      els.account.appendChild(hint2);
      return;
    }

    var p3 = document.createElement('p');
    p3.innerHTML = '<strong>' + escapeHtml(state.user.username) + '</strong>';
    els.account.appendChild(p3);
    var meta = document.createElement('p');
    meta.textContent = '账号创建于 ' + formatDate(state.user.created_at)
      + (state.mode === 'local' ? ' · 本机账号（只在这个浏览器里）' : ' · 数据只在这台电脑上');
    els.account.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'dash-account-actions';
    var back = document.createElement('a');
    back.className = 'btn btn-small btn-ghost';
    back.href = '../index.html';
    back.textContent = '回到入口';
    actions.appendChild(back);
    els.account.appendChild(actions);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function renderKpis(stats) {
    els.attempts.textContent = String(stats.totals.attempts || 0);
    if (stats.totals.accuracy === null) {
      els.accuracy.textContent = '—';
      els.accuracyNote.textContent = '还没有判过分的记录';
    } else {
      els.accuracy.textContent = Math.round(stats.totals.accuracy * 100) + '%';
      els.accuracyNote.textContent = '对 ' + stats.totals.correct + ' / 共 ' + stats.totals.graded + ' 题';
    }
    var visited = new Set((stats.progress || []).map(function (row) { return row.chapter; }));
    els.chapters.textContent = visited.size + ' / ' + CHAPTERS.length;
    els.tests.textContent = String((stats.scores || []).length);
  }

  function renderProgress(stats) {
    var byChapter = {};
    (stats.progress || []).forEach(function (row) { byChapter[row.chapter] = row; });

    els.progress.innerHTML = '';
    CHAPTERS.forEach(function (chapter) {
      var row = byChapter[chapter.id];
      var status = row ? row.status : 'none';
      var labels = { none: '未开始', visited: '看过', practiced: '练过', tested: '测过' };

      var item = document.createElement('li');
      item.className = 'dash-progress-item is-' + status;
      var name = document.createElement('b');
      name.textContent = chapter.name;
      var tag = document.createElement('span');
      tag.textContent = labels[status] || status;
      item.appendChild(name);
      item.appendChild(tag);
      els.progress.appendChild(item);
    });
  }

  function renderCharts(stats) {
    drawAccuracy(stats);
    drawPie(stats);
    drawTimeline(stats);
    drawScores(stats);
  }

  function load() {
    if (!account.state.user) {
      current = null;
      return Promise.resolve(null);
    }
    return account.stats().then(function (stats) {
      current = stats;
      renderKpis(stats);
      renderProgress(stats);
      renderCharts(stats);
      return stats;
    }).catch(function (error) {
      console.error('[dashboard]', error);
      return null;
    });
  }

  function renderShell() {
    var state = account.state;
    var ready = !!state.user;
    var usable = state.mode !== 'offline';

    renderAccount(state);
    if (els.offline) els.offline.hidden = usable || !!state.user;
    if (els.login) els.login.hidden = !(usable && !state.user);
    if (els.content) els.content.hidden = !ready;

    if (ready) load();
  }

  /* ------------------------------------------------------------------ *
   * 事件
   * ------------------------------------------------------------------ */

  if (els.loginBtn) {
    els.loginBtn.addEventListener('click', function () { account.openDialog('login'); });
  }

  if (els.logout) {
    els.logout.addEventListener('click', function () {
      account.logout().then(renderShell);
    });
  }

  if (els.del && els.dialog) {
    els.del.addEventListener('click', function () {
      if (els.error) els.error.textContent = '';
      if (els.password) els.password.value = '';
      if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    });
  }

  if (els.form) {
    els.form.addEventListener('submit', function (event) {
      var submitter = event.submitter;
      if (!submitter || submitter.value !== 'confirm') return;
      event.preventDefault();

      var password = els.password ? els.password.value : '';
      if (!password) {
        els.error.textContent = '请输入密码。';
        return;
      }

      account.deleteAccount(password).then(function () {
        els.dialog.close();
        account.state.user = null;
        renderShell();
      }).catch(function (error) {
        if (els.error) els.error.textContent = error.message;
      });
    });
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (!current) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () { renderCharts(current); }, 120);
  });

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  account.onChange(renderShell);
  account.init().then(renderShell);
})();
