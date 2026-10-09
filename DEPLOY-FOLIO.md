# 四站外观更新 · 2026-10-09

安装器：deploy/install-folio-20261009.sh，生成器：deploy/build-folio-installer.cjs。

只修改以下五个服务器页面：

- /root/main/index.html
- /root/telegram-notes/public/index.html
- /root/tbl/index.html
- /root/mk/index.html
- /root/mk/document.html

安装器读取服务器当前页面，添加独立外观块，逐字检查原页面不变，备份后再原子替换。保留原业务脚本、账号、笔记、反馈、文件、文档和服务器页面上的其他修改。只重启 main-server、telegram-notes、tbl-server、mk-server。源站检查跟随重定向；失败自动恢复五个页面。无需修改域名、Nginx、数据库或业务依赖。

服务器须已有上一轮新版外观（astra-theme 与 data-astra-site 标记）。检查不通过时停止，不部署旧页面或旧业务功能。当前公网四个首页已核实具有这些标记。

WebShell 当前可能以 ubuntu 登录，因此安装要用 `sudo bash`。安装器会自动载入已有 /root/.nvm，并恢复严格模式；不会安装新的 Node 或 PM2。

成功输出：`FOLIO_DEPLOY_SUCCESS backup=/root/folio-code-backup-...`。

本地浏览器与文档接口验证已通过。服务器安装尚未执行。
