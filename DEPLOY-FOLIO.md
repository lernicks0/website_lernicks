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

本地浏览器与文档接口验证已通过。2026-10-09 已通过腾讯云 OrcaTerm 以 ubuntu 登录、sudo 安装，四站进程实际重启并通过源站检查。最终成功备份：`/root/folio-code-backup-TvEGxE2C`。

四个公网首页均返回 HTTP 200 并含新版样式与展示脚本；图床、文档状态接口返回 HTTP 200。浏览器已核实四站新版。没有写入、上传或删除真实业务内容。

安装器已修正两处检查：进程重启后的端口检查支持短时重试；文档阅读页模板逐字比对已安装文件，不访问不存在的文档地址。此前两次失败均自动恢复页面。线上较早主页没有 homeView 容器，展示脚本已兼容，并增加桌面与手机回归检查。

代码与安装器已发布在 `master`，最终已安装版本为 `55aeac75a4d688660604cee0417e88a0471532c1`。

在 WebShell 粘贴：

```bash
curl -fL --retry 3 --connect-timeout 15 --max-time 180 -o /tmp/folio-install.sh "https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@55aeac75a4d688660604cee0417e88a0471532c1/deploy/install-folio-20261009.sh" &&
echo 'dfb338d8f4e8bc6aa6ba4909ff0eeb9748fd9e3706d49d05a3aa338ac0f3f54a  /tmp/folio-install.sh' | sha256sum -c - &&
sudo bash /tmp/folio-install.sh
```

这个脚本已内嵌所需 CSS 和展示脚本，不再下载其他包。安装后刷新网页，在顶部选择“新版”即可看到新外观；已明确选择原版、经典或科技的浏览器继续保留其偏好。
