# Lernicks 四站重新设计 · 2026-10-09

范围：lernicks.cn 主站、note.lernicks.cn 便签、tbl.lernicks.cn 图床、mk.lernicks.cn 文档（创建、阅读、编辑）。

暖白纸面、深墨文字、细边框与留白；便签用陶土橙、图床用松绿、文档用灰紫。主站采用左右排版和纸页插画，三个入口同等大小。桌面便签以信纸形式呈现，手机依次展示说明与输入框。文档强调标题和正文的阅读层次，图床突出上传区域。

页面顶部仍显示“新版 / 原版”；便签为“新版 / 经典 / 科技”。切换时不重载页面，不改变输入框内容。保留已有主题偏好。文档仍直接混用 Markdown、HTML、LaTeX，代码块保留源码。文档两种外观的阅读宽度保持相同。

实现：design/folio.css、design/folio.js 为独立外观层，design/build-folio.cjs 将它们内嵌到五个 HTML 文件。新增块以 FOLIO START/END 标记，移除该块后原页面字节不变；重复构建不会叠加。未新增前端依赖或图片下载。

本地预览：`ASTRA_PREVIEW_PORT=18819 node design/preview.js`。访问 http://127.0.0.1:18819/，预览使用示例数据，不保存笔记、文档、上传或反馈。该预览服务只监听本机。

验证：`node tests/folio-ui.cjs`，需要 Playwright 和 Edge。覆盖 1440、390、320 像素，检查横向溢出、文本对比度、脚本错误、主题切换保留输入、便签自动保存、上传成功结果、混合排版预览、文档创建、阅读、源码与编辑。所有网络写入均被测试替身截获。`node tests/mk-html.integration.js` 在隔离目录验证真实后端接口。

更新脚本见 DEPLOY-FOLIO.md。只有实际执行服务器安装并核对线上结果后，才能说明已上线。
