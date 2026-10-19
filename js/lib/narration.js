/**
 * narration.js · 即时旁白
 *
 * 纯文本生成器：输入当前页面状态，返回 { text, prompt }。
 * 不碰 DOM，不碰 Canvas；页面控制器负责把结果写进旁白卡。
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

  function physics(s) {
    if (s.status === 'none') {
      return {
        text: '两根绳子共线，只能提供同一个方向的力；重力又不在那条线上，所以托不住。几何上叫“无解”，物理上叫“掉下来”。',
        prompt: '把其中一个锚点拖到物体的另一侧，让两根绳子重新张开。'
      };
    }

    if (s.status === 'infinite') {
      return {
        text: '两根绳子共线，重力也正好在这条线上。方程有无穷多组张力分配；数学上说得通，物理上还得看绳子能不能承受。',
        prompt: '把锚点稍微挪开一点，让列向量不再共线。'
      };
    }

    if (s.negative) {
      return {
        text: '数学给了你一个负的张力。可是绳子只会拉，不会推；所以这个几何下没有物理平衡——除非其中一根其实是撑杆。',
        prompt: '把在“错误一侧”的锚点拖到物体的另一边，看看张力怎样重新变正。'
      };
    }

    if (s.slack) {
      return {
        text: '一根绳子的张力降到 0，它刚好松弛；从这一刻起，另一根绳子独自承担全部重量。',
        prompt: '再往另一边挪一点，松弛的绳子会重新绷紧吗？'
      };
    }

    if (s.symmetric) {
      return {
        text: '对称的挂法，两根绳子的张力相等。这不是巧合，是方程的对称性：两列互为镜像，右端项也正好在中间。',
        prompt: '把左边锚点往外拖，猜猜哪根绳子的张力会变大？'
      };
    }

    return {
      text: '灯没有掉下来，说明两股拉力的合力刚好抵消重力。T₁ ≈ ' + f(s.t1) + '，T₂ ≈ ' + f(s.t2) + '；你刚刚解的是一个 2×2 方程组。',
      prompt: '把锚点往外拖，张力的方向变了，数字会怎么变？'
    };
  }

  function combination(s) {
    if (s.reached) {
      return {
        text: '金色箭头落在目标点上了。你没有直接移动它，只是调了两个倍数：α 控制 u，β 控制 v。',
        prompt: '把目标点留在原地，换一组 u、v 的方向，还能拼出来吗？'
      };
    }

    if (s.collinear) {
      return {
        text: '两个箭头共线了。无论 α、β 怎么取，αu + βv 都只能留在这条直线上；两个方向退化成了一个。',
        prompt: '把 v 拖到直线外面，看看所有组合怎样从一条线变成一张平面。'
      };
    }

    if (Math.abs(s.alpha) < 0.01 && Math.abs(s.beta) < 0.01) {
      return {
        text: '两个系数都是 0，结果是原点。先把 α 调到 0.5，再把 β 调大，看看金色箭头怎么走。',
        prompt: '先只动 α，不动 β；金色箭头会沿着哪个方向移动？'
      };
    }

    return {
      text: 'α 是 u 的倍数，β 是 v 的倍数；把两段首尾接起来，就得到 αu + βv。α、β 取遍所有实数，就是 u、v 张成的空间。',
      prompt: '把 α 继续调大，同时把 β 调小；金色箭头会走出什么轨迹？'
    };
  }

  function rotation(s) {
    if (s.mode === 'general') {
      return {
        text: 'R(θ)S 不再是正交矩阵。圆被拉成椭圆，长度和夹角都变了；det 也不再是 1。正交性不是“看起来像旋转”，而是 RᵀR = I。',
        prompt: '切回“正交旋转”，看看椭圆怎样重新变回圆。'
      };
    }

    if (Math.abs(s.angle - 90) < 0.5) {
      return {
        text: 'e₁ 正好转到了 y 轴。长度还是 1，夹角还是 90°；R(θ) 只改了方向。',
        prompt: '继续转到 180°，看看 e₁ 会到哪里。'
      };
    }

    return {
      text: 'R(θ) 把每个点转过同一个角度。圆的半径没有变，所以它还是圆；长度、夹角、det 都不变。',
      prompt: '先转 90°，看 e₁ 是不是正好转到 y 轴。'
    };
  }

  function quantum(s) {
    if (Math.abs(s.theta - 45) < 0.5) {
      return {
        text: 'θ = 45° 时，α 和 β 的模长相等，所以 p(0) = p(1) = 0.5。相位 φ 可以继续转，但概率不会变。',
        prompt: '转动 φ，观察两个振幅的箭头：概率不变，只有相对方向在变。'
      };
    }

    if (Math.abs(s.theta) < 0.5) {
      return {
        text: 'θ = 0° 时 β = 0，状态就是 |0⟩；测量一定得到 0。',
        prompt: '把 θ 往上推，看看 |1⟩ 的振幅怎样长出来。'
      };
    }

    if (Math.abs(s.theta - 90) < 0.5) {
      return {
        text: 'θ = 90° 时 α = 0，状态就是 |1⟩；测量一定得到 1。',
        prompt: '把 θ 拉回 45°，让两种结果重新各占一半。'
      };
    }

    return {
      text: 'α 和 β 都是复数。θ 决定两个振幅的大小，φ 决定 β 的相位；概率只看模平方，不看整体相位。',
      prompt: '先把 θ 调到 45°，让两种结果各占一半。'
    };
  }

  function economics(s) {
    if (Math.abs(s.x2 - 50) < 0.5) {
      return {
        text: '制造业总产出正好 50。为了这个 50，农业不仅生产 d₁，还要生产制造业需要的原料，所以 x₁ 也跟着变。',
        prompt: '看看逆矩阵：它把“直接需求”和“为生产这些需求所需要的投入”一起算进去了。'
      };
    }

    if (s.d2 > s.d1) {
      return {
        text: '制造业的最终需求更高，拉动了制造业产出；制造业又要用农业的原料，所以农业产出也被带着上涨。',
        prompt: '试着只增加 d₁，看看哪个行业涨得更快。'
      };
    }

    return {
      text: 'A 记录“每生产 1 元，要消耗别人多少”；最终需求 d 是最后被消费掉的部分。x = (I − A)⁻¹d 把中间投入的连锁反应一次算完。',
      prompt: '先增加制造业的最终需求，看农业的产出会不会跟着涨。'
    };
  }

  function convolution(s) {
    if (s.kernel === 'identity') {
      return {
        text: '恒等核只保留中心像素，其余 8 个权重都是 0。输出图基本复制输入图，但边缘少了一圈。',
        prompt: '换成平均核，看看 9 个权重都变成 1/9 时会发生什么。'
      };
    }

    if (s.kernel === 'blur') {
      return {
        text: '平均核把窗口里的 9 个像素取平均。它压低突变、让图像变软；权重和是 1，所以整体亮度基本不变。',
        prompt: '换成边缘核，注意平坦区域的输出会接近 0。'
      };
    }

    if (s.progress >= 85) {
      return {
        text: '当前窗口的输出接近整张输出图的最大绝对值。边缘核在亮度突变处响应最强，平坦处几乎抵消。',
        prompt: '换一个窗口，看看输出值怎样从正变负。'
      };
    }

    return {
      text: '卷积核就是一个 9 维权重向量；每个输出像素都是当前 3×3 窗口与它的点积。窗口在滑动，但核没有变。',
      prompt: '把窗口拖到左边暗区和右边亮区的交界处。'
    };
  }

  function portfolio(s) {
    if (Math.abs(s.weight - s.star) < 0.02) {
      return {
        text: '这是最小方差点：再往两边加权重，组合风险都会上升。它不一定在 50 / 50，而由 σ₁、σ₂、ρ 一起决定。',
        prompt: '把 ρ 调低，看看最小风险点会不会继续往左移动。'
      };
    }

    if (s.weight <= 0.001 || s.weight >= 0.999) {
      return {
        text: '现在只持有一种资产，没有分散。协方差里的交叉项完全消失，风险就是单个资产的风险。',
        prompt: '把权重往中间拉一点，看看组合点会不会跑到单个资产点的左边。'
      };
    }

    if (s.rho < 0) {
      return {
        text: '负相关时，两种资产经常往相反方向动，组合的波动被压低；协方差的交叉项是负的。',
        prompt: '保持负相关，再找最小风险点：它可能比两个资产都低。'
      };
    }

    return {
      text: '组合风险不是两个风险的加权平均；相关性会让它或大或小。协方差矩阵的特征向量给出互不相关的风险方向。',
      prompt: '先把权重拉到 50%，比较组合点和两个资产点。'
    };
  }

  global.LinAlgNarration = {
    transform: transform,
    determinant: determinant,
    rank: rank,
    eigen: eigen,
    solve: solve,
    physics: physics,
    combination: combination,
    rotation: rotation,
    quantum: quantum,
    economics: economics,
    portfolio: portfolio,
    convolution: convolution
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
