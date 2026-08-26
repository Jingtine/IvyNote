# Local Knowledge IDE 项目总规范与 Agent 开发手册

> **文档定位：** 本文档是本项目的长期“单一事实源（Source of Truth）”。它同时承担产品规范、架构约束、开发规范、Agent 行为规范、质量标准、升级路线与版本边界说明。  
> **推荐放置位置：** 仓库根目录 `AGENTS.md`，或 `docs/PROJECT_MASTER_SPEC.md`。若两者同时存在，根目录 `AGENTS.md` 应只保留摘要并明确指向本文件。  
> **适用对象：** 人类开发者、Codex / OpenCode / Claude Code / ChatGPT Agent 等代码 Agent。  
> **工作名称：** `Local Knowledge IDE`（暂定名，后续品牌命名不得影响本文定义的核心架构）。  
> **产品形态：** Local-first、Open-format、可扩展的个人知识工作台 / Knowledge IDE。  
> **核心承诺：** 软件是“知识的工具”，而不是“知识的容器”。用户即使卸载本软件，其 `.md`、`.tex`、PDF、图片和其他本地资料仍应保持可访问、可理解、可迁移。

---

# 0. Agent 首要指令

任何 Agent 在开始修改本项目之前，必须先执行以下流程：

1. 阅读本文件。
2. 确认当前版本里程碑（例如 `v0.3`、`v1.0`、`v1.5`）。
3. 查看现有代码结构、测试、最近提交和已有 ADR（Architecture Decision Record）。
4. 只实现当前里程碑允许的能力，不得为了“以后可能需要”提前实现 V2/V3 子系统。
5. 对任何会影响以下内容的改动，必须先形成设计说明再动代码：
   - 用户本地文件格式；
   - 文件写入策略；
   - Markdown / LaTeX 兼容性；
   - Workspace 格式；
   - Knowledge Object 模型；
   - Plugin API；
   - 同步协议；
   - 数据迁移；
   - 安全权限；
   - AI 写文件能力。
6. 大任务必须拆成可独立验收的小任务。每个任务都应具备自己的测试循环和提交。
7. 默认采用 **TDD / 测试先行**：
   - 先写失败测试；
   - 确认测试失败；
   - 写最小实现；
   - 确认测试通过；
   - 再做重构；
   - 最后提交。
8. 未运行验证命令，不得声称“已完成”“已修复”“全部通过”。
9. 不得用临时 hack 绕过本规范；若规范确实需要修改，应先更新规范或 ADR，再修改实现。
10. 若需求存在歧义，优先遵循本文的核心原则：**Local-first、Open-format、No lock-in、No silent data loss、YAGNI**。

---

# 1. 产品定义

## 1.1 一句话定义

**一个以真实本地文件为数据源，支持 Markdown / LaTeX 等大众格式，具备高度自定义界面、结构化知识对象、双向链接、全文检索、图谱、插件和可选 AI Agent 的个人知识工作台。**

它参考 Obsidian 的本地知识库体验，但不复制 Obsidian 的专有习惯；编辑和渲染优先面向通用 Markdown / LaTeX 生态。

## 1.2 产品不是

本项目 **不是**：

- 只能打开 Markdown 的文本编辑器；
- 把 Markdown 存进数据库的 Notion 克隆；
- 强制使用某套专有 Wiki 语法的知识库；
- 云端优先的 SaaS；
- 依赖 AI 才能工作的“AI 笔记应用”；
- V1 就同时实现 Obsidian + Typora + VS Code + Notion + Zotero + ChatGPT 的大杂烩。

## 1.3 产品长期方向

产品演进路径：

```text
V1      Local Notes
          ↓
V1.5    Knowledge Management
          ↓
V2      Knowledge IDE
          ↓
V3+     Personal Knowledge OS
```

每一阶段必须自身可用，不得把“真正可用”无限推迟到未来版本。

---

# 2. 不可破坏的核心原则

以下原则优先级高于局部实现便利。

## P0 — Local-first

用户本地文件永远是主要数据源。

- 核心编辑、浏览、搜索必须离线可用。
- 不登录账号也必须可用。
- 不联网也必须可用。
- 不得把用户正文只存进远端或数据库。
- 云同步、AI、协作均属于可选能力。

## P1 — Open-format

用户知识必须使用大众、可迁移格式保存：

- Markdown：`.md`
- LaTeX：`.tex`
- 图片：PNG/JPEG/WebP/SVG 等普通文件
- PDF：`.pdf`
- 其他附件：保持原文件格式

不得发明一种只有本软件能理解的正文文件格式。

## P2 — 文件系统是一等公民

用户必须能够：

- 自建任意文件夹和子文件夹；
- 自由移动、重命名、复制、删除文件；
- 用 Windows Explorer / Finder / Linux 文件管理器直接管理同一批资料；
- 让软件实时感知外部文件变化。

Knowledge View、Graph、Database 等高级能力不能取代 File View。

## P3 — 数据库只是索引，不是真相

SQLite 允许保存：

- 全文检索索引；
- 解析缓存；
- Backlink；
- Graph 边；
- UI 缓存；
- 最近访问；
- 其他可重建派生数据。

SQLite 不得成为 Markdown / TeX 正文唯一来源。

**删除索引数据库后，应可从本地文件重建知识索引。**

## P4 — 不静默破坏用户文件

禁止：

- 静默覆盖外部编辑后的文件；
- 静默转换 Markdown 语法；
- 静默修改换行符；
- 静默改变编码；
- 静默批量重排 YAML；
- 静默移动附件；
- 静默删除文件；
- AI 静默修改大量笔记。

任何可能改变大量内容或产生不可逆结果的操作，都必须提供 Preview / Diff / Confirm / Undo 中至少相应的安全机制。

## P5 — 渐进复杂度

一个新用户可以只把软件当：

> “支持 Markdown / LaTeX 的漂亮本地笔记和文件管理器”。

高级用户再逐步启用：

- Properties
- Backlinks
- Knowledge Objects
- Relations
- Graph
- Database
- Plugin
- AI

不得要求用户先理解知识图谱才能写第一篇笔记。

## P6 — Core 与扩展隔离

核心功能和插件必须有清晰边界。

插件不得直接依赖核心内部私有状态。所有扩展通过稳定 API / Event / Command 接口交互。

## P7 — AI 可完全关闭

