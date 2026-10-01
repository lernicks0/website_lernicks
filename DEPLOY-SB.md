# 神人俱乐部（2026-10-01）

- 目标域名：`https://sb.lernicks.cn`。
- 本地代码：`sb-site/`；GitHub master 目录：`sb/`；服务器：`/root/sb`。
- 仅监听 `127.0.0.1:1155`，PM2 进程 `sb-server`。新端口不与现有 1145–1154 站点冲突；安装器仍检查服务器实际占用。
- 内容：水滴鱼、芙莉莲、奶龙三位主角的同人插画与图鉴；15 句原创趣味台词、随机开整、三段小剧场。支持手机和键盘操作，减少动态效果时停止动画。
- 插画为 AI 生成同人图；图片保存于本站，不依赖第三方图片站、字体 CDN 或外部 JS。WebP 约 154 KiB，文字资源支持 Brotli/Gzip 与 ETag。
- 独立公开小站，不接入账号、不收集用户内容、不读取私密名单、不更改其他站点。

## 发布文件与验证

- 包：`deploy/sb-20261001.tar.gz`，只含 `sb/` 六个程序与图片文件、`nginx-sb.conf`。
- 包 SHA-256：`a3b2cc57fa6ae6afb35f605c3a4b9bda6fe0a3f7d11907b04c0ce1f8fde400fe`。
- 安装器：`deploy/install-sb-20261001.sh`；SHA-256：`bc2babad6600674f9e71a6de4d36f70d36a0dad452e10c9b35fafb85bbe8499a`。
- 安装器内置包哈希；先检查端口和现有进程，再备份已知文件，安装并验证页面、资源、健康接口和域名转发。失败恢复本次修改；已有域名配置不覆盖。
- 备份：`/root/sb-code-backup-*`，权限 700；PM2 原始信息只保存于服务器私密备份目录。
- 本地运行：`node sb-site/server.js`，打开 `http://127.0.0.1:1155`。
- 验证：`node tests/sb.integration.cjs`；语法检查 `node --check` 与 `bash -n`。
- 浏览器验证：桌面、390px 与 320px 手机布局、插画加载、三人台词切换、随机提示、场景切换与左右键操作。
- 仅在服务器实际执行并验证公网结果后，才能认定线上部署完成。

## WebShell 环境修复（2026-10-01）

修正安装器遗漏的 nvm 自动载入：缺少 Node 或 PM2 时读取 `${NVM_DIR:-/root/.nvm}/nvm.sh`，选择已安装的默认 Node，必要时退回已有最新 Node。只载入已有安装，不下载或安装新运行环境。`bash tests/sb-bootstrap.sh` 验证缺少 Node、缺少 PM2、已载入环境、默认别名缺失及严格模式恢复。原错误发生在安装前，未修改站点。

## WebShell 安装

代码和安装包已发布至 GitHub master 固定提交 `75ed753117832fbfbad658258eb2b9a9558951d7`。在 WebShell 执行：

```bash
SB_COMMIT='75ed753117832fbfbad658258eb2b9a9558951d7'
curl -fL --retry 3 --max-time 180 -o /tmp/sb-install.sh "https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$SB_COMMIT/deploy/install-sb-20261001.sh" &&
echo 'bc2babad6600674f9e71a6de4d36f70d36a0dad452e10c9b35fafb85bbe8499a  /tmp/sb-install.sh' | sha256sum -c - &&
bash /tmp/sb-install.sh "$SB_COMMIT"
```

成功输出 `SB_INSTALL_SUCCESS`。安装程序仅新增本机服务与缺失的域名配置，不改其他站点、不全量覆盖服务器检出。

## DNS 与源站 HTTPS

Cloudflare 增加代理 A 记录 `sb` → `124.223.201.40`。

Nginx 示例沿用本项目既有的 HTTP 源站代理。若当前 Cloudflare 加密设置为 Full (strict)，需让现有源站证书覆盖 `sb.lernicks.cn` 并在现有 443 配置中接入 `127.0.0.1:1155`，保持既有加密设置。

若 Nginx 未启用 `/etc/nginx/conf.d/*.conf`，把 `deploy/nginx-sb.conf` 的 server 块接入现有配置，再执行安装器；已有 sb 域名配置将由安装器保留并验证。

公网核对：`https://sb.lernicks.cn/healthz` 应返回 `{"ok":true,"site":"shenren-club"}`，首页三位角色图片和按钮正常。
