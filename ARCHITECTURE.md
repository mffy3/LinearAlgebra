# Linear Algebra · 分区与迭代指南

这份文件回答一个问题：**以后想改某个部分，应该动哪里？**

项目刻意保持纯静态、零构建。为了让“改一块”不会牵动整页，我们按 **页面区块（zone）**、**代码层（layer）** 和 **内容类型（copy / math / visual）** 分开。

---

## 1. 页面区块：`data-zone`

每个展厅页的 `<main>` 都带有一套固定的区块标记。用浏览器 DevTools 搜索 `data-zone`，可以快速定位。

| `data-zone` | 页面位置 | 主要内容 | 改这里会影响 |
|---|---|---|---|
| `intro` | 页面顶部 | 章节号、标题、导语、关键词胶囊 | 这一章的第一印象 |
| `workspace` | 中部 | 画布 + 控制面板的容器 | 两栏布局、响应式折叠 |
| `canvas` | 左栏 | 画布、状态 chip、提示、移动端旁白条、读数脚注 | 图形、状态、即时批注 |
| `controls` | 右栏 | 矩阵、向量、视角、预设、挑战、即时旁白卡 | 操作方式、参数 |
| `lecture` | 下半部 | “为什么长这样”的讲义卡片 | 知识深度、公式 |
| `quiz` | 讲义之后 | 先猜后验选择题 | 题目与反馈 |
| `next` | 页尾 | 下一站 / 阶段总结 | 导航与阶段感 |

入口页（`index.html`）不显示全站目录，只有：

- `entry-copy`：标题、导语
- `entry-choice`：三个水平选择
- `path`：选完水平后展开的路线与 CTA

全部展厅页（`pages/library.html`）另有：

- `hero`：引言 + 章节地球仪
- `chapters`：展厅便当盒
- `domains`：应用预告
- `closing`：收尾卡片

**原则：** 区块内部可以自由改，但不要跨区搬 ID。JS 通过 ID 找元素；搬走 ID 等于把控制器的手砍了。

---

## 2. 代码分层

```text
页面 HTML       结构 / 文案 / 可访问性
  └─ js/demos/*.js      只负责“状态 → 调用数学 → 调用绘图 → 更新 DOM”
       ├─ js/lib/math.js          纯数学，不碰 DOM / Canvas
       ├─ js/lib/canvas-utils.js  纯绘图，不含矩阵公式
       └─ js/lib/narration.js     只生成即时旁白文本，不碰 DOM
```

入口页是独立的一层：

```text
index.html
  ├─ js/lib/entry-scene.js   3D 透视场景，只画
  └─ js/lib/entry-flow.js    水平选择、路线、跳转
```

### 各层职责

| 层 | 文件 | 可以做什么 | 不应该做什么 |
|---|---|---|---|
| 数学 | `js/lib/math.js` | 矩阵、det、rank、特征值、`solve2` | 读写 DOM、选颜色、写文案 |
| 绘图 | `js/lib/canvas-utils.js` | 网格、坐标、箭头、线段、标签 | 决定“解是什么” |
| 叙述 | `js/lib/narration.js` | 根据状态返回 `{text, prompt}` | 改状态、画图 |
| 入口 3D | `js/lib/entry-scene.js` | 透视投影、平面、指针旋转 | 处理水平选择、跳转 |
| 入口路线 | `js/lib/entry-flow.js` | 三个水平、路线、CTA | 画 3D |
| 路线配置 | `js/lib/paths.js` | 每条路线的页面顺序、每站引导、学习清单 | 改 3D 或 DOM |
| 路线提示 | `js/lib/level-ui.js` | 读取水平，插入“第 N 站”、清单、quiz 提示；进阶路线隐藏基础 quiz | 改页面数学内容 |
| 全屏空间 | `js/lib/space-mode.js` | 全屏 UI、全局地图、底部讲解条、平移缩放手势 | 改数学结论、改展厅状态 |
| 视口 | `js/lib/canvas-utils.js` | 世界↔屏幕、中心/缩放、无限网格与坐标轴 | 决定“解是什么” |
| 应用控制 | `js/demos/physics-force.js` | 锚点、重力、张力 | 复制 `solve2` 公式 |
| 零基础课 | `js/demos/vectors.js` | 相加、数乘、αu+βv、目标挑战 | 引入矩阵（第 0 课只讲向量） |
| 控制器 | `js/demos/*.js` | 读输入、算状态、调绘图、更新读数 | 复制数学公式、写大段 CSS |
| 样式 | `css/main.css`、`css/bento.css`、`css/canvas.css` | 颜色、排版、布局 | 改数学结论 |
| 页面 | `pages/*.html` | 区块结构、静态文案、脚本顺序 | 内联大段 JS |

