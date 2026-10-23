# Linear Algebra v1.2.0

本机账号：不用启动本地服务，也能注册、登录、记录、看数据面板、布置地图装饰。

## 新增

- **本机账号（默认）**：直接打开页面或部署在纯静态托管上就能注册；账号、学习记录与地图装饰
  存在当前浏览器的 `localStorage`，密码用 WebCrypto **PBKDF2-SHA256（210,000 次，16 字节随机盐）**
  加盐哈希，明文不落盘、不上传。
- **两种账号共用一套界面与接口**：`account.js` 根据 `/api/health` 自动选择 `server` 或 `local`；
  数据面板、练习记录、路线图装饰不需要知道后面是 SQLite 还是 localStorage。
- `tests/local-account.test.js`：注册 / 登录 / 记录 / 统计 / 装饰 / 删除，10 项。

## 变更

- `record()` 把 `correctCount` / `questionCount` 一并传给两种后端，正确率口径一致。
- 文档增加「本机账号 vs 服务账号」对照：README、GUIDE、MANUAL、ARCHITECTURE。
- 入口页、导航、账号弹窗在无服务器时不再提示「离线」，改为提示「本机账号」。

## 安全

- 本机账号只写浏览器存储，静态托管时没有任何服务端密钥、数据库或接口暴露面。
- 连续 5 次密码错误冷却 10 秒；删除账号会同时清掉记录与装饰。
- 服务账号仍是 scrypt + HttpOnly 会话 cookie，只监听 `127.0.0.1`。

## 已知限制

- 本机账号不跨设备、不跨浏览器；清除站点数据会一起清空。
- 本机账号的校验发生在浏览器，无法像服务端那样审计；适合个人使用与轻量分享。
- 学习路线图将在后续版本重做。

## 验证

- `node tests/math.test.js`：50 项通过。
- `node tests/api.test.js`：17 项通过。
- `node tests/questions.test.js`：31 项通过。
- `node tests/local-account.test.js`：10 项通过。
- 26 个页面在 1440 px / 390 px 下无控制台报错；`file://` 下可注册并记录。
