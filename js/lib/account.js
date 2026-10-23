/**
 * account.js · 本地账号
 *
 * 和 server/ 下的本地后端通信：登录、注册、退出、记录、统计。
 * 没有启动本地服务时（例如直接双击 index.html），整套登录会自动降级：
 * 页面照常使用，只提示「登录需要一个本地服务」。
 *
 * 产出：
 *   - 入口页右侧的账号卡（#entry-account）
 *   - 其它页面导航里的「登录 / 用户名」小入口
 *   - 登录 / 注册弹窗（说明 + 表单）
 */
(function (global) {
  'use strict';

  if (!global || !global.document) return;

  var Local = global.LocalAccount || null;

  var state = {
    online: null,     // null=还没检测，true/false=检测结果
    mode: 'offline',  // server / local / offline
    user: null,
    ready: false
  };

  var listeners = [];
  var modal = null;
  var pending = null;
  var focusReturn = null;

  /* ------------------------------------------------------------------ *
   * 请求
   * ------------------------------------------------------------------ */

  function api(path, options) {
    var opts = options || {};
    var init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {}
    };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    return global.fetch(path, init).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data && data.error ? data.error : '请求失败（' + response.status + '）');
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function checkHealth() {
    if (global.location.protocol === 'file:') {
      state.online = false;
      return Promise.resolve(false);
    }
    return global.fetch('/api/health', { cache: 'no-store' })
      .then(function (response) { return response.ok; })
      .catch(function () { return false; })
      .then(function (online) {
        state.online = online;
        return online;
      });
  }

  function loadMe() {
    if (!state.online) return Promise.resolve(null);
    return api('/api/me').then(function (data) {
      state.user = data.user || null;
      return state.user;
    }).catch(function () {
      state.user = null;
      return null;
    });
  }

  /* ------------------------------------------------------------------ *
   * 状态广播
   * ------------------------------------------------------------------ */

  function notify() {
    listeners.slice().forEach(function (fn) {
      try { fn(state); } catch (error) { console.error(error); }
    });
    render();
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () {
      var index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function whenReady(fn) {
    if (state.ready) return Promise.resolve(state).then(fn);
    return initPromise.then(function () { return fn(state); });
  }

  /* ------------------------------------------------------------------ *
   * 入口页账号卡 / 导航入口
   * ------------------------------------------------------------------ */

  function entryCard() {
    return document.getElementById('entry-account');
  }

  function renderEntryCard() {
    var card = entryCard();
    if (!card) return;

    var title = card.querySelector('[data-account-title]');
    var tag = card.querySelector('[data-account-tag]');
    var text = card.querySelector('[data-account-text]');
    var actions = card.querySelector('[data-account-actions]');

    if (!actions) return;
    actions.innerHTML = '';

    if (state.user) {
      if (tag) tag.textContent = '已登录';
      if (title) title.textContent = state.user.username;
      if (text) text.textContent = state.mode === 'local'
        ? '本机账号：记录只存在这个浏览器，换设备不同步。'
        : '你的答题、测试与学习进度都记在这台电脑上。';
      var dash = document.createElement('a');
      dash.className = 'btn btn-small entry-account-primary';
      dash.href = '/pages/dashboard.html';
      dash.textContent = '打开数据面板';
      actions.appendChild(dash);
      var out = document.createElement('button');
      out.type = 'button';
      out.className = 'entry-account-link';
      out.textContent = '退出登录';
      out.addEventListener('click', function () { logout(); });
      actions.appendChild(out);
      return;
    }

    if (state.mode !== 'offline') {
      if (tag) tag.textContent = state.mode === 'local' ? '本机账号' : '未登录';
      if (title) title.textContent = '你的账号';
      if (text) text.textContent = state.mode === 'local'
        ? '不用启动服务：注册后账号只存在这个浏览器，密码只保存加盐哈希。'
        : '不登录也能用全部功能。登录只是多一份只存在本机的使用记录。';
      var login = document.createElement('button');
      login.type = 'button';
      login.className = 'btn btn-small entry-account-primary';
      login.textContent = '登录 / 注册';
      login.addEventListener('click', function () { openDialog('login'); });
      actions.appendChild(login);
      var learn = document.createElement('button');
      learn.type = 'button';
      learn.className = 'entry-account-link';
      learn.textContent = '有什么区别？';
      learn.addEventListener('click', function () { openDialog('login'); });
      actions.appendChild(learn);
      return;
    }

    if (tag) tag.textContent = '离线';
    if (title) title.textContent = '本地账号';
    if (text) text.textContent = '这个浏览器不允许本地存储，账号与记录暂时不可用；全部内容照常使用。';
    var how = document.createElement('button');
    how.type = 'button';
    how.className = 'btn btn-small entry-account-primary';
    how.textContent = '怎么开启';
    how.addEventListener('click', function () { openDialog('login'); });
    actions.appendChild(how);
    var dash2 = document.createElement('a');
    dash2.className = 'entry-account-link';
    dash2.href = '/pages/dashboard.html';
    dash2.textContent = '数据面板';
    actions.appendChild(dash2);
  }

  function navTargets() {
    var targets = [];
    var nav = document.querySelector('.site-nav');
    if (nav) targets.push({ parent: nav, kind: 'nav' });
    var topLinks = document.querySelector('.entry-top-links');
    if (topLinks) targets.push({ parent: topLinks, kind: 'top' });
    return targets;
  }

  function renderNav() {
    navTargets().forEach(function (target) {
      var existing = target.parent.querySelector('.nav-account');
      if (existing) existing.remove();

      if (target.kind === 'top' && state.mode === 'offline' && !state.user) return;

      var node;
      if (state.user) {
        node = document.createElement('a');
        node.href = '/pages/dashboard.html';
        node.textContent = state.user.username;
        node.title = '打开数据面板';
      } else {
        node = document.createElement('button');
        node.type = 'button';
        node.textContent = state.mode !== 'offline' ? '登录' : '账号';
        node.addEventListener('click', function () { openDialog('login'); });
      }
      node.className = 'nav-account';
      target.parent.appendChild(node);
    });
  }

  function render() {
    renderEntryCard();
    renderNav();
  }

  /* ------------------------------------------------------------------ *
   * 弹窗
   * ------------------------------------------------------------------ */

  function buildModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'account-modal';
    modal.hidden = true;
    modal.innerHTML = [
      '<div class="account-backdrop" data-account-close></div>',
      '<div class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">',
      '  <button class="account-close" type="button" data-account-close aria-label="关闭">✕</button>',
      '  <p class="eyebrow">ACCOUNT · 只在本机</p>',
      '  <h2 id="account-title">登录 / 注册</h2>',
      '  <p class="account-lead">不登录也能用全部内容。登录只是多一份「用户使用数据库」：练习正确率、测试分数、学习进度，以及它们对应的图表。</p>',
      '  <div class="account-compare">',
      '    <div><h3>不登录</h3><ul><li>所有展厅、应用、练习照常使用</li><li>成绩与进度不被记录</li><li>不需要联网、不需要密码</li></ul></div>',
      '    <div><h3>登录之后</h3><ul><li>记录正确率、测试分数、学习进度</li><li>柱状图 / 饼状图 / 折线图查看</li><li>数据存放在这台电脑上</li></ul></div>',
      '  </div>',
      '  <div class="account-offline" data-account-offline hidden>',
      '    <h3>还没有启动本地服务</h3>',
      '    <p>账号与数据都保存在本机，需要一个只监听 127.0.0.1 的小服务：</p>',
      '    <ol><li>双击项目里的 <code>start-server.bat</code>（或运行 <code>node server/app.js</code>）</li>',
      '    <li>浏览器打开 <code>http://127.0.0.1:4173/</code></li>',
      '    <li>回到这个入口，就能注册与登录了</li></ol>',
      '    <p class="account-note">不启动也完全不影响看内容、拖画布、做练习。</p>',
      '  </div>',
      '  <div class="account-signed" data-account-signed hidden>',
      '    <p>已登录：<b data-account-name></b></p>',
      '    <div class="account-signed-actions">',
      '      <a class="btn btn-small" href="/pages/dashboard.html">打开数据面板</a>',
      '      <button class="btn btn-small btn-ghost" type="button" data-account-logout>退出登录</button>',
      '    </div>',
      '  </div>',
      '  <div class="account-tabs" role="tablist" aria-label="登录或注册">',
      '    <button type="button" role="tab" data-account-tab="login" aria-selected="true">登录</button>',
      '    <button type="button" role="tab" data-account-tab="register" aria-selected="false">注册</button>',
      '  </div>',
      '  <form class="account-form" data-account-form novalidate>',
      '    <label class="account-field"><span>用户名</span>',
      '      <input type="text" name="username" autocomplete="username" maxlength="24" required>',
      '    </label>',
      '    <label class="account-field"><span>密码</span>',
      '      <input type="password" name="password" autocomplete="current-password" maxlength="128" required>',
      '    </label>',
      '    <label class="account-field" data-account-confirm hidden><span>再输一次密码</span>',
      '      <input type="password" name="confirm" autocomplete="new-password" maxlength="128">',
      '    </label>',
      '    <p class="account-error" data-account-error role="alert"></p>',
      '    <button class="btn btn-primary account-submit" type="submit" data-account-submit>登录</button>',
      '  </form>',
      '  <p class="account-privacy">密码只保存加盐哈希；数据存在本机 <code>data/linear-algebra.db</code>，可以随时在数据面板里删除账号与全部记录。没有第三方统计、没有上报。</p>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-account-close]')) closeDialog();
      if (event.target.closest('[data-account-logout]')) logout();
    });

    modal.querySelectorAll('[data-account-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        setTab(button.getAttribute('data-account-tab'));
      });
    });

    modal.querySelector('[data-account-form]').addEventListener('submit', onSubmit);

    return modal;
  }

  function setTab(tab) {
    if (!modal) return;
    modal.querySelectorAll('[data-account-tab]').forEach(function (button) {
      button.setAttribute('aria-selected', String(button.getAttribute('data-account-tab') === tab));
    });
    var confirm = modal.querySelector('[data-account-confirm]');
    if (confirm) confirm.hidden = tab !== 'register';
    var submit = modal.querySelector('[data-account-submit]');
    if (submit) submit.textContent = tab === 'register' ? '注册并登录' : '登录';
    var password = modal.querySelector('input[name="password"]');
    if (password) {
      password.setAttribute('autocomplete', tab === 'register' ? 'new-password' : 'current-password');
    }
    setError('');
    modal.setAttribute('data-tab', tab);
  }

  function setError(message) {
    var node = modal && modal.querySelector('[data-account-error]');
    if (node) node.textContent = message || '';
  }

  function openDialog(tab) {
    buildModal();
    var signed = !!state.user;
    var usable = state.online || state.mode === 'local';
    modal.querySelector('[data-account-signed]').hidden = !signed;
    modal.querySelector('[data-account-form]').hidden = signed || !usable;
    modal.querySelector('.account-tabs').hidden = signed || !usable;
    modal.querySelector('[data-account-offline]').hidden = usable || signed;

    var kicker = modal.querySelector('.account-dialog .eyebrow');
    var lead = modal.querySelector('.account-lead');
    var privacy = modal.querySelector('.account-privacy');
    if (state.mode === 'local') {
      if (kicker) kicker.textContent = 'ACCOUNT · 本机账号（不联网）';
      if (lead) lead.textContent = '不用启动服务：账号只存在这个浏览器，密码只保存加盐哈希，数据不上传。';
      if (privacy) privacy.textContent = '本机账号：密码用 PBKDF2 加盐哈希保存在浏览器；换设备不同步，清除站点数据会一起清空。';
    } else {
      if (kicker) kicker.textContent = 'ACCOUNT · 只在本机';
      if (lead) lead.textContent = '不登录也能用全部内容。登录只是多一份「用户使用数据库」：练习正确率、测试分数、学习进度，以及它们对应的图表。';
      if (privacy) privacy.textContent = '密码只保存加盐哈希；数据存在本机 data/linear-algebra.db，可以随时在数据面板里删除账号与全部记录。没有第三方统计、没有上报。';
    }

    if (signed) {
      modal.querySelector('[data-account-name]').textContent = state.user.username;
    }

    setTab(tab || 'login');
    modal.hidden = false;
    document.body.classList.add('account-open');
    focusReturn = document.activeElement;

    var focusEl = signed
      ? modal.querySelector('[data-account-logout]')
      : (state.mode !== 'offline' ? modal.querySelector('input[name="username"]') : modal.querySelector('.account-close'));
    if (focusEl) {
      try { focusEl.focus({ preventScroll: true }); } catch (error) { focusEl.focus(); }
    }
  }

  function closeDialog() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('account-open');
    if (focusReturn && focusReturn.focus) {
      try { focusReturn.focus({ preventScroll: true }); } catch (error) { focusReturn.focus(); }
    }
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && modal && !modal.hidden) {
      event.preventDefault();
      closeDialog();
    }
  });

  /* ------------------------------------------------------------------ *
   * 表单
   * ------------------------------------------------------------------ */

  function onSubmit(event) {
    event.preventDefault();
    if (pending) return;

    var form = modal.querySelector('[data-account-form]');
    var data = new FormData(form);
    var username = String(data.get('username') || '').trim();
    var password = String(data.get('password') || '');
    var confirm = String(data.get('confirm') || '');
    var tab = modal.getAttribute('data-tab') || 'login';

    if (!username || !password) return setError('请填写用户名和密码。');
    if (tab === 'register' && password !== confirm) return setError('两次输入的密码不一样。');
    if (tab === 'register' && password.length < 8) return setError('密码至少 8 个字符。');

    setError('');
    pending = true;
    var submit = modal.querySelector('[data-account-submit]');
    if (submit) submit.disabled = true;

    var request;
    if (state.mode === 'local') {
      request = (tab === 'register' ? Local.register(username, password) : Local.login(username, password))
        .then(function (user) { return { user: user }; });
    } else {
      request = api(tab === 'register' ? '/api/register' : '/api/login', {
        method: 'POST',
        body: { username: username, password: password }
      });
    }
    request.then(function (result) {
      state.user = result.user;
      form.reset();
      closeDialog();
      notify();
    }).catch(function (error) {
      setError(error.message);
    }).then(function () {
      pending = false;
      if (submit) submit.disabled = false;
    });
  }

  function logout() {
    if (state.mode === 'local') {
      return Local.logout().then(function () {
        state.user = null;
        closeDialog();
        notify();
      });
    }
    if (!state.online) return Promise.resolve();
    return api('/api/logout', { method: 'POST' }).catch(function () { }).then(function () {
      state.user = null;
      closeDialog();
      notify();
    });
  }

  /* ------------------------------------------------------------------ *
   * 记录
   * ------------------------------------------------------------------ */

  function record(event) {
    if (!state.user || !event) return Promise.resolve(null);
    var payload = {
      kind: event.kind,
      chapter: event.chapter,
      correct: event.correct === undefined ? null : event.correct,
      score: event.score,
      total: event.total,
      tier: event.tier,
      mode: event.mode,
      duration: event.duration,
      correctCount: event.correctCount,
      questionCount: event.questionCount
    };
    if (state.mode === 'local') {
      return Local.record(payload).catch(function () { return null; });
    }
    if (!state.online) return Promise.resolve(null);
    return api('/api/events', { method: 'POST', body: payload }).catch(function () {
      return null;
    });
  }

  function stats() {
    if (!state.user) return Promise.reject(new Error('offline'));
    if (state.mode === 'local') return Local.stats();
    if (!state.online) return Promise.reject(new Error('offline'));
    return api('/api/stats');
  }

  function deleteAccount(password) {
    if (!state.user) return Promise.reject(new Error('未登录'));
    if (state.mode === 'local') return Local.deleteAccount(password);
    return api('/api/account/delete', { method: 'POST', body: { password: password } });
  }

  function getDecor() {
    if (state.mode === 'local') return Local.getDecor();
    return api('/api/decor').catch(function () { return { items: [] }; });
  }

  function putDecor(items) {
    if (state.mode === 'local') return Local.putDecor(items);
    return api('/api/decor', { method: 'PUT', body: { items: items } });
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  var initPromise = checkHealth().then(function (online) {
    if (online) {
      state.mode = 'server';
      return loadMe();
    }
    if (Local && Local.available()) {
      state.mode = 'local';
      state.user = Local.currentUser();
      return state.user;
    }
    state.mode = 'offline';
    return null;
  }).then(function () {
    state.ready = true;
    render();
    return state;
  });

  global.LinearAccount = {
    state: state,
    init: function () { return initPromise; },
    whenReady: whenReady,
    onChange: onChange,
    openDialog: openDialog,
    closeDialog: closeDialog,
    record: record,
    stats: stats,
    deleteAccount: deleteAccount,
    getDecor: getDecor,
    putDecor: putDecor,
    logout: logout
  };
})(typeof window !== 'undefined' ? window : null);
