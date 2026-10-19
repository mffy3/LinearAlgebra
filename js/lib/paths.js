/**
 * paths.js · 三条学习路线的唯一配置
 *
 * 入口页负责展示，展厅页负责在顶部插入“当前路线”提示。
 * 页面顺序、标签、每一站的引导文案都集中在这里。
 */
(function (global) {
  'use strict';

  var levels = {
    zero: {
      id: 'zero',
      label: '完全零基础',
      start: '00-vectors',
      pages: ['00-vectors', '01-transform', '02-determinant', '03-rank', '04-eigenvector', '05-solve']
    },
    some: {
      id: 'some',
      label: '略有了解',
      start: '02-determinant',
      pages: ['02-determinant', '03-rank', '04-eigenvector', '05-solve', 'physics']
    },
    learned: {
      id: 'learned',
      label: '有扎实的基础',
      start: 'physics',
      pages: ['physics', 'economics', 'computer', 'art', 'music', 'social']
    }
  };

  var labels = {
    '00-vectors': '向量',
    '01-transform': '矩阵变换',
    '02-determinant': '行列式',
    '03-rank': '秩与零空间',
    '04-eigenvector': '特征向量',
    '05-solve': '线性方程组',
    'physics': '物理',
    'economics': '经济',
    'computer': '计算机',
    'art': '美术',
    'music': '音乐',
    'social': '社会科学'
  };

  // 每一页、每一个水平的引导文案。没有配置的页使用 fallback。
  var guides = {
    '00-vectors': {
      zero: {
        title: '第 1 站 · 先认识箭头',
        body: '这一页不出现矩阵。先拖 u、v，调 α、β，把“相加”和“拉长”变成手上的动作。'
      },
      some: {
        title: '你可以跳过这一页',
        body: '向量与组合是后面的语言，但不必在这里停太久；直接去行列式也可以。'
      },
      learned: {
        title: '直接去应用',
        body: '这条路线从应用开始；这里只是补一个最基础的语言。'
      }
    },
    '01-transform': {
      zero: {
        title: '第 2 站 · 矩阵只是搬家',
        body: '先看 e₁、e₂ 被搬到哪里，整张网格只是跟着它们走。暂时不用背四个数字的含义。'
      },
      some: {
        title: '这一站不在你的路线里',
        body: '你已经可以跳过向量和矩阵的入门；回到行列式继续。'
      },
      learned: {
        title: '这一站不在你的路线里',
        body: '你的路线直接去应用；这里可以跳过。'
      }
    },
    '02-determinant': {
      zero: {
        title: '第 3 站 · 先看面积',
        body: '先盯着单位正方形怎么变成平行四边形；面积、符号和 ad − bc 的关系，等看见之后再算。'
      },
      some: {
        title: '第 1 站 · 行列式的方法',
        body: '直接看底 × 高、符号与可逆性：det = 0 时空间被压扁，负号表示翻面。'
      },
      learned: {
        title: '这一站不在你的路线里',
        body: '你的路线直接去应用；这里可以跳过。'
      }
    },
    '03-rank': {
      zero: {
        title: '第 4 站 · 哪些方向被压没了',
        body: '先找零空间，再看秩。秩不是“非零数字的个数”，而是输出空间还剩下几个独立方向。'
      },
      some: {
        title: '第 2 站 · 秩与四个子空间',
        body: '直接抓 rank + nullity = 2；列空间留下什么，零空间丢掉什么。'
      },
      learned: {
        title: '这一站不在你的路线里',
        body: '你的路线直接去应用；这里可以跳过。'
      }
    },
    '04-eigenvector': {
      zero: {
        title: '第 5 站 · 不肯转弯的方向',
        body: '先把 v 转一圈，找 Av 与 v 共线的瞬间；不要一上来就解 det(A − λI) = 0。'
      },
      some: {
        title: '第 3 站 · 特征值与特征向量',
        body: '直接看 det(A − λI) = 0、trace 与 det 的关系；复特征值表示旋转。'
      },
      learned: {
        title: '这一站不在你的路线里',
        body: '你的路线直接去应用；这里可以跳过。'
      }
    },
    '05-solve': {
      zero: {
        title: '第 6 站 · 两条线的交点',
        body: '先看两条线相交、平行或重合；再把三种结局对应到 det 和秩。'
      },
      some: {
        title: '第 4 站 · 方程组的三种结局',
        body: '直接看 rank[A|b] 与 rank A：相等才相容；差 1 就无解。'
      },
      learned: {
        title: '这一站不在你的路线里',
        body: '你的路线直接去应用；这里可以跳过。'
      }
    },
    physics: {
      zero: {
        title: '应用篇 · 物理',
        body: '把前面学的 Ax = b 用起来：两股张力就是两个未知数。'
      },
      some: {
        title: '应用篇 · 物理',
        body: '把前面学的 Ax = b 用起来：两股张力就是两个未知数。'
      },
      learned: {
        title: '应用 1 / 6 · 物理',
        body: '直接从方程开始：T₁u + T₂v = −W；不用再复习定义。'
      }
    }
  };

  function pageKey(pathname) {
    var name = String(pathname || '').split('/').pop() || '';
    if (name === 'physics.html') return 'physics';
    if (name === '00-vectors.html') return '00-vectors';
    return name.replace(/\.html$/, '');
  }

  function indexOf(level, key) {
    var pages = levels[level] && levels[level].pages;
    return pages ? pages.indexOf(key) : -1;
  }

  function nextKey(level, key) {
    var pages = levels[level] && levels[level].pages;
    if (!pages) return null;
    var index = pages.indexOf(key);
    if (index < 0 || index >= pages.length - 1) return null;
    return pages[index + 1];
  }

  global.LinAlgPaths = {
    levels: levels,
    labels: labels,
    guides: guides,
    pageKey: pageKey,
    indexOf: indexOf,
    nextKey: nextKey
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
