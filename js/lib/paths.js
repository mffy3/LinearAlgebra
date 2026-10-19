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
      pages: ['02-determinant', '03-rank', '04-eigenvector', '05-solve', 'physics', 'physics-rotation', 'physics-quantum', 'economics-leontief', 'economics-portfolio', 'software-convolution', 'software-pca', 'hardware-audio']
    },
    learned: {
      id: 'learned',
      label: '有扎实的基础',
      start: 'physics',
      pages: ['physics', 'physics-rotation', 'physics-quantum', 'economics-leontief', 'economics-portfolio', 'software-convolution', 'software-pca', 'hardware-audio', 'economics', 'computer', 'art', 'music', 'social']
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
    'physics-rotation': '刚体旋转',
    'physics-quantum': '量子态',
    'economics-leontief': '投入产出',
    'economics-portfolio': '投资组合',
    'software-convolution': '图像卷积',
    'software-pca': 'PCA 降维',
    'hardware-audio': '音频滤波',
    'economics': '经济',
    'computer': '计算机',
    'art': '美术',
    'music': '音乐',
    'social': '社会科学'
  };

  var formulas = {
    '01-transform': 'A e₁ = (a, c)，A e₂ = (b, d)',
    '02-determinant': '|det(A)| = 底 × 高',
    '03-rank': 'rank(A) + nullity(A) = 2',
    '04-eigenvector': 'det(A − λI) = 0',
    '05-solve': 'rank A = rank[A|b]',
    physics: 'T₁u + T₂v = −W',
    'physics-rotation': 'R(θ)ᵀR(θ) = I，det R = 1',
    'physics-quantum': '|α|² + |β|² = 1',
    'economics-leontief': 'x = (I − A)⁻¹ d',
    'economics-portfolio': 'σ² = wᵀΣw',
    'software-convolution': 'y = Σ kᵢⱼ xᵢⱼ',
    'software-pca': 'λ₁ / (λ₁ + λ₂)',
    'hardware-audio': 'y[n] = Σ h[k]x[n−k]'
  };

  var checklists = {
    zero: [
      '先动手，再看读数',
      '一次只改一个量',
      '看不懂就回到画布'
    ],
    some: [
      '先写公式，再代数字',
      '盯住符号和退化情况',
      '把结论和画面对上'
    ],
    learned: [
      '跳过定义，直接看结构',
      '用已经会的工具解',
      '把这一页接到应用上'
    ]
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
    'physics-rotation': {
      zero: {
        title: '应用篇 · 刚体旋转',
        body: 'R(θ) 只转方向，不改长度；换成普通矩阵，圆就会被压成椭圆。'
      },
      some: {
        title: '应用篇 · 刚体旋转',
        body: '正交矩阵保长、保角；用 RᵀR = I 和 det = 1 检查。'
      },
      learned: {
        title: '应用 2 / 13 · 刚体旋转',
        body: '直接看 R(θ)ᵀR(θ) = I；长度、夹角、det 都不变。'
      }
    },
    'physics-quantum': {
      zero: {
        title: '应用篇 · 量子态',
        body: '量子态是一个复向量；测量时才按 |α|²、|β|² 选一个结果。'
      },
      some: {
        title: '应用篇 · 量子态',
        body: '先抓住归一化：|α|² + |β|² = 1；相位 φ 不改变概率。'
      },
      learned: {
        title: '应用 3 / 13 · 量子态',
        body: '直接看 |ψ⟩ = α|0⟩ + β|1⟩ 与 Born 规则 p = |α|²。'
      }
    },
    'economics-leontief': {
      zero: {
        title: '应用篇 · 投入产出',
        body: '每个行业都要先买别人的产品，再满足最终需求；解 (I − A)x = d。'
      },
      some: {
        title: '应用篇 · 投入产出',
        body: '直接看 (I − A)⁻¹ d：A 是中间投入，逆矩阵把间接需求也算进去。'
      },
      learned: {
        title: '应用 4 / 13 · 投入产出',
        body: '直接解 (I − A)x = d；x = (I − A)⁻¹d，列是总需求乘数。'
      }
    },
    'economics-portfolio': {
      zero: {
        title: '应用篇 · 投资组合',
        body: '把两种资产混在一起，风险不是简单相加；协方差矩阵描述它们怎样一起动。'
      },
      some: {
        title: '应用篇 · 投资组合',
        body: '直接看 wᵀΣw：权重、协方差和相关性一起决定组合风险。'
      },
      learned: {
        title: '应用 5 / 13 · 投资组合',
        body: '直接看 Σ 的特征值/特征向量：风险主方向和可分散方向。'
      }
    },
    'software-convolution': {
      zero: {
        title: '应用篇 · 图像卷积',
        body: '每个输出像素，都是 3×3 输入窗口的加权和。'
      },
      some: {
        title: '应用篇 · 图像卷积',
        body: '卷积核就是一个 9 维线性函数；拖动窗口，看输出像素怎么变。'
      },
      learned: {
        title: '应用 6 / 13 · 图像卷积',
        body: '直接看 y = Σ kᵢⱼxᵢⱼ；核固定，窗口滑动就是局部线性映射。'
      }
    },
    'software-pca': {
      zero: {
        title: '应用篇 · PCA 降维',
        body: '把一堆点投影到最重要的方向上；协方差矩阵的特征向量就在找这个方向。'
      },
      some: {
        title: '应用篇 · PCA 降维',
        body: '直接看协方差矩阵的最大特征向量：它解释最多的方差。'
      },
      learned: {
        title: '应用 7 / 13 · PCA 降维',
        body: '直接看 λ₁/(λ₁+λ₂) 与一维重建误差。'
      }
    },
    'hardware-audio': {
      zero: {
        title: '应用篇 · 音频滤波',
        body: '把一段声音采样成向量；FIR 就是 5 个 tap 的滑动加权和。'
      },
      some: {
        title: '应用篇 · 音频滤波',
        body: '直接看 h0…h4：平滑核压高频，差分核反过来突出变化。'
      },
      learned: {
        title: '应用 8 / 13 · 音频滤波',
        body: '直接看 y[n] = Σ h[k]x[n−k]；拖动 tap 看频响变化。'
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
        title: '应用 1 / 13 · 物理',
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
    formulas: formulas,
    guides: guides,
    checklists: checklists,
    pageKey: pageKey,
    indexOf: indexOf,
    nextKey: nextKey
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
