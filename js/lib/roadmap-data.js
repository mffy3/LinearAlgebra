/**
 * roadmap-data.js · 学习路线图的数据
 *
 * 只放“地图上有什么”：站点坐标、章节文案、应用区与链接。
 * 画图与交互在 roadmap.js；配色在 css/roadmap.css。
 */
window.LinearRoadmap = {
  chapters: [
    {
      id: '00-vectors', num: '00', title: '向量与组合', x: 230, y: 262, color: '#7C8B7A',
      blurb: '两个箭头拼出一个平面：相加、拉长、线性组合。'
    },
    {
      id: '01-transform', num: '01', title: '矩阵变换', x: 560, y: 196, color: '#A98F6F',
      blurb: '矩阵是动作：旋转、缩放、剪切，网格整体跟着动。'
    },
    {
      id: '02-determinant', num: '02', title: '行列式', x: 890, y: 250, color: '#8C7B8F',
      blurb: '面积被放大还是翻面，一个数就说清楚了。'
    },
    {
      id: '03-rank', num: '03', title: '秩与零空间', x: 1180, y: 420, color: '#6F8B93',
      blurb: '信息在哪一步被压扁，哪些方向悄悄变成了零。'
    },
    {
      id: '04-eigenvector', num: '04', title: '特征向量', x: 830, y: 500, color: '#B08968',
      blurb: '不被转动、只被拉长的方向，就是矩阵的骨架。'
    },
    {
      id: '05-solve', num: '05', title: '线性方程组', x: 470, y: 430, color: '#7E8C6E',
      blurb: '把约束翻译成交点：唯一、无解，还是无穷多。'
    }
  ],

  districts: [
    {
      id: 'physics', title: '物理区', x: 190, y: 700,
      apps: [
        { label: '受力分解', href: 'applications/physics.html' },
        { label: '旋转与力矩', href: 'applications/physics-rotation.html' },
        { label: '量子态', href: 'applications/physics-quantum.html' }
      ]
    },
    {
      id: 'economics', title: '经济区', x: 425, y: 700,
      apps: [
        { label: '投入产出', href: 'applications/economics-leontief.html' },
        { label: '组合风险', href: 'applications/economics-portfolio.html' }
      ]
    },
    {
      id: 'software', title: '软件区', x: 660, y: 700,
      apps: [
        { label: '卷积', href: 'applications/software-convolution.html' },
        { label: '主成分', href: 'applications/software-pca.html' },
        { label: '三维投影', href: 'applications/computer-projection.html' }
      ]
    },
    {
      id: 'hardware', title: '硬件区', x: 895, y: 700,
      apps: [
        { label: '音频滤波', href: 'applications/hardware-audio.html' },
        { label: '纠错码', href: 'applications/hardware-ecc.html' }
      ]
    },
    {
      id: 'art', title: '美术区', x: 1105, y: 700,
      apps: [{ label: '一点透视', href: 'applications/art-perspective.html' }]
    },
    {
      id: 'music', title: '音乐区', x: 1285, y: 700,
      apps: [{ label: '和弦与频谱', href: 'applications/music-harmony.html' }]
    },
    {
      id: 'social', title: '社科区', x: 1460, y: 700,
      apps: [{ label: '意见演化', href: 'applications/social-opinion.html' }]
    }
  ],

  copy: {
    title: '线性代数 · 学习路线图',
    subtitle: '从一支箭头出发，穿过六座车站，最后走进七个应用区。',
    footer: '每一站都可以点：看简介、进章节、做练习、过大测。'
  }
};
