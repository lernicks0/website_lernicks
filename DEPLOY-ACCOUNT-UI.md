# 账号中心显示修复（2026-09-08）

统一账号弹窗、下拉选项、按钮、状态提示的深浅色配色；随网站主题切换，避免浅色页面混入深色控件。保留六个老师账号的独立名称和 ID。

仅替换 `/root/class-auth/widget.js`，不修改账号数据，不需重启服务：账号服务每次请求读取该文件，安装脚本会核对接口实际返回的内容，失败则恢复备份。

使用固定提交下载 `deploy/install-account-ui-20260908.sh`，校验脚本 SHA-256 后执行 `bash /tmp/account-ui.sh <提交ID>`。出现 `ACCOUNT_UI_SUCCESS` 后关闭弹窗并刷新页面，必要时 Ctrl+F5。发布到 GitHub 不代表服务器已安装。

验证：`tests/account-widget-ui.cjs` 使用 Playwright 和 Edge，加载 CLA、SCO、GOAL、新闻站真实样式，检查深浅色切换、375px 手机布局、文字对比度、六个老师名称和选中账号提交。测试使用虚拟数据。
