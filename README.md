<div align="center">

# Antumi

**把活交给 AI Agent，进度和结果你都看得到。**

本地优先的 AI 编程工作台。一块看板管理 Claude Code、Codex 和 Cursor：<br/>
每个任务在独立的 Git worktree 中运行，先确认计划，再执行，最后由你验收成果。

[![Version](https://img.shields.io/badge/version-0.17.0-blue?style=flat)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-green?style=flat)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?style=flat)
![Agents](https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Cursor-8A2BE2?style=flat)

[快速开始](#快速开始) · [功能](#功能) · [支持的 Agent](#支持的-agent) · [技术架构](docs/ARCHITECTURE.md) · [更新日志](CHANGELOG.md)

</div>

<p align="center">
  <img src="docs/assets/hero.png" alt="Antumi 的任务看板：几个任务分别由不同的 Agent 在执行，一个在等待验收" width="100%" />
</p>

---

## 为什么需要 Antumi

你开着三个终端：Claude Code 在修登录 bug，Codex 在写导出功能，第三个窗口你已经忘了它在干嘛。哪个在等你批准命令？哪两个改到了同一个文件？刚才顺手关掉的那个窗口，Agent 做到哪一步了？想换个 Agent 接手，又得把需求和踩过的坑从头讲一遍。

Agent 加得越多，你越像在值班盯监控。

Antumi 把这些收进一块看板。每件事是一张卡片，交给一个 Agent，在自己的 worktree 和分支里执行，互不干扰。Agent 在做什么、是不是在等你、改了哪些文件，打开就能看到。做完了由你验收：接受、接着改，或者带上失败原因重做。

| 痛点 | 在终端里直接跑 Agent | 用 Antumi |
|---|---|---|
| 同时推进好几件事 | 一排标签页，挨个切过去看 | 一块看板，卡片上写着 Agent 正在做什么、是否在等你 |
| 改动互相踩 | 几个 Agent 共用一个 checkout | 每个任务一个 worktree、一条分支，多仓库任务也一样 |
| 关窗口、重启 | 进程跟着结束，做到一半的活没了 | daemon 托管所有 Agent，关窗口、重启界面都不中断 |
| 换一个 Agent | 重新讲一遍需求和上次的失败 | 一键移交，新 Agent 拿到可见的聊天记录和补充说明 |
| Agent 说"做完了" | 自己 `git log`、`git diff` 翻 | 检查器列出提交、每个文件的增删和 diff |
| 需求在 Jira / GitHub | 复制粘贴进 prompt | 收件箱自动同步，一键导入，原文作为不可信资料隔离 |
| Agent 在等你批准 | 切回终端才发现，已经等了半小时 | 系统通知、Dock 角标，屏幕顶部弹卡片直接回答 |
| worktree 越堆越多 | 不敢删，怕删掉唯一的成果 | 按"能不能清理"分组，删前逐个复查，从不 `--force` |

---

## 它怎么工作

```mermaid
flowchart LR
    A["记下任务<br/>手写 / Jira / GitHub"] --> B["规划<br/>Agent 读代码、提问、出计划"]
    B -->|你确认计划| C["执行<br/>独立 worktree + 分支"]
    C -->|提交验收| D["验收<br/>提交记录、diff、分支"]
    D -->|接受| E["已完成<br/>依赖它的任务解锁"]
    D -->|接着改| C
    D -->|重做| F["废弃并新建<br/>带上失败原因"]
    F --> B
```

几件事可以同时进行，每件都在自己的工作区里：

```mermaid
flowchart LR
    subgraph board["Antumi 看板"]
        T1["任务 A：修复登录 bug"]
        T2["任务 B：新增导出"]
        T3["任务 C：重构接口"]
    end
    T1 --> W1["worktree antumi/A<br/>Claude Code"]
    T2 --> W2["worktree antumi/B<br/>Codex"]
    T3 --> W3["worktree antumi/C<br/>Cursor"]
    W1 --> R["检查器<br/>统一验收"]
    W2 --> R
    W3 --> R
```

---

## 功能

读写代码、跑命令、计划模式这些，Claude Code 和 Codex 自己就会。下面是 Antumi 在它们之上多出来的。

<table>
<tr>
<td width="45%" valign="middle">

### 任务看板

按 未执行 / 执行中 / 待验收 / 已完成 分列。卡片上写着 Agent 正在做什么，以及你下一步该点什么：开始、去回答、提交验收、接受。在看板上按 <kbd>N</kbd>，敲标题回车就记下一个任务。总览页把等你批准、在跑、接下来要跑的事汇到一处。

</td>
<td width="55%">
  <img src="docs/assets/board.png" alt="任务看板" width="100%" />
</td>
</tr>
<tr>
<td width="45%" valign="middle">

### 方便的 Git 管理

每个任务自动建 worktree 和分支，不用自己 `git worktree add`。检查器列出从分支起点算起的每个提交、每个文件的增删和 diff；分支、Fetch / Pull / Push / Commit、合并和冲突处理都在这里。提交信息可以留空，由小模型按项目的提交规范写好。重做时这次的改动另存到 `-tryN` 分支，任务分支从头再来。

</td>
<td width="55%">
  <img src="docs/assets/inspector.png" alt="检查器中的提交与 diff" width="100%" />
</td>
</tr>
<tr>
<td width="45%" valign="middle">

### 聊天中途移交

Claude Code 额度用完了，或者想让 Codex 换个思路？在输入框里选另一个 Agent，发送键就变成「移交」。新 Agent 拿到可见的聊天记录和你的补充说明，在同一个 worktree 里接着做；切回原来的 Agent 时，它的原生会话会被恢复。

</td>
<td width="55%">
  <img src="docs/assets/handoff.png" alt="把会话移交给另一个 Agent" width="100%" />
</td>
</tr>
<tr>
<td width="45%" valign="middle">

### 任务来源接入

Jira、GitHub 的 issue 和 PR 定时同步进收件箱，可以导入成任务，也可以先开会话只读排查，确认方案后再修。原文作为不可信资料隔离，里面的指令不会被当成你的要求。来源是插件，可以从本地目录、ZIP 或 GitHub Release 安装新的。

</td>
<td width="55%">
  <img src="docs/assets/inbox.png" alt="任务收件箱" width="100%" />
</td>
</tr>
</table>

### 研发小队

配好队长和成员各用哪个 Agent、模型和角色，把任务交给小队。队长先只读地看代码，和你商量出计划和分工，你确认后再派活：开发串行、只读分析并行，大家共用任务的 worktree。小队面板上能看到每个成员在做什么、等你回答什么，做完由你验收。

### 群聊

让 2–5 个 Agent 和模型围绕同一个问题分轮讨论，每位可以设立场，可以匿名互评。第一轮各自独立作答，之后每轮只看别人的新发言；立场不再变化或轮数用完时，由主持人总结。可以 @ 某个成员单独问，中途加人、请人离开、换议题；总结和任一条回答都能直接转成任务。成员只读，不改代码。

### 待办

Agent 回复里提到要你之后处理的事（上线前要做的、要和人对齐的、要你验证的），会记成待办，标明「需要你」还是「Agent 可做」。待办存在 Antumi 里，换轮、重启、移交给别的 Agent 都还在。总览按会话汇总所有没做完的，可以直接勾掉，或者一键交回给 Agent。

### 预约与定时任务

- **预约自动执行**：任务、计划批准和聊天消息都能预约到指定时间，比如夜里再跑，图片一起带上。
- **额度恢复后续跑**：撞到用量上限时自动约好恢复时间，到点替你发一条继续，电脑睡眠或重启后照样执行。
- **定时任务**：每天、工作日、每周定点开一个会话，让 Agent 无人值守地做完，比如代码审查、依赖检查、周报，内置八个模板。

### 省钱小妙招

- **轻活交给小模型**：翻译、生成提交信息、会话标题和划词「小助手」用每个 Agent 最便宜的模型，不读主会话上下文。统计页按 API 标价算出实际花了多少、比交给主模型省了多少。
- **额度看得见**：选 Agent 的地方直接显示剩余额度，例如「5h 已用 15%」。一个用完了，Antumi 会建议换还有额度的那个，或者一键移交。
- **不浪费等待**：定时任务的 Agent 可以选「自动」，到点挑有额度的跑；额度用完的会话到恢复时间自动续上。

**还有这些：**

- **不在 Antumi 里也能回答**：Agent 等你批准、回答或审计划时，屏幕顶部弹出卡片，直接在上面选。
- **多项目任务**：一个任务跨前后端多个仓库，每个仓库各建一个 worktree，分支同名。
- **任务依赖**：前置任务验收通过才放行，新分支直接叠在前置任务的分支上；没放行前也能先规划。
- **内置浏览器**：Agent 打开页面、点击输入、截图、看控制台报错，验证自己写的前端；你可以随时接管。
- **终端与端口面板**：shell 由 daemon 托管，关窗口不断；列出每个任务、会话在监听的端口，一键在内置浏览器里打开。
- **Agent 能翻你的记录**：通过 Antumi 的 MCP 读最近的会话、任务和群聊，不管是哪个 Agent 做的，适合「总结我本周的工作」。
- **并发上限**：限制同时运行的 Agent 总数和每款 Agent 的数量，超出的排队。

---

## 支持的 Agent

Antumi 不自带模型，驱动的是你已经装好、登录好的 Agent CLI。

| Agent | 接入方式 | 权限模式 | 计划审批 | 移交 | 定时任务 / 预约 |
|---|---|---|:-:|:-:|:-:|
| **Claude Code** | `claude -p`（stream-json） | 逐项确认 · 自动接受编辑 · 规划 · 自动判断 | ✓ | ✓ | ✓ |
| **Codex** | `codex app-server` | 逐项确认 · 自动 · 规划 · 只读 | ✓ | ✓ | ✓ |
| **Cursor** | `cursor-agent acp` | Agent · Plan · Ask | ✓ | ✓ | — |

「全部放行」默认关闭，需要在 设置 → 智能体 里手动打开。设置 → 智能体 还会列出 Antumi 认识、但尚未接入的 Agent CLI。

---

## 快速开始

**前提**：至少装好并登录一个 Agent CLI（Claude Code、Codex 或 Cursor）。

### 从源码运行

需要 Node ≥ 22.13 和 pnpm 12。

```bash
git clone https://github.com/flyhero/antumi.git
cd antumi
pnpm install
pnpm dev          # 同时启动 daemon、core 和桌面端
```

### 打包成 macOS 应用

```bash
pnpm dist:mac     # 产物在 packages/desktop/dist/Antumi-<版本>-arm64.dmg
```

装了 App 的机器不需要 Node 和 pnpm。产物没有签名，拷到别的机器上首次要右键「打开」。

### 第一个任务

1. **检查环境**：启动后看 设置 → 智能体，确认 Agent 显示「已安装」并已登录。缺什么，这里会给出可以直接复制的安装或登录命令。
2. **记下任务**：打开左侧的「任务」看板，按 <kbd>N</kbd> 写标题，选项目和 Agent。详情可以不写。
3. **开始并验收**：点「开始」，Agent 在独立 worktree 里先出计划，你确认后它开始改代码。做完点「提交验收」，在检查器里看 diff，然后接受、接着改或重做。

### 常用快捷键

| 按键 | 作用 |
|---|---|
| <kbd>N</kbd>（看板上） | 在「未执行」列顶部快速记一个任务 |
| <kbd>⌘</kbd> <kbd>N</kbd> | 打开完整的新建任务对话框 |
| <kbd>Ctrl</kbd> <kbd>`</kbd> | 打开 / 关闭终端面板 |
| <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>`</kbd> | 打开 / 关闭浏览器面板 |
| <kbd>⌘</kbd> <kbd>,</kbd> | 设置 |
| <kbd>⌘</kbd> / <kbd>Ctrl</kbd> <kbd>F</kbd> | 搜索当前聊天；Enter / Shift+Enter 跳到下一个 / 上一个结果，Esc 关闭搜索 |
| <kbd>Enter</kbd> / <kbd>Shift</kbd> <kbd>Enter</kbd> | 发送 / 换行；Agent 忙时 Enter 会把消息排队 |
| <kbd>Tab</kbd> 或 <kbd>→</kbd> | 采用 Claude Code 预测的下一句 |
| <kbd>Esc</kbd> | 中断当前回合；在任务页里回到看板 |

---

## 本地优先，成果优先

- **数据在你的机器上**：任务、会话和 worktree 都在 `~/.antumi/`，核心功能不依赖任何 Antumi 托管服务。
- **只对本机开放**：core 只监听 `127.0.0.1`，并且每个连接都要带 token。
- **不经过 shell**：Agent 命令以参数数组启动，prompt 前加 `--`。
- **凭据不外泄**：Jira / GitHub 凭据单独存放（权限 600），不返回给界面，也不交给 Agent。
- **外部内容当作不可信**：导入的 issue 原文包在 `<untrusted-source>` 里交给 Agent；任务图片保存前去掉 EXIF。
- **不替你删成果**：worktree 只在你确认后清理，删前重新检查，有未提交改动或独有提交的一律保留。

---

## 文档

| 我想…… | 看这里 |
|---|---|
| 了解整体架构、进程边界和通信协议 | [技术架构 · 总体架构](docs/ARCHITECTURE.md#1-总体架构) |
| 弄清任务怎么流转、规划、验收、处理依赖 | [技术架构 · 任务模型](docs/ARCHITECTURE.md#2-任务模型) |
| 管理 worktree、分支、合并冲突 | [技术架构 · Worktree 与 Git](docs/ARCHITECTURE.md#3-worktree-与-git) |
| 了解各 Agent 怎么接入、权限模式对应什么 | [技术架构 · Agent 接入与聊天](docs/ARCHITECTURE.md#4-agent-接入与聊天) |
| 让 Agent 用浏览器验证页面 | [技术架构 · 内置浏览器](docs/ARCHITECTURE.md#5-内置浏览器) |
| 打包、安装、卸载 | [技术架构 · 打包与安装](docs/ARCHITECTURE.md#8-打包与安装) |
| 参与开发 | [开发与验证](docs/ARCHITECTURE.md#9-开发与验证) · [AGENTS.md](AGENTS.md) · [DESIGN.md](DESIGN.md) |
| 看每个版本改了什么 | [CHANGELOG.md](CHANGELOG.md) |

---

## 现状

Antumi 目前是**开发者预览版**（0.17.0），主要在 macOS 上开发和测试，需要从源码运行或自行打包。接下来的重点是验收闭环：按项目配置的测试命令在 worktree 里跑，把结果作为验收证据放进检查器，再到 PR 和合并。

## 关于名字

**Antumi（安图米）是一个受 ant（蚂蚁）启发的自造词。** 单只蚂蚁很小，合力却能完成大活。Antumi 把不同的 AI 编程 Agent 集中到同一个工作台，让任务分头推进，进度和成果都看得清楚。

吉祥物是一只叫「蚁米」的小蚂蚁。

## 许可

[Apache License 2.0](LICENSE)