### 脚本加载顺序（不能反）

```html
<script src="../js/lib/math.js" defer></script>
<script src="../js/lib/canvas-utils.js" defer></script>
<script src="../js/lib/narration.js" defer></script>
<script src="../js/demos/xxx.js" defer></script>
```

---

## 3. 想改什么，动哪里

| 你想改 | 主要文件 | 注意 |
|---|---|---|
| 某个展厅的标题 / 导语 | 对应 `pages/xx.html` 的 `data-zone="intro"` | 保持清楚的引导语气，别写成产品文案 |
| 即时旁白 | `js/lib/narration.js` | 返回 `{text,prompt}`；不要在这里操作 DOM |
| 旁白卡的位置 / 字体 | `css/canvas.css` 的 `.professor-note` / `.professor-strip` | 桌面在右栏，手机在画布下方 |
| 入口 3D 平面 | `js/lib/entry-scene.js` | 只改投影、相机、线条；不要碰水平选择 |
| 三个水平 / 路线 | `js/lib/entry-flow.js` + `js/lib/paths.js` | 展示在入口，顺序在 paths |
| 页面顶部的路线提示 | `js/lib/level-ui.js` | 读取 `?level=` 或 localStorage |
| 画布颜色 / 网格 | `js/lib/canvas-utils.js` 的 `PALETTE` | 不要改 `math.js` |
| 页面圆角 / 色板 / 字体 | `css/main.css` 的 `:root` | 全站生效 |
| 全部展厅便当盒 / 地球仪 | `css/bento.css`、`js/lib/chapter-globe.js` | 章节数量变化时，地球仪会自动均分角度 |
| 数学结论 / 新函数 | `js/lib/math.js` + `tests/math.test.js` | 先写测试，再接页面 |
| 增加一个展厅 | 复制 `pages/05-solve.html` 的区块骨架 | 见下一节 checklist |
| 增加一个应用页 | `pages/applications/` + `css/applications.css` + 独立 JS | 不要改核心五个展厅的公式 |
| 全屏空间 / 全局地图 / 底部讲解条 | `js/lib/space-mode.js`、`css/space.css` | 见第 10 节；不要在这里写数学 |
| 网格铺不满 / 平移缩放 | `js/lib/canvas-utils.js` 的 `gridBounds`、`chooseStep` | `range` 只在奇异矩阵时兜底 |
| 修改水平到页面的映射 | `js/lib/entry-flow.js` 的 `LEVELS[level].href` | 入口只负责跳转，不复制课程内容 |

---

## 4. 增加一个新展厅：固定 checklist

以 `pages/05-solve.html` 为骨架复制，按顺序做：

1. **数学**：在 `math.js` 加纯函数，在 `tests/math.test.js` 加至少 3 个边界用例。
2. **页面**：复制 `05-solve.html`，保留七个 `data-zone`；替换标题、矩阵、向量、讲义、quiz。
3. **控制器**：复制 `js/demos/solve.js`，只改状态和绘图，不改 `math.js`。
4. **批注**：在 `narration.js` 加一个函数，返回 `{text,prompt}`；控制器同时更新 `#professor-text`、`#professor-strip-text`。
5. **脚本**：按顺序加载四个脚本。
6. **导航**：`pages/library.html` 的 nav、五个旧展厅 nav、页脚、全部展厅卡片、`ROADMAP.md`、`README.md`。
7. **测试**：`node tests/math.test.js`，再用 `screenshots/cdp-check.js` 跑 1440 / 390 / `file://`。
8. **提交**：同步到仓库工作副本，本地 commit，不 push。

