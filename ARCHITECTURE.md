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
| `canvas` | 左栏 | 画布、状态 chip、提示、移动端教授条、读数脚注 | 图形、状态、即时批注 |
| `controls` | 右栏 | 矩阵、向量、视角、预设、挑战、教授批注卡 | 操作方式、参数 |
| `lecture` | 下半部 | “为什么长这样”的讲义卡片 | 知识深度、公式 |
| `quiz` | 讲义之后 | 先猜后验选择题 | 题目与反馈 |
| `next` | 页尾 | 下一站 / 阶段总结 | 导航与阶段感 |

首页另有：

- `dashboard-hero`：教授引言 + 章节地球仪
- `dashboard-section`：展厅便当盒
- `domains-bento-section`：应用预告
- `closing-section`：收尾卡片

**原则：** 区块内部可以自由改，但不要跨区搬 ID。JS 通过 ID 找元素；搬走 ID 等于把控制器的手砍了。

---

## 2. 代码分层

```text
页面 HTML       结构 / 文案 / 可访问性
  └─ js/demos/*.js      只负责“状态 → 调用数学 → 调用绘图 → 更新 DOM”
       ├─ js/lib/math.js          纯数学，不碰 DOM / Canvas
       ├─ js/lib/canvas-utils.js  纯绘图，不含矩阵公式
       └─ js/lib/narration.js     只生成教授批注文本，不碰 DOM
```

### 各层职责

| 层 | 文件 | 可以做什么 | 不应该做什么 |
|---|---|---|---|
| 数学 | `js/lib/math.js` | 矩阵、det、rank、特征值、`solve2` | 读写 DOM、选颜色、写文案 |
| 绘图 | `js/lib/canvas-utils.js` | 网格、坐标、箭头、线段、标签 | 决定“解是什么” |
| 叙述 | `js/lib/narration.js` | 根据状态返回 `{text, prompt}` | 改状态、画图 |
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
| 某个展厅的标题 / 导语 | 对应 `pages/xx.html` 的 `data-zone="intro"` | 保持“教授语气”，别写成产品文案 |
| 教授的即时批注 | `js/lib/narration.js` | 返回 `{text,prompt}`；不要在这里操作 DOM |
| 批注卡的位置 / 字体 | `css/canvas.css` 的 `.professor-note` / `.professor-strip` | 桌面在右栏，手机在画布下方 |
| 画布颜色 / 网格 | `js/lib/canvas-utils.js` 的 `PALETTE` | 不要改 `math.js` |
| 页面圆角 / 色板 / 字体 | `css/main.css` 的 `:root` | 全站生效 |
| 首页便当盒 / 地球仪 | `css/bento.css`、`js/lib/chapter-globe.js` | 章节数量变化时，地球仪会自动均分角度 |
| 数学结论 / 新函数 | `js/lib/math.js` + `tests/math.test.js` | 先写测试，再接页面 |
| 增加一个展厅 | 复制 `pages/05-solve.html` 的区块骨架 | 见下一节 checklist |
| 增加一个应用页 | `pages/applications/` + 独立 CSS/JS | 不要改核心五个展厅的公式 |

---

## 4. 增加一个新展厅：固定 checklist

以 `pages/05-solve.html` 为骨架复制，按顺序做：

1. **数学**：在 `math.js` 加纯函数，在 `tests/math.test.js` 加至少 3 个边界用例。
2. **页面**：复制 `05-solve.html`，保留七个 `data-zone`；替换标题、矩阵、向量、讲义、quiz。
3. **控制器**：复制 `js/demos/solve.js`，只改状态和绘图，不改 `math.js`。
4. **批注**：在 `narration.js` 加一个函数，返回 `{text,prompt}`；控制器同时更新 `#professor-text`、`#professor-strip-text`。
5. **脚本**：按顺序加载四个脚本。
6. **导航**：首页 nav、四个旧展厅 nav、页脚、home 卡片、`ROADMAP.md`、`README.md`。
7. **测试**：`node tests/math.test.js`，再用 `screenshots/cdp-check.js` 跑 1440 / 390 / `file://`。
8. **提交**：同步到 `D:\线性代数开源项目`，本地 commit，不 push。

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
- `css/bento.css`：首页的便当盒、章节地球仪、应用预告。
- `css/canvas.css`：五个展厅共用的画布页布局、控制面板、教授批注、挑战、quiz。

改颜色先改 `:root` 的 token；不要在页面里写死 `#xxxxxx`。Canvas 颜色改 `canvas-utils.js` 的 `PALETTE`，因为 Canvas 不认 CSS 变量。

---

## 8. 未来的应用页

应用页（物理、经济、计算机、美术、音乐、社会科学）应放在：

```text
pages/applications/physics.html
pages/applications/economics.html
pages/applications/computer.html
...
```

它们复用 `main.css` 的 token 和 `canvas.css` 的区块，但**不要**修改五个基础展厅的数学结论。应用页的“教授批注”可以单独写在 `js/lib/narration.js` 里，也可以新建 `narration-applications.js`，避免基础篇越写越重。

---

## 9. 一句话总结

**页面按 `data-zone` 分区，数学只进 `math.js`，图形只进 `canvas-utils.js`，语气只进 `narration.js`，交互只进 `demos/*.js`。**  
以后想改哪一块，就只动那一层；这样迭代不会把别的展厅带崩。
