/**
 * entry-flow.js · 入口页的水平选择与路线
 *
 * 只负责“选水平 → 显示路线 → 跳转”。3D 场景由 entry-scene.js 负责。
 */
(function () {
  'use strict';

  var LEVELS = {
    zero: {
      label: '完全零基础',
      title: '从零开始',
      desc: '先认识箭头、相加和拉长，再看矩阵怎样搬动整个平面。每一步都从具体画面出发，不跳步。',
      cta: '从向量开始',
      href: 'pages/00-vectors.html?level=zero',
      steps: ['向量', '矩阵变换', '行列式', '秩', '特征向量', '方程组']
    },
    some: {
      label: '略有了解',
      title: '从方法到应用',
      desc: '跳过最基础的箭头，直接从矩阵、面积、秩和特征方向讲起，再走到物理里的应用。',
      cta: '从行列式开始',
      href: 'pages/02-determinant.html?level=some',
      steps: ['行列式', '秩', '特征向量', '方程组', '物理', '刚体旋转', '量子态', '投入产出']
    },
    learned: {
      label: '有扎实的基础',
      title: '直接进应用',
      desc: '不再重复定义。直接从物理里的受力分解开始，把已经学过的矩阵和方程组用起来。',
      cta: '进入物理应用',
      href: 'pages/applications/physics.html?level=learned',
      steps: ['物理', '刚体旋转', '量子态', '投入产出', '经济', '计算机', '美术', '音乐', '社会科学'],
      futureFrom: 4
    }
  };

  var picker = document.querySelector('.level-picker');
  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-level]'));
  var path = document.getElementById('entry-path');
  var pathTitle = document.getElementById('path-title');
  var pathDesc = document.getElementById('path-desc');
  var pathSteps = document.getElementById('path-steps');
  var pathStart = document.getElementById('path-start');
  var pathChange = document.getElementById('path-change');
  var pathLevel = document.getElementById('path-level');
  var choice = document.querySelector('.entry-choice');
  var selected = null;

  function selectLevel(level) {
    var data = LEVELS[level];
    if (!data) return;
    selected = level;

    buttons.forEach(function (button) {
      var active = button.getAttribute('data-level') === level;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (choice) choice.classList.add('has-selection');
    if (pathLevel) pathLevel.textContent = data.label;
    if (pathTitle) pathTitle.textContent = data.title;
    if (pathDesc) pathDesc.textContent = data.desc;
    if (pathStart) {
      pathStart.href = data.href;
      pathStart.innerHTML = data.cta + ' <span aria-hidden="true">→</span>';
    }

    if (pathSteps) {
      pathSteps.innerHTML = '';
      data.steps.forEach(function (step, index) {
        var item = document.createElement('span');
        item.className = 'path-step';
        if (data.futureFrom != null && index >= data.futureFrom) {
          item.classList.add('is-muted');
        }
        item.textContent = step;
        pathSteps.appendChild(item);
      });
    }

    if (path) {
      path.hidden = false;
      window.requestAnimationFrame(function () {
        path.classList.add('is-visible');
      });
    }

    if (window.EntryScene) window.EntryScene.setLevel(level);

    try {
      localStorage.setItem('lin-alg-level', level);
    } catch (error) {
      // 存储不可用时仍然可以继续。
    }
  }

  function clearSelection() {
    selected = null;
    buttons.forEach(function (button) {
      button.classList.remove('is-selected');
      button.setAttribute('aria-pressed', 'false');
    });
    if (choice) choice.classList.remove('has-selection');
    if (path) {
      path.classList.remove('is-visible');
      path.hidden = true;
    }
    if (window.EntryScene) window.EntryScene.reset();
    if (picker) picker.querySelector('[data-level]').focus();
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      selectLevel(button.getAttribute('data-level'));
    });

    // 指针经过时，让三维平面先“呼吸”一下；离开后回到已选状态。
    button.addEventListener('pointerenter', function () {
      if (window.EntryScene) window.EntryScene.setLevel(button.getAttribute('data-level'));
    });
    button.addEventListener('pointerleave', function () {
      if (window.EntryScene) window.EntryScene.setLevel(selected);
    });
  });

  if (pathChange) {
    pathChange.addEventListener('click', clearSelection);
  }

  if (pathStart) {
    pathStart.addEventListener('click', function () {
      if (selected) {
        try {
          localStorage.setItem('lin-alg-level', selected);
        } catch (error) {
          // 不影响跳转。
        }
      }
    });
  }

  // 支持键盘左右切换，保持“选择”而不是表单的感觉。
  if (picker) {
    picker.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      var current = buttons.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      var next = event.key === 'ArrowRight'
        ? (current + 1) % buttons.length
        : (current - 1 + buttons.length) % buttons.length;
      buttons[next].focus();
    });
  }
})();