---

## 5. 控制器状态约定

每个展厅的 `state` 只放“用户能改的东西”，不要把派生量塞进去。

```js
state = {
  matrix: { a, b, c, d },   // 用户输入
  probe: { x, y },          // 用户拖动
  view: 'row',              // 页面模式
  dragging: null            // 交互瞬时状态
};
```

派生量一律现算：

```js
const result = L.solve2(state.matrix, state.b);
const eig = L.eigen2(state.matrix);
```

这样改了矩阵或 b，所有读数、批注、挑战都会自然同步，不会出现“某个数字忘了更新”。

---

## 6. ID 命名

| 前缀 | 用途 | 例子 |
|---|---|---|
| `matrix-` | 矩阵输入 | `matrix-a`、`matrix-d` |
| `rhs-` / `probe-` | 向量输入 | `rhs-x`、`probe-y` |
| `canvas-` | 画布内状态 chip | `canvas-status` |
| `readout-` | 读数 | `readout-solution` |
| `professor-` | 批注 | `professor-text`、`professor-strip-text` |
| `challenge-` | 挑战 | `challenge-state`、`challenge-meter` |
| `quiz-` | 先猜后验 | `quiz-feedback` |
| `btn-` | 按钮 | `btn-reset`、`btn-quiz-apply` |

**不要**用位置式命名（如 `left-card-2`）；以后挪一块布局就会全线崩。

---

## 7. 样式分区

- `css/main.css`：设计 token、导航、按钮、页脚、通用排版、响应式。
- `css/entry.css`：3D 入口、水平选择、路线卡。
- `css/bento.css`：全部展厅的便当盒、章节地球仪、应用预告。
- `css/canvas.css`：五个展厅共用的画布页布局、控制面板、即时旁白、挑战、quiz。
- `css/applications.css`：应用篇的版心、公式卡、物理控制。

改颜色先改 `:root` 的 token；不要在页面里写死 `#xxxxxx`。Canvas 颜色改 `canvas-utils.js` 的 `PALETTE`，因为 Canvas 不认 CSS 变量。

---

## 8. 应用页

应用页（物理、经济、计算机、美术、音乐、社会科学）放在：

```text
pages/applications/physics.html        # 已完成：受力分解
pages/applications/physics-rotation.html # 已完成：刚体旋转
pages/applications/physics-quantum.html # 已完成：量子态叠加
pages/applications/economics-leontief.html # 已完成：投入产出
pages/applications/economics-portfolio.html # 已完成：投资组合
pages/applications/software-convolution.html # 已完成：图像卷积
pages/applications/software-pca.html # 已完成：PCA 降维
pages/applications/hardware-audio.html # 已完成：音频 FIR
pages/applications/hardware-ecc.html # 已完成：Hamming 纠错
pages/applications/computer-projection.html # 已完成：三维投影（P7）
pages/applications/art-perspective.html # 已完成：一点透视（P7）
pages/applications/music-harmony.html # 已完成：和弦与频谱（P7）
pages/applications/social-opinion.html # 已完成：意见演化（P7）
pages/applications/atlas.html # 已完成：跨域应用地图
pages/applications/release.html # 已完成：发布检查
```

它们复用 `main.css` 的 token、`canvas.css` 的区块和 `applications.css` 的公式卡，但**不要**修改五个基础展厅的数学结论。应用页的“即时旁白”写在 `js/lib/narration.js` 里，按领域新增函数；不要把公式塞回页面。

