# 老师分科账号（2026-09-08）

| 身份 | 登录账号 |
| --- | --- |
| 语文老师 | chi |
| 数学老师 | mat |
| 英语老师 | eng |
| 科学老师 | sci |
| 社会老师 | com |
| 其余副科老师共用 | tec |

六个账号均沿用现有 teacher 管理员权限，不参与学生人数、积分排名、目标或 PK。没有新增分科权限限制。

原 `ls` 账号迁移为 `tec`，保留其原密码；`ls` 登录失效。五个主科账号默认未设置密码，管理员登录后在“管理全班账号”中分别设置密码即可启用。已经存在的六个新账号密码保持不变，不分发默认密码。

迁移保留学生学号、姓名、角色、密码和登录状态，仅撤销旧 `ls` 的登录状态。私密备份放在服务器 `/root/class-auth/teacher-accounts-backup-*`，不要公开或提交。

## 安装

发布包只包含六个账号程序文件和不含真实姓名的名单示例，不包含真实 `roster.json`、`accounts.json` 或 `sessions.json`。

`deploy/install-teacher-accounts-20260908.sh` 接收固定发布提交 ID，下载和校验更新包后，停止账号服务、备份程序与账号数据、迁移老师账号、重启账号服务及运行中的相关班级服务；失败则恢复备份。

全新初始化也创建六类老师账号。已经使用学号登录的服务器运行专用 `migrate-teachers.js`，不要重新运行学号初始化程序，不要重填学生管理员名单。

测试：`node tests/teacher-migration.integration.js`、`node tests/teacher-role.integration.js`。另已回归新闻审核权限和成绩分析/反馈功能。

仅在 WebShell 安装并验证服务器后才算上线，GitHub 更新包发布不代表服务器已安装。
