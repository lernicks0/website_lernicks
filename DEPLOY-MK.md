# mk.lernicks.cn 部署说明

## 功能与端口

- Markdown + LaTeX + HTML 统一混合文档分享站，写法类似洛谷编辑器。
- 正文默认混用 Markdown、LaTeX 与 HTML，无需选择格式。支持 `<details><summary>` 折叠内容、`<span style="color:red">` 彩色文字、HTML 表格；`.html` / `.htm` 文件也读入同一编辑器。
- 混合内容通过本地 DOMPurify 3.4.14 过滤后显示，保留排版标签与内联样式，移除脚本、事件处理器、危险链接和嵌入页面；过滤库加载失败时仅显示原文。许可证见 `mk/purify.LICENSE`。
- 旧版明确保存为 HTML 网页的文档继续使用隔离预览，旧 Markdown 文档直接获得内嵌 HTML 支持。
- 行内公式使用 `$...$`，独立公式使用 `$$...$$`。
- `/pre` 编辑页支持“编辑 / 实时预览”切换。
- 保留旧 Markdown 和纯 LaTeX 文档的阅读兼容。
- 端口：1151（1150 已被申请登记网站使用）
- PM2 名称：`mk-server`
- 运行目录：`/root/mk`
- 文档正文：`/root/mk/documents/`
- 文档记录：`/root/mk/data/documents.json`

## 当前版本：2026-09-06 混合排版修正

- 当前更新包：`deploy/releases/mk-mixed-html-20260906.tar.gz`。
- 当前安装脚本：`deploy/install-mk-mixed-html-20260906.sh`，执行时传入本次发布的完整提交 ID。
- 更新包含原四个程序文件以及 `purify.min.js`、`purify.LICENSE`，必须一起安装。
- 下文 2026-09-05 发布记录仅作历史保留，不再使用旧安装命令；旧方案将 HTML 单独分类，与用户要求的混合排版不同。

## 默认保护规则

- 单份文档最多 1MB。
- 全部文档最多使用 500MB。
- 为服务器保留至少 1GB 可用空间。
- 达到上限时，只删除文档站中最早创建的文档。
- 创建文档后返回一枚随机密钥，服务器只保存 SHA-256 哈希。
- 阅读链接后增加 `/pre`，输入密钥后可以修改或删除。

## 服务器文件与 PM2

```bash
cd /root/telegram-notes
git pull --ff-only origin master

mkdir -p /root/mk/data /root/mk/documents
cp -a mk/index.html mk/document.html mk/server.js mk/html-support.js mk/purify.min.js mk/purify.LICENSE /root/mk/

pm2 start /root/mk/server.js --name mk-server --cwd /root/mk
pm2 save
```

以后更新使用：

```bash
pm2 restart mk-server
pm2 save
```

不要删除 `/root/mk/data` 或 `/root/mk/documents`。

## HTML 支持更新包（2026-09-05）

本地更新包：`deploy/releases/mk-html-support-20260905.tar.gz`。只包含 `index.html`、`document.html`、`server.js`、`html-support.js`，不含文档、密钥或文档记录。必须同时更新这四个文件。

将更新包上传至服务器 `/root/mk-html-support-20260905.tar.gz` 后执行：

```bash
backup_dir=$(mktemp -d /root/mk-code-backup-XXXXXXXX)
cp -a /root/mk/index.html /root/mk/document.html /root/mk/server.js "$backup_dir/"
if [ -f /root/mk/html-support.js ]; then cp -a /root/mk/html-support.js "$backup_dir/"; fi
tar -xzf /root/mk-html-support-20260905.tar.gz -C /root/mk
node --check /root/mk/server.js
node --check /root/mk/html-support.js
pm2 restart mk-server
curl -fsS http://127.0.0.1:1151/api/status
```

已有 HTML 内容如果之前保存为混合格式，可以在 `/pre` 编辑页选择“HTML 网页”并保存，阅读链接保持不变。

本地验证：`node tests/mk-html.integration.js`。设置 `MK_PLAYWRIGHT_MODULE` 为 Playwright 模块路径时，还会使用无界面 Edge 验证上传、预览、脚本隔离、阅读与编辑流程。

## 本次发布记录（2026-09-05）

- GitHub `master` 已发布并核实：`38815085b32e4a3404ecf5345767b5d7e9400154`。
- 固定版本 jsDelivr 下载地址均已下载验证，文件 SHA-256 与本地一致。
- 此记录仅表示更新包已发布；还需在腾讯云 WebShell 执行以下命令并验证线上网站。
- 安装脚本先校验更新包、检查语法、备份程序，再更新四个程序文件并重启 `mk-server`。服务检查失败时恢复旧程序，不覆盖文档数据目录。

```bash
curl -fL --retry 3 --connect-timeout 15 --max-time 180 -o /tmp/mk-html-update.sh "https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@38815085b32e4a3404ecf5345767b5d7e9400154/deploy/install-mk-html-support-20260905.sh" &&
echo "e661803d3b8e50ae1c970ff8456589da7a68277ac8a9bc7c14d36b4c63fdc5c5  /tmp/mk-html-update.sh" | sha256sum -c - &&
bash /tmp/mk-html-update.sh 38815085b32e4a3404ecf5345767b5d7e9400154
```

成功时末尾显示 `HTML support updated successfully`。打开 `https://mk.lernicks.cn`，按 `Ctrl+F5`，应出现“文档格式”选择框和 HTML 上传支持。

## Nginx 与 Cloudflare

使用独立的 `deploy/nginx-mk.conf`，不会覆盖其他网站的 Nginx 配置：

```bash
cp -a /root/telegram-notes/deploy/nginx-mk.conf /etc/nginx/sites-enabled/mk-site
nginx -t
systemctl reload nginx
```

Cloudflare 添加开启代理的 A 记录：

```text
mk -> 124.223.201.40
```

## 检查

```bash
curl -s -o /dev/null -w "MK PORT: %{http_code}\n" http://127.0.0.1:1151/
curl -s http://127.0.0.1:1151/api/status
curl -s -o /dev/null -w "MK NGINX: %{http_code}\n" -H "Host: mk.lernicks.cn" http://127.0.0.1/
pm2 logs mk-server --lines 20 --nostream
```
