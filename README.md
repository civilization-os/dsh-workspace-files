# dsh-workspace-files

DeepSeek Harness (DSH) 原生增强型工作区文件浏览器插件。

通过 DSH 0.1.5+ 官方右侧栏系统的优先级机制（`kind: "files"`, `priority: "extension"`），**100% 原生平滑接管官方自带的“工作区文件”**，彻底避免重复卡片，并补全官方缺失的文件搜索与一键 `@` 引用核心能力。

---

## 产品特性

- ⚡ **无感接管官方文件标签页**：基于 DSH 官方 `sidebarRightTabs` 的 `extension` 遮蔽机制（Shadowing），自动顶替官方 `builtin` 文件卡片，右侧栏引导页始终保持只有一张文件卡片，干净整洁。
- 🔍 **智能搜索双视图与智能目录定位**：
  - 搜索结果默认以高效清晰的【扁平匹配列表】呈现（类似 VS Code Quick Open 体验），高亮匹配关键字并展示上级路径面包屑；
  - **点击文件夹**：自动退出搜索、跳回树形视图、一键自动展开该目录及全部祖先父级路径，并平滑居中滚动定位；
  - **点击文件**：保持原生体验直接调用工作区查看器预览打开；
  - 工具栏支持一键在【扁平列表】与可随意折叠/展开的【树形视图】之间自由切换，告别“死树”困扰；按 `Esc` 键一秒恢复原始树。
- 🎯 **官方原生交互式 Tag 胶囊引用 (ReferenceChipNode)**：
  - 深度贯通会话输入框的 Lexical AST 引擎，点击 `@引用` 直接生成与官方敲 `@` 回车 100% 一模一样带图标的深色圆角 **Tag 胶囊卡片**（`[📁 folder/]` 与 `[📄 file]`）；
  - 智能消除用户光标前已键入的 `@` 字符，杜绝 `@@path` 冗余；文件与文件夹均支持一键引用。
- 📂 **默认折叠与持久化展开记忆 (localStorage)**：
  - 首次打开默认全部折叠关闭，清爽简洁；
  - 用户展开的每一个文件夹均按工作区独立持久化记忆，无论刷新页面还是切换会话再切回，均完美保持展开状态。
- 📋 **快速复制相对路径**：支持一键复制文件/目录的相对工作区路径，方便在终端或配置中直接使用。
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
