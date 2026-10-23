# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的写法，版本号遵循
[Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-10-24

首个公开版本：六个可拖动的章节展厅、十三个跨域应用、练习与测试、本地账号与学习路线图。

### Added

- **六个章节展厅**：向量与组合、矩阵变换、行列式、秩与零空间、特征向量、线性方程组。
  每页可拖动、可调参数、带「先猜后验」选择题与即时旁白。
- **十三个应用页**：物理（受力分解、刚体旋转、量子态）、经济（投入产出、投资组合）、
  软件（卷积、PCA、三维投影）、硬件（音频滤波、纠错码）、美术（一点透视）、
  音乐（和弦与频谱）、社科（意见演化）。
- **全屏无限空间**：方格纸铺满窗口，右上角小地图，滚轮 / 双指缩放，`Esc` 退出。
- **本地账号与数据面板**：Node 内置 `http` + `node:sqlite`，scrypt 加盐哈希，
  HttpOnly 会话 cookie；柱状图 / 饼状图 / 折线图看正确率、分数与进度。
- **练习与测试**：六章共 444 题（三档练习各 17 题 / 100 分，章节大测 23 题 / 200 分），
  选择 / 填空 / 大题三种题型；5 种测试模式、倒计时、25 分钟提醒、逐题解析与出处、
  原题下载；大题公式工具栏与 `\alpha` 补全，按参考答案自评。
- **学习路线图**：莫兰迪地图海报，六个章节站 + 七个应用区 + 星形广场 / 街区；
  站点描边显示进度；登录后可自由摆放七种宠物与小屋（存在 `decorations` 表）。
- **文档**：README、GUIDE、MANUAL、ARCHITECTURE、REFERENCES、SOURCE_LEDGER、ROADMAP、UPGRADE。

### Tests

- `node tests/math.test.js`（50 项）
- `node tests/api.test.js`（17 项，含注册、记录、装饰、删除账号与静态路径）
- `node tests/questions.test.js`（31 项，题库结构与分值）

### Known limitations

- 没有 WebGL / 真实 3D 渲染，空间感来自 Canvas 2D 投影；
- 账号、练习记录与地图装饰依赖本地 Node 服务；GitHub Pages 上只能使用静态内容；
- 学习路线图将在后续版本重做，当前版本先保证“能看、能点、能放装饰”；
- 题目为原创改编，出处标注在每题与章末，但不提供出版社习题原文。
