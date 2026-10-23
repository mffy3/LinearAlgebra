# Linear Algebra v1.1.0

在 v1.0.1 的基础上，补齐了「练习与测试」「学习路线图」「使用指南」与开源发布文件。
仍然是零依赖、无构建链：双击 `index.html` 就能用，账号与数据面板需要本地 `node server/app.js`。

## 新增

- **练习与测试**：六章共 444 题。
  三档练习各 17 题（10 选择 + 5 填空 + 2 大题，100 分），章节大测 23 题
  （15 选择 + 5 填空 + 3 大题，200 分）；5 种测试模式、90 / 150 分钟倒计时、
  每 25 分钟提醒、逐题解析与出处、原题下载。
- **大题作答**：数学符号工具栏（α λ √ ≤ 等），`\alpha` / `\sqrt` 自动补全；
  交卷后按参考答案自评（答对 / 部分对 / 答错），再保存成绩。
- **学习路线图**：莫兰迪地图海报，六个章节站 + 七个应用区 + 星形广场 / 街区 / 河流；
  站点描边显示进度；登录后可自由摆放七种宠物与小屋（存 `decorations` 表）。
- **使用指南**：新增 [`GUIDE.md`](GUIDE.md)，README 增加「使用指南」「鸣谢」。
- **发布文件**：`CHANGELOG.md`、`SOURCE_LEDGER.csv`、`CODEOWNERS`、
  `.github/workflows/ci.yml`、`.github/workflows/deploy.yml`、
  `content/third-party/`、内容错误 issue 模板。

## 变更

- README 顶部增加在线体验链接（GitHub Pages 静态版）。
- 练习页与章节页的题库、入口、示例统一到 17 / 23 题制。
- 数据库为练习与测试补充 `correct_count` / `question_count`，旧库自动迁移。

## 已知限制

- 没有 WebGL / 真实 3D 渲染，空间感来自 Canvas 2D 投影。
- 账号、数据面板与地图装饰依赖本地 Node 服务；Pages 上只能使用静态内容。
- 学习路线图将在后续版本重做，当前先保证「能看、能点、能布置装饰」。

## 验证

- `node tests/math.test.js`：50 项通过。
- `node tests/api.test.js`：17 项通过。
- `node tests/questions.test.js`：31 项通过。
- 26 个页面在 1440 px / 390 px 下无控制台报错。
