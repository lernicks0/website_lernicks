# 图床提速（2026-11-01）

## 诊断与范围

`tbl.lernicks.cn` 的上传文件保存在上海腾讯云轻量服务器 `/root/tbl/uploads`，不是第三方国外图床。控制台显示带宽 4 Mbps；这是多人共享的源站带宽，较大的原图仍受其限制。

公网响应包含 `Server: cloudflare`；旧配置仅监听 HTTP 80，通过 Cloudflare Flexible 提供公网 HTTPS。2026-11-01 只读检查：源站没有监听 443，没有发现 Certbot 或 `/etc/letsencrypt/live` 证书。不能直接关闭 Cloudflare 代理，否则原 HTTPS 图片链接会失效。

本机代理路径的首页一次测量约 2.97 秒，`curl --noproxy '*' --resolve` 直连源站 HTTP 首字节约 0.060 秒、总耗时约 0.088 秒。两条路径协议和出口不同，这不是国内多运营商测速，也不能据此承诺固定提速倍数。

## 代码更新

- 历史列表不再用完整原图做小图标。旧记录显示占位图并保留原文件链接；新上传的静态 JPEG/PNG 在浏览器生成小缩略图，单张最长 80 像素、数据上限 16KB，只保存在本机历史记录。
- 上传成功的图片预览复用本地 Blob，不再立即重新下载刚上传的文件。
- 上传前可压缩 JPEG/静态 PNG：默认勾选且明确提示有损；长边最多 2560 像素，WebP 质量 0.85；仅在至少节省 10% 时使用新文件。取消勾选逐字节保留原文件。GIF、APNG、已有 WebP、视频及其他文件保持原样；处理不支持/失败时回退原文件。现有服务端文件没有批量转换。
- 原文件直链继续使用 `/i/原文件名`。增加 ETag/Last-Modified/304 与各类文件单区间下载，修复旧视频后缀范围读取，HEAD 不发送正文，断开连接即停止文件流。保留现有一年 immutable 缓存策略；已缓存文件删除后仍可能暂存于浏览器/CDN，不能承诺撤回所有缓存副本。
- 慢网络上传超时从 30 秒调到 120 秒；管理员密钥和删除码机制、容量清理规则保持不变。API 继续 `no-store`。

## 安装

自包含安装器 `deploy/install-tbl-speed-20261101.sh` 由 `node deploy/build-tbl-speed-installer.cjs` 生成，无 npm 下载或新增运行时依赖。仓库代码目录 `tbl/`，本工作区 `tbl-site/`。

仅局部修改当前 `/root/tbl/index.html`、`server.js`，新增 `media-delivery.cjs`；不会用旧页面覆盖 Folio 或其他修改。补丁上下文不符就停止。自动载入已有 nvm，备份到 `/root/tbl-speed-backup-*`，仅重启 `tbl-server`，等待进程并验证首页标记和状态接口，失败恢复代码。

不覆盖 `data/`、`uploads/`，不更改账号、管理员配置、Nginx、DNS 或其他网站。安装脚本与发布固定提交及校验值见 `deploy/tbl-speed-published.txt`。

## 中国大陆访问线路

建议先解决源站 HTTPS，再切换路线。不要把普通 Cloudflare 全球代理等同于中国大陆 CDN；[Cloudflare 中国网络](https://developers.cloudflare.com/china-network/) 是单独的企业服务。

1. **已有备案、需要国内缓存节点：**可接入腾讯云 CDN 中国境内区域，源站 `124.223.201.40`，回源 Host `tbl.lernicks.cn`。同域名方式保留现有图片地址；CDN 的 CNAME 记录应关闭 Cloudflare 代理，避免再套一层国外代理。切换前在 CDN 配置浏览器信任的域名证书，验证首页、API、旧图片、上传、删除、Range。缓存仅针对 `/i/`，遵循已有缓存头；`/api/*`、上传、删除一律不缓存，HTML 重验证。需先确认预算和计费规则，不自动开通付费服务。
2. **先使用现有上海源站直连：**为 `tbl.lernicks.cn` 配置浏览器信任的 HTTPS 证书与自动续期，Nginx 443 代理到原 `127.0.0.1:1148`；核实防火墙与公网访问。通过正常证书校验的 `curl --resolve` 后，再评估 DNS-only。只增加 443 时暂不强制 80 重定向，以免旧 Flexible 路径循环。不得用仅 Cloudflare 信任的 Origin CA 证书代替公众证书。
3. **未备案：**腾讯云境内 CDN 有备案前提；先完成备案或评估境外近端路线。不能把境外节点宣称为中国大陆节点，也不能保证国内三网流畅。

腾讯云[官方接入文档](https://cloud.tencent.com/document/product/228/3149)列明中国境内/全球区域要求备案。[Origin CA 文档](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)说明停用代理时浏览器可能不信任其源站证书。

`bash deploy/check-tbl-route-20261101.sh` 只做只读检查；HTTPS 不通或证书不可信时明确输出 NOT_READY，绝不自动切换 DNS。

## 验证

- `node tests/tbl-speed.integration.cjs`：独立目录真实启动服务，原文件内容、上传/删除、管理员限制路径、图像/视频/附件 Range、后缀 Range、HEAD、If-Range、ETag/304、私密 API 缓存策略。
- `node tests/tbl-speed-ui.cjs`：请求全部为测试替身。1440/390/320px 无横向溢出，20 条旧记录无原图请求，上传结果无原图请求；真实 Canvas 压缩及关闭压缩后原始字节一致，动画与其他格式绕过。
- `node tests/tbl-speed-patch.cjs`：当前线上页面与已发布后端补丁、LF/CRLF、重复安装、保留外观、遇到陌生上下文停止。
- `bash -n deploy/install-tbl-speed-20261101.sh`：安装脚本语法。

合成 PNG 样例 1,823,874 字节，优化后的 multipart 请求 53,358 字节，约减少 97%。这是该样例的压缩结果，不是公网速度增幅或所有图片的承诺。

未实际安装并验证服务器前，只能说代码和更新包已发布。国内线路切换与代码更新的完成状态分别记录。