物理页的 `physics-force.js` 只负责：
1. 把锚点方向归一化成 `u, v`；
2. 用 `solve2` 解 `T₁u + T₂v = −W`；
3. 把负张力、松弛、共线翻译成物理状态。

以后加经济页，照这个顺序复制，不要动 `math.js` 里已经稳定的部分。

---

## 9. 一句话总结

**页面按 `data-zone` 分区，数学只进 `math.js`，图形只进 `canvas-utils.js`，语气只进 `narration.js`，交互只进 `demos/*.js`。**  
以后想改哪一块，就只动那一层；这样迭代不会把别的展厅带崩。

---

## 10. 全屏无限空间：`space-mode.js`（2026-10 优化）

六个基础展厅的画布右上角多了一个「全屏」按钮。点进去之后：

- 画布铺满整个窗口，网格按“无限平面”绘制，拖动空白处可以平移，滚轮 / 双指可以缩放；
- 右上角是一张全局地图：深色细框是当前视野，点击地图可以把视野挪过去；
- 地图右上角的 ✕ 退出全屏，电脑端按 `Esc` 同样退出；
- 正下方的长方形讲解条镜像右栏「边做边看」，跟着你的操作实时更新。

### 分层

| 文件 | 职责 | 不要做什么 |
|---|---|---|
| `js/lib/canvas-utils.js` | 视口的中心 / 缩放、无限网格、坐标轴、裁剪 | 不写 UI、不读页面状态 |
| `js/lib/space-mode.js` | 全屏 DOM、全局地图、底部讲解条、指针 / 键盘 | 不写数学、不改展厅状态 |
| `css/space.css` | 上述 UI 的样式与响应式 | 颜色仍取 `main.css` 的 token |

### 给新展厅接入（三步）

1. 页面 `<head>` 在 `canvas.css` 之后加 `space.css`；
2. `narration.js` 之后、展厅控制器之前加 `space-mode.js`；
3. 控制器末尾调用：

```js
if (window.LinearSpace) {
  window.LinearSpace.attach({
    canvas: canvas,
    view: view,
    redraw: requestRender,
    hitTest: function (event) { return !!hitTest(event); },
    landmarks: function () {
      return [{ x: state.u.x, y: state.u.y, color: K.PALETTE.e1 }];
    }
  });
}
```

- `hitTest` 返回 `true` 的手势交给展厅自己（拖箭头），返回 `false` 才平移画面；
- `landmarks` 只决定全局地图上的小圆点，不参与任何数学；
- 不调用 `attach` 的页面完全保持原样。

### 应用页的全屏

应用页（物理 / 经济 / 软件 / 硬件 / 美术 / 音乐 / 社科）同样有「全屏」，但交互不同：

- 空间类页面（物理、经济、软件、硬件、三维投影、一点透视）调用
  `attach({ dragPan: false, reserveDock: true, keepScale: true })`：
  画布铺满、右上角小地图 + 退出键、滚轮缩放、点地图移动视野；
  **左键拖动不拦截**，各页自己的拖动（锚点、金点、播放头、立方体旋转）照常；
- 图表类页面（音乐、社会）调用 `attach({ panZoom: false, minimap: false, reserveDock: true })`：
  只做「画布铺满 + 底部讲解条 + 右上角退出」，因为它们不是空间视图，给地图反而误导；
- `reserveDock` 会给画布留出讲解条的高度，避免盖住图表刻度；
- `keepScale` 让进入全屏时保持原来的像素比例，画面不会突然放大或缩小。

> 小地图只反映 `view` 的平移与缩放；不基于 view 绘制的页面（音乐、社会）不显示地图。

### 视口新增的能力

`view.center`、`view.zoom`、`view.setZoom(z, 屏幕锚点)`、`view.panBy(dx, dy)`、`view.resetView()`、`view.visibleBounds()`。

网格与坐标轴不再按写死的 `range` 绘制，而是取**画布四边在映射反像中的包围盒**：

