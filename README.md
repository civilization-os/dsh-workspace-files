# dsh-workspace-files

DeepSeek Harness (DSH) 原生增强型工作区文件浏览器插件。

通过 DSH 0.1.5+ 官方右侧栏系统的优先级机制（`kind: "files"`, `priority: "extension"`），**100% 原生平滑接管官方自带的“工作区文件”**，彻底避免重复卡片，并补全官方缺失的文件搜索与一键 `@` 引用核心能力。

---

## 产品特性

- ⚡ **无感接管官方文件标签页**：基于 DSH 官方 `sidebarRightTabs` 的 `extension` 遮蔽机制（Shadowing），自动顶替官方 `builtin` 文件卡片，右侧栏引导页始终保持只有一张文件卡片，干净整洁。
- 🔍 **实时文件模糊搜索**：顶部常驻搜索过滤框，支持文件名与相对路径模糊匹配，高亮匹配文本，按 `Esc` 键一键退出搜索。
- 🎯 **一键 `@` 引用到当前对话框 (Mention)**：文件行右侧提供专属 `@` 快捷按钮，点击直接在当前激活会话的主输入框中光标处插入 `@path/to/file ` 并自动对焦输入框，同时智能复制到剪贴板。
- 📋 **快速复制相对路径**：支持一键复制文件的相对工作区路径，方便在终端或配置中直接使用。
- 📂 **深度树形目录与折叠记忆**：清晰展示多级目录层级结构，带目录子文件计数与文件大小信息，提供“全部展开”与“全部折叠”快捷按钮。
- 🎨 **丰富的文件类型识别**：按后缀名自动匹配代码（TS/JS/PY/GO/RS/C等）、样式、JSON、Markdown、图片以及 Drawio 图标色彩。
- 🔗 **原生融合官方查看器**：点击文件无缝调用 DSH 官方阅读器（或关联的第三方查看插件如 `dsh-drawio`），不重新造轮子。
- 💎 **100% 遵循 DSH 语义化设计系统**：严格采用 `--dsw-alias-*` 样式变量，极致适配浅色/深色/透明壁纸皮肤。

---

## 安装

```powershell
dsh plugin --profile web add @civilization/dsh-workspace-files --registry=https://registry.npmjs.org/
```

---

## 本地开发与调试

1. **安装依赖与构建**：
   ```powershell
   cd d:\project\dsh-workspace-files
   pnpm install
   pnpm typecheck
   pnpm build
   ```

2. **本地调试软链接**：
   在 Web profile 的 `package.json`（通常位于 `C:\Users\<user>\.dsh\profiles\web\package.json`）中添加：
   ```json
   "@civilization/dsh-workspace-files": "link:D:/project/dsh-workspace-files"
   ```
   并在其 `cordis.patch.yml` 中配置补丁或重启 DSH Web profile 即可实时加载生效。

---

## 许可证

MIT License