AI 是能力层，不是数据层。

关闭所有 AI Provider 后：

- 编辑正常；
- 搜索正常；
- 链接正常；
- Graph 正常；
- Properties 正常；
- Workspace 正常。

---

# 3. 目标平台与技术方向

## 3.1 桌面端优先

第一阶段以桌面端为主：

1. Windows 11：第一优先级；
2. macOS：架构兼容；
3. Linux：架构兼容。

不得在核心逻辑中写死 `C:\`、反斜杠路径或 Windows-only 假设。系统路径必须使用平台安全 API。

## 3.2 推荐技术栈

V1 推荐：

```text
Desktop Shell     Tauri 2
Frontend          React + TypeScript + Vite
Editor Engine     CodeMirror 6
State             Zustand 或等价轻量状态层
Markdown AST      unified / remark 系
Markdown          CommonMark + GFM extensions
Math              remark-math + KaTeX
Preview HTML      rehype + sanitization
Backend           Rust
Database          SQLite + FTS5
File Watcher      Rust notify
Serialization     serde
LaTeX             调用系统 latexmk / MiKTeX / TeX Live
Testing (TS)      Vitest + Testing Library
Testing (Rust)    cargo test
E2E               在稳定阶段增加桌面 Smoke / E2E
```

### 技术栈约束

- 依赖版本在项目初始化时使用当时的稳定版本并写入 lockfile。
- 不允许在一个功能 PR 中顺便升级多个 major dependency。
- 第三方 Docking / Layout 库必须包在自己的适配层后面，禁止业务组件到处直接依赖其 API。
- Markdown Parser、Editor、Indexer 之间不得互相绑死。

---

# 4. 总体架构

```text
┌────────────────────────────────────────────────────┐
│                    React UI                        │
│ File Tree │ Knowledge View │ Editor │ Panels │ UI │
├────────────────────────────────────────────────────┤
│                 Application Services               │
│ Workspace │ Documents │ Links │ Properties │ Search│
├────────────────────────────────────────────────────┤
│                  Extension Boundary                │
│ Commands │ Events │ View API │ Editor API │ Theme │
├────────────────────────────────────────────────────┤
│                  Tauri IPC Boundary                │
├────────────────────────────────────────────────────┤
│                     Rust Core                      │
│ Files │ Watcher │ Indexer │ SQLite │ LaTeX │ Safety│
├────────────────────────────────────────────────────┤
│                  Local File System                 │
│ .md │ .tex │ .pdf │ images │ attachments │ folders│
└────────────────────────────────────────────────────┘
```

## 4.1 前后端责任

### React / TypeScript 负责

- UI；
- Editor state；
- Tab；
- Layout；
- Markdown 编辑交互；
- Preview；
- Properties 面板；
- 命令面板；
- 主题；
- View registry；
- 与 Rust API 协调。

### Rust 负责

- 真实文件系统读写；
- 原子写文件；
- 路径验证；
- Workspace 扫描；
- File Watcher；
- SQLite / FTS；
- 索引任务；
- LaTeX 子进程；
- 系统 Trash；
- 文件哈希 / mtime 冲突检测；
- 系统级权限边界。

### 明确禁止

React 组件不得直接承担：

- 任意系统路径写入；
- Shell 执行；
- SQLite 直接访问；
- 大规模目录扫描。

Rust UI command 也不得直接塞进 React 组件；前端必须经 Service / Repository wrapper。

---

# 5. 建议仓库结构

V1 不建议一开始做复杂 monorepo。先保持一个清晰桌面应用。

```text
local-knowledge-ide/
├─ AGENTS.md
├─ README.md
├─ package.json
├─ pnpm-lock.yaml
├─ vite.config.ts
├─ tsconfig.json
│
├─ docs/
│  ├─ adr/
│  ├─ specs/
│  ├─ plans/
│  └─ release-notes/
│
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ router/
│  │  └─ bootstrap/
│  │
│  ├─ core/
│  │  ├─ commands/
│  │  ├─ events/
│  │  ├─ registry/
│  │  └─ errors/
│  │
│  ├─ features/
│  │  ├─ workspace/
│  │  ├─ files/
│  │  ├─ editor/
│  │  ├─ markdown/
│  │  ├─ latex/
│  │  ├─ properties/
│  │  ├─ links/
│  │  ├─ knowledge/
│  │  ├─ search/
│  │  ├─ layout/
│  │  ├─ settings/
│  │  └─ themes/
│  │
│  ├─ shared/
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ types/
│  │  └─ utils/
│  │
│  └─ styles/
│     ├─ tokens.css
│     ├─ base.css
│     └─ themes/
│
├─ src-tauri/
│  ├─ Cargo.toml
│  ├─ tauri.conf.json
│  └─ src/
│     ├─ main.rs
│     ├─ commands/
│     ├─ workspace/
│     ├─ filesystem/
│     ├─ watcher/
│     ├─ indexer/
│     ├─ database/
│     ├─ latex/
│     ├─ trash/
│     └─ errors/
│
└─ tests/
   ├─ fixtures/
   └─ smoke/