- 宽屏、竖屏、手机、任何窗口比例，方格纸都会铺到画布边缘；
- 平移、缩放之后自动重算，不需要改参数；
- `range` 只在奇异矩阵（反像无界，例如 `det = 0`）时兜底；
- `step` 会按屏幕间距自动取 1、2、4、8… 或 0.5、0.25…，缩得很小时也不会糊成一片。

### 自测方式

- `node tests/math.test.js`：数学不回归；
- 无头浏览器 1440 / 390 两种宽度各截一张：进入全屏、拖平移、滚轮缩放、`Esc` 退出；
- 检查控制台无报错、退出后 `body` 不带 `space-open`、按钮文字回到「全屏」。

## 11. 本地后端与账号（2026-10，P8）

### 为什么是「本地后端」

账号与记录需要一个真正能写数据的地方，但项目仍然要保持「双击就能打开、零依赖」。
折中方案：**一个只监听 `127.0.0.1` 的 Node 服务**，只用自带模块（`node:http`、`node:sqlite`、
`node:crypto`），不装任何 npm 包；同时把静态站点也托管在同一个端口，页面与 `/api` 同源，
cookie 才能生效。

- 不启动服务：直接双击 `index.html`，全部内容照常，登录入口自动显示「离线」；
- 启动服务：`start-server.bat` 或 `node server/app.js` → `http://127.0.0.1:4173/`。

### 分层

| 文件 | 职责 | 不要做什么 |
|---|---|---|
| `server/app.js` | HTTP、路由、静态托管、参数校验、限流 | 不写业务 SQL |
| `server/db.js` | 建表与所有 SQL 语句 | 不处理 cookie、不做校验 |
| `server/auth.js` | scrypt 哈希、会话 token、cookie 字符串 | 不读数据库 |
| `js/lib/account.js` | 前端账号状态、弹窗、记录接口 | 不直接拼 SQL / 不存密码 |
| `js/lib/record.js` | 章节访问与答题记录（页面侧） | 不画图、不改页面内容 |
| `pages/dashboard.html` + `js/demos/dashboard.js` | 数据面板与三种图表 | 不重复实现统计口径 |

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 前端用它判断「服务是否在」 |
| POST | `/api/register` | 注册并直接登录（`{username, password}`） |
| POST | `/api/login` | 登录 |
| POST | `/api/logout` | 退出 |
| GET | `/api/me` | 当前用户或 `null` |
| POST | `/api/events` | 记录 `visit` / `quiz` / `practice` / `test` |
| GET | `/api/stats` | 汇总：总正确率、各章正确率、分数、进度、近 14 天活动 |
| POST | `/api/account/delete` | 校验密码后删除账号与全部记录 |

### 数据表

```text
users     (id, username UNIQUE, pass_hash, salt, created_at)
sessions  (token PK, user_id, created_at, expires_at)
attempts  (id, user_id, kind, chapter, tier, correct, score, total, mode, duration, created_at)
progress  (user_id, chapter, status: visited|practiced|tested, updated_at)  -- 联合主键
```

数据库文件在 `data/linear-algebra.db`，`data/` 已被 `.gitignore` 排除。
删掉 `data/` 就等于清空所有账号；也可以在数据面板里删除单个账号。

### 安全约定

- 密码只保存 `scrypt(password, salt)` 的十六进制结果，比较用 `timingSafeEqual`；
- 会话是 32 字节随机 token，放在 `HttpOnly; SameSite=Lax; Path=/` 的 cookie 里，30 天过期；
- 所有写接口都要求登录；`/api/account/delete` 还要再验一次密码；
- 静态服务拒绝 `server/`、`data/`、`.git`、点文件，并做了路径越界检查；
- 只监听 `127.0.0.1`，没有 CORS、没有外网暴露。

### 改这里要注意

