# HTML 发布站

- 目标域名 `https://ht.lernicks.cn`。本地代码 `ht-site/`，GitHub master 目录 `ht/`，腾讯云运行目录 `/root/ht`，PM2 进程 `ht-server`，仅监听 `127.0.0.1:1156`。
- 支持单个 HTML、多选文件及整目录上传。目录上传保留内部结构。用相对路径引用静态资源。每次最多 100 个文件、合计 20 MiB。
- 项目根目录默认选中 `index.html`。只有一个 HTML 时直接选中该文件。有多个 HTML 且无根目录 `index.html` 时，由发布者选择入口。
- `/p/<项目代号>/` 是公开分享地址。管理链接可修改入口，服务端保存管理令牌的哈希。站点以浏览器沙箱隔离公开页面，支持普通静态资源和脚本。依赖 Cookie、localStorage 或 Service Worker 的功能受浏览器沙箱限制。
- 上传数据在 `/root/ht/data`。站点容量为 2 GiB，并保留 512 MiB 磁盘空间。服务端容量检查会拒绝新项目，已有链接继续有效。

## 本地运行与验证

需要 Node.js 20 或更高版本，无需安装 npm 依赖。

```powershell
node ht-site/server.js
node --test tests/ht.integration.cjs
```

在 GitHub 检出的仓库中用 `node ht/server.js` 启动。首页地址 `http://127.0.0.1:1156/`。接口回归使用独立临时目录，覆盖单文件、嵌套路径、跨重启保留入口、错误管理令牌和二进制资源。浏览器使用示例目录验证了上传、默认入口、通过管理页切换入口及原链接加载新入口的 CSS 和 JavaScript 模块。

## 腾讯云和 DNS

安装器 `deploy/install-ht-20261123.sh`。从 GitHub 固定提交的 jsDelivr 地址下载并核对 SHA-256 后，用 `sudo bash /tmp/ht-install.sh 固定提交 --check` 预检，再用 `sudo bash /tmp/ht-install.sh 固定提交 --apply` 安装。安装器新增一个 PM2 进程和一个 Nginx 虚拟主机，并核对回源及首页资产。

Cloudflare 的 `lernicks.cn` 区域新增代理 A 记录 `ht → 124.223.201.40`。随包的 Nginx 配置沿用项目现有的 HTTP 回源方式。若该主机使用 Full 或 Full (strict) 回源，先为它配置有效的 443 虚拟主机及证书。

公网验证 `https://ht.lernicks.cn/healthz` 应返回 `{"ok":true,"site":"ht"}`，首页应显示「发布 HTML 页面」。固定提交和校验值见同级安装发布记录。