```

## 5.1 文件职责约束

- 一个文件应有一个清晰责任。
- 业务逻辑不得长期堆积在 `App.tsx`。
- 单文件超过约 500 行应检查是否职责过多；不是机械限制，但必须有理由。
- UI component 不得隐藏大量 I/O 逻辑。
- 跨 feature 共享逻辑进入 `core/` 或 `shared/` 前，应先确认真的被多个 feature 使用。
- 禁止建立名为 `utils.ts` 的“万能垃圾桶”。

---

# 6. Workspace 模型

## 6.1 Workspace + 多目录挂载

Workspace 是逻辑工作区，而不是强制单一 Vault。

示例：

```text
Personal Workspace
├─ Notes      → D:\Notes
├─ Courses    → D:\University\Courses
├─ Projects   → D:\Projects
├─ Research   → E:\Research
└─ Archive    → E:\Archive     [read-only]
```

用户不需要搬迁原有文件。

## 6.2 Mount 权限

每个挂载目录至少支持：

```text
read-write
read-only
excluded
```

`excluded` 不进入索引、不监听、不进入 Graph。

## 6.3 默认排除目录

默认建议排除：

```text
.git
node_modules
dist
build
target
.venv
venv
.cache
coverage
```

用户可以覆盖默认规则。

## 6.4 Workspace 配置位置

Workspace 配置默认保存在应用自己的 OS App Data 目录，而不是污染用户知识目录。

例如逻辑上：

```text
<AppData>/<app>/workspaces/<workspace-id>.json
<AppData>/<app>/indexes/<workspace-id>.sqlite
<AppData>/<app>/cache/<workspace-id>/
```

可提供“导出 Workspace 配置”，但用户的知识数据绝不能依赖这个配置才能读取。

---

# 7. File View：真实文件管理

File View 是 V1 一级功能。

必须支持：

- 新建文件夹；
- 新建 Markdown；
- 新建 LaTeX；
- 重命名；
- 删除；
- 系统 Trash；
- 多选；
- 移动；
- 拖拽；
- Copy / Paste；
- Duplicate；
- 在系统文件管理器显示；
- Copy absolute path；
- Copy relative path；
- Copy Markdown link；
- 排序；
- Refresh；
- 外部修改自动同步。

## 7.1 删除策略

默认删除进入系统 Trash / Recycle Bin。

“永久删除”必须二次确认，并与普通 Delete 明确区分。

## 7.2 外部修改

保存前必须记录：

```text
path
mtime
size
hash（必要时）
```

若文件在编辑期间被其他程序修改：

- 禁止直接覆盖；
- 展示冲突；
- 至少提供：
  - Reload；
  - Compare；
  - Overwrite；
  - Save As Copy。

## 7.3 原子写入

Markdown / TeX 保存必须采用安全写入策略：

1. 写临时文件；
2. flush；
3. 保证写入成功；
4. 原子替换原文件；
5. 失败时保留原文件。

不得直接 truncate 后边写边赌。

---

# 8. 文件编码与换行

## 8.1 默认

新文件：

```text
Encoding: UTF-8
Newline: 跟随系统偏好或用户设置
```

## 8.2 保持原则

打开已有 UTF-8 文件后：

- 尽量保持 BOM 状态；
- 保持 LF / CRLF；
- 不因简单编辑而全文件改换行符。

## 8.3 非 UTF-8

V1 若无法可靠编辑某编码：

- 不得用错误编码强行打开再覆盖；
- 应提示：
  - read-only 打开；
  - 或创建备份后转换为 UTF-8。

---

# 9. Markdown 标准

## 9.1 基线

Markdown 的底层语义以：

1. CommonMark；
2. GitHub Flavored Markdown（GFM）常用扩展；

为主。

V1 需要支持：

- headings；
- paragraphs；
- emphasis；
- strong；
- blockquote；
- ordered/unordered lists；
- task list；
- table；
- fenced code；
- inline code；
- horizontal rule；
- standard links；
- images；
- strikethrough；
- autolink；
- footnote（若库成熟，可在 V1 后半加入）；
- math extension。

## 9.2 Math

Markdown 中支持：

```markdown
Inline: $E = mc^2$

Block:

$$
\int_a^b f(x)\,dx
$$
```

渲染使用 KaTeX 或等价安全方案。

## 9.3 Raw HTML

默认 Preview 必须经过安全处理。

- 禁止 `<script>` 执行；
- 禁止事件处理属性直接执行；
- 不因打开一篇 Markdown 就获得系统级执行能力。

若未来提供 Trusted Workspace，仍应明确区分“允许部分 HTML”与“允许脚本执行”。

---

# 10. 四种 Markdown 编辑模式

同一 `.md` 文件必须可以在下列模式之间切换，并保持同一底层文本。

```text
1. Source
2. Source + Preview
3. Live Preview
4. Typora-like
```

## 10.1 Source Mode

目标：接近 VS Code 的可信源码编辑体验。

必须：

- 真实显示 Markdown；
- 语法高亮；
- 行号可配置；
- 搜索替换；
- undo / redo；
- 光标位置；
- Markdown 快捷键；
- 可选择是否自动补全。

## 10.2 Source + Preview

- 左源码 / 右 Preview；
- 支持交换方向；
- Preview 由同一 Markdown Parser 生成；
- V1 后期增加滚动同步。

## 10.3 Live Preview

原则：

- 非当前编辑位置尽可能展示渲染效果；
- 光标进入结构时显示必要 Markdown 标记；
- 不改变真实文件文本。

V1 可逐步实现，不允许通过把文档转换为 proprietary rich-text AST 再反序列化来“伪装 Markdown”。

## 10.4 Typora-like

目标是即时排版体验，但仍编辑真实 Markdown。

关键约束：

> Typora-like 是 UI/Editor Projection，不是新的存储格式。

若实现难度过大，可在 v0.x 阶段逐步补齐 block type，不得阻塞 Source Mode 的稳定性。

---

# 11. Markdown 与 Obsidian 兼容

## 11.1 Links

默认创建 **标准 Markdown 相对链接**：

```markdown
[Transformer](../Concepts/Transformer.md)
```

同时解析：

```markdown
[[Transformer]]
[[Transformer|显示文本]]
```

## 11.2 Wiki Link 输入策略

默认模式：

- 用户可以输入 `[[` 唤起笔记建议；
- 最终新建链接默认保存为标准 Markdown link。

可选 “Obsidian compatibility mode”：

- 保留 `[[Wiki Link]]`；
- 解析常见 Wiki Link；
- 不强制转换现有文件。

## 11.3 禁止静默格式化

打开 Obsidian 文件时，不得因为本软件默认标准 Markdown 就自动改写其所有 Wiki Link。

格式转换必须是显式命令，并提供 Preview / Diff。

---

# 12. LaTeX 一级支持

`.tex` 是一级文档类型，而非普通纯文本附件。

V1：

- `.tex` syntax highlighting；
- source editing；
- Compile；
- PDF Preview；
- Source/PDF split；
- error panel；
- compiler path setting。

## 12.1 编译链

优先调用系统已有：

```text
latexmk
MiKTeX
TeX Live
```

推荐默认逻辑：

```text
latexmk -pdf -interaction=nonstopmode -synctex=1
```

编译输出默认放应用 cache，避免污染源目录。

用户可明确执行 “Export PDF beside source”。

## 12.2 安全

默认不得启用 shell escape。

以下行为必须显式提示：

```text
-shell-escape
自定义 compiler command
任意 shell hooks
```

LaTeX 是可执行式文档生态，不能把陌生 `.tex` 当完全无害文本执行。

---

# 13. Properties / YAML Front Matter

## 13.1 数据位置

属性写入标准 YAML Front Matter：

```yaml
---
title: RAG
type: concept
status: learning
tags:
  - AI
  - Knowledge
created: 2026-08-27
---
```

## 13.2 V1 字段类型

至少支持：

```text
text
number
date
boolean
select
multi-select
tags
note-link
file-link
```

## 13.3 自定义字段

用户可以创建任意字段名。

软件不得把所有对象强迫塞进固定 schema。

## 13.4 修改 YAML 的要求

Properties UI 写回 YAML 时：

- 尽量保留字段顺序；
- 尽量保留已有注释；
- 不修改 Markdown 正文；
- 不进行无关全文件格式化；
- 解析失败时不得覆盖原 Front Matter；
- 必须显示可修复错误。

---

# 14. Knowledge Object 模型

知识库上层抽象为 Knowledge Object，但底层仍是文件。

建议前端逻辑模型：

```ts
interface KnowledgeObject {
  key: string;                // 可重建的内部 key，不作为用户知识唯一真相
  mountId: string;
  relativePath: string;
  title: string;
  extension: string;
  type: string;
  properties: Record<string, PropertyValue>;
  tags: string[];
  outgoingLinks: LinkRef[];
  relations: RelationRef[];
  modifiedAt: number;
}
```

## 14.1 Object 类型

内置初始类型可包括：

```text
note
concept
project
course
person
paper
book
task
reference
```

用户可以新增：

```text
experiment
meeting
software
company
idea
...
```

内置类型只是默认模板，不是封闭枚举。

## 14.2 文件路径与对象类型分离

例如：

```text
D:\University\AI\Transformer.md
```

可以：

```yaml
type: concept
```

File View 显示真实目录。

Knowledge View 可以在：

```text
Concepts
```

下显示它。

同一文件只有一份，不创建副本。

---

# 15. Relation 模型

采用“双来源关系”。

## 15.1 隐式关系

正文中的链接自动形成普通关系：

```text
references / links-to
```

来源：

- Markdown link；
- Wiki link；
- embed（未来）。

## 15.2 显式语义关系

用户可以通过 Properties / Relations UI 建立：

```text
uses
depends-on
part-of
contains
author-of
supports
contradicts
related-to
```

建议存入 YAML：

```yaml
relations:
  uses:
    - ../Concepts/RAG.md
  part-of:
    - ../Courses/AI.md
```

关系的 target 必须尽可能使用可读、开放的相对路径或 Markdown link，而不是只能被本软件理解的二进制 ID。

---

# 16. 文件夹仍然优先

Knowledge Object 不得削弱用户的自由文件夹管理。

## 16.1 File View

真实：

```text
Knowledge/
├─ 00 Inbox/
├─ 01 Study/
├─ 02 Projects/
├─ 03 Research/
├─ Assets/
└─ Templates/
```

## 16.2 Knowledge View

逻辑：

```text
Concepts
Projects
Courses
Papers
People
Tasks
Smart Collections
```

两个 View 指向同一文件。

## 16.3 Folder Defaults（V1.5）

未来文件夹可配置：

- icon；
- color；
- default object type；
- default tags；
- template；
- attachment policy。

这些均为可选，不应改变文件夹本身仍是普通文件夹的事实。

---

# 17. 搜索与索引

## 17.1 V1 搜索目标

必须支持：

- filename；
- title；
- Markdown body；
- TeX body；
- tags；
- Properties；
- object type；
- relation；
- path。

## 17.2 SQLite

SQLite/FTS5 保存：

```text
documents
metadata
links
relations
fts_content
index_state
```

索引必须可重建。

## 17.3 搜索 Query

长期希望支持：

```text
type:paper tag:AI year:>2024 "agent"
status:active
related:RAG
path:Research
```

V1 可以先做结构化 filter UI，再逐渐完善 query grammar。

## 17.4 Smart Collection（V1.5）

保存搜索可以形成虚拟集合：

```text
正在学习
status = learning

活跃项目
type = project AND status = active
```

它不是移动文件，而是查询结果。

---

# 18. Backlink 与 Related Notes

V1 必须支持：

- Outgoing Links；
- Backlinks；
- unresolved links；
- related notes（基于显式链接、tags、properties 的基础相关性）。

语义向量相关性不属于 V1 硬依赖。

---

# 19. Layout 与 Docking

长期目标：

**完整 Docking Workspace。**

V1 先实现：

- left sidebar；
- right sidebar；
- tabs；
- horizontal split；
- vertical split；
- panel show/hide；
- layout persistence。

主 View 类型：

```text
Editor
Markdown Preview
PDF
Search Results
Graph       (V1.5)
Database    (V2)
Canvas      (V2)
Web View    (future/plugin)
```

## 19.1 View Registry

UI 不得把每种 View 硬编码进单一巨大 switch。

应有类似：

```ts
interface ViewDefinition {
  id: string;
  title: string;
  component: React.ComponentType<any>;
  canSplit: boolean;
}
```

后续 Plugin API 复用同一 registry。

---

# 20. Appearance / Theme

“高度自定义”属于产品核心，不是装饰性加分项。

## 20.1 V1

支持：

- light；
- dark；
- system；
- accent color；
- UI font；
- editor font；
- font size；
- line height；
- content width；
- density；
- corner radius；
- panel spacing；
- transparency / blur 在平台允许时可选；
- Custom CSS。

## 20.2 Design Token

禁止在业务组件中散落硬编码色值。

使用 CSS Variables / Design Tokens：

```css
--bg-primary
--bg-secondary
--text-primary
--text-muted
--border-default
--accent
--radius-sm
--radius-md
--space-1
--space-2
--editor-font
--ui-font
```

## 20.3 Theme Package（V1.5）

未来：

```text
theme-name/
├─ manifest.json
└─ theme.css
```

Theme 不得获得文件系统或网络权限。

---

# 21. Plugin Platform

最终目标为完整 Plugin API，但 V1 不做插件商店。

架构预留：

```text
Plugin API
├─ Command API
├─ Event API
├─ UI / Panel API
├─ Editor API
├─ Workspace API
├─ File API
├─ Metadata API
├─ Search API
└─ Knowledge API
```

## 21.1 V1 开放范围

只开放/内部稳定：

- Theme；
- Custom CSS；
- Command Registry；
- View/Panel Registry；
- Editor extension boundary；
- Event bus 基础。

## 21.2 V1.5

Plugin SDK alpha。

## 21.3 V2

插件权限系统。

示例：

```text
read workspace
write workspace
network
clipboard
shell
external process
```

Shell / network / arbitrary file access 不得默认授权。

---

# 22. Sync / Versioning

总原则：

```text
Local files = source of truth
Sync = optional provider
```

未来 Provider：

```text
Git
WebDAV
S3
NAS
OneDrive
Dropbox
custom
```

## V1

- Local safety；
- atomic write；
- conflict detection；
- undo；
- destructive operation safety。

## V1.5

- Git status；
- commit/history；
- diff；
- optional remote；
- rollback UI。

## V2+

- Sync Provider API；
- WebDAV/NAS/S3 等；
- 独立冲突解决界面。

核心软件不得绑定某一家云服务。

---

# 23. Knowledge Graph 与 Canvas

## V1

不以 Graph 阻塞基础笔记功能。

## V1.5 — Semantic Graph

节点：

- Knowledge Object；
- type；
- tag；
- selected folders。

边：

- implicit link；
- explicit semantic relation。

支持：

- filter；
- local graph；
- click-to-open；
- relation type filter。

Graph 是索引视图，不是数据源。

## V2 — Canvas

Canvas 是“空间布局文件”，用于引用现有对象：

```text
Markdown
PDF
Image
TeX
Knowledge Object
Text Card
Group
Edge
```

Canvas 不应复制知识正文。

Canvas 格式必须：

- 文本可读；
- 有版本字段；
- 尽量使用 JSON 等开放结构；
- 节点引用现有文件路径 / object ref。

---

# 24. Knowledge Agent / AI

AI 放到 V2，不能影响 V1 Core。

## 24.1 Provider 抽象

```text
OpenAI
Anthropic
Gemini
Ollama
LM Studio
OpenAI-compatible
Custom Provider
```

不得把某一家 Provider 写死到 Knowledge 层。

## 24.2 Agent 权限级别

```text
Ask
只读知识库，只回答

Suggest
可生成 Diff / 建议，不直接写

Agent
允许多步调用工具，但写入前确认
```

## 24.3 Agent Tools

长期：

```text
searchKnowledge()
readObject()
findRelations()
suggestLinks()
createNote()
updateProperties()
organizeWorkspace()
```

## 24.4 AI 写入安全

任何批量 AI 操作：

1. 生成变更计划；
2. 生成 Diff；
3. 用户确认；
4. 执行；
5. 给出结果摘要；
6. 可撤销或基于版本历史恢复。

禁止模型自由获得系统整个磁盘的访问权限。

---

# 25. 网络与隐私

默认：

- 无遥测；
- 无强制账号；
- 无后台上传笔记；
- 无自动发送文件内容；
- 无 AI 请求，除非用户主动配置并调用。

若未来加入 telemetry：

- 必须 opt-in；
- 清楚说明发送什么；
- 不发送笔记正文；
- 可完全关闭。

---

# 26. Error Handling

统一错误体系。

前端不应只 `console.error`。

至少区分：

```text
FileNotFound
PermissionDenied
ExternalModificationConflict
InvalidEncoding
InvalidFrontMatter
IndexFailure
LatexCompilerMissing
LatexCompileFailure
WorkspaceUnavailable
InvalidPath
DatabaseFailure
PluginPermissionDenied
```

用户错误提示需要：

1. 发生了什么；
2. 哪个文件；
3. 数据是否安全；
4. 用户下一步能做什么。

不得只显示：

```text
Unknown error
Error 500
Something went wrong
```

---

# 27. 性能目标

V1 应围绕真实个人知识库设计，而不是只测试 20 个文件。

初始性能目标：

- 10,000 Markdown/TeX 文件：可完成增量索引；
- 打开普通 Markdown：体感即时；
- 文件树展开不全量重新扫描整个 Workspace；
- 编辑输入不能因索引任务卡顿；
- 索引放后台任务；
- 大文件 Preview 应节流；
- 文件变更采用增量更新而不是每次全重建。

具体毫秒指标应通过 benchmark 后确定，不得伪造“性能达标”数字。

---

# 28. Accessibility 与键盘操作

V1 至少：

- 文件树可键盘导航；
- Tab 切换；
- Editor focus；
- Search shortcut；
- Save；
- Close tab；
- New note；
- Split；
- Toggle sidebar；
- UI 控件具有 accessible label；
- 不只依靠颜色表达状态。

Command Palette 在 V1.5 完善，但 V1 的命令机制要预留。

---

# 29. 国际化

所有用户可见字符串集中管理，禁止散落硬编码。

V1 推荐：

```text
zh-CN
en-US
```

即使首个 Alpha 只完成一种语言，架构也要避免以后大规模重写。

---

# 30. 编码规范

## TypeScript

- `strict: true`；
- 避免 `any`；
- 需要 `any` 时局部、解释原因；
- domain type 独立定义；
- side effect 明确；
- React component 保持纯粹；
- I/O 经 service 层；
- 不滥用 global store；
- derive state 不重复保存。

## Rust

- path 使用 `Path` / `PathBuf`；
- 错误使用明确 enum；
- 不在 command handler 塞全部业务逻辑；
- filesystem/indexer/database 分模块；
- 资源释放依赖 RAII；
- 不随意 `unwrap()` 用户输入或文件数据；
- `cargo fmt`；
- `cargo clippy`。

## CSS

- token-first；
- component class 清晰；
- 不允许大量 `!important` 解决架构问题；
- Custom CSS 有稳定挂载点；
- Theme 不直接修改不可控内部 DOM 结构作为唯一机制。

---

# 31. Git 与提交规范

推荐 Conventional Commits：

```text
feat:
fix:
refactor:
test:
docs:
build:
chore:
perf:
```

示例：

```text
feat(workspace): add multi-folder mounting
fix(editor): preserve CRLF on save
test(indexer): cover renamed markdown files
docs(adr): define wiki-link persistence strategy
```

## 31.1 分支

```text
feat/v0.2-file-tree
fix/external-modification-conflict
refactor/markdown-parser-boundary
```

## 31.2 Commit 原则

一个 commit 应表达一个可理解变更。

禁止：

```text
update stuff
fix
final
new
changes2
```

Agent 每完成一个独立、验证通过的 task 再 commit。

---

# 32. 测试策略

## 32.1 单元测试

覆盖：

- Markdown link parsing；
- Wiki link parsing；
- frontmatter parsing；
- relation parsing；
- path normalization；
- search query parsing；
- exclusion rules；
- Knowledge Object mapping。

## 32.2 Rust Integration

使用 temp directory 测试：

- create；
- rename；
- move；
- atomic save；
- external conflict；
- watcher；
- index rebuild；
- delete to trash（可 mock/抽象）。

不得让测试操作真实用户目录。

## 32.3 UI Test

至少：

- file tree interaction；
- editor mode switch；
- tab behavior；
- properties editing；
- search result open；
- unsaved / conflict UI。

## 32.4 Fixture

`tests/fixtures/` 应包含：

```text
commonmark/
gfm/
math/
wiki-links/
frontmatter/
invalid-frontmatter/
crlf/
utf8-bom/
latex/
large-note/
nested-folders/
```

---

# 33. 每次任务的 Definition of Done

一个功能只有满足以下条件才能称为完成：

- [ ] 功能符合当前 spec；
- [ ] 不越过版本范围；
- [ ] 有对应测试；
- [ ] 新测试已验证能捕获目标行为；
- [ ] TypeScript typecheck 通过；
- [ ] Lint 通过；
- [ ] TS tests 通过；
- [ ] Rust tests 通过；
- [ ] Rust fmt / clippy 通过；
- [ ] Production build 通过；
- [ ] 人工 smoke test 覆盖关键流程；
- [ ] 无 silent data loss；
- [ ] 文档/ADR 已按需要更新；
- [ ] commit 信息明确。

Agent 不得只因为“代码写好了”就结束任务。

---

# 34. 推荐验证命令

最终命令以仓库 `package.json` 为准，但应维护等价入口：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

建议建立：

```bash
pnpm verify
```

统一执行所有必要验证。

发布前再执行桌面安装包构建与 Smoke Test。

---

# 35. ADR：哪些决定必须记录

以下变更必须建立 `docs/adr/NNNN-*.md`：

- 更换 editor engine；
- 更换 Markdown parser；
- 修改 Markdown 存储规则；
- 修改 Wiki Link 规则；
- 修改 Workspace config schema；
- 修改 Knowledge Object identity；
- 修改 Relation persistence；
- 引入 proprietary file format；
- 修改 Plugin permission；
- 修改 AI write permission；
- 修改 sync conflict model；
- 数据库 schema 大改；
- 引入 remote account / cloud dependency。

ADR 至少写：

```text
Context
Decision
Alternatives
Consequences
Migration
```

---

# 36. Agent 的 YAGNI 约束

Agent **不得提前实现**：

V1 期间：

- 插件市场；
- 云账号；
- 云同步服务；
- 多人协作；
- 手机端；
- 完整 Canvas；
- Notion 式 Board/Gallery/Timeline；
- AI Agent；
- Embedding DB；
- CRDT；
- 实时协作；
- 自建云服务；
- 浏览器插件生态。

可以为未来留下清晰 interface，但不能写大量当前无调用的未来代码。

---

# 37. Agent 遇到冲突时的决策顺序

若多个目标冲突，按此优先级：

```text
1. 用户数据安全
2. 开放格式 / 可迁移
3. Local-first
4. 正确性
5. 兼容性
6. 简单清晰的架构
7. 用户体验
8. 性能
9. 新功能数量
10. 炫技
```

例如：

“为了实现漂亮 Live Preview，需要把正文转换并只保存为内部 JSON。”

答案：不允许。

“为了 5ms 更快索引，要把正文只存数据库。”

答案：不允许。

---

# 38. V1 总范围

V1 的目标：

> 用户可以真正把它当主要本地笔记软件日常使用。

## V1 必须有

### Workspace
- multi-folder mount；
- read/write / read-only；
- recent workspace；
- external file refresh。

### File Manager
- folder；
- md；
- tex；
- rename；
- move；
- drag/drop；
- trash；
- path tools。

### Markdown
- CommonMark；
- GFM；
- math；
- code；
- image；
- standard link；
- Wiki Link read compatibility。

### Editor
- Source；
- Split；
- Live Preview；
- Typora-like 基础；
- tabs；
- splits。

### LaTeX
- `.tex` editing；
- compile；
- PDF preview；
- errors。

### Properties
- YAML；
- custom fields；
- tags；
- type。

### Knowledge
- Knowledge Object；
- links；
- backlinks；
- explicit relations。

### Search
- full text；
- file；
- property；
- tag；
- type；
- relation。

### Appearance
- light/dark/system；
- fonts；
- accent；
- layout；
- CSS variables；
- custom CSS。

## V1 不必须

- Graph；
- Canvas；
- AI；
- Git UI；
- Database board/gallery；
- Plugin store；
- Cloud sync。

---

# 39. V1 内部里程碑

不要直接从空仓库“实现 V1”。按以下阶段交付。

## v0.1 — Foundation

目标：一个能安全打开本地目录并编辑保存纯文本 Markdown 的桌面壳。

交付：

- Tauri + React + TS；
- app shell；
- Rust filesystem boundary；
- open folder；
- basic tree；
- open file；
- Source editor；
- safe save；
- basic test/CI scripts。

验收：

> 能打开一个真实本地目录，编辑 `.md`，安全保存，外部文件仍是普通 Markdown。

---

## v0.2 — Workspace & File Manager

交付：

- Workspace；
- multiple mounts；
- read-only；
- create/rename/move/trash；
- watcher；
- exclusions；
- recent workspace。

验收：

> 用户可以把多个已有目录组合成一个工作区，不搬文件。

---

## v0.3 — Markdown Rendering

交付：

- CommonMark/GFM parser；
- Preview；
- math；
- safe HTML；
- image/path resolving；
- standard links；
- Wiki Link parser。

验收：

> 常见 Markdown 在源码模式与 Preview 中稳定工作，文件内容不被专有格式污染。

---

## v0.4 — Multi-mode Editor

交付：

- Source；
- Split；
- Live Preview 第一版；
- Typora-like 第一版；
- Tabs；
- horizontal/vertical split；
- editor mode persistence。

验收：

> 同一 Markdown 文件可切换四种体验而不改底层文本。

---

## v0.5 — Properties & Knowledge Links

交付：

- YAML；
- Properties UI；
- tags；
- object type；
- outgoing links；
- backlinks；
- unresolved links；
- explicit relations。

验收：

> 普通 Markdown 可渐进升级为结构化 Knowledge Object。

---

## v0.6 — LaTeX

交付：

- `.tex`；
- syntax；
- latexmk detection；
- compile；
- PDF viewer；
- diagnostics；
- secure defaults。

验收：

> 用户可以把软件作为轻量 LaTeX 笔记/写作环境。

---

## v0.7 — Search & Index

交付：

- SQLite；
- FTS5；
- incremental index；
- file/title/body search；
- tags/properties/type/relation filters；
- rebuild index。

验收：

> 删除 index 后可从本地文件重建；编辑不被索引卡住。

---

## v0.8 — Knowledge View

交付：

- File View / Knowledge View；
- group by type；
- related notes；
- basic saved filters；
- object details。

验收：

> 文件在哪里与它是什么知识可以使用不同视角表达，但始终只有一份真实文件。

---

## v0.9 — Customization & Hardening

交付：

- themes；
- design tokens；
- custom CSS；
- settings；
- keyboard polish；
- accessibility；
- conflict UX；
- crash/error hardening；
- large workspace testing。

验收：

> 产品达到 Beta 可长期使用质量。

---

## v1.0 — Stable Local Notes

发布门槛：

- 无已知高危 data loss；
- 核心兼容 fixture 通过；
- 安装、更新、卸载不影响用户资料；
- Index 可重建；
- 文档完整；
- Windows 核心路径稳定；
- 至少一轮较大真实知识库测试。

---

# 40. V1.5 — Knowledge Management

加入：

```text
Semantic Graph
Local Graph
Smart Collections
Saved Search
Database Table View
Folder Defaults
Object Schema
Custom Object Types
Command Palette
Shortcut Manager
Theme Package
Plugin SDK alpha
Git Integration
```

## V1.5 核心目标

> 从“优秀本地笔记工具”升级为“结构化个人知识管理系统”。

注意：V1.5 Graph 不得成为新的知识数据源。

---

# 41. V2 — Knowledge IDE

加入：

```text
Canvas
Database:
  Table
  Board
  Gallery
  Calendar
  Timeline

Knowledge Agent
Semantic Search
Embeddings（可选/本地优先）
AI link suggestion
AI properties
AI organization
PDF Q&A

Plugin Platform
Permission System

Sync Provider API
Git/WebDAV/S3/NAS/Cloud plugin
```

## V2 核心目标

> 把编辑、阅读、研究、组织、检索和智能辅助整合成一个本地 Knowledge IDE。

---

# 42. V3+ 可能方向

只作为长期方向，不得成为当前实现任务：

- mobile；
- browser clipper；
- collaboration；
- optional CRDT；
- multi-device sync engine；
- local-first graph database；
- research workflows；
- citation management；
- Zotero integration；
- Notebook / code execution；
- multimodal knowledge；
- automation / workflow engine。

---

# 43. Semantic Versioning

采用：

```text
MAJOR.MINOR.PATCH
```

开发阶段：

```text
0.x
```

Stable：

```text
1.0.0
```

规则：

- Patch：bugfix，不改变用户数据语义；
- Minor：向后兼容的新能力；
- Major：Plugin API / Workspace schema 等重大不兼容变化。

用户 Markdown/TeX 不应因为 App major 版本变化失效。

---

# 44. Schema Versioning

以下配置必须有独立 schema version：

- Workspace config；
- App settings；
- Index DB；
- Plugin manifest；
- Canvas file（V2）；
- Database view config（V2）。

迁移必须：

1. 检测旧版本；
2. 备份配置；
3. migration；
4. 校验；
5. 成功后切换；
6. 失败可恢复。

索引 DB 若迁移复杂，可以丢弃并重建；用户知识文件不能如此处理。

---

# 45. Release Channel

推荐：

```text
Nightly
Alpha
Beta
Stable
```

## Alpha

允许 UI 大改，但不得接受 data loss。

## Beta

文件格式和关键交互趋稳。

## Stable

升级必须注重兼容。

---

# 46. 新功能进入版本的判断

新需求必须回答：

1. 它解决 V1 核心问题吗？
2. 没有它，当前版本是否不能完成主要任务？
3. 会引入新的数据格式吗？
4. 会扩大安全攻击面吗？
5. 是否需要 Plugin API？
6. 是否能后移到 V1.5/V2？
7. 是否会让当前里程碑延迟但只带来“看起来很高级”的价值？

如果 6 = Yes，默认后移。

---

# 47. Agent 每个 Milestone 的工作方法

每个 milestone 开始时：

## Step 1 — Read

阅读：

```text
AGENTS.md
当前 milestone spec
相关 ADR
已有代码
测试
最近提交
```

## Step 2 — Explore

确认现有组件和接口，禁止凭想象覆盖已有实现。

## Step 3 — Plan

在：

```text
docs/plans/
```

建立独立实现计划。

一个计划只覆盖一个可独立验收子系统。

## Step 4 — Test First

每个行为：

```text
Failing test
→ run
→ minimal implementation
→ run
→ refactor
→ run
```

## Step 5 — Verify

执行完整 verification。

## Step 6 — Review

检查：

- spec coverage；
- data safety；
- compatibility；
- scope creep；
- duplicate logic；
- future API leakage。

## Step 7 — Commit

通过后 commit。

---

# 48. Agent 禁止行为

Agent 不得：

- 未读现有代码就重写；
- 因一处 bug 重构半个项目；
- 删除测试来让 CI 变绿；
- 修改测试期望来掩盖错误行为；
- 在没有迁移的情况下改 Workspace schema；
- 将绝对路径写死进知识文件；
- 把用户正文只放 SQLite；
- 静默转换 Markdown；
- 默认开启 LaTeX shell escape；
- 默认把用户笔记发给 AI；
- 把 API key 写进仓库；
- 为 V3 功能提前构建复杂抽象；
- 使用“临时先这样”但不记录风险；
- 未验证就报告任务完成。

---

# 49. Security Checklist

每当新增能力涉及以下内容时必须重新评估：

```text
filesystem
network
shell
LaTeX execution
plugin
webview
HTML
clipboard
external URL
AI tools
sync
```

最低要求：

- validate path；
- no path traversal；
- least privilege；
- explicit permission；
- sanitize rendered HTML；
- no secrets in logs；
- no shell interpolation from raw user text；
- no unrestricted plugin shell；
- no unrestricted AI filesystem access。

---

# 50. 数据安全 Smoke Checklist

每个 Stable 候选至少人工验证：

- [ ] 新建 Markdown；
- [ ] 重启后仍存在；
- [ ] 外部 VS Code 编辑后软件刷新；
- [ ] 软件编辑后 VS Code 正常打开；
- [ ] CRLF 文件未被无意改坏；
- [ ] Markdown Link 仍是标准链接；
- [ ] Wiki Link 未被静默改写；
- [ ] YAML 非法时不覆盖；
- [ ] 修改 Properties 不破坏正文；
- [ ] 文件移动后索引更新；
- [ ] 外部修改冲突不会静默覆盖；
- [ ] 删除进入 Trash；
- [ ] 索引库删除后可重建；
- [ ] Workspace 配置删除不会删除知识；
- [ ] 软件卸载不会删除用户笔记。

---

# 51. 兼容性 Fixture

持续维护一套真实 Markdown/TeX fixtures：

```text
01-commonmark.md
02-gfm-table.md
03-task-list.md
04-math.md
05-standard-links.md
06-wiki-links.md
07-frontmatter.md
08-frontmatter-comments.md
09-crlf.md
10-utf8-bom.md
11-relative-images.md
12-nested-path.md
13-large-document.md
14-sample.tex
15-invalid-yaml.md
```

每次 parser/editor/saver 大改都要回归这些文件。

---

# 52. UI 设计原则

目标：

- clean；
- lightweight；
- translucent 可选；
- high customization；
- content-first；
- low visual noise。

默认 UI：

```text
┌─────────────────────────────────────────────────────┐
│ Workspace │ Search │ ...                   Settings │
├────────────┬─────────────────────────┬──────────────┤
│ File /     │ Tabs                    │ Properties   │
│ Knowledge  │                         │ Backlinks    │
│            │ Editor / Preview        │ Outline      │
│            │                         │ Relations    │
├────────────┴─────────────────────────┴──────────────┤
│ Status                                               │
└─────────────────────────────────────────────────────┘
```

但默认布局只是起点，不得成为固定限制。

---

# 53. 核心 UX 原则

## “打开就是文件”

用户进入 Workspace 首先能理解：

> 这些就是我的真实文件。

## “高级能力是叠加，不是迁移”

用户添加：

```text
type
tags
relations
```

不应要求把原文件迁入数据库。

## “软件帮忙，不偷偷做决定”

自动建议可以多，自动修改要少。

---

# 54. 项目的核心验收问题

任何版本发布前，团队应能明确回答：

### File
“我不用这个软件了，这些笔记还能正常读吗？”

必须：Yes。

### Format
“我的 Markdown 能不能被 VS Code / Git / 其他编辑器继续处理？”

必须：大部分标准内容 Yes。

### Local
“断网还能不能用？”

必须：核心功能 Yes。

### Database
“删掉 SQLite 会不会丢知识？”

必须：No。

### AI
“关掉 AI 会不会残废？”

必须：No。

### Folder
“我还能不能按自己的文件夹方式管理？”

必须：Yes。

### Upgrade
“升级软件会不会强制重写我的全部笔记？”

必须：No。

---

# 55. MVP 成功标准

V1 真正成功的标准不是“功能很多”，而是：

> 一个用户愿意把自己的真实本地 Markdown/LaTeX 知识目录交给它长期编辑，并相信软件不会锁死格式或弄丢资料。

只有达到这个标准，才进入 V1.5。

---

# 56. Agent 开发提示词（可直接附加给 Agent）

当需要让一个新的 Agent 开始本项目任务时，可使用以下上下文：

```text
你正在开发 Local Knowledge IDE。

在执行任何代码任务前：
1. 阅读仓库根目录 AGENTS.md / PROJECT_MASTER_SPEC.md。
2. 确认当前 milestone。
3. 检查现有代码、测试、ADR 和最近提交。
4. 不得实现当前 milestone 之外的功能。
5. Local files 是 source of truth；SQLite 只能做可重建索引。
6. Markdown/TeX 必须保持开放格式。
7. 不得静默改写用户文件、编码、换行或链接格式。
8. 所有文件写操作考虑 external modification conflict 和 atomic save。
9. 使用 TDD：先测试失败，再最小实现，再验证。
10. 未运行完整验证命令不得声称完成。
11. 遇到架构歧义，先给设计与 trade-off，不要自行改变核心约束。
12. 完成任务后报告：
   - 修改了什么；
   - 为什么；
   - 测试与验证命令；
   - 实际验证结果；
   - 已知限制；
   - 是否影响数据格式 / migration。
```

---

# 57. 建议的下一个实际动作

本规范不是要求 Agent 一次性完成整个产品。

正确启动方式：

```text
第一步：建立空仓库与 v0.1 Foundation 计划
第二步：只完成 v0.1
第三步：验证文件安全与基础编辑
第四步：再进入 v0.2 Workspace
```

不要直接创建 50 个页面、20 个 feature stub、空 Plugin API、空 AI 模块。

第一个真正应该编写的独立实施计划是：

```text
docs/plans/v0.1-foundation.md
```

其 Goal 应限制为：

> 建立一个 Tauri + React + TypeScript 桌面应用，能够选择本地目录、显示基础文件树、用 CodeMirror 打开 Markdown，并通过 Rust 安全、原子地保存回原文件，同时具有最基础的测试和验证链路。

这是整个项目最重要的第一块地基。

---

# 58. 最终项目原则摘要

```text
LOCAL FIRST
OPEN FORMAT
REAL FILES
FREE FOLDERS
STANDARD MARKDOWN
FIRST-CLASS LATEX
MULTI-MODE EDITOR
KNOWLEDGE OBJECTS
SEMANTIC RELATIONS
REBUILDABLE INDEX
CUSTOMIZABLE UI
EXTENSIBLE PLUGINS
OPTIONAL AI
NO SILENT DATA LOSS
NO VENDOR LOCK-IN
VERSIONED EVOLUTION
TEST BEFORE CLAIM
```

如果未来某个功能与这些原则冲突，应优先修改功能，而不是牺牲这些原则。

---

**End of Master Specification**