- 新增记录类型：先改 `server/app.js` 的白名单与 `progress` 映射，再改 `record.js`；
- 改统计口径：只改 `server/db.js` 的 SQL 与 `dashboard.js` 的展示，别在两处各算一遍；
- 新增图表：在 `dashboard.js` 里写一个 `drawXxx(stats)`，复用 `prepare()` 处理 DPR，
  不要引入图表库。

## 12. 练习与章节大测（2026-10，P9）

### 文件

| 文件 | 职责 |
|---|---|
| `pages/practice.html` | 练习 / 大测页面骨架（靠 query 参数区分章、档、类型） |
| `css/practice.css` | 模式卡、答题卡、计时器、公式输入、结果与解析 |
| `js/lib/practice.js` | 引擎：选模式 → 答题 → 计时 → 判分 / 自评 → 记录 → 下载 |
| `js/lib/questions/*.js` | 六章题库，每章 3×17 道练习 + 23 道大测 |
| `tests/questions.test.js` | 题库结构自检 |

页面参数：`practice.html?chapter=01-transform&tier=easy`（练习）或
`practice.html?chapter=01-transform&kind=test`（大测）。

### 题目格式

```js
{ type: 'choice', q: '题干', o: ['A', 'B', 'C', 'D'], a: 0, e: '解析', s: 'Strang §1.1', p: 4 }
{ type: 'fill', q: '填空题干', n: 5, tol: 0.01, e: '解析', s: 'Strang §1.1', p: 6 }
{ type: 'long', q: '大题题干', model: '参考答案', steps: '推导步骤', s: 'Strang §1.1', p: 15 }
```

- `choice`：`a` 是正确选项下标（0–3）；`fill`：`n` 与 `tol`；`long`：`model` 与 `steps`；
- 每题必须有 `type`、`p`（分值）与 `s`（短出处）；每章 `refs` 给两条带链接的来源；
- 练习每档 17 题：10 选择（4 分）+ 5 填空（6 分）+ 2 大题（15 分）= 100 分；
- 大测 23 题：15 选择（5 分）+ 5 填空（10 分）+ 3 大题（25 分）= 200 分。

### 大题与公式输入

- 大题用 `textarea` 作答，上方是数学符号工具栏（α β λ θ √ ≤ ≥ ≠ → ∈ ℝ 等）；
- 输入 `\alpha`、`\sqrt`、`\le` 后按空格立即替换；输入 `\` 弹出补全候选，`Tab` / `Enter` 选中；
- 判分时列出「参考答案」与 `steps`，由学生自评（答对 / 部分对 / 答错），再保存成绩。

### 五种模式

限时打分 / 限时只对答案 / 不限时打分 / 不限时不打分 / 跳过。
限时：练习 90 分钟、大测 150 分钟；倒计时显示在答题卡右上角，
每到 25 分钟弹一次提示（不遮挡卷面）。

### 记录口径

交卷（保存成绩）时调用
`LinearAccount.record({ kind, chapter, tier, mode, duration, score, total, correctCount, questionCount })`：

- 打分模式写 `score / total / correctCount / questionCount`；
- 只对答案、不打分模式只写 `kind / chapter / mode / duration`（不进正确率）；
- 服务端用 `question_count` 与 `correct_count` 计算正确率，缺省时退回单题的 0/1。

### 加题

只改 `js/lib/questions/<章>.js`，保持字段不变；写完跑 `node tests/questions.test.js`。
不要在 `practice.js` 里写题目，也不要在页面 HTML 里写答案。

### 下载

交卷页的「下载原题与答案解析」在浏览器端用 Blob 生成一个独立 HTML：
题目、答案、解析、出处、本章参考。未登录也能下载，符合“未登录不记录但可拿原题”的约定。

## 许可与发布文件

- `LICENSE`：代码 MIT。
- `LICENSES/CC-BY-SA-4.0.txt`：原创内容的 CC BY-SA 4.0 许可说明。
- `NOTICE`：第三方引用、商标与素材归属。
- `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `SECURITY.md`：贡献、行为与安全入口。
- `.github/`：issue / PR 模板与只跑数学测试的 CI。
