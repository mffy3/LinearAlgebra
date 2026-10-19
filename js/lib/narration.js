/**
 * narration.js · 教授的即时批注
 *
 * 纯文本生成器：输入当前页面状态，返回 { text, prompt }。
 * 不碰 DOM，不碰 Canvas；页面控制器负责把结果写进教授批注卡。
 */
(function (global) {
  'use strict';

  function f(value, digits) {
    var d = digits == null ? 2 : digits;
    if (!Number.isFinite(value)) return '—';
    var text = value.toFixed(d);
    if (text.indexOf('.') >= 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
    if (text === '-0') text = '0';
    return text;
  }

  function transform(s) {
    var det = s.det;
    var rank = s.rank;
    var abs = Math.abs(det);

    if (abs < 1e-9) {
      return {
        text: '你看，网格被压成一条线了。平面上的信息丢了，逆矩阵也就不存在了——这不是算错，是空间真的扁了。',
        prompt: '只改 b，让这条线转起来；猜猜它和第一列是什么关系？'
      };
    }

    if (det < 0) {
      return {
        text: '行列式变负了。面积还在，只是空间翻了个面，像把一张纸翻过来。方格的颜色也在提醒你。',
        prompt: '把 a 从负改回正，看看“翻面”是怎么被撤销的。'
      };
    }

    if (s.identity) {
      return {
        text: '单位矩阵什么都没做。e₁ 和 e₂ 还站在原地；四个数里，只有对角线在说“原地不动”。',
        prompt: '先把 b 改成 1，别急着看结果——猜猜网格会往哪边倒？'
      };
    }

    if (s.scalar) {
      return {
        text: '这是一个标量矩阵：每个方向都被同一个倍数缩放。方向全都保住了，λ 就是这个倍数。',
        prompt: '把倍数改成 0.5，面积会变成原来的几倍？'
      };
    }

    return {
      text: '第一列 (' + f(s.a) + ', ' + f(s.c) + ') 是 e₁ 的新家，第二列 (' + f(s.b) + ', ' + f(s.d) + ') 是 e₂ 的新家。整张网格只是跟着这两个箭头走。',
      prompt: '先猜 b = 1 时网格往哪边倒，再改数字验证。'
    };
  }

  function determinant(s) {
    var area = s.area;
    var det = s.det;

    if (area < 1e-9) {
      return {
        text: '面积归零了。两条列向量共线，平行四边形被压成一条线段——空间少了一个维度，行列式当然就是 0。',
        prompt: '把 b 稍微改小一点，看面积怎样从 0 重新长出来。'
      };
    }

    if (det < 0) {
      return {
        text: '面积是 |det| = ' + f(area) + '，但符号是负的：方格被翻了个面。面积没丢，定向丢了。',
        prompt: '让 det 从负变正，观察方格的颜色和方向怎样一起变。'
      };
    }

    if (Math.abs(area - 1) < 1e-6) {
      return {
        text: '面积没变，还是 1。旋转和剪切都能做到这一点：形状变了，面积不变。行列式只记账，不关心形状。',
        prompt: '把 b 调到 2，面积还是 1 吗？先猜，再看读数。'
      };
    }

    return {
      text: '底 × 高 = |det|。这个矩阵把单位面积放大了 ' + f(area) + ' 倍；你现在看到的，就是面积在记账。',
      prompt: '把面积调到 2.00，看看是底在帮忙，还是高在帮忙。'
    };
  }

  function rank(s) {
    if (s.probeInNullspace) {
      return {
        text: 'Ax 归零了。x 正躺在那条被压掉的方向上——这就是零空间。它没有被送到别处，只是被送到了原点。',
        prompt: '把 x 往旁边挪一点，看看 Ax 怎样重新长出来。'
      };
    }

    if (s.rank === 0) {
      return {
        text: '整个平面都被压到原点了。列空间只剩 {0}，零空间却是整个平面——所有方向都丢了。',
        prompt: '把 a 改成 1，看看哪一条方向先被救回来。'
      };
    }

    if (s.rank === 1) {
      return {
        text: '秩是 1：平面被压成一条线。那条被压掉的方向，就是零空间；保留下来的一条，是列空间。',
        prompt: '把橙色 x 拖到 Null(A) 上，让 |Ax| 归零。'
      };
    }

    return {
      text: '满秩：两个方向都还在。列空间是整个平面，零空间只有零向量。可逆，也意味着没有信息被压掉。',
      prompt: '把矩阵改成秩 1，看看哪一条方向最先消失。'
    };
  }

  function eigen(s) {
    if (s.collinear) {
      var direction = s.negative ? '反向' : '同向';
      return {
        text: '找到了。Av 和 v 在同一条直线上，长度变成原来的 ' + f(s.ratio) + ' 倍，方向' + direction + '。λ 就是这个倍数——它只拉伸，不转弯。',
        prompt: '再把 v 转到另一条特征方向，看看另一个 λ。'
      };
    }

    if (!s.real) {
      return {
        text: '没有实特征方向。旋转 90° 把每个方向都转走了，λ 只能是复数 ±i。不是所有矩阵都愿意留下一条轴。',
        prompt: '试试剪切矩阵——它有一个很固执的方向。'
      };
    }

    if (s.zero || s.scalar) {
      return {
        text: s.zero
          ? '零矩阵把所有方向都压成 0。每个非零方向都算特征向量，λ 全是 0；这个极端情况反而最慷慨。'
          : '所有方向都是特征方向。整个平面被同一个倍数缩放，λ = ' + f(s.lambda) + '。',
        prompt: s.zero ? '换成单位矩阵，看看“所有方向”和“λ=1”是什么感觉。' : '把 v 转一圈，Av 应该始终和 v 共线。'
      };
    }

    if (s.repeated) {
      return {
        text: '重根。两条特征方向重合了，只剩一条独立的轴。矩阵在别的方向上会“剪切”，所以它不是单纯的缩放。',
        prompt: '把 v 拖到那条不转向的线上，看看 λ 是多少。'
      };
    }

    return {
      text: '大多数方向都会被矩阵拧走，只有少数方向只改变长度。把 v 慢慢转一圈，找那个 Av 和 v 排在同一条直线上的瞬间。',
      prompt: '先别打开特征方向图层——自己找一次，再打开验证。'
    };
  }

  function solve(s) {
    if (s.status === 'none') {
      return {
        text: s.view === 'row'
          ? '两条线平行，永远不会碰面。行视角里你看不到交点；列视角里，b 已经跑到两列张成的线外面去了。'
          : 'b 不在两列张成的空间里。无论怎么组合 c₁、c₂，都拼不出它；所以方程组不相容。',
        prompt: s.view === 'row'
          ? '把 b 往上或往下挪一点，看看两条线什么时候重新相交。'
          : '把 b 拖回那条虚线（列空间）上，看看“无解”怎样变成“无穷多解”。'
      };
    }

    if (s.status === 'infinite') {
      return {
        text: s.dimension === 2
          ? '零矩阵把一切都抹平了，b 也是 0；于是整个平面都是解。这不是“一个答案”，而是一整片答案。'
          : '两条线重合了，或者 b 落在列空间里：解不止一个，而是一整条线。特解加零空间方向，就是全部答案。',
        prompt: s.view === 'row'
          ? '把 b 稍微挪开一点，重合的两条线就会变成平行，解也随之消失。'
          : '观察 b 和两列共线时，组合方式为什么突然不唯一了。'
      };
    }

    return {
      text: s.view === 'row'
        ? '两条线交于一点，说明这个方程组只有一个解。把交点拖到别处，b 会跟着变——行视角里，解就是那个交点。'
        : 'b 正好是两列的唯一组合。x、y 就是组合系数；两列独立，所以这个表示没有第二种可能。',
      prompt: s.view === 'row'
        ? '先猜：把 b 往上移，交点会往哪边跑？'
        : '把 b 拖到两列中间，看看两个组合系数怎样一起变。'
    };
  }

  global.LinAlgNarration = {
    transform: transform,
    determinant: determinant,
    rank: rank,
    eigen: eigen,
    solve: solve
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
